// Tasks: list with filters, and a full task page with applicants, the job, money, chats and history.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { badge, statusBadge, catLabel, notice } from '../../ui/components.js';
import { getState } from '../../store.js';
import { userById, taskById, applicationsForTask, assignmentForTask, reportsOn, disputeForAssignment } from '../../select.js';
import { can } from '../../logic/staff.js';
import { flagLabel, isHighRisk } from '../../logic/flags.js';
import { TASK_STATUS } from '../../logic/status.js';
import { CATEGORIES } from '../../data/categories.js';
import { CITIES, areaLabel } from '../../data/geo.js';
import { fmt } from '../../i18n.js';
import * as BO from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { notesFor, reasonLabel } from '../data.js';
import { concernsTask } from '../events.js';
import { head, table, person, filters, timeline, notesPanel, section, kv, btn, flagChips, decisionDialog, REASON, when, ago, money, staffChip } from '../ui.js';

export const list = {
  title: () => 'Tasks',
  render(ctx) {
    const q = String(ctx.query.q || '').trim().toLowerCase();
    const { status = '', cat = '', city = '', flag = '' } = ctx.query;
    let ts = getState().tasks.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (q) ts = ts.filter((t) => `${t.title} ${t.description} ${t.id} ${userById(t.clientId)?.name || ''}`.toLowerCase().includes(q));
    if (status === 'live') ts = ts.filter((t) => t.status === 'open' && !t.hidden);
    else if (status === 'active') ts = ts.filter((t) => ['assigned', 'in_progress', 'awaiting_confirmation'].includes(t.status));
    else if (status === 'hidden') ts = ts.filter((t) => t.hidden);
    else if (status) ts = ts.filter((t) => t.status === status);
    if (cat) ts = ts.filter((t) => t.category === cat);
    if (city) ts = ts.filter((t) => t.locationArea?.city === city);
    if (flag === 'any') ts = ts.filter((t) => t.flags?.length);
    if (flag === 'high') ts = ts.filter((t) => isHighRisk(t.flags));
    if (flag === 'reported') ts = ts.filter((t) => reportsOn('task', t.id).length);
    return html`
      ${head({ title: 'Tasks', sub: 'Every task on the platform, including hidden, declined and cancelled ones.' })}
      ${filters('/tasks', [
        { name: 'q', type: 'search', label: 'Search', value: ctx.query.q, placeholder: 'Title, description, client or id' },
        { name: 'status', type: 'select', label: 'Status', value: status, options: [{ value: '', label: 'Any status' }, { value: 'live', label: 'Live (open, visible)' }, { value: 'active', label: 'Job in progress' }, { value: 'hidden', label: 'Hidden by staff' }, ...Object.entries(TASK_STATUS).filter(([k]) => k !== 'draft').map(([k, v]) => ({ value: k, label: v.label }))] },
        { name: 'cat', type: 'select', label: 'Category', value: cat, options: [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.label }))] },
        { name: 'city', type: 'select', label: 'City', value: city, options: [{ value: '', label: 'All cities' }, ...CITIES.map((c) => ({ value: c.id, label: c.label }))] },
        { name: 'flag', type: 'select', label: 'Risk', value: flag, options: [{ value: '', label: 'Any' }, { value: 'any', label: 'Flagged' }, { value: 'high', label: 'High risk' }, { value: 'reported', label: 'Reported' }] },
      ])}
      <p class="bo-count">${ts.length} tasks</p>
      ${table({
        label: 'Tasks',
        cols: [{ label: 'Task' }, { label: 'Client' }, { label: 'Status' }, { label: 'Budget', cls: 'bo-num' }, { label: 'Applicants', cls: 'bo-num' }, { label: 'Risk' }, { label: 'Posted' }],
        rows: ts.map((t) => ({
          cls: isHighRisk(t.flags) && !t.flagsReviewedAt && !t.hidden ? 'bo-row--late' : '',
          cells: [
            html`<a href="#/tasks/${t.id}"><strong>${t.title}</strong></a><span class="bo-cell-sub">${catLabel(t.category, { plain: true })} · ${t.locationArea ? areaLabel(t.locationArea, { withCode: false }) : ''}</span>`,
            person(userById(t.clientId)),
            html`${statusBadge('task', t.status)}${t.hidden ? html` ${badge('Hidden', 'neutral', 'eye')}` : ''}`,
            fmt.range(t.budgetMin, t.budgetMax),
            applicationsForTask(t.id).filter((a) => a.status !== 'withdrawn').length,
            html`${t.flags?.length ? flagChips(t.flags.slice(0, 2), flagLabel) : ''}${reportsOn('task', t.id).length ? badge(`${reportsOn('task', t.id).length} reports`, 'danger', 'flag') : ''}${!t.flags?.length && !reportsOn('task', t.id).length ? html`<span class="muted">—</span>` : ''}`,
            fmt.day(t.createdAt),
          ],
        })),
        empty: 'No tasks match these filters.',
      })}`;
  },
};

export const detail = {
  title: (ctx) => taskById(ctx.params.id)?.title || 'Task',
  render(ctx) {
    const t = taskById(ctx.params.id);
    if (!t) return html`${head({ title: 'Task not found', back: { href: '/tasks', label: 'Tasks' } })}`;
    const s = getState();
    const apps = applicationsForTask(t.id);
    const asg = assignmentForTask(t.id);
    const dispute = asg && disputeForAssignment(asg.id);
    const convs = s.conversations.filter((c) => c.contextType === 'task' && c.contextId === t.id);
    const txs = s.walletTransactions.filter((x) => x.relatedTaskId === t.id);
    const reports = reportsOn('task', t.id);
    const events = s.activity.filter((e) => concernsTask(e, t.id));
    const mod = can(ctx.staff, 'content.moderate');
    const rev = can(ctx.staff, 'tasks.review');
    const closed = ['completed', 'cancelled', 'not_approved'].includes(t.status);
    return html`
      ${head({
        eyebrow: `Task · ${t.id}`, title: t.title, back: { href: '/tasks', label: 'Tasks' },
        sub: html`${catLabel(t.category)} ${statusBadge('task', t.status)} ${t.hidden ? badge('Hidden', 'neutral', 'eye') : ''} <a href="index.html#/tasks/${t.id}" target="_blank" rel="noopener">View in the app ${icon('chevron', 14)}</a>`,
        actions: html`
          ${t.status === 'under_review' ? html`<a class="btn btn--primary btn--sm" href="#/case/task_review/${t.id}">Review for approval</a>` : ''}
          ${t.flags?.length && !t.flagsReviewedAt && t.status === 'open' && mod ? btn('Clear flags', 'bo-clear-task-flags', { id: t.id }) : ''}
          ${rev ? btn('Edit', 'bo-task-edit', { id: t.id }, { ic: 'file' }) : ''}
          ${mod ? btn(t.hidden ? 'Make visible' : 'Hide', 'bo-task-hide', { id: t.id }, { tone: t.hidden ? 'secondary' : 'danger', ic: 'eye' }) : ''}
          ${rev && !closed && t.status !== 'disputed' ? btn('Cancel task', 'bo-task-cancel', { id: t.id }, { tone: 'danger', ic: 'x' }) : ''}
          ${dispute?.status === 'open' ? html`<a class="btn btn--danger btn--sm" href="#/case/dispute/${dispute.id}">Open dispute</a>` : ''}
          ${t.status === 'completed' && can(ctx.staff, 'money.refund') ? btn('Goodwill refund…', 'bo-task-refund', { id: t.id }, { tone: 'ghost', ic: 'euro' }) : ''}`,
      })}
      ${t.hidden ? notice({ tone: 'neutral', title: 'Hidden', body: t.hiddenReason ? `Reason: ${t.hiddenReason}` : 'Only the client and staff can see it.' }) : ''}
      ${t.cancelledByStaff ? notice({ tone: 'warn', title: 'Cancelled by staff', body: html`${t.cancelReason} · ${staffChip(t.cancelledByStaff)}` }) : ''}
      <div class="bo-grid bo-grid--case">
        <div class="bo-col">
          ${section('Details', html`<p class="bo-prewrap">${t.description}</p>
            ${t.requirements?.length ? html`<p><strong>Requirements</strong></p><ul class="bo-list">${t.requirements.map((r) => html`<li>${r}</li>`)}</ul>` : ''}
            ${t.safetyNotes ? html`<p><strong>Safety notes:</strong> ${t.safetyNotes}</p>` : ''}
            ${kv([['Client', person(userById(t.clientId))], ['Area', t.locationArea ? areaLabel(t.locationArea) : null], ['Exact address', t.exactAddress || '—'], ['When', `${fmt.date(t.date)} · ${fmt.window(t.timeWindow)}`], ['Hours', t.estimatedHours], ['Budget', fmt.range(t.budgetMin, t.budgetMax)], ['Recurring', t.recurring], ['Posted', when(t.createdAt)], ['Review note', t.reviewNote]])}
            ${t.flags?.length ? html`<p class="bo-row"><strong>Automatic flags${t.flagsReviewedAt ? ' (reviewed)' : ''}:</strong> ${flagChips(t.flags, flagLabel)}</p>` : ''}
            ${t.editHistory?.length ? html`<details class="disclosure"><summary>Edited by staff ${t.editHistory.length}×</summary><div class="disclosure__body">${t.editHistory.map((h) => html`<p class="bo-fine">${staffChip(h.by)} · ${when(h.at)} · ${h.reason}</p><blockquote class="bo-quote">${h.before.title}<br>${h.before.description}</blockquote>`)}</div></details>` : ''}`)}
          ${section(`Applicants (${apps.length})`, table({ dense: true, label: 'Applicants', cols: [{ label: 'Tasker' }, { label: 'Offer', cls: 'bo-num' }, { label: 'Note' }, { label: 'Status' }, { label: 'Sent' }],
            rows: apps.map((a) => [person(userById(a.taskerId)), fmt.money0(a.proposedRate), html`<span class="bo-cell-sub">${a.note}</span>`, statusBadge('application', a.status), ago(a.createdAt)]), empty: 'No applications.' }))}
          ${asg ? section('Job', kv([['Tasker', person(userById(asg.taskerId))], ['Status', statusBadge('assignment', asg.status)], ['Agreed price', money(asg.agreedPrice)], ['Payment', statusBadge('payment', asg.paymentStatus)], ['Accepted', when(asg.acceptedAt)], ['Started', when(asg.startedAt)], ['Completed', when(asg.completedAt)], ['Address shared', asg.addressShared ? 'Yes' : 'No'], ['Cancel reason', asg.cancelReason]])) : ''}
          ${txs.length ? section('Money (demo)', table({ dense: true, label: 'Money', cols: [{ label: 'Who' }, { label: 'Type' }, { label: 'Amount', cls: 'bo-num' }, { label: 'Fee', cls: 'bo-num' }, { label: 'Status' }, { label: 'Date' }], rows: txs.map((x) => [person(userById(x.userId)), x.goodwill ? 'goodwill refund' : x.type, money(x.amount), money(x.fee), statusBadge('tx', x.status), fmt.day(x.createdAt)]) })) : ''}
          ${section(`Conversations (${convs.length})`, convs.length ? html`<ul class="bo-list">${convs.map((c) => html`<li><a href="#/conversations/${c.id}">${c.participantIds.map((p) => userById(p)?.name).join(' ↔ ')}</a> · ${s.messages.filter((m) => m.conversationId === c.id).length} messages${s.messages.some((m) => m.conversationId === c.id && m.flags?.length) ? html` ${badge('flagged', 'danger')}` : ''}</li>`)}</ul>` : html`<p class="bo-empty">No conversations.</p>`)}
          ${reports.length ? section(`Reports (${reports.length})`, html`<ul class="bo-list">${reports.map((r) => html`<li><a href="#/case/report/${r.id}">${reasonLabel(r.reason)}</a> by ${userById(r.reporterId)?.name} · ${statusBadge('report', r.status)}</li>`)}</ul>`) : ''}
        </div>
        <div class="bo-col">
          ${notesPanel('task', t.id, notesFor('task', t.id), can(ctx.staff, 'cases.work'))}
          ${section('History', timeline(events, { limit: 40 }))}
        </div>
      </div>`;
  },
};

const done = (res, msg) => { toast(res?.ok ? msg : res?.message || 'That did not work.', res?.ok ? 'success' : 'danger'); return res?.ok; };

export const actions = {
  async 'bo-task-cancel'(el, e, ctx) {
    const t = taskById(el.dataset.id);
    const asg = assignmentForTask(t.id);
    const res = await decisionDialog({ title: 'Cancel this task', intro: html`<p>Staff override. Open applications are declined${asg && asg.status !== 'cancelled' && asg.status !== 'completed' ? ', the job is cancelled and the reserved payment is refunded (demo)' : ''}. Everyone involved is told why.</p>`, fields: [REASON('Reason for the people involved')], confirmLabel: 'Cancel task', tone: 'danger', run: (v) => BO.cancelTaskByStaff(ctx.staff.id, t.id, v.reason) });
    if (res) done(res, 'Task cancelled.');
  },
  async 'bo-task-refund'(el, e, ctx) {
    const t = taskById(el.dataset.id);
    const res = await decisionDialog({ title: 'Goodwill refund to the client', intro: html`<p>Paid by the platform; the tasker keeps their earning.</p>`, fields: [{ name: 'amount', label: 'Amount (€)', type: 'number', step: '0.01' }, REASON('Reason for the client')], confirmLabel: 'Refund', run: (v) => BO.refundClient(ctx.staff.id, t.id, v.amount, v.reason) });
    if (res) done(res, 'Refund issued (demo).');
  },
};
