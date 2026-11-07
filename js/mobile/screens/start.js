// Welcome, demo account picker, sign-out, role switching, and screens for roles the app does not cover.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { demoAccounts, userById, publicName } from '../../select.js';
import { signInAs, signOut, switchRole } from '../../services/accounts.js';
import { resetDemo } from '../../store.js';
import { openDialog, closeDialogs, toast, confirmDialog } from '../../ui/dialog.js';
import { go } from '../../router.js';
import { t, tr } from '../../i18n.js';
import { mAvatar, screen } from '../ui.js';

const SHAPES = [
  ['sun', '🧽', 'circle'], ['tomato', '📦', 'pill'], ['mint', '🌿', 'square'], ['sky', '🪟', 'circle'],
  ['bubble', '🛒', 'square'], ['lavender', '🎪', 'pill'], ['lime', '🚚', 'circle'], ['peach', '🐕', 'square'],
];

export const welcome = {
  title: () => tr('Welcome'),
  render() {
    return html`<div class="m-screen m-screen--welcome"><main class="m-main m-welcome" id="main" tabindex="-1">
      <div class="m-welcome__art" aria-hidden="true">${SHAPES.map(([c, e, s], i) => html`<span class="m-shape m-shape--${s} c-${c}" style="--i:${i}">${e}</span>`)}</div>
      <p class="m-eyebrow">${tr('Vienna · Graz · Linz')}</p>
      <h1 class="m-welcome__title" tabindex="-1">${tr('Get help.')}<br>${tr('Get paid.')}<br>${tr('Get seen.')}</h1>
      <p class="m-welcome__lead">${tr('Small local jobs with honest prices, explained recommendations and reviews that belong to you.')}</p>
      <div class="m-stack">
        <button type="button" class="m-btn m-btn--primary m-btn--block" data-action="m-open-accounts">${tr('Get started')}${icon('chevron', 18)}</button>
        <a class="m-btn m-btn--ghost m-btn--block" href="index.html#/signup">${tr('Create an account in the web app')}</a>
      </div>
      <p class="m-fine">${tr('Demo prototype. No real payments, background or identity checks.')}</p>
    </main></div>`;
  },
};

function accountPicker() {
  const list = demoAccounts().filter((u) => u.roles.includes('client') || u.roles.includes('tasker'));
  const groups = [['Need help', list.filter((u) => u.roles.includes('client') && !u.roles.includes('tasker')), 'client'], ['Do tasks', list.filter((u) => u.roles.includes('tasker') && !u.roles.includes('client')), 'tasker'], ['Both', list.filter((u) => u.roles.includes('tasker') && u.roles.includes('client')), 'client']];
  return html`<p class="m-muted">${tr('Pick a demo person. Every account comes with real-looking activity, and all changes stay in this browser.')}</p>
    ${groups.filter(([, us]) => us.length).map(([label, us, role]) => html`<h3 class="m-sheet-label">${tr(label)}</h3>
      <ul class="m-list m-list--card">${us.map((u) => html`<li><button type="button" class="m-row" data-action="m-login" data-user="${u.id}" data-role="${role}">
        <span class="m-row__lead">${mAvatar(u)}</span>
        <span class="m-row__text"><span class="m-row__title">${u.name}</span><span class="m-row__sub">${u.demo.blurb}</span></span>
        <span class="m-row__trail">${icon('chevron', 18)}</span>
      </button></li>`)}</ul>`)}
    <p class="m-fine">${tr('Business and moderator tools are in the web app.')} <a href="index.html#/guide">${tr('Open the web app')}</a></p>`;
}

export const notForMobile = {
  title: () => tr('Use the web app'),
  render(ctx) {
    const label = tr(ctx.user.roles.includes('business') ? 'Business recruiting' : 'Moderation');
    return screen({ ctx, tabs: false, content: html`<div class="m-pad m-center-col">
      <span class="m-empty__art c-lavender" aria-hidden="true">${ctx.user.roles.includes('business') ? '💼' : '🛡️'}</span>
      <h1 class="m-h1" tabindex="-1">${tr('{label} lives in the web app', { label })}</h1>
      <p class="m-muted">${tr('The mobile app is for people who post tasks and people who do them. {name} is a {role} account.', { name: publicName(ctx.user), role: t(`role.${ctx.role}`) })}</p>
      <a class="m-btn m-btn--primary m-btn--block" href="index.html#/${ctx.role === 'moderator' ? 'moderation' : 'dashboard'}">${tr('Open the web app')}</a>
      <button type="button" class="m-btn m-btn--ghost m-btn--block" data-action="m-open-accounts">${tr('Switch demo account')}</button>
    </div>` });
  },
};

export function needRole(role) {
  return {
    title: () => tr('Not available'),
    render(ctx) {
      return screen({ ctx, content: html`<div class="m-pad m-center-col">
        <span class="m-empty__art c-sun" aria-hidden="true">🔒</span>
        <h1 class="m-h1" tabindex="-1">${tr('This is for {role} accounts', { role: t(`role.${role}`) })}</h1>
        <p class="m-muted">${tr('Your account does not have the {role} role yet. You can add it in the web app.', { role: t(`role.${role}`) })}</p>
        <a class="m-btn m-btn--primary m-btn--block" href="index.html#/onboarding/${role}">${tr('Add the {role} role', { role: t(`role.${role}`) })}</a>
        <a class="m-btn m-btn--ghost m-btn--block" href="#/home">${tr('Back home')}</a>
      </div>` });
    },
  };
}

export const actions = {
  'm-open-accounts'() {
    openDialog({ title: tr('Choose a demo account'), body: accountPicker() });
  },
  'm-login'(el) {
    const res = signInAs(el.dataset.user, el.dataset.role);
    if (!res.ok) return toast(res.message, 'danger');
    closeDialogs();
    toast(tr('Hi {name}! You are in the {role} view.', { name: userById(el.dataset.user).name.split(' ')[0], role: t(`role.${res.role}`) }), 'info');
    go('/home');
  },
  'm-switch-role'(el) {
    const res = switchRole(el.dataset.role);
    if (!res.ok) return toast(res.message, 'danger');
    toast(tr('Switched to {role}.', { role: t(`role.${el.dataset.role}`) }), 'info');
    go('/home');
  },
  'm-signout'() {
    signOut();
    go('/');
  },
  async 'm-reset'() {
    const yes = await confirmDialog({ title: tr('Reset the demo?'), body: html`<p>${tr('This restores the original demo data in this browser (web app included) and signs you out.')}</p>`, confirmLabel: tr('Reset demo'), tone: 'danger' });
    if (!yes) return;
    resetDemo();
    toast(tr('Demo data reset.'), 'info');
    go('/');
  },
};

