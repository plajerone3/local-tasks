// Backoffice demo data: staff accounts, rules, a few past staff decisions, risk flags on the
// seeded tasks and messages, and an activity history back-filled from the seeded records,
// so the activity feed and every timeline start with the app's past instead of empty.
import { defaultFlagSettings, scanTask, scanText } from '../logic/flags.js';
import { isStaffId } from '../logic/staff.js';

export const DEFAULT_SLA = {
  report: 24, flagged_task: 6, task_review: 12, flagged_message: 24, dispute: 48,
  payout: 24, proof: 72, identity: 72, business: 72, data_request: 720,
};

export function defaultSettings() {
  return {
    flags: defaultFlagSettings(),
    sla: { ...DEFAULT_SLA },
    payoutApprovalOver: 150,
    firstPayoutNeedsApproval: true,
    announcement: null,
  };
}

// Raw texts of seeded messages that were masked on send (so the scanner sees what was typed).
const RAW_MESSAGES = {
  c_scam_lukas: 'Hi! Easy money, I pay cash every evening. Write me on WhatsApp +43 660 123 45 67 and send a copy of your ID first.',
};

export function addBackoffice(s, { ago, id }) {
  s.settings = defaultSettings();
  s.caseMeta = {};
  s.staffNotes = [];
  s.accessLog = [];

  s.staff = [
    { id: 'st_jakob', name: 'Jakob', email: 'jakob@localtasks.example', role: 'owner', title: 'Founder', active: true, createdAt: ago(420), color: '#121212' },
    { id: 'st_nora', name: 'Nora Lechner', email: 'nora@localtasks.example', role: 'admin', title: 'Head of Operations', active: true, createdAt: ago(300), color: '#3D5AFE' },
    { id: 'st_mira', name: 'Mira Hofbauer', email: 'mira@localtasks.example', role: 'trust_safety', title: 'Trust & Safety lead', active: true, createdAt: ago(400), color: '#FF5A3C' },
    { id: 'st_tarik', name: 'Tarik Hasanović', email: 'tarik@localtasks.example', role: 'support', title: 'Support agent', active: true, createdAt: ago(120), color: '#22C08B' },
    { id: 'st_lea', name: 'Lea Brandstätter', email: 'lea@localtasks.example', role: 'finance', title: 'Finance', active: true, createdAt: ago(200), color: '#FFC933' },
    { id: 'st_samir', name: 'Samir Haddad', email: 'samir@localtasks.example', role: 'analyst', title: 'Data analyst', active: true, createdAt: ago(30), color: '#9C7BFF' },
    { id: 'st_felix', name: 'Felix Auer', email: 'felix@localtasks.example', role: 'support', title: 'Support (left the team)', active: false, createdAt: ago(380), color: '#8A8A8A' },
  ];

  // Risk flags on seeded content.
  for (const t of s.tasks) { t.flags = scanTask(t, s.settings.flags); t.autoHeld = false; }
  for (const m of s.messages) {
    if (m.system || !m.senderId) continue;
    const raw = (m.masked && RAW_MESSAGES[m.conversationId]) || m.body;
    const flags = scanText(raw, s.settings.flags);
    if (flags.length) m.flags = flags;
  }

  // Payouts: historic earnings were paid out long ago; the most recent one was approved by finance.
  for (const tx of s.walletTransactions) if (tx.type === 'earning' && tx.status === 'completed') tx.payoutStatus = 'approved';

  // When the open checks were requested (so target times start from a sensible moment).
  const asked = { u_ferdinand: ago(1, 3), u_mehmet: ago(2, 6), u_ana: ago(0, 20) };
  for (const u of s.users) if (u.verificationStatus === 'pending_review') u.verificationRequestedAt = asked[u.id] || ago(1);
  s.businessProfiles.forEach((b, i) => { if (b.verifiedStatus === 'pending_review') b.verificationRequestedAt = ago(i + 1, i * 2); });
  s.proofItems.filter((p) => p.status === 'pending_review').forEach((p, i) => { p.reviewRequestedAt = ago(Math.floor(i / 2), 3 + i * 4); });

  // The spam account received a warning when the older report was upheld.
  const spam = s.users.find((u) => u.id === 'u_spam');
  if (spam) spam.warningCount = 1;

  // Case work already in progress.
  s.caseMeta['report:rp_scam'] = { assigneeId: 'st_mira', assignedAt: ago(0, 4) };
  s.caseMeta['dispute:dp_storage'] = { assigneeId: 'st_lea', assignedAt: ago(1, 20) };
  s.staffNotes.push(
    { id: id('note'), targetType: 'report', targetId: 'rp_scam', staffId: 'st_mira', body: 'Same pattern as the spam report yesterday: same account, now with WhatsApp and ID copies. Leaning towards hide + ban.', createdAt: ago(0, 4) },
    { id: id('note'), targetType: 'user', targetId: 'u_spam', staffId: 'st_mira', body: 'Account is one day old. Warned once for advertising. Watch for new tasks.', createdAt: ago(0, 22) },
    { id: id('note'), targetType: 'dispute', targetId: 'dp_storage', staffId: 'st_lea', body: 'Both sides agree on what happened. A partial payment (about two thirds) looks fair; waiting for photos of the broken glasses.', createdAt: ago(1, 18) },
  );
  s.accessLog.push({ id: id('acc'), staffId: 'st_lea', conversationId: 'c_storage', reason: 'Dispute dp_storage: read what both sides said about the damage.', createdAt: ago(1, 19) });

  backfill(s, ago);
}

// ---------- History ----------

function backfill(s, ago) {
  const ev = [];
  let n = 0;
  const E = (at, type, o = {}) => {
    if (!at) return;
    ev.push({ id: `ev_seed_${(++n).toString(36)}`, at, type, actorId: o.actorId ?? null, actorKind: !o.actorId ? 'system' : isStaffId(o.actorId) ? 'staff' : 'user', targetType: o.targetType ?? null, targetId: o.targetId ?? null, ...(o.meta ? { meta: o.meta } : {}), ...(o.reason ? { reason: o.reason } : {}) });
  };
  const plus = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 6e4).toISOString();

  for (const u of s.users) E(u.createdAt, 'account_created', { actorId: u.id, targetType: 'user', targetId: u.id, meta: { roles: u.roles } });
  for (const t of s.tasks) {
    E(t.createdAt, 'task_published', { actorId: t.clientId, targetType: 'task', targetId: t.id, meta: { status: t.status === 'under_review' ? 'under_review' : 'open', category: t.category, budgetMax: t.budgetMax } });
    if (t.flags?.length) E(plus(t.createdAt, 0.2), 'task_flagged', { targetType: 'task', targetId: t.id, meta: { rules: t.flags.map((f) => f.rule) } });
    if (t.status === 'cancelled') E(plus(t.createdAt, 60 * 20), 'task_cancelled', { actorId: t.clientId, targetType: 'task', targetId: t.id });
  }
  for (const a of s.applications) {
    E(a.createdAt, 'application_sent', { actorId: a.taskerId, targetType: 'task', targetId: a.taskId, meta: { applicationId: a.id, rate: a.proposedRate } });
    if (a.shortlistedAt) E(a.shortlistedAt, 'application_shortlisted', { actorId: s.tasks.find((t) => t.id === a.taskId)?.clientId, targetType: 'task', targetId: a.taskId, meta: { applicationId: a.id, taskerId: a.taskerId } });
  }
  for (const x of s.assignments) {
    const task = s.tasks.find((t) => t.id === x.taskId);
    E(x.acceptedAt, 'application_accepted', { actorId: task?.clientId, targetType: 'assignment', targetId: x.id, meta: { taskId: x.taskId, taskerId: x.taskerId, price: x.agreedPrice } });
    E(x.startedAt, 'assignment_started', { actorId: x.taskerId, targetType: 'assignment', targetId: x.id, meta: { taskId: x.taskId } });
    E(x.completionRequestedAt, 'completion_requested', { actorId: x.taskerId, targetType: 'assignment', targetId: x.id, meta: { taskId: x.taskId } });
    if (x.status === 'completed') E(x.completedAt, 'assignment_completed', { actorId: task?.clientId, targetType: 'assignment', targetId: x.id, meta: { taskId: x.taskId, price: x.agreedPrice } });
  }
  for (const r of s.reviews) E(r.createdAt, 'review_posted', { actorId: r.reviewerId, targetType: 'review', targetId: r.id, meta: { stars: r.stars, revieweeId: r.revieweeId, taskId: r.taskId } });
  for (const m of s.messages) {
    if (m.system || !m.senderId) continue;
    E(m.createdAt, 'message_sent', { actorId: m.senderId, targetType: 'conversation', targetId: m.conversationId, meta: { messageId: m.id, masked: !!m.masked } });
    if (m.flags?.length) E(plus(m.createdAt, 0.1), 'message_flagged', { targetType: 'conversation', targetId: m.conversationId, meta: { messageId: m.id, rules: m.flags.map((f) => f.rule) } });
  }
  for (const p of s.proofItems) E(p.createdAt, p.status === 'pending_review' ? 'proof_review_requested' : 'proof_added', { actorId: p.taskerId, targetType: 'proof', targetId: p.id, meta: { label: p.label } });
  for (const c of s.businessConnections) {
    E(c.createdAt, 'connection_sent', { actorId: c.businessId, targetType: 'connection', targetId: c.id, meta: { taskerId: c.taskerId } });
    if (c.status === 'accepted') E(c.respondedAt, 'connection_accepted', { actorId: c.taskerId, targetType: 'connection', targetId: c.id, meta: { businessId: c.businessId } });
  }
  for (const r of s.reports) {
    E(r.createdAt, 'report_created', { actorId: r.reporterId, targetType: 'report', targetId: r.id, meta: { reason: r.reason, about: r.targetType, aboutId: r.targetId } });
    if (r.status === 'resolved') {
      E(r.resolvedAt, `report_${r.decision}`, { actorId: r.resolvedBy, targetType: 'report', targetId: r.id, reason: r.note, meta: { about: r.targetType, aboutId: r.targetId } });
      if (r.decision === 'warning') E(plus(r.resolvedAt, 0.1), 'user_warned', { actorId: r.resolvedBy, targetType: 'user', targetId: r.targetId, reason: r.note });
    }
  }
  for (const d of s.disputes) {
    const a = s.assignments.find((x) => x.id === d.assignmentId);
    E(d.createdAt, 'dispute_opened', { actorId: d.openedBy, targetType: 'dispute', targetId: d.id, meta: { reason: d.reason, assignmentId: d.assignmentId, taskId: a?.taskId } });
  }
  for (const r of s.dataRequests) E(r.createdAt, 'deletion_requested', { actorId: r.userId, targetType: 'data_request', targetId: r.id });

  // Staff history: sign-ins, case work, privacy access, a settings change, an export.
  const staffDays = { st_jakob: [0, 1, 3], st_nora: [0, 1, 2], st_mira: [0, 1, 2, 3], st_tarik: [0, 1, 2], st_lea: [1, 2], st_samir: [1, 4] };
  Object.entries(staffDays).forEach(([sid, days], i) => days.forEach((d) => E(ago(d, 8 - i * 0.4), 'staff_signed_in', { actorId: sid, targetType: 'staff', targetId: sid })));
  E(ago(30), 'staff_added', { actorId: 'st_jakob', targetType: 'staff', targetId: 'st_samir', meta: { role: 'analyst' } });
  E(ago(25), 'staff_deactivated', { actorId: 'st_nora', targetType: 'staff', targetId: 'st_felix', reason: 'Left the company at the end of the month.' });
  E(ago(10), 'settings_changed', { actorId: 'st_nora', targetType: 'settings', targetId: 'payouts', meta: { field: 'payoutApprovalOver', before: 100, after: 150 }, reason: 'Fewer manual checks for normal jobs; first payouts still need approval.' });
  E(ago(1, 20), 'case_assigned', { actorId: 'st_lea', targetType: 'dispute', targetId: 'dp_storage', meta: { assigneeId: 'st_lea' } });
  E(ago(1, 19), 'conversation_viewed', { actorId: 'st_lea', targetType: 'conversation', targetId: 'c_storage', reason: 'Dispute dp_storage: read what both sides said about the damage.' });
  E(ago(1, 18), 'note_added', { actorId: 'st_lea', targetType: 'dispute', targetId: 'dp_storage' });
  E(ago(0, 22), 'note_added', { actorId: 'st_mira', targetType: 'user', targetId: 'u_spam' });
  E(ago(0, 4), 'case_assigned', { actorId: 'st_mira', targetType: 'report', targetId: 'rp_scam', meta: { assigneeId: 'st_mira' } });
  E(ago(0, 4), 'note_added', { actorId: 'st_mira', targetType: 'report', targetId: 'rp_scam' });
  E(ago(2, 3), 'export_downloaded', { actorId: 'st_samir', targetType: 'export', targetId: 'activity', meta: { rows: 412 } });

  ev.sort((a, b) => b.at.localeCompare(a.at));
  s.activity = ev.concat(s.activity || []).slice(0, 3000);
}
