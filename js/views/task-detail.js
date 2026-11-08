// Task detail: facts, safety, client summary, apply flow, owner controls and suggested taskers.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { statusBadge, catLabel, badge, notice, fitBlock, fitBadge, textarea, input, choices, errorSummary, kv, timeline, emptyState } from '../ui/components.js';
import { errorsFor, setErrors, clearErrors } from '../ui/state.js';
import {
  taskById, userById, me, myApplication, assignmentForTask, policyOf, activeApplicationsForTask, taskerProfileOf, clientSummary,
  taskers, isBlocked, firstName, publicName, findConversation,
} from '../select.js';
import { areaLabel, distanceKm, distanceLabel } from '../data/geo.js';
import { category, POLICY } from '../data/categories.js';
import { fmt, t } from '../i18n.js';
import { breakdown, impliedHourly, pct } from '../logic/money.js';
import { lifecycle } from '../logic/status.js';
import { maskContacts, suggestsOffPlatform } from '../logic/privacy.js';
import { APP } from '../config.js';
import { applyToTask, withdrawApplication, cancelTask, inviteTasker, suggestedPrice } from '../services/marketplace.js';
import { ensureTaskConversation } from '../services/messaging.js';
import { person, fitFor, safetyLinks, reportedNotice, personAvatar, ratingFor } from './common.js';
import { go } from '../router.js';
import { toast, confirmDialog } from '../ui/dialog.js';

const PLATFORM_TIPS = [
  'Meet the client at the door and keep communication in the app.',
  'Never send ID copies, bank details or money to start a task.',
  'If anything feels unsafe, leave and report it. In an emergency call 112.',
];

function applyForm(task, user) {
  const e = errorsFor('apply');
  const profile = taskerProfileOf(user.id);
  const price = suggestedPrice(task);
  const b = breakdown(price);
  return html`<form class="apply" data-form="apply" data-task="${task.id}" novalidate>
    <h2 class="card__title">Apply for this task</h2>
    ${errorSummary(e, 'apply')}
    ${textarea({ id: 'apply-note', name: 'note', label: 'Short note to the client', rows: 4, error: e.note, required: true, hint: 'Why you are a good fit and anything you would bring.' })}
    ${input({ id: 'apply-proposedRate', name: 'proposedRate', label: 'Your price for the whole task (€)', type: 'number', value: price, min: 10, step: 5, inputmode: 'decimal', error: e.proposedRate, required: true, hint: `Budget: ${fmt.range(task.budgetMin, task.budgetMax)}`, extra: { 'data-input': 'apply-price' } })}
    <p class="earn" id="apply-earn" aria-live="polite">You would receive <strong data-earn>${fmt.money(b.taskerNet)}</strong> after the ${pct(APP.fees.taskerPlatformRate)} platform fee (demo).</p>
    ${input({ id: 'apply-availability', name: 'availability', label: 'When can you do it?', value: `${fmt.date(task.date)}, ${fmt.window(task.timeWindow)} works for me`, error: e.availability, required: true })}
    ${profile?.skills?.length ? choices({ id: 'apply-skills', name: 'relevantSkills', legend: 'Skills to highlight', options: profile.skills.map((s) => ({ value: s, label: s })), values: profile.skills.filter((s) => category(task.category).skills.includes(s)) }) : ''}
    <button class="btn btn--primary btn--block" type="submit">${icon('send')}Send application</button>
    <p class="small muted">The client sees your note, price, availability, profile and reviews. Your contact details stay hidden.</p>
  </form>`;
}

function taskerPanel(task, user) {
  const app = myApplication(task.id, user.id);
  const asg = assignmentForTask(task.id);
  if (app) {
    const mine = asg && asg.taskerId === user.id ? asg : null;
    return html`<section class="card">
      <h2 class="card__title">Your application</h2>
      ${timeline(lifecycle(app, mine))}
      ${kv([['Your price', fmt.money(app.proposedRate)], ['You receive', `${fmt.money(breakdown(app.proposedRate).taskerNet)} (demo)`], ['Availability', app.availability]])}
      <div class="row">
        ${mine ? html`<a class="btn btn--primary" href="#/assignments/${mine.id}">Open assignment</a>` : ''}
        <button type="button" class="btn btn--secondary" data-action="message-client" data-task="${task.id}">${icon('message')}Message client</button>
        ${['applied', 'shortlisted'].includes(app.status) ? html`<button type="button" class="btn btn--ghost" data-action="withdraw" data-app="${app.id}">Withdraw</button>` : ''}
      </div>
    </section>`;
  }
  if (task.status === 'under_review') return notice({ tone: 'warn', title: 'Applications open after review', body: `${category(task.category).label} tasks are checked by a moderator first. ${category(task.category).note || ''}` });
  if (task.status !== 'open') return notice({ tone: 'neutral', title: 'Not taking applications', body: 'This task already has a tasker or is closed.' });
  if (policyOf(task.category) === 'review' && !taskerProfileOf(user.id)?.categories.includes(task.category)) {
    return html`<section class="card">${notice({ tone: 'warn', body: `This category needs extra trust. Add “${category(task.category).label}” to your profile and relevant proof before applying.` })}<a class="btn btn--secondary" href="#/profile/edit">Edit profile</a></section>`;
  }
  return html`<section class="card">${applyForm(task, user)}</section>`;
}

function ownerPanel(task, user) {
  const apps = activeApplicationsForTask(task.id);
  const asg = assignmentForTask(task.id);
  return html`<section class="card">
    <h2 class="card__title">Your task</h2>
    ${task.status === 'under_review' ? html`<p>${badge('In manual review', 'warn')}</p><p class="small muted">A moderator checks ${category(task.category).label.toLowerCase()} tasks before they go live. You will get a notification.</p>` : ''}
    ${task.status === 'not_approved' ? notice({ tone: 'neutral', title: 'Not approved', body: task.reviewNote || 'A moderator could not approve this task.' }) : ''}
    ${task.status === 'open' ? html`<p><strong>${apps.length}</strong> ${apps.length === 1 ? 'application' : 'applications'}</p>
      <a class="btn btn--primary btn--block" href="#/tasks/${task.id}/applicants">${icon('users')}Review applicants</a>` : ''}
    ${asg && asg.status !== 'cancelled' ? html`<p>${statusBadge('assignment', asg.status)} with ${publicName(userById(asg.taskerId))}</p><a class="btn btn--primary btn--block" href="#/assignments/${asg.id}">Open assignment</a>` : ''}
    ${['open', 'under_review'].includes(task.status) ? html`<button type="button" class="btn btn--ghost btn--block" data-action="cancel-task" data-task="${task.id}">Cancel task</button>` : ''}
    <p class="small muted">${task.exactAddress ? `Private address on file: ${task.exactAddress}. Only you can see it until you share it.` : 'No exact address added. You can add and share it after accepting someone.'}</p>
  </section>`;
}

function suggestions(task, user) {
  const list = taskers()
    .filter(({ user: u }) => u.id !== user.id && !isBlocked(user.id, u.id) && !activeApplicationsForTask(task.id).some((a) => a.taskerId === u.id))
    .map(({ user: u }) => ({ u, fit: fitFor(task, u, 'client') }))
    .filter((x) => x.fit && ['strong', 'good'].includes(x.fit.level))
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 4);
  return html`<section aria-labelledby="sugg-h">
    <div class="section-head"><h2 id="sugg-h">Suggested taskers</h2></div>
    <p class="small muted">People whose profile fits this task. Inviting them sends a notification; it is not a booking. ${APP.simulation ? 'In the demo, invited people may reply with an application.' : ''}</p>
    ${list.length ? html`<ul class="sugg-list">${list.map(({ u, fit }) => html`<li class="card sugg">
      <div class="sugg__head">${person(u, { sub: taskerProfileOf(u.id).headline })}${ratingFor(u.id, { compact: true })}</div>
      ${fitBlock(fit, { compact: true, title: '' })}
      ${task.invitedIds.includes(u.id) ? badge('Invited', 'info', 'check') : html`<button type="button" class="btn btn--secondary btn--sm" data-action="invite" data-task="${task.id}" data-user="${u.id}">Invite to apply</button>`}
    </li>`)}</ul>` : emptyState({ ic: 'users', title: 'No close matches nearby yet', body: 'Taskers can still find your task in Browse.' })}
  </section>`;
}

export default {
  title: (ctx) => taskById(ctx.params.id)?.title || 'Task',
  render(ctx) {
    const task = taskById(ctx.params.id);
    const user = ctx.user;
    if (!task) return html`<div class="wrap page">${emptyState({ ic: 'search', title: 'Task not found', body: 'It may have been removed or the link is wrong.', actions: html`<a class="btn btn--secondary" href="#/tasks">Browse tasks</a>` })}</div>`;
    const isOwner = user?.id === task.clientId;
    const isMod = user?.roles.includes('moderator');
    if (task.hidden && !isOwner && !isMod) return html`<div class="wrap page">${notice({ tone: 'neutral', title: 'This task is not available', body: 'A moderator hid it after reviewing a report.' })}<a href="#/tasks">Back to tasks</a></div>`;
    if (user && !isOwner && isBlocked(user.id, task.clientId)) return html`<div class="wrap page">${notice({ tone: 'neutral', title: 'Not available', body: 'You cannot see this task because one of you has blocked the other. Manage blocks in the Safety center.' })}</div>`;

    const client = userById(task.clientId);
    const cs = clientSummary(client.id);
    const cat = category(task.category);
    const pol = policyOf(task.category);
    const km = user?.locationArea && user.locationArea.city === task.locationArea.city ? distanceKm(user.locationArea, task.locationArea) : null;
    const hourly = task.estimatedHours ? impliedHourly(task.budgetMax, task.estimatedHours) : null;
    const desc = isOwner || isMod ? { text: task.description, masked: false } : maskContacts(task.description);
    const offPlatform = suggestsOffPlatform(task.description);
    const fit = ctx.role === 'tasker' && user && !isOwner ? fitFor(task, user) : null;
    const apps = activeApplicationsForTask(task.id);

    let panel;
    if (!user) panel = html`<section class="card"><h2 class="card__title">Interested?</h2><p>Sign in as a tasker to apply. It takes a minute and you can start with a basic profile.</p><a class="btn btn--primary btn--block" href="#/signup?role=tasker">Create a tasker account</a><button type="button" class="btn btn--secondary btn--block" data-action="demo-login" data-user="u_tobias" data-role="tasker" data-next="/tasks/${task.id}">Try as demo tasker Tobias</button></section>`;
    else if (isOwner) panel = ownerPanel(task, user);
    else if (ctx.role === 'tasker') panel = taskerPanel(task, user);
    else if (user.roles.includes('tasker')) panel = html`<section class="card"><p>You are in your ${t(`role.${ctx.role}`)} view.</p><button type="button" class="btn btn--primary btn--block" data-action="switch-role" data-role="tasker">Switch to Tasker to apply</button></section>`;
    else if (ctx.role === 'client') panel = html`<section class="card"><p>Want to earn by doing tasks like this?</p><button type="button" class="btn btn--secondary btn--block" data-action="add-role" data-role="tasker">Add the tasker role</button></section>`;
    else panel = notice({ tone: 'neutral', body: 'Tasks are applied to from a personal tasker account.' });

    return html`<div class="wrap page">
      <a class="back" href="#/tasks">${icon('back', 16)}All tasks</a>
      ${reportedNotice('task', task.id)}
      ${task.hidden ? notice({ tone: 'neutral', title: 'Hidden by a moderator', body: 'Only you and moderators can see this task.' }) : ''}
      ${task.status === 'under_review' ? notice({ tone: 'warn', title: 'In manual review', body: `${cat.label} is a category that needs extra care. A moderator checks the task before it goes live. ${cat.note || ''}` }) : ''}
      ${offPlatform && !isOwner ? notice({ tone: 'danger', title: 'Be careful', body: 'This task mentions moving to another app or cash-only payment. Keep communication and payment on the platform, and never send ID copies to start a task.' }) : ''}
      <div class="layout">
        <article class="stack-lg">
          <header class="task-head">
            <div class="row row--tight">${catLabel(task.category)}${statusBadge('task', task.status)}${pol !== 'open' ? badge(POLICY[pol].label, POLICY[pol].tone) : ''}</div>
            <h1 tabindex="-1">${task.title}</h1>
            <p class="muted small">Posted ${fmt.relative(task.createdAt)} · ${apps.length} ${apps.length === 1 ? 'application' : 'applications'}</p>
          </header>
          <dl class="facts">
            <div class="fact">${icon('calendar')}<dt>Date</dt><dd>${fmt.dateLong(task.date)}${task.recurring ? html`<span class="small muted">${task.recurring}</span>` : ''}</dd></div>
            <div class="fact">${icon('clock')}<dt>Time</dt><dd>${fmt.window(task.timeWindow)}${task.estimatedHours ? html`<span class="small muted">About ${fmt.number(task.estimatedHours)} h of work</span>` : ''}</dd></div>
            <div class="fact">${icon('pin')}<dt>Area</dt><dd>${areaLabel(task.locationArea)}<span class="small muted">${km != null ? `${distanceLabel(km)} · ` : ''}exact address after acceptance</span></dd></div>
            <div class="fact">${icon('euro')}<dt>Budget</dt><dd>${fmt.range(task.budgetMin, task.budgetMax)}${hourly ? html`<span class="small muted">About ${fmt.money0(Math.round(hourly))}/h at most</span>` : ''}</dd></div>
          </dl>
          <section aria-labelledby="about-h"><h2 id="about-h">About the task</h2><p class="prewrap">${desc.text}</p>${desc.masked ? html`<p class="small muted">${icon('lock', 14)} Contact details in this text are hidden. Keep the conversation in the app.</p>` : ''}</section>
          ${task.requirements.length ? html`<section aria-labelledby="req-h"><h2 id="req-h">Requirements</h2><ul class="checklist">${task.requirements.map((r) => html`<li>${icon('check', 16)}<span>${r}</span></li>`)}</ul></section>` : ''}
          <section aria-labelledby="safe-h" class="card card--soft">
            <h2 id="safe-h" class="card__title">${icon('shield')} Safety notes</h2>
            ${task.safetyNotes ? html`<p><strong>From the client:</strong> ${task.safetyNotes}</p>` : html`<p class="muted">The client did not add specific safety notes.</p>`}
            <ul class="checklist checklist--sm">${PLATFORM_TIPS.map((x) => html`<li>${icon('info', 14)}<span>${x}</span></li>`)}</ul>
            <p class="small muted">${t('privacy.address')} The prototype does not check identities, insurance or backgrounds.</p>
          </section>
          ${isOwner && task.status === 'open' ? suggestions(task, user) : ''}
        </article>
        <aside class="stack">
          ${panel}
          ${fit ? html`<section class="card">${fitBlock(fit, { title: 'Why you are seeing this' })}</section>` : ''}
          <section class="card">
            <h2 class="card__title">Client</h2>
            ${person(client, { sub: `${client.locationArea ? areaLabel(client.locationArea, { withCode: false }).split(' · ')[0] : ''} · member since ${fmt.month(client.createdAt)}`, link: false })}
            <ul class="mini-list">
              <li><span>Tasks posted</span><span>${cs.posted}</span></li>
              <li><span>Rated by taskers</span><span>${cs.reviewCount ? `${fmt.rating(cs.avg)} ★ (${cs.reviewCount})` : 'No ratings yet'}</span></li>
              <li><span>Identity</span><span>${{ pending_review: 'Check pending review', verified: 'Checked by our team (demo)', rejected: 'Check not passed' }[client.verificationStatus] || 'Not checked (demo)'}</span></li>
            </ul>
          </section>
          ${user && !isOwner ? safetyLinks('task', task.id, client.id) : ''}
        </aside>
      </div>
    </div>`;
  },
};

export const inputs = {
  'apply-price'(el) {
    const out = document.querySelector('[data-earn]');
    const v = Number(String(el.value).replace(',', '.'));
    if (out) out.textContent = Number.isFinite(v) && v > 0 ? fmt.money(breakdown(v).taskerNet) : '—';
  },
};

export const forms = {
  apply(form, data) {
    const user = me();
    const taskId = form.dataset.task;
    const res = applyToTask(taskId, user.id, { note: data.get('note') || '', proposedRate: data.get('proposedRate'), availability: data.get('availability') || '', relevantSkills: data.getAll('relevantSkills') });
    if (!res.ok) {
      if (res.message) return toast(res.message, 'danger');
      return setErrors('apply', res.errors);
    }
    clearErrors('apply');
    toast('Application sent. You will get a notification when the client replies.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
};

export const actions = {
  async withdraw(el) {
    const yes = await confirmDialog({ title: 'Withdraw your application?', body: html`<p>The client will no longer see it. Withdrawing does not affect your profile.</p>`, confirmLabel: 'Withdraw' });
    if (!yes) return;
    const res = withdrawApplication(el.dataset.app, me().id);
    toast(res.ok ? 'Application withdrawn.' : res.message, res.ok ? 'info' : 'danger');
  },
  async 'cancel-task'(el) {
    const yes = await confirmDialog({ title: 'Cancel this task?', body: html`<p>Applicants will be told the task was cancelled. It does not affect anyone’s profile.</p>`, confirmLabel: 'Cancel task', cancelLabel: 'Keep task', tone: 'danger' });
    if (!yes) return;
    const res = cancelTask(el.dataset.task, me().id);
    toast(res.ok ? 'Task cancelled.' : res.message, res.ok ? 'info' : 'danger');
  },
  invite(el) {
    const res = inviteTasker(el.dataset.task, me().id, el.dataset.user);
    toast(res.ok ? `Invitation sent to ${firstName(userById(el.dataset.user))}.` : res.message, res.ok ? 'success' : 'danger');
  },
  'message-client'(el) {
    const res = ensureTaskConversation(el.dataset.task, me().id);
    if (res.ok) go(`/messages/${res.id}`);
  },
};

