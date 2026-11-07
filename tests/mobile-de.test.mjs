// German mobile app: every screen renders in German, with no untranslated UI text.
import './memory-storage.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage, missing } from '../js/i18n.js';
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

const ctx = (path, params = {}, query = {}) => ({ path, params, query, user: me(), role: myRole(), ui });

// English words that should never appear in the German UI. Proper nouns are removed first.
const ENGLISH = /\b(the|and|you|your|with|for|this|that|are|is|of|to|from|not|will|can|have|has|what|when|how|here|offer|offers|task|tasks|review|reviews|rated|back|done|available|open|share|send|choose|switch|account|activity|earnings|inbox|home|safety|profile|help|new|see|all|no|yet|get|started|sign|create|submit|save|edit|delete|close|cancel|continue|next|skip|loading|more|week|today|tomorrow|nearby)\b/i;
const PROPER = /Local Tasks|GrünRaum Gartenbau GmbH|ClearSpace Reinigung GmbH|Donau Capital Partners AG|Quick Cash Jobs|CFA Level I|Microsoft-Excel-Expert-Zertifikat|WhatsApp|IKEA|PAX|BILLY|Telefonseelsorge|quickcash@example\.com/g;

function visibleText(html) {
  return String(html)
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/\s(aria-label|placeholder|title)="([^"]*)"/g, ' > $2 < ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map((x) => x.replace(PROPER, ' ').trim()).filter(Boolean);
}

function screensFor(role) {
  const s = getState();
  const list = [
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
    list.push(...s.tasks.map((t) => [`offers ${t.id}`, task.offers, ctx(`/task/${t.id}/offers`, { id: t.id })]));
    for (const step of [0, 1, 2, 3, 4]) {
      ui.mPost = null;
      const c = ctx('/post', {}, { cat: 'gardening' });
      post.post.render(c);
      ui.mPost.step = step;
      list.push([`post step ${step}`, post.post, c]);
    }
  }
  if (role === 'tasker') list.push(['work', home.work, ctx('/work')], ['recruiting', account.recruiting, ctx('/recruiting')]);
  return list;
}

test('every mobile screen renders in German without English leftovers', () => {
  setLanguage('de');
  loadState();
  resetDemo();
  missing.clear();
  const leftovers = new Map();
  session.clear();
  for (const line of visibleText(start.welcome.render(ctx('/')))) if (ENGLISH.test(line)) leftovers.set(line, 'welcome');
  for (const u of demoAccounts().filter((x) => x.roles.includes('client') || x.roles.includes('tasker'))) {
    for (const role of u.roles) {
      session.set({ userId: u.id, role });
      for (const [name, view, c] of screensFor(role)) {
        let out;
        try { out = view.render(c); } catch (e) { throw new Error(`${u.id}/${role} ${name}: ${e.stack}`); }
        for (const line of visibleText(out)) if (ENGLISH.test(line) && !leftovers.has(line)) leftovers.set(line, `${u.id}/${role} ${name}`);
      }
      ui.mPost = null;
    }
  }
  for (const id of ['u_gruenraum', 'u_mira']) {
    session.set({ userId: id, role: id === 'u_mira' ? 'moderator' : 'business' });
    for (const line of visibleText(start.notForMobile.render(ctx('/home')))) if (ENGLISH.test(line)) leftovers.set(line, id);
  }
  const miss = [...missing];
  setLanguage('en');
  if (miss.length || leftovers.size) {
    console.log(`\nMISSING TRANSLATIONS (${miss.length}):\n${miss.map((x) => JSON.stringify(x)).join('\n')}`);
    console.log(`\nENGLISH LEFTOVERS (${leftovers.size}):\n${[...leftovers].map(([l, w]) => `${JSON.stringify(l)}  ← ${w}`).join('\n')}`);
  }
  assert.equal(miss.length, 0, 'every tr() string has a German translation');
  assert.equal(leftovers.size, 0, 'no untranslated English text on any screen');
});

test('the account screen offers a Deutsch/English switch that marks the active language', () => {
  for (const lang of ['de', 'en']) {
    setLanguage(lang);
    session.set({ userId: 'u_lukas', role: 'tasker' });
    const out = String(account.account.render(ctx('/account')));
    const pressed = [...out.matchAll(/data-lang="(\w+)"[^>]*aria-pressed="(true|false)"/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(pressed, [['de', String(lang === 'de')], ['en', String(lang === 'en')]]);
  }
  setLanguage('en');
});

test('German lists join without a serial comma', async () => {
  const { joinList } = await import('../js/util.js');
  assert.equal(joinList(['a', 'b', 'c'], 'und'), 'a, b und c');
  assert.equal(joinList(['a', 'b', 'c']), 'a, b, and c');
});

test('mobile templates have no hard-coded visible text outside tr()', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../js/mobile/', import.meta.url);
  const files = ['main.js', 'ui.js', 'map.js', ...readdirSync(new URL('screens/', dir)).map((f) => `screens/${f}`)];
  const found = [];
  for (const f of files) {
    readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const m of line.matchAll(/>([^<>${}`]*[A-Za-z]{2,}[^<>${}`]*)(?=<|\$\{)/g)) {
        const text = m[1].trim();
        if (text && !/^[\s·•–—\-|,.:;()/+×€%0-9]*$/.test(text)) found.push(`${f}:${i + 1} ${text}`);
      }
      for (const m of line.matchAll(/(aria-label|placeholder|title|alt)="([^"$]*[A-Za-z]{2,}[^"$]*)"/g)) found.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  assert.deepEqual(found, []);
});
