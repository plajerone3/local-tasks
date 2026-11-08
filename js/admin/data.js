// Read-only views of the shared state for the backoffice: work queues, numbers, risk signals.
import { getState } from '../store.js';
import { userById, taskById, assignmentById, disputeById, businessOf, taskerProfileOf, tasksByClient, applicationsByTasker, reviewsAbout, reportsOn, assignmentsForUser, conversationById } from '../select.js';
import { REPORT_REASONS } from '../services/safety.js';
import { DEFAULT_SLA } from '../data/backoffice-seed.js';
import { standing } from '../logic/enforcement.js';
import { isHighRisk } from '../logic/flags.js';
import { round2, DAY_MS } from '../util.js';
import { CASE_TARGET } from '../services/backoffice.js';

export const KINDS = {
  report: { label: 'Reports', one: 'Report', icon: 'flag', perm: 'content.moderate' },
  flagged_task: { label: 'Flagged tasks', one: 'Flagged task', icon: 'alert', perm: 'content.moderate' },
  task_review: { label: 'Task approvals', one: 'Task approval', icon: 'check', perm: 'tasks.review' },
  flagged_message: { label: 'Flagged messages', one: 'Flagged message', icon: 'message', perm: 'content.moderate' },
  dispute: { label: 'Disputes', one: 'Dispute', icon: 'pause', perm: 'disputes.resolve' },
  payout: { label: 'Payouts', one: 'Payout', icon: 'wallet', perm: 'money.payouts' },
  identity: { label: 'ID checks', one: 'ID check', icon: 'shield', perm: 'users.verify' },
  business: { label: 'Business checks', one: 'Business check', icon: 'briefcase', perm: 'users.verify' },
  proof: { label: 'Proof checks', one: 'Proof check', icon: 'file', perm: 'users.verify' },
  data_request: { label: 'Data requests', one: 'Data request', icon: 'lock', perm: 'data.requests' },
};

export const PRIORITY = {
  urgent: { label: 'Urgent', tone: 'danger', rank: 0 },
  high: { label: 'High', tone: 'warn', rank: 1 },
  normal: { label: 'Normal', tone: 'info', rank: 2 },
  low: { label: 'Low', tone: 'neutral', rank: 3 },
};

const HIGH_REASONS = new Set(['scam', 'unsafe', 'harassment', 'discrimination']);
export const reasonLabel = (id) => REPORT_REASONS.find((r) => r.id === id)?.label || id;

/** Every open case across all queues, most pressing first. */
export function openCases(now = Date.now()) {
  const s = getState();
  const sla = { ...DEFAULT_SLA, ...(s.settings?.sla || {}) };
  const meta = s.caseMeta || {};
  const out = [];
  const add = (kind, id, o) => {
    const key = `${kind}:${id}`;
    const due = new Date(o.at).getTime() + sla[kind] * 36e5;
    out.push({ key, kind, id, href: `/case/${kind}/${id}`, assigneeId: meta[key]?.assigneeId || null, slaHours: sla[kind], dueAt: new Date(due).toISOString(), overdue: now > due, ...o });
  };

  for (const r of s.reports.filter((x) => x.status === 'pending_review')) {
    const others = s.reports.filter((x) => x.targetType === r.targetType && x.targetId === r.targetId).length;
    add('report', r.id, { at: r.createdAt, title: reasonLabel(r.reason), sub: reportTargetText(r), priority: HIGH_REASONS.has(r.reason) ? (others > 1 ? 'urgent' : 'high') : 'normal', people: [r.reporterId, reportOwner(r)].filter(Boolean) });
  }
  for (const t of s.tasks.filter((x) => x.flags?.length && !x.flagsReviewedAt && !x.hidden && x.status === 'open')) {
    add('flagged_task', t.id, { at: t.createdAt, title: t.title, sub: `${t.flags.length} risk signal${t.flags.length > 1 ? 's' : ''}`, priority: isHighRisk(t.flags) ? 'urgent' : 'normal', people: [t.clientId] });
  }
  for (const t of s.tasks.filter((x) => x.status === 'under_review')) {
    add('task_review', t.id, { at: t.createdAt, title: t.title, sub: t.autoHeld ? 'Held automatically: high-risk wording' : 'Category needs manual review', priority: t.autoHeld ? 'high' : 'normal', people: [t.clientId] });
  }
  for (const m of s.messages.filter((x) => x.flags?.length && !x.flagsReviewedAt && !x.hidden)) {
    add('flagged_message', m.id, { at: m.createdAt, title: `Message from ${userById(m.senderId)?.name || 'someone'}`, sub: m.body.slice(0, 90), priority: isHighRisk(m.flags) ? 'high' : 'normal', people: [m.senderId], conversationId: m.conversationId });
  }
  for (const d of s.disputes.filter((x) => x.status === 'open')) {
    const a = assignmentById(d.assignmentId);
    const t = a && taskById(a.taskId);
    add('dispute', d.id, { at: d.createdAt, title: t?.title || 'Dispute', sub: `€${a?.agreedPrice ?? '?'} on hold`, priority: 'high', people: [a?.taskerId, t?.clientId].filter(Boolean) });
  }
  for (const tx of s.walletTransactions.filter((x) => x.type === 'earning' && x.payoutStatus === 'awaiting_approval')) {
    add('payout', tx.id, { at: tx.createdAt, title: `${round2(tx.amount - tx.fee).toFixed(2)} € to ${userById(tx.userId)?.name || 'tasker'}`, sub: tx.payoutCheck === 'first_payout' ? 'First payout for this tasker' : 'Over the approval limit', priority: 'normal', people: [tx.userId] });
  }
  for (const u of s.users.filter((x) => x.verificationStatus === 'pending_review')) {
    add('identity', u.id, { at: u.verificationRequestedAt || u.createdAt, title: u.name, sub: 'Identity check requested', priority: 'low', people: [u.id] });
  }
  for (const b of s.businessProfiles.filter((x) => x.verifiedStatus === 'pending_review')) {
    add('business', b.userId, { at: b.verificationRequestedAt || b.recruitingConsentAt || userById(b.userId)?.createdAt, title: b.companyName || 'Business', sub: 'Company details to check', priority: b.recruitingEnabled ? 'normal' : 'low', people: [b.userId] });
  }
  for (const p of s.proofItems.filter((x) => x.status === 'pending_review')) {
    add('proof', p.id, { at: p.reviewRequestedAt || p.createdAt, title: p.label, sub: `From ${userById(p.taskerId)?.name || 'a tasker'}`, priority: 'low', people: [p.taskerId] });
  }
  for (const r of (s.dataRequests || []).filter((x) => x.status === 'received')) {
    add('data_request', r.id, { at: r.createdAt, title: r.type === 'deletion' ? 'Account deletion' : 'Data request', sub: userById(r.userId)?.name || '', priority: 'normal', people: [r.userId] });
  }
  return out.sort((a, b) => (a.overdue !== b.overdue ? (a.overdue ? -1 : 1) : PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || a.dueAt.localeCompare(b.dueAt)));
}

export const caseByKey = (key) => openCases().find((c) => c.key === key) || null;
export const caseTargetType = (kind) => CASE_TARGET[kind];

export function reportOwner(r) {
  const s = getState();
  if (r.targetType === 'user') return r.targetId;
  if (r.targetType === 'task') return s.tasks.find((t) => t.id === r.targetId)?.clientId || null;
  if (r.targetType === 'message') return s.messages.find((m) => m.id === r.targetId)?.senderId || null;
  if (r.targetType === 'conversation') return conversationById(r.targetId)?.participantIds.find((p) => p !== r.reporterId) || null;
  if (r.targetType === 'assignment') { const a = assignmentById(r.targetId); return a && (a.taskerId === r.reporterId ? taskById(a.taskId)?.clientId : a.taskerId); }
  return null;
}

export function reportTargetText(r) {
  if (r.targetType === 'task') return `Task: ${taskById(r.targetId)?.title || r.targetId}`;
  if (r.targetType === 'user') return `Profile: ${userById(r.targetId)?.name || r.targetId}`;
  if (r.targetType === 'message') return `Message: ${getState().messages.find((m) => m.id === r.targetId)?.body.slice(0, 70) || ''}`;
  if (r.targetType === 'assignment') return `Job: ${taskById(assignmentById(r.targetId)?.taskId)?.title || ''}`;
  if (r.targetType === 'conversation') return 'Conversation';
  return 'General';
}

// ---------- Numbers ----------

const within = (iso, days, now) => iso && now - new Date(iso).getTime() <= days * DAY_MS;

export function kpis(now = Date.now()) {
  const s = getState();
  const people = s.users.filter((u) => !u.roles.includes('moderator'));
  const paid = s.walletTransactions.filter((t) => t.type === 'payment' && t.status === 'completed');
  const earned = s.walletTransactions.filter((t) => t.type === 'earning' && t.status === 'completed');
  const sum = (arr, f) => round2(arr.reduce((a, x) => a + f(x), 0));
  const live = s.tasks.filter((t) => t.status === 'open' && !t.hidden);
  const active = s.tasks.filter((t) => ['assigned', 'in_progress', 'awaiting_confirmation'].includes(t.status));
  const doneAsg = s.assignments.filter((a) => a.status === 'completed');
  const closedAsg = s.assignments.filter((a) => ['completed', 'cancelled'].includes(a.status));
  const recentActors = new Set(s.activity.filter((e) => e.actorKind === 'user' && within(e.at, 1, now)).map((e) => e.actorId));
  const cases = openCases(now);
  return {
    users: people.length,
    newUsers7: people.filter((u) => within(u.createdAt, 7, now)).length,
    activeToday: recentActors.size,
    clients: people.filter((u) => u.roles.includes('client')).length,
    taskers: people.filter((u) => u.roles.includes('tasker')).length,
    businesses: people.filter((u) => u.roles.includes('business')).length,
    restricted: people.filter((u) => ['restricted', 'suspended', 'banned'].includes(standing(u, now))).length,
    liveTasks: live.length,
    activeJobs: active.length,
    posted7: s.tasks.filter((t) => within(t.createdAt, 7, now)).length,
    completionRate: closedAsg.length ? Math.round((doneAsg.length / closedAsg.length) * 100) : null,
    gmv: sum(paid, (t) => t.amount),
    revenue: round2(sum(paid, (t) => t.fee) + sum(earned, (t) => t.fee)),
    reserved: sum(s.walletTransactions.filter((t) => t.type === 'payment' && t.status === 'pending'), (t) => t.amount + t.fee),
    onHold: sum(s.walletTransactions.filter((t) => t.type === 'payment' && t.status === 'on_hold'), (t) => t.amount + t.fee),
    refunded: sum(s.walletTransactions.filter((t) => t.type === 'payment' && t.status === 'refunded'), (t) => t.amount + t.fee),
    payoutsWaiting: s.walletTransactions.filter((t) => t.payoutStatus === 'awaiting_approval').length,
    payoutsHeld: s.walletTransactions.filter((t) => t.payoutStatus === 'held').length,
    openCases: cases.length,
    overdue: cases.filter((c) => c.overdue).length,
    unassigned: cases.filter((c) => !c.assigneeId).length,
    events24: s.activity.filter((e) => within(e.at, 1, now)).length,
  };
}

/** Events per day for the last `days` days, oldest first. */
export function eventsPerDay(days = 14, filter = () => true, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => ({ day: new Date(start.getTime() - (days - 1 - i) * DAY_MS), n: 0 }));
  for (const e of getState().activity) {
    if (!filter(e)) continue;
    const t = new Date(e.at).getTime();
    const idx = days - 1 - Math.floor((start.getTime() + DAY_MS - 1 - t) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx].n += 1;
  }
  return buckets;
}

// ---------- People ----------

export function userStats(uid) {
  const s = getState();
  const posted = tasksByClient(uid);
  const apps = applicationsByTasker(uid);
  const jobs = assignmentsForUser(uid);
  const received = reviewsAbout(uid).filter((r) => r.status === 'published');
  const avg = received.length ? received.reduce((a, r) => a + r.stars, 0) / received.length : null;
  const earned = s.walletTransactions.filter((t) => t.userId === uid && t.type === 'earning' && t.status === 'completed').reduce((a, t) => a + t.amount - t.fee, 0);
  const spent = s.walletTransactions.filter((t) => t.userId === uid && t.type === 'payment' && t.status === 'completed').reduce((a, t) => a + t.amount + t.fee, 0);
  const lastEv = s.activity.find((e) => e.actorId === uid);
  return {
    posted: posted.length, applications: apps.length, jobs: jobs.length,
    completed: jobs.filter((a) => a.status === 'completed').length,
    reviews: received.length, avg, earned: round2(earned), spent: round2(spent),
    lastSeen: lastEv?.at || null,
  };
}

/** Plain facts that deserve a look before deciding anything about a person. */
export function riskSignals(uid, now = Date.now()) {
  const s = getState();
  const u = userById(uid);
  if (!u) return [];
  const out = [];
  const reportsAgainst = s.reports.filter((r) => reportOwner(r) === uid);
  const pending = reportsAgainst.filter((r) => r.status === 'pending_review');
  if (reportsAgainst.length) out.push({ tone: pending.length ? 'danger' : 'warn', text: `${reportsAgainst.length} report${reportsAgainst.length > 1 ? 's' : ''} about them${pending.length ? `, ${pending.length} open` : ''}` });
  if (u.warningCount) out.push({ tone: 'warn', text: `${u.warningCount} warning${u.warningCount > 1 ? 's' : ''} sent` });
  const flaggedTasks = s.tasks.filter((t) => t.clientId === uid && isHighRisk(t.flags));
  if (flaggedTasks.length) out.push({ tone: 'danger', text: `${flaggedTasks.length} high-risk task${flaggedTasks.length > 1 ? 's' : ''}` });
  const flaggedMsgs = s.messages.filter((m) => m.senderId === uid && m.flags?.length);
  if (flaggedMsgs.length) out.push({ tone: 'warn', text: `${flaggedMsgs.length} flagged message${flaggedMsgs.length > 1 ? 's' : ''}` });
  const blockedBy = s.blocks.filter((b) => b.blockedId === uid).length;
  if (blockedBy) out.push({ tone: 'warn', text: `Blocked by ${blockedBy} ${blockedBy > 1 ? 'people' : 'person'}` });
  const disputes = s.disputes.filter((d) => { const a = assignmentById(d.assignmentId); return a && (a.taskerId === uid || taskById(a.taskId)?.clientId === uid); });
  if (disputes.length) out.push({ tone: disputes.some((d) => d.status === 'open') ? 'warn' : 'neutral', text: `${disputes.length} dispute${disputes.length > 1 ? 's' : ''}` });
  const p = taskerProfileOf(uid);
  if (p?.cancelledByTasker > 1) out.push({ tone: 'warn', text: `Cancelled ${p.cancelledByTasker} jobs` });
  if (now - new Date(u.createdAt).getTime() < 3 * DAY_MS) out.push({ tone: 'info', text: 'New account (under 3 days)' });
  return out;
}

export const userKind = (u) => (u.roles.includes('business') ? 'Business' : u.roles.includes('moderator') ? 'In-app moderator' : u.roles.map((r) => r[0].toUpperCase() + r.slice(1)).join(' + '));
export const companyOf = (u) => businessOf(u.id)?.companyName || null;
export const notesFor = (type, id) => (getState().staffNotes || []).filter((n) => n.targetType === type && n.targetId === id);
export const reportsAbout = (type, id) => reportsOn(type, id);
export { disputeById };
