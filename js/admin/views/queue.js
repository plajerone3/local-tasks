// The work queue and one page per case, with the evidence and the decision buttons.
import { html, raw } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { badge, statusBadge, catLabel, notice, proofBadge } from '../../ui/components.js';
import { getState } from '../../store.js';
import { userById, taskById, assignmentById, conversationById, staffList, businessOf, proofsOf, reportsOn, messagesOf, applicationsForTask } from '../../select.js';
import { can } from '../../logic/staff.js';
import { flagLabel } from '../../logic/flags.js';
import { fmt } from '../../i18n.js';
import { field as fieldById, proofType } from '../../data/fields.js';
import { DISPUTE_REASONS } from '../../services/safety.js';
import * as BO from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { go } from '../../router.js';
import { openCases, KINDS, PRIORITY, reasonLabel, reportOwner, reportTargetText, riskSignals, notesFor } from '../data.js';
import { concernsTask } from '../events.js';
import { head, table, person, staffChip, priorityBadge, dueText, filters, timeline, notesPanel, section, kv, btn, flagChips, decisionDialog, REASON, when, ago, money, standingBadge } from '../ui.js';

// ---------- Queue ----------

export const queue = {
  title: () => 'Work queue',
  render(ctx) {
    const all = openCases();
    const kind = KINDS[ctx.query.kind] ? ctx.query.kind : '';
    const who = ctx.query.who || '';
    const prio = ctx.query.priority || '';
    let list = all;
    if (kind) list = list.filter((c) => c.kind === kind);
    if (who === 'mine') list = list.filter((c) => c.assigneeId === ctx.staff.id);
    if (who === 'unassigned') list = list.filter((c) => !c.assigneeId);
    if (who === 'overdue') list = list.filter((c) => c.overdue);
    if (prio) list = list.filter((c) => c.priority === prio);
    const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, all.filter((c) => c.kind === k).length]));
    return html`
      ${head({ title: 'Work queue', sub: 'Everything waiting for a person: reports, automatic flags, approvals, checks, disputes, payouts and data requests. Most pressing first.' })}
      <nav class="bo-chips" aria-label="Queues">
        <a class="bo-chip" href="#/queue${who ? `?who=${who}` : ''}" ${!kind ? raw('aria-current="page"') : ''}>All <span>${all.length}</span></a>
        ${Object.entries(KINDS).map(([k, v]) => html`<a class="bo-chip${counts[k] ? '' : ' bo-chip--empty'}" href="#/queue?kind=${k}${who ? `&who=${who}` : ''}" ${kind === k ? raw('aria-current="page"') : ''}>${v.label} <span>${counts[k]}</span></a>`)}
      </nav>
      ${filters('/queue', [
        { name: 'who', type: 'select', label: 'Show', value: who, options: [{ value: '', label: 'Everyone’s cases' }, { value: 'mine', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'overdue', label: 'Overdue' }] },
        { name: 'priority', type: 'select', label: 'Priority', value: prio, options: [{ value: '', label: 'Any priority' }, ...Object.entries(PRIORITY).map(([v, p]) => ({ value: v, label: p.label }))] },
      ], kind ? html`<input type="hidden" name="kind" value="${kind}">` : '')}
      ${table({
        label: 'Open cases',
        cols: [{ label: 'Case' }, { label: 'People' }, { label: 'Priority' }, { label: 'Target time' }, { label: 'Owner' }, { label: '', cls: 'bo-num' }],
        rows: list.map((c) => ({
          cls: c.overdue ? 'bo-row--late' : '',
          cells: [
            html`<a href="#${c.href}" class="bo-case-link">${icon(KINDS[c.kind].icon, 16)}<span><strong>${KINDS[c.kind].one}</strong> · ${c.title}<span class="bo-cell-sub">${c.sub} · opened ${ago(c.at)}</span></span></a>`,
            html`${(c.people || []).slice(0, 2).map((id) => person(userById(id)))}`,
            priorityBadge(c.priority),
            dueText(c),
            staffChip(c.assigneeId),
            can(ctx.staff, 'cases.work') && c.assigneeId !== ctx.staff.id ? btn('Take', 'bo-take', { key: c.key }) : '',
          ],
        })),
        empty: who === 'mine' ? 'Nothing is assigned to you.' : 'No open cases here.',
      })}`;
  },
};

// ---------- Case page ----------

function assignBar(ctx, key) {
  const meta = getState().caseMeta?.[key];
  const team = staffList().filter((x) => x.active && can(x, 'cases.work'));
  if (!can(ctx.staff, 'cases.work')) return html`<p class="bo-assign">Owner: ${staffChip(meta?.assigneeId)}</p>`;
  return html`<div class="bo-assign">
    <label for="assign-${key}" class="bo-assign__label">Owner</label>
    <select class="input select" id="assign-${key}" data-change="bo-assign" data-key="${key}" data-no-preserve>
      <option value="">Unassigned</option>
      ${team.map((x) => html`<option value="${x.id}" ${meta?.assigneeId === x.id ? 'selected' : ''}>${x.name}${x.id === ctx.staff.id ? ' (you)' : ''}</option>`)}
    </select>
    ${meta?.assigneeId !== ctx.staff.id ? btn('Take it', 'bo-take', { key }) : ''}
  </div>`;
}

function decisionBox(title, buttons, hint) {
  return html`<section class="bo-card bo-decide" aria-labelledby="decide-h">
    <h2 class="bo-card__title" id="decide-h">${icon('check', 18)}${title}</h2>
    ${hint ? html`<p class="bo-fine">${hint}</p>` : ''}
    <div class="bo-decide__btns">${buttons}</div>
  </section>`;
}

const noPerm = (perm) => html`<p class="bo-fine">${icon('lock', 14)}Your role cannot decide this case (needs “${perm}”).</p>`;

function peopleCard(ids) {
  const people = [...new Set(ids.filter(Boolean))].map(userById).filter(Boolean);
  return section('People involved', html`<ul class="bo-people">${people.map((u) => {
    const sig = riskSignals(u.id);
    return html`<li class="bo-people__item">
      <div class="bo-people__top">${person(u, { sub: u.email })}${standingBadge(u)}</div>
      ${sig.length ? html`<ul class="bo-signals">${sig.map((x) => html`<li>${badge(x.text, x.tone)}</li>`)}</ul>` : html`<p class="bo-fine">No risk signals.</p>`}
    </li>`;
  })}</ul>`);
}

function taskSummary(t) {
  if (!t) return html`<p class="bo-empty">Task not found.</p>`;
  return html`<div class="bo-task-sum">
    <div class="bo-row">${catLabel(t.category)}${statusBadge('task', t.status)}${t.hidden ? badge('Hidden', 'neutral', 'eye') : ''}</div>
    <h3><a href="#/tasks/${t.id}">${t.title}</a></h3>
    <p class="bo-prewrap">${t.description}</p>
    ${t.requirements?.length ? html`<ul class="bo-list">${t.requirements.map((r) => html`<li>${r}</li>`)}</ul>` : ''}
    ${kv([['Budget', fmt.range(t.budgetMin, t.budgetMax)], ['Hours', t.estimatedHours ?? '—'], ['When', `${fmt.date(t.date)} · ${fmt.window(t.timeWindow)}`], ['Posted', when(t.createdAt)]])}
    ${t.flags?.length ? html`<p class="bo-row"><strong>Automatic flags:</strong> ${flagChips(t.flags, flagLabel)}</p><p class="bo-fine">Matched: ${t.flags.map((f) => `“${f.match}”`).join(', ')}</p>` : ''}
  </div>`;
}

function chatPreview(ctx, convId, highlight) {
  const conv = conversationById(convId);
  if (!conv) return '';
  const open = BO.hasConversationAccess(ctx.staff.id, convId);
  return section('Conversation', open
    ? html`<ul class="bo-chat">${messagesOf(convId).map((m) => html`<li class="bo-msg${m.id === highlight ? ' bo-msg--hl' : ''}${m.hidden ? ' bo-msg--hidden' : ''}"><p class="bo-msg__meta"><strong>${m.senderId ? userById(m.senderId)?.name : 'System'}</strong> · ${when(m.createdAt)}${m.hidden ? ' · hidden' : ''}${m.masked ? ' · contact details masked' : ''}</p><p>${m.body}</p></li>`)}</ul><p class="bo-fine">${icon('lock', 14)}Access logged. It expires ${BO.ACCESS_MINUTES} minutes after you opened it.</p>`
    : html`<p>This is a private conversation between ${conv.participantIds.map((p) => userById(p)?.name).join(' and ')}.</p>${can(ctx.staff, 'messages.read') ? btn('Open with a reason', 'bo-open-conv', { id: convId }, { ic: 'lock' }) : noPerm('messages.read')}`,
  { actions: html`<a href="#/conversations/${convId}">Full view</a>` });
}

const CASES = {
  report(ctx, id) {
    const r = getState().reports.find((x) => x.id === id);
    if (!r) return null;
    const owner = reportOwner(r);
    const others = reportsOn(r.targetType, r.targetId).filter((x) => x.id !== r.id);
    const t = r.targetType === 'task' ? taskById(r.targetId) : null;
    const m = r.targetType === 'message' ? getState().messages.find((x) => x.id === r.targetId) : null;
    const canDo = can(ctx.staff, 'content.moderate');
    const open = r.status === 'pending_review';
    return {
      title: reasonLabel(r.reason), status: open ? badge('Waiting for a decision', 'warn') : badge(`Decided: ${r.decision?.replace('_', ' ')}`, 'success'),
      main: html`
        ${section('The report', html`<blockquote class="bo-quote">${r.details}</blockquote>${kv([['About', reportTargetText(r)], ['Reported by', person(userById(r.reporterId))], ['When', when(r.createdAt)], ['Other reports on the same item', others.length || 'None']])}`)}
        ${t ? section('Reported task', taskSummary(t)) : ''}
        ${m ? section('Reported message', html`<blockquote class="bo-quote">${m.body}</blockquote><p class="bo-fine">Sent by ${userById(m.senderId)?.name} · ${when(m.createdAt)}</p>`) : ''}
        ${t ? (() => { const conv = getState().conversations.find((c) => c.contextId === t.id && c.participantIds.includes(r.reporterId)); return conv ? chatPreview(ctx, conv.id) : ''; })() : ''}
      `,
      decide: open ? (canDo ? decisionBox('Decide', html`
        ${btn('No action needed', 'bo-report', { id, d: 'no_action' })}
        ${owner ? btn('Uphold and warn', 'bo-report', { id, d: 'warning' }, { ic: 'alert' }) : ''}
        ${['task', 'message'].includes(r.targetType) ? btn('Uphold and hide content', 'bo-report', { id, d: 'hidden' }, { tone: 'danger', ic: 'eye' }) : ''}
        ${owner ? html`<a class="btn btn--ghost btn--sm" href="#/users/${owner}">${icon('ban', 16)}Restrict or ban the account…</a>` : ''}
      `, 'The reporter is told the outcome. Hiding keeps the content for the owner and staff.') : noPerm('content.moderate')) : section('Decision', kv([['Outcome', r.decision], ['Reason', r.note], ['By', staffChip(r.resolvedBy)], ['When', when(r.resolvedAt)]])),
      people: [r.reporterId, owner],
      events: (e) => (e.targetType === 'report' && e.targetId === id) || (t && concernsTask(e, t.id)),
      noteTarget: ['report', id],
    };
  },

  flagged_task(ctx, id) {
    const t = taskById(id);
    if (!t) return null;
    const canDo = can(ctx.staff, 'content.moderate');
    const conv = getState().conversations.filter((c) => c.contextId === id);
    return {
      title: t.title, status: t.flagsReviewedAt ? badge('Flags reviewed', 'success') : badge('Live with risk signals', 'danger'),
      main: html`${section('Task', taskSummary(t))}
        ${section('Who has interacted', html`<p>${applicationsForTask(id).length} applications · ${conv.length} conversations · ${reportsOn('task', id).length} reports</p>`)}`,
      decide: !t.flagsReviewedAt ? (canDo ? decisionBox('Decide', html`
        ${btn('Looks fine, clear flags', 'bo-clear-task-flags', { id })}
        ${btn('Edit the task', 'bo-task-edit', { id }, { ic: 'file' })}
        ${btn('Hide the task', 'bo-task-hide', { id }, { tone: 'danger', ic: 'eye' })}
        <a class="btn btn--ghost btn--sm" href="#/users/${t.clientId}">${icon('ban', 16)}Act on the poster…</a>
      `, 'Flags come from word lists and the pay check in Settings → Rules. They never hide anything by themselves.') : noPerm('content.moderate')) : '',
      people: [t.clientId],
      events: (e) => concernsTask(e, id),
      noteTarget: ['task', id],
    };
  },

  task_review(ctx, id) {
    const t = taskById(id);
    if (!t) return null;
    const canDo = can(ctx.staff, 'tasks.review');
    return {
      title: t.title, status: statusBadge('task', t.status),
      main: html`${t.autoHeld ? notice({ tone: 'danger', title: 'Held automatically', body: 'The wording matched a high-risk rule, so the task did not go live. Approve only if it is clearly legitimate.' }) : notice({ tone: 'info', title: 'Category in manual review', body: 'This category needs a person to look before tasks go live (Settings → Categories).' })}
        ${section('Task', taskSummary(t))}`,
      decide: t.status === 'under_review' ? (canDo ? decisionBox('Decide', html`
        ${btn('Approve and publish', 'bo-task-review', { id, d: 'approve' }, { tone: 'primary', ic: 'check' })}
        ${btn('Edit first', 'bo-task-edit', { id }, { ic: 'file' })}
        ${btn('Decline', 'bo-task-review', { id, d: 'decline' }, { tone: 'danger' })}
      `, 'The client is notified either way. A decline reason is shown to them.') : noPerm('tasks.review')) : '',
      people: [t.clientId],
      events: (e) => concernsTask(e, id),
      noteTarget: ['task', id],
    };
  },

  flagged_message(ctx, id) {
    const m = getState().messages.find((x) => x.id === id);
    if (!m) return null;
    const canDo = can(ctx.staff, 'content.moderate');
    const conv = conversationById(m.conversationId);
    return {
      title: `Message from ${userById(m.senderId)?.name || 'someone'}`, status: m.hidden ? badge('Hidden', 'neutral') : m.flagsReviewedAt ? badge('Reviewed', 'success') : badge('Flagged', 'danger'),
      main: html`${section('Flagged message', html`<blockquote class="bo-quote">${m.body}</blockquote>
        <p class="bo-row"><strong>Flags:</strong> ${flagChips(m.flags || [], flagLabel)}</p>
        <p class="bo-fine">The flag check ran on the original text. Contact details were ${m.masked ? 'masked before delivery' : 'not masked'}. Matched: ${(m.flags || []).map((f) => `“${f.match}”`).join(', ')}.</p>
        ${kv([['Sent', when(m.createdAt)], ['Conversation about', conv?.contextType === 'task' ? taskById(conv.contextId)?.title : 'recruiting']])}`)}
        ${chatPreview(ctx, m.conversationId, id)}`,
      decide: !m.flagsReviewedAt && !m.hidden ? (canDo ? decisionBox('Decide', html`
        ${btn('Looks fine', 'bo-clear-msg-flags', { id })}
        ${btn('Hide the message', 'bo-msg-hide', { id, hidden: '1' }, { tone: 'danger', ic: 'eye' })}
        ${btn('Warn the sender', 'bo-warn', { id: m.senderId }, { ic: 'alert' })}
      `) : noPerm('content.moderate')) : '',
      people: conv?.participantIds || [m.senderId],
      events: (e) => e.targetType === 'conversation' && e.targetId === m.conversationId,
      noteTarget: ['message', id],
    };
  },

  dispute(ctx, id) {
    const d = getState().disputes.find((x) => x.id === id);
    if (!d) return null;
    const a = assignmentById(d.assignmentId);
    const t = a && taskById(a.taskId);
    const canDo = can(ctx.staff, 'disputes.resolve');
    const conv = t && getState().conversations.find((c) => c.contextId === t.id && c.participantIds.includes(a.taskerId));
    const txs = getState().walletTransactions.filter((x) => x.relatedTaskId === t?.id);
    return {
      title: t?.title || 'Dispute', status: d.status === 'open' ? badge('Open: money on hold', 'danger') : badge(`Resolved: ${d.outcome}`, 'success'),
      main: html`${section('What happened', html`<blockquote class="bo-quote">${d.details}</blockquote>${kv([['Reason', DISPUTE_REASONS.find((x) => x.id === d.reason)?.label], ['Opened by', person(userById(d.openedBy))], ['Opened', when(d.createdAt)], ['Agreed price', money(a.agreedPrice)], ['Tasker', person(userById(a.taskerId))], ['Client', person(userById(t.clientId))]])}`)}
        ${section('Money for this job', table({ dense: true, label: 'Transactions', cols: [{ label: 'Who' }, { label: 'Type' }, { label: 'Amount', cls: 'bo-num' }, { label: 'Fee', cls: 'bo-num' }, { label: 'Status' }], rows: txs.map((x) => [userById(x.userId)?.name, x.type, money(x.amount), money(x.fee), statusBadge('tx', x.status)]) }))}
        ${conv ? chatPreview(ctx, conv.id) : ''}`,
      decide: d.status === 'open' ? (canDo ? decisionBox('Resolve', html`
        ${btn('Release payment to tasker', 'bo-dispute', { id, o: 'release' }, { tone: 'primary' })}
        ${btn('Split the payment…', 'bo-dispute', { id, o: 'partial', price: a.agreedPrice })}
        ${btn('Refund the client', 'bo-dispute', { id, o: 'refund' })}
        ${btn('Let the job continue', 'bo-dispute', { id, o: 'resume' }, { tone: 'ghost' })}
      `, 'Both people are notified with your reason. Reviews open again once the job is completed.') : noPerm('disputes.resolve')) : section('Decision', kv([['Outcome', d.outcome], d.partialAmount ? ['Paid to tasker', money(d.partialAmount)] : null, ['Reason', d.note], ['By', staffChip(d.resolvedBy)], ['When', when(d.resolvedAt)]])),
      people: [a?.taskerId, t?.clientId],
      events: (e) => (e.targetType === 'dispute' && e.targetId === id) || (t && concernsTask(e, t.id)),
      noteTarget: ['dispute', id],
    };
  },

  payout(ctx, id) {
    const tx = getState().walletTransactions.find((x) => x.id === id);
    if (!tx) return null;
    const u = userById(tx.userId);
    const t = taskById(tx.relatedTaskId);
    const net = tx.amount - tx.fee;
    const canDo = can(ctx.staff, 'money.payouts');
    const history = getState().walletTransactions.filter((x) => x.userId === tx.userId && x.type === 'earning' && x.id !== id);
    return {
      title: `${money(net)} to ${u?.name}`, status: badge(tx.payoutStatus === 'held' ? 'On hold' : tx.payoutStatus === 'approved' ? 'Approved' : 'Waiting for approval', tx.payoutStatus === 'held' ? 'danger' : tx.payoutStatus === 'approved' ? 'success' : 'warn'),
      main: html`${section('Payout', kv([['Tasker', person(u)], ['For', t ? html`<a href="#/tasks/${t.id}">${t.title}</a>` : tx.label], ['Earning', money(tx.amount)], ['Platform fee', money(tx.fee)], ['Payout', html`<strong>${money(net)}</strong>`], ['Why it needs a check', tx.payoutCheck === 'first_payout' ? 'First payout for this tasker' : `Over the ${money(getState().settings.payoutApprovalOver)} limit`], ['Completed', when(tx.createdAt)]]))}
        ${section('Earlier payouts', table({ dense: true, label: 'Earlier payouts', cols: [{ label: 'Date' }, { label: 'For' }, { label: 'Net', cls: 'bo-num' }, { label: 'Payout' }], rows: history.map((x) => [fmt.day(x.createdAt), x.label, money(x.amount - x.fee), x.payoutStatus || x.status]), empty: 'No earlier payouts. This is their first.' }))}`,
      decide: tx.payoutStatus === 'awaiting_approval' ? (canDo ? decisionBox('Decide', html`
        ${btn('Approve payout', 'bo-payout', { id, d: 'approved' }, { tone: 'primary', ic: 'check' })}
        ${btn('Put on hold', 'bo-payout', { id, d: 'held' }, { tone: 'danger' })}
      `, 'Demo: approving does not move real money.') : noPerm('money.payouts')) : '',
      people: [tx.userId, t?.clientId],
      events: (e) => (e.targetType === 'transaction' && e.targetId === id) || (t && concernsTask(e, t.id)),
      noteTarget: ['transaction', id],
    };
  },

  identity(ctx, id) {
    const u = userById(id);
    if (!u) return null;
    const canDo = can(ctx.staff, 'users.verify');
    return {
      title: u.name, status: badge(u.verificationStatus === 'pending_review' ? 'ID check pending' : u.verificationStatus, u.verificationStatus === 'verified' ? 'success' : 'warn'),
      main: html`${notice({ tone: 'demo', body: 'Demo: there is no ID document to inspect. In production this would show the identity provider’s result (document check, liveness, name match) and keep the evidence.' })}
        ${section('Account', kv([['Name', u.name], ['Email', u.email], ['Phone', u.phone], ['Area', u.locationArea ? `${u.locationArea.district}, ${u.locationArea.city}` : null], ['Member since', fmt.day(u.createdAt)], ['Languages', (u.languages || []).join(', ')]]))}`,
      decide: u.verificationStatus === 'pending_review' ? (canDo ? decisionBox('Decide', html`${btn('Mark identity as checked', 'bo-identity', { id, d: 'verified' }, { tone: 'primary', ic: 'shieldcheck' })}${btn('Cannot confirm', 'bo-identity', { id, d: 'rejected' }, { tone: 'danger' })}`) : noPerm('users.verify')) : '',
      people: [id],
      events: (e) => e.targetType === 'user' && e.targetId === id,
      noteTarget: ['user', id],
    };
  },

  business(ctx, id) {
    const b = businessOf(id);
    if (!b) return null;
    const canDo = can(ctx.staff, 'users.verify');
    return {
      title: b.companyName, status: badge(b.verifiedStatus === 'pending_review' ? 'Waiting for a check' : b.verifiedStatus, b.verifiedStatus === 'verified' ? 'success' : 'warn'),
      main: html`${notice({ tone: 'demo', body: 'Demo: check the company register (Firmenbuch) and VAT number (UID) by hand. Nothing is looked up automatically.' })}
        ${section('Company', kv([['Company', b.companyName], ['Field', fieldById(b.field)?.label], ['Size', `${b.size} people`], ['Website', b.website], ['Area', b.locationArea ? `${b.locationArea.district}, ${b.locationArea.city}` : null], ['Hiring for', b.hiringIntent?.roles], ['Recruiting', b.recruitingEnabled ? `On since ${fmt.day(b.recruitingConsentAt)}` : 'Off']]))}
        ${section('About', html`<p class="bo-prewrap">${b.description}</p>`)}`,
      decide: b.verifiedStatus === 'pending_review' ? (canDo ? decisionBox('Decide', html`${btn('Mark business as checked', 'bo-business', { id, d: 'verified' }, { tone: 'primary', ic: 'shieldcheck' })}${btn('Cannot confirm', 'bo-business', { id, d: 'rejected' }, { tone: 'danger' })}`) : noPerm('users.verify')) : '',
      people: [id],
      events: (e) => e.targetType === 'user' && e.targetId === id,
      noteTarget: ['user', id],
    };
  },

  proof(ctx, id) {
    const p = getState().proofItems.find((x) => x.id === id);
    if (!p) return null;
    const canDo = can(ctx.staff, 'users.verify');
    const others = proofsOf(p.taskerId).filter((x) => x.id !== id);
    return {
      title: p.label, status: proofBadge(p.status),
      main: html`${notice({ tone: 'demo', body: 'Demo: only the file name is stored. In production, compare the upload with the issuer and keep an audit trail.' })}
        ${section('Proof', kv([['Label', p.label], ['Type', proofType(p.type)], ['File', p.fileName || 'No file name'], ['Visible to', p.visibility], ['Added', when(p.createdAt)], ['Tasker', person(userById(p.taskerId))]]))}
        ${section('Other proof from this tasker', others.length ? html`<ul class="bo-list">${others.map((x) => html`<li>${x.label} ${proofBadge(x.status)}</li>`)}</ul>` : html`<p class="bo-empty">None.</p>`)}`,
      decide: p.status === 'pending_review' ? (canDo ? decisionBox('Decide', html`${btn('Mark as checked (demo)', 'bo-proof', { id, d: 'verified' }, { tone: 'primary', ic: 'check' })}${btn('Cannot confirm', 'bo-proof', { id, d: 'rejected' }, { tone: 'danger' })}`) : noPerm('users.verify')) : '',
      people: [p.taskerId],
      events: (e) => (e.targetType === 'proof' && e.targetId === id),
      noteTarget: ['proof', id],
    };
  },

  data_request(ctx, id) {
    const r = (getState().dataRequests || []).find((x) => x.id === id);
    if (!r) return null;
    const u = userById(r.userId);
    const canDo = can(ctx.staff, 'data.requests');
    return {
      title: `${r.type === 'deletion' ? 'Delete the account of' : 'Data request from'} ${u?.name}`, status: badge(r.status === 'received' ? 'To do' : 'Completed', r.status === 'received' ? 'warn' : 'success'),
      main: html`${section('Request', kv([['Type', r.type], ['From', person(u)], ['Received', when(r.createdAt)], ['Legal deadline', fmt.day(new Date(new Date(r.createdAt).getTime() + 30 * 864e5).toISOString())]]))}
        ${notice({ tone: 'info', body: 'GDPR: answer within one month. Before deleting, check for open jobs, disputes or payouts that must be kept for legal reasons. In this demo, completing anonymises the profile and hides open tasks.' })}
        ${u ? section('Open items to check first', html`<ul class="bo-list"><li>${getState().tasks.filter((t) => t.clientId === u.id && !['completed', 'cancelled', 'not_approved'].includes(t.status)).length} open tasks</li><li>${getState().disputes.filter((d) => d.status === 'open' && [assignmentById(d.assignmentId)?.taskerId, taskById(assignmentById(d.assignmentId)?.taskId)?.clientId].includes(u.id)).length} open disputes</li><li>${getState().walletTransactions.filter((x) => x.userId === u.id && ['pending', 'on_hold'].includes(x.status)).length} pending payments</li></ul>`) : ''}`,
      decide: r.status === 'received' ? (canDo ? decisionBox('Complete', btn('Anonymise and complete', 'bo-data-request', { id }, { tone: 'danger' })) : noPerm('data.requests')) : '',
      people: [r.userId],
      events: (e) => (e.targetType === 'data_request' && e.targetId === id) || (e.targetType === 'user' && e.targetId === r.userId),
      noteTarget: ['data_request', id],
    };
  },
};

export const casePage = {
  title: (ctx) => KINDS[ctx.params.kind]?.one || 'Case',
  render(ctx) {
    const { kind, id } = ctx.params;
    const def = CASES[kind];
    const c = def && def(ctx, id);
    if (!c) return html`${head({ title: 'Case not found', back: { href: '/queue', label: 'Work queue' } })}<p>This case does not exist any more. It may have been reset with the demo data.</p>`;
    const key = `${kind}:${id}`;
    const isOpen = openCases().some((x) => x.key === key);
    const ev = getState().activity.filter(c.events);
    const [nt, nid] = c.noteTarget;
    return html`
      ${head({ eyebrow: `${KINDS[kind].one} · ${id}`, title: c.title, back: { href: '/queue', label: 'Work queue' }, actions: html`${c.status}${isOpen ? (() => { const oc = openCases().find((x) => x.key === key); return html`${priorityBadge(oc.priority)}${dueText(oc)}`; })() : badge('Closed', 'neutral')}` })}
      ${isOpen ? assignBar(ctx, key) : ''}
      <div class="bo-grid bo-grid--case">
        <div class="bo-col">${c.decide || ''}${c.main}</div>
        <div class="bo-col">
          ${peopleCard(c.people)}
          ${notesPanel(nt, nid, notesFor(nt, nid), can(ctx.staff, 'cases.work'))}
          ${section('History', timeline(ev, { limit: 25 }))}
        </div>
      </div>`;
  },
};

// ---------- Handlers ----------

const done = (res, msg) => { toast(res?.ok ? msg : res?.message || 'That did not work.', res?.ok ? 'success' : 'danger'); return res?.ok; };

export const actions = {
  'bo-take'(el, e, ctx) { done(BO.assignCase(ctx.staff.id, el.dataset.key, ctx.staff.id), 'Assigned to you.'); },
  async 'bo-report'(el, e, ctx) {
    const d = el.dataset.d;
    const labels = { no_action: ['Close with no action', 'Optional note for the audit log.'], warning: ['Uphold and warn', 'The owner gets a warning with this reason.'], hidden: ['Uphold and hide', 'The owner is warned and the content is hidden. The reason is logged.'] };
    if (d === 'no_action') {
      const res = await decisionDialog({ title: labels[d][0], fields: [{ name: 'reason', label: 'Note', type: 'textarea', optional: true, hint: labels[d][1] }], confirmLabel: 'Close report', run: (v) => BO.decideReport(ctx.staff.id, el.dataset.id, d, v.reason) });
      if (res) done(res, 'Report closed.');
      return;
    }
    const res = await decisionDialog({ title: labels[d][0], intro: html`<p>${labels[d][1]}</p>`, fields: [REASON('Reason', 'Shown to the owner in the warning.')], confirmLabel: labels[d][0], tone: d === 'hidden' ? 'danger' : 'primary', run: (v) => BO.decideReport(ctx.staff.id, el.dataset.id, d, v.reason) });
    if (res) done(res, 'Report decided.');
  },
  async 'bo-task-review'(el, e, ctx) {
    const d = el.dataset.d;
    if (d === 'approve') { done(BO.decideTaskReview(ctx.staff.id, el.dataset.id, 'approve'), 'Approved and published.'); return; }
    const res = await decisionDialog({ title: 'Decline this task', fields: [REASON('Reason for the client', 'Shown to the client, so keep it clear and polite.')], confirmLabel: 'Decline', tone: 'danger', run: (v) => BO.decideTaskReview(ctx.staff.id, el.dataset.id, 'decline', v.reason) });
    if (res) done(res, 'Task declined.');
  },
  'bo-clear-task-flags'(el, e, ctx) { done(BO.clearTaskFlags(ctx.staff.id, el.dataset.id), 'Flags cleared.'); },
  'bo-clear-msg-flags'(el, e, ctx) { done(BO.clearMessageFlags(ctx.staff.id, el.dataset.id), 'Marked as fine.'); },
  async 'bo-task-hide'(el, e, ctx) {
    const t = taskById(el.dataset.id);
    const hide = !t.hidden;
    const res = await decisionDialog({ title: hide ? 'Hide this task' : 'Make this task visible', intro: html`<p>${hide ? 'Nobody but the client and staff will see it. The client is told why.' : 'It will show in lists again.'}</p>`, fields: [REASON(hide ? 'Reason for the client' : 'Reason')], confirmLabel: hide ? 'Hide task' : 'Make visible', tone: hide ? 'danger' : 'primary', run: (v) => BO.setTaskHidden(ctx.staff.id, el.dataset.id, hide, v.reason) });
    if (res) done(res, hide ? 'Task hidden.' : 'Task visible again.');
  },
  async 'bo-task-edit'(el, e, ctx) {
    const t = taskById(el.dataset.id);
    const res = await decisionDialog({
      title: 'Edit task', intro: html`<p>Use this to remove contact details or misleading wording. The client sees that staff edited it, and the old text is kept.</p>`,
      fields: [{ name: 'title', label: 'Title', value: t.title }, { name: 'description', label: 'Description', type: 'textarea', rows: 6, value: t.description, max: 2000 }, REASON('Reason for the client')],
      confirmLabel: 'Save changes', run: (v) => BO.editTask(ctx.staff.id, t.id, v, v.reason),
    });
    if (res) done(res, 'Task updated.');
  },
  async 'bo-open-conv'(el, e, ctx) {
    const res = await decisionDialog({ title: 'Open a private conversation', intro: html`<p>Staff read private messages only for a case. Your name, the time and the reason are logged and visible to admins.</p>`, fields: [REASON('Why do you need to read it?', 'For example: “Report rp_123: check what was said.”')], confirmLabel: 'Open conversation', run: (v) => BO.openConversation(ctx.staff.id, el.dataset.id, v.reason) });
    if (res) done(res, `Opened for ${BO.ACCESS_MINUTES} minutes.`);
  },
  async 'bo-msg-hide'(el, e, ctx) {
    const hide = el.dataset.hidden === '1';
    const res = await decisionDialog({ title: hide ? 'Hide this message' : 'Restore this message', fields: [REASON(hide ? 'Reason for the sender' : 'Reason')], confirmLabel: hide ? 'Hide message' : 'Restore', tone: hide ? 'danger' : 'primary', run: (v) => BO.setMessageHidden(ctx.staff.id, el.dataset.id, hide, v.reason) });
    if (res) done(res, hide ? 'Message hidden.' : 'Message restored.');
  },
  async 'bo-warn'(el, e, ctx) {
    const res = await decisionDialog({ title: `Warn ${userById(el.dataset.id)?.name}`, intro: html`<p>They get a notification with your reason. Warnings are counted on their profile here.</p>`, fields: [REASON('What they did wrong', 'Shown to the user.')], confirmLabel: 'Send warning', run: (v) => BO.warnUser(ctx.staff.id, el.dataset.id, v.reason) });
    if (res) done(res, 'Warning sent.');
  },
  async 'bo-dispute'(el, e, ctx) {
    const o = el.dataset.o;
    const titles = { release: 'Release the payment to the tasker', refund: 'Refund the client', resume: 'Let the job continue', partial: 'Split the payment' };
    const fields = o === 'partial'
      ? [{ name: 'amount', label: `Amount for the tasker (agreed price ${money(Number(el.dataset.price))})`, type: 'number', step: '0.01', hint: 'The rest of the agreed price is refunded to the client.' }, REASON('Reason for both people')]
      : [REASON('Reason for both people')];
    const res = await decisionDialog({ title: titles[o], fields, confirmLabel: 'Resolve dispute', run: (v) => BO.decideDispute(ctx.staff.id, el.dataset.id, o, v.reason, v.amount) });
    if (res) done(res, 'Dispute resolved.');
  },
  async 'bo-payout'(el, e, ctx) {
    if (el.dataset.d === 'approved') { done(BO.decidePayout(ctx.staff.id, el.dataset.id, 'approved'), 'Payout approved.'); return; }
    const res = await decisionDialog({ title: 'Put this payout on hold', fields: [REASON('Reason for the tasker', 'Shown to the tasker.')], confirmLabel: 'Hold payout', tone: 'danger', run: (v) => BO.decidePayout(ctx.staff.id, el.dataset.id, 'held', v.reason) });
    if (res) done(res, 'Payout on hold.');
  },
  async 'bo-identity'(el, e, ctx) { await verdict(el, ctx, BO.decideIdentity, 'Identity'); },
  async 'bo-business'(el, e, ctx) { await verdict(el, ctx, BO.decideBusiness, 'Business details'); },
  async 'bo-proof'(el, e, ctx) { await verdict(el, ctx, BO.decideProof, 'Proof'); },
  async 'bo-data-request'(el, e, ctx) {
    const res = await decisionDialog({ title: 'Complete this deletion request', intro: html`<p>The profile is anonymised (name, email, phone), the account is closed and open tasks are hidden. Completed jobs, payments and reviews stay for record-keeping. This cannot be undone.</p>`, fields: [], confirmLabel: 'Anonymise and complete', tone: 'danger', run: () => BO.completeDataRequest(ctx.staff.id, el.dataset.id, { anonymise: true }) });
    if (res) { done(res, 'Request completed.'); go('/queue'); }
  },
};

async function verdict(el, ctx, fn, what) {
  if (el.dataset.d === 'verified') { done(fn(ctx.staff.id, el.dataset.id, 'verified'), `${what} marked as checked.`); return; }
  const res = await decisionDialog({ title: `${what}: cannot confirm`, fields: [REASON('Reason for the user', 'Shown to the user, so say what would help.')], confirmLabel: 'Send decision', tone: 'danger', run: (v) => fn(ctx.staff.id, el.dataset.id, 'rejected', v.reason) });
  if (res) done(res, 'Decision sent.');
}

export const changes = {
  'bo-assign'(el, e, ctx) { done(BO.assignCase(ctx.staff.id, el.dataset.key, el.value || null), el.value ? 'Case assigned.' : 'Case unassigned.'); },
};
