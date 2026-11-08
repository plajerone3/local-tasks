// Backoffice actions: everything staff can do to observe, intervene, approve or reject.
// Every function checks the staff member's role, asks for a reason where a decision affects
// someone, writes the change, notifies the people affected, and records an activity entry
// (the audit log is the staff part of that log).
// TODO(backend): one authenticated staff endpoint per function, with the same checks server-side.
import { APP } from '../config.js';
import { tr, getLang, setLanguage, fmt } from '../i18n.js';
import { update, getState, staffSession, session } from '../store.js';
import { userById, taskById, staffById, reportById, disputeById } from '../select.js';
import { uid, nowIso, DAY_MS, round2 } from '../util.js';
import { can, ROLES, roleLabel } from '../logic/staff.js';
import { standing, canSignIn } from '../logic/enforcement.js';
import { DEFAULT_SLA } from '../data/backoffice-seed.js';
import { ok, fail, notify, track, short } from './common.js';
import { resolveReport, reviewProof, reviewTask, resolveDispute, setCategoryPolicy, warnIn } from './safety.js';

// ---------- Guards ----------

function need(staffId, perm) {
  const st = staffById(staffId);
  if (!st || !st.active) return fail({}, 'Sign in to the backoffice first.');
  if (!can(st, perm)) return fail({}, `Your role (${roleLabel(st.role)}) cannot do this. Ask an admin.`);
  return null;
}

function needReason(reason, min = 5) {
  if (String(reason || '').trim().length >= min) return null;
  const msg = 'Give a short reason. It is kept in the audit log and, where it says so, shown to the user.';
  return fail({ reason: msg }, msg);
}

/**
 * Notification texts go to app users, so they are written in the language of the demo data
 * (German when the mobile app seeded it), not in the backoffice's English.
 */
export function inUserLanguage(fn) {
  const prev = getLang();
  const want = getState()?.seedLang || 'en';
  if (want === prev) return fn();
  setLanguage(want);
  try { return fn(); } finally { setLanguage(prev); }
}

const write = (fn) => inUserLanguage(() => update(fn));
const R = (reason) => String(reason || '').trim();

// ---------- Staff session ----------

export function staffSignIn(staffId) {
  const st = staffById(staffId);
  if (!st) return fail({}, 'Unknown staff account.');
  if (!st.active) return fail({}, `${st.name}'s account is deactivated.`);
  update((s) => {
    const x = s.staff.find((y) => y.id === staffId);
    x.lastSeenAt = nowIso();
    track(s, 'staff_signed_in', { actorId: staffId, targetType: 'staff', targetId: staffId });
  });
  staffSession.set({ staffId });
  return ok();
}

export function staffSignOut(staffId) {
  if (staffById(staffId)) update((s) => track(s, 'staff_signed_out', { actorId: staffId, targetType: 'staff', targetId: staffId }));
  staffSession.set(null);
  return ok();
}

export const currentStaff = () => {
  const st = staffById(staffSession.get()?.staffId);
  return st?.active ? st : null;
};

// ---------- Cases ----------

/** caseKey = `${kind}:${id}`; maps to the record the case is about. */
export const CASE_TARGET = {
  report: 'report', task_review: 'task', flagged_task: 'task', flagged_message: 'message', proof: 'proof',
  identity: 'user', business: 'user', dispute: 'dispute', payout: 'transaction', data_request: 'data_request',
};

export function assignCase(staffId, caseKey, assigneeId) {
  const denied = need(staffId, 'cases.work');
  if (denied) return denied;
  if (assigneeId && !staffById(assigneeId)?.active) return fail({}, 'That staff member is not active.');
  const [kind, id] = caseKey.split(':');
  if (!CASE_TARGET[kind] || !id) return fail({}, 'Unknown case.');
  update((s) => {
    if (!s.caseMeta) s.caseMeta = {};
    s.caseMeta[caseKey] = { ...(s.caseMeta[caseKey] || {}), assigneeId: assigneeId || null, assignedAt: nowIso() };
    track(s, assigneeId ? 'case_assigned' : 'case_unassigned', { actorId: staffId, targetType: CASE_TARGET[kind], targetId: id, meta: { assigneeId: assigneeId || null, kind } });
  });
  return ok();
}

export function addNote(staffId, targetType, targetId, body) {
  const denied = need(staffId, 'cases.work');
  if (denied) return denied;
  const text = String(body || '').trim();
  if (text.length < 2) return fail({ body: 'Write the note first.' }, 'Write the note first.');
  if (text.length > 1000) return fail({ body: 'Keep notes under 1,000 characters.' }, 'Keep notes under 1,000 characters.');
  update((s) => {
    if (!s.staffNotes) s.staffNotes = [];
    s.staffNotes.unshift({ id: uid('note'), targetType, targetId, staffId, body: text, createdAt: nowIso() });
    track(s, 'note_added', { actorId: staffId, targetType, targetId });
  });
  return ok();
}

// ---------- Reports ----------

export function decideReport(staffId, reportId, decision, reason = '') {
  const denied = need(staffId, 'content.moderate');
  if (denied) return denied;
  if (!['no_action', 'warning', 'hidden'].includes(decision)) return fail({}, 'Unknown decision.');
  if (decision !== 'no_action') { const r = needReason(reason); if (r) return r; }
  const rep = reportById(reportId);
  if (!rep || rep.status !== 'pending_review') return fail({}, 'This report has already been decided.');
  return inUserLanguage(() => resolveReport(reportId, staffId, decision, R(reason)));
}

// ---------- Tasks ----------

export function decideTaskReview(staffId, taskId, decision, reason = '') {
  const denied = need(staffId, 'tasks.review');
  if (denied) return denied;
  if (decision === 'decline') { const r = needReason(reason); if (r) return r; }
  return inUserLanguage(() => reviewTask(taskId, staffId, decision === 'approve' ? 'approve' : 'decline', R(reason)));
}

export function clearTaskFlags(staffId, taskId, reason = '') {
  const denied = need(staffId, 'content.moderate');
  if (denied) return denied;
  const t = taskById(taskId);
  if (!t) return fail({}, 'Task not found.');
  update((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    x.flagsReviewedAt = nowIso();
    x.flagsReviewedBy = staffId;
    track(s, 'flags_cleared', { actorId: staffId, targetType: 'task', targetId: taskId, reason: R(reason) || null, meta: { rules: (x.flags || []).map((f) => f.rule) } });
  });
  return ok();
}

export function setTaskHidden(staffId, taskId, hidden, reason = '') {
  const denied = need(staffId, 'content.moderate');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const t = taskById(taskId);
  if (!t) return fail({}, 'Task not found.');
  if (!!t.hidden === !!hidden) return fail({}, hidden ? 'This task is already hidden.' : 'This task is already visible.');
  write((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    x.hidden = !!hidden;
    x.hiddenReason = hidden ? R(reason) : null;
    x.hiddenByAccount = false;
    if (hidden) x.flagsReviewedAt = x.flagsReviewedAt || nowIso();
    notify(s, x.clientId, hidden
      ? tr('Our team hid “{title}”: {reason}', { title: short(x.title), reason: R(reason) })
      : tr('“{title}” is visible again.', { title: short(x.title) }), `/tasks/${taskId}`, staffId);
    track(s, hidden ? 'task_hidden' : 'task_unhidden', { actorId: staffId, targetType: 'task', targetId: taskId, reason: R(reason) });
  });
  return ok();
}

export function editTask(staffId, taskId, { title, description }, reason = '') {
  const denied = need(staffId, 'tasks.review');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const t = taskById(taskId);
  if (!t) return fail({}, 'Task not found.');
  const errors = {};
  if (String(title || '').trim().length < 6) errors.title = 'The title needs at least 6 characters.';
  if (String(description || '').trim().length < 20) errors.description = 'The description needs at least 20 characters.';
  if (Object.keys(errors).length) return fail(errors, Object.values(errors)[0]);
  const fields = [];
  if (title.trim() !== t.title) fields.push('title');
  if (description.trim() !== t.description) fields.push('description');
  if (!fields.length) return fail({}, 'Nothing changed.');
  write((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    x.editHistory = [...(x.editHistory || []), { at: nowIso(), by: staffId, before: { title: x.title, description: x.description }, reason: R(reason) }];
    x.title = title.trim();
    x.description = description.trim();
    notify(s, x.clientId, tr('Our team edited your task “{title}”: {reason}', { title: short(x.title), reason: R(reason) }), `/tasks/${taskId}`, staffId);
    track(s, 'task_edited', { actorId: staffId, targetType: 'task', targetId: taskId, reason: R(reason), meta: { fields } });
  });
  return ok();
}

/** Staff override: cancels a task at any stage before completion, refunding any reserved payment. */
export function cancelTaskByStaff(staffId, taskId, reason = '') {
  const denied = need(staffId, 'tasks.review');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const t = taskById(taskId);
  if (!t) return fail({}, 'Task not found.');
  if (['completed', 'cancelled', 'not_approved'].includes(t.status)) return fail({}, 'This task is already closed.');
  if (t.status === 'disputed') return fail({}, 'This task has an open dispute. Resolve the dispute instead.');
  write((s) => {
    const x = s.tasks.find((y) => y.id === taskId);
    const asg = s.assignments.find((a) => a.taskId === taskId && !['cancelled', 'completed'].includes(a.status));
    x.status = 'cancelled';
    x.cancelReason = R(reason);
    x.cancelledByStaff = staffId;
    for (const a of s.applications.filter((y) => y.taskId === taskId && ['applied', 'shortlisted'].includes(y.status))) {
      a.status = 'declined';
      notify(s, a.taskerId, tr('“{title}” was cancelled by our team. This does not affect your profile.', { title: short(x.title) }), `/tasks/${taskId}`, staffId);
    }
    if (asg) {
      asg.status = 'cancelled';
      asg.cancelReason = R(reason);
      asg.cancelledBy = staffId;
      asg.paymentStatus = 'refunded_demo';
      for (const tx of s.walletTransactions.filter((y) => y.relatedTaskId === taskId && ['pending', 'on_hold'].includes(y.status))) {
        tx.status = 'refunded';
        tx.label = tx.label.replace(/^(Reserved for|Pending for|On hold:)/, 'Refunded:');
      }
      notify(s, asg.taskerId, tr('Our team cancelled “{title}”: {reason} This does not affect your profile.', { title: short(x.title), reason: R(reason) }), `/assignments/${asg.id}`, staffId);
      track(s, 'payment_refunded', { actorId: staffId, targetType: 'task', targetId: taskId, meta: { amount: asg.agreedPrice } });
    }
    notify(s, x.clientId, tr('Our team cancelled your task “{title}”: {reason}', { title: short(x.title), reason: R(reason) }), `/tasks/${taskId}`, staffId);
    track(s, 'task_force_cancelled', { actorId: staffId, targetType: 'task', targetId: taskId, reason: R(reason), meta: { hadAssignment: !!asg } });
  });
  return ok();
}

// ---------- Messages and conversations ----------

/** Reading a private conversation needs a reason; access lasts 30 minutes and is logged. */
export const ACCESS_MINUTES = 30;

export function hasConversationAccess(staffId, convId, now = Date.now()) {
  return (getState().accessLog || []).some((a) => a.staffId === staffId && a.conversationId === convId && now - new Date(a.createdAt).getTime() < ACCESS_MINUTES * 6e4);
}

export function openConversation(staffId, convId, reason = '') {
  const denied = need(staffId, 'messages.read');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  if (!getState().conversations.some((c) => c.id === convId)) return fail({}, 'Conversation not found.');
  update((s) => {
    if (!s.accessLog) s.accessLog = [];
    s.accessLog.unshift({ id: uid('acc'), staffId, conversationId: convId, reason: R(reason), createdAt: nowIso() });
    track(s, 'conversation_viewed', { actorId: staffId, targetType: 'conversation', targetId: convId, reason: R(reason) });
  });
  return ok();
}

export function setMessageHidden(staffId, msgId, hidden, reason = '') {
  const denied = need(staffId, 'content.moderate');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const m = getState().messages.find((x) => x.id === msgId);
  if (!m) return fail({}, 'Message not found.');
  write((s) => {
    const x = s.messages.find((y) => y.id === msgId);
    x.hidden = !!hidden;
    x.hiddenReason = hidden ? R(reason) : null;
    if (x.flags?.length) x.flagsReviewedAt = nowIso();
    if (hidden && x.senderId) notify(s, x.senderId, tr('Our team hid a message you sent: {reason}', { reason: R(reason) }), `/messages/${x.conversationId}`, staffId);
    track(s, hidden ? 'message_hidden' : 'message_unhidden', { actorId: staffId, targetType: 'conversation', targetId: x.conversationId, reason: R(reason), meta: { messageId: msgId, senderId: x.senderId } });
  });
  return ok();
}

export function clearMessageFlags(staffId, msgId, reason = '') {
  const denied = need(staffId, 'content.moderate');
  if (denied) return denied;
  update((s) => {
    const x = s.messages.find((y) => y.id === msgId);
    if (!x) return;
    x.flagsReviewedAt = nowIso();
    track(s, 'flags_cleared', { actorId: staffId, targetType: 'conversation', targetId: x.conversationId, reason: R(reason) || null, meta: { messageId: msgId } });
  });
  return ok();
}

// ---------- Reviews ----------

export function setReviewRemoved(staffId, reviewId, removed, reason = '') {
  const denied = need(staffId, 'content.moderate');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const rv = getState().reviews.find((x) => x.id === reviewId);
  if (!rv) return fail({}, 'Review not found.');
  if ((rv.status === 'removed') === !!removed) return fail({}, removed ? 'This review is already removed.' : 'This review is already published.');
  write((s) => {
    const x = s.reviews.find((y) => y.id === reviewId);
    x.status = removed ? 'removed' : 'published';
    x.removedReason = removed ? R(reason) : null;
    if (removed) notify(s, x.reviewerId, tr('Our team removed a review you wrote for “{title}”: {reason}', { title: short(x.taskTitle || ''), reason: R(reason) }), '/safety', staffId);
    track(s, removed ? 'review_removed' : 'review_restored', { actorId: staffId, targetType: 'review', targetId: reviewId, reason: R(reason), meta: { revieweeId: x.revieweeId, stars: x.stars } });
  });
  return ok();
}

// ---------- Users ----------

export function warnUser(staffId, userId, reason = '') {
  const denied = need(staffId, 'users.warn');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  if (!userById(userId)) return fail({}, 'User not found.');
  write((s) => warnIn(s, userId, staffId, R(reason)));
  return ok();
}

export function sendUserNotice(staffId, userId, text) {
  const denied = need(staffId, 'users.warn');
  if (denied) return denied;
  const body = String(text || '').trim();
  if (body.length < 5) return fail({ text: 'Write the message first.' }, 'Write the message first.');
  if (body.length > 400) return fail({ text: 'Keep it under 400 characters.' }, 'Keep it under 400 characters.');
  if (!userById(userId)) return fail({}, 'User not found.');
  write((s) => {
    notify(s, userId, tr('Message from the {app} team: {text}', { app: APP.name, text: body }), '/notifications', staffId);
    track(s, 'user_notified', { actorId: staffId, targetType: 'user', targetId: userId, meta: { text: body } });
  });
  return ok();
}

export const STANDING_ACTIONS = {
  restricted: { verb: 'Restrict', event: 'user_restricted' },
  suspended: { verb: 'Suspend', event: 'user_suspended' },
  banned: { verb: 'Ban', event: 'user_banned' },
  active: { verb: 'Reinstate', event: 'user_reinstated' },
};

/** status: 'restricted' | 'suspended' | 'banned' | 'active'. days: optional end date for restricted/suspended. */
export function setStanding(staffId, userId, status, { reason = '', days = null } = {}) {
  const denied = need(staffId, 'users.enforce');
  if (denied) return denied;
  if (!STANDING_ACTIONS[status]) return fail({}, 'Unknown account status.');
  const r = needReason(reason);
  if (r) return r;
  const u = userById(userId);
  if (!u) return fail({}, 'User not found.');
  if (standing(u) === 'closed') return fail({}, 'This account is closed.');
  if (standing(u) === status) return fail({}, `This account is already ${status}.`);
  const nDays = days ? Math.round(Number(days)) : null;
  if (nDays != null && !(nDays >= 1 && nDays <= 365)) return fail({ days: 'Choose between 1 and 365 days, or leave it empty.' }, 'Choose between 1 and 365 days, or leave it empty.');
  const until = nDays && status !== 'banned' && status !== 'active' ? new Date(Date.now() + nDays * DAY_MS).toISOString() : null;
  write((s) => {
    const x = s.users.find((y) => y.id === userId);
    x.enforcement = status === 'active' ? null : { status, reason: R(reason), until, by: staffId, at: nowIso() };
    const theirOpen = s.tasks.filter((t) => t.clientId === userId && ['open', 'under_review'].includes(t.status));
    if (status === 'suspended' || status === 'banned') {
      for (const t of theirOpen) if (!t.hidden) { t.hidden = true; t.hiddenByAccount = true; t.hiddenReason = R(reason); }
    }
    if (status === 'banned') {
      for (const a of s.applications.filter((y) => y.taskerId === userId && ['applied', 'shortlisted'].includes(y.status))) a.status = 'withdrawn';
    }
    if (status === 'active') {
      for (const t of s.tasks.filter((y) => y.clientId === userId && y.hiddenByAccount)) { t.hidden = false; t.hiddenByAccount = false; t.hiddenReason = null; }
    }
    const text = {
      restricted: until
        ? tr('Our team restricted your account until {date}: {reason} You can finish current jobs and chats, but not post, apply or send requests.', { date: fmt.day(until), reason: R(reason) })
        : tr('Our team restricted your account: {reason} You can finish current jobs and chats, but not post, apply or send requests.', { reason: R(reason) }),
      suspended: until
        ? tr('Your account is suspended until {date}: {reason}', { date: fmt.day(until), reason: R(reason) })
        : tr('Your account is suspended: {reason}', { reason: R(reason) }),
      banned: tr('Your account was closed by our team: {reason}', { reason: R(reason) }),
      active: tr('Your account is fully active again.'),
    }[status];
    notify(s, userId, text, '/safety', staffId);
    track(s, STANDING_ACTIONS[status].event, { actorId: staffId, targetType: 'user', targetId: userId, reason: R(reason), meta: { until, days: nDays } });
  });
  return ok();
}

export function decideIdentity(staffId, userId, decision, reason = '') {
  const denied = need(staffId, 'users.verify');
  if (denied) return denied;
  if (decision === 'rejected') { const r = needReason(reason); if (r) return r; }
  const u = userById(userId);
  if (!u) return fail({}, 'User not found.');
  write((s) => {
    const x = s.users.find((y) => y.id === userId);
    x.verificationStatus = decision === 'verified' ? 'verified' : 'rejected';
    x.verificationReviewedAt = nowIso();
    x.verificationReviewedBy = staffId;
    notify(s, userId, decision === 'verified'
      ? tr('Our team checked your identity (demo check).')
      : tr('Our team could not confirm your identity: {reason}', { reason: R(reason) }), '/settings', staffId);
    track(s, decision === 'verified' ? 'identity_verified' : 'identity_rejected', { actorId: staffId, targetType: 'user', targetId: userId, reason: R(reason) || null });
  });
  return ok();
}

export function decideBusiness(staffId, userId, decision, reason = '') {
  const denied = need(staffId, 'users.verify');
  if (denied) return denied;
  if (decision === 'rejected') { const r = needReason(reason); if (r) return r; }
  const b = getState().businessProfiles.find((x) => x.userId === userId);
  if (!b) return fail({}, 'Business not found.');
  write((s) => {
    const x = s.businessProfiles.find((y) => y.userId === userId);
    x.verifiedStatus = decision === 'verified' ? 'verified' : 'rejected';
    x.verifiedAt = nowIso();
    x.verifiedBy = staffId;
    notify(s, userId, decision === 'verified'
      ? tr('Our team checked your business details (demo check).')
      : tr('Our team could not confirm your business details: {reason}', { reason: R(reason) }), '/dashboard', staffId);
    track(s, decision === 'verified' ? 'business_verified' : 'business_rejected', { actorId: staffId, targetType: 'user', targetId: userId, reason: R(reason) || null });
  });
  return ok();
}

export function decideProof(staffId, proofId, decision, reason = '') {
  const denied = need(staffId, 'users.verify');
  if (denied) return denied;
  if (decision === 'rejected') { const r = needReason(reason); if (r) return r; }
  return inUserLanguage(() => reviewProof(proofId, staffId, decision === 'verified' ? 'verified' : 'rejected', R(reason)));
}

/** Opens the app signed in as this user, for support. Logged; never for staff convenience. */
export function impersonate(staffId, userId, reason = '') {
  const denied = need(staffId, 'impersonate');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const u = userById(userId);
  if (!u) return fail({}, 'User not found.');
  if (!canSignIn(u)) return fail({}, 'This account cannot sign in right now (suspended, banned or closed).');
  update((s) => track(s, 'impersonation_started', { actorId: staffId, targetType: 'user', targetId: userId, reason: R(reason) }));
  session.set({ userId, role: u.roles[0] });
  const mobile = u.roles.some((x) => x === 'client' || x === 'tasker');
  return ok({ url: mobile ? 'app.html#/home' : 'index.html#/dashboard' });
}

// ---------- Disputes ----------

export function decideDispute(staffId, disputeId, outcome, reason = '', amount = null) {
  const denied = need(staffId, 'disputes.resolve');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const d = disputeById(disputeId);
  if (!d || d.status !== 'open') return fail({}, 'This dispute is not open.');
  return inUserLanguage(() => resolveDispute(d.assignmentId, staffId, outcome, R(reason), amount));
}

// ---------- Money ----------

export function decidePayout(staffId, txId, decision, reason = '') {
  const denied = need(staffId, 'money.payouts');
  if (denied) return denied;
  if (decision === 'held') { const r = needReason(reason); if (r) return r; }
  const tx = getState().walletTransactions.find((x) => x.id === txId);
  if (!tx || tx.type !== 'earning' || tx.status !== 'completed') return fail({}, 'This is not a payable earning.');
  if (tx.payoutStatus === decision) return fail({}, `This payout is already ${decision === 'held' ? 'on hold' : 'approved'}.`);
  const net = round2(tx.amount - tx.fee);
  write((s) => {
    const x = s.walletTransactions.find((y) => y.id === txId);
    x.payoutStatus = decision === 'held' ? 'held' : 'approved';
    x.payoutBy = staffId;
    x.payoutAt = nowIso();
    x.payoutNote = R(reason) || null;
    const title = taskById(x.relatedTaskId)?.title;
    notify(s, x.userId, decision === 'held'
      ? tr('Your payout of {amount} is on hold while our team checks it: {reason}', { amount: fmt.money(net), reason: R(reason) })
      : tr('Your payout of {amount} was approved (demo).', { amount: fmt.money(net) }), '/wallet', staffId);
    track(s, decision === 'held' ? 'payout_held' : 'payout_approved', { actorId: staffId, targetType: 'transaction', targetId: txId, reason: R(reason) || null, meta: { amount: net, userId: x.userId, title: title || null } });
  });
  return ok();
}

/** Goodwill refund to the client of a completed task, paid by the platform (the tasker keeps the earning). */
export function refundClient(staffId, taskId, amount, reason = '') {
  const denied = need(staffId, 'money.refund');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const t = taskById(taskId);
  const paid = t && getState().walletTransactions.find((x) => x.relatedTaskId === taskId && x.type === 'payment' && x.status === 'completed');
  if (!paid) return fail({}, 'Only completed, paid tasks can get a goodwill refund. For open payments, cancel the task.');
  const already = getState().walletTransactions.filter((x) => x.relatedTaskId === taskId && x.type === 'payment' && x.status === 'refunded' && x.goodwill).reduce((a, x) => a + x.amount, 0);
  const max = round2(paid.amount + paid.fee - already);
  const n = round2(Number(String(amount ?? '').replace(',', '.')));
  if (!(n > 0 && n <= max)) return fail({ amount: `Enter an amount between €0.01 and ${fmt.money(max)}.` }, `Enter an amount between €0.01 and ${fmt.money(max)}.`);
  write((s) => {
    const id = uid('tx');
    s.walletTransactions.push({ id, userId: paid.userId, type: 'payment', amount: n, fee: 0, status: 'refunded', relatedTaskId: taskId, label: `Refunded: “${t.title}”`, createdAt: nowIso(), demoOnly: true, goodwill: true, by: staffId });
    notify(s, paid.userId, tr('Our team refunded {amount} for “{title}” (demo): {reason}', { amount: fmt.money(n), title: short(t.title), reason: R(reason) }), '/wallet', staffId);
    track(s, 'refund_issued', { actorId: staffId, targetType: 'transaction', targetId: id, reason: R(reason), meta: { amount: n, taskId, userId: paid.userId } });
  });
  return ok();
}

// ---------- Data requests ----------

export function completeDataRequest(staffId, reqId, { anonymise = true } = {}) {
  const denied = need(staffId, 'data.requests');
  if (denied) return denied;
  const req = (getState().dataRequests || []).find((x) => x.id === reqId);
  if (!req || req.status !== 'received') return fail({}, 'This request is already handled.');
  write((s) => {
    const x = s.dataRequests.find((y) => y.id === reqId);
    x.status = 'completed';
    x.completedAt = nowIso();
    x.completedBy = staffId;
    if (x.type === 'deletion' && anonymise) {
      const u = s.users.find((y) => y.id === x.userId);
      if (u) {
        u.name = 'Deleted user';
        u.email = `deleted-${u.id}@invalid.example`;
        u.phone = null;
        u.enforcement = { status: 'closed', reason: 'Deleted on request', until: null, by: staffId, at: nowIso() };
        for (const t of s.tasks.filter((y) => y.clientId === u.id && ['open', 'under_review'].includes(y.status))) { t.hidden = true; t.hiddenByAccount = true; }
      }
    }
    track(s, 'data_request_completed', { actorId: staffId, targetType: 'data_request', targetId: reqId, meta: { userId: x.userId, anonymised: !!anonymise } });
  });
  return ok();
}

// ---------- Announcements ----------

export const AUDIENCES = {
  all: 'Everyone', clients: 'Clients', taskers: 'Taskers', businesses: 'Businesses',
  vienna: 'Everyone in Vienna', graz: 'Everyone in Graz', linz: 'Everyone in Linz',
};

export function audienceOf(key) {
  const users = getState().users.filter((u) => !u.roles.includes('moderator') && ['active', 'restricted'].includes(standing(u)));
  if (key === 'clients') return users.filter((u) => u.roles.includes('client'));
  if (key === 'taskers') return users.filter((u) => u.roles.includes('tasker'));
  if (key === 'businesses') return users.filter((u) => u.roles.includes('business'));
  if (['vienna', 'graz', 'linz'].includes(key)) return users.filter((u) => u.locationArea?.city === key);
  return users;
}

export function broadcast(staffId, audience, text) {
  const denied = need(staffId, 'comms.broadcast');
  if (denied) return denied;
  if (!AUDIENCES[audience]) return fail({ audience: 'Choose who gets it.' }, 'Choose who gets it.');
  const body = String(text || '').trim();
  if (body.length < 10) return fail({ text: 'Write at least 10 characters.' }, 'Write at least 10 characters.');
  if (body.length > 300) return fail({ text: 'Keep it under 300 characters.' }, 'Keep it under 300 characters.');
  const people = audienceOf(audience);
  if (!people.length) return fail({}, 'Nobody is in this audience.');
  write((s) => {
    for (const u of people) notify(s, u.id, tr('{app}: {text}', { app: APP.name, text: body }), '/notifications', staffId);
    track(s, 'announcement_sent', { actorId: staffId, targetType: 'audience', targetId: audience, meta: { count: people.length, text: body } });
  });
  return ok({ count: people.length });
}

// ---------- Staff ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function addStaff(staffId, { name, email, role, title }) {
  const denied = need(staffId, 'staff.manage');
  if (denied) return denied;
  const errors = {};
  if (String(name || '').trim().length < 2) errors.name = 'Enter their name.';
  if (!EMAIL.test(String(email || '').trim())) errors.email = 'Enter a valid work email.';
  else if (getState().staff.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) errors.email = 'Someone on the team already uses this email.';
  if (!ROLES[role]) errors.role = 'Choose a role.';
  else if (role === 'owner' && staffById(staffId).role !== 'owner') errors.role = 'Only the owner can add another owner.';
  if (Object.keys(errors).length) return fail(errors, Object.values(errors)[0]);
  const id = uid('st');
  const palette = ['#FF5A3C', '#22C08B', '#3D5AFE', '#FFC933', '#9C7BFF', '#FF7EB6', '#45B8F0', '#B5E655'];
  update((s) => {
    s.staff.push({ id, name: name.trim(), email: email.trim().toLowerCase(), role, title: String(title || '').trim() || roleLabel(role), active: true, createdAt: nowIso(), color: palette[s.staff.length % palette.length] });
    track(s, 'staff_added', { actorId: staffId, targetType: 'staff', targetId: id, meta: { role } });
  });
  return ok({ id });
}

const owners = () => getState().staff.filter((x) => x.role === 'owner' && x.active);

export function setStaffRole(staffId, targetId, role) {
  const denied = need(staffId, 'staff.manage');
  if (denied) return denied;
  const me = staffById(staffId);
  const t = staffById(targetId);
  if (!t) return fail({}, 'Staff member not found.');
  if (!ROLES[role]) return fail({}, 'Unknown role.');
  if (t.role === role) return ok();
  if ((t.role === 'owner' || role === 'owner') && me.role !== 'owner') return fail({}, 'Only the owner can change owner access.');
  if (t.role === 'owner' && owners().length === 1) return fail({}, 'There must always be at least one owner.');
  update((s) => {
    const x = s.staff.find((y) => y.id === targetId);
    const before = x.role;
    x.role = role;
    track(s, 'staff_role_changed', { actorId: staffId, targetType: 'staff', targetId, meta: { before, after: role } });
  });
  return ok();
}

export function setStaffActive(staffId, targetId, active, reason = '') {
  const denied = need(staffId, 'staff.manage');
  if (denied) return denied;
  if (staffId === targetId) return fail({}, 'You cannot deactivate your own account.');
  const t = staffById(targetId);
  if (!t) return fail({}, 'Staff member not found.');
  if (t.role === 'owner' && staffById(staffId).role !== 'owner') return fail({}, 'Only the owner can deactivate an owner.');
  if (!active) { const r = needReason(reason); if (r) return r; }
  update((s) => {
    const x = s.staff.find((y) => y.id === targetId);
    x.active = !!active;
    track(s, active ? 'staff_reactivated' : 'staff_deactivated', { actorId: staffId, targetType: 'staff', targetId, reason: R(reason) || null });
  });
  return ok();
}

// ---------- Settings ----------

export function updateSettings(staffId, patch, reason = '') {
  const denied = need(staffId, 'settings.manage');
  if (denied) return denied;
  const r = needReason(reason);
  if (r) return r;
  const cur = getState().settings;
  const errors = {};
  const next = structuredClone(cur);
  const changes = [];
  const setIf = (path, value, label) => {
    const keys = path.split('.');
    let o = next;
    for (const k of keys.slice(0, -1)) o = o[k];
    const before = o[keys.at(-1)];
    if (JSON.stringify(before) !== JSON.stringify(value)) { o[keys.at(-1)] = value; changes.push({ field: label || path, before, after: value }); }
  };
  if ('payoutApprovalOver' in patch) {
    const n = Number(patch.payoutApprovalOver);
    if (!(n >= 0 && n <= 5000)) errors.payoutApprovalOver = 'Enter an amount between €0 and €5,000.';
    else setIf('payoutApprovalOver', n);
  }
  if ('firstPayoutNeedsApproval' in patch) setIf('firstPayoutNeedsApproval', !!patch.firstPayoutNeedsApproval);
  if ('flagsEnabled' in patch) setIf('flags.enabled', !!patch.flagsEnabled);
  if ('holdHighRisk' in patch) setIf('flags.holdHighRisk', !!patch.holdHighRisk);
  if ('maxHourly' in patch) {
    const n = Number(patch.maxHourly);
    if (!(n >= 20 && n <= 500)) errors.maxHourly = 'Enter €20 to €500 per hour.';
    else setIf('flags.maxHourly', n);
  }
  if (patch.terms) {
    for (const [rule, list] of Object.entries(patch.terms)) {
      const terms = String(list || '').split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (terms.some((x) => x.length < 3)) errors[`terms_${rule}`] = 'Each word or phrase needs at least 3 characters.';
      else setIf(`flags.terms.${rule}`, [...new Set(terms)].slice(0, 60), `flags.terms.${rule}`);
    }
  }
  if (patch.sla) {
    for (const [k, v] of Object.entries(patch.sla)) {
      if (!(k in DEFAULT_SLA)) continue;
      const n = Number(v);
      if (!(n >= 1 && n <= 2160)) errors[`sla_${k}`] = 'Between 1 and 2,160 hours.';
      else setIf(`sla.${k}`, n);
    }
  }
  if (Object.keys(errors).length) return fail(errors, Object.values(errors)[0]);
  if (!changes.length) return fail({}, 'Nothing changed.');
  update((s) => {
    s.settings = next;
    for (const c of changes) track(s, 'settings_changed', { actorId: staffId, targetType: 'settings', targetId: c.field.split('.')[0], reason: R(reason), meta: c });
  });
  return ok({ changed: changes.length });
}

export function setPolicy(staffId, catId, policy) {
  const denied = need(staffId, 'settings.manage');
  if (denied) return denied;
  return setCategoryPolicy(catId, policy, staffId);
}

// ---------- Exports ----------

export function logExport(staffId, what, rows) {
  const denied = need(staffId, 'export');
  if (denied) return denied;
  update((s) => track(s, 'export_downloaded', { actorId: staffId, targetType: 'export', targetId: what, meta: { rows } }));
  return ok();
}
