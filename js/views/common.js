// View pieces that need data access, shared across screens.
import { html, raw } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { badge, statusBadge, catLabel, rating, fitBlock, fitBadge, input, textarea, choices, checkbox, notice } from '../ui/components.js';
import { openDialog, closeDialogs, closeDialogOf, toast, confirmDialog } from '../ui/dialog.js';
import {
  userById, publicName, taskerProfileOf, publicReviewsAbout, proofsOf, activeApplicationsForTask, pendingReportsOn, policyOf,
  demoAccounts, visibleTasks, myApplication, isBlocked, businessOf, me,
} from '../select.js';
import { areaLabel, distanceKm, distanceLabel } from '../data/geo.js';
import { category } from '../data/categories.js';
import { fmt, t, tr } from '../i18n.js';
import { taskFit } from '../logic/matching.js';
import { summarize } from '../logic/reputation.js';
import { initials } from '../util.js';
import { signInAs } from '../services/accounts.js';
import { createReport, blockUser, REPORT_REASONS } from '../services/safety.js';
import { go } from '../router.js';
import { errorsFor, setErrors, clearErrors } from '../ui/state.js';

export function personAvatar(user, size = 'md') {
  if (!user) return html`<span class="avatar avatar--${size}" aria-hidden="true">?</span>`;
  const label = user.roles.includes('business') ? publicName(user) : user.name;
  return html`<span class="avatar avatar--${size}${user.roles.includes('business') ? ' avatar--org' : ''}" style="--av:${user.avatar?.color || '#1E6B58'}" aria-hidden="true">${initials(label)}</span>`;
}

export function person(user, { sub, link = true, size = 'md' } = {}) {
  if (!user) return '';
  const name = publicName(user);
  const href = `#/profile/${user.id}`;
  return html`<span class="person">
    ${personAvatar(user, size)}
    <span class="person__text">
      ${link ? html`<a class="person__name" href="${href}">${name}</a>` : html`<span class="person__name">${name}</span>`}
      ${sub ? html`<span class="person__sub">${sub}</span>` : ''}
    </span>
  </span>`;
}

export function fitFor(task, taskerUser, perspective = 'tasker') {
  const profile = taskerProfileOf(taskerUser.id);
  if (!profile) return null;
  return taskFit({ task, tasker: taskerUser, profile, reviews: publicReviewsAbout(taskerUser.id), proofs: proofsOf(taskerUser.id), perspective });
}

// A task with a pending report stays visible in Browse (reports never hide content on their own),
// but it is not actively recommended until a moderator has looked at it.
export function recommendedTasks(user, limit = 4) {
  return visibleTasks(user)
    .filter((t) => t.status === 'open' && t.clientId !== user.id && !t.hidden && !myApplication(t.id, user.id) && policyOf(t.category) !== 'soon' && !pendingReportsOn('task', t.id).length)
    .map((task) => ({ task, fit: fitFor(task, user) }))
    .filter((x) => x.fit && x.fit.level !== 'low')
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, limit);
}

export function taskCard(task, { viewer = null, fit = null, showFitText = true } = {}) {
  const apps = activeApplicationsForTask(task.id).length;
  const flagged = pendingReportsOn('task', task.id).length > 0;
  const km = viewer?.locationArea && viewer.locationArea.city === task.locationArea.city ? distanceKm(viewer.locationArea, task.locationArea) : null;
  const pol = policyOf(task.category);
  return html`<article class="task-card${task.hidden ? ' task-card--hidden' : ''}">
    <div class="task-card__top">${catLabel(task.category)}${statusBadge('task', task.status)}</div>
    <h3 class="task-card__title"><a href="#/tasks/${task.id}">${task.title}</a></h3>
    <ul class="meta">
      <li>${icon('calendar', 16)}<span>${fmt.date(task.date)} · ${fmt.window(task.timeWindow)}${task.recurring ? ' · repeats' : ''}</span></li>
      <li>${icon('pin', 16)}<span>${areaLabel(task.locationArea)}${km != null ? html` · <span class="muted">${distanceLabel(km)}</span>` : ''}</span></li>
      <li>${icon('euro', 16)}<span><strong>${fmt.range(task.budgetMin, task.budgetMax)}</strong>${task.estimatedHours ? html` <span class="muted">· about ${fmt.number(task.estimatedHours)} h</span>` : ''}</span></li>
    </ul>
    ${fit ? html`<div class="task-card__fit">${fitBadge(fit)}${showFitText ? html`<p class="small">${fit.explanation}</p>` : ''}</div>` : ''}
    <div class="task-card__foot">
      <span class="small muted">${pol === 'review' && task.status === 'under_review' ? 'Applications open after review' : `${apps} ${apps === 1 ? 'application' : 'applications'}`} · ${fmt.relative(task.createdAt)}</span>
      ${flagged ? badge('Reported · under review', 'warn', 'flag') : ''}
      ${task.hidden ? badge('Hidden by moderator', 'neutral', 'eye') : ''}
    </div>
  </article>`;
}

export function ratingFor(userId, opts) {
  return rating(summarize(publicReviewsAbout(userId)), opts);
}

export function reviewItem(r) {
  const reviewer = userById(r.reviewerId);
  return html`<li class="review">
    <div class="review__head">
      <span class="stars" role="img" aria-label="${r.stars} out of 5 stars">${raw('★'.repeat(r.stars))}<span class="stars__off">${raw('★'.repeat(5 - r.stars))}</span></span>
      <span class="review__task">${r.taskTitle}${r.category ? html` · <span class="muted">${category(r.category).label}</span>` : ''}</span>
    </div>
    ${r.comment ? html`<p class="review__text">${r.comment}</p>` : ''}
    <div class="review__foot">
      ${r.tags?.length ? html`<span class="chips chips--sm">${r.tags.map((tg) => html`<span class="chip">${tg}</span>`)}</span>` : ''}
      <span class="small muted">${publicName(reviewer)} · ${fmt.month(r.createdAt)}</span>
    </div>
  </li>`;
}

export function ratingBreakdown(summary) {
  if (!summary.count) return html`<p class="muted">No reviews yet. Everyone starts here.</p>`;
  return html`<div class="rating-breakdown">
    <div class="rating-big"><span class="rating-big__value">${fmt.rating(summary.avg)}</span><span class="stars">${raw('★'.repeat(Math.round(summary.avg)))}<span class="stars__off">${raw('★'.repeat(5 - Math.round(summary.avg)))}</span></span><span class="small muted">${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}</span></div>
    <ul class="bars" aria-label="Rating distribution">${[5, 4, 3, 2, 1].map((n) => {
      const c = summary.dist[n - 1];
      const pct = summary.count ? Math.round((c / summary.count) * 100) : 0;
      return html`<li class="bars__row"><span class="bars__label">${n} ★</span><span class="bars__track"><span class="bars__fill" style="width:${pct}%"></span></span><span class="bars__count">${c}</span></li>`;
    })}</ul>
  </div>`;
}

export function demoAccountList({ next = '', compact = false } = {}) {
  const groups = {};
  for (const u of demoAccounts()) (groups[u.demo.group] ??= []).push(u);
  const order = ['Client', 'Tasker', 'Client and Tasker', 'Business', 'Moderator'];
  return html`<div class="demo-accounts${compact ? ' demo-accounts--compact' : ''}">
    ${order.filter((g) => groups[g]).map((g) => html`<section class="demo-group" aria-label="${g} demo accounts">
      <h3 class="demo-group__title">${g}</h3>
      <ul class="demo-list">${groups[g].map((u) => html`<li>
        <button type="button" class="demo-account" data-action="demo-login" data-user="${u.id}" data-role="${roleForGroup(g, u)}" data-next="${next}">
          ${personAvatar(u)}
          <span class="demo-account__text"><span class="demo-account__name">${u.roles.includes('business') ? publicName(u) : u.name}</span><span class="demo-account__blurb">${u.demo.blurb}</span></span>
          ${icon('chevron', 16)}
        </button>
      </li>`)}</ul>
    </section>`)}
  </div>`;
}

const roleForGroup = (g, u) => ({ Client: 'client', Tasker: 'tasker', 'Client and Tasker': 'client', Business: 'business', Moderator: 'moderator' }[g] || u.roles[0]);

export const homeFor = (role) => (role === 'moderator' ? '/moderation' : '/dashboard');

export function reportButton(targetType, targetId, { label = tr('Report'), userId = null, cls = 'link-btn link-btn--muted' } = {}) {
  return html`<button type="button" class="${cls}" data-action="open-report" data-type="${targetType}" data-id="${targetId}" data-user="${userId || ''}">${icon('flag', 16)}${label}</button>`;
}

export function blockButton(userId, { cls = 'link-btn link-btn--muted' } = {}) {
  const viewer = me();
  if (!viewer || viewer.id === userId) return '';
  if (isBlocked(viewer.id, userId)) return html`<span class="small muted">${icon('ban', 16)} ${tr('Blocked')}</span>`;
  return html`<button type="button" class="${cls}" data-action="block-user" data-user="${userId}">${icon('ban', 16)}${tr('Block')}</button>`;
}

export function safetyLinks(targetType, targetId, userId) {
  return html`<div class="safety-links">${reportButton(targetType, targetId, { userId })}${userId ? blockButton(userId) : ''}<a class="link-btn link-btn--muted" href="#/safety">${icon('shield', 16)}Safety center</a></div>`;
}

export function reportedNotice(type, id) {
  if (!pendingReportsOn(type, id).length) return '';
  return notice({ tone: 'warn', title: 'Reported — pending moderation', body: 'Someone reported this. It stays visible while a moderator reviews it; nothing is removed automatically.', ic: 'flag' });
}

export function demoNote(text = t('demo.wallet')) {
  return notice({ tone: 'demo', body: text, ic: 'info' });
}

export function orgLine(userId) {
  const b = businessOf(userId);
  return b ? `${b.companyName}` : '';
}

function reportForm(type, id, userId, v = {}) {
  const e = errorsFor('report');
  return html`<form data-form="report" novalidate class="stack">
    <input type="hidden" name="targetType" value="${type}"><input type="hidden" name="targetId" value="${id}"><input type="hidden" name="blockUserId" value="${userId || ''}">
    <p class="muted">${tr('Reports go to a moderator. Content stays visible until a moderator decides, and the other person is not told who reported them.')}</p>
    ${choices({ id: 'report-reason', name: 'reason', legend: tr('What is the problem?'), type: 'radio', options: REPORT_REASONS.map((r) => ({ value: r.id, label: tr(r.label) })), values: v.reason ? [v.reason] : [], error: e.reason, required: true, cls: 'choices--stack' })}
    ${textarea({ id: 'report-details', name: 'details', label: tr('What happened?'), rows: 4, value: v.details || '', error: e.details, required: true, hint: tr('Facts help the moderator most: what, when, and anything you have already tried.') })}
    ${userId ? checkbox({ id: 'report-block', name: 'alsoBlock', label: tr('Also block this person'), checked: v.alsoBlock }) : ''}
    ${notice({ tone: 'danger', body: tr('If someone is in immediate danger, call 112 (EU emergency) or 133 (police) first.') })}
    <div class="dialog__actions"><button type="button" class="btn btn--secondary" data-action="dialog-close">${tr('Cancel')}</button><button class="btn btn--primary" type="submit">${tr('Send report')}</button></div>
  </form>`;
}

export const actions = {
  'demo-login'(el) {
    const res = signInAs(el.dataset.user, el.dataset.role);
    if (!res.ok) return toast(res.message, 'danger');
    closeDialogs();
    const u = userById(el.dataset.user);
    toast(`Signed in as ${u.roles.includes('business') ? publicName(u) : u.name} (demo).`, 'info');
    go(el.dataset.next || homeFor(res.role));
  },
  'open-report'(el) {
    if (!me()) return go('/signin');
    clearErrors('report');
    openDialog({ title: tr('Report a problem'), body: reportForm(el.dataset.type, el.dataset.id, el.dataset.user) });
  },
  async 'block-user'(el) {
    const viewer = me();
    if (!viewer) return go('/signin');
    const u = userById(el.dataset.user);
    const yes = await confirmDialog({ title: tr('Block {name}?', { name: publicName(u) }), body: html`<p>${tr('You will not see each other’s tasks, applications or messages. They are not told that you blocked them. You can unblock in the Safety center at any time.')}</p>`, confirmLabel: tr('Block'), tone: 'danger' });
    if (!yes) return;
    blockUser(viewer.id, u.id);
    toast(tr('{name} is blocked.', { name: publicName(u) }));
  },
  'dialog-close'(el) {
    closeDialogOf(el);
  },
};

export const forms = {
  report(form, data) {
    const viewer = me();
    const payload = { targetType: data.get('targetType'), targetId: data.get('targetId'), reason: data.get('reason'), details: data.get('details') || '', alsoBlock: data.get('alsoBlock') === 'on', blockUserId: data.get('blockUserId') };
    const res = createReport(viewer.id, payload);
    if (!res.ok) {
      setErrors('report', res.errors);
      const d = form.closest('dialog');
      if (d) d.querySelector('.dialog__body').innerHTML = String(reportForm(payload.targetType, payload.targetId, payload.blockUserId, payload));
      d?.querySelector('[aria-invalid="true"], fieldset.field--error input')?.focus();
      return;
    }
    clearErrors('report');
    closeDialogs();
    toast(tr('Report sent. A moderator will review it. Nothing is removed automatically.'));
  },
};
