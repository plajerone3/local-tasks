// What each activity entry means, how it is grouped, and how it reads in a feed.
// "{target}" is replaced by a link to the thing the event is about.
import { html } from '../ui/html.js';
import { getState } from '../store.js';
import { userById, taskById, staffById, assignmentById, disputeById, reportById, conversationById, businessOf } from '../select.js';
import { category } from '../data/categories.js';
import { fmt } from '../i18n.js';
import { flagLabel } from '../logic/flags.js';
import { roleLabel } from '../logic/staff.js';

export const GROUPS = {
  accounts: 'Accounts', tasks: 'Tasks', work: 'Applications & jobs', money: 'Money', messages: 'Messages',
  reviews: 'Reviews', safety: 'Safety', recruiting: 'Recruiting', staff: 'Staff actions',
};

const E = (group, text, tone = 'neutral') => ({ group, text, tone });

export const EVENTS = {
  // Accounts
  account_created: E('accounts', 'created an account', 'success'),
  signed_in: E('accounts', 'signed in'),
  signed_out: E('accounts', 'signed out'),
  role_added: E('accounts', 'added a role'),
  account_updated: E('accounts', 'updated their account details'),
  profile_updated: E('accounts', 'updated their profile'),
  onboarding_finished: E('accounts', 'finished onboarding'),
  discoverability_on: E('recruiting', 'became visible to businesses'),
  discoverability_off: E('recruiting', 'stopped being visible to businesses'),
  available_on: E('accounts', 'switched to “available now”'),
  available_off: E('accounts', 'switched “available now” off'),
  proof_added: E('accounts', 'added proof'),
  proof_review_requested: E('accounts', 'sent proof for review', 'warn'),
  proof_visibility_changed: E('accounts', 'changed who sees a proof'),
  proof_removed: E('accounts', 'removed a proof'),
  business_profile_saved: E('recruiting', 'saved the business profile'),
  business_check_requested: E('recruiting', 'sent business details for review', 'warn'),
  recruiting_on: E('recruiting', 'turned recruiting on'),
  recruiting_off: E('recruiting', 'turned recruiting off'),
  data_exported: E('accounts', 'downloaded their data'),
  deletion_requested: E('accounts', 'asked for their account to be deleted', 'warn'),
  // Tasks
  task_published: E('tasks', 'posted {target}', 'success'),
  task_flagged: E('safety', 'flagged {target} automatically', 'warn'),
  task_auto_held: E('safety', 'held {target} for review (high risk)', 'danger'),
  task_cancelled: E('tasks', 'cancelled {target}'),
  task_address_set: E('tasks', 'added the address to {target}'),
  tasker_invited: E('tasks', 'invited a tasker to {target}'),
  // Work
  application_sent: E('work', 'applied to {target}'),
  application_withdrawn: E('work', 'withdrew an application for {target}'),
  application_shortlisted: E('work', 'shortlisted an applicant for {target}'),
  application_unshortlisted: E('work', 'took an applicant off the shortlist for {target}'),
  application_declined: E('work', 'declined an applicant for {target}'),
  application_accepted: E('work', 'accepted a tasker for {target}', 'success'),
  assignment_started: E('work', 'started {target}'),
  completion_requested: E('work', 'marked {target} as done'),
  assignment_completed: E('work', 'completed {target}', 'success'),
  assignment_cancelled: E('work', 'cancelled the job {target}', 'warn'),
  address_shared: E('work', 'shared the address for {target}'),
  conversation_started: E('messages', 'started a conversation {target}'),
  message_sent: E('messages', 'sent a message {target}'),
  message_flagged: E('safety', 'flagged a message {target}', 'warn'),
  review_posted: E('reviews', 'reviewed {target}'),
  // Money
  payment_reserved: E('money', 'reserved the payment for {target}'),
  payment_released: E('money', 'released the payment for {target}', 'success'),
  payment_refunded: E('money', 'refunded the payment for {target}'),
  payout_queued: E('money', 'queued a payout for approval {target}', 'warn'),
  payout_approved: E('money', 'approved a payout {target}', 'success'),
  payout_held: E('money', 'put a payout on hold {target}', 'danger'),
  refund_issued: E('money', 'issued a goodwill refund {target}'),
  // Safety (users)
  report_created: E('safety', 'reported {target}', 'danger'),
  user_blocked: E('safety', 'blocked {target}', 'warn'),
  user_unblocked: E('safety', 'unblocked {target}'),
  dispute_opened: E('safety', 'opened a dispute {target}', 'danger'),
  // Recruiting
  candidate_saved: E('recruiting', 'saved {target} as a candidate'),
  candidate_unsaved: E('recruiting', 'removed {target} from saved candidates'),
  connection_sent: E('recruiting', 'sent a connection request {target}'),
  connection_accepted: E('recruiting', 'accepted a connection request {target}', 'success'),
  connection_declined: E('recruiting', 'declined a connection request {target}'),
  connection_withdrawn: E('recruiting', 'withdrew a connection request {target}'),
  connection_outcome: E('recruiting', 'recorded an outcome {target}'),
  // Staff and moderators
  staff_signed_in: E('staff', 'signed in to the backoffice'),
  staff_signed_out: E('staff', 'signed out of the backoffice'),
  case_assigned: E('staff', 'assigned {target}'),
  case_unassigned: E('staff', 'unassigned {target}'),
  note_added: E('staff', 'added a note to {target}'),
  report_no_action: E('staff', 'closed {target} with no action', 'success'),
  report_warning: E('staff', 'upheld {target} and sent a warning', 'warn'),
  report_hidden: E('staff', 'upheld {target} and hid the content', 'danger'),
  task_approve: E('staff', 'approved {target}', 'success'),
  task_decline: E('staff', 'declined {target}', 'danger'),
  flags_cleared: E('staff', 'cleared the flags on {target}', 'success'),
  task_hidden: E('staff', 'hid {target}', 'danger'),
  task_unhidden: E('staff', 'made {target} visible again'),
  task_edited: E('staff', 'edited {target}', 'warn'),
  task_force_cancelled: E('staff', 'cancelled {target}', 'danger'),
  message_hidden: E('staff', 'hid a message {target}', 'danger'),
  message_unhidden: E('staff', 'restored a message {target}'),
  conversation_viewed: E('staff', 'opened the private conversation {target}', 'warn'),
  review_removed: E('staff', 'removed {target}', 'danger'),
  review_restored: E('staff', 'restored {target}'),
  user_warned: E('staff', 'warned {target}', 'warn'),
  user_notified: E('staff', 'sent a notice to {target}'),
  user_restricted: E('staff', 'restricted {target}', 'danger'),
  user_suspended: E('staff', 'suspended {target}', 'danger'),
  user_banned: E('staff', 'banned {target}', 'danger'),
  user_reinstated: E('staff', 'reinstated {target}', 'success'),
  identity_verified: E('staff', 'checked the identity of {target}', 'success'),
  identity_rejected: E('staff', 'could not confirm the identity of {target}', 'danger'),
  business_verified: E('staff', 'checked the business details of {target}', 'success'),
  business_rejected: E('staff', 'could not confirm the business details of {target}', 'danger'),
  proof_verified: E('staff', 'checked {target}', 'success'),
  proof_rejected: E('staff', 'could not confirm {target}', 'danger'),
  impersonation_started: E('staff', 'opened the app as {target}', 'warn'),
  dispute_release: E('staff', 'resolved {target}: payment released', 'success'),
  dispute_refund: E('staff', 'resolved {target}: client refunded', 'warn'),
  dispute_partial: E('staff', 'resolved {target}: split payment', 'warn'),
  dispute_resume: E('staff', 'resolved {target}: the job continues'),
  data_request_completed: E('staff', 'completed {target}', 'success'),
  announcement_sent: E('staff', 'sent an announcement to {target}'),
  staff_added: E('staff', 'added {target} to the team', 'success'),
  staff_role_changed: E('staff', 'changed the role of {target}', 'warn'),
  staff_deactivated: E('staff', 'deactivated {target}', 'danger'),
  staff_reactivated: E('staff', 'reactivated {target}'),
  settings_changed: E('staff', 'changed {target}', 'warn'),
  category_open: E('staff', 'opened the category {target}', 'warn'),
  category_review: E('staff', 'set {target} to manual review', 'warn'),
  category_soon: E('staff', 'closed the category {target}', 'warn'),
  export_downloaded: E('staff', 'downloaded an export {target}'),
};

export const eventInfo = (type) => EVENTS[type] || E('accounts', type.replace(/_/g, ' '));
export const isDecision = (ev) => ev.actorKind === 'staff' && !['staff_signed_in', 'staff_signed_out', 'note_added', 'case_assigned', 'case_unassigned'].includes(ev.type);

// ---------- Names and links ----------

export function nameOf(id) {
  if (!id) return 'System';
  const st = staffById(id);
  if (st) return st.name;
  const u = userById(id);
  if (!u) return 'Unknown';
  if (u.roles.includes('business')) return businessOf(u.id)?.companyName || u.name;
  return u.name;
}

export function actorLink(id) {
  if (!id) return html`<span class="bo-actor bo-actor--system">System</span>`;
  if (staffById(id)) return html`<a class="bo-actor bo-actor--staff" href="#/staff">${nameOf(id)}</a>`;
  if (userById(id)) return html`<a class="bo-actor" href="#/users/${id}">${nameOf(id)}</a>`;
  return html`<span class="bo-actor">${nameOf(id)}</span>`;
}

const q = (t) => html`“${t}”`;
const link = (href, text) => html`<a href="#${href}">${text}</a>`;

/** A link to the thing an event or record is about. */
export function targetLink(type, id, meta = {}) {
  const s = getState();
  switch (type) {
    case 'task': { const t = taskById(id); return t ? link(`/tasks/${id}`, q(t.title)) : 'a deleted task'; }
    case 'assignment': { const a = assignmentById(id); const t = a && taskById(a.taskId); return t ? link(`/tasks/${t.id}`, q(t.title)) : 'a job'; }
    case 'user': return userById(id) ? link(`/users/${id}`, nameOf(id)) : 'a user';
    case 'staff': return staffById(id) ? link('/staff', nameOf(id)) : 'a staff member';
    case 'report': { const r = reportById(id); return r ? link(`/case/report/${id}`, html`report ${id}`) : html`report ${id}`; }
    case 'dispute': { const d = disputeById(id); const t = d && taskById(assignmentById(d.assignmentId)?.taskId); return link(`/case/dispute/${id}`, t ? html`on ${q(t.title)}` : html`dispute ${id}`); }
    case 'conversation': {
      const c = conversationById(id);
      if (!c) return 'a conversation';
      const who = c.participantIds.map(nameOf).join(' ↔ ');
      return link(`/conversations/${id}`, html`(${who})`);
    }
    case 'review': {
      const r = s.reviews.find((x) => x.id === id);
      return r ? link(`/reviews?focus=${id}`, html`${nameOf(r.revieweeId)} (${r.stars}★)`) : 'a review';
    }
    case 'proof': { const p = s.proofItems.find((x) => x.id === id); return p ? link(`/users/${p.taskerId}?tab=proof`, html`${q(p.label)} by ${nameOf(p.taskerId)}`) : html`proof ${meta.label ? q(meta.label) : ''}`; }
    case 'transaction': {
      const tx = s.walletTransactions.find((x) => x.id === id);
      return tx ? link(`/money?tab=ledger&tx=${id}`, html`(${fmt.money(meta.amount ?? (tx.type === 'earning' ? tx.amount - tx.fee : tx.amount))} · ${nameOf(tx.userId)})`) : '';
    }
    case 'connection': {
      const c = s.businessConnections.find((x) => x.id === id);
      return c ? html`(${link(`/users/${c.businessId}`, nameOf(c.businessId))} → ${link(`/users/${c.taskerId}`, nameOf(c.taskerId))})` : '';
    }
    case 'data_request': return link(`/case/data_request/${id}`, html`data request ${id}`);
    case 'category': return link('/settings?tab=categories', category(id)?.label || id);
    case 'settings': return link('/settings', meta.field ? html`setting ${meta.field}` : 'the settings');
    case 'audience': return html`${meta.count ? `${meta.count} people` : id}`;
    case 'export': return html`(${id}${meta.rows ? `, ${meta.rows} rows` : ''})`;
    default: return id ? html`${id}` : '';
  }
}

/** The event as one readable line: actor + what happened + link. */
export function describe(ev) {
  const info = eventInfo(ev.type);
  const [before, after = ''] = info.text.split('{target}');
  const hasTarget = info.text.includes('{target}');
  return html`${actorLink(ev.actorId)} ${before}${hasTarget ? targetLink(ev.targetType, ev.targetId, ev.meta || {}) : ''}${after}`;
}

/** Small extra facts shown under an event. */
export function eventDetails(ev) {
  const m = ev.meta || {};
  const bits = [];
  if (ev.type === 'task_published' && m.category) bits.push(category(m.category)?.label, m.budgetMax ? `up to ${fmt.money0(m.budgetMax)}` : null, m.status === 'under_review' ? 'to review' : null);
  if (m.rules) bits.push(...m.rules.map(flagLabel));
  if (ev.type === 'application_sent' && m.rate) bits.push(`offer ${fmt.money0(m.rate)}`);
  if (ev.type === 'review_posted' && m.stars) bits.push(`${m.stars} of 5 stars`);
  if (m.price && ['application_accepted', 'assignment_completed'].includes(ev.type)) bits.push(fmt.money0(m.price));
  if (m.amount && ['payment_reserved', 'payment_released', 'payment_refunded', 'dispute_partial'].includes(ev.type)) bits.push(fmt.money(m.amount));
  if (m.why) bits.push(m.why === 'first_payout' ? 'first payout' : 'over the limit');
  if (m.reason && ev.type === 'report_created') bits.push(`reason: ${m.reason}`);
  if (ev.type === 'staff_role_changed') bits.push(`${roleLabel(m.before)} → ${roleLabel(m.after)}`);
  if (ev.type === 'staff_added' && m.role) bits.push(roleLabel(m.role));
  if (ev.type === 'settings_changed' && 'before' in m) bits.push(`${fmtVal(m.before)} → ${fmtVal(m.after)}`);
  if (m.until) bits.push(`until ${fmt.day(m.until)}`);
  if (m.text) bits.push(`“${m.text}”`);
  if (m.simulated) bits.push('demo reply');
  if (m.demoSwitch) bits.push('demo account switch');
  if (m.masked) bits.push('contact details masked');
  if (m.assigneeId) bits.push(`to ${nameOf(m.assigneeId)}`);
  return bits.filter(Boolean);
}

function fmtVal(v) {
  if (Array.isArray(v)) return `${v.length} words`;
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return String(v);
}

/** Which user ids an event concerns (actor and target, and people named in meta). */
export function peopleIn(ev) {
  const ids = new Set();
  if (ev.actorId && !String(ev.actorId).startsWith('st_')) ids.add(ev.actorId);
  const m = ev.meta || {};
  for (const k of ['taskerId', 'revieweeId', 'userId', 'businessId', 'senderId']) if (m[k]) ids.add(m[k]);
  if (ev.targetType === 'user') ids.add(ev.targetId);
  return ids;
}

/** Does this event concern a given task (directly or through an assignment, conversation or dispute)? */
export function concernsTask(ev, taskId) {
  if (ev.targetType === 'task' && ev.targetId === taskId) return true;
  const m = ev.meta || {};
  if (m.taskId === taskId) return true;
  if (ev.targetType === 'conversation') return conversationById(ev.targetId)?.contextId === taskId;
  if (ev.targetType === 'report' && m.about === 'task' && m.aboutId === taskId) return true;
  if (ev.targetType === 'transaction') return getState().walletTransactions.find((t) => t.id === ev.targetId)?.relatedTaskId === taskId;
  return false;
}
