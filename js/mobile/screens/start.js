// Welcome, demo account picker, sign-out, role switching, and screens for roles the app does not cover.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { demoAccounts, userById, publicName } from '../../select.js';
import { signInAs, signOut, switchRole } from '../../services/accounts.js';
import { resetDemo } from '../../store.js';
import { openDialog, closeDialogs, toast, confirmDialog } from '../../ui/dialog.js';
import { go } from '../../router.js';
import { t } from '../../i18n.js';
import { mAvatar, screen } from '../ui.js';

const SHAPES = [
  ['sun', '🧽', 'circle'], ['tomato', '📦', 'pill'], ['mint', '🌿', 'square'], ['sky', '🪟', 'circle'],
  ['bubble', '🛒', 'square'], ['lavender', '🎪', 'pill'], ['lime', '🚚', 'circle'], ['peach', '🐕', 'square'],
];

export const welcome = {
  title: () => 'Welcome',
  render() {
    return html`<div class="m-screen m-screen--welcome"><main class="m-main m-welcome" id="main" tabindex="-1">
      <div class="m-welcome__art" aria-hidden="true">${SHAPES.map(([c, e, s], i) => html`<span class="m-shape m-shape--${s} c-${c}" style="--i:${i}">${e}</span>`)}</div>
      <p class="m-eyebrow">Vienna · Graz · Linz</p>
      <h1 class="m-welcome__title" tabindex="-1">Get help.<br>Get paid.<br>Get seen.</h1>
      <p class="m-welcome__lead">Small local jobs with honest prices, explained recommendations and reviews that belong to you.</p>
      <div class="m-stack">
        <button type="button" class="m-btn m-btn--primary m-btn--block" data-action="m-open-accounts">Get started${icon('chevron', 18)}</button>
        <a class="m-btn m-btn--ghost m-btn--block" href="index.html#/signup">Create an account in the web app</a>
      </div>
      <p class="m-fine">Demo prototype. No real payments, background or identity checks.</p>
    </main></div>`;
  },
};

function accountPicker() {
  const list = demoAccounts().filter((u) => u.roles.includes('client') || u.roles.includes('tasker'));
  const groups = [['Need help', list.filter((u) => u.roles.includes('client') && !u.roles.includes('tasker')), 'client'], ['Do tasks', list.filter((u) => u.roles.includes('tasker') && !u.roles.includes('client')), 'tasker'], ['Both', list.filter((u) => u.roles.includes('tasker') && u.roles.includes('client')), 'client']];
  return html`<p class="m-muted">Pick a demo person. Every account comes with real-looking activity, and all changes stay in this browser.</p>
    ${groups.filter(([, us]) => us.length).map(([label, us, role]) => html`<h3 class="m-sheet-label">${label}</h3>
      <ul class="m-list m-list--card">${us.map((u) => html`<li><button type="button" class="m-row" data-action="m-login" data-user="${u.id}" data-role="${role}">
        <span class="m-row__lead">${mAvatar(u)}</span>
        <span class="m-row__text"><span class="m-row__title">${u.name}</span><span class="m-row__sub">${u.demo.blurb}</span></span>
        <span class="m-row__trail">${icon('chevron', 18)}</span>
      </button></li>`)}</ul>`)}
    <p class="m-fine">Business and moderator tools are in the <a href="index.html#/guide">web app</a>.</p>`;
}

export const notForMobile = {
  title: () => 'Use the web app',
  render(ctx) {
    const label = ctx.user.roles.includes('business') ? 'Business recruiting' : 'Moderation';
    return screen({ ctx, tabs: false, content: html`<div class="m-pad m-center-col">
      <span class="m-empty__art c-lavender" aria-hidden="true">${ctx.user.roles.includes('business') ? '💼' : '🛡️'}</span>
      <h1 class="m-h1" tabindex="-1">${label} lives in the web app</h1>
      <p class="m-muted">The mobile app is for people who post tasks and people who do them. ${publicName(ctx.user)} is a ${t(`role.${ctx.role}`).toLowerCase()} account.</p>
      <a class="m-btn m-btn--primary m-btn--block" href="index.html#/${ctx.role === 'moderator' ? 'moderation' : 'dashboard'}">Open the web app</a>
      <button type="button" class="m-btn m-btn--ghost m-btn--block" data-action="m-open-accounts">Switch demo account</button>
    </div>` });
  },
};

export function needRole(role) {
  return {
    title: () => 'Not available',
    render(ctx) {
      return screen({ ctx, content: html`<div class="m-pad m-center-col">
        <span class="m-empty__art c-sun" aria-hidden="true">🔒</span>
        <h1 class="m-h1" tabindex="-1">This is for ${t(`role.${role}`).toLowerCase()}s</h1>
        <p class="m-muted">Your account does not have the ${t(`role.${role}`).toLowerCase()} role yet. You can add it in the web app.</p>
        <a class="m-btn m-btn--primary m-btn--block" href="index.html#/onboarding/${role}">Add the ${t(`role.${role}`).toLowerCase()} role</a>
        <a class="m-btn m-btn--ghost m-btn--block" href="#/home">Back home</a>
      </div>` });
    },
  };
}

export const actions = {
  'm-open-accounts'() {
    openDialog({ title: 'Choose a demo account', body: accountPicker() });
  },
  'm-login'(el) {
    const res = signInAs(el.dataset.user, el.dataset.role);
    if (!res.ok) return toast(res.message, 'danger');
    closeDialogs();
    toast(`Hi ${userById(el.dataset.user).name.split(' ')[0]}! You are in the ${t(`role.${res.role}`).toLowerCase()} view.`, 'info');
    go('/home');
  },
  'm-switch-role'(el) {
    const res = switchRole(el.dataset.role);
    if (!res.ok) return toast(res.message, 'danger');
    toast(`Switched to ${t(`role.${el.dataset.role}`)}.`, 'info');
    go('/home');
  },
  'm-signout'() {
    signOut();
    go('/');
  },
  async 'm-reset'() {
    const yes = await confirmDialog({ title: 'Reset the demo?', body: html`<p>This restores the original demo data in this browser (web app included) and signs you out.</p>`, confirmLabel: 'Reset demo', tone: 'danger' });
    if (!yes) return;
    resetDemo();
    toast('Demo data reset.', 'info');
    go('/');
  },
};

