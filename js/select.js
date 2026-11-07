// Read-only queries over the state. Views and services use these instead of reaching into state.
import { getState, session } from './store.js';
import { defaultPolicy } from './data/categories.js';

const st = () => getState();
const byId = (coll, id) => st()[coll].find((x) => x.id === id) || null;

export const userById = (id) => byId('users', id);
export const taskById = (id) => byId('tasks', id);
export const applicationById = (id) => byId('applications', id);
export const assignmentById = (id) => byId('assignments', id);
export const conversationById = (id) => byId('conversations', id);
export const connectionById = (id) => byId('businessConnections', id);
export const reportById = (id) => byId('reports', id);
export const disputeById = (id) => byId('disputes', id);
export const proofById = (id) => byId('proofItems', id);

export function me() {
  const s = session.get();
  return s ? userById(s.userId) : null;
}

export function myRole() {
  const u = me();
  if (!u) return null;
  const s = session.get();
  return u.roles.includes(s?.role) ? s.role : u.roles[0];
}

export const taskerProfileOf = (uid) => st().taskerProfiles.find((p) => p.userId === uid) || null;
export const businessOf = (uid) => st().businessProfiles.find((p) => p.userId === uid) || null;

export function publicName(u) {
  if (!u) return 'Unknown';
  if (u.roles.includes('business')) return businessOf(u.id)?.companyName || u.name;
  const parts = u.name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0];
}
export const firstName = (u) => (u?.roles.includes('business') ? publicName(u) : String(u?.name || '').split(' ')[0]);

export const policyOf = (catId) => st().categoryPolicy[catId] || defaultPolicy(catId);

export const tasksByClient = (uid) => st().tasks.filter((t) => t.clientId === uid);
export const applicationsForTask = (taskId) => st().applications.filter((a) => a.taskId === taskId);
export const activeApplicationsForTask = (taskId) => applicationsForTask(taskId).filter((a) => a.status !== 'withdrawn');
export const applicationsByTasker = (uid) => st().applications.filter((a) => a.taskerId === uid);
export const myApplication = (taskId, uid) => st().applications.find((a) => a.taskId === taskId && a.taskerId === uid && a.status !== 'withdrawn') || null;

export function assignmentForTask(taskId) {
  const list = st().assignments.filter((a) => a.taskId === taskId);
  return list.find((a) => a.status !== 'cancelled') || list.at(-1) || null;
}

export function assignmentsForUser(uid) {
  return st().assignments.filter((a) => a.taskerId === uid || taskById(a.taskId)?.clientId === uid);
}

export function counterpartId(assignment, uid) {
  const task = taskById(assignment.taskId);
  return uid === assignment.taskerId ? task.clientId : assignment.taskerId;
}

export const reviewsAbout = (uid) => st().reviews.filter((r) => r.revieweeId === uid);
export const publicReviewsAbout = (uid) => reviewsAbout(uid).filter((r) => r.status === 'published' && r.visibility !== 'private');
export const reviewByFor = (assignmentId, reviewerId) => st().reviews.find((r) => r.assignmentId === assignmentId && r.reviewerId === reviewerId) || null;
export const reviewsForAssignment = (assignmentId) => st().reviews.filter((r) => r.assignmentId === assignmentId);

export const proofsOf = (uid) => st().proofItems.filter((p) => p.taskerId === uid);

export function visibleProofs(ownerId, viewer) {
  const all = proofsOf(ownerId);
  if (!viewer) return all.filter((p) => p.visibility === 'public');
  if (viewer.id === ownerId || viewer.roles.includes('moderator')) return all;
  if (viewer.roles.includes('business')) return all.filter((p) => p.visibility !== 'private');
  return all.filter((p) => p.visibility === 'public');
}

export const transactionsOf = (uid) => st().walletTransactions.filter((t) => t.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function messagesOf(convId) {
  return st().messages.filter((m) => m.conversationId === convId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function conversationsOf(uid) {
  return st().conversations
    .filter((c) => c.participantIds.includes(uid))
    .map((c) => ({ c, last: messagesOf(c.id).at(-1) }))
    .sort((a, b) => (b.last?.createdAt || b.c.createdAt).localeCompare(a.last?.createdAt || a.c.createdAt))
    .map((x) => x.c);
}

export const unreadIn = (convId, uid) => messagesOf(convId).filter((m) => !m.readBy.includes(uid) && m.senderId !== uid).length;
export const unreadMessages = (uid) => conversationsOf(uid).filter((c) => !isBlocked(uid, otherParticipant(c, uid))).reduce((a, c) => a + unreadIn(c.id, uid), 0);
export const otherParticipant = (conv, uid) => conv.participantIds.find((p) => p !== uid);

export function findConversation(contextType, contextId, participants) {
  return st().conversations.find((c) => c.contextType === contextType && c.contextId === contextId && participants.every((p) => c.participantIds.includes(p))) || null;
}

export const notificationsOf = (uid) => st().notifications.filter((n) => n.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const unreadNotifications = (uid) => notificationsOf(uid).filter((n) => !n.read).length;

export const reportsOn = (type, targetId) => st().reports.filter((r) => r.targetType === type && r.targetId === targetId);
export const pendingReportsOn = (type, targetId) => reportsOn(type, targetId).filter((r) => r.status === 'pending_review');
export const reportsBy = (uid) => st().reports.filter((r) => r.reporterId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const isBlocked = (a, b) => !!(a && b) && st().blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
export const blockedBy = (uid) => st().blocks.filter((b) => b.blockerId === uid);

export const disputeForAssignment = (assignmentId) => st().disputes.filter((d) => d.assignmentId === assignmentId).at(-1) || null;
export const disputesOf = (uid) => st().disputes.filter((d) => {
  const a = assignmentById(d.assignmentId);
  return a && (a.taskerId === uid || taskById(a.taskId)?.clientId === uid);
});

export const connectionsOfBusiness = (bid) => st().businessConnections.filter((c) => c.businessId === bid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const connectionsOfTasker = (tid) => st().businessConnections.filter((c) => c.taskerId === tid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const connectionBetween = (bid, tid) => st().businessConnections.filter((c) => c.businessId === bid && c.taskerId === tid && c.status !== 'withdrawn').at(-1) || null;
export const savedBy = (bid) => st().savedCandidates.filter((x) => x.businessId === bid);
export const isSaved = (bid, tid) => st().savedCandidates.some((x) => x.businessId === bid && x.taskerId === tid);

export const taskers = () => st().users.filter((u) => u.roles.includes('tasker')).map((u) => ({ user: u, profile: taskerProfileOf(u.id) })).filter((x) => x.profile);
export const moderators = () => st().users.filter((u) => u.roles.includes('moderator'));
export const demoAccounts = () => st().users.filter((u) => u.demo);

// Tasks a viewer may see in public lists.
export function visibleTasks(viewer) {
  return st().tasks.filter((t) => {
    if (t.hidden && t.clientId !== viewer?.id && !viewer?.roles.includes('moderator')) return false;
    if (viewer && isBlocked(viewer.id, t.clientId)) return false;
    return true;
  });
}

export function clientSummary(uid) {
  const posted = tasksByClient(uid);
  const reviews = publicReviewsAbout(uid);
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : null;
  return { posted: posted.length, completed: posted.filter((t) => t.status === 'completed').length, reviewCount: reviews.length, avg };
}

export const deletionRequestOf = (uid) => st().dataRequests.find((r) => r.userId === uid && r.type === 'deletion') || null;
