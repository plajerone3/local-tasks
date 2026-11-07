// Mobile app view: routes, guards, rendering and delegated events.
// Shares the store, services and rules with the web app, so both stay in sync.
import { APP } from '../config.js';
import { loadState, subscribe, session } from '../store.js';
import { me, myRole, userById, notificationsOf } from '../select.js';
import { ui, onUiChange } from '../ui/state.js';
import { parseHash, matchRoute, setRerender } from '../router.js';
import { toast } from '../ui/dialog.js';
import { sleep } from '../util.js';
import { t, tr, setLanguage, savedLanguage } from '../i18n.js';
import { initSimulation } from '../services/simulation.js';
import { switchRole } from '../services/accounts.js';
import { actions as webShellActions } from '../views/shell.js';
import * as common from '../views/common.js';
import * as start from './screens/start.js';
import * as home from './screens/home.js';
import * as post from './screens/post.js';
import * as task from './screens/task.js';
import * as job from './screens/job.js';
import * as lists from './screens/lists.js';
import * as account from './screens/account.js';
import { toMobile } from './ui.js';

const ROUTES = [
  { path: '/', view: start.welcome, public: true, homeIfAuthed: true },
  { path: '/home', view: home.home },
  { path: '/work', view: home.work, role: 'tasker' },
  { path: '/post', view: post.post, role: 'client' },
  { path: '/task/:id/offers', view: task.offers, role: 'client' },
  { path: '/task/:id', view: task.detail },
  { path: '/job/:id/rate', view: job.rate },
  { path: '/job/:id', view: job.track },
  { path: '/activity', view: lists.activity },
  { path: '/inbox', view: lists.inbox },
  { path: '/inbox/:id', view: lists.thread },
  { path: '/notifications', view: lists.notifications },
  { path: '/account', view: account.account },
  { path: '/wallet', view: account.wallet },
  { path: '/safety', view: account.safety, public: true },
  { path: '/recruiting', view: account.recruiting, role: 'tasker' },
  { path: '/profile/:id', view: account.profile },
];

const registry = {
  actions: { 'focus-field': webShellActions['focus-field'] },
  forms: { noop() {} },
  changes: {},
  inputs: {},
};
for (const mod of [common, start, home, post, task, job, lists, account]) {
  for (const kind of ['actions', 'forms', 'changes', 'inputs']) Object.assign(registry[kind], mod[kind] || {});
}

const app = document.getElementById('app');
let lastKey = null;
let booted = false;
let queued = false;
let seen = null;

function scheduleRender() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; render(); });
}

function pickView(route, ctx) {
  if (!route) return start.welcome;
  if (route.public && !ctx.user) return route.view;
  if (!ctx.user) return start.welcome;
  if (!ctx.user.roles.some((r) => r === 'client' || r === 'tasker')) return route.path === '/safety' ? route.view : start.notForMobile;
  if (route.role && !ctx.user.roles.includes(route.role)) return start.needRole(route.role);
  return route.view;
}

function capture() {
  const map = new Map();
  app.querySelectorAll('input, textarea, select').forEach((el) => {
    if (!el.id || el.type === 'file' || el.type === 'hidden' || 'noPreserve' in el.dataset) return;
    map.set(el.id, el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : { value: el.value });
  });
  return map;
}
function restore(map) {
  map.forEach((v, id) => {
    const el = document.getElementById(id);
    if (!el || !app.contains(el)) return;
    if ('checked' in v) el.checked = v.checked; else el.value = v.value;
  });
}

// The preview frame around the phone lives in app.html; keep its text in the active language.
let staticLang = null;
function translateStatic() {
  if (staticLang === document.documentElement.lang) return;
  staticLang = document.documentElement.lang;
  document.querySelectorAll('[data-tr]').forEach((el) => {
    el.dataset.en ??= el.textContent;
    el.textContent = tr(el.dataset.en);
  });
  document.querySelectorAll('[data-tr-label]').forEach((el) => {
    el.dataset.enLabel ??= el.getAttribute('aria-label');
    el.setAttribute('aria-label', tr(el.dataset.enLabel));
  });
}

function render() {
  const { path, query } = parseHash();
  const matched = matchRoute(ROUTES, path);
  const route = matched?.route;
  const user = me();
  let role = myRole();

  if (route?.homeIfAuthed && user) { location.replace('#/home'); return; }
  if (route?.role && user?.roles.includes(route.role) && role !== route.role) {
    switchRole(route.role);
    role = route.role;
    toast(tr('Switched to {role}.', { role: t(`role.${role}`) }), 'info');
  }

  const ctx = { path, query, params: matched?.params || {}, user, role, ui };
  const view = pickView(route, ctx);
  const key = location.hash || '#/';
  const same = key === lastKey;
  const snapshot = same && !ui.skipPreserve ? capture() : null;
  const active = document.activeElement;
  const activeId = same && active && app.contains(active) ? active.id : null;
  const scroll = same ? app.querySelector('.m-main')?.scrollTop : 0;

  let out;
  try {
    out = view.render(ctx);
  } catch (err) {
    console.error(err);
    out = `<div class="m-screen"><main class="m-main m-pad"><p class="m-note c-tomato" role="alert">${tr('Something went wrong on this screen. Your data is safe. Go back or reset the demo from Account.')}</p></main></div>`;
  }
  app.innerHTML = String(out);
  if (snapshot) restore(snapshot);
  ui.skipPreserve = false;
  document.title = `${(view.title && view.title(ctx)) || tr('App')} · ${APP.name}`;
  translateStatic();

  const main = app.querySelector('.m-main');
  if (!same) {
    lastKey = key;
    if (main) main.scrollTop = 0;
    if (booted) {
      const h = app.querySelector('h1');
      if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  } else {
    if (main && scroll) main.scrollTop = scroll;
    if (activeId) document.getElementById(activeId)?.focus({ preventScroll: true });
  }
  if (ui.focusErrorSummary) {
    ui.focusErrorSummary = false;
    const s = document.getElementById('error-summary');
    if (s) { s.focus(); s.scrollIntoView({ block: 'center' }); }
  }
  try { view.after?.(ctx); } catch (err) { console.error(err); }
  booted = true;
  announce(user);
}

function announce(user) {
  if (!user) { seen = null; return; }
  const list = notificationsOf(user.id);
  if (seen && seen.user === user.id) {
    const here = parseHash().path;
    const fresh = list.find((n) => !seen.ids.has(n.id) && !n.read && n.actorId && n.actorId !== user.id && toMobile(n.href) !== here);
    if (fresh) toast(fresh.text, 'info');
  }
  seen = { user: user.id, ids: new Set(list.map((n) => n.id)) };
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = registry.actions[el.dataset.action];
  if (!fn) { console.warn('No handler for', el.dataset.action); return; }
  e.preventDefault();
  try { await fn(el, e); } catch (err) { console.error(err); toast(tr('Something went wrong. Please try again.'), 'danger'); }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = registry.forms[form.dataset.form];
  if (!fn || form.dataset.pending) return;
  form.dataset.pending = '1';
  const btn = e.submitter || form.querySelector('[type=submit]');
  let data;
  try { data = new FormData(form, btn || undefined); } catch { data = new FormData(form); }
  if (btn) { btn.setAttribute('aria-busy', 'true'); btn.disabled = true; }
  try {
    await sleep(APP.latencyMs);
    await fn(form, data, null, btn);
  } catch (err) {
    console.error(err);
    toast(tr('Something went wrong. Please try again.'), 'danger');
  } finally {
    delete form.dataset.pending;
    if (btn && document.contains(btn)) { btn.removeAttribute('aria-busy'); btn.disabled = false; }
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) registry.changes[el.dataset.change]?.(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) registry.inputs[el.dataset.input]?.(el, e);
});

// Send on Enter in the chat composer (Shift+Enter for a new line).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'm-composer') {
    e.preventDefault();
    e.target.form?.requestSubmit();
  }
});

// Skip link without touching the hash router.
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('main')?.focus();
});

// The mobile app speaks German by default; Account → Sprache switches to English.
setLanguage(savedLanguage('de'));
loadState();
const s = session.get();
if (s && !userById(s.userId)) session.clear();
initSimulation();
setRerender(scheduleRender);
subscribe(scheduleRender);
onUiChange(scheduleRender);
window.addEventListener('hashchange', scheduleRender);
render();
