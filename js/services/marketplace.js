// Tasks, applications, assignments, reviews and demo payments.
// TODO(backend): each exported function maps 1:1 to an API endpoint; keep validation server-side too.
import { tr } from '../i18n.js';
import { update, getState } from '../store.js';
import {
  taskById, applicationById, assignmentById, userById, firstName, policyOf, myApplication, reviewByFor, findConversation,
} from '../select.js';
import { uid, nowIso, todayIso } from '../util.js';
import { parseAreaKey } from '../data/geo.js';
import { category } from '../data/categories.js';
import { validateTask, validateApplication, validateReview, hasErrors } from '../logic/validation.js';
import { move, canMove } from '../logic/status.js';
import { breakdown } from '../logic/money.js';
import { APP } from '../config.js';
import { ok, fail, notify, notifyModerators, short, emitHook, audit } from './common.js';

const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);

export function draftFromForm(d) {
  return {
    title: (d.title || '').trim(), category: d.category || '', description: (d.description || '').trim(),
    date: d.date || '', start: d.start || '', end: d.end || '', area: d.area || '',
    budgetMin: d.budgetMin ?? '', budgetMax: d.budgetMax ?? '', estimatedHours: d.estimatedHours ?? '',
    requirements: d.requirements || '', safetyNotes: (d.safetyNotes || '').trim(), exactAddress: (d.exactAddress || '').trim(),
    recurring: (d.recurring || '').trim(),
  };
}

export function checkTask(draft) {
  return validateTask(draft, { today: todayIso(), policy: draft.category ? policyOf(draft.category) : null });
}

export function publishTask(clientId, draft) {
  const errors = checkTask(draft);
  if (hasErrors(errors)) return fail(errors);
  const policy = policyOf(draft.category);
  const id = uid('t');
  const status = policy === 'review' ? 'under_review' : 'open';
  update((s) => {
    s.tasks.unshift({
      id, clientId, title: draft.title, category: draft.category, description: draft.description,
      locationArea: parseAreaKey(draft.area), date: draft.date, timeWindow: { start: draft.start, end: draft.end },
      estimatedHours: draft.estimatedHours ? Number(String(draft.estimatedHours).replace(',', '.')) : null,
      budgetMin: Number(draft.budgetMin), budgetMax: Number(draft.budgetMax),
      requirements: lines(draft.requirements), safetyNotes: draft.safetyNotes, status, createdAt: nowIso(),
      exactAddress: draft.exactAddress, invitedIds: [], hidden: false, recurring: draft.recurring || null, reviewNote: null,
    });
    if (status === 'under_review') {
      notifyModerators(s, tr('Task waiting for manual review: “{title}”.', { title: short(draft.title) }), '/moderation?tab=tasks', clientId);
      notify(s, clientId, tr('“{title}” is in manual review. We will tell you when it is live.', { title: short(draft.title) }), `/tasks/${id}`);
    }
    audit(s, clientId, 'task_published', id);
  });
  return ok({ id, status });
}

export function cancelTask(taskId, clientId, reason = '') {
  const t = taskById(taskId);
  if (!t || t.clientId !== clientId) return fail({}, tr('Only the client who posted this task can cancel it.'));
  if (!canMove('task', t.status, 'cancelled')) return fail({}, tr('This task can no longer be cancelled here. If work has started, open the assignment instead.'));
  update((s) => {
    const task = s.tasks.find((x) => x.id === taskId);
    move('task', task, 'cancelled');
    task.cancelReason = reason;
    for (const a of s.applications.filter((x) => x.taskId === taskId && ['applied', 'shortlisted'].includes(x.status))) {
      a.status = 'declined';
      notify(s, a.taskerId, tr('“{title}” was cancelled by the client. This does not affect your profile.', { title: short(task.title) }), `/tasks/${taskId}`, clientId);
    }
  });
  return ok();
}

export function inviteTasker(taskId, clientId, taskerId) {
  const t = taskById(taskId);
  if (!t || t.clientId !== clientId || t.status !== 'open') return fail({}, tr('You can only invite people to your own open tasks.'));
  if (t.invitedIds.includes(taskerId)) return fail({}, tr('You already invited this person.'));
  update((s) => {
    s.tasks.find((x) => x.id === taskId).invitedIds.push(taskerId);
    notify(s, taskerId, tr('{name} invited you to apply to “{title}”.', { name: firstName(userById(clientId)), title: short(t.title) }), `/tasks/${taskId}`, clientId);
  });
  emitHook('invited', { taskId, taskerId, clientId });
  return ok();
}

export function applyToTask(taskId, taskerId, d, { simulated = false } = {}) {
  const t = taskById(taskId);
  if (!t) return fail({}, tr('This task no longer exists.'));
  if (t.clientId === taskerId) return fail({}, tr('You cannot apply to your own task.'));
  if (t.status !== 'open') return fail({}, tr('This task is not accepting applications right now.'));
  if (myApplication(taskId, taskerId)) return fail({}, tr('You have already applied to this task.'));
  const errors = validateApplication(d);
  if (hasErrors(errors)) return fail(errors);
  const id = uid('ap');
  update((s) => {
    s.applications.push({
      id, taskId, taskerId, note: d.note.trim(), proposedRate: Number(String(d.proposedRate).replace(',', '.')),
      availability: d.availability.trim(), relevantSkills: d.relevantSkills || [], status: 'applied',
      createdAt: nowIso(), shortlistedAt: null, simulated,
    });
    notify(s, t.clientId, tr('{name} applied to “{title}”.', { name: firstName(userById(taskerId)), title: short(t.title) }), `/tasks/${taskId}/applicants`, taskerId);
  });
  return ok({ id });
}

export function withdrawApplication(appId, taskerId) {
  const a = applicationById(appId);
  if (!a || a.taskerId !== taskerId) return fail({}, tr('Application not found.'));
  if (!['applied', 'shortlisted'].includes(a.status)) return fail({}, tr('This application can no longer be withdrawn. If you were accepted, cancel the assignment instead.'));
  update((s) => { move('application', s.applications.find((x) => x.id === appId), 'withdrawn'); });
  return ok();
}

export function toggleShortlist(appId, clientId) {
  const a = applicationById(appId);
  const t = a && taskById(a.taskId);
  if (!t || t.clientId !== clientId) return fail({}, tr('Application not found.'));
  const to = a.status === 'shortlisted' ? 'applied' : 'shortlisted';
  if (!canMove('application', a.status, to)) return fail({}, tr('This application can no longer be changed.'));
  update((s) => {
    const x = s.applications.find((y) => y.id === appId);
    move('application', x, to);
    x.shortlistedAt = to === 'shortlisted' ? nowIso() : null;
    if (to === 'shortlisted') notify(s, x.taskerId, tr('You were shortlisted for “{title}”.', { title: short(t.title) }), `/tasks/${t.id}`, clientId);
  });
  return ok({ status: to });
}

export function declineApplication(appId, clientId) {
  const a = applicationById(appId);
  const t = a && taskById(a.taskId);
  if (!t || t.clientId !== clientId) return fail({}, tr('Application not found.'));
  if (!canMove('application', a.status, 'declined')) return fail({}, tr('This application can no longer be declined.'));
  update((s) => {
    move('application', s.applications.find((y) => y.id === appId), 'declined');
    notify(s, a.taskerId, tr('The client chose someone else for “{title}”. This does not affect your profile.', { title: short(t.title) }), `/tasks/${t.id}`, clientId);
  });
  return ok();
}

export function acceptApplication(appId, clientId) {
  const a = applicationById(appId);
  const t = a && taskById(a.taskId);
  if (!t || t.clientId !== clientId) return fail({}, tr('Application not found.'));
  if (t.status !== 'open') return fail({}, tr('This task already has an accepted tasker.'));
  if (!canMove('application', a.status, 'accepted')) return fail({}, tr('This application can no longer be accepted.'));
  const asgId = uid('as');
  const b = breakdown(a.proposedRate);
  update((s) => {
    const task = s.tasks.find((x) => x.id === t.id);
    const app = s.applications.find((x) => x.id === appId);
    move('application', app, 'accepted');
    move('task', task, 'assigned');
    s.assignments.push({
      id: asgId, taskId: t.id, taskerId: a.taskerId, applicationId: appId, agreedPrice: b.price, acceptedAt: nowIso(),
      startedAt: null, completedAt: null, status: 'accepted', previousStatus: null, paymentStatus: 'reserved_demo',
      completionRequestedBy: null, completionRequestedAt: null, addressShared: false, cancelReason: null,
    });
    for (const other of s.applications.filter((x) => x.taskId === t.id && x.id !== appId && ['applied', 'shortlisted'].includes(x.status))) {
      other.status = 'declined';
      notify(s, other.taskerId, tr('“{title}” has been filled. Thanks for applying — this does not affect your profile.', { title: short(t.title) }), `/tasks/${t.id}`, clientId);
    }
    s.walletTransactions.push(
      { id: uid('tx'), userId: clientId, type: 'payment', amount: b.price, fee: b.clientFee, status: 'pending', relatedTaskId: t.id, label: `Reserved for “${t.title}”`, createdAt: nowIso(), demoOnly: true },
      { id: uid('tx'), userId: a.taskerId, type: 'earning', amount: b.price, fee: b.taskerFee, status: 'pending', relatedTaskId: t.id, label: `Pending for “${t.title}”`, createdAt: nowIso(), demoOnly: true },
    );
    notify(s, a.taskerId, tr('You were accepted for “{title}”.', { title: short(t.title) }), `/assignments/${asgId}`, clientId);
  });
  return ok({ assignmentId: asgId });
}

function syncTask(s, asg) {
  const task = s.tasks.find((x) => x.id === asg.taskId);
  const map = { accepted: 'assigned', in_progress: 'in_progress', awaiting_confirmation: 'awaiting_confirmation', completed: 'completed', disputed: 'disputed' };
  if (map[asg.status] && task.status !== map[asg.status]) task.status = map[asg.status];
  return task;
}

function setTx(s, taskId, status) {
  for (const tx of s.walletTransactions.filter((x) => x.relatedTaskId === taskId && ['pending', 'on_hold'].includes(x.status))) {
    tx.status = status;
    if (status === 'completed') tx.label = tx.label.replace(/^(Reserved for|Pending for|On hold:)/, tx.type === 'payment' ? 'Payment for' : 'Earning for');
    if (status === 'refunded') tx.label = tx.label.replace(/^(Reserved for|Pending for|On hold:)/, 'Refunded:');
  }
}

function participant(asg, userId) {
  const task = taskById(asg.taskId);
  if (asg.taskerId === userId) return 'tasker';
  if (task.clientId === userId) return 'client';
  return null;
}

export function startAssignment(asgId, userId) {
  const asg = assignmentById(asgId);
  if (!asg || participant(asg, userId) !== 'tasker') return fail({}, tr('Only the assigned tasker can start the task.'));
  if (!canMove('assignment', asg.status, 'in_progress')) return fail({}, tr('This task cannot be started now.'));
  update((s) => {
    const x = s.assignments.find((y) => y.id === asgId);
    move('assignment', x, 'in_progress');
    x.startedAt = nowIso();
    const task = syncTask(s, x);
    notify(s, task.clientId, tr('{name} started “{title}”.', { name: firstName(userById(userId)), title: short(task.title) }), `/assignments/${asgId}`, userId);
  });
  return ok();
}

function completeIn(s, asgId, byUserId) {
  const x = s.assignments.find((y) => y.id === asgId);
  move('assignment', x, 'completed');
  x.completedAt = nowIso();
  x.paymentStatus = 'released_demo';
  const task = syncTask(s, x);
  setTx(s, task.id, 'completed');
  const p = s.taskerProfiles.find((y) => y.userId === x.taskerId);
  if (p) p.completedTaskCount += 1;
  notify(s, x.taskerId, tr('“{title}” is complete. You can now leave a review.', { title: short(task.title) }), `/assignments/${asgId}/review`, byUserId);
  notify(s, task.clientId, tr('“{title}” is complete. You can now leave a review.', { title: short(task.title) }), `/assignments/${asgId}/review`, byUserId);
}

/** Either side can mark the work as done. Client = confirmed; tasker = waits for the client. */
export function markComplete(asgId, userId) {
  const asg = assignmentById(asgId);
  const who = asg && participant(asg, userId);
  if (!who) return fail({}, tr('Only the people on this task can mark it as completed.'));
  if (who === 'client') {
    if (!canMove('assignment', asg.status, 'completed')) return fail({}, tr('This task cannot be completed now.'));
    update((s) => completeIn(s, asgId, userId));
    return ok({ status: 'completed' });
  }
  if (!canMove('assignment', asg.status, 'awaiting_confirmation')) return fail({}, tr('This task cannot be marked as completed now.'));
  update((s) => {
    const x = s.assignments.find((y) => y.id === asgId);
    if (!x.startedAt) x.startedAt = nowIso();
    move('assignment', x, 'awaiting_confirmation');
    x.completionRequestedBy = userId;
    x.completionRequestedAt = nowIso();
    const task = syncTask(s, x);
    notify(s, task.clientId, tr('{name} marked “{title}” as completed. Please confirm.', { name: firstName(userById(userId)), title: short(task.title) }), `/assignments/${asgId}`, userId);
  });
  return ok({ status: 'awaiting_confirmation' });
}

export function confirmCompletion(asgId, clientId) {
  const asg = assignmentById(asgId);
  if (!asg || participant(asg, clientId) !== 'client') return fail({}, tr('Only the client can confirm completion.'));
  if (asg.status !== 'awaiting_confirmation') return fail({}, tr('There is nothing to confirm right now.'));
  update((s) => completeIn(s, asgId, clientId));
  return ok();
}

export function cancelAssignment(asgId, userId, reason = '') {
  const asg = assignmentById(asgId);
  const who = asg && participant(asg, userId);
  if (!who) return fail({}, tr('Only the people on this task can cancel it.'));
  if (!canMove('assignment', asg.status, 'cancelled') || asg.status === 'disputed') return fail({}, tr('This assignment cannot be cancelled now. If something went wrong, open a dispute.'));
  update((s) => {
    const x = s.assignments.find((y) => y.id === asgId);
    const task = s.tasks.find((y) => y.id === x.taskId);
    move('assignment', x, 'cancelled');
    x.cancelReason = reason;
    x.cancelledBy = userId;
    x.paymentStatus = 'refunded_demo';
    setTx(s, task.id, 'refunded');
    const app = s.applications.find((y) => y.id === x.applicationId);
    if (app && app.status === 'accepted') app.status = 'withdrawn';
    if (who === 'tasker') {
      task.status = 'open';
      const p = s.taskerProfiles.find((y) => y.userId === x.taskerId);
      if (p) p.cancelledByTasker = (p.cancelledByTasker || 0) + 1;
      notify(s, task.clientId, tr('{name} had to cancel “{title}”. Your task is open again.', { name: firstName(userById(userId)), title: short(task.title) }), `/tasks/${task.id}`, userId);
    } else {
      task.status = 'cancelled';
      notify(s, x.taskerId, tr('The client cancelled “{title}”. This does not affect your profile.', { title: short(task.title) }), `/assignments/${asgId}`, userId);
    }
  });
  return ok();
}

export function shareAddress(asgId, clientId) {
  const asg = assignmentById(asgId);
  if (!asg || participant(asg, clientId) !== 'client') return fail({}, tr('Only the client can share the address.'));
  const task = taskById(asg.taskId);
  if (!task.exactAddress) return fail({}, tr('Add the address in the task first.'));
  update((s) => {
    s.assignments.find((y) => y.id === asgId).addressShared = true;
    const conv = findConversation('task', task.id, [clientId, asg.taskerId]);
    if (conv) s.messages.push({ id: uid('m'), conversationId: conv.id, senderId: null, body: `${firstName(userById(clientId))} shared the exact address.`, createdAt: nowIso(), readBy: [...conv.participantIds], system: true, masked: false, simulated: false, hidden: false });
    notify(s, asg.taskerId, tr('The exact address for “{title}” is now visible to you.', { title: short(task.title) }), `/assignments/${asgId}`, clientId);
  });
  return ok();
}

export function setTaskAddress(taskId, clientId, address) {
  const t = taskById(taskId);
  if (!t || t.clientId !== clientId) return fail({}, tr('Task not found.'));
  if (String(address || '').trim().length < 5) return fail({ address: tr('Enter the full street address.') });
  update((s) => { s.tasks.find((x) => x.id === taskId).exactAddress = address.trim(); });
  return ok();
}

export function submitReview(asgId, reviewerId, d) {
  const asg = assignmentById(asgId);
  const who = asg && participant(asg, reviewerId);
  if (!who) return fail({}, tr('Only the people on this task can review it.'));
  if (asg.status === 'disputed') return fail({}, tr('Reviews are paused while a dispute is open.'));
  if (asg.status !== 'completed') return fail({}, tr('You can leave a review once the task is completed.'));
  if (reviewByFor(asgId, reviewerId)) return fail({}, tr('You have already reviewed this task.'));
  const errors = validateReview(d);
  if (hasErrors(errors)) return fail(errors);
  const task = taskById(asg.taskId);
  const revieweeId = who === 'client' ? asg.taskerId : task.clientId;
  update((s) => {
    s.reviews.unshift({
      id: uid('rv'), reviewerId, revieweeId, taskId: task.id, assignmentId: asgId, taskTitle: task.title,
      category: who === 'client' ? task.category : null, stars: Number(d.stars), tags: d.tags || [],
      comment: (d.comment || '').trim(), status: 'published', visibility: d.visibility === 'private' ? 'private' : 'public', createdAt: nowIso(),
    });
    notify(s, revieweeId, tr('{name} left you a review for “{title}”.', { name: firstName(userById(reviewerId)), title: short(task.title) }), who === 'client' ? `/profile/${revieweeId}` : `/assignments/${asgId}`, reviewerId);
  });
  return ok({ revieweeId });
}

// Used by the demo simulation and the applicant view: a sensible default proposal.
export function suggestedPrice(task) {
  return Math.round(((task.budgetMin + task.budgetMax) / 2) / 5) * 5;
}

export const feeNote = () => `Clients pay a ${Math.round(APP.fees.clientServiceRate * 100)}% service fee on top of the agreed price; taskers pay a ${Math.round(APP.fees.taskerPlatformRate * 100)}% platform fee. Both are shown before anyone accepts.`;

export const categoryName = (id) => category(id).label;
export const stateSnapshot = () => getState();
