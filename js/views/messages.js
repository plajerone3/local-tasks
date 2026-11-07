// Messaging: conversations tied to a task or a recruiting connection.
import { html, raw } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { notice, emptyState, badge } from '../ui/components.js';
import { conversationsOf, conversationById, messagesOf, otherParticipant, userById, taskById, connectionById, unreadIn, publicName, isBlocked, me, businessOf } from '../select.js';
import { contactUnlocked, sendMessage, markRead } from '../services/messaging.js';
import { personAvatar, reportButton, blockButton } from './common.js';
import { fmt, t } from '../i18n.js';
import { toast } from '../ui/dialog.js';

function contextLabel(conv) {
  if (conv.contextType === 'task') {
    const task = taskById(conv.contextId);
    return { text: task?.title || 'Task', href: `#/tasks/${conv.contextId}`, kind: 'Task' };
  }
  const c = connectionById(conv.contextId);
  return { text: 'Recruiting conversation', href: '#/recruiting', kind: c?.status === 'accepted' ? 'Recruiting' : 'Recruiting' };
}

function listItem(conv, user, activeId) {
  const other = userById(otherParticipant(conv, user.id));
  const last = messagesOf(conv.id).filter((m) => !m.hidden).at(-1);
  const unread = unreadIn(conv.id, user.id);
  const ctx = contextLabel(conv);
  return html`<li><a class="convo${conv.id === activeId ? ' convo--active' : ''}${unread ? ' convo--unread' : ''}" href="#/messages/${conv.id}" ${conv.id === activeId ? raw('aria-current="page"') : ''}>
    ${personAvatar(other, 'sm')}
    <span class="convo__text">
      <span class="convo__top"><span class="convo__name">${publicName(other)}</span><span class="convo__time">${last ? fmt.relative(last.createdAt) : ''}</span></span>
      <span class="convo__ctx">${ctx.kind}: ${ctx.text}</span>
      <span class="convo__last">${last ? (last.system ? last.body : `${last.senderId === user.id ? 'You: ' : ''}${last.body}`) : 'No messages yet'}</span>
    </span>
    ${unread ? html`<span class="count" aria-label="${unread} unread">${unread}</span>` : ''}
  </a></li>`;
}

function thread(conv, user) {
  const otherId = otherParticipant(conv, user.id);
  const other = userById(otherId);
  const msgs = messagesOf(conv.id);
  const unlocked = contactUnlocked(conv);
  const ctx = contextLabel(conv);
  const blocked = isBlocked(user.id, otherId);
  const biz = conv.contextType === 'recruiting' ? businessOf(conv.participantIds.find((p) => userById(p)?.roles.includes('business'))) : null;
  return html`<div class="thread-wrap">
    <header class="thread-head">
      <a class="icon-btn thread-head__back" href="#/messages" aria-label="Back to conversations">${icon('back')}</a>
      ${personAvatar(other)}
      <div class="thread-head__text"><h2 class="thread-head__name" tabindex="-1">${publicName(other)}</h2><a class="small" href="${ctx.href}">${ctx.kind}: ${ctx.text}</a></div>
      <div class="thread-head__actions">${reportButton('conversation', conv.id, { userId: otherId, label: 'Report' })}${blockButton(otherId)}</div>
    </header>
    ${conv.contextType === 'recruiting'
      ? notice({ tone: 'info', body: html`This is a recruiting conversation with ${biz?.companyName || 'a business'}. It is not a job offer, and you decide what to share. Business details: pending review (demo).` })
      : unlocked ? '' : notice({ tone: 'info', ic: 'lock', body: `${t('privacy.contact')} Keep the conversation here for your safety.` })}
    <ol class="thread" aria-label="Messages" tabindex="0">
      ${msgs.map((m) => {
        if (m.system) return html`<li class="msg msg--system"><span>${m.body}</span><time class="msg__time">${fmt.relative(m.createdAt)}</time></li>`;
        if (m.hidden) return html`<li class="msg msg--system"><span>A message was hidden by a moderator.</span></li>`;
        const mine = m.senderId === user.id;
        return html`<li class="msg ${mine ? 'msg--mine' : 'msg--theirs'}">
          <span class="visually-hidden">${mine ? 'You' : publicName(other)} wrote:</span>
          <div class="msg__bubble">${m.body}</div>
          <div class="msg__meta"><time>${fmt.day(m.createdAt)}, ${fmt.time(m.createdAt)}</time>${m.masked ? html`<span>${icon('lock', 12)} contact details hidden</span>` : ''}${m.simulated ? badge('Demo auto-reply', 'demo') : ''}${!mine ? reportButton('message', m.id, { userId: otherId, label: 'Report', cls: 'link-btn link-btn--tiny' }) : ''}</div>
        </li>`;
      })}
    </ol>
    ${blocked ? notice({ tone: 'neutral', body: 'You cannot send messages in this conversation because one of you has blocked the other.' })
      : html`<form class="composer" data-form="send-message" data-conv="${conv.id}" novalidate>
        <label class="visually-hidden" for="composer-body">Write a message to ${publicName(other)}</label>
        <textarea class="input composer__input" id="composer-body" name="body" rows="2" placeholder="Write a message…" maxlength="2000"></textarea>
        <button class="btn btn--primary composer__send" type="submit" aria-label="Send">${icon('send')}<span class="hide-sm">Send</span></button>
      </form>`}
  </div>`;
}

export default {
  title: () => 'Messages',
  render(ctx) {
    const user = ctx.user;
    const convs = conversationsOf(user.id).filter((c) => !isBlocked(user.id, otherParticipant(c, user.id)) || c.id === ctx.params.id);
    const active = ctx.params.id ? conversationById(ctx.params.id) : null;
    const allowed = active && active.participantIds.includes(user.id);
    return html`<div class="wrap page page--chat">
      <h1 class="${active ? 'hide-sm-only' : ''}" tabindex="-1">Messages</h1>
      <div class="chat${active ? ' chat--open' : ''}">
        <nav class="chat__list" aria-label="Conversations">
          ${convs.length ? html`<ul class="convo-list">${convs.map((c) => listItem(c, user, ctx.params.id))}</ul>` : emptyState({ ic: 'message', title: 'No conversations yet', body: 'Conversations start from a task or a recruiting request.' })}
        </nav>
        <section class="chat__thread" aria-label="Conversation">
          ${active && allowed ? thread(active, user) : active ? notice({ tone: 'warn', body: 'You are not part of this conversation.' }) : html`<div class="chat__placeholder">${emptyState({ ic: 'message', title: 'Choose a conversation', body: 'Messages stay in the app. Phone numbers and emails are hidden until a task is accepted.' })}</div>`}
        </section>
      </div>
    </div>`;
  },
  after(ctx) {
    const el = document.querySelector('.thread');
    if (el) el.scrollTop = el.scrollHeight;
    if (ctx.params.id && conversationById(ctx.params.id)?.participantIds.includes(ctx.user.id)) {
      setTimeout(() => markRead(ctx.params.id, ctx.user.id), 0);
    }
  },
};

export const forms = {
  'send-message'(form, data) {
    const res = sendMessage(form.dataset.conv, me().id, data.get('body') || '');
    if (!res.ok) return toast(res.message || res.errors.body, 'danger');
    form.reset();
    if (res.masked) toast('Contact details were hidden. You can share them once the task is accepted.', 'info');
    setTimeout(() => document.getElementById('composer-body')?.focus(), 0);
  },
};

export const actions = {};
