// Applicant review: compare applications side by side, with transparent reasons.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, statusBadge, badge, select, notice, emptyState, fitBlock, fitBadge, proofBadge, rating } from '../ui/components.js';
import { ui, setUi } from '../ui/state.js';
import { taskById, applicationById, activeApplicationsForTask, userById, taskerProfileOf, publicReviewsAbout, visibleProofs, me, firstName, publicName, assignmentForTask } from '../select.js';
import { summarize, reliability } from '../logic/reputation.js';
import { taskFit, NOT_USED } from '../logic/matching.js';
import { breakdown, pct } from '../logic/money.js';
import { category } from '../data/categories.js';
import { fmt } from '../i18n.js';
import { APP } from '../config.js';
import { acceptApplication, toggleShortlist, declineApplication } from '../services/marketplace.js';
import { ensureTaskConversation } from '../services/messaging.js';
import { person, demoNote } from './common.js';
import { go } from '../router.js';
import { toast, confirmDialog } from '../ui/dialog.js';

function rows(task) {
  return activeApplicationsForTask(task.id).map((a) => {
    const tasker = userById(a.taskerId);
    const profile = taskerProfileOf(a.taskerId);
    const reviews = publicReviewsAbout(a.taskerId);
    const proofs = visibleProofs(a.taskerId, me());
    const rep = summarize(reviews);
    return { a, tasker, profile, proofs, rep, fit: taskFit({ task, tasker, profile, reviews, proofs, perspective: 'client' }), newcomer: (profile?.completedTaskCount || 0) < APP.newcomerThreshold };
  });
}

const SORTS = {
  recommended: (x, y) => y.fit.score - x.fit.score || y.a.createdAt.localeCompare(x.a.createdAt),
  price: (x, y) => x.a.proposedRate - y.a.proposedRate,
  category: (x, y) => (y.rep.byCategory[x.cat]?.avg ?? 0) - (x.rep.byCategory[x.cat]?.avg ?? 0),
  newest: (x, y) => y.a.createdAt.localeCompare(x.a.createdAt),
};

function card(r, task) {
  const { a, tasker, profile, proofs, rep, fit } = r;
  const catStats = rep.byCategory[task.category];
  const b = breakdown(a.proposedRate);
  const open = ['applied', 'shortlisted'].includes(a.status) && task.status === 'open';
  const rel = reliability(profile);
  return html`<article class="card applicant${a.status === 'shortlisted' ? ' applicant--shortlisted' : ''}" aria-labelledby="ap-${a.id}">
    <div class="applicant__head">
      ${person(tasker, { sub: profile?.headline })}
      <div class="row row--tight">${r.newcomer ? badge('New here', 'accent', 'sparkle') : ''}${statusBadge('application', a.status)}${a.simulated ? badge('Demo simulation', 'demo') : ''}</div>
    </div>
    <h3 class="visually-hidden" id="ap-${a.id}">Application from ${publicName(tasker)}</h3>
    <div class="applicant__grid">
      <div class="cell"><span class="cell__label">Proposed price</span><strong class="cell__value">${fmt.money(a.proposedRate)}</strong><span class="small muted">You pay ${fmt.money(b.clientTotal)} incl. ${pct(APP.fees.clientServiceRate)} fee</span></div>
      <div class="cell"><span class="cell__label">Availability</span><span class="cell__value cell__value--text">${a.availability}</span></div>
      <div class="cell"><span class="cell__label">Reviews on ${category(task.category).label.toLowerCase()}</span>${catStats ? html`<span class="cell__value">${fmt.rating(catStats.avg)} ★ <span class="small muted">from ${catStats.count}</span></span>` : html`<span class="cell__value cell__value--text muted">None yet</span>`}<span class="small muted">Overall: ${rep.count ? `${fmt.rating(rep.avg)} ★ (${rep.count})` : 'no reviews yet'}</span></div>
      <div class="cell"><span class="cell__label">Proof</span>${proofs.length ? html`<ul class="proof-mini">${proofs.slice(0, 2).map((p) => html`<li><span>${p.label}</span>${proofBadge(p.status)}</li>`)}</ul>` : html`<span class="cell__value cell__value--text muted">None shared</span>`}</div>
    </div>
    ${a.relevantSkills?.length ? html`<div class="chips">${a.relevantSkills.map((s) => html`<span class="chip">${s}</span>`)}</div>` : ''}
    <blockquote class="quote">${a.note}</blockquote>
    ${fitBlock(fit, { title: `Why ${firstName(tasker)} is suggested` })}
    ${rel ? html`<p class="small muted">${icon('check', 14)} Completed ${rel.completed} of ${rel.accepted} accepted tasks.</p>` : ''}
    <div class="applicant__actions">
      ${open ? html`<button type="button" class="btn btn--primary" data-action="accept-app" data-app="${a.id}">${icon('check')}Accept ${firstName(tasker)}</button>
        <button type="button" class="btn btn--secondary" data-action="shortlist-app" data-app="${a.id}" aria-pressed="${String(a.status === 'shortlisted')}">${icon('bookmark')}${a.status === 'shortlisted' ? 'Shortlisted' : 'Shortlist'}</button>` : ''}
      <button type="button" class="btn btn--secondary" data-action="message-applicant" data-task="${task.id}" data-user="${tasker.id}">${icon('message')}Message</button>
      <a class="btn btn--ghost" href="#/profile/${tasker.id}">Full profile</a>
      ${open ? html`<button type="button" class="btn btn--ghost" data-action="decline-app" data-app="${a.id}">Not this time</button>` : ''}
    </div>
  </article>`;
}

function compare(list, task) {
  if (list.length < 2) return '';
  const cols = list.slice(0, 4);
  const line = (label, fn) => html`<tr><th scope="row">${label}</th>${cols.map((r) => html`<td>${fn(r)}</td>`)}</tr>`;
  return html`<section class="card" aria-labelledby="cmp-h">
    <h2 id="cmp-h" class="card__title">Side by side</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-labelledby="cmp-h">
      <table class="table table--compare">
        <thead><tr><th scope="col"><span class="visually-hidden">Factor</span></th>${cols.map((r) => html`<th scope="col">${publicName(r.tasker)}</th>`)}</tr></thead>
        <tbody>
          ${line('Fit for this task', (r) => fitBadge(r.fit))}
          ${line('Price', (r) => fmt.money(r.a.proposedRate))}
          ${line('You pay', (r) => fmt.money(breakdown(r.a.proposedRate).clientTotal))}
          ${line('Availability', (r) => r.a.availability)}
          ${line(`Reviews on ${category(task.category).label.toLowerCase()}`, (r) => (r.rep.byCategory[task.category] ? `${fmt.rating(r.rep.byCategory[task.category].avg)} ★ (${r.rep.byCategory[task.category].count})` : '—'))}
          ${line('All reviews', (r) => rating(r.rep, { emptyText: 'None yet' }))}
          ${line('Proof', (r) => (r.proofs.length ? r.proofs.map((p) => html`<div class="small">${p.label} · ${proofBadge(p.status)}</div>`) : '—'))}
          ${line('Completed tasks', (r) => r.profile?.completedTaskCount ?? 0)}
        </tbody>
      </table>
    </div>
  </section>`;
}

export default {
  title: (ctx) => `Applicants · ${taskById(ctx.params.id)?.title || ''}`,
  render(ctx) {
    const task = taskById(ctx.params.id);
    if (!task) return html`<div class="wrap page">${emptyState({ title: 'Task not found' })}</div>`;
    if (task.clientId !== ctx.user.id) return html`<div class="wrap page">${notice({ tone: 'warn', title: 'Only the client who posted this task can review applicants.' })}<a href="#/tasks/${task.id}">Back to the task</a></div>`;
    const list = rows(task).map((r) => ({ ...r, cat: task.category }));
    list.sort(SORTS[ui.applicantSort] || SORTS.recommended);
    const asg = assignmentForTask(task.id);
    return html`<div class="wrap page">
      ${pageHead({ back: { href: `/tasks/${task.id}`, label: 'Back to task' }, eyebrow: 'Applicant review', title: task.title, lead: `${list.length} ${list.length === 1 ? 'application' : 'applications'} · budget ${fmt.range(task.budgetMin, task.budgetMax)} · ${fmt.date(task.date)}` })}
      ${asg && asg.status !== 'cancelled' ? notice({ tone: 'success', title: `You accepted ${firstName(userById(asg.taskerId))}`, body: 'The other applicants were told the task is filled, without any mark on their profile.', actions: html`<a class="btn btn--secondary btn--sm" href="#/assignments/${asg.id}">Open assignment</a>` }) : ''}
      ${task.status === 'under_review' ? notice({ tone: 'warn', body: 'Applications open once a moderator approves this task.' }) : ''}
      <div class="toolbar">
        ${select({ id: 'app-sort', name: 'sort', label: 'Sort applicants', value: ui.applicantSort, options: [{ value: 'recommended', label: 'Best fit for this task' }, { value: 'price', label: 'Lowest price' }, { value: 'category', label: `Best ${category(task.category).label.toLowerCase()} reviews` }, { value: 'newest', label: 'Newest' }], extra: { 'data-change': 'applicant-sort' }, cls: 'field--inline' })}
        <details class="disclosure disclosure--inline"><summary>${icon('info', 16)} How suggestions work</summary><div class="disclosure__body small">
          <p>The order is based on this task only: category, relevant skills, availability, distance, reviews on similar work, completion record, relevant proof and budget fit. New taskers get a small boost so they are not invisible.</p>
          <p class="muted">Never used: ${NOT_USED.join('; ')}.</p>
        </div></details>
      </div>
      ${list.length ? html`<div class="applicant-list">${list.map((r) => card(r, task))}</div>${compare(list, task)}`
        : emptyState({ ic: 'users', title: 'No applications yet', body: 'Most tasks get their first application within a day. You can invite suggested taskers from the task page.', actions: html`<a class="btn btn--secondary" href="#/tasks/${task.id}">See suggested taskers</a>` })}
      ${demoNote()}
    </div>`;
  },
};

export const changes = {
  'applicant-sort'(el) { setUi({ applicantSort: el.value }); },
};

export const actions = {
  async 'accept-app'(el) {
    const a = applicationById(el.dataset.app);
    if (!a) return;
    const tasker = userById(a.taskerId);
    const b = breakdown(a.proposedRate);
    const yes = await confirmDialog({
      title: `Accept ${firstName(tasker)} for ${fmt.money(a.proposedRate)}?`,
      body: html`<p>You pay <strong>${fmt.money(b.clientTotal)}</strong>: ${fmt.money(b.price)} for the task plus a ${pct(APP.fees.clientServiceRate)} service fee of ${fmt.money(b.clientFee)}. ${firstName(tasker)} receives ${fmt.money(b.taskerNet)}.</p>
        <p class="small muted">In this demo the amount is only shown as “reserved”. No real money moves. Other applicants are told the task is filled, without any mark on their profile.</p>`,
      confirmLabel: 'Accept and reserve (demo)',
    });
    if (!yes) return;
    const res = acceptApplication(a.id, me().id);
    if (!res.ok) return toast(res.message, 'danger');
    toast(`${firstName(tasker)} is booked. You can share the exact address when you are ready.`);
    go(`/assignments/${res.assignmentId}`);
  },
  'shortlist-app'(el) {
    const res = toggleShortlist(el.dataset.app, me().id);
    if (!res.ok) toast(res.message, 'danger');
  },
  async 'decline-app'(el) {
    const yes = await confirmDialog({ title: 'Decline this application?', body: html`<p>They will be told you chose someone else. It does not affect their profile or ratings.</p>`, confirmLabel: 'Decline' });
    if (!yes) return;
    const res = declineApplication(el.dataset.app, me().id);
    toast(res.ok ? 'Application declined.' : res.message, res.ok ? 'info' : 'danger');
  },
  'message-applicant'(el) {
    const res = ensureTaskConversation(el.dataset.task, el.dataset.user);
    if (res.ok) go(`/messages/${res.id}`);
  },
};

