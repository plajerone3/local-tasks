// Backoffice chrome: sidebar with queue counts, top bar with search, live indicator and staff menu.
import { html, raw } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { APP } from '../config.js';
import { getState, resetDemo } from '../store.js';
import { staffList } from '../select.js';
import { can, ROLES } from '../logic/staff.js';
import { openCases } from './data.js';
import { staffChip, ago } from './ui.js';
import { staffSignOut, staffSignIn } from '../services/backoffice.js';
import { confirmDialog, toast } from '../ui/dialog.js';
import { go } from '../router.js';

const NAV = [
  { group: null, items: [['/', 'Overview', 'home'], ['/queue', 'Work queue', 'list', 'queue'], ['/activity', 'Live activity', 'refresh']] },
  { group: 'Platform', items: [['/users', 'Users', 'users'], ['/tasks', 'Tasks', 'briefcase'], ['/conversations', 'Conversations', 'message'], ['/reviews', 'Reviews', 'star'], ['/money', 'Money', 'euro']] },
  { group: 'Team', items: [['/audit', 'Audit log', 'shieldcheck'], ['/staff', 'Staff & roles', 'user'], ['/settings', 'Settings', 'sliders']] },
];

const active = (href, path) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`) || (href === '/queue' && path.startsWith('/case/')));

export function shell(ctx, content) {
  if (!ctx.staff) return html`<main id="main" class="bo-signin-main" tabindex="-1">${content}</main>`;
  const cases = openCases();
  const mine = cases.filter((c) => c.assigneeId === ctx.staff.id).length;
  const overdue = cases.filter((c) => c.overdue).length;
  const last = getState().activity[0];
  return html`<div class="bo">
    <aside class="bo-side" aria-label="Backoffice">
      <a class="bo-brand" href="#/"><img src="icon.svg" alt="" width="32" height="32"><span><strong>${APP.name}</strong><span class="bo-brand__sub">Backoffice</span></span></a>
      <nav class="bo-nav" aria-label="Sections">
        ${NAV.map((g) => html`<div class="bo-nav__group">${g.group ? html`<p class="bo-nav__title">${g.group}</p>` : ''}
          ${g.items.map(([href, label, ic, count]) => html`<a class="bo-nav__link" href="#${href}" ${active(href, ctx.path) ? raw('aria-current="page"') : ''}>${icon(ic, 18)}<span>${label}</span>${count === 'queue' && cases.length ? html`<span class="bo-nav__count${overdue ? ' bo-nav__count--late' : ''}" aria-label="${cases.length} open, ${overdue} overdue">${cases.length}</span>` : ''}</a>`)}
        </div>`)}
      </nav>
      <div class="bo-side__foot">
        <p class="bo-side__note">Demo backoffice. Same data as the apps in this browser.</p>
        <div class="bo-side__links"><a href="index.html" target="_blank" rel="noopener">${icon('home', 14)}Web app</a><a href="app.html" target="_blank" rel="noopener">${icon('phone', 14)}Mobile app</a></div>
      </div>
    </aside>
    <div class="bo-main-wrap">
      <header class="bo-top">
        <form class="bo-search" data-form="bo-search" role="search">
          <label class="visually-hidden" for="bo-q">Search users, tasks, ids</label>
          ${icon('search', 18)}<input class="bo-search__input" id="bo-q" name="q" type="search" placeholder="Search people, tasks, emails, ids…" value="${ctx.path === '/search' ? ctx.query.q || '' : ''}" autocomplete="off" data-no-preserve>
        </form>
        <div class="bo-top__right">
          <a class="bo-live" href="#/activity" title="Last activity ${last ? ago(last.at) : 'none'}"><span class="bo-live__dot" aria-hidden="true"></span>Live<span class="bo-live__when">${last ? ago(last.at) : ''}</span></a>
          ${mine ? html`<a class="bo-pill" href="#/queue?who=mine">${mine} assigned to you</a>` : ''}
          <details class="menu bo-menu" data-menu>
            <summary class="bo-menu__trigger">${staffChip(ctx.staff.id)}<span class="badge badge--${ROLES[ctx.staff.role].tone}">${ROLES[ctx.staff.role].label}</span>${icon('chevron', 16)}</summary>
            <div class="menu__panel bo-menu__panel">
              <p class="bo-menu__who"><strong>${ctx.staff.name}</strong><br><span class="muted">${ctx.staff.email}</span></p>
              <p class="bo-menu__title">Switch staff account (demo)</p>
              ${staffList().filter((x) => x.active && x.id !== ctx.staff.id).map((x) => html`<button type="button" class="menu__item" data-action="bo-switch-staff" data-id="${x.id}">${staffChip(x.id)}<span class="muted">${ROLES[x.role].label}</span></button>`)}
              <hr>
              <button type="button" class="menu__item" data-action="bo-reset">${icon('refresh', 16)}Reset demo data</button>
              <button type="button" class="menu__item" data-action="bo-signout">${icon('logout', 16)}Sign out</button>
            </div>
          </details>
        </div>
      </header>
      ${!can(ctx.staff, 'cases.work') ? html`<p class="bo-readonly">${icon('eye', 16)}Read-only access: your role (${ROLES[ctx.staff.role].label}) can look but not change anything.</p>` : ''}
      <main id="main" class="bo-main" tabindex="-1">${content}</main>
    </div>
  </div>`;
}

export const actions = {
  'bo-switch-staff'(el) {
    const res = staffSignIn(el.dataset.id);
    toast(res.ok ? 'Switched staff account.' : res.message, res.ok ? 'info' : 'danger');
  },
  'bo-signout'(el, e, ctx) {
    staffSignOut(ctx.staff?.id);
    go('/');
  },
  async 'bo-reset'() {
    const yes = await confirmDialog({ title: 'Reset all demo data?', body: html`<p>This restores the seeded demo for the backoffice and both apps in this browser. Everything done since is lost.</p>`, confirmLabel: 'Reset demo data', tone: 'danger' });
    if (!yes) return;
    resetDemo();
    toast('Demo data reset.', 'info');
    go('/');
  },
};

export const forms = {
  'bo-search'(form, data) {
    const q = String(data.get('q') || '').trim();
    go(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  },
};
