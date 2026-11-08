// Backoffice: permissions, decisions and their effect on the apps, activity tracking, rendering.
import './memory-storage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, getState, resetDemo, session } from '../js/store.js';
import * as S from '../js/select.js';
import * as accounts from '../js/services/accounts.js';
import * as market from '../js/services/marketplace.js';
import * as messaging from '../js/services/messaging.js';
import * as BO from '../js/services/backoffice.js';
import { setSimulation } from '../js/services/simulation.js';
import { standing } from '../js/logic/enforcement.js';
import { can, ROLES } from '../js/logic/staff.js';
import { scanTask } from '../js/logic/flags.js';
import { setLanguage, getLang } from '../js/i18n.js';
import { isoDate } from '../js/util.js';
import { openCases, kpis } from '../js/admin/data.js';
import { shell } from '../js/admin/shell.js';
import * as home from '../js/admin/views/home.js';
import * as queue from '../js/admin/views/queue.js';
import * as activity from '../js/admin/views/activity.js';
import * as users from '../js/admin/views/users.js';
import * as tasks from '../js/admin/views/tasks.js';
import * as content from '../js/admin/views/content.js';
import * as money from '../js/admin/views/money.js';
import * as team from '../js/admin/views/team.js';

setSimulation(false);
loadState();

const inDays = (n) => isoDate(new Date(Date.now() + n * 864e5));
const draft = (o = {}) => market.draftFromForm({
  title: 'Carry a bookshelf down to the cellar', category: 'moving',
  description: 'A heavy oak bookshelf needs to go from the 2nd floor down to the cellar.',
  date: inDays(3), start: '10:00', end: '12:00', area: 'vienna:wieden', budgetMin: '40', budgetMax: '60', estimatedHours: '2', ...o,
});
const last = (type) => getState().activity.find((e) => e.type === type);

test('seed: staff, rules, history and open cases are there', () => {
  resetDemo();
  const s = getState();
  assert.ok(s.staff.some((x) => x.role === 'owner' && x.active));
  assert.ok(s.activity.length > 200, 'activity is back-filled from the seed');
  assert.ok(s.tasks.find((t) => t.id === 't_scam').flags.some((f) => f.severity === 'high'), 'the scam task is flagged');
  const kinds = new Set(openCases().map((c) => c.kind));
  for (const k of ['report', 'flagged_task', 'task_review', 'flagged_message', 'dispute', 'identity', 'business', 'proof', 'data_request']) assert.ok(kinds.has(k), `queue has ${k}`);
  assert.ok(kpis().users > 20);
});

test('every app action lands in the activity log', () => {
  resetDemo();
  const pub = market.publishTask('u_katharina', draft());
  assert.equal(last('task_published').targetId, pub.id);
  market.applyToTask(pub.id, 'u_lukas', { note: 'I can do this with a friend.', proposedRate: '50', availability: 'Any time' });
  assert.equal(last('application_sent').actorId, 'u_lukas');
  const app = S.activeApplicationsForTask(pub.id)[0];
  const acc = market.acceptApplication(app.id, 'u_katharina');
  assert.equal(last('application_accepted').targetId, acc.assignmentId);
  const conv = messaging.ensureTaskConversation(pub.id, 'u_lukas');
  messaging.sendMessage(conv.id, 'u_lukas', 'See you on Saturday!');
  assert.equal(last('message_sent').targetId, conv.id);
  accounts.signInAs('u_eva', 'client');
  assert.equal(last('signed_in').actorId, 'u_eva');
});

test('roles limit what staff can do', () => {
  resetDemo();
  assert.equal(BO.decideReport('st_samir', 'rp_scam', 'no_action').ok, false, 'analyst is read-only');
  assert.equal(BO.decidePayout('st_tarik', 'tx_x', 'approved').ok, false, 'support cannot approve payouts');
  assert.equal(BO.setStanding('st_lea', 'u_spam', 'banned', { reason: 'Scam account' }).ok, false, 'finance cannot ban');
  assert.equal(BO.addStaff('st_mira', { name: 'New Person', email: 'new@localtasks.example', role: 'support' }).ok, false, 'trust & safety cannot add staff');
  assert.equal(BO.staffSignIn('st_felix').ok, false, 'deactivated staff cannot sign in');
  assert.ok(can(S.staffById('st_jakob'), 'staff.manage'));
  assert.ok(Object.keys(ROLES).length >= 6);
});

test('decisions need a reason and are logged with it', () => {
  resetDemo();
  const noReason = BO.decideReport('st_mira', 'rp_scam', 'hidden', '');
  assert.equal(noReason.ok, false);
  assert.ok(noReason.errors.reason);
  assert.ok(BO.decideReport('st_mira', 'rp_scam', 'hidden', 'Asks for ID copies and WhatsApp.').ok);
  const ev = last('report_hidden');
  assert.equal(ev.actorKind, 'staff');
  assert.equal(ev.reason, 'Asks for ID copies and WhatsApp.');
  assert.equal(S.taskById('t_scam').hidden, true);
  assert.ok(!S.visibleTasks(S.userById('u_lukas')).some((t) => t.id === 't_scam'), 'hidden for other users');
  assert.equal(S.userById('u_spam').warningCount, 2, 'the owner is warned');
  assert.ok(!openCases().some((c) => c.key === 'report:rp_scam'), 'case leaves the queue');
});

test('restrict, suspend, ban and reinstate take effect in the apps', () => {
  resetDemo();
  assert.ok(BO.setStanding('st_mira', 'u_lukas', 'restricted', { reason: 'Several no-shows this month.', days: 7 }).ok);
  assert.equal(standing(S.userById('u_lukas')), 'restricted');
  const open = S.visibleTasks(null).find((t) => t.status === 'open' && t.clientId !== 'u_lukas' && !S.myApplication(t.id, 'u_lukas'));
  const apply = market.applyToTask(open.id, 'u_lukas', { note: 'I would like to help with this.', proposedRate: '50', availability: 'Any time' });
  assert.equal(apply.ok, false, 'restricted accounts cannot apply');
  assert.ok(accounts.signInAs('u_lukas', 'tasker').ok, 'but can still sign in');

  assert.ok(BO.setStanding('st_mira', 'u_eva', 'suspended', { reason: 'Payment dispute pattern.', days: 3 }).ok);
  assert.equal(accounts.signInAs('u_eva', 'client').ok, false, 'suspended accounts cannot sign in');
  assert.ok(S.tasksByClient('u_eva').filter((t) => t.status === 'open').every((t) => t.hidden), 'their open tasks are hidden');
  assert.equal(market.publishTask('u_eva', draft()).ok, false);

  assert.ok(BO.setStanding('st_mira', 'u_eva', 'active', { reason: 'Talked it through, all fine.' }).ok);
  assert.ok(S.tasksByClient('u_eva').filter((t) => t.status === 'open').every((t) => !t.hidden), 'tasks come back');
  assert.ok(accounts.signInAs('u_eva', 'client').ok);

  assert.ok(BO.setStanding('st_jakob', 'u_spam', 'banned', { reason: 'Scam account.' }).ok);
  assert.equal(accounts.signIn('quick@example.com').ok, false);
  assert.ok(last('user_banned').reason.includes('Scam'));
});

test('high-risk tasks are held, flagged messages are queued', () => {
  resetDemo();
  const res = market.publishTask('u_katharina', draft({ description: 'Easy money, no questions asked. Write me on WhatsApp and send a copy of your ID first please.' }));
  assert.equal(res.status, 'under_review', 'held for approval');
  assert.ok(openCases().some((c) => c.key === `task_review:${res.id}`));
  assert.ok(BO.decideTaskReview('st_mira', res.id, 'decline', 'Looks like a scam pattern.').ok);
  assert.equal(S.taskById(res.id).status, 'not_approved');

  const conv = messaging.ensureTaskConversation('t_sofa', 'u_lukas');
  messaging.sendMessage(conv.id, 'u_lukas', 'Text me on telegram, it is easier');
  const m = getState().messages.at(-1);
  assert.ok(m.flags?.some((f) => f.rule === 'off_platform'));
  assert.ok(openCases().some((c) => c.key === `flagged_message:${m.id}`));

  assert.ok(BO.updateSettings('st_nora', { holdHighRisk: false }, 'Testing without holds.').ok);
  const res2 = market.publishTask('u_katharina', draft({ description: 'Write me on WhatsApp, we can agree the details there instead of here.' }));
  assert.equal(res2.status, 'open', 'with holds off it goes live but stays flagged');
  assert.ok(openCases().some((c) => c.key === `flagged_task:${res2.id}`));
  assert.ok(scanTask({ title: 'x', description: 'paysafecard only', budgetMax: 50, estimatedHours: 2 }).length);
});

test('first payouts wait for finance, partial dispute splits the money', () => {
  resetDemo();
  assert.ok(market.confirmCompletion('as_wardrobe', 'u_martin').ok);
  const tx = getState().walletTransactions.find((x) => x.relatedTaskId === 't_wardrobe' && x.type === 'earning');
  assert.equal(tx.payoutStatus, 'awaiting_approval', 'Tobias’ first payout needs approval');
  assert.ok(openCases().some((c) => c.key === `payout:${tx.id}`));
  assert.equal(BO.decidePayout('st_lea', tx.id, 'held', '').ok, false, 'hold needs a reason');
  assert.ok(BO.decidePayout('st_lea', tx.id, 'approved').ok);
  assert.equal(tx.payoutStatus, 'approved');

  assert.equal(BO.decideDispute('st_lea', 'dp_storage', 'partial', 'Two thirds for the work done.', 100).ok, false, 'amount must be below the price');
  assert.ok(BO.decideDispute('st_lea', 'dp_storage', 'partial', 'Two thirds for the work done.', 40).ok);
  const txs = getState().walletTransactions.filter((x) => x.relatedTaskId === 't_storage');
  assert.equal(txs.find((x) => x.type === 'earning').amount, 40);
  assert.equal(txs.find((x) => x.type === 'payment' && x.status === 'refunded').amount, 20);
  assert.equal(S.taskById('t_storage').status, 'completed');
});

test('staff cancel refunds a running job; goodwill refunds need a paid task', () => {
  resetDemo();
  assert.ok(BO.cancelTaskByStaff('st_nora', 't_clean', 'Client and tasker asked us to cancel.').ok);
  assert.equal(S.taskById('t_clean').status, 'cancelled');
  assert.ok(getState().walletTransactions.filter((x) => x.relatedTaskId === 't_clean').every((x) => x.status === 'refunded'));
  assert.equal(BO.refundClient('st_lea', 't_sofa', 10, 'Goodwill gesture.').ok, false);
  assert.ok(BO.refundClient('st_lea', 't_windows', 20, 'Streaks on the balcony door.').ok);
});

test('private conversations open only with a logged reason', () => {
  resetDemo();
  assert.equal(BO.hasConversationAccess('st_mira', 'c_scam_lukas'), false);
  assert.equal(BO.openConversation('st_samir', 'c_scam_lukas', 'Just curious').ok, false, 'analysts cannot read messages');
  assert.equal(BO.openConversation('st_mira', 'c_scam_lukas', '').ok, false);
  assert.ok(BO.openConversation('st_mira', 'c_scam_lukas', 'Report rp_scam: check what was said.').ok);
  assert.ok(BO.hasConversationAccess('st_mira', 'c_scam_lukas'));
  assert.equal(last('conversation_viewed').actorId, 'st_mira');
});

test('notifications from staff use the language of the demo data', () => {
  const prev = getLang();
  setLanguage('de');
  resetDemo();
  setLanguage('en');
  assert.equal(getState().seedLang, 'de');
  BO.warnUser('st_tarik', 'u_lukas', 'Bitte pünktlich sein.');
  const n = S.notificationsOf('u_lukas')[0];
  assert.match(n.text, /Verwarnung/);
  assert.equal(getLang(), 'en', 'the backoffice stays in English');
  setLanguage(prev);
  resetDemo();
});

test('deletion requests anonymise the account', () => {
  resetDemo();
  assert.ok(BO.completeDataRequest('st_tarik', 'dr_bg3').ok);
  const u = S.userById('u_bg3');
  assert.equal(u.name, 'Deleted user');
  assert.equal(standing(u), 'closed');
});

test('every backoffice screen renders for every staff role', () => {
  resetDemo();
  session.clear();
  const s = getState();
  const bad = [];
  const views = [
    [home.overview, {}], [queue.queue, {}], [queue.queue, { who: 'overdue' }], [activity.activity, {}], [activity.audit, { kind: 'all' }],
    [users.list, { sort: 'risk' }], [tasks.list, {}], [content.conversations, {}], [content.reviews, {}],
    [money.money_, {}], [money.money_, { tab: 'ledger' }], [money.money_, { tab: 'refunds' }], [team.staff, {}],
    ...['rules', 'categories', 'sla', 'money', 'announce'].map((tab) => [team.settings, { tab }]), [team.search, { q: 'a' }],
  ];
  for (const st of s.staff.filter((x) => x.active)) {
    const ctx = { staff: st, path: '/', can: (p) => can(st, p) };
    const run = (v, query, params = {}) => {
      try {
        const out = String(shell({ ...ctx, query, params }, v.render({ ...ctx, query, params })));
        if (/undefined|NaN|\[object Object\]/.test(out)) bad.push(`${st.id} ${v.title?.({ query, params })}`);
      } catch (e) { bad.push(`${st.id} ${v.title?.({ query, params })}: ${e.message}`); }
    };
    for (const [v, q] of views) run(v, q);
    for (const c of openCases()) run(queue.casePage, {}, { kind: c.kind, id: c.id });
    for (const id of ['u_lukas', 'u_spam', 'u_gruenraum', 'u_mira']) for (const tab of ['overview', 'work', 'money', 'reviews', 'reports', 'messages', 'proof', 'activity']) run(users.detail, { tab }, { id });
    for (const t of s.tasks) run(tasks.detail, {}, { id: t.id });
    for (const c of s.conversations) run(content.conversation, {}, { id: c.id });
  }
  assert.ok(String(home.signin.render({})).includes('Staff sign-in'));
  assert.deepEqual(bad, []);
});
