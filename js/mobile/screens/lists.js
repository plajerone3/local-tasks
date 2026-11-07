// Activity, inbox, chat thread and notifications.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { statusBadge } from '../../ui/components.js';
import { tasksByClient, assignmentsForUser, applicationsByTasker, taskById, userById, assignmentForTask, conversationsOf, conversationById, messagesOf, otherParticipant, unreadIn, publicName, isBlocked, notificationsOf, me, businessOf, activeApplicationsForTask } from '../../select.js';
import { update } from '../../store.js';
import { fmt, t, tr, trn } from '../../i18n.js';
import { contactUnlocked, sendMessage, markRead } from '../../services/messaging.js';
import { reportButton, blockButton } from '../../views/common.js';
import { screen, topbar, catBadge, catColor, mAvatar, segmented, emptyM, toMobile } from '../ui.js';
import { toast } from '../../ui/dialog.js';
import { go } from '../../router.js';

const UPCOMING_TASK = ['open', 'under_review', 'assigned', 'in_progress', 'awaiting_confirmation', 'disputed'];

function activityRow({ href, category, title, sub, status, kind, price }) {
  return html`<li><a class="m-trow" href="#${href}">
    ${catBadge(category)}
    <span class="m-trow__text"><span class="m-trow__title">${title}</span><span class="m-trow__sub">${sub}</span><span>${statusBadge(kind, status)}</span></span>
    <span class="m-trow__price">${price}</span>
  </a></li>`;
}

function clientItems(user, tab) {
  return tasksByClient(user.id)
    .filter((x) => (tab === 'upcoming' ? UPCOMING_TASK.includes(x.status) : !UPCOMING_TASK.includes(x.status)))
    .sort((a, b) => (tab === 'upcoming' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)))
    .map((x) => {
      const asg = assignmentForTask(x.id);
      const offers = activeApplicationsForTask(x.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length;
      return { href: asg && asg.status !== 'cancelled' ? `/job/${asg.id}` : `/task/${x.id}`, category: x.category, title: x.title, sub: `${fmt.date(x.date)} · ${x.status === 'open' ? trn(offers, '{n} offer', '{n} offers') : fmt.window(x.timeWindow)}`, status: x.status, kind: 'task', price: fmt.range(x.budgetMin, x.budgetMax) };
    });
}

function taskerItems(user, tab) {
  const asgs = assignmentsForUser(user.id).filter((a) => a.taskerId === user.id);
  const apps = applicationsByTasker(user.id);
  if (tab === 'upcoming') {
    return [
      ...asgs.filter((a) => ['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(a.status)).map((a) => ({ a, task: taskById(a.taskId), kind: 'assignment', status: a.status, href: `/job/${a.id}`, price: fmt.money0(a.agreedPrice) })),
      ...apps.filter((a) => ['applied', 'shortlisted'].includes(a.status)).map((a) => ({ a, task: taskById(a.taskId), kind: 'application', status: a.status, href: `/task/${a.taskId}`, price: fmt.money0(a.proposedRate) })),
    ].sort((x, y) => x.task.date.localeCompare(y.task.date)).map((x) => ({ href: x.href, category: x.task.category, title: x.task.title, sub: `${fmt.date(x.task.date)} · ${fmt.window(x.task.timeWindow)}`, status: x.status, kind: x.kind, price: x.price }));
  }
  return [
    ...asgs.filter((a) => ['completed', 'cancelled'].includes(a.status)).map((a) => ({ task: taskById(a.taskId), kind: 'assignment', status: a.status, href: `/job/${a.id}`, price: fmt.money0(a.agreedPrice) })),
    ...apps.filter((a) => ['declined', 'withdrawn'].includes(a.status) && !asgs.some((s) => s.applicationId === a.id)).map((a) => ({ task: taskById(a.taskId), kind: 'application', status: a.status, href: `/task/${a.taskId}`, price: fmt.money0(a.proposedRate) })),
  ].sort((x, y) => y.task.date.localeCompare(x.task.date)).map((x) => ({ href: x.href, category: x.task.category, title: x.task.title, sub: fmt.date(x.task.date), status: x.status, kind: x.kind, price: x.price }));
}

export const activity = {
  title: () => tr('Activity'),
  render(ctx) {
    const tab = ctx.query.tab === 'past' ? 'past' : 'upcoming';
    const items = ctx.role === 'tasker' ? taskerItems(ctx.user, tab) : clientItems(ctx.user, tab);
    const other = ctx.role === 'tasker' ? taskerItems(ctx.user, tab === 'past' ? 'upcoming' : 'past') : clientItems(ctx.user, tab === 'past' ? 'upcoming' : 'past');
    const content = html`<div class="m-pad">
      ${segmented([{ id: 'upcoming', label: tr('Upcoming'), href: '/activity', count: tab === 'upcoming' ? items.length : other.length }, { id: 'past', label: tr('Past'), href: '/activity?tab=past' }], tab, tr('Activity'))}
      ${items.length ? html`<ul class="m-tlist">${items.map(activityRow)}</ul>`
        : emptyM({ emoji: tab === 'upcoming' ? '🗓️' : '📭', title: tr(tab === 'upcoming' ? 'Nothing coming up' : 'No past activity yet'), body: tr(ctx.role === 'tasker' ? 'Offers and jobs show up here.' : 'Tasks you post show up here.'), color: 'lavender', action: ctx.role === 'tasker' ? html`<a class="m-btn m-btn--primary" href="#/work">${tr('Find work')}</a>` : html`<a class="m-btn m-btn--primary" href="#/post">${tr('Post a task')}</a>` })}
    </div>`;
    return screen({ ctx, top: topbar({ title: tr('Activity'), large: true }), content });
  },
};

function convLabel(conv) {
  if (conv.contextType === 'task') return { text: taskById(conv.contextId)?.title || tr('Task'), color: catColor(taskById(conv.contextId)?.category) };
  return { text: tr('Stable work'), color: 'lavender' };
}

export const inbox = {
  title: () => tr('Inbox'),
  render(ctx) {
    const user = ctx.user;
    const convs = conversationsOf(user.id).filter((c) => !isBlocked(user.id, otherParticipant(c, user.id)));
    const content = html`<div class="m-pad">${convs.length ? html`<ul class="m-list">${convs.map((c) => {
      const other = userById(otherParticipant(c, user.id));
      const last = messagesOf(c.id).filter((m) => !m.hidden).at(-1);
      const unread = unreadIn(c.id, user.id);
      const lab = convLabel(c);
      return html`<li><a class="m-row m-row--chat${unread ? ' is-unread' : ''}" href="#/inbox/${c.id}">
        <span class="m-row__lead">${mAvatar(other)}</span>
        <span class="m-row__text"><span class="m-row__title">${publicName(other)} <span class="m-row__time">${last ? fmt.relative(last.createdAt) : ''}</span></span>
          <span class="m-row__ctx c-${lab.color}">${lab.text}</span>
          <span class="m-row__sub">${last ? `${last.senderId === user.id ? tr('You: ') : ''}${last.body}` : tr('No messages yet')}</span></span>
        <span class="m-row__trail">${unread ? html`<span class="m-unread" aria-label="${tr('{n} unread', { n: unread })}">${unread}</span>` : ''}</span>
      </a></li>`;
    })}</ul>` : emptyM({ emoji: '💬', title: tr('No messages yet'), body: tr('Chats start from a task or a request from a business.'), color: 'sky' })}</div>`;
    return screen({ ctx, top: topbar({ title: tr('Inbox'), large: true }), content });
  },
};

export const thread = {
  title: () => tr('Chat'),
  render(ctx) {
    const user = ctx.user;
    const conv = conversationById(ctx.params.id);
    if (!conv || !conv.participantIds.includes(user.id)) return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: '🔒', title: tr('You’re not part of this chat') })}</div>` });
    const otherId = otherParticipant(conv, user.id);
    const other = userById(otherId);
    const lab = convLabel(conv);
    const blocked = isBlocked(user.id, otherId);
    const msgs = messagesOf(conv.id);
    const biz = conv.contextType === 'recruiting' ? businessOf(conv.participantIds.find((p) => userById(p)?.roles.includes('business'))) : null;
    const top = html`<header class="m-top m-top--chat">
      <a class="m-iconbtn" href="#/inbox" aria-label="${tr('Back to inbox')}">${icon('back', 22)}</a>
      <a class="m-chat-who" href="#${conv.contextType === 'task' ? `/task/${conv.contextId}` : '/recruiting'}">${mAvatar(other, 'sm')}<span><strong class="m-top__title" tabindex="-1">${publicName(other)}</strong><span class="m-row__ctx c-${lab.color}">${lab.text}</span></span></a>
      <span class="m-top__actions">${blockButton(otherId, { cls: 'm-iconbtn' })}</span>
    </header>`;
    const content = html`<div class="m-chat">
      <p class="m-chat__notice">${icon('lock', 14)}${conv.contextType === 'recruiting' ? tr('Recruiting chat with {company}. Not a job offer; share only what you want.', { company: biz?.companyName || tr('a business') }) : contactUnlocked(conv) ? tr('Task accepted. Share contact details only if you want to.') : t('privacy.contact')}</p>
      <ol class="m-msgs" aria-label="${tr('Messages')}">${msgs.map((m) => {
        if (m.system) return html`<li class="m-msg m-msg--system">${m.body}</li>`;
        if (m.hidden) return html`<li class="m-msg m-msg--system">${tr('A message was hidden by a moderator.')}</li>`;
        const mine = m.senderId === user.id;
        return html`<li class="m-msg ${mine ? 'm-msg--mine' : 'm-msg--theirs'}">
          <span class="visually-hidden">${mine ? tr('You') : publicName(other)}:</span>
          <span class="m-msg__bubble">${m.body}</span>
          <span class="m-msg__meta">${fmt.time(m.createdAt)}${m.masked ? html` · ${icon('lock', 11)} ${tr('hidden details')}` : ''}${m.simulated ? html` · <span class="m-demo">${tr('demo reply')}</span>` : ''}${!mine ? reportButton('message', m.id, { userId: otherId, label: tr('Report'), cls: 'm-link m-link--tiny' }) : ''}</span>
        </li>`;
      })}</ol>
    </div>`;
    const footer = blocked ? html`<p class="m-footnote">${tr('You can’t message here because one of you blocked the other.')}</p>`
      : html`<form class="m-composer" data-form="m-send" data-conv="${conv.id}" novalidate>
        <label class="visually-hidden" for="m-composer">${tr('Message {name}', { name: publicName(other) })}</label>
        <textarea id="m-composer" name="body" rows="1" class="m-composer__input" placeholder="${tr('Message…')}" maxlength="2000"></textarea>
        <button class="m-composer__send" type="submit" aria-label="${tr('Send')}">${icon('send', 20)}</button>
      </form>`;
    return screen({ ctx, top, content, footer, tabs: false, cls: 'm-screen--chat' });
  },
  after(ctx) {
    const main = document.querySelector('.m-main');
    if (main) main.scrollTop = main.scrollHeight;
    const conv = conversationById(ctx.params.id);
    if (conv?.participantIds.includes(ctx.user.id)) setTimeout(() => markRead(conv.id, ctx.user.id), 0);
  },
};

export const notifications = {
  title: () => tr('Notifications'),
  render(ctx) {
    const list = notificationsOf(ctx.user.id);
    const unread = list.filter((n) => !n.read).length;
    const content = html`<div class="m-pad">${list.length ? html`<ul class="m-list">${list.map((n, i) => html`<li><button type="button" class="m-row m-row--note${n.read ? '' : ' is-unread'}" data-action="m-note" data-id="${n.id}" data-href="${toMobile(n.href)}">
      <span class="m-row__lead"><span class="m-notedot c-${['sun', 'tomato', 'mint', 'sky', 'bubble', 'lavender', 'lime'][i % 7]}" aria-hidden="true">${icon('bell', 16)}</span></span>
      <span class="m-row__text"><span class="m-row__title">${n.text}</span><span class="m-row__sub">${fmt.relative(n.createdAt)}${n.read ? '' : ` · ${tr('new')}`}</span></span>
      <span class="m-row__trail">${icon('chevron', 18)}</span>
    </button></li>`)}</ul>` : emptyM({ emoji: '🔔', title: tr('All quiet'), body: tr('Offers, messages and updates show up here.'), color: 'sun' })}</div>`;
    const actions = unread ? html`<button type="button" class="m-link" data-action="m-notes-read">${tr('Mark all read')}</button>` : '';
    return screen({ ctx, top: topbar({ title: tr('Notifications'), back: '/home', actions }), content });
  },
};

export const actions = {
  'm-note'(el) {
    const uid = me().id;
    update((s) => { const n = s.notifications.find((x) => x.id === el.dataset.id && x.userId === uid); if (n) n.read = true; });
    go(el.dataset.href || '/home');
  },
  'm-notes-read'() {
    const uid = me().id;
    update((s) => { s.notifications.forEach((n) => { if (n.userId === uid) n.read = true; }); });
  },
};

export const forms = {
  'm-send'(form, data) {
    const res = sendMessage(form.dataset.conv, me().id, data.get('body') || '');
    if (!res.ok) return toast(res.message || res.errors.body, 'danger');
    form.reset();
    if (res.masked) toast(tr('Contact details were hidden. You can share them once the task is accepted.'), 'info');
    setTimeout(() => document.getElementById('m-composer')?.focus(), 0);
  },
};

