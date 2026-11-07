// Accounts, roles and profiles. Mock auth: no passwords, the session is just a user id.
// TODO(backend): replace with real authentication (e.g. passwordless email + session cookies).
import { update, getState, session } from '../store.js';
import { userById, taskerProfileOf, businessOf } from '../select.js';
import { uid, nowIso, WEEKDAYS } from '../util.js';
import { parseAreaKey } from '../data/geo.js';
import {
  validateSignup, validateTaskerAbout, validateTaskerWork, validateOpportunity, validateProof,
  validateClient, validateBusiness, validateAccount, hasErrors,
} from '../logic/validation.js';
import { ok, fail, notifyModerators, audit } from './common.js';

const COLORS = ['#1E6B58', '#2557A7', '#8A4B14', '#7A3E8E', '#A3302A', '#33658A', '#56601A', '#8C2F5B'];

export function emptyAvailability() {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, []]));
}

function emptyTaskerProfile(userId) {
  return {
    userId, headline: '', bio: '', categories: [], skills: [], experience: '', availability: emptyAvailability(),
    rateMin: 15, rateMax: 22, employmentGoal: { seeking: false, fields: [], types: [], note: '', consentAt: null },
    proofItems: [], reputationSummary: null, completedTaskCount: 0, cancelledByTasker: 0,
  };
}

export function signUp({ name, email, roles, agree }) {
  const errors = validateSignup({ name, email, roles, agree });
  const normalized = String(email || '').trim().toLowerCase();
  if (!errors.email && getState().users.some((u) => u.email.toLowerCase() === normalized)) {
    errors.email = 'An account with this email already exists. Sign in instead.';
  }
  if (hasErrors(errors)) return fail(errors);
  const id = uid('u');
  update((s) => {
    s.users.push({
      id, name: name.trim(), email: normalized, phone: null, avatar: { color: COLORS[s.users.length % COLORS.length] },
      roles, locationArea: null, languages: [], createdAt: nowIso(), verificationStatus: 'not_started',
      discoverableToBusinesses: false, clientNeeds: [], onboarded: { client: false, tasker: false, business: false }, demo: null,
    });
    if (roles.includes('tasker')) s.taskerProfiles.push(emptyTaskerProfile(id));
    if (roles.includes('business')) {
      s.businessProfiles.push({
        userId: id, organizationId: uid('org'), companyName: '', field: '', size: '', locationArea: null, description: '',
        hiringIntent: { roles: '', types: [], openings: 1 }, verifiedStatus: 'not_started', recruitingEnabled: false, recruitingConsentAt: null, website: '',
      });
    }
  });
  // Taskers start in the tasker view because onboarding begins there.
  const role = roles.includes('tasker') ? 'tasker' : roles[0];
  session.set({ userId: id, role });
  return ok({ id, role });
}

export function signIn(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const u = getState().users.find((x) => x.email.toLowerCase() === normalized);
  if (!u) return fail({ email: 'We could not find an account with that email. Check the spelling or create an account.' });
  session.set({ userId: u.id, role: u.roles[0] });
  return ok({ id: u.id, role: u.roles[0] });
}

export function signInAs(userId, role) {
  const u = userById(userId);
  if (!u) return fail({}, 'That demo account no longer exists. Try resetting the demo.');
  session.set({ userId, role: u.roles.includes(role) ? role : u.roles[0] });
  return ok({ role: u.roles.includes(role) ? role : u.roles[0] });
}

export function signOut() {
  session.clear();
  session.set(null);
}

export function switchRole(role) {
  const s = session.get();
  const u = userById(s?.userId);
  if (!u?.roles.includes(role)) return fail({}, 'This account does not have that role yet.');
  session.set({ ...s, role });
  return ok();
}

export function addRole(userId, role) {
  if (!['client', 'tasker'].includes(role)) return fail({}, 'Business accounts are separate organisation accounts.');
  update((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u.roles.includes(role)) u.roles.push(role);
    u.onboarded = { ...u.onboarded, [role]: u.onboarded?.[role] ?? false };
    if (role === 'tasker' && !s.taskerProfiles.some((p) => p.userId === userId)) s.taskerProfiles.push(emptyTaskerProfile(userId));
  });
  session.set({ userId, role });
  return ok();
}

export function updateAccount(userId, d) {
  const errors = validateAccount(d);
  const email = String(d.email || '').trim().toLowerCase();
  if (!errors.email && getState().users.some((u) => u.id !== userId && u.email.toLowerCase() === email)) errors.email = 'Another account already uses this email.';
  if (hasErrors(errors)) return fail(errors);
  update((s) => {
    const u = s.users.find((x) => x.id === userId);
    u.name = d.name.trim();
    u.email = email;
    u.phone = d.phone?.trim() || null;
    u.locationArea = parseAreaKey(d.area);
    if (d.languages) u.languages = d.languages;
  });
  return ok();
}

// ---------- Tasker profile, saved step by step ----------

export function saveTaskerAbout(userId, d) {
  const errors = validateTaskerAbout(d);
  if (hasErrors(errors)) return fail(errors);
  update((s) => {
    const u = s.users.find((x) => x.id === userId);
    u.locationArea = parseAreaKey(d.area);
    u.languages = d.languages;
    const p = s.taskerProfiles.find((x) => x.userId === userId);
    p.headline = d.headline.trim();
    p.bio = (d.bio || '').trim();
  });
  return ok();
}

export function saveTaskerWork(userId, d) {
  const slotCount = Object.values(d.availability || {}).reduce((a, x) => a + x.length, 0);
  const errors = validateTaskerWork({ ...d, slotCount });
  if (hasErrors(errors)) return fail(errors);
  update((s) => {
    const p = s.taskerProfiles.find((x) => x.userId === userId);
    p.categories = d.categories;
    p.skills = [...new Set([...(d.skills || []), ...String(d.otherSkills || '').split(',').map((x) => x.trim()).filter(Boolean)])].slice(0, 20);
    p.experience = (d.experience || '').trim();
    p.rateMin = Number(d.rateMin);
    p.rateMax = Number(d.rateMax);
    p.availability = d.availability;
  });
  return ok();
}

export function saveOpportunity(userId, d) {
  const errors = validateOpportunity(d);
  if (hasErrors(errors)) return fail(errors);
  update((s) => {
    const u = s.users.find((x) => x.id === userId);
    const p = s.taskerProfiles.find((x) => x.userId === userId);
    const wasOn = !!p.employmentGoal?.seeking;
    p.employmentGoal = {
      seeking: !!d.seeking, fields: d.fields || [], types: d.types || [], note: (d.note || '').trim(),
      consentAt: d.seeking ? (wasOn ? p.employmentGoal.consentAt : nowIso()) : null,
    };
    u.discoverableToBusinesses = !!d.seeking;
    audit(s, userId, d.seeking ? 'discoverability_on' : 'discoverability_off', userId);
  });
  return ok();
}

export function setDiscoverability(userId, on) {
  const p = taskerProfileOf(userId);
  if (!p) return fail({}, 'Create a tasker profile first.');
  const types = p.employmentGoal?.types?.length ? p.employmentGoal.types : ['part_time'];
  return saveOpportunity(userId, { seeking: on, consent: true, fields: p.employmentGoal?.fields || [], types, note: p.employmentGoal?.note || '' });
}

export function finishOnboarding(userId, role) {
  update((s) => {
    const u = s.users.find((x) => x.id === userId);
    u.onboarded = { ...u.onboarded, [role]: true };
  });
  return ok();
}

export function addProof(userId, d) {
  const errors = validateProof(d);
  if (hasErrors(errors)) return fail(errors);
  const id = uid('pr');
  update((s) => {
    s.proofItems.push({ id, taskerId: userId, label: d.label.trim(), type: d.type, status: d.requestReview ? 'pending_review' : 'self_reported', visibility: d.visibility || 'public', fileName: d.fileName || null, createdAt: nowIso() });
    s.taskerProfiles.find((p) => p.userId === userId)?.proofItems.push(id);
    if (d.requestReview) notifyModerators(s, `Proof waiting for review: “${d.label.trim()}”.`, '/moderation?tab=proof', userId);
  });
  return ok({ id });
}

export function requestProofReview(userId, proofId) {
  update((s) => {
    const p = s.proofItems.find((x) => x.id === proofId && x.taskerId === userId);
    if (p && p.status === 'self_reported') {
      p.status = 'pending_review';
      notifyModerators(s, `Proof waiting for review: “${p.label}”.`, '/moderation?tab=proof', userId);
    }
  });
  return ok();
}

export function setProofVisibility(userId, proofId, visibility) {
  if (!['public', 'businesses', 'private'].includes(visibility)) return fail({}, 'Unknown visibility.');
  update((s) => {
    const p = s.proofItems.find((x) => x.id === proofId && x.taskerId === userId);
    if (p) p.visibility = visibility;
  });
  return ok();
}

export function removeProof(userId, proofId) {
  update((s) => {
    s.proofItems = s.proofItems.filter((x) => !(x.id === proofId && x.taskerId === userId));
    const p = s.taskerProfiles.find((x) => x.userId === userId);
    if (p) p.proofItems = p.proofItems.filter((x) => x !== proofId);
  });
  return ok();
}

// ---------- Client and business ----------

export function saveClient(userId, d) {
  const errors = validateClient(d);
  if (hasErrors(errors)) return fail(errors);
  update((s) => {
    const u = s.users.find((x) => x.id === userId);
    u.locationArea = parseAreaKey(d.area);
    u.clientNeeds = d.needs || [];
    u.onboarded = { ...u.onboarded, client: true };
  });
  return ok();
}

export function saveBusiness(userId, d) {
  const errors = validateBusiness(d);
  if (hasErrors(errors)) return fail(errors);
  update((s) => {
    const b = s.businessProfiles.find((x) => x.userId === userId);
    const u = s.users.find((x) => x.id === userId);
    Object.assign(b, {
      companyName: d.companyName.trim(), field: d.field, size: d.size, locationArea: parseAreaKey(d.area),
      description: d.description.trim(), website: (d.website || '').trim(),
      hiringIntent: { roles: (d.roles || '').trim(), types: d.types || [], openings: Number(d.openings) || 1 },
      recruitingEnabled: !!d.recruitingEnabled,
      recruitingConsentAt: d.recruitingEnabled ? (b.recruitingConsentAt || nowIso()) : null,
      verifiedStatus: b.verifiedStatus === 'not_started' ? 'pending_review' : b.verifiedStatus,
    });
    u.locationArea = b.locationArea;
    u.onboarded = { ...u.onboarded, business: true };
  });
  return ok();
}

export function enableRecruiting(userId, consent) {
  if (!consent) return fail({ consent: 'Please agree to the recruiting rules to continue.' });
  const b = businessOf(userId);
  if (!b?.companyName) return fail({}, 'Complete the company profile first.');
  update((s) => {
    const x = s.businessProfiles.find((p) => p.userId === userId);
    x.recruitingEnabled = true;
    x.recruitingConsentAt = nowIso();
  });
  return ok();
}

export function setRecruiting(userId, on) {
  update((s) => {
    const x = s.businessProfiles.find((p) => p.userId === userId);
    x.recruitingEnabled = on;
    x.recruitingConsentAt = on ? (x.recruitingConsentAt || nowIso()) : null;
  });
  return ok();
}

// ---------- Privacy ----------

export function exportMyData(userId) {
  const s = getState();
  const mine = (arr, key) => arr.filter((x) => x[key] === userId);
  return {
    exportedAt: nowIso(), note: 'Demo export. A real export would be generated server-side.',
    user: s.users.find((u) => u.id === userId), taskerProfile: taskerProfileOf(userId), businessProfile: businessOf(userId),
    tasks: mine(s.tasks, 'clientId'), applications: mine(s.applications, 'taskerId'), proofItems: mine(s.proofItems, 'taskerId'),
    reviewsWritten: mine(s.reviews, 'reviewerId'), reviewsReceived: mine(s.reviews, 'revieweeId'),
    messages: mine(s.messages, 'senderId'), walletTransactions: mine(s.walletTransactions, 'userId'), reports: mine(s.reports, 'reporterId'),
  };
}

export function requestDeletion(userId) {
  update((s) => {
    if (!s.dataRequests.some((r) => r.userId === userId && r.type === 'deletion' && r.status === 'received')) {
      s.dataRequests.push({ id: uid('dr'), userId, type: 'deletion', status: 'received', createdAt: nowIso() });
      notifyModerators(s, 'A data deletion request was received (demo).', '/moderation?tab=reports', userId);
    }
  });
  return ok();
}
