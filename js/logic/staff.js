// Backoffice staff: roles and what each role may do. Pure data, no state access.
// TODO(backend): enforce the same permission check on the server for every staff endpoint.

export const PERMS = {
  view: 'See the backoffice (read-only)',
  'cases.work': 'Claim and assign cases, add internal notes',
  'content.moderate': 'Decide reports; hide or restore tasks, messages and reviews',
  'tasks.review': 'Approve or decline tasks in manual review; edit or cancel tasks',
  'users.warn': 'Warn users and send them notices',
  'users.enforce': 'Restrict, suspend, ban and reinstate accounts',
  'users.verify': 'Check identities, business details and proof',
  'disputes.resolve': 'Resolve disputes (release, refund, split, resume)',
  'money.payouts': 'Approve or hold payouts',
  'money.refund': 'Issue refunds and goodwill credits',
  'messages.read': 'Open private conversations (each access is logged with a reason)',
  'data.requests': 'Handle data export and deletion requests',
  impersonate: 'Open the app as a user (logged)',
  'comms.broadcast': 'Send announcements to many users',
  'settings.manage': 'Change rules, category policies, SLAs and payout limits',
  'staff.manage': 'Add staff, change roles, deactivate accounts',
  export: 'Download CSV exports',
};

const ALL = Object.keys(PERMS);

export const ROLES = {
  owner: { label: 'Owner', tone: 'danger', blurb: 'Full access, including staff and settings.', perms: ALL },
  admin: { label: 'Admin', tone: 'accent', blurb: 'Runs operations. Everything except removing the owner.', perms: ALL },
  trust_safety: {
    label: 'Trust & Safety', tone: 'warn', blurb: 'Reports, scams, enforcement, verification and disputes.',
    perms: ['view', 'cases.work', 'content.moderate', 'tasks.review', 'users.warn', 'users.enforce', 'users.verify', 'disputes.resolve', 'messages.read', 'data.requests', 'export'],
  },
  support: {
    label: 'Support', tone: 'info', blurb: 'Helps users, warns, sends notices and handles data requests.',
    perms: ['view', 'cases.work', 'users.warn', 'messages.read', 'data.requests', 'impersonate'],
  },
  finance: {
    label: 'Finance', tone: 'success', blurb: 'Payouts, refunds and the money side of disputes.',
    perms: ['view', 'cases.work', 'disputes.resolve', 'money.payouts', 'money.refund', 'export'],
  },
  analyst: { label: 'Analyst', tone: 'neutral', blurb: 'Read-only access to activity, numbers and exports.', perms: ['view', 'export'] },
};

export const isStaffId = (id) => typeof id === 'string' && id.startsWith('st_');

/** can(staffMember, 'users.enforce') → boolean. Inactive staff can do nothing. */
export function can(staff, perm) {
  if (!staff || !staff.active) return false;
  return !!ROLES[staff.role]?.perms.includes(perm);
}

export const roleLabel = (role) => ROLES[role]?.label || role;
