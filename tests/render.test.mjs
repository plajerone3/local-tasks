// Smoke test: every screen renders for every demo account without throwing,
// and no screen promises things the prototype does not do.
import './memory-storage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, resetDemo, session } from '../js/store.js';
import { demoAccounts, myRole, me } from '../js/select.js';
import { ui } from '../js/ui/state.js';
import { shell } from '../js/views/shell.js';
import landing from '../js/views/landing.js';
import guide from '../js/views/guide.js';
import * as auth from '../js/views/auth.js';
import onboarding from '../js/views/onboarding.js';
import dashboard from '../js/views/dashboard.js';
import browse from '../js/views/browse.js';
import taskDetail from '../js/views/task-detail.js';
import taskCreate from '../js/views/task-create.js';
import applicants from '../js/views/applicants.js';
import assignment from '../js/views/assignment.js';
import review from '../js/views/review.js';
import messages from '../js/views/messages.js';
import profile, { editor } from '../js/views/profile.js';
import * as lists from '../js/views/lists.js';
import wallet from '../js/views/wallet.js';
import * as candidates from '../js/views/candidates.js';
import recruiting from '../js/views/recruiting.js';
import safety from '../js/views/safety.js';
import settings from '../js/views/settings.js';
import moderation from '../js/views/moderation.js';
import * as misc from '../js/views/misc.js';
import { getState } from '../js/store.js';

loadState();

const FORBIDDEN = [/guaranteed (income|employment|job)/i, /legally verified/i, /background[- ]checked/i, /safe in every situation/i, /withdraw now/i];

function check(name, out) {
  const s = String(out);
  assert.ok(s.length > 50, `${name} rendered something`);
  assert.ok(!s.includes('[object Object]'), `${name} has no [object Object]`);
  assert.ok(!/\bundefined\b/.test(s.replace(/data-[a-z-]+="[^"]*"/g, '')), `${name} has no "undefined"`);
  assert.ok(!/\bNaN\b/.test(s), `${name} has no NaN`);
  for (const re of FORBIDDEN) assert.ok(!re.test(s), `${name} avoids "${re}"`);
}

function ctxFor(path, params = {}, query = {}) {
  return { path, params, query, user: me(), role: myRole(), ui };
}

test('public screens render signed out', () => {
  resetDemo();
  session.clear();
  for (const [name, view, ctx] of [
    ['landing', landing, ctxFor('/')], ['guide', guide, ctxFor('/guide')], ['signin', auth.signin, ctxFor('/signin')],
    ['signup', auth.signup, ctxFor('/signup', {}, { role: 'tasker' })], ['browse', browse, ctxFor('/tasks')],
    ['task', taskDetail, ctxFor('/tasks/t_sofa', { id: 't_sofa' })], ['scam task', taskDetail, ctxFor('/tasks/t_scam', { id: 't_scam' })],
    ['profile', profile, ctxFor('/profile/u_ferdinand', { id: 'u_ferdinand' })], ['safety', safety, ctxFor('/safety')], ['404', misc.notFound, ctxFor('/x')],
  ]) {
    const out = view.render(ctx);
    check(name, out);
    check(`${name} in shell`, shell(ctx, out));
  }
});

test('every demo account can open every screen for its role', () => {
  resetDemo();
  const tasks = getState().tasks.map((t) => t.id);
  const asgs = getState().assignments.map((a) => a.id);
  const convs = getState().conversations.map((c) => c.id);
  for (const u of demoAccounts()) {
    for (const role of u.roles) {
      session.set({ userId: u.id, role });
      const screens = [
        ['dashboard', dashboard, ctxFor('/dashboard')], ['browse', browse, ctxFor('/tasks')], ['messages', messages, ctxFor('/messages')],
        ['wallet', wallet, ctxFor('/wallet')], ['settings', settings, ctxFor('/settings')], ['safety', safety, ctxFor('/safety')],
        ['notifications', misc.notifications, ctxFor('/notifications')],
        ...tasks.map((id) => [`task ${id}`, taskDetail, ctxFor(`/tasks/${id}`, { id })]),
        ...asgs.map((id) => [`assignment ${id}`, assignment, ctxFor(`/assignments/${id}`, { id })]),
        ...asgs.map((id) => [`review ${id}`, review, ctxFor(`/assignments/${id}/review`, { id })]),
        ...convs.map((id) => [`conversation ${id}`, messages, ctxFor(`/messages/${id}`, { id })]),
        ...getState().users.slice(0, 40).map((x) => [`profile ${x.id}`, profile, ctxFor(`/profile/${x.id}`, { id: x.id })]),
      ];
      if (role === 'client') screens.push(['create', taskCreate, ctxFor('/tasks/new')], ['my tasks', lists.myTasks, ctxFor('/my-tasks')], ...tasks.map((id) => [`applicants ${id}`, applicants, ctxFor(`/tasks/${id}/applicants`, { id })]), ['onboarding client', onboarding, ctxFor('/onboarding/client', { role: 'client' })]);
      if (role === 'tasker') screens.push(['my work', lists.myWork, ctxFor('/my-work')], ['recruiting', recruiting, ctxFor('/recruiting')], ['edit profile', editor, ctxFor('/profile/edit')], ['onboarding tasker', onboarding, ctxFor('/onboarding/tasker', { role: 'tasker' })]);
      if (role === 'business') screens.push(['candidates', candidates.search, ctxFor('/candidates')], ...getState().users.filter((x) => x.roles.includes('tasker')).map((x) => [`candidate ${x.id}`, candidates.detail, ctxFor(`/candidates/${x.id}`, { id: x.id })]), ['onboarding business', onboarding, ctxFor('/onboarding/business', { role: 'business' })]);
      if (role === 'moderator') for (const tab of ['reports', 'proof', 'tasks', 'disputes', 'categories']) screens.push([`moderation ${tab}`, moderation, ctxFor('/moderation', {}, { tab })]);
      for (const [name, view, ctx] of screens) {
        let out;
        try { out = view.render(ctx); } catch (e) { throw new Error(`${u.id}/${role} ${name}: ${e.stack}`); }
        check(`${u.id}/${role} ${name}`, out);
      }
      check(`${u.id}/${role} shell`, shell(ctxFor('/dashboard'), ''));
    }
  }
});

test('onboarding steps render for a brand-new tasker', async () => {
  resetDemo();
  const { signUp } = await import('../js/services/accounts.js');
  const res = signUp({ name: 'Mara Test', email: 'mara@example.com', roles: ['client', 'tasker'], agree: true });
  assert.ok(res.ok);
  for (const step of [0, 1, 2]) {
    ui.onboarding = { step };
    check(`onboarding step ${step}`, onboarding.render(ctxFor('/onboarding/tasker', { role: 'tasker' })));
  }
  ui.onboarding = {};
  check('new tasker dashboard', dashboard.render(ctxFor('/dashboard')));
});
