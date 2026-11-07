// End-to-end flows through the mock service layer (no DOM).
import './memory-storage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, getState, resetDemo } from '../js/store.js';
import * as S from '../js/select.js';
import * as accounts from '../js/services/accounts.js';
import * as market from '../js/services/marketplace.js';
import * as safety from '../js/services/safety.js';
import * as recruiting from '../js/services/recruiting.js';
import * as messaging from '../js/services/messaging.js';
import { setSimulation } from '../js/services/simulation.js';
import { summarize } from '../js/logic/reputation.js';
import { isoDate } from '../js/util.js';

setSimulation(false);
loadState();

const inDays = (n) => isoDate(new Date(Date.now() + n * 864e5));

test('client → tasker loop: publish, apply, accept, complete, review', () => {
  resetDemo();
  const before = summarize(S.publicReviewsAbout('u_lukas'));

  const pub = market.publishTask('u_katharina', market.draftFromForm({
    title: 'Carry a bookshelf down to the cellar', category: 'moving',
    description: 'A heavy oak bookshelf needs to go from the 2nd floor down to the cellar.',
    date: inDays(3), start: '10:00', end: '12:00', area: 'vienna:wieden', budgetMin: '40', budgetMax: '60', estimatedHours: '2',
    exactAddress: 'Mustergasse 1, 1040 Wien',
  }));
  assert.ok(pub.ok, JSON.stringify(pub.errors));
  assert.equal(S.taskById(pub.id).status, 'open');
  assert.ok(S.visibleTasks(null).some((t) => t.id === pub.id), 'appears in browse');
  assert.ok(S.tasksByClient('u_katharina').some((t) => t.id === pub.id), 'appears on client dashboard');

  const app = market.applyToTask(pub.id, 'u_lukas', { note: 'I can do this with a friend, we are careful.', proposedRate: '50', availability: 'Any time that day' });
  assert.ok(app.ok);
  assert.equal(S.activeApplicationsForTask(pub.id).length, 1, 'shows in applicant review');
  assert.equal(market.applyToTask(pub.id, 'u_lukas', { note: 'again again again again', proposedRate: '50', availability: 'now' }).ok, false, 'no double apply');

  const acc = market.acceptApplication(app.id, 'u_katharina');
  assert.ok(acc.ok);
  assert.equal(S.taskById(pub.id).status, 'assigned');
  assert.equal(S.assignmentById(acc.assignmentId).status, 'accepted');
  assert.equal(S.assignmentById(acc.assignmentId).paymentStatus, 'reserved_demo');

  assert.ok(market.startAssignment(acc.assignmentId, 'u_lukas').ok);
  assert.ok(market.markComplete(acc.assignmentId, 'u_lukas').ok);
  assert.equal(S.assignmentById(acc.assignmentId).status, 'awaiting_confirmation');
  assert.equal(market.submitReview(acc.assignmentId, 'u_katharina', { stars: 5 }).ok, false, 'no review before completion');
  assert.ok(market.confirmCompletion(acc.assignmentId, 'u_katharina').ok);
  assert.equal(S.taskById(pub.id).status, 'completed');

  const rv = market.submitReview(acc.assignmentId, 'u_katharina', { stars: 5, tags: ['Careful'], comment: 'Great help.', visibility: 'public' });
  assert.ok(rv.ok);
  const after = summarize(S.publicReviewsAbout('u_lukas'));
  assert.equal(after.count, before.count + 1, 'rating summary updates');
  assert.equal(after.byCategory.moving.count, before.byCategory.moving.count + 1);
  const earning = S.transactionsOf('u_lukas').find((t) => t.relatedTaskId === pub.id);
  assert.equal(earning.status, 'completed');
  assert.equal(earning.demoOnly, true);
});

test('restricted category goes to manual review, moderator approves', () => {
  resetDemo();
  const pub = market.publishTask('u_katharina', market.draftFromForm({
    title: 'Help with my tax return form', category: 'tax', description: 'I need general help filling in the annual employee tax assessment form.',
    date: inDays(5), start: '17:00', end: '19:00', area: 'vienna:wieden', budgetMin: '40', budgetMax: '60',
  }));
  assert.ok(pub.ok);
  assert.equal(pub.status, 'under_review');
  assert.equal(market.applyToTask(pub.id, 'u_elif', { note: 'I can help with the form fields.', proposedRate: '50', availability: 'evening' }).ok, false);
  assert.ok(safety.reviewTask(pub.id, 'u_mira', 'approve').ok);
  assert.equal(S.taskById(pub.id).status, 'open');
  assert.equal(safety.reviewTask(pub.id, 'u_lukas', 'approve').ok, false, 'only moderators');
});

test('discoverability gates business search; connection reaches the tasker', () => {
  resetDemo();
  const before = recruiting.searchCandidates('u_gruenraum', {}).map((c) => c.user.id);
  assert.ok(!before.includes('u_lukas'));
  assert.ok(accounts.setDiscoverability('u_lukas', true).ok);
  const after = recruiting.searchCandidates('u_gruenraum', {}).map((c) => c.user.id);
  assert.ok(after.includes('u_lukas'), 'appears after opting in');

  const conn = recruiting.sendConnection('u_gruenraum', 'u_lukas', 'Hello Lukas, we need seasonal help in Graz next spring. Interested?');
  assert.ok(conn.ok);
  assert.ok(S.connectionsOfTasker('u_lukas').some((c) => c.id === conn.id && c.status === 'pending'), 'recruiting inbox');
  const resp = recruiting.respondConnection(conn.id, 'u_lukas', true);
  assert.ok(resp.ok && S.conversationById(resp.conversationId));

  assert.ok(accounts.setDiscoverability('u_lukas', false).ok);
  assert.ok(!recruiting.searchCandidates('u_gruenraum', {}).some((c) => c.user.id === 'u_lukas'), 'hidden again after opting out');
});

test('report creates pending moderation without deleting content', () => {
  resetDemo();
  const r = safety.createReport('u_ana', { targetType: 'task', targetId: 't_event', reason: 'inaccurate', details: 'The budget does not match the description.' });
  assert.ok(r.ok);
  assert.equal(S.pendingReportsOn('task', 't_event').length, 1);
  assert.ok(S.taskById('t_event'), 'content still exists');
  assert.equal(S.taskById('t_event').hidden, false);
});

test('dispute pauses payment and reviews; moderator resolves', () => {
  resetDemo();
  assert.equal(market.submitReview('as_storage', 'u_sophie', { stars: 1, comment: 'Broken glasses and a late arrival.' }).ok, false);
  assert.equal(S.transactionsOf('u_lukas').find((t) => t.relatedTaskId === 't_storage').status, 'on_hold');
  assert.ok(safety.resolveDispute('as_storage', 'u_mira', 'release').ok);
  assert.equal(S.assignmentById('as_storage').status, 'completed');
});

test('messages mask contact details until accepted', () => {
  resetDemo();
  const conv = messaging.ensureTaskConversation('t_sofa', 'u_lukas');
  const sent = messaging.sendMessage(conv.id, 'u_lukas', 'Call me at +43 660 765 43 21');
  assert.ok(sent.ok && sent.masked);
  assert.ok(!S.messagesOf(conv.id).at(-1).body.includes('765'));
  const inProgress = 'c_clean';
  const open = messaging.sendMessage(inProgress, 'u_ana', 'My number is +43 660 765 43 21');
  assert.equal(open.masked, false, 'unlocked after acceptance');
});

test('persistence survives a reload', () => {
  resetDemo();
  market.applyToTask('t_event', 'u_tobias', { note: 'Happy to help with chairs and lights.', proposedRate: '70', availability: 'Friday afternoon' });
  const id = getState().applications.at(-1).id;
  loadState();
  assert.ok(S.applicationById(id), 'application still there after reload');
});
