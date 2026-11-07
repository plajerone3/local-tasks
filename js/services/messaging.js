// Conversations tied to a task or a recruiting connection.
// Contact details are masked until the task is accepted or the connection is accepted.
// TODO(backend): real-time delivery (WebSocket/SSE), push and email notifications.
import { tr } from '../i18n.js';
import { update, getState } from '../store.js';
import { conversationById, taskById, assignmentForTask, connectionById, findConversation, userById, firstName, isBlocked, publicName } from '../select.js';
import { uid, nowIso } from '../util.js';
import { maskContacts } from '../logic/privacy.js';
import { validateMessage, hasErrors } from '../logic/validation.js';
import { ok, fail, notify, short, emitHook } from './common.js';

export function contactUnlocked(conv) {
  if (!conv) return false;
  if (conv.contextType === 'recruiting') return connectionById(conv.contextId)?.status === 'accepted';
  if (conv.contextType === 'task') {
    const asg = assignmentForTask(conv.contextId);
    return !!asg && asg.status !== 'cancelled' && conv.participantIds.includes(asg.taskerId);
  }
  return false;
}

export function ensureTaskConversation(taskId, otherId) {
  const task = taskById(taskId);
  if (!task) return fail({}, tr('Task not found.'));
  const participants = [task.clientId, otherId];
  const existing = findConversation('task', taskId, participants);
  if (existing) return ok({ id: existing.id });
  const id = uid('c');
  update((s) => { s.conversations.push({ id, contextType: 'task', contextId: taskId, participantIds: participants, createdAt: nowIso() }); });
  return ok({ id });
}

export function sendMessage(convId, senderId, body, { simulated = false } = {}) {
  const conv = conversationById(convId);
  if (!conv || !conv.participantIds.includes(senderId)) return fail({}, tr('Conversation not found.'));
  const other = conv.participantIds.find((p) => p !== senderId);
  if (isBlocked(senderId, other)) return fail({}, tr('You cannot message this person because one of you has blocked the other.'));
  const errors = validateMessage({ body });
  if (hasErrors(errors)) return fail(errors);
  const unlocked = contactUnlocked(conv);
  const { text, masked } = unlocked ? { text: body.trim(), masked: false } : maskContacts(body.trim());
  update((s) => {
    s.messages.push({ id: uid('m'), conversationId: convId, senderId, body: text, createdAt: nowIso(), readBy: [senderId], system: false, masked, simulated, hidden: false });
    const context = conv.contextType === 'task' ? `“${short(taskById(conv.contextId)?.title || tr('a task'))}”` : tr('your recruiting conversation');
    notify(s, other, tr('New message from {name} about {context}.', { name: conv.contextType === 'recruiting' ? publicName(userById(senderId)) : firstName(userById(senderId)), context }), `/messages/${convId}`, senderId);
  });
  if (!simulated) emitHook('message', { convId, senderId });
  return ok({ masked });
}

export function markRead(convId, userId) {
  const unread = getState().messages.some((m) => m.conversationId === convId && !m.readBy.includes(userId));
  const notes = getState().notifications.some((n) => n.userId === userId && !n.read && n.href === `/messages/${convId}`);
  if (!unread && !notes) return false;
  update((s) => {
    for (const m of s.messages) if (m.conversationId === convId && !m.readBy.includes(userId)) m.readBy.push(userId);
    for (const n of s.notifications) if (n.userId === userId && n.href === `/messages/${convId}`) n.read = true;
  });
  return true;
}
