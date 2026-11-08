// Account standing, as decided by staff in the backoffice. The app checks it before any action
// that reaches other people, so a backoffice decision takes effect immediately.
//   active      everything allowed
//   restricted  can sign in and finish current jobs and chats; cannot post, apply, invite or send requests
//   suspended   cannot sign in until the date passes (then counts as active again)
//   banned      cannot sign in
//   closed      account deleted or anonymised on request

export const ACCOUNT_STATUS = {
  active: { label: 'Active', tone: 'success' },
  restricted: { label: 'Restricted', tone: 'warn' },
  suspended: { label: 'Suspended', tone: 'danger' },
  banned: { label: 'Banned', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
};

/** The status that applies right now (an expired suspension or restriction counts as active). */
export function standing(user, now = Date.now()) {
  const e = user?.enforcement;
  if (!e || !e.status || e.status === 'active') return 'active';
  if (e.until && new Date(e.until).getTime() <= now && (e.status === 'suspended' || e.status === 'restricted')) return 'active';
  return e.status;
}

export const canSignIn = (user, now) => !['suspended', 'banned', 'closed'].includes(standing(user, now));

/** Actions that reach other people. Restricted accounts lose these; current jobs and chats continue. */
const OUTREACH = new Set(['post', 'apply', 'invite', 'connect', 'review']);

/** Returns null when allowed, or the status that blocks the action. */
export function blockedBy(user, action, now) {
  const st = standing(user, now);
  if (st === 'active') return null;
  if (st === 'restricted') return OUTREACH.has(action) ? 'restricted' : null;
  return st;
}
