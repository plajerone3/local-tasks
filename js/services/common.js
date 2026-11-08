// Shared helpers for the mock service layer.
import { uid, nowIso } from '../util.js';
import { tr } from '../i18n.js';
import { getState } from '../store.js';
import { blockedBy } from '../logic/enforcement.js';
import { isStaffId } from '../logic/staff.js';

export const ok = (extra = {}) => ({ ok: true, ...extra });
export const fail = (errors, message) => ({ ok: false, errors: errors || {}, message: message || null });

export function notify(s, userId, text, href, actorId = null) {
  if (!userId) return;
  s.notifications.unshift({ id: uid('n'), userId, text, href, read: false, createdAt: nowIso(), actorId });
}

export function notifyModerators(s, text, href, actorId = null) {
  s.users.filter((u) => u.roles.includes('moderator')).forEach((m) => notify(s, m.id, text, href, actorId));
}

// ---------- Activity log ----------
// Every meaningful action in the app and the backoffice lands here. The backoffice reads it as
// the live activity feed, the per-user and per-task timelines, and (staff entries) the audit log.
// TODO(backend): an append-only event table, written in the same transaction as the change.
export const ACTIVITY_CAP = 3000;

export const actorKindOf = (id) => (!id ? 'system' : isStaffId(id) ? 'staff' : 'user');

export function track(s, type, { actorId = null, targetType = null, targetId = null, meta = null, reason = null } = {}) {
  if (!s.activity) s.activity = [];
  const ev = { id: uid('ev'), at: nowIso(), type, actorId, actorKind: actorKindOf(actorId), targetType, targetId };
  if (meta) ev.meta = meta;
  if (reason) ev.reason = reason;
  s.activity.unshift(ev);
  if (s.activity.length > ACTIVITY_CAP) s.activity.length = ACTIVITY_CAP;
  return ev;
}

const PREFIX_TYPE = { rp: 'report', t: 'task', u: 'user', pr: 'proof', dp: 'dispute', as: 'assignment', ap: 'application', m: 'message', c: 'conversation', rv: 'review', tx: 'transaction', bc: 'connection', st: 'staff', dr: 'data_request' };
export const typeOfId = (id) => PREFIX_TYPE[String(id || '').split('_')[0]] || 'category';

/** Older call sites: audit(s, actor, action, targetId). The target type is read from the id prefix. */
export function audit(s, actorId, action, target) {
  track(s, action, { actorId, targetType: typeOfId(target), targetId: target });
}

// ---------- Account standing ----------
const BLOCK_TEXT = {
  restricted: 'Your account is restricted by our team, so you cannot do this right now. Your current jobs and chats continue. Contact support if you think this is a mistake.',
  suspended: 'Your account is suspended. Contact support if you think this is a mistake.',
  banned: 'Your account has been closed by our team.',
  closed: 'This account is closed.',
};
export const blockText = (status) => tr(BLOCK_TEXT[status] || BLOCK_TEXT.suspended);

/** Returns a fail() result when the account may not do this, otherwise null. */
export function gate(userId, action) {
  const u = getState().users.find((x) => x.id === userId);
  const st = u && blockedBy(u, action);
  return st ? fail({}, blockText(st)) : null;
}

// ---------- Payouts ----------
/** Why a payout needs a person to look at it, or null when it can go out automatically. */
export function payoutCheckReason(s, tx) {
  const limit = s.settings?.payoutApprovalOver ?? 150;
  if (tx.amount - tx.fee > limit) return 'over_limit';
  const firstRule = s.settings?.firstPayoutNeedsApproval ?? true;
  if (firstRule && !s.walletTransactions.some((t) => t !== tx && t.userId === tx.userId && t.type === 'earning' && t.payoutStatus)) return 'first_payout';
  return null;
}

export function queuePayout(s, tx) {
  if (tx.type !== 'earning' || tx.payoutStatus) return;
  const why = payoutCheckReason(s, tx);
  tx.payoutStatus = why ? 'awaiting_approval' : 'approved';
  if (why) {
    tx.payoutCheck = why;
    track(s, 'payout_queued', { targetType: 'transaction', targetId: tx.id, meta: { amount: Math.round((tx.amount - tx.fee) * 100) / 100, why } });
  }
}

export const short = (title, n = 34) => (title.length > n ? `${title.slice(0, n - 1).trimEnd()}…` : title);

// Tiny event bus so the demo simulation can react without circular imports.
const hooks = {};
export const onHook = (name, fn) => ((hooks[name] ??= []).push(fn));
export const emitHook = (name, payload) => (hooks[name] || []).forEach((fn) => fn(payload));
