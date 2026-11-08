// Status vocabularies and the allowed transitions between them.
// Services call move() so an invalid transition fails loudly instead of corrupting data.

export const TASK_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  under_review: { label: 'In manual review', tone: 'warn', hint: 'A moderator checks tasks in this category before they go live.' },
  open: { label: 'Open', tone: 'success', hint: 'Taskers can apply.' },
  assigned: { label: 'Tasker accepted', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  awaiting_confirmation: { label: 'Awaiting confirmation', tone: 'warn' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  disputed: { label: 'Dispute open', tone: 'danger' },
  not_approved: { label: 'Not approved', tone: 'neutral' },
};

export const APPLICATION_STATUS = {
  applied: { label: 'Applied', tone: 'info' },
  shortlisted: { label: 'Shortlisted', tone: 'accent' },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Not selected', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

export const ASSIGNMENT_STATUS = {
  accepted: { label: 'Accepted', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  awaiting_confirmation: { label: 'Awaiting confirmation', tone: 'warn' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  disputed: { label: 'Dispute open', tone: 'danger' },
};

export const PAYMENT_STATUS = {
  reserved_demo: { label: 'Reserved (demo)', tone: 'info' },
  released_demo: { label: 'Released (demo)', tone: 'success' },
  on_hold_demo: { label: 'On hold during dispute (demo)', tone: 'warn' },
  refunded_demo: { label: 'Refunded (demo)', tone: 'neutral' },
};

export const TX_STATUS = {
  pending: { label: 'Pending', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  on_hold: { label: 'On hold', tone: 'warn' },
  refunded: { label: 'Refunded', tone: 'neutral' },
};

export const PROOF_STATUS = {
  self_reported: { label: 'Self-reported', tone: 'neutral', hint: 'This proof is self-reported and has not been verified yet.' },
  pending_review: { label: 'Pending review', tone: 'warn', hint: 'Sent for review. It has not been verified yet.' },
  verified: { label: 'Checked by moderator (demo)', tone: 'success', hint: 'A moderator looked at this in the demo. It is not an official or legal verification.' },
  rejected: { label: 'Not accepted', tone: 'danger', hint: 'A moderator could not confirm this proof.' },
};

export const CONNECTION_STATUS = {
  pending: { label: 'Waiting for reply', tone: 'info' },
  accepted: { label: 'Connected', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
};

export const REPORT_STATUS = {
  pending_review: { label: 'Pending moderation', tone: 'warn' },
  resolved: { label: 'Reviewed', tone: 'success' },
};

export const DISPUTE_STATUS = {
  open: { label: 'Open', tone: 'danger' },
  resolved: { label: 'Resolved', tone: 'success' },
};

export const VERIFICATION_STATUS = {
  not_started: { label: 'Identity not checked', tone: 'neutral' },
  pending_review: { label: 'ID check pending review', tone: 'warn' },
  verified: { label: 'Identity checked (demo)', tone: 'success' },
  rejected: { label: 'ID check not passed', tone: 'danger' },
};

/** Business details, as checked by staff in the backoffice. */
export const BUSINESS_CHECK = {
  not_started: { label: 'Business details not checked', tone: 'warn' },
  pending_review: { label: 'Business details pending review', tone: 'warn' },
  verified: { label: 'Business details checked (demo)', tone: 'success' },
  rejected: { label: 'Business details not confirmed', tone: 'danger' },
};

const FLOWS = {
  task: {
    draft: ['open', 'under_review'],
    under_review: ['open', 'not_approved', 'cancelled'],
    open: ['assigned', 'cancelled'],
    assigned: ['in_progress', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed', 'open'],
    in_progress: ['awaiting_confirmation', 'completed', 'disputed', 'cancelled', 'open'],
    awaiting_confirmation: ['completed', 'disputed', 'in_progress'],
    disputed: ['in_progress', 'awaiting_confirmation', 'completed', 'cancelled'],
    completed: [], cancelled: [], not_approved: [],
  },
  application: {
    applied: ['shortlisted', 'accepted', 'declined', 'withdrawn'],
    shortlisted: ['applied', 'accepted', 'declined', 'withdrawn'],
    accepted: ['withdrawn'],
    declined: [], withdrawn: [],
  },
  assignment: {
    accepted: ['in_progress', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed'],
    in_progress: ['awaiting_confirmation', 'completed', 'cancelled', 'disputed'],
    awaiting_confirmation: ['completed', 'in_progress', 'disputed'],
    disputed: ['in_progress', 'awaiting_confirmation', 'completed', 'cancelled'],
    completed: [], cancelled: [],
  },
  connection: { pending: ['accepted', 'declined', 'withdrawn'], accepted: [], declined: [], withdrawn: [] },
};

export function canMove(kind, from, to) {
  return FLOWS[kind]?.[from]?.includes(to) ?? false;
}

export function move(kind, entity, to) {
  if (!canMove(kind, entity.status, to)) {
    throw new Error(`Cannot move ${kind} from "${entity.status}" to "${to}"`);
  }
  entity.status = to;
  return entity;
}

// One lifecycle view across application and assignment, for the status timeline.
export function lifecycle(application, assignment) {
  const steps = [
    { id: 'applied', label: 'Applied' },
    { id: 'shortlisted', label: 'Shortlisted' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'in_progress', label: 'In progress' },
    { id: 'awaiting_confirmation', label: 'Awaiting confirmation' },
    { id: 'completed', label: 'Completed' },
  ];
  let current = application?.status || 'applied';
  let terminal = null;
  if (application?.status === 'declined') terminal = { id: 'declined', label: 'Not selected this time', tone: 'neutral' };
  if (application?.status === 'withdrawn') terminal = { id: 'withdrawn', label: 'Withdrawn', tone: 'neutral' };
  if (assignment) {
    current = assignment.status === 'disputed' ? (assignment.previousStatus || 'in_progress') : assignment.status;
    if (assignment.status === 'cancelled') terminal = { id: 'cancelled', label: 'Cancelled', tone: 'neutral' };
    if (assignment.status === 'disputed') terminal = { id: 'disputed', label: 'Dispute open — paused', tone: 'danger' };
  }
  const idx = steps.findIndex((s) => s.id === current);
  const skippedShortlist = !application?.shortlistedAt && idx > 1;
  return {
    terminal,
    steps: steps.map((s, i) => ({
      ...s,
      state: i < idx ? (i === 1 && skippedShortlist ? 'skipped' : 'done') : i === idx ? (s.id === 'completed' ? 'done' : 'current') : 'todo',
    })),
  };
}
