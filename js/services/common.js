// Shared helpers for the mock service layer.
import { uid, nowIso } from '../util.js';

export const ok = (extra = {}) => ({ ok: true, ...extra });
export const fail = (errors, message) => ({ ok: false, errors: errors || {}, message: message || null });

export function notify(s, userId, text, href, actorId = null) {
  if (!userId) return;
  s.notifications.unshift({ id: uid('n'), userId, text, href, read: false, createdAt: nowIso(), actorId });
}

export function notifyModerators(s, text, href, actorId = null) {
  s.users.filter((u) => u.roles.includes('moderator')).forEach((m) => notify(s, m.id, text, href, actorId));
}

export function audit(s, actorId, action, target) {
  s.auditLog.unshift({ id: uid('log'), actorId, action, target, createdAt: nowIso() });
  if (s.auditLog.length > 200) s.auditLog.length = 200;
}

export const short = (title, n = 34) => (title.length > n ? `${title.slice(0, n - 1).trimEnd()}…` : title);

// Tiny event bus so the demo simulation can react without circular imports.
const hooks = {};
export const onHook = (name, fn) => ((hooks[name] ??= []).push(fn));
export const emitHook = (name, payload) => (hooks[name] || []).forEach((fn) => fn(payload));
