import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from '../js/data/seed.js';
import { taskFit, candidateFit, isRecruitable, NOT_USED } from '../js/logic/matching.js';
import { canMove, move } from '../js/logic/status.js';
import { validateTask, validateApplication, validateReview } from '../js/logic/validation.js';
import { maskContacts } from '../js/logic/privacy.js';
import { summarize } from '../js/logic/reputation.js';
import { breakdown, walletSummary } from '../js/logic/money.js';
import { isoDate } from '../js/util.js';

const seed = createSeed(new Date());
const user = (id) => seed.users.find((u) => u.id === id);
const profile = (id) => seed.taskerProfiles.find((p) => p.userId === id);
const reviews = (id) => seed.reviews.filter((r) => r.revieweeId === id);
const proofs = (id) => seed.proofItems.filter((p) => p.taskerId === id);
const task = (id) => seed.tasks.find((t) => t.id === id);

test('seed meets the demo-data brief', () => {
  assert.ok(seed.tasks.length >= 8);
  const cities = new Set(seed.tasks.map((t) => t.locationArea.city));
  for (const c of ['vienna', 'graz', 'linz']) assert.ok(cities.has(c), `tasks in ${c}`);
  assert.ok(seed.taskerProfiles.length >= 6);
  assert.ok(seed.businessProfiles.length >= 3);
  assert.equal(reviews('u_tobias').length, 0, 'newcomer has no reviews');
  assert.ok(seed.tasks.some((t) => t.status === 'under_review'), 'restricted task in manual review');
  const avgs = seed.taskerProfiles.map((p) => summarize(reviews(p.userId)).avg).filter(Boolean);
  assert.ok(avgs.some((a) => a < 4.6), 'not every profile is perfect');
});

test('seed references are consistent', () => {
  const ids = new Set(seed.users.map((u) => u.id));
  for (const t of seed.tasks) assert.ok(ids.has(t.clientId), `client of ${t.id}`);
  for (const a of seed.applications) {
    assert.ok(ids.has(a.taskerId));
    assert.ok(task(a.taskId), `task of ${a.id}`);
  }
  for (const r of seed.reviews) assert.ok(ids.has(r.reviewerId) && ids.has(r.revieweeId));
  for (const m of seed.messages) assert.ok(seed.conversations.some((c) => c.id === m.conversationId));
  for (const as of seed.assignments) assert.ok(task(as.taskId) && seed.applications.some((a) => a.id === as.applicationId));
});

test('seed review averages land near their targets', () => {
  assert.equal(summarize(reviews('u_ferdinand')).avg, 4.9);
  assert.equal(summarize(reviews('u_ana')).count, 22);
});

test('task fit explains itself and gives newcomers a boost', () => {
  const hedge = task('t_hedge');
  const f = taskFit({ task: hedge, tasker: user('u_ferdinand'), profile: profile('u_ferdinand'), reviews: reviews('u_ferdinand'), proofs: proofs('u_ferdinand'), perspective: 'client' });
  assert.equal(f.level, 'strong');
  assert.match(f.explanation, /^Recommended because Ferdinand/);
  assert.match(f.explanation, /similar work/);
  const t = taskFit({ task: hedge, tasker: user('u_tobias'), profile: profile('u_tobias'), reviews: [], proofs: proofs('u_tobias'), perspective: 'tasker' });
  assert.ok(['strong', 'good'].includes(t.level), `newcomer level ${t.level}`);
  assert.ok(t.factors.some((x) => x.key === 'newcomer'));
  assert.match(t.explanation, /you are new here/);
});

test('fit is contextual: a gardener is not recommended for a move', () => {
  const f = taskFit({ task: task('t_sofa'), tasker: user('u_ferdinand'), profile: profile('u_ferdinand'), reviews: reviews('u_ferdinand'), proofs: proofs('u_ferdinand') });
  assert.equal(f.level, 'low');
});

test('candidate fit uses field-relevant evidence', () => {
  const donau = seed.businessProfiles.find((b) => b.userId === 'u_donau');
  const elif = candidateFit({ business: donau, tasker: user('u_elif'), profile: profile('u_elif'), reviews: reviews('u_elif'), proofs: proofs('u_elif') });
  const mehmet = candidateFit({ business: donau, tasker: user('u_mehmet'), profile: profile('u_mehmet'), reviews: reviews('u_mehmet'), proofs: proofs('u_mehmet') });
  assert.ok(elif.score > mehmet.score, 'economics graduate ranks above a mover for a finance firm');
  assert.match(elif.explanation, /MSc Economics/);
});

test('consent gate hides taskers who did not opt in', () => {
  assert.equal(isRecruitable(user('u_lukas'), profile('u_lukas')), false);
  assert.equal(isRecruitable(user('u_elif'), profile('u_elif')), true);
  assert.ok(NOT_USED.length >= 3);
});

test('status transitions are enforced', () => {
  assert.ok(canMove('assignment', 'in_progress', 'awaiting_confirmation'));
  assert.ok(!canMove('assignment', 'completed', 'in_progress'));
  assert.throws(() => move('task', { status: 'completed' }, 'open'));
});

test('validation produces plain-language errors', () => {
  const today = isoDate(new Date());
  const e = validateTask({ title: 'Hi', description: 'short', date: '2000-01-01', start: '10:00', end: '09:00', area: '', budgetMin: '5', budgetMax: '1' }, { today, policy: 'open' });
  for (const k of ['title', 'category', 'description', 'date', 'start', 'area', 'budgetMin']) assert.ok(e[k], `error for ${k}`);
  assert.deepEqual(validateTask({ title: 'Carry boxes upstairs', category: 'moving', description: 'Twenty boxes need to go to the second floor flat.', date: today, start: '09:00', end: '11:00', area: 'vienna:wieden', budgetMin: '40', budgetMax: '60' }, { today, policy: 'open' }), {});
  assert.ok(validateApplication({ note: 'hi', proposedRate: '3', availability: '' }).note);
  assert.ok(validateReview({ stars: '2', comment: '' }).comment, 'low ratings need a comment');
});

test('contact details are masked, dates and prices are not', () => {
  const m = maskContacts('Call me on +43 660 123 45 67 or mail a@b.com on 2026-11-07 for € 1.234,50');
  assert.ok(m.masked);
  assert.ok(!m.text.includes('660'));
  assert.ok(!m.text.includes('a@b.com'));
  assert.ok(m.text.includes('2026-11-07'));
  assert.ok(m.text.includes('1.234,50'));
});

test('fees and wallet summary', () => {
  const b = breakdown(100);
  assert.deepEqual([b.clientTotal, b.taskerNet], [105, 95]);
  const w = walletSummary([{ type: 'earning', amount: 100, fee: 5, status: 'completed' }, { type: 'earning', amount: 50, fee: 2.5, status: 'pending' }]);
  assert.equal(w.available, 95);
  assert.equal(w.pending, 47.5);
});
