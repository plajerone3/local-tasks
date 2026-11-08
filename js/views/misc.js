// Notifications, not-found and access screens.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, emptyState, notice } from '../ui/components.js';
import { notificationsOf, me } from '../select.js';
import { update } from '../store.js';
import { fmt, t } from '../i18n.js';
import { go } from '../router.js';
import { standing } from '../logic/enforcement.js';

export const notifications = {
  title: () => 'Notifications',
  render(ctx) {
    const list = notificationsOf(ctx.user.id);
    const unread = list.filter((n) => !n.read).length;
    return html`<div class="wrap page page--narrow">
      ${pageHead({ title: 'Notifications', lead: unread ? `${unread} unread` : 'You are all caught up.', actions: unread ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="notes-read">Mark all as read</button>` : '' })}
      ${list.length ? html`<ul class="notes">${list.map((n) => html`<li>
        <button type="button" class="note${n.read ? '' : ' note--unread'}" data-action="note-open" data-id="${n.id}" data-href="${n.href || ''}">
          <span class="note__dot" aria-hidden="true"></span>
          <span class="note__text">${n.text}<span class="note__time">${fmt.relative(n.createdAt)}</span></span>
          ${n.read ? '' : html`<span class="visually-hidden">(unread)</span>`}
          ${icon('chevron', 16)}
        </button>
      </li>`)}</ul>` : emptyState({ ic: 'bell', title: 'No notifications yet', body: 'Applications, messages and status changes show up here.' })}
      <p class="small muted">Email and push notifications are coming later. You can see the placeholder in Settings.</p>
    </div>`;
  },
};

/** Shown instead of the app when staff suspended, banned or closed the signed-in account. */
export const paused = {
  title: () => 'Account paused',
  render(ctx) {
    const st = standing(ctx.user);
    const e = ctx.user.enforcement || {};
    const title = { suspended: 'Your account is suspended', banned: 'Your account has been closed', closed: 'This account is closed' }[st] || 'Your account is suspended';
    return html`<div class="wrap page page--narrow">${notice({ tone: 'danger', title, body: html`${e.reason ? html`<p>Reason from our team: ${e.reason}</p>` : ''}${st === 'suspended' && e.until ? html`<p>You can use the app again from ${fmt.day(e.until)}.</p>` : ''}<p>If you think this is a mistake, contact support. Jobs that were already paid stay protected.</p>`, actions: html`<a class="btn btn--secondary btn--sm" href="#/safety">Safety and support</a><button type="button" class="btn btn--primary btn--sm" data-action="sign-out">Sign out</button>`, role: 'alert' })}</div>`;
  },
};

export const notFound = {
  title: () => 'Page not found',
  render() {
    return html`<div class="wrap page page--narrow">${emptyState({ ic: 'compass', title: 'We could not find that page', body: 'The link may be old, or the item was removed.', actions: html`<a class="btn btn--primary" href="#/">Go to the start page</a><a class="btn btn--secondary" href="#/tasks">Browse tasks</a>` })}</div>`;
  },
};

export function accessView(role, user) {
  return {
    title: () => 'Not available for this account',
    render() {
      const label = t(`role.${role}`);
      const canAdd = (role === 'tasker' || role === 'client') && !user.roles.includes('business') && !user.roles.includes('moderator');
      return html`<div class="wrap page page--narrow">
        ${pageHead({ title: `This page is for ${label} accounts` })}
        ${notice({ tone: 'info', body: role === 'business' ? 'Candidate search is for organisations with a business account. Personal accounts cannot search other people.' : role === 'moderator' ? 'Only the safety team can open the moderation console.' : `Your account does not have the ${label.toLowerCase()} role yet.` })}
        <div class="row">
          ${canAdd ? html`<button type="button" class="btn btn--primary" data-action="add-role" data-role="${role}">${icon('plus')}Add the ${label.toLowerCase()} role</button>` : ''}
          <button type="button" class="btn btn--secondary" data-action="demo-switch">Switch demo account</button>
          <a class="btn btn--ghost" href="#/dashboard">Back to dashboard</a>
        </div>
      </div>`;
    },
  };
}

export const actions = {
  'notes-read'() {
    const uid = me().id;
    update((s) => { s.notifications.forEach((n) => { if (n.userId === uid) n.read = true; }); });
  },
  'note-open'(el) {
    const uid = me().id;
    update((s) => { const n = s.notifications.find((x) => x.id === el.dataset.id && x.userId === uid); if (n) n.read = true; });
    if (el.dataset.href) go(el.dataset.href);
  },
};
