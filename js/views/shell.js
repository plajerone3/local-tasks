// App chrome: demo strip, header, role switch, account menu, footer, mobile tab bar.
import { html, raw } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { APP } from '../config.js';
import { t } from '../i18n.js';
import { unreadMessages, unreadNotifications, publicName, connectionsOfTasker } from '../select.js';
import { personAvatar, demoAccountList, homeFor } from './common.js';
import { openDialog, confirmDialog, toast } from '../ui/dialog.js';
import { switchRole, signOut } from '../services/accounts.js';
import { resetDemo, storageAvailable } from '../store.js';
import { go } from '../router.js';
import { notice } from '../ui/components.js';

const NAV = {
  client: [['/dashboard', 'Home', 'home'], ['/tasks/new', 'Post a task', 'plus'], ['/my-tasks', 'My tasks', 'list'], ['/messages', 'Messages', 'message'], ['/wallet', 'Payments', 'wallet']],
  tasker: [['/dashboard', 'Home', 'home'], ['/tasks', 'Find tasks', 'search'], ['/my-work', 'My work', 'list'], ['/messages', 'Messages', 'message'], ['/wallet', 'Earnings', 'wallet'], ['/recruiting', 'Recruiting', 'briefcase']],
  business: [['/dashboard', 'Home', 'home'], ['/candidates', 'Candidates', 'users'], ['/messages', 'Messages', 'message'], ['/settings', 'Company', 'briefcase']],
  moderator: [['/moderation', 'Moderation', 'shieldcheck'], ['/tasks', 'Tasks', 'search'], ['/messages', 'Messages', 'message'], ['/safety', 'Safety', 'shield']],
};
const PUBLIC_NAV = [['/tasks', 'Browse tasks'], ['/welcome?s=how', 'How it works'], ['/welcome?s=business', 'For businesses'], ['/safety', 'Safety'], ['/guide', 'Guided demo']];

function isActive(href, path) {
  const base = href.split('?')[0];
  if (base === '/tasks') return path === '/tasks' || (path.startsWith('/tasks/') && path !== '/tasks/new');
  return path === base || (base !== '/dashboard' && path.startsWith(`${base}/`));
}

function navLinks(ctx, items, cls) {
  return items.map(([href, label, ic]) => {
    const count = href === '/messages' && ctx.user ? unreadMessages(ctx.user.id)
      : href === '/recruiting' && ctx.user ? connectionsOfTasker(ctx.user.id).filter((c) => c.status === 'pending').length : 0;
    return html`<a class="${cls}" href="#${href}" ${isActive(href, ctx.path) ? raw('aria-current="page"') : ''}>${ic ? icon(ic, 20) : ''}<span class="${cls}__label">${label}</span>${count ? html`<span class="count" aria-label="${count} new">${count}</span>` : ''}</a>`;
  });
}

function roleSwitch(ctx) {
  const roles = ctx.user.roles.filter((r) => r === 'client' || r === 'tasker');
  if (roles.length < 2) return '';
  return html`<div class="role-switch" role="group" aria-label="Active role">
    ${roles.map((r) => html`<button type="button" class="role-switch__btn" data-action="switch-role" data-role="${r}" aria-pressed="${String(ctx.role === r)}">${t(`role.${r}`)}</button>`)}
  </div>`;
}

function accountMenu(ctx) {
  const u = ctx.user;
  const canAddTasker = u.roles.includes('client') && !u.roles.includes('tasker');
  const canAddClient = u.roles.includes('tasker') && !u.roles.includes('client');
  return html`<details class="menu" data-menu>
    <summary class="menu__trigger" aria-label="Account menu for ${u.name}">${personAvatar(u, 'sm')}<span class="menu__name">${u.roles.includes('business') ? publicName(u) : u.name.split(' ')[0]}</span>${icon('chevron', 14)}</summary>
    <div class="menu__panel">
      <div class="menu__who"><strong>${u.roles.includes('business') ? publicName(u) : u.name}</strong><span class="small muted">${t(`role.${ctx.role}`)} view · ${u.email}</span></div>
      ${roleSwitch(ctx) ? html`<div class="menu__section menu__roles">${roleSwitch(ctx)}</div>` : ''}
      <nav class="menu__section" aria-label="Account">
        ${u.roles.includes('tasker') ? html`<a class="menu__item" href="#/profile/${u.id}">${icon('user')}My public profile</a>` : ''}
        ${u.roles.includes('tasker') && ctx.role === 'tasker' ? html`<a class="menu__item" href="#/recruiting">${icon('briefcase')}Recruiting inbox</a>` : ''}
        <a class="menu__item" href="#/notifications">${icon('bell')}Notifications</a>
        <a class="menu__item" href="#/settings">${icon('sliders')}Settings</a>
        <a class="menu__item" href="#/safety">${icon('shield')}Safety center</a>
        ${canAddTasker ? html`<button type="button" class="menu__item" data-action="add-role" data-role="tasker">${icon('plus')}Also earn as a tasker</button>` : ''}
        ${canAddClient ? html`<button type="button" class="menu__item" data-action="add-role" data-role="client">${icon('plus')}Also post tasks as a client</button>` : ''}
      </nav>
      <div class="menu__section">
        <button type="button" class="menu__item" data-action="demo-switch">${icon('users')}Switch demo account</button>
        <a class="menu__item" href="#/guide">${icon('compass')}Guided demo</a>
        <a class="menu__item" href="app.html#/home">${icon('phone')}Mobile app view</a>
        <button type="button" class="menu__item" data-action="sign-out">${icon('logout')}Sign out</button>
      </div>
    </div>
  </details>`;
}

export function shell(ctx, content) {
  const u = ctx.user;
  const items = u ? NAV[ctx.role] || NAV.client : [];
  const notes = u ? unreadNotifications(u.id) : 0;
  return html`
  <div class="demo-strip" role="note">
    <div class="wrap demo-strip__inner">
      <p class="demo-strip__text"><strong>Demo prototype.</strong> Data stays in this browser. No real payments, background checks or identity checks.</p>
      <div class="demo-strip__actions">
        <button type="button" class="demo-strip__btn" data-action="demo-switch">${icon('users', 16)}Switch demo account</button>
        <button type="button" class="demo-strip__btn" data-action="demo-reset">${icon('refresh', 16)}Reset</button>
      </div>
    </div>
  </div>
  ${storageAvailable() ? '' : html`<div class="wrap">${notice({ tone: 'warn', title: 'Changes cannot be saved in this browser', body: 'Browser storage is unavailable (for example in a private window). Everything works, but changes are lost when you close the tab.' })}</div>`}
  <header class="topbar">
    <div class="wrap topbar__inner">
      <a class="brand" href="#${u ? homeFor(ctx.role) : '/'}"><span class="brand__mark" aria-hidden="true">${icon('home', 18)}</span><span class="brand__name">${APP.name}</span><span class="visually-hidden"> — home</span></a>
      ${u ? html`<nav class="topnav" aria-label="Main">${navLinks(ctx, items, 'topnav__link')}</nav>`
        : html`<nav class="topnav topnav--public" aria-label="Main">${PUBLIC_NAV.map(([href, label]) => html`<a class="topnav__link" href="#${href}" ${isActive(href, ctx.path) && href !== '/welcome?s=how' && href !== '/welcome?s=business' ? raw('aria-current="page"') : ''}><span class="topnav__link__label">${label}</span></a>`)}</nav>`}
      <div class="topbar__right">
        ${u ? html`
          <span class="topbar__roles">${roleSwitch(ctx)}</span>
          <a class="icon-btn" href="#/notifications" aria-label="Notifications${notes ? `, ${notes} unread` : ''}">${icon('bell', 20)}${notes ? html`<span class="icon-btn__count" aria-hidden="true">${notes > 9 ? '9+' : notes}</span>` : ''}</a>
          ${accountMenu(ctx)}`
        : html`
          <details class="menu menu--public" data-menu>
            <summary class="icon-btn" aria-label="Menu">${icon('menu', 20)}</summary>
            <div class="menu__panel"><nav class="menu__section" aria-label="Main">${PUBLIC_NAV.map(([href, label]) => html`<a class="menu__item" href="#${href}">${label}</a>`)}</nav></div>
          </details>
          <a class="btn btn--ghost btn--sm hide-sm" href="#/signin">Sign in</a>
          <a class="btn btn--primary btn--sm" href="#/signup">Get started</a>`}
      </div>
    </div>
  </header>
  <main id="main" class="main" tabindex="-1">${content}</main>
  <footer class="footer">
    <div class="wrap footer__inner">
      <div class="footer__brand"><strong>${APP.name}</strong><span class="muted"> — working title. A prototype for Vienna, Graz and Linz.</span></div>
      <nav class="footer__nav" aria-label="Footer"><a href="#/tasks">Browse tasks</a><a href="#/welcome">About</a><a href="#/safety">Safety center</a><a href="#/guide">Guided demo</a><a href="app.html">Mobile app view</a></nav>
      <p class="small muted footer__note">${t('demo.wallet')} The prototype does not perform background, identity, insurance or licence checks, and it does not guarantee income or employment.</p>
    </div>
  </footer>
  ${u ? html`<nav class="tabbar" aria-label="Main (mobile)">${navLinks(ctx, items.slice(0, 5), 'tabbar__link')}</nav>` : ''}`;
}

export const actions = {
  'switch-role'(el) {
    const res = switchRole(el.dataset.role);
    if (!res.ok) return toast(res.message, 'danger');
    toast(`Switched to your ${t(`role.${el.dataset.role}`)} view.`, 'info');
    go('/dashboard');
  },
  async 'sign-out'() {
    signOut();
    toast('Signed out.', 'info');
    go('/');
  },
  'demo-switch'() {
    openDialog({ title: 'Switch demo account', wide: true, body: html`<p class="muted">Every account is seeded with realistic activity. Switching keeps all changes you made. Tip: open a second tab to be the client in one and the tasker in the other — they stay in sync.</p>${demoAccountList()}` });
  },
  async 'demo-reset'() {
    const yes = await confirmDialog({ title: 'Reset the demo?', body: html`<p>This restores the original demo data in this browser and signs you out. Tasks, messages and reviews you created will be removed.</p>`, confirmLabel: 'Reset demo data', tone: 'danger' });
    if (!yes) return;
    resetDemo();
    toast('Demo data reset.', 'info');
    go('/');
  },
  'skip-to-main'() {
    document.getElementById('main')?.focus();
  },
  'focus-field'(el) {
    const target = document.getElementById(el.dataset.target);
    if (!target) return;
    const focusable = target.matches('input, select, textarea') ? target : target.querySelector('input:not([type=hidden]), select, textarea');
    (focusable || target).focus();
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
};
