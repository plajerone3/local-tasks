// Backoffice entry point: routes, permission guards, rendering and delegated events.
// Runs on the same store as the web and mobile apps, so every action shows up here live
// (other tabs sync through localStorage events) and every decision applies to the apps at once.
import { APP } from '../config.js';
import { loadState, subscribe } from '../store.js';
import { parseHash, matchRoute, setRerender, go } from '../router.js';
import { toast, closeDialogOf } from '../ui/dialog.js';
import { html } from '../ui/html.js';
import { can } from '../logic/staff.js';
import { currentStaff } from '../services/backoffice.js';

import { shell, actions as shellActions, forms as shellForms } from './shell.js';
import * as home from './views/home.js';
import * as queue from './views/queue.js';
import * as activity from './views/activity.js';
import * as users from './views/users.js';
import * as tasks from './views/tasks.js';
import * as content from './views/content.js';
import * as money from './views/money.js';
import * as team from './views/team.js';
import { head } from './ui.js';

const ROUTES = [
  { path: '/', view: home.overview },
  { path: '/queue', view: queue.queue },
  { path: '/case/:kind/:id', view: queue.casePage },
  { path: '/activity', view: activity.activity },
  { path: '/audit', view: activity.audit },
  { path: '/users', view: users.list },
  { path: '/users/:id', view: users.detail },
  { path: '/tasks', view: tasks.list },
  { path: '/tasks/:id', view: tasks.detail },
  { path: '/conversations', view: content.conversations },
  { path: '/conversations/:id', view: content.conversation },
  { path: '/reviews', view: content.reviews },
  { path: '/money', view: money.money_ },
  { path: '/staff', view: team.staff },
  { path: '/settings', view: team.settings },
  { path: '/search', view: team.search },
];

const registry = { actions: { ...shellActions, 'dialog-close': (el) => closeDialogOf(el) }, forms: { ...shellForms }, changes: {}, inputs: {} };
for (const mod of [home, queue, activity, users, tasks, content, money, team]) {
  for (const kind of ['actions', 'forms', 'changes', 'inputs']) Object.assign(registry[kind], mod[kind] || {});
}

// Filter bars: selects apply at once, search fields after a short pause.
function applyFilters(form) {
  const base = form.dataset.base;
  const params = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (String(v).trim()) params.set(k, String(v).trim());
  go(`${base}${params.toString() ? `?${params}` : ''}`);
}
let filterTimer = null;
registry.changes['bo-filter'] = (el) => applyFilters(el.form);
registry.inputs['bo-filter-live'] = (el) => { clearTimeout(filterTimer); filterTimer = setTimeout(() => applyFilters(el.form), 280); };
registry.forms['bo-filter'] = (form) => applyFilters(form);
registry.forms['bo-note'] = (form, data, ctx) => import('../services/backoffice.js').then(({ addNote }) => {
  const res = addNote(ctx.staff.id, form.dataset.type, form.dataset.id, data.get('body'));
  toast(res.ok ? 'Note added.' : res.message, res.ok ? 'success' : 'danger');
});

const app = document.getElementById('app');
let lastKey = null;
let queued = false;

function scheduleRender() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; render(); });
}

function context() {
  const { path, query } = parseHash();
  const matched = matchRoute(ROUTES, path);
  const staff = currentStaff();
  return { path, query, params: matched?.params || {}, route: matched?.route || null, staff, can: (p) => can(staff, p) };
}

function capture() {
  const map = new Map();
  app.querySelectorAll('input, textarea, select').forEach((el) => {
    if (!el.id || el.type === 'file' || el.type === 'hidden' || 'noPreserve' in el.dataset) return;
    map.set(el.id, el.type === 'checkbox' || el.type === 'radio' ? { checked: el.checked } : { value: el.value });
  });
  return map;
}

function render() {
  const ctx = context();
  const view = !ctx.staff ? home.signin : ctx.route ? ctx.route.view : { title: () => 'Not found', render: () => html`${head({ title: 'Page not found', back: { href: '/', label: 'Overview' } })}` };
  const key = `${location.hash || '#/'}|${ctx.staff?.id || ''}`;
  const same = key === lastKey;
  const snap = same ? capture() : null;
  const active = document.activeElement;
  const activeId = same && active && app.contains(active) ? active.id : null;
  const sel = activeId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scrollY = window.scrollY;
  let content;
  try {
    content = view.render(ctx);
  } catch (err) {
    console.error(err);
    content = html`<div class="notice notice--danger" role="alert"><div class="notice__body"><p class="notice__title">This screen failed to load</p><p class="notice__text">${String(err.message || err)}</p></div></div>`;
  }
  app.innerHTML = String(shell(ctx, content));
  if (snap) snap.forEach((v, id) => { const el = document.getElementById(id); if (!el) return; if ('checked' in v) el.checked = v.checked; else el.value = v.value; });
  document.title = `${view.title?.(ctx) || 'Backoffice'} · ${APP.name} Backoffice`;
  if (!same) {
    lastKey = key;
    window.scrollTo(0, 0);
    app.querySelector('main h1')?.focus({ preventScroll: true });
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
}

// ---------- Delegated events ----------
document.addEventListener('click', async (e) => {
  const menu = e.target.closest('details[data-menu]');
  document.querySelectorAll('details[data-menu][open]').forEach((d) => { if (d !== menu) d.removeAttribute('open'); });
  if (e.target.closest('.menu__panel button')) menu?.removeAttribute('open');
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('dialog') && !el.dataset.action.startsWith('dialog')) return;
  const fn = registry.actions[el.dataset.action];
  if (!fn) { console.warn('No handler for', el.dataset.action); return; }
  e.preventDefault();
  if (el.getAttribute('aria-disabled') === 'true') return;
  try { await fn(el, e, context()); } catch (err) { console.error(err); toast('Something went wrong. Please try again.', 'danger'); }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = registry.forms[form.dataset.form];
  if (!fn || form.dataset.pending) return;
  form.dataset.pending = '1';
  try { await fn(form, new FormData(form), context()); } catch (err) { console.error(err); toast('Something went wrong. Please try again.', 'danger'); } finally { delete form.dataset.pending; }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && !el.closest('dialog')) registry.changes[el.dataset.change]?.(el, e, context());
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) registry.inputs[el.dataset.input]?.(el, e, context());
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelector('details[data-menu][open]')?.removeAttribute('open');
  // "/" jumps to search, like most admin tools.
  if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); document.getElementById('bo-q')?.focus(); }
});
document.querySelector('.skip-link')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main')?.focus(); });

// ---------- Boot ----------
loadState();
setRerender(scheduleRender);
subscribe(scheduleRender);
window.addEventListener('hashchange', scheduleRender);
// Keep relative times and target-time countdowns fresh, without disturbing someone who is typing.
setInterval(() => {
  if (document.querySelector('dialog[open]') || document.activeElement?.matches('input, textarea, select')) return;
  scheduleRender();
}, 30000);
render();
