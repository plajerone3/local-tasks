// Reports, blocks, disputes and moderation.
// Principle: a report never deletes or hides anything by itself. A moderator decides.
// A dispute pauses ratings and payments so nobody is penalised automatically.
import { update } from '../store.js';
import { assignmentById, taskById, userById, firstName, disputeForAssignment, reportById, isBlocked, proofById } from '../select.js';
import { uid, nowIso } from '../util.js';
import { validateReport, validateDispute, hasErrors } from '../logic/validation.js';
import { move, canMove } from '../logic/status.js';
import { ok, fail, notify, notifyModerators, short, audit } from './common.js';

export const REPORT_REASONS = [
  { id: 'scam', label: 'Scam, fraud or suspicious payment request' },
  { id: 'unsafe', label: 'Unsafe or illegal activity' },
  { id: 'harassment', label: 'Harassment, threats or abuse' },
  { id: 'discrimination', label: 'Discrimination or unfair treatment' },
  { id: 'inaccurate', label: 'Inaccurate or misleading information' },
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'other', label: 'Something else' },
];

export const DISPUTE_REASONS = [
  { id: 'not_done', label: 'The work was not done as agreed' },
  { id: 'damage', label: 'Something was damaged or lost' },
  { id: 'no_show', label: 'Someone did not show up' },
  { id: 'payment', label: 'Disagreement about the price' },
  { id: 'other', label: 'Something else' },
];

export const TARGET_LABEL = { task: 'task', user: 'profile', message: 'message', assignment: 'assignment', conversation: 'conversation' };

export function createReport(reporterId, d) {
  const errors = validateReport(d);
  if (hasErrors(errors)) return fail(errors);
  const id = uid('rp');
  update((s) => {
    s.reports.unshift({ id, reporterId, targetType: d.targetType, targetId: d.targetId, reason: d.reason, details: d.details.trim(), status: 'pending_review', decision: null, createdAt: nowIso(), resolvedAt: null });
    notifyModerators(s, `New report about a ${TARGET_LABEL[d.targetType] || 'item'}: ${d.reason}.`, '/moderation?tab=reports', reporterId);
    audit(s, reporterId, 'report_created', id);
  });
  if (d.alsoBlock && d.blockUserId) blockUser(reporterId, d.blockUserId);
  return ok({ id });
}

export function blockUser(blockerId, blockedId) {
  if (!blockedId || blockerId === blockedId) return fail({}, 'You cannot block yourself.');
  if (isBlocked(blockerId, blockedId)) return ok();
  update((s) => { s.blocks.push({ blockerId, blockedId, createdAt: nowIso() }); });
  return ok();
}

export function unblockUser(blockerId, blockedId) {
  update((s) => { s.blocks = s.blocks.filter((b) => !(b.blockerId === blockerId && b.blockedId === blockedId)); });
  return ok();
}

export function openDispute(asgId, userId, d) {
  const asg = assignmentById(asgId);
  const task = asg && taskById(asg.taskId);
  if (!asg || (asg.taskerId !== userId && task.clientId !== userId)) return fail({}, 'Only the people on this task can open a dispute.');
  if (!canMove('assignment', asg.status, 'disputed')) return fail({}, 'A dispute can only be opened on an active assignment.');
  const errors = validateDispute(d);
  if (hasErrors(errors)) return fail(errors);
  const other = asg.taskerId === userId ? task.clientId : asg.taskerId;
  update((s) => {
    const x = s.assignments.find((y) => y.id === asgId);
    x.previousStatus = x.status;
    move('assignment', x, 'disputed');
    x.paymentStatus = 'on_hold_demo';
    s.tasks.find((y) => y.id === task.id).status = 'disputed';
    for (const tx of s.walletTransactions.filter((t) => t.relatedTaskId === task.id && t.status === 'pending')) tx.status = 'on_hold';
    s.disputes.push({ id: uid('dp'), assignmentId: asgId, openedBy: userId, reason: d.reason, details: d.details.trim(), status: 'open', outcome: null, createdAt: nowIso(), resolvedAt: null });
    notify(s, other, `${firstName(userById(userId))} opened a dispute on “${short(task.title)}”. Ratings and payments are paused while it is open.`, `/assignments/${asgId}`, userId);
    notifyModerators(s, `Dispute opened on “${short(task.title)}”.`, '/moderation?tab=disputes', userId);
  });
  return ok();
}

// ---------- Moderator actions ----------

const isMod = (uid_) => userById(uid_)?.roles.includes('moderator');

export function resolveReport(reportId, modId, decision, note = '') {
  if (!isMod(modId)) return fail({}, 'Only moderators can do this.');
  const r = reportById(reportId);
  if (!r) return fail({}, 'Report not found.');
  update((s) => {
    const x = s.reports.find((y) => y.id === reportId);
    x.status = 'resolved';
    x.decision = decision;
    x.note = note;
    x.resolvedAt = nowIso();
    if (decision === 'hidden') {
      const coll = { task: 'tasks', message: 'messages' }[x.targetType];
      const item = coll && s[coll].find((y) => y.id === x.targetId);
      if (item) item.hidden = true;
    }
    notify(s, x.reporterId, `A moderator reviewed your report. Outcome: ${DECISION_LABEL[decision] || decision}.`, '/safety', modId);
    audit(s, modId, `report_${decision}`, reportId);
  });
  return ok();
}

export const DECISION_LABEL = { no_action: 'no action needed', hidden: 'content hidden', warning: 'warning sent' };

export function reviewProof(proofId, modId, decision) {
  if (!isMod(modId)) return fail({}, 'Only moderators can do this.');
  const p = proofById(proofId);
  if (!p) return fail({}, 'Proof not found.');
  update((s) => {
    const x = s.proofItems.find((y) => y.id === proofId);
    x.status = decision === 'verified' ? 'verified' : 'rejected';
    x.reviewedAt = nowIso();
    notify(s, x.taskerId, decision === 'verified' ? `A moderator checked “${x.label}” (demo check).` : `A moderator could not confirm “${x.label}”. You can upload a clearer copy.`, '/profile/edit', modId);
    audit(s, modId, `proof_${x.status}`, proofId);
  });
  return ok();
}

export function reviewTask(taskId, modId, decision, note = '') {
  if (!isMod(modId)) return fail({}, 'Only moderators can do this.');
  const t = taskById(taskId);
  if (!t || t.status !== 'under_review') return fail({}, 'This task is not waiting for review.');
  update((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    move('task', x, decision === 'approve' ? 'open' : 'not_approved');
    x.reviewNote = note || null;
    notify(s, x.clientId, decision === 'approve' ? `“${short(x.title)}” was approved and is now open for applications.` : `“${short(x.title)}” could not be approved. ${note}`.trim(), `/tasks/${taskId}`, modId);
    audit(s, modId, `task_${decision}`, taskId);
  });
  return ok();
}

/** outcome: 'release' (pay tasker), 'refund' (refund client), 'resume' (continue the work) */
export function resolveDispute(asgId, modId, outcome, note = '') {
  if (!isMod(modId)) return fail({}, 'Only moderators can do this.');
  const d = disputeForAssignment(asgId);
  const asg = assignmentById(asgId);
  if (!d || d.status !== 'open' || asg.status !== 'disputed') return fail({}, 'There is no open dispute here.');
  update((s) => {
    const dispute = s.disputes.find((y) => y.id === d.id);
    const x = s.assignments.find((y) => y.id === asgId);
    const task = s.tasks.find((y) => y.id === x.taskId);
    const txs = s.walletTransactions.filter((t) => t.relatedTaskId === task.id && t.status === 'on_hold');
    dispute.status = 'resolved';
    dispute.outcome = outcome;
    dispute.note = note;
    dispute.resolvedAt = nowIso();
    if (outcome === 'release') {
      move('assignment', x, 'completed');
      x.completedAt = nowIso();
      x.paymentStatus = 'released_demo';
      task.status = 'completed';
      txs.forEach((t) => { t.status = 'completed'; t.label = t.label.replace('On hold:', t.type === 'payment' ? 'Payment for' : 'Earning for'); });
      const p = s.taskerProfiles.find((y) => y.userId === x.taskerId);
      if (p) p.completedTaskCount += 1;
    } else if (outcome === 'refund') {
      move('assignment', x, 'cancelled');
      x.paymentStatus = 'refunded_demo';
      task.status = 'cancelled';
      txs.forEach((t) => { t.status = 'refunded'; t.label = t.label.replace('On hold:', 'Refunded:'); });
    } else {
      const back = x.previousStatus && x.previousStatus !== 'disputed' ? x.previousStatus : 'in_progress';
      move('assignment', x, back);
      x.paymentStatus = 'reserved_demo';
      task.status = back === 'accepted' ? 'assigned' : back;
      txs.forEach((t) => { t.status = 'pending'; });
    }
    const text = { release: 'the payment was released (demo)', refund: 'the payment was refunded (demo)', resume: 'the task continues' }[outcome];
    for (const uid_ of [x.taskerId, task.clientId]) notify(s, uid_, `The dispute on “${short(task.title)}” was resolved: ${text}.`, `/assignments/${asgId}`, modId);
    audit(s, modId, `dispute_${outcome}`, d.id);
  });
  return ok();
}

export function setCategoryPolicy(catId, policy, modId) {
  if (!isMod(modId)) return fail({}, 'Only moderators can do this.');
  if (!['open', 'review', 'soon'].includes(policy)) return fail({}, 'Unknown policy.');
  update((s) => {
    s.categoryPolicy[catId] = policy;
    audit(s, modId, `category_${policy}`, catId);
  });
  return ok();
}
