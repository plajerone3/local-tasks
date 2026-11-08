// Users: searchable list and a full profile with history, money, reports and enforcement.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { badge, statusBadge, proofBadge, notice } from '../../ui/components.js';
import { getState } from '../../store.js';
import { userById, taskById, taskerProfileOf, businessOf, tasksByClient, applicationsByTasker, assignmentsForUser, proofsOf, conversationsOf, transactionsOf, reportsBy } from '../../select.js';
import { can } from '../../logic/staff.js';
import { standing, ACCOUNT_STATUS } from '../../logic/enforcement.js';
import { VERIFICATION_STATUS } from '../../logic/status.js';
import { CITIES, areaLabel } from '../../data/geo.js';
import { category } from '../../data/categories.js';
import { field as fieldById } from '../../data/fields.js';
import { fmt } from '../../i18n.js';
import * as BO from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { userStats, riskSignals, userKind, notesFor, reportOwner, reasonLabel } from '../data.js';
import { nameOf } from '../events.js';
import { head, table, person, filters, timeline, notesPanel, section, kv, btn, decisionDialog, REASON, when, ago, money, standingBadge, tabs, staffChip } from '../ui.js';

const STATUS_FILTER = { '': 'Any status', limited: 'Restricted, suspended or banned', ...Object.fromEntries(Object.entries(ACCOUNT_STATUS).map(([k, v]) => [k, v.label])) };

export const list = {
  title: () => 'Users',
  render(ctx) {
    const q = String(ctx.query.q || '').trim().toLowerCase();
    const { role = '', status = '', city = '', sort = 'recent' } = ctx.query;
    let people = getState().users.slice();
    if (q) people = people.filter((u) => `${u.name} ${u.email} ${u.id} ${businessOf(u.id)?.companyName || ''}`.toLowerCase().includes(q));
    if (role) people = people.filter((u) => u.roles.includes(role));
    if (city) people = people.filter((u) => u.locationArea?.city === city);
    if (status === 'limited') people = people.filter((u) => ['restricted', 'suspended', 'banned'].includes(standing(u)));
    else if (status) people = people.filter((u) => standing(u) === status);
    if (ctx.query.verify === 'pending') people = people.filter((u) => u.verificationStatus === 'pending_review' || businessOf(u.id)?.verifiedStatus === 'pending_review');
    const rows = people.map((u) => ({ u, st: userStats(u.id), risk: riskSignals(u.id) }));
    rows.sort(sort === 'risk' ? (a, b) => b.risk.filter((x) => x.tone === 'danger').length - a.risk.filter((x) => x.tone === 'danger').length || b.risk.length - a.risk.length
      : sort === 'name' ? (a, b) => nameOf(a.u.id).localeCompare(nameOf(b.u.id))
        : sort === 'active' ? (a, b) => (b.st.lastSeen || '').localeCompare(a.st.lastSeen || '')
          : (a, b) => b.u.createdAt.localeCompare(a.u.createdAt));
    return html`
      ${head({ title: 'Users', sub: `${getState().users.length} accounts: clients, taskers, businesses and in-app moderators.` })}
      ${filters('/users', [
        { name: 'q', type: 'search', label: 'Search', value: ctx.query.q, placeholder: 'Name, email, company or id' },
        { name: 'role', type: 'select', label: 'Role', value: role, options: [{ value: '', label: 'All roles' }, { value: 'client', label: 'Clients' }, { value: 'tasker', label: 'Taskers' }, { value: 'business', label: 'Businesses' }, { value: 'moderator', label: 'In-app moderators' }] },
        { name: 'status', type: 'select', label: 'Status', value: status, options: Object.entries(STATUS_FILTER).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'city', type: 'select', label: 'City', value: city, options: [{ value: '', label: 'All cities' }, ...CITIES.map((c) => ({ value: c.id, label: c.label }))] },
        { name: 'sort', type: 'select', label: 'Sort', value: sort, options: [{ value: 'recent', label: 'Newest first' }, { value: 'active', label: 'Recently active' }, { value: 'risk', label: 'Most risk signals' }, { value: 'name', label: 'Name' }] },
      ])}
      <p class="bo-count">${rows.length} of ${getState().users.length}</p>
      ${table({
        label: 'Users',
        cols: [{ label: 'Person' }, { label: 'Role' }, { label: 'Area' }, { label: 'Status' }, { label: 'Activity' }, { label: 'Signals' }, { label: 'Joined' }],
        rows: rows.map(({ u, st, risk }) => [
          person(u, { sub: u.email }),
          userKind(u),
          u.locationArea ? areaLabel(u.locationArea, { withCode: false }) : '—',
          standingBadge(u),
          html`<span class="bo-cell-sub">${[st.posted && `${st.posted} posted`, st.jobs && `${st.jobs} jobs`, st.avg != null && `${fmt.rating(st.avg)}★ (${st.reviews})`].filter(Boolean).join(' · ') || '—'}</span><span class="bo-cell-sub">${st.lastSeen ? `active ${ago(st.lastSeen)}` : ''}</span>`,
          risk.length ? html`<span class="bo-signal-count${risk.some((x) => x.tone === 'danger') ? ' bo-signal-count--danger' : ''}" title="${risk.map((x) => x.text).join(' · ')}">${icon('alert', 14)}${risk.length}</span>` : html`<span class="muted">—</span>`,
          fmt.day(u.createdAt),
        ]),
        empty: 'No users match these filters.',
      })}`;
  },
};

// ---------- Detail ----------

const TABS = [['overview', 'Overview'], ['tasks', 'Tasks posted'], ['work', 'Work'], ['money', 'Money'], ['reviews', 'Reviews'], ['reports', 'Reports'], ['messages', 'Conversations'], ['proof', 'Proof'], ['activity', 'Activity']];

function overviewTab(u) {
  const p = taskerProfileOf(u.id);
  const b = businessOf(u.id);
  const vs = VERIFICATION_STATUS[u.verificationStatus] || { label: u.verificationStatus, tone: 'neutral' };
  return html`
    ${section('Account', kv([
      ['Name', u.name], ['Email', u.email], ['Phone', u.phone], ['Roles', u.roles.join(', ')],
      ['Area', u.locationArea ? areaLabel(u.locationArea) : null], ['Languages', (u.languages || []).join(', ')],
      ['Identity', badge(vs.label, vs.tone)], ['Member since', when(u.createdAt)], ['Warnings', u.warningCount || 0],
      ['Visible to businesses', u.discoverableToBusinesses ? 'Yes (opted in)' : 'No'], ['Demo account', u.demo ? u.demo.group : 'No'],
    ]))}
    ${p ? section('Tasker profile', html`<p><strong>${p.headline || 'No headline yet'}</strong></p>${p.bio ? html`<p class="bo-prewrap">${p.bio}</p>` : ''}${kv([
      ['Categories', p.categories.map((c) => category(c).label).join(', ')], ['Skills', p.skills.join(', ')], ['Usual rate', `${fmt.money0(p.rateMin)}–${fmt.money0(p.rateMax)} / h`],
      ['Completed tasks', p.completedTaskCount], ['Cancelled by them', p.cancelledByTasker || 0], ['Looking for stable work', p.employmentGoal?.seeking ? `Yes · ${(p.employmentGoal.fields || []).map((f) => fieldById(f)?.label).join(', ')}` : 'No'],
    ])}`) : ''}
    ${b ? section('Business', kv([['Company', b.companyName], ['Field', fieldById(b.field)?.label], ['Size', b.size], ['Website', b.website], ['Verification', b.verifiedStatus], ['Recruiting', b.recruitingEnabled ? 'On' : 'Off'], ['Hiring for', b.hiringIntent?.roles]])) : ''}`;
}

function tasksTab(u) {
  const ts = tasksByClient(u.id);
  return section('Tasks posted', table({ dense: true, label: 'Tasks posted', cols: [{ label: 'Task' }, { label: 'Status' }, { label: 'Budget', cls: 'bo-num' }, { label: 'Posted' }],
    rows: ts.map((t) => [html`<a href="#/tasks/${t.id}">${t.title}</a>${t.hidden ? html` ${badge('Hidden', 'neutral')}` : ''}${t.flags?.length ? html` ${badge(`${t.flags.length} flags`, 'warn')}` : ''}`, statusBadge('task', t.status), fmt.range(t.budgetMin, t.budgetMax), fmt.day(t.createdAt)]), empty: 'No tasks posted.' }));
}

function workTab(u) {
  const apps = applicationsByTasker(u.id);
  const jobs = assignmentsForUser(u.id);
  return html`${section('Jobs', table({ dense: true, label: 'Jobs', cols: [{ label: 'Task' }, { label: 'As' }, { label: 'Status' }, { label: 'Price', cls: 'bo-num' }, { label: 'Accepted' }],
    rows: jobs.map((a) => { const t = taskById(a.taskId); return [html`<a href="#/tasks/${t.id}">${t.title}</a>`, a.taskerId === u.id ? 'Tasker' : 'Client', statusBadge('assignment', a.status), money(a.agreedPrice), fmt.day(a.acceptedAt)]; }), empty: 'No jobs.' }))}
  ${section('Applications', table({ dense: true, label: 'Applications', cols: [{ label: 'Task' }, { label: 'Offer', cls: 'bo-num' }, { label: 'Status' }, { label: 'Sent' }],
    rows: apps.map((a) => [html`<a href="#/tasks/${a.taskId}">${taskById(a.taskId)?.title}</a>`, fmt.money0(a.proposedRate), statusBadge('application', a.status), fmt.day(a.createdAt)]), empty: 'No applications.' }))}`;
}

function moneyTab(u, ctx) {
  const txs = transactionsOf(u.id);
  return section('Transactions (demo)', table({ dense: true, label: 'Transactions', cols: [{ label: 'Date' }, { label: 'Description' }, { label: 'Type' }, { label: 'Amount', cls: 'bo-num' }, { label: 'Fee', cls: 'bo-num' }, { label: 'Status' }, { label: 'Payout' }],
    rows: txs.map((x) => [fmt.day(x.createdAt), x.relatedTaskId ? html`<a href="#/tasks/${x.relatedTaskId}">${x.label}</a>` : x.label, x.type, money(x.amount), money(x.fee), statusBadge('tx', x.status),
      x.type === 'earning' && x.status === 'completed' ? html`${badge(x.payoutStatus === 'awaiting_approval' ? 'Waiting' : x.payoutStatus === 'held' ? 'On hold' : 'Approved', x.payoutStatus === 'held' ? 'danger' : x.payoutStatus === 'awaiting_approval' ? 'warn' : 'success')}${x.payoutStatus === 'awaiting_approval' ? html` <a href="#/case/payout/${x.id}">Decide</a>` : ''}${x.payoutStatus === 'held' && can(ctx.staff, 'money.payouts') ? btn('Release', 'bo-payout-release', { id: x.id }) : ''}` : '']),
    empty: 'No transactions.' }));
}

function reviewsTab(u, ctx) {
  const s = getState();
  const got = s.reviews.filter((r) => r.revieweeId === u.id);
  const wrote = s.reviews.filter((r) => r.reviewerId === u.id);
  const row = (r, other) => [html`<span class="bo-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>`, html`<strong>${r.taskTitle}</strong><span class="bo-cell-sub">${r.comment}</span>`, person(userById(other)), r.status === 'removed' ? badge('Removed', 'danger') : r.visibility === 'private' ? badge('Private', 'neutral') : badge('Public', 'success'), fmt.day(r.createdAt),
    can(ctx.staff, 'content.moderate') ? btn(r.status === 'removed' ? 'Restore' : 'Remove', 'bo-review-toggle', { id: r.id }, { tone: r.status === 'removed' ? 'secondary' : 'ghost' }) : ''];
  const cols = [{ label: 'Stars' }, { label: 'Review' }, { label: 'By / for' }, { label: 'Status' }, { label: 'Date' }, { label: '' }];
  return html`${section(`Received (${got.length})`, table({ dense: true, label: 'Reviews received', cols, rows: got.slice(0, 40).map((r) => row(r, r.reviewerId)), empty: 'No reviews received.' }))}
    ${section(`Written (${wrote.length})`, table({ dense: true, label: 'Reviews written', cols, rows: wrote.slice(0, 40).map((r) => row(r, r.revieweeId)), empty: 'No reviews written.' }))}`;
}

function reportsTab(u) {
  const about = getState().reports.filter((r) => reportOwner(r) === u.id);
  const by = reportsBy(u.id);
  const cols = [{ label: 'Reason' }, { label: 'Details' }, { label: 'Status' }, { label: 'Date' }];
  const row = (r) => [html`<a href="#/case/report/${r.id}">${reasonLabel(r.reason)}</a>`, r.details, statusBadge('report', r.status), fmt.day(r.createdAt)];
  const blocks = getState().blocks.filter((b) => b.blockedId === u.id || b.blockerId === u.id);
  return html`${section(`About this person (${about.length})`, table({ dense: true, label: 'Reports about them', cols, rows: about.map(row), empty: 'Nobody has reported them.' }))}
    ${section(`Made by this person (${by.length})`, table({ dense: true, label: 'Reports they made', cols, rows: by.map(row), empty: 'They have not reported anyone.' }))}
    ${section('Blocks', blocks.length ? html`<ul class="bo-list">${blocks.map((b) => html`<li>${b.blockerId === u.id ? html`Blocked ${person(userById(b.blockedId))}` : html`Blocked by ${person(userById(b.blockerId))}`} · ${fmt.day(b.createdAt)}</li>`)}</ul>` : html`<p class="bo-empty">No blocks.</p>`)}`;
}

function messagesTab(u) {
  const convs = conversationsOf(u.id);
  return section('Conversations', html`<p class="bo-fine">${icon('lock', 14)}Message text is private. Open a conversation from here; you will be asked for a reason.</p>${table({ dense: true, label: 'Conversations', cols: [{ label: 'With' }, { label: 'About' }, { label: 'Messages', cls: 'bo-num' }, { label: 'Flags' }, { label: '' }],
    rows: convs.map((c) => { const other = c.participantIds.find((p) => p !== u.id); const msgs = getState().messages.filter((m) => m.conversationId === c.id); const flagged = msgs.filter((m) => m.flags?.length).length; return [person(userById(other)), c.contextType === 'task' ? taskById(c.contextId)?.title : 'Recruiting', msgs.length, flagged ? badge(`${flagged} flagged`, 'danger') : '—', html`<a href="#/conversations/${c.id}">Open</a>`]; }), empty: 'No conversations.' })}`);
}

function proofTab(u) {
  const ps = proofsOf(u.id);
  return section('Proof', table({ dense: true, label: 'Proof', cols: [{ label: 'Proof' }, { label: 'Status' }, { label: 'Visible to' }, { label: 'Added' }, { label: '' }],
    rows: ps.map((p) => [p.label, proofBadge(p.status), p.visibility, fmt.day(p.createdAt), p.status === 'pending_review' ? html`<a href="#/case/proof/${p.id}">Review</a>` : '']), empty: 'No proof added.' }));
}

export const detail = {
  title: (ctx) => userById(ctx.params.id)?.name || 'User',
  render(ctx) {
    const u = userById(ctx.params.id);
    if (!u) return html`${head({ title: 'User not found', back: { href: '/users', label: 'Users' } })}`;
    const tab = TABS.some(([id]) => id === ctx.query.tab) ? ctx.query.tab : 'overview';
    const st = standing(u);
    const e = u.enforcement;
    const sig = riskSignals(u.id);
    const stats = userStats(u.id);
    const s = getState();
    const events = s.activity.filter((x) => x.actorId === u.id || (x.targetType === 'user' && x.targetId === u.id) || x.meta?.taskerId === u.id || x.meta?.revieweeId === u.id || x.meta?.userId === u.id);
    const body = { overview: () => overviewTab(u), tasks: () => tasksTab(u), work: () => workTab(u), money: () => moneyTab(u, ctx), reviews: () => reviewsTab(u, ctx), reports: () => reportsTab(u), messages: () => messagesTab(u), proof: () => proofTab(u), activity: () => section('Everything this person did or that concerned them', timeline(events, { limit: 200 })) }[tab]();
    const enforce = can(ctx.staff, 'users.enforce');
    const closed = st === 'closed';
    return html`
      ${head({
        eyebrow: `${userKind(u)} · ${u.id}`, title: nameOf(u.id), back: { href: '/users', label: 'Users' },
        sub: html`${standingBadge(u)} ${u.verificationStatus === 'pending_review' ? html`<a href="#/case/identity/${u.id}">${badge('ID check waiting', 'warn')}</a>` : ''} ${businessOf(u.id)?.verifiedStatus === 'pending_review' ? html`<a href="#/case/business/${u.id}">${badge('Business check waiting', 'warn')}</a>` : ''}`,
        actions: closed ? '' : html`
          ${can(ctx.staff, 'users.warn') ? html`${btn('Send a notice', 'bo-notice', { id: u.id }, { ic: 'send' })}${btn('Warn', 'bo-warn', { id: u.id }, { ic: 'alert' })}` : ''}
          ${enforce && st !== 'active' ? btn('Reinstate', 'bo-standing', { id: u.id, s: 'active' }, { tone: 'primary', ic: 'check' }) : ''}
          ${enforce && st !== 'restricted' ? btn('Restrict', 'bo-standing', { id: u.id, s: 'restricted' }) : ''}
          ${enforce && st !== 'suspended' ? btn('Suspend', 'bo-standing', { id: u.id, s: 'suspended' }, { tone: 'danger' }) : ''}
          ${enforce && st !== 'banned' ? btn('Ban', 'bo-standing', { id: u.id, s: 'banned' }, { tone: 'danger', ic: 'ban' }) : ''}
          ${can(ctx.staff, 'impersonate') ? btn('Open app as this user', 'bo-impersonate', { id: u.id }, { tone: 'ghost', ic: 'eye' }) : ''}
          ${can(ctx.staff, 'money.refund') ? btn('Goodwill refund…', 'bo-refund-pick', { id: u.id }, { tone: 'ghost', ic: 'euro' }) : ''}`,
      })}
      ${e && st !== 'active' ? notice({ tone: st === 'restricted' ? 'warn' : 'danger', title: `${ACCOUNT_STATUS[st].label}${e.until ? ` until ${when(e.until)}` : ''}`, body: html`<p>${e.reason}</p><p class="bo-fine">By ${staffChip(e.by)} · ${when(e.at)}. ${st === 'restricted' ? 'They can sign in and finish current jobs and chats, but cannot post, apply, invite, review or send requests.' : st === 'closed' ? 'The account is closed.' : 'They cannot sign in. Their open tasks are hidden.'}</p>` }) : ''}
      <div class="bo-statline">
        <span><strong>${stats.posted}</strong> tasks posted</span><span><strong>${stats.jobs}</strong> jobs</span><span><strong>${stats.completed}</strong> completed</span>
        <span><strong>${stats.avg != null ? `${fmt.rating(stats.avg)}★` : '—'}</strong> from ${stats.reviews} reviews</span><span><strong>${money(stats.earned)}</strong> earned</span><span><strong>${money(stats.spent)}</strong> spent</span>
        <span>last active <strong>${stats.lastSeen ? ago(stats.lastSeen) : 'never'}</strong></span>
      </div>
      ${tabs(TABS.map(([id, label]) => ({ id, label, href: `/users/${u.id}?tab=${id}` })), tab, 'User sections')}
      <div class="bo-grid bo-grid--case">
        <div class="bo-col">${body}</div>
        <div class="bo-col">
          ${section('Risk signals', sig.length ? html`<ul class="bo-signals bo-signals--stack">${sig.map((x) => html`<li>${badge(x.text, x.tone)}</li>`)}</ul>` : html`<p class="bo-empty">Nothing stands out.</p>`)}
          ${notesPanel('user', u.id, notesFor('user', u.id), can(ctx.staff, 'cases.work'))}
          ${tab !== 'activity' ? section('Recent activity', timeline(events, { limit: 10 }), { actions: html`<a href="#/users/${u.id}?tab=activity">All</a>` }) : ''}
        </div>
      </div>`;
  },
};

// ---------- Handlers ----------

const done = (res, msg) => { toast(res?.ok ? msg : res?.message || 'That did not work.', res?.ok ? 'success' : 'danger'); return res?.ok; };

const STANDING_COPY = {
  restricted: { title: 'Restrict this account', intro: 'They keep access to current jobs and chats, but cannot post tasks, apply, invite, review or send business requests.', days: true, tone: 'primary' },
  suspended: { title: 'Suspend this account', intro: 'They cannot sign in. Their open tasks are hidden until you reinstate them or the suspension ends.', days: true, tone: 'danger' },
  banned: { title: 'Ban this account', intro: 'Permanent. They cannot sign in, open tasks are hidden and pending applications are withdrawn.', days: false, tone: 'danger' },
  active: { title: 'Reinstate this account', intro: 'Everything is allowed again and tasks hidden because of the account status come back.', days: false, tone: 'primary' },
};

export const actions = {
  async 'bo-standing'(el, e, ctx) {
    const c = STANDING_COPY[el.dataset.s];
    const res = await decisionDialog({
      title: c.title, intro: html`<p>${c.intro} The user is notified with your reason.</p>`,
      fields: [...(c.days ? [{ name: 'days', label: 'For how many days?', type: 'number', step: '1', optional: true, hint: 'Leave empty for “until we lift it”.' }] : []), REASON('Reason for the user', 'Shown to the user and kept in the audit log.')],
      confirmLabel: c.title.split(' ')[0], tone: c.tone,
      run: (v) => BO.setStanding(ctx.staff.id, el.dataset.id, el.dataset.s, { reason: v.reason, days: v.days || null }),
    });
    if (res) done(res, 'Account status updated.');
  },
  async 'bo-notice'(el, e, ctx) {
    const res = await decisionDialog({ title: `Message ${userById(el.dataset.id)?.name}`, intro: html`<p>Arrives as a notification from the team. Use it for support replies or reminders, not for warnings.</p>`, fields: [{ name: 'text', label: 'Message', type: 'textarea', max: 400 }], confirmLabel: 'Send', run: (v) => BO.sendUserNotice(ctx.staff.id, el.dataset.id, v.text) });
    if (res) done(res, 'Notice sent.');
  },
  async 'bo-impersonate'(el, e, ctx) {
    const res = await decisionDialog({ title: 'Open the app as this user', intro: html`<p>For support only, for example to see what they see. You act as them: anything you do is done in their name. This is logged.</p>`, fields: [REASON('Why?', 'For example: “Ticket: cannot find the confirm button.”')], confirmLabel: 'Open app', tone: 'danger', run: (v) => BO.impersonate(ctx.staff.id, el.dataset.id, v.reason) });
    if (res?.ok) { window.open(res.url, '_blank', 'noopener'); toast('Opened in a new tab. Logged.', 'info'); }
  },
  async 'bo-refund-pick'(el, e, ctx) {
    const tasks = getState().walletTransactions.filter((x) => x.userId === el.dataset.id && x.type === 'payment' && x.status === 'completed' && x.relatedTaskId);
    if (!tasks.length) { toast('This person has no completed, paid tasks to refund.', 'info'); return; }
    const res = await decisionDialog({
      title: 'Goodwill refund', intro: html`<p>Paid by the platform; the tasker keeps their earning. The client is notified.</p>`,
      fields: [{ name: 'task', label: 'For which task?', type: 'select', value: tasks[0].relatedTaskId, options: tasks.map((x) => ({ value: x.relatedTaskId, label: `${taskById(x.relatedTaskId)?.title} (${money(x.amount + x.fee)})` })) }, { name: 'amount', label: 'Amount (€)', type: 'number', step: '0.01' }, REASON('Reason for the client')],
      confirmLabel: 'Refund', run: (v) => BO.refundClient(ctx.staff.id, v.task, v.amount, v.reason),
    });
    if (res) done(res, 'Refund issued (demo).');
  },
  async 'bo-review-toggle'(el, e, ctx) {
    const r = getState().reviews.find((x) => x.id === el.dataset.id);
    const remove = r.status !== 'removed';
    const res = await decisionDialog({ title: remove ? 'Remove this review' : 'Restore this review', intro: html`<blockquote class="bo-quote">${r.comment || '(no comment)'} — ${r.stars}★</blockquote><p>${remove ? 'It disappears from the profile and stops counting towards ratings. The reviewer is told why.' : 'It shows on the profile again.'}</p>`, fields: [REASON(remove ? 'Reason for the reviewer' : 'Reason')], confirmLabel: remove ? 'Remove review' : 'Restore', tone: remove ? 'danger' : 'primary', run: (v) => BO.setReviewRemoved(ctx.staff.id, r.id, remove, v.reason) });
    if (res) done(res, remove ? 'Review removed.' : 'Review restored.');
  },
  'bo-payout-release'(el, e, ctx) { done(BO.decidePayout(ctx.staff.id, el.dataset.id, 'approved'), 'Payout released.'); },
};
