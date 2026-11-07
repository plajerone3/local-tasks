// Business discovery of opted-in taskers.
// Visibility rule: a tasker appears only after turning on "visible for stable work", and only
// to businesses that agreed to the recruiting rules. Accepting a request opens a conversation;
// nothing here claims that an interview or hire happened unless the tasker records it.
import { tr } from '../i18n.js';
import { update } from '../store.js';
import { userById, taskerProfileOf, businessOf, connectionBetween, connectionById, isBlocked, publicReviewsAbout, visibleProofs, taskers, isSaved } from '../select.js';
import { candidateFit, isRecruitable } from '../logic/matching.js';
import { summarize } from '../logic/reputation.js';
import { field as fieldById } from '../data/fields.js';
import { uid, nowIso } from '../util.js';
import { validateConnection, hasErrors } from '../logic/validation.js';
import { move } from '../logic/status.js';
import { ok, fail, notify } from './common.js';

export const OUTCOMES = [
  { id: 'talking', label: 'We are talking' },
  { id: 'interview', label: 'Interview arranged' },
  { id: 'hired', label: 'I started working there' },
  { id: 'not_pursued', label: 'Not taking it further' },
];

export function eligibleCandidates(businessUserId) {
  const biz = businessOf(businessUserId);
  if (!biz?.recruitingEnabled) return [];
  const viewer = userById(businessUserId);
  return taskers()
    .filter(({ user, profile }) => isRecruitable(user, profile) && !isBlocked(businessUserId, user.id))
    .map(({ user, profile }) => {
      const reviews = publicReviewsAbout(user.id);
      const proofs = visibleProofs(user.id, viewer);
      return { user, profile, reviews, proofs, rep: summarize(reviews) };
    });
}

const SLOTS_WEEKEND = ['sat', 'sun'];
const SLOTS_WEEKDAY = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function searchCandidates(businessUserId, f) {
  const biz = businessOf(businessUserId);
  const fieldId = f.field || biz.field;
  const fieldDef = fieldById(fieldId);
  const q = String(f.q || '').trim().toLowerCase();
  return eligibleCandidates(businessUserId)
    .map((c) => ({ ...c, fit: candidateFit({ business: biz, tasker: c.user, profile: c.profile, reviews: c.reviews, proofs: c.proofs, fieldId }) }))
    .filter((c) => {
      if (q && !`${c.profile.headline} ${c.profile.skills.join(' ')} ${c.profile.experience} ${c.proofs.map((p) => p.label).join(' ')}`.toLowerCase().includes(q)) return false;
      if (f.evidence === 'any_proof' && !c.proofs.length) return false;
      if (f.evidence === 'reviewed' && !c.proofs.some((p) => ['pending_review', 'verified'].includes(p.status))) return false;
      if (f.evidence === 'verified' && !c.proofs.some((p) => p.status === 'verified')) return false;
      if (f.location === 'same_city' && c.user.locationArea?.city !== biz.locationArea?.city) return false;
      if (f.availability === 'weekdays' && !SLOTS_WEEKDAY.some((d) => c.profile.availability[d]?.length)) return false;
      if (f.availability === 'weekends' && !SLOTS_WEEKEND.some((d) => c.profile.availability[d]?.length)) return false;
      if (f.type && f.type !== 'any' && !(c.profile.employmentGoal.types || []).includes(f.type)) return false;
      const cats = fieldDef?.categories?.length ? fieldDef.categories : null;
      const history = cats ? cats.reduce((a, cat) => a + (c.rep.byCategory[cat]?.count || 0), 0) : c.profile.completedTaskCount;
      if (f.history && f.history !== 'any' && history < Number(f.history)) return false;
      if (f.rating && f.rating !== 'any') {
        const relevant = cats ? cats.map((cat) => c.rep.byCategory[cat]).filter(Boolean) : [];
        const n = relevant.reduce((a, x) => a + x.count, 0);
        const avg = n ? relevant.reduce((a, x) => a + x.sum, 0) / n : c.rep.avg;
        if (avg == null || avg < Number(f.rating)) return false;
      }
      return true;
    })
    .sort((a, b) => b.fit.score - a.fit.score);
}

export function toggleSave(businessId, taskerId) {
  const saved = isSaved(businessId, taskerId);
  update((s) => {
    if (saved) s.savedCandidates = s.savedCandidates.filter((x) => !(x.businessId === businessId && x.taskerId === taskerId));
    else s.savedCandidates.push({ businessId, taskerId, createdAt: nowIso() });
  });
  return ok({ saved: !saved });
}

export function sendConnection(businessId, taskerId, message) {
  const biz = businessOf(businessId);
  if (!biz?.recruitingEnabled) return fail({}, tr('Turn on recruiting for your organisation first.'));
  const u = userById(taskerId);
  if (!isRecruitable(u, taskerProfileOf(taskerId))) return fail({}, tr('This person is not visible for stable work any more.'));
  if (isBlocked(businessId, taskerId)) return fail({}, tr('You cannot contact this person.'));
  const existing = connectionBetween(businessId, taskerId);
  if (existing && ['pending', 'accepted'].includes(existing.status)) return fail({}, tr('You already have a request or conversation with this person.'));
  const errors = validateConnection({ message });
  if (hasErrors(errors)) return fail(errors);
  const id = uid('bc');
  update((s) => {
    s.businessConnections.push({ id, businessId, taskerId, status: 'pending', message: message.trim(), createdAt: nowIso(), respondedAt: null, conversationId: null, outcome: null });
    notify(s, taskerId, tr('{company} would like to connect about stable work.', { company: biz.companyName }), '/recruiting', businessId);
  });
  return ok({ id });
}

export function respondConnection(connId, taskerId, accept) {
  const c = connectionById(connId);
  if (!c || c.taskerId !== taskerId) return fail({}, tr('Request not found.'));
  if (c.status !== 'pending') return fail({}, tr('You have already replied to this request.'));
  const convId = accept ? uid('c') : null;
  update((s) => {
    const x = s.businessConnections.find((y) => y.id === connId);
    move('connection', x, accept ? 'accepted' : 'declined');
    x.respondedAt = nowIso();
    const name = userById(taskerId).name.split(' ')[0];
    if (accept) {
      x.conversationId = convId;
      x.outcome = 'talking';
      s.conversations.push({ id: convId, contextType: 'recruiting', contextId: connId, participantIds: [c.businessId, taskerId], createdAt: nowIso() });
      s.messages.push({ id: uid('m'), conversationId: convId, senderId: c.businessId, body: c.message, createdAt: c.createdAt, readBy: [c.businessId, taskerId], system: false, masked: false, simulated: false, hidden: false });
      notify(s, c.businessId, tr('{name} accepted your connection request. You can now talk in the app.', { name }), `/messages/${convId}`, taskerId);
    } else {
      notify(s, c.businessId, tr('{name} declined your connection request.', { name }), '/dashboard', taskerId);
    }
  });
  return ok({ conversationId: convId });
}

export function setOutcome(connId, taskerId, outcome) {
  const c = connectionById(connId);
  if (!c || c.taskerId !== taskerId || c.status !== 'accepted') return fail({}, tr('Only the candidate can record the outcome of an accepted connection.'));
  update((s) => { s.businessConnections.find((y) => y.id === connId).outcome = outcome; });
  return ok();
}

export function withdrawConnection(connId, businessId) {
  const c = connectionById(connId);
  if (!c || c.businessId !== businessId || c.status !== 'pending') return fail({}, tr('This request can no longer be withdrawn.'));
  update((s) => { move('connection', s.businessConnections.find((y) => y.id === connId), 'withdrawn'); });
  return ok();
}
