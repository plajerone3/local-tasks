// Entry point: routes, guards, rendering and delegated events.
import { APP } from './config.js';
import { loadState, subscribe, session } from './store.js';
import { me, myRole, userById, notificationsOf } from './select.js';
import { ui, onUiChange } from './ui/state.js';
import { parseHash, matchRoute, setRerender } from './router.js';
import { toast } from './ui/dialog.js';
import { sleep } from './util.js';
import { initSimulation } from './services/simulation.js';
import { switchRole } from './services/accounts.js';
import { t } from './i18n.js';
import { canSignIn } from './logic/enforcement.js';

import { shell, actions as shellActions } from './views/shell.js';
import * as common from './views/common.js';
import landing from './views/landing.js';
import guide from './views/guide.js';
import * as auth from './views/auth.js';
import onboarding, * as onboardingMod from './views/onboarding.js';
import * as profileForms from './views/profile-forms.js';
import dashboard from './views/dashboard.js';
import browse, * as browseMod from './views/browse.js';
import taskDetail, * as taskDetailMod from './views/task-detail.js';
import taskCreate, * as taskCreateMod from './views/task-create.js';
import applicants, * as applicantsMod from './views/applicants.js';
import assignment, * as assignmentMod from './views/assignment.js';
import review, * as reviewMod from './views/review.js';
import messages, * as messagesMod from './views/messages.js';
import profile, * as profileMod from './views/profile.js';
import * as lists from './views/lists.js';
import wallet from './views/wallet.js';
import * as candidates from './views/candidates.js';
import recruiting, * as recruitingMod from './views/recruiting.js';
import safety, * as safetyMod from './views/safety.js';
import settings, * as settingsMod from './views/settings.js';
import moderation, * as moderationMod from './views/moderation.js';
import * as misc from './views/misc.js';

const ROUTES = [
  { path: '/', view: landing, public: true, homeIfAuthed: true },
  { path: '/welcome', view: landing, public: true },
  { path: '/guide', view: guide, public: true },
  { path: '/signin', view: auth.signin, public: true },
  { path: '/signup', view: auth.signup, public: true },
  { path: '/onboarding/:role', view: onboarding },
  { path: '/dashboard', view: dashboard },
  { path: '/tasks', view: browse, public: true },
  { path: '/tasks/new', view: taskCreate, role: 'client' },
  { path: '/tasks/:id/applicants', view: applicants, role: 'client' },
  { path: '/tasks/:id', view: taskDetail, public: true },
  { path: '/assignments/:id/review', view: review },
  { path: '/assignments/:id', view: assignment },
  { path: '/messages', view: messages },
  { path: '/messages/:id', view: messages },
  { path: '/profile/edit', view: profileMod.editor, role: 'tasker' },
  { path: '/profile/:id', view: profile, public: true },
  { path: '/my-tasks', view: lists.myTasks, role: 'client' },
  { path: '/my-work', view: lists.myWork, role: 'tasker' },
  { path: '/wallet', view: wallet },
  { path: '/candidates', view: candidates.search, role: 'business' },
  { path: '/candidates/:id', view: candidates.detail, role: 'business' },
  { path: '/recruiting', view: recruiting, role: 'tasker' },
  { path: '/safety', view: safety, public: true },
  { path: '/settings', view: settings },
  { path: '/notifications', view: misc.notifications },
  { path: '/moderation', view: moderation, role: 'moderator' },
];

// ---------- Handler registry ----------
const registry = { actions: { ...shellActions }, forms: { noop() {} }, changes: {}, inputs: {} };
for (const mod of [common, auth, onboardingMod, profileForms, browseMod, taskDetailMod, taskCreateMod, applicantsMod, assignmentMod, reviewMod, messagesMod, profileMod, candidates, recruitingMod, safetyMod, settingsMod, moderationMod, misc]) {
  for (const kind of ['actions', 'forms', 'changes', 'inputs']) Object.assign(registry[kind], mod[kind] || {});
}

const app = document.getElementById('app');
let lastKey = null;
let booted = false;
let queued = false;
let seenNotes = null;

function scheduleRender() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; render(); });
}

function guard(route, ctx) {
  if (ctx.user && !canSignIn(ctx.user) && route.path !== '/safety') return misc.paused;
  if (route.public) return null;
  if (!ctx.user) return auth.signinGate;
  if (route.role && !ctx.user.roles.includes(route.role)) return misc.accessView(route.role, ctx.user);
  return null;
}

// Keep typed values and focus when the same screen re-renders (state changes, live filters).
function captureForms() {
  const map = new Map();
  app.querySelectorAll('input, textarea, select').forEach((el) => {
    if (!el.id || el.type === 'file' || el.type === 'hidden' || 'noPreserve' in el.dataset) return;
    map.set(el.id, el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : { value: el.value });
  });
  return map;
}
function restoreForms(map) {
  map.forEach((v, id) => {
    const el = document.getElementById(id);
    if (!el || !app.contains(el)) return;
    if ('checked' in v) el.checked = v.checked;
    else el.value = v.value;
  });
}

function render() {
  const { path, query } = parseHash();
  const matched = matchRoute(ROUTES, path);
  let user = me();
  let role = myRole();
  const route = matched?.route;

  if (route?.homeIfAuthed && user) {
    location.replace(`#${role === 'moderator' ? '/moderation' : '/dashboard'}`);
    return;
  }
  // If the account has the role this page needs, switch to it quietly instead of blocking.
  if (route?.role && user?.roles.includes(route.role) && role !== route.role) {
    switchRole(route.role);
    role = route.role;
    toast(`Switched to your ${t(`role.${role}`)} view.`, 'info');
  }

  const ctx = { path, query, params: matched?.params || {}, user, role, ui };
  const view = !route ? misc.notFound : guard(route, ctx) || route.view;
  const key = location.hash || '#/';
  const same = key === lastKey;
  const snapshot = same && !ui.skipPreserve ? captureForms() : null;
  const active = document.activeElement;
  const activeId = same && active && app.contains(active) ? active.id : null;
  const sel = activeId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scrollY = window.scrollY;

  let content;
  try {
    content = view.render(ctx);
  } catch (err) {
    console.error(err);
    content = `<div class="wrap page"><div class="notice notice--danger" role="alert"><div class="notice__body"><p class="notice__title">Something went wrong on this screen</p><p class="notice__text">Your data is safe. Try going back, or reset the demo from the strip at the top.</p></div></div></div>`;
  }
  app.innerHTML = String(shell(ctx, content));
  if (snapshot) restoreForms(snapshot);
  ui.skipPreserve = false;
  document.title = `${(view.title && view.title(ctx)) || APP.name} · ${APP.name}`;

  if (!same) {
    lastKey = key;
    if (booted) {
      window.scrollTo(0, 0);
      const h = app.querySelector('main h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  } else {
    if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo(0, scrollY);
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* not a text field */ } }
      }
    }
  }
  if (ui.focusErrorSummary) {
    ui.focusErrorSummary = false;
    const summary = document.getElementById('error-summary');
    if (summary) { summary.focus(); summary.scrollIntoView({ block: 'center' }); }
  }
  try { view.after?.(ctx); } catch (err) { console.error(err); }
  booted = true;
  announceNewNotifications(user);
}

function announceNewNotifications(user) {
  if (!user) { seenNotes = null; return; }
  const list = notificationsOf(user.id);
  if (seenNotes && seenNotes.user === user.id) {
    const here = parseHash().path;
    const fresh = list.find((n) => !seenNotes.ids.has(n.id) && !n.read && n.actorId && n.actorId !== user.id && n.href !== here);
    if (fresh) toast(fresh.text, 'info');
  }
  seenNotes = { user: user.id, ids: new Set(list.map((n) => n.id)) };
}

// ---------- Delegated events ----------
document.addEventListener('click', async (e) => {
  const menu = e.target.closest('details[data-menu]');
  document.querySelectorAll('details[data-menu][open]').forEach((d) => { if (d !== menu) d.removeAttribute('open'); });
  if (e.target.closest('.menu__panel a, .menu__panel button')) menu?.removeAttribute('open');

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = registry.actions[el.dataset.action];
  if (!fn) { console.warn('No handler for action', el.dataset.action); return; }
  e.preventDefault();
  try { await fn(el, e); } catch (err) { console.error(err); toast('Something went wrong. Please try again.', 'danger'); }
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
    if (form.dataset.form !== 'noop') await sleep(APP.latencyMs);
    await fn(form, data, null, btn);
  } catch (err) {
    console.error(err);
    toast('Something went wrong. Please try again.', 'danger');
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('details[data-menu][open]');
  if (open) { open.removeAttribute('open'); open.querySelector('summary')?.focus(); }
});

// Skip link without touching the hash router.
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('main')?.focus();
});

// ---------- Boot ----------
loadState();
const s = session.get();
if (s && !userById(s.userId)) session.clear();
initSimulation();
setRerender(scheduleRender);
subscribe(scheduleRender);
onUiChange(scheduleRender);
window.addEventListener('hashchange', scheduleRender);
render();
