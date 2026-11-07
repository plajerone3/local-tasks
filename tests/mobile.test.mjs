// Smoke test for the mobile app view: every screen renders for every client and tasker account.
import './memory-storage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, resetDemo, session, getState } from '../js/store.js';
import { demoAccounts, me, myRole } from '../js/select.js';
import { ui } from '../js/ui/state.js';
import * as start from '../js/mobile/screens/start.js';
import * as home from '../js/mobile/screens/home.js';
import * as post from '../js/mobile/screens/post.js';
import * as task from '../js/mobile/screens/task.js';
import * as job from '../js/mobile/screens/job.js';
import * as lists from '../js/mobile/screens/lists.js';
import * as account from '../js/mobile/screens/account.js';
import { cityMap } from '../js/mobile/map.js';
import { toMobile } from '../js/mobile/ui.js';

loadState();
const FORBIDDEN = [/guaranteed (income|employment|job)/i, /legally verified/i, /withdraw now/i];

function check(name, out) {
  const s = String(out);
  assert.ok(s.length > 50, `${name} rendered something`);
  assert.ok(!s.includes('[object Object]'), `${name} has no [object Object]`);
  assert.ok(!/\bundefined\b/.test(s.replace(/data-[a-z-]+="[^"]*"/g, '')), `${name} has no "undefined"`);
  assert.ok(!/\bNaN\b/.test(s), `${name} has no NaN`);
  for (const re of FORBIDDEN) assert.ok(!re.test(s), `${name} avoids ${re}`);
}
const ctx = (path, params = {}, query = {}) => ({ path, params, query, user: me(), role: myRole(), ui });

test('welcome and safety render signed out', () => {
  resetDemo();
  session.clear();
  check('welcome', start.welcome.render(ctx('/')));
  check('safety', account.safety.render(ctx('/safety')));
});

test('maps render for every city, with and without focus', () => {
  for (const cityId of ['vienna', 'graz', 'linz']) {
    const svg = cityMap({ cityId, you: { city: cityId, district: getState().tasks.find((t) => t.locationArea.city === cityId).locationArea.district }, pins: getState().tasks.filter((t) => t.locationArea.city === cityId).map((t) => ({ href: `/task/${t.id}`, label: t.title, area: t.locationArea, category: t.category, price: '€ 90' })) });
    assert.match(svg, /<svg/);
    assert.ok(!/NaN|undefined/.test(svg), `${cityId} map has numbers`);
    const focus = cityMap({ cityId, focus: getState().tasks.find((t) => t.locationArea.city === cityId).locationArea, pins: [] });
    assert.match(focus, /slice/);
  }
});

test('web notification links map to mobile routes', () => {
  assert.equal(toMobile('/tasks/t_sofa/applicants'), '/task/t_sofa/offers');
  assert.equal(toMobile('/assignments/as_clean'), '/job/as_clean');
  assert.equal(toMobile('/assignments/as_clean/review'), '/job/as_clean/rate');
  assert.equal(toMobile('/messages/c_clean'), '/inbox/c_clean');
  assert.equal(toMobile('/moderation?tab=reports'), '/home');
});

test('every client and tasker demo account can open every mobile screen', () => {
  resetDemo();
  const s = getState();
  for (const u of demoAccounts().filter((x) => x.roles.includes('client') || x.roles.includes('tasker'))) {
    for (const role of u.roles) {
      session.set({ userId: u.id, role });
      const screens = [
        ['home', home.home, ctx('/home')], ['activity', lists.activity, ctx('/activity')], ['past', lists.activity, ctx('/activity', {}, { tab: 'past' })],
        ['inbox', lists.inbox, ctx('/inbox')], ['notifications', lists.notifications, ctx('/notifications')],
        ['account', account.account, ctx('/account')], ['wallet', account.wallet, ctx('/wallet')], ['safety', account.safety, ctx('/safety')],
        ...s.tasks.map((t) => [`task ${t.id}`, task.detail, ctx(`/task/${t.id}`, { id: t.id })]),
        ...s.assignments.map((a) => [`job ${a.id}`, job.track, ctx(`/job/${a.id}`, { id: a.id })]),
        ...s.assignments.map((a) => [`rate ${a.id}`, job.rate, ctx(`/job/${a.id}/rate`, { id: a.id })]),
        ...s.conversations.map((c) => [`chat ${c.id}`, lists.thread, ctx(`/inbox/${c.id}`, { id: c.id })]),
        ...s.users.filter((x) => x.demo).map((x) => [`profile ${x.id}`, account.profile, ctx(`/profile/${x.id}`, { id: x.id })]),
      ];
      if (role === 'client') {
        screens.push(...s.tasks.map((t) => [`offers ${t.id}`, task.offers, ctx(`/task/${t.id}/offers`, { id: t.id })]));
        for (const step of [0, 1, 2, 3, 4]) {
          ui.mPost = null;
          const c = ctx('/post', {}, { cat: 'gardening' });
          post.post.render(c);
          ui.mPost.step = step;
          screens.push([`post step ${step}`, post.post, c]);
        }
        screens.push(['post again', post.post, ctx('/post', {}, { again: 't_windows' })]);
      }
      if (role === 'tasker') screens.push(['work', home.work, ctx('/work')], ['recruiting', account.recruiting, ctx('/recruiting')]);
      for (const [name, view, c] of screens) {
        let out;
        try { out = view.render(c); } catch (e) { throw new Error(`${u.id}/${role} ${name}: ${e.stack}`); }
        check(`${u.id}/${role} ${name}`, out);
      }
      ui.mPost = null;
    }
  }
});

test('business and moderator accounts get a pointer to the web app', () => {
  resetDemo();
  for (const id of ['u_gruenraum', 'u_mira']) {
    session.set({ userId: id, role: id === 'u_mira' ? 'moderator' : 'business' });
    check(id, start.notForMobile.render(ctx('/home')));
  }
});
