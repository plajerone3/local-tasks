// Reports, blocks, disputes and moderation.
// Principle: a report never deletes or hides anything by itself. A moderator decides.
// A dispute pauses ratings and payments so nobody is penalised automatically.
import { tr } from '../i18n.js';
import { update } from '../store.js';
import { assignmentById, taskById, userById, firstName, disputeForAssignment, reportById, isBlocked, proofById } from '../select.js';
import { uid, nowIso } from '../util.js';
import { validateReport, validateDispute, hasErrors } from '../logic/validation.js';
import { move, canMove } from '../logic/status.js';
import { ok, fail, notify, notifyModerators, short, track, queuePayout } from './common.js';
import { getState } from '../store.js';
import { can } from '../logic/staff.js';
import { breakdown } from '../logic/money.js';
import { round2 } from '../util.js';

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
    notifyModerators(s, tr('New report about a {target}: {reason}.', { target: tr(TARGET_LABEL[d.targetType] || 'item'), reason: d.reason }), '/moderation?tab=reports', reporterId);
    track(s, 'report_created', { actorId: reporterId, targetType: 'report', targetId: id, meta: { reason: d.reason, about: d.targetType, aboutId: d.targetId } });
  });
  if (d.alsoBlock && d.blockUserId) blockUser(reporterId, d.blockUserId);
  return ok({ id });
}

export function blockUser(blockerId, blockedId) {
  if (!blockedId || blockerId === blockedId) return fail({}, tr('You cannot block yourself.'));
  if (isBlocked(blockerId, blockedId)) return ok();
  update((s) => {
    s.blocks.push({ blockerId, blockedId, createdAt: nowIso() });
    track(s, 'user_blocked', { actorId: blockerId, targetType: 'user', targetId: blockedId });
  });
  return ok();
}

export function unblockUser(blockerId, blockedId) {
  update((s) => {
    s.blocks = s.blocks.filter((b) => !(b.blockerId === blockerId && b.blockedId === blockedId));
    track(s, 'user_unblocked', { actorId: blockerId, targetType: 'user', targetId: blockedId });
  });
  return ok();
}

export function openDispute(asgId, userId, d) {
  const asg = assignmentById(asgId);
  const task = asg && taskById(asg.taskId);
  if (!asg || (asg.taskerId !== userId && task.clientId !== userId)) return fail({}, tr('Only the people on this task can open a dispute.'));
  if (!canMove('assignment', asg.status, 'disputed')) return fail({}, tr('A dispute can only be opened on an active assignment.'));
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
    const dpId = uid('dp');
    track(s, 'dispute_opened', { actorId: userId, targetType: 'dispute', targetId: dpId, meta: { reason: d.reason, assignmentId: asgId, taskId: task.id } });
    s.disputes.push({ id: dpId, assignmentId: asgId, openedBy: userId, reason: d.reason, details: d.details.trim(), status: 'open', outcome: null, createdAt: nowIso(), resolvedAt: null });
    notify(s, other, tr('{name} opened a dispute on “{title}”. Ratings and payments are paused while it is open.', { name: firstName(userById(userId)), title: short(task.title) }), `/assignments/${asgId}`, userId);
    notifyModerators(s, tr('Dispute opened on “{title}”.', { title: short(task.title) }), '/moderation?tab=disputes', userId);
  });
  return ok();
}

// ---------- Moderator actions ----------
// Callable by an in-app moderator account or by backoffice staff with the right permission.

export const isMod = (actorId, perm = 'content.moderate') => {
  if (userById(actorId)?.roles.includes('moderator')) return true;
  const st = getState().staff?.find((x) => x.id === actorId);
  return can(st, perm);
};

export const DECISION_LABEL = { no_action: 'no action needed', hidden: 'content hidden', warning: 'warning sent' };

/** Who is responsible for the reported item (the person a warning goes to). */
export function reportedOwner(s, r) {
  if (r.targetType === 'user') return r.targetId;
  if (r.targetType === 'task') return s.tasks.find((t) => t.id === r.targetId)?.clientId || null;
  if (r.targetType === 'message') return s.messages.find((m) => m.id === r.targetId)?.senderId || null;
  return null;
}

export function warnIn(s, userId, actorId, reason) {
  const u = s.users.find((x) => x.id === userId);
  if (!u) return;
  u.warningCount = (u.warningCount || 0) + 1;
  notify(s, userId, tr('Our team sent you a warning: {reason} Please follow the community rules; repeated problems can lead to a restriction.', { reason }), '/safety', actorId);
  track(s, 'user_warned', { actorId, targetType: 'user', targetId: userId, reason });
}

export function resolveReport(reportId, modId, decision, note = '') {
  if (!isMod(modId)) return fail({}, tr('Only moderators can do this.'));
  const r = reportById(reportId);
  if (!r) return fail({}, tr('Report not found.'));
  if (r.status !== 'pending_review') return fail({}, tr('This report has already been reviewed.'));
  update((s) => {
    const x = s.reports.find((y) => y.id === reportId);
    x.status = 'resolved';
    x.decision = decision;
    x.note = note;
    x.resolvedAt = nowIso();
    x.resolvedBy = modId;
    if (decision === 'hidden') {
      const coll = { task: 'tasks', message: 'messages' }[x.targetType];
      const item = coll && s[coll].find((y) => y.id === x.targetId);
      if (item) { item.hidden = true; item.hiddenReason = note || 'report'; }
    }
    if (decision === 'warning' || decision === 'hidden') {
      const owner = reportedOwner(s, x);
      if (owner) warnIn(s, owner, modId, note || tr('A report about your content was upheld.'));
    }
    notify(s, x.reporterId, tr('A moderator reviewed your report. Outcome: {outcome}.', { outcome: tr(DECISION_LABEL[decision] || decision) }), '/safety', modId);
    track(s, `report_${decision}`, { actorId: modId, targetType: 'report', targetId: reportId, reason: note || null, meta: { about: x.targetType, aboutId: x.targetId } });
  });
  return ok();
}

export function reviewProof(proofId, modId, decision, note = '') {
  if (!isMod(modId, 'users.verify')) return fail({}, tr('Only moderators can do this.'));
  const p = proofById(proofId);
  if (!p) return fail({}, tr('Proof not found.'));
  update((s) => {
    const x = s.proofItems.find((y) => y.id === proofId);
    x.status = decision === 'verified' ? 'verified' : 'rejected';
    x.reviewedAt = nowIso();
    x.reviewedBy = modId;
    notify(s, x.taskerId, decision === 'verified' ? tr('A moderator checked “{label}” (demo check).', { label: x.label }) : tr('A moderator could not confirm “{label}”. You can upload a clearer copy.', { label: x.label }), '/profile/edit', modId);
    track(s, `proof_${x.status}`, { actorId: modId, targetType: 'proof', targetId: proofId, reason: note || null, meta: { taskerId: x.taskerId, label: x.label } });
  });
  return ok();
}

export function reviewTask(taskId, modId, decision, note = '') {
  if (!isMod(modId, 'tasks.review')) return fail({}, tr('Only moderators can do this.'));
  const t = taskById(taskId);
  if (!t || t.status !== 'under_review') return fail({}, tr('This task is not waiting for review.'));
  update((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    move('task', x, decision === 'approve' ? 'open' : 'not_approved');
    x.reviewNote = note || null;
    x.reviewedBy = modId;
    x.reviewedAt = nowIso();
    if (x.flags?.length) x.flagsReviewedAt = nowIso();
    notify(s, x.clientId, decision === 'approve' ? tr('“{title}” was approved and is now open for applications.', { title: short(x.title) }) : `${tr('“{title}” could not be approved.', { title: short(x.title) })} ${note}`.trim(), `/tasks/${taskId}`, modId);
    track(s, `task_${decision}`, { actorId: modId, targetType: 'task', targetId: taskId, reason: note || null });
  });
  return ok();
}

/**
 * outcome: 'release' (pay tasker), 'refund' (refund client), 'resume' (continue the work),
 * 'partial' (pay the tasker `amount` of the agreed price, refund the rest to the client).
 */
export function resolveDispute(asgId, modId, outcome, note = '', amount = null) {
  if (!isMod(modId, 'disputes.resolve')) return fail({}, tr('Only moderators can do this.'));
  const d = disputeForAssignment(asgId);
  const asg = assignmentById(asgId);
  if (!d || d.status !== 'open' || asg.status !== 'disputed') return fail({}, tr('There is no open dispute here.'));
  if (!['release', 'refund', 'resume', 'partial'].includes(outcome)) return fail({}, tr('Unknown outcome.'));
  const part = round2(Number(String(amount ?? '').replace(',', '.')));
  if (outcome === 'partial' && !(part > 0 && part < asg.agreedPrice)) return fail({ amount: tr('Enter an amount between 0 and the agreed price.') }, tr('Enter an amount between 0 and the agreed price.'));
  update((s) => {
    const dispute = s.disputes.find((y) => y.id === d.id);
    const x = s.assignments.find((y) => y.id === asgId);
    const task = s.tasks.find((y) => y.id === x.taskId);
    const txs = s.walletTransactions.filter((t) => t.relatedTaskId === task.id && t.status === 'on_hold');
    dispute.status = 'resolved';
    dispute.outcome = outcome;
    dispute.note = note;
    dispute.resolvedAt = nowIso();
    dispute.resolvedBy = modId;
    if (outcome === 'release' || outcome === 'partial') {
      move('assignment', x, 'completed');
      x.completedAt = nowIso();
      x.paymentStatus = 'released_demo';
      task.status = 'completed';
      const p = s.taskerProfiles.find((y) => y.userId === x.taskerId);
      if (p) p.completedTaskCount += 1;
      if (outcome === 'partial') {
        const b = breakdown(part);
        dispute.partialAmount = part;
        x.agreedPriceBeforeDispute = x.agreedPrice;
        for (const t of txs) {
          const before = { amount: t.amount, fee: t.fee };
          t.amount = b.price;
          t.fee = t.type === 'payment' ? b.clientFee : b.taskerFee;
          if (t.type === 'payment') {
            s.walletTransactions.push({ ...t, id: uid('tx'), amount: round2(before.amount - b.price), fee: round2(before.fee - b.clientFee), status: 'refunded', label: t.label.replace('On hold:', 'Refunded:'), createdAt: nowIso() });
          }
        }
        x.agreedPrice = b.price;
      }
      txs.forEach((t) => { t.status = 'completed'; t.label = t.label.replace('On hold:', t.type === 'payment' ? 'Payment for' : 'Earning for'); queuePayout(s, t); });
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
    const text = outcome === 'partial'
      ? tr('{amount} was paid to the tasker and the rest refunded to the client (demo)', { amount: `€${part}` })
      : tr({ release: 'the payment was released (demo)', refund: 'the payment was refunded (demo)', resume: 'the task continues' }[outcome]);
    for (const uid_ of [x.taskerId, task.clientId]) notify(s, uid_, tr('The dispute on “{title}” was resolved: {outcome}.', { title: short(task.title), outcome: text }), `/assignments/${asgId}`, modId);
    track(s, `dispute_${outcome}`, { actorId: modId, targetType: 'dispute', targetId: d.id, reason: note || null, meta: { assignmentId: asgId, taskId: task.id, ...(outcome === 'partial' ? { amount: part } : {}) } });
  });
  return ok();
}

export function setCategoryPolicy(catId, policy, modId) {
  if (!isMod(modId, 'settings.manage')) return fail({}, tr('Only moderators can do this.'));
  if (!['open', 'review', 'soon'].includes(policy)) return fail({}, tr('Unknown policy.'));
  update((s) => {
    const before = s.categoryPolicy[catId] || null;
    s.categoryPolicy[catId] = policy;
    track(s, `category_${policy}`, { actorId: modId, targetType: 'category', targetId: catId, meta: { before } });
  });
  return ok();
}
