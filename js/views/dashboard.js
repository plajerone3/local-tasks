// Role-aware dashboards.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, statusBadge, catLabel, badge, emptyState, notice, meter, stat, fitBlock, rating } from '../ui/components.js';
import {
  taskerProfileOf, publicReviewsAbout, proofsOf, applicationsByTasker, assignmentsForUser, taskById, tasksByClient,
  activeApplicationsForTask, assignmentForTask, transactionsOf, connectionsOfTasker, connectionsOfBusiness, businessOf,
  userById, reviewByFor, savedBy, publicName, firstName,
} from '../select.js';
import { summarize, completeness, reliability } from '../logic/reputation.js';
import { walletSummary } from '../logic/money.js';
import { candidateFit } from '../logic/matching.js';
import { eligibleCandidates } from '../services/recruiting.js';
import { recommendedTasks, taskCard, person, personAvatar } from './common.js';
import { fmt, t } from '../i18n.js';
import { category } from '../data/categories.js';
import { field as fieldById } from '../data/fields.js';
import { areaLabel } from '../data/geo.js';
import moderation from './moderation.js';

const ACTIVE_ASG = ['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'];

function assignmentRow(a, viewer) {
  const task = taskById(a.taskId);
  const other = userById(viewer.id === a.taskerId ? task.clientId : a.taskerId);
  const next = {
    accepted: viewer.id === a.taskerId ? 'Start when you arrive' : 'Waiting for the tasker to start',
    in_progress: viewer.id === a.taskerId ? 'Mark as completed when done' : 'Work in progress',
    awaiting_confirmation: viewer.id === a.taskerId ? 'Waiting for the client to confirm' : 'Please confirm completion',
    disputed: 'Dispute open — ratings and payments are paused',
    completed: reviewByFor(a.id, viewer.id) ? 'Reviewed' : 'Leave a review',
    cancelled: 'Cancelled',
  }[a.status];
  return html`<li class="row-item">
    <div class="row-item__main">
      <a class="row-item__title" href="#/assignments/${a.id}">${task.title}</a>
      <span class="row-item__sub">${catLabel(task.category, { plain: true })} · ${fmt.date(task.date)} ${fmt.window(task.timeWindow)} · with ${publicName(other)}</span>
    </div>
    <div class="row-item__side">${statusBadge('assignment', a.status)}<span class="small muted">${next}</span></div>
  </li>`;
}

function applicationRow(a) {
  const task = taskById(a.taskId);
  return html`<li class="row-item">
    <div class="row-item__main">
      <a class="row-item__title" href="#/tasks/${task.id}">${task.title}</a>
      <span class="row-item__sub">${fmt.date(task.date)} · you proposed ${fmt.money0(a.proposedRate)} · ${areaLabel(task.locationArea)}</span>
    </div>
    <div class="row-item__side">${statusBadge('application', a.status)}</div>
  </li>`;
}

function taskerDash({ user }) {
  const profile = taskerProfileOf(user.id);
  const reviews = publicReviewsAbout(user.id);
  const rep = summarize(reviews);
  const comp = completeness(user, profile, proofsOf(user.id));
  const recs = recommendedTasks(user, 4);
  const apps = applicationsByTasker(user.id).filter((a) => ['applied', 'shortlisted'].includes(a.status));
  const asgs = assignmentsForUser(user.id).filter((a) => a.taskerId === user.id && ACTIVE_ASG.includes(a.status));
  const w = walletSummary(transactionsOf(user.id));
  const pendingConn = connectionsOfTasker(user.id).filter((c) => c.status === 'pending');
  const rel = reliability(profile);
  const cats = Object.entries(rep.byCategory).sort((a, b) => b[1].count - a[1].count).slice(0, 3);

  return html`<div class="wrap page">
    ${pageHead({ eyebrow: t('role.tasker'), title: `Hello, ${firstName(user)}`, lead: 'Tasks that fit you, what you have applied for, and how your work is going.', actions: html`<a class="btn btn--primary" href="#/tasks">${icon('search')}Find tasks</a>` })}
    ${!user.onboarded?.tasker ? notice({ tone: 'info', title: 'Finish setting up when you have a moment', body: 'You can already apply to tasks. A headline, categories and availability make recommendations much better.', actions: html`<a class="btn btn--secondary btn--sm" href="#/onboarding/tasker">Continue setup</a>` }) : ''}
    ${pendingConn.length ? notice({ tone: 'success', ic: 'briefcase', title: `${pendingConn.length === 1 ? 'A business would' : `${pendingConn.length} businesses would`} like to connect about stable work`, actions: html`<a class="btn btn--secondary btn--sm" href="#/recruiting">Open recruiting inbox</a>` }) : ''}
    <div class="layout">
      <div class="stack-lg">
        <section aria-labelledby="rec-h">
          <div class="section-head"><h2 id="rec-h">Recommended for you</h2><a href="#/tasks">All tasks ${icon('chevron', 16)}</a></div>
          <p class="small muted">Based on your categories, skills, availability, area and reviews for similar work. ${t('fair.noScore')}</p>
          ${recs.length ? html`<div class="grid grid--cards">${recs.map((r) => taskCard(r.task, { viewer: user, fit: r.fit }))}</div>`
            : emptyState({ ic: 'compass', title: 'No close matches right now', body: 'Try adding a category or more availability, or browse all open tasks.', actions: html`<a class="btn btn--secondary" href="#/tasks">Browse tasks</a><a class="btn btn--ghost" href="#/profile/edit">Edit profile</a>` })}
        </section>
        <section aria-labelledby="asg-h">
          <div class="section-head"><h2 id="asg-h">Active assignments</h2><a href="#/my-work?tab=assignments">My work ${icon('chevron', 16)}</a></div>
          ${asgs.length ? html`<ul class="row-list">${asgs.map((a) => assignmentRow(a, user))}</ul>` : emptyState({ ic: 'calendar', title: 'No active assignments', body: 'When a client accepts your application, it shows up here.' })}
        </section>
        <section aria-labelledby="app-h">
          <div class="section-head"><h2 id="app-h">Applications</h2><a href="#/my-work">All applications ${icon('chevron', 16)}</a></div>
          ${apps.length ? html`<ul class="row-list">${apps.map(applicationRow)}</ul>` : emptyState({ ic: 'send', title: 'No open applications', body: 'Apply to a recommended task to get started.' })}
        </section>
      </div>
      <aside class="stack" aria-label="Your summary">
        <section class="card">
          <h2 class="card__title">Profile</h2>
          <div class="row row--between"><span class="small">Profile completeness</span><strong>${comp.pct}%</strong></div>
          ${meter(comp.pct, 'Profile completeness')}
          ${comp.missing.length ? html`<p class="small muted">Optional, but helpful: ${comp.missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(', ')}.</p>` : html`<p class="small muted">Everything is filled in.</p>`}
          <div class="row"><a class="btn btn--secondary btn--sm" href="#/profile/edit">Edit profile</a><a class="btn btn--ghost btn--sm" href="#/profile/${user.id}">View public profile</a></div>
        </section>
        <section class="card">
          <h2 class="card__title">Reputation</h2>
          ${rep.count ? html`
            <p>${rating(rep)}</p>
            ${cats.length ? html`<ul class="mini-list">${cats.map(([cat, c]) => html`<li><span>${category(cat).label}</span><span>${fmt.rating(c.avg)} ★ · ${c.count}</span></li>`)}</ul>` : ''}
            ${rep.tags.length ? html`<p class="small muted">Most mentioned: ${rep.tags.slice(0, 3).map(([tg]) => tg.toLowerCase()).join(', ')}.</p>` : ''}
            ${rel ? html`<p class="small">${icon('check', 14)} Completed ${rel.completed} of ${rel.accepted} accepted tasks.</p>` : ''}`
            : html`<p class="muted">No reviews yet. As a newcomer you get extra visibility in recommendations, so your first tasks are easier to find.</p>`}
          <a class="small" href="#/profile/${user.id}">See all reviews</a>
        </section>
        <section class="card">
          <h2 class="card__title">Earnings preview</h2>
          <div class="stats stats--2">${stat('Demo balance', fmt.money(w.available))}${stat('Pending', fmt.money(w.pending + w.onHold), w.onHold ? `${fmt.money(w.onHold)} on hold` : null)}</div>
          <p class="small muted">${t('demo.wallet')}</p>
          <a class="small" href="#/wallet">Open earnings</a>
        </section>
        <section class="card">
          <h2 class="card__title">Stable work</h2>
          ${user.discoverableToBusinesses
            ? html`<p>${badge('Visible to businesses', 'success', 'eye')}</p><p class="small muted">Businesses in the fields you chose can find you. You can switch this off any time.</p>`
            : html`<p class="small">You are not visible to businesses. If you are open to stable work, you can opt in and choose exactly what they see.</p>`}
          <a class="small" href="#/settings#discoverability">Manage visibility</a>
        </section>
      </aside>
    </div>
  </div>`;
}

function clientDash({ user }) {
  const tasks = tasksByClient(user.id);
  const active = tasks.filter((x) => ['open', 'under_review', 'assigned', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(x.status));
  const asgs = assignmentsForUser(user.id).filter((a) => taskById(a.taskId).clientId === user.id);
  const upcoming = asgs.filter((a) => ACTIVE_ASG.includes(a.status));
  const done = asgs.filter((a) => a.status === 'completed');
  const toConfirm = asgs.filter((a) => a.status === 'awaiting_confirmation');
  const toReview = done.filter((a) => !reviewByFor(a.id, user.id));
  const newApps = active.filter((x) => x.status === 'open').reduce((n, x) => n + activeApplicationsForTask(x.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length, 0);
  const w = walletSummary(transactionsOf(user.id));

  const attention = [
    ...toConfirm.map((a) => ({ text: `Confirm that “${taskById(a.taskId).title}” is done`, href: `/assignments/${a.id}`, cta: 'Review and confirm', tone: 'warn' })),
    ...active.filter((x) => x.status === 'open' && activeApplicationsForTask(x.id).some((a) => ['applied', 'shortlisted'].includes(a.status))).map((x) => ({ text: `${activeApplicationsForTask(x.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length} applicants for “${x.title}”`, href: `/tasks/${x.id}/applicants`, cta: 'Compare applicants', tone: 'info' })),
    ...toReview.map((a) => ({ text: `Leave a review for ${firstName(userById(a.taskerId))}`, href: `/assignments/${a.id}/review`, cta: 'Write review', tone: 'success' })),
    ...asgs.filter((a) => a.status === 'disputed').map((a) => ({ text: `Dispute open on “${taskById(a.taskId).title}”`, href: `/assignments/${a.id}`, cta: 'View dispute', tone: 'danger' })),
  ];

  return html`<div class="wrap page">
    ${pageHead({ eyebrow: t('role.client'), title: `Hello, ${firstName(user)}`, lead: 'Your tasks, applicants and upcoming help in one place.', actions: html`<a class="btn btn--primary btn--lg" href="#/tasks/new">${icon('plus')}Post a task</a>` })}
    <div class="stats stats--4">
      ${stat('Active tasks', active.length)}${stat('Applications waiting', newApps)}${stat('Upcoming', upcoming.length)}${stat('Completed', done.length)}
    </div>
    ${attention.length ? html`<section class="card attention" aria-labelledby="att-h"><h2 id="att-h" class="card__title">Needs your attention</h2>
      <ul class="row-list row-list--flush">${attention.map((x) => html`<li class="row-item"><div class="row-item__main"><span>${x.text}</span></div><div class="row-item__side"><a class="btn btn--secondary btn--sm" href="#${x.href}">${x.cta}</a></div></li>`)}</ul></section>` : ''}
    <div class="layout">
      <div class="stack-lg">
        <section aria-labelledby="active-h">
          <div class="section-head"><h2 id="active-h">Active tasks</h2><a href="#/my-tasks">All my tasks ${icon('chevron', 16)}</a></div>
          ${active.length ? html`<div class="grid grid--cards">${active.map((x) => taskCard(x, { viewer: user }))}</div>`
            : emptyState({ ic: 'plus', title: 'No active tasks', body: 'Describe what you need, set a budget, and local taskers can apply.', actions: html`<a class="btn btn--primary" href="#/tasks/new">Post a task</a>` })}
        </section>
        <section aria-labelledby="up-h">
          <h2 id="up-h">Upcoming and in progress</h2>
          ${upcoming.length ? html`<ul class="row-list">${upcoming.map((a) => assignmentRow(a, user))}</ul>` : emptyState({ ic: 'calendar', title: 'Nothing scheduled', body: 'Accepted tasks appear here with their status.' })}
        </section>
        <section aria-labelledby="done-h">
          <h2 id="done-h">Completed work</h2>
          ${done.length ? html`<ul class="row-list">${done.map((a) => assignmentRow(a, user))}</ul>` : emptyState({ ic: 'check', title: 'No completed tasks yet', body: 'After a task is done you can review it and see the demo transaction.' })}
        </section>
      </div>
      <aside class="stack">
        <section class="card">
          <h2 class="card__title">Payments</h2>
          <div class="stats stats--2">${stat('Reserved', fmt.money(w.pending + w.onHold))}${stat('Paid', fmt.money(w.paid))}</div>
          <p class="small muted">${t('demo.wallet')}</p>
          <a class="small" href="#/wallet">See transactions</a>
        </section>
        <section class="card">
          <h2 class="card__title">Tips for a good task</h2>
          <ul class="checklist checklist--sm">
            <li>${icon('check', 14)}<span>Say how big the job is: rooms, metres, number of boxes.</span></li>
            <li>${icon('check', 14)}<span>Mention stairs, pets or anything to bring.</span></li>
            <li>${icon('check', 14)}<span>A fair budget gets more and better applications.</span></li>
            <li>${icon('check', 14)}<span>${t('privacy.address')}</span></li>
          </ul>
        </section>
        ${user.roles.includes('tasker') ? '' : html`<section class="card card--soft"><h2 class="card__title">Have time to help others?</h2><p class="small">The same account can earn as a tasker.</p><button type="button" class="btn btn--secondary btn--sm" data-action="add-role" data-role="tasker">Add the tasker role</button></section>`}
      </aside>
    </div>
  </div>`;
}

function businessDash({ user }) {
  const b = businessOf(user.id);
  const fieldDef = fieldById(b.field);
  const pool = eligibleCandidates(user.id);
  const top = pool.map((c) => ({ ...c, fit: candidateFit({ business: b, tasker: c.user, profile: c.profile, reviews: c.reviews, proofs: c.proofs }) }))
    .filter((c) => c.fit.level !== 'low').sort((a, z) => z.fit.score - a.fit.score).slice(0, 3);
  const saved = savedBy(user.id).map((s) => userById(s.taskerId)).filter(Boolean);
  const conns = connectionsOfBusiness(user.id);

  return html`<div class="wrap page">
    ${pageHead({ eyebrow: t('role.business'), title: b.companyName || 'Your organisation', lead: `${fieldDef?.label || 'Field not set'} · ${b.size || '—'} people · ${b.locationArea ? areaLabel(b.locationArea) : 'Location not set'}`, actions: html`<a class="btn btn--primary" href="#/candidates">${icon('users')}Search candidates</a>` })}
    ${!b.companyName ? notice({ tone: 'info', title: 'Complete your company profile', actions: html`<a class="btn btn--secondary btn--sm" href="#/onboarding/business">Set up profile</a>` }) : ''}
    ${!b.recruitingEnabled ? notice({ tone: 'warn', title: 'Candidate search is off', body: 'Agree to the recruiting rules to search taskers who are open to stable work.', actions: html`<a class="btn btn--secondary btn--sm" href="#/candidates">Turn on recruiting</a>` }) : ''}
    <section class="card card--soft consent-box" aria-labelledby="consent-h">
      <h2 id="consent-h" class="card__title">${icon('shield')} Who you can see, and why</h2>
      <p>${t('recruiting.promise')} You only see people who switched this on themselves. You see recruiting-relevant information (skills, relevant proof, task history and reviews, availability and area), never their contact details, address or messages.</p>
      <p class="small muted">Matches are based on evidence relevant to ${fieldDef ? fieldDef.label.toLowerCase() : 'your field'}, not on one overall score. Business details: ${b.verifiedStatus === 'pending_review' ? 'pending review' : 'not checked'} (demo).</p>
    </section>
    <div class="layout">
      <div class="stack-lg">
        <section aria-labelledby="top-h">
          <div class="section-head"><h2 id="top-h">Relevant candidates</h2><a href="#/candidates">Search with filters ${icon('chevron', 16)}</a></div>
          ${top.length ? html`<ul class="cand-list">${top.map((c) => html`<li class="card cand">
            <div class="cand__head">${person(c.user, { sub: c.profile.headline, link: false })}<a class="btn btn--secondary btn--sm" href="#/candidates/${c.user.id}">View</a></div>
            ${fitBlock(c.fit, { compact: true, title: 'Why they match your field' })}
          </li>`)}</ul>` : emptyState({ ic: 'users', title: 'No opted-in candidates match yet', body: 'New taskers opt in every week. Try the search with wider filters.' })}
        </section>
        <section aria-labelledby="conn-h">
          <h2 id="conn-h">Connection requests</h2>
          ${conns.length ? html`<ul class="row-list">${conns.map((c) => {
            const tk = userById(c.taskerId);
            return html`<li class="row-item"><div class="row-item__main">${person(tk, { link: false, sub: `Sent ${fmt.relative(c.createdAt)}` })}</div>
              <div class="row-item__side">${statusBadge('connection', c.status)}${c.conversationId ? html`<a class="btn btn--secondary btn--sm" href="#/messages/${c.conversationId}">Open chat</a>` : ''}</div></li>`;
          })}</ul>` : emptyState({ ic: 'send', title: 'No requests sent yet', body: 'When you send a connection request, its status shows up here.' })}
        </section>
      </div>
      <aside class="stack">
        <section class="card">
          <h2 class="card__title">Saved candidates</h2>
          ${saved.length ? html`<ul class="mini-people">${saved.map((u) => html`<li><a href="#/candidates/${u.id}" class="person person--link">${personAvatar(u, 'sm')}<span>${publicName(u)}<span class="small muted"> · ${taskerProfileOf(u.id)?.headline.slice(0, 48) || ''}…</span></span></a></li>`)}</ul>` : html`<p class="muted small">Save candidates from the search to compare later.</p>`}
        </section>
        <section class="card">
          <h2 class="card__title">Hiring intent</h2>
          <p class="small">${b.hiringIntent?.roles || 'Not set'}</p>
          <p class="small muted">${b.hiringIntent?.openings || 0} open positions</p>
          <a class="small" href="#/settings">Edit company profile</a>
        </section>
      </aside>
    </div>
  </div>`;
}

export default {
  title: (ctx) => (ctx.role === 'moderator' ? 'Moderation' : 'Dashboard'),
  render(ctx) {
    if (ctx.role === 'moderator') return moderation.render(ctx);
    if (ctx.role === 'business') return businessDash(ctx);
    if (ctx.role === 'tasker') return taskerDash(ctx);
    return clientDash(ctx);
  },
};

