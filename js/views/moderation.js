// Moderation console: reports, proof review, restricted-task review, disputes, category policy.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, tabs, statusBadge, badge, emptyState, notice, catLabel, proofBadge, select } from '../ui/components.js';
import { getState } from '../store.js';
import { userById, publicName, taskById, assignmentById, conversationById, me, policyOf, reportById } from '../select.js';
import { CATEGORIES, POLICY } from '../data/categories.js';
import { proofType } from '../data/fields.js';
import { fmt } from '../i18n.js';
import { REPORT_REASONS, DISPUTE_REASONS, DECISION_LABEL, resolveReport, reviewProof, reviewTask, resolveDispute, setCategoryPolicy } from '../services/safety.js';
import { maskContacts } from '../logic/privacy.js';
import { person } from './common.js';
import { toast, confirmDialog } from '../ui/dialog.js';

function targetSummary(r) {
  const s = getState();
  if (r.targetType === 'task') {
    const t = taskById(r.targetId);
    return t ? html`Task: <a href="#/tasks/${t.id}">${t.title}</a>${t.hidden ? ' (hidden)' : ''}` : 'Task (deleted)';
  }
  if (r.targetType === 'user') return html`Profile: <a href="#/profile/${r.targetId}">${publicName(userById(r.targetId))}</a>`;
  if (r.targetType === 'message') {
    const m = s.messages.find((x) => x.id === r.targetId);
    return m ? html`Message from ${publicName(userById(m.senderId))}: “${m.body.slice(0, 120)}”${m.hidden ? ' (hidden)' : ''}` : 'Message';
  }
  if (r.targetType === 'assignment') { const a = assignmentById(r.targetId); return a ? html`Assignment: <a href="#/assignments/${a.id}">${taskById(a.taskId).title}</a>` : 'Assignment'; }
  if (r.targetType === 'conversation') { const c = conversationById(r.targetId); return c ? html`Conversation between ${c.participantIds.map((p) => publicName(userById(p))).join(' and ')}` : 'Conversation'; }
  return 'General report';
}

function reportsTab() {
  const list = getState().reports.slice().sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'pending_review' ? -1 : 1));
  if (!list.length) return emptyState({ ic: 'flag', title: 'No reports' });
  return html`<ul class="mod-list">${list.map((r) => html`<li class="card mod-item">
    <div class="row row--between"><strong>${REPORT_REASONS.find((x) => x.id === r.reason)?.label || r.reason}</strong>${statusBadge('report', r.status)}</div>
    <p class="small">${targetSummary(r)}</p>
    <blockquote class="quote">${r.details}</blockquote>
    <p class="small muted">Reported by ${publicName(userById(r.reporterId))} · ${fmt.relative(r.createdAt)}${r.decision ? ` · decision: ${DECISION_LABEL[r.decision]}` : ''}</p>
    ${r.status === 'pending_review' ? html`<div class="row">
      <button type="button" class="btn btn--secondary btn--sm" data-action="mod-report" data-id="${r.id}" data-decision="no_action">No action needed</button>
      <button type="button" class="btn btn--secondary btn--sm" data-action="mod-report" data-id="${r.id}" data-decision="warning">Send a warning</button>
      ${['task', 'message'].includes(r.targetType) ? html`<button type="button" class="btn btn--danger btn--sm" data-action="mod-report" data-id="${r.id}" data-decision="hidden">Hide content</button>` : ''}
    </div>` : ''}
  </li>`)}</ul>`;
}

function proofTab() {
  const list = getState().proofItems.filter((p) => p.status === 'pending_review');
  if (!list.length) return emptyState({ ic: 'file', title: 'No proof waiting for review' });
  return html`${notice({ tone: 'demo', body: 'Demo: there is no document to inspect. In production, moderators would compare the upload with issuer records and keep an audit trail.' })}
  <ul class="mod-list">${list.map((p) => html`<li class="card mod-item">
    <div class="row row--between">${person(userById(p.taskerId), { sub: proofType(p.type) })}${proofBadge(p.status)}</div>
    <p><strong>${p.label}</strong>${p.fileName ? html` <span class="small muted">· ${p.fileName}</span>` : ''}</p>
    <div class="row"><button type="button" class="btn btn--primary btn--sm" data-action="mod-proof" data-id="${p.id}" data-decision="verified">${icon('check', 16)}Mark as checked (demo)</button><button type="button" class="btn btn--secondary btn--sm" data-action="mod-proof" data-id="${p.id}" data-decision="rejected">Cannot confirm</button></div>
  </li>`)}</ul>`;
}

function tasksTab() {
  const list = getState().tasks.filter((t) => t.status === 'under_review');
  if (!list.length) return emptyState({ ic: 'check', title: 'No tasks waiting for review' });
  return html`<ul class="mod-list">${list.map((t) => html`<li class="card mod-item">
    <div class="row row--between">${catLabel(t.category)}${statusBadge('task', t.status)}</div>
    <h3><a href="#/tasks/${t.id}">${t.title}</a></h3>
    <p class="small">${maskContacts(t.description).text}</p>
    <p class="small muted">By ${publicName(userById(t.clientId))} · ${fmt.relative(t.createdAt)} · ${fmt.range(t.budgetMin, t.budgetMax)}</p>
    <div class="row"><button type="button" class="btn btn--primary btn--sm" data-action="mod-task" data-id="${t.id}" data-decision="approve">Approve and publish</button><button type="button" class="btn btn--secondary btn--sm" data-action="mod-task" data-id="${t.id}" data-decision="decline">Decline</button></div>
  </li>`)}</ul>`;
}

function disputesTab() {
  const list = getState().disputes.slice().sort((a, b) => (a.status === 'open' ? -1 : 1));
  if (!list.length) return emptyState({ ic: 'pause', title: 'No disputes' });
  return html`<ul class="mod-list">${list.map((d) => {
    const a = assignmentById(d.assignmentId);
    const t = taskById(a.taskId);
    return html`<li class="card mod-item">
      <div class="row row--between"><a href="#/assignments/${a.id}"><strong>${t.title}</strong></a>${statusBadge('dispute', d.status)}</div>
      <p class="small">${DISPUTE_REASONS.find((r) => r.id === d.reason)?.label} · opened by ${publicName(userById(d.openedBy))} ${fmt.relative(d.createdAt)} · agreed price ${fmt.money(a.agreedPrice)}</p>
      <blockquote class="quote">${d.details}</blockquote>
      ${d.status === 'open' ? html`<div class="row">
        <button type="button" class="btn btn--primary btn--sm" data-action="mod-dispute" data-id="${a.id}" data-outcome="release">Release payment (demo)</button>
        <button type="button" class="btn btn--secondary btn--sm" data-action="mod-dispute" data-id="${a.id}" data-outcome="refund">Refund client (demo)</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="mod-dispute" data-id="${a.id}" data-outcome="resume">Continue the task</button>
      </div>` : html`<p class="small muted">Outcome: ${d.outcome}</p>`}
    </li>`;
  })}</ul>`;
}

function categoriesTab() {
  return html`${notice({ tone: 'info', body: 'Changing a policy takes effect immediately for new tasks. “Manual review” sends new tasks to this console before they go live. Use “Available” only once the legal, insurance and verification side for that category is settled.' })}
  <div class="table-wrap" role="region" aria-label="Category policies" tabindex="0"><table class="table">
    <thead><tr><th scope="col">Category</th><th scope="col">Current</th><th scope="col">Change to</th></tr></thead>
    <tbody>${CATEGORIES.map((c) => html`<tr><td><span aria-hidden="true">${c.emoji}</span> ${c.label}</td><td>${badge(POLICY[policyOf(c.id)].label, POLICY[policyOf(c.id)].tone)}</td>
      <td>${select({ id: `pol-${c.id}`, name: 'policy', label: `Policy for ${c.label}`, value: policyOf(c.id), options: Object.entries(POLICY).map(([k, v]) => ({ value: k, label: v.label })), extra: { 'data-change': 'mod-policy', 'data-cat': c.id, 'data-no-preserve': true }, cls: 'field--compact field--label-hidden' })}</td></tr>`)}</tbody>
  </table></div>`;
}

export default {
  title: () => 'Moderation',
  render(ctx) {
    if (!ctx.user.roles.includes('moderator')) return html`<div class="wrap page">${notice({ tone: 'warn', title: 'Moderators only' })}</div>`;
    const s = getState();
    const counts = {
      reports: s.reports.filter((r) => r.status === 'pending_review').length,
      proof: s.proofItems.filter((p) => p.status === 'pending_review').length,
      tasks: s.tasks.filter((t) => t.status === 'under_review').length,
      disputes: s.disputes.filter((d) => d.status === 'open').length,
    };
    const tab = ['reports', 'proof', 'tasks', 'disputes', 'categories'].includes(ctx.query.tab) ? ctx.query.tab : 'reports';
    const body = { reports: reportsTab, proof: proofTab, tasks: tasksTab, disputes: disputesTab, categories: categoriesTab }[tab]();
    return html`<div class="wrap page">
      ${pageHead({ eyebrow: 'Safety team', title: 'Moderation', lead: 'Reports never remove content on their own; decisions are made here, by a person, and logged.' })}
      ${tabs([
        { id: 'reports', label: 'Reports', href: '/moderation?tab=reports', count: counts.reports },
        { id: 'proof', label: 'Proof review', href: '/moderation?tab=proof', count: counts.proof },
        { id: 'tasks', label: 'Restricted tasks', href: '/moderation?tab=tasks', count: counts.tasks },
        { id: 'disputes', label: 'Disputes', href: '/moderation?tab=disputes', count: counts.disputes },
        { id: 'categories', label: 'Categories', href: '/moderation?tab=categories' },
      ], tab, { label: 'Moderation queues' })}
      ${body}
    </div>`;
  },
};

export const actions = {
  async 'mod-report'(el) {
    const label = DECISION_LABEL[el.dataset.decision];
    const r = reportById(el.dataset.id);
    if (el.dataset.decision === 'hidden') {
      const yes = await confirmDialog({ title: 'Hide this content?', body: html`<p>It will no longer be shown to others. The owner and moderators can still see it. The reporter is told the outcome.</p>`, confirmLabel: 'Hide content', tone: 'danger' });
      if (!yes) return;
    }
    const res = resolveReport(r.id, me().id, el.dataset.decision);
    toast(res.ok ? `Report closed: ${label}.` : res.message, res.ok ? 'success' : 'danger');
  },
  'mod-proof'(el) {
    const res = reviewProof(el.dataset.id, me().id, el.dataset.decision);
    toast(res.ok ? 'Proof updated. The tasker was notified.' : res.message, res.ok ? 'success' : 'danger');
  },
  'mod-task'(el) {
    const res = reviewTask(el.dataset.id, me().id, el.dataset.decision, el.dataset.decision === 'decline' ? 'Please contact support for details.' : '');
    toast(res.ok ? (el.dataset.decision === 'approve' ? 'Task approved and published.' : 'Task declined.') : res.message, res.ok ? 'success' : 'danger');
  },
  async 'mod-dispute'(el) {
    const text = { release: 'release the demo payment to the tasker and complete the task', refund: 'refund the client and cancel the task', resume: 'put the task back in progress' }[el.dataset.outcome];
    const yes = await confirmDialog({ title: 'Resolve this dispute?', body: html`<p>This will ${text}. Both people are notified. Reviews open again if the task is completed.</p>`, confirmLabel: 'Resolve' });
    if (!yes) return;
    const res = resolveDispute(el.dataset.id, me().id, el.dataset.outcome);
    toast(res.ok ? 'Dispute resolved.' : res.message, res.ok ? 'success' : 'danger');
  },
};

export const changes = {
  'mod-policy'(el) {
    const res = setCategoryPolicy(el.dataset.cat, el.value, me().id);
    toast(res.ok ? 'Category policy updated.' : res.message, res.ok ? 'success' : 'danger');
  },
};

