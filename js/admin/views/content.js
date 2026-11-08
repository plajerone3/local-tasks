// Conversations (private by default, opened with a logged reason) and reviews.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { badge, notice } from '../../ui/components.js';
import { getState } from '../../store.js';
import { userById, taskById, conversationById, messagesOf, connectionById } from '../../select.js';
import { can } from '../../logic/staff.js';
import { flagLabel } from '../../logic/flags.js';
import { fmt } from '../../i18n.js';
import * as BO from '../../services/backoffice.js';
import { nameOf } from '../events.js';
import { head, table, person, filters, timeline, section, btn, flagChips, when, ago } from '../ui.js';

const about = (c) => (c.contextType === 'task' ? taskById(c.contextId)?.title || 'Task' : `Recruiting: ${nameOf(connectionById(c.contextId)?.businessId)}`);

export const conversations = {
  title: () => 'Conversations',
  render(ctx) {
    const s = getState();
    const q = String(ctx.query.q || '').trim().toLowerCase();
    const flag = ctx.query.flag || '';
    let convs = s.conversations.map((c) => {
      const msgs = s.messages.filter((m) => m.conversationId === c.id);
      return { c, msgs, last: msgs.reduce((a, m) => (m.createdAt > a ? m.createdAt : a), c.createdAt), flagged: msgs.filter((m) => m.flags?.length && !m.flagsReviewedAt && !m.hidden).length, hidden: msgs.filter((m) => m.hidden).length, masked: msgs.filter((m) => m.masked).length };
    });
    if (q) convs = convs.filter((x) => `${x.c.participantIds.map(nameOf).join(' ')} ${about(x.c)} ${x.c.id}`.toLowerCase().includes(q));
    if (flag === 'flagged') convs = convs.filter((x) => x.flagged);
    if (flag === 'masked') convs = convs.filter((x) => x.masked);
    convs.sort((a, b) => b.flagged - a.flagged || b.last.localeCompare(a.last));
    return html`
      ${head({ title: 'Conversations', sub: 'Who talks to whom, about what, and whether anything was flagged. Message text stays private until you open a conversation with a reason.' })}
      ${filters('/conversations', [
        { name: 'q', type: 'search', label: 'Search', value: ctx.query.q, placeholder: 'Participant or task' },
        { name: 'flag', type: 'select', label: 'Show', value: flag, options: [{ value: '', label: 'All conversations' }, { value: 'flagged', label: 'With open flags' }, { value: 'masked', label: 'Contact details were masked' }] },
      ])}
      ${table({
        label: 'Conversations',
        cols: [{ label: 'Between' }, { label: 'About' }, { label: 'Messages', cls: 'bo-num' }, { label: 'Signals' }, { label: 'Last message' }],
        rows: convs.map((x) => ({
          cls: x.flagged ? 'bo-row--late' : '',
          cells: [html`<a href="#/conversations/${x.c.id}">${x.c.participantIds.map(nameOf).join(' ↔ ')}</a>`, about(x.c), x.msgs.length,
            html`${x.flagged ? badge(`${x.flagged} flagged`, 'danger', 'alert') : ''}${x.masked ? badge(`${x.masked} masked`, 'warn') : ''}${x.hidden ? badge(`${x.hidden} hidden`, 'neutral') : ''}${!x.flagged && !x.masked && !x.hidden ? html`<span class="muted">—</span>` : ''}`,
            ago(x.last)],
        })),
        empty: 'No conversations match.',
      })}`;
  },
};

export const conversation = {
  title: () => 'Conversation',
  render(ctx) {
    const c = conversationById(ctx.params.id);
    if (!c) return html`${head({ title: 'Conversation not found', back: { href: '/conversations', label: 'Conversations' } })}`;
    const open = BO.hasConversationAccess(ctx.staff.id, c.id);
    const msgs = messagesOf(c.id);
    const mod = can(ctx.staff, 'content.moderate');
    const access = (getState().accessLog || []).filter((a) => a.conversationId === c.id);
    const events = getState().activity.filter((e) => e.targetType === 'conversation' && e.targetId === c.id);
    return html`
      ${head({ eyebrow: `Conversation · ${c.id}`, title: c.participantIds.map(nameOf).join(' ↔ '), back: { href: '/conversations', label: 'Conversations' }, sub: html`About ${c.contextType === 'task' ? html`<a href="#/tasks/${c.contextId}">${about(c)}</a>` : about(c)} · ${msgs.length} messages · started ${fmt.day(c.createdAt)}` })}
      <div class="bo-grid bo-grid--case">
        <div class="bo-col">
          ${open ? section('Messages', html`<ul class="bo-chat">${msgs.map((m) => html`<li class="bo-msg${m.flags?.length && !m.flagsReviewedAt ? ' bo-msg--hl' : ''}${m.hidden ? ' bo-msg--hidden' : ''}">
              <p class="bo-msg__meta"><strong>${m.senderId ? nameOf(m.senderId) : 'System'}</strong> · ${when(m.createdAt)}${m.masked ? ' · contact details masked' : ''}${m.simulated ? ' · demo reply' : ''}${m.hidden ? ` · hidden${m.hiddenReason ? `: ${m.hiddenReason}` : ''}` : ''}</p>
              <p>${m.body}</p>
              ${m.flags?.length ? html`<p class="bo-row">${flagChips(m.flags, flagLabel)}${m.flagsReviewedAt ? badge('reviewed', 'success') : ''}</p>` : ''}
              ${mod && !m.system ? html`<p class="bo-row">${btn(m.hidden ? 'Restore' : 'Hide', 'bo-msg-hide', { id: m.id, hidden: m.hidden ? '0' : '1' }, { tone: 'ghost', ic: 'eye' })}${m.flags?.length && !m.flagsReviewedAt && !m.hidden ? btn('Looks fine', 'bo-clear-msg-flags', { id: m.id }, { tone: 'ghost' }) : ''}${m.senderId ? btn('Warn sender', 'bo-warn', { id: m.senderId }, { tone: 'ghost', ic: 'alert' }) : ''}</p>` : ''}
            </li>`)}</ul><p class="bo-fine">${icon('lock', 14)}Your access is logged and ends ${BO.ACCESS_MINUTES} minutes after you opened it.</p>`)
            : section('Private conversation', html`${notice({ tone: 'info', title: 'Message text is hidden', body: 'Staff read private messages only when a case needs it. Opening asks for a reason; your name, the time and the reason are logged and visible in the audit log.' })}
              <p>${msgs.length} messages · ${msgs.filter((m) => m.flags?.length).length} flagged · ${msgs.filter((m) => m.masked).length} with contact details masked.</p>
              ${can(ctx.staff, 'messages.read') ? btn('Open with a reason', 'bo-open-conv', { id: c.id }, { tone: 'primary', ic: 'lock' }) : html`<p class="bo-fine">${icon('lock', 14)}Your role cannot open private conversations.</p>`}`)}
        </div>
        <div class="bo-col">
          ${section('People', html`<ul class="bo-list">${c.participantIds.map((p) => html`<li>${person(userById(p), { sub: userById(p)?.email })}</li>`)}</ul>`)}
          ${section('Who opened it', table({ dense: true, label: 'Access log', cols: [{ label: 'Staff' }, { label: 'Reason' }, { label: 'When' }], rows: access.map((a) => [nameOf(a.staffId), a.reason, ago(a.createdAt)]), empty: 'Nobody on the team has opened it.' }))}
          ${section('History', timeline(events, { limit: 30 }))}
        </div>
      </div>`;
  },
};

export const reviews = {
  title: () => 'Reviews',
  render(ctx) {
    const s = getState();
    const { stars = '', status = '', q = '' } = ctx.query;
    let list = s.reviews.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (stars === 'low') list = list.filter((r) => r.stars <= 2);
    else if (stars) list = list.filter((r) => r.stars === Number(stars));
    if (status) list = list.filter((r) => (status === 'private' ? r.visibility === 'private' : r.status === status));
    if (q) list = list.filter((r) => `${nameOf(r.reviewerId)} ${nameOf(r.revieweeId)} ${r.comment} ${r.taskTitle}`.toLowerCase().includes(q.toLowerCase()));
    const focus = ctx.query.focus;
    if (focus) list.sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));
    const mod = can(ctx.staff, 'content.moderate');
    const limit = Number(ctx.query.limit) || 60;
    return html`
      ${head({ title: 'Reviews', sub: `${s.reviews.length} reviews. Removing one takes it off the profile and out of the ratings; the reviewer is told why.` })}
      ${filters('/reviews', [
        { name: 'q', type: 'search', label: 'Search', value: q, placeholder: 'Name, task or text' },
        { name: 'stars', type: 'select', label: 'Stars', value: stars, options: [{ value: '', label: 'Any rating' }, { value: 'low', label: '1–2 stars' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} stars` }))] },
        { name: 'status', type: 'select', label: 'Status', value: status, options: [{ value: '', label: 'Any status' }, { value: 'published', label: 'Published' }, { value: 'removed', label: 'Removed by staff' }, { value: 'private', label: 'Private feedback' }] },
      ])}
      <p class="bo-count">${list.length} reviews${list.length > limit ? `, showing ${limit}` : ''}</p>
      ${table({
        label: 'Reviews',
        cols: [{ label: 'Stars' }, { label: 'Review' }, { label: 'From' }, { label: 'About' }, { label: 'Status' }, { label: 'Date' }, { label: '' }],
        rows: list.slice(0, limit).map((r) => ({
          cls: r.id === focus ? 'bo-row--focus' : '',
          cells: [html`<span class="bo-stars" aria-label="${r.stars} of 5">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>`, html`<strong>${r.taskTitle}</strong><span class="bo-cell-sub">${r.comment || '(no comment)'}</span>${r.tags?.length ? html`<span class="bo-cell-sub">${r.tags.join(' · ')}</span>` : ''}`,
            person(userById(r.reviewerId)), person(userById(r.revieweeId)),
            r.status === 'removed' ? badge('Removed', 'danger') : r.visibility === 'private' ? badge('Private', 'neutral') : badge('Public', 'success'),
            fmt.day(r.createdAt), mod ? btn(r.status === 'removed' ? 'Restore' : 'Remove', 'bo-review-toggle', { id: r.id }, { tone: r.status === 'removed' ? 'secondary' : 'ghost' }) : ''],
        })),
        empty: 'No reviews match.',
      })}
      ${list.length > limit ? html`<p class="bo-center"><a class="btn btn--secondary btn--sm" href="#/reviews?${new URLSearchParams({ ...ctx.query, limit: String(limit + 100) })}">Show more</a></p>` : ''}`;
  },
};
