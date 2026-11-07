// Public profiles (tasker, client, business) and the tasker profile editor.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, badge, notice, emptyState, availabilitySummary, proofItem, errorSummary, kv, select } from '../ui/components.js';
import { ui, setUi, errorsFor, setErrors, clearErrors } from '../ui/state.js';
import {
  userById, taskerProfileOf, businessOf, publicReviewsAbout, visibleProofs, publicName, firstName, clientSummary, me, isBlocked, tasksByClient,
  assignmentsForUser, taskById,
} from '../select.js';
import { summarize, reliability, completeness } from '../logic/reputation.js';
import { areaLabel } from '../data/geo.js';
import { category } from '../data/categories.js';
import { field as fieldById, employmentType } from '../data/fields.js';
import { fmt, t } from '../i18n.js';
import { VERIFICATION_STATUS } from '../logic/status.js';
import { APP } from '../config.js';
import { inviteTasker } from '../services/marketplace.js';
import { saveTaskerAbout, saveTaskerWork, saveOpportunity } from '../services/accounts.js';
import { personAvatar, reviewItem, ratingBreakdown, safetyLinks } from './common.js';
import { aboutFields, parseAbout, workFields, parseWork, opportunityFields, parseOpportunity, proofManager } from './profile-forms.js';
import { toast } from '../ui/dialog.js';

function taskerProfile(u, viewer) {
  const p = taskerProfileOf(u.id);
  const reviews = publicReviewsAbout(u.id);
  const rep = summarize(reviews);
  const proofs = visibleProofs(u.id, viewer);
  const isSelf = viewer?.id === u.id;
  const isBiz = viewer?.roles.includes('business');
  const rel = reliability(p);
  const newcomer = p.completedTaskCount < APP.newcomerThreshold;
  const shown = reviews.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ui.reviewsShown);
  const byCat = Object.entries(rep.byCategory).sort((a, b) => b[1].count - a[1].count);
  const recent = assignmentsForUser(u.id).filter((a) => a.taskerId === u.id && a.status === 'completed').slice(-5).reverse();
  const myOpen = viewer && viewer.roles.includes('client') && !isSelf ? tasksByClient(viewer.id).filter((x) => x.status === 'open') : [];

  return html`<div class="wrap page">
    <section class="card profile-hero">
      ${personAvatar(u, 'xl')}
      <div class="profile-hero__text">
        <h1 tabindex="-1">${isSelf ? u.name : publicName(u)}</h1>
        <p class="lead">${p.headline || 'No headline yet'}</p>
        <p class="meta-line">${icon('pin', 16)}${u.locationArea ? areaLabel(u.locationArea) : 'Area not set'}<span aria-hidden="true">·</span>${icon('message', 16)}${u.languages.join(', ') || 'Languages not set'}<span aria-hidden="true">·</span>Member since ${fmt.month(u.createdAt)}</p>
        <div class="row row--tight">
          ${newcomer ? badge('New here', 'accent', 'sparkle') : ''}
          ${badge(VERIFICATION_STATUS[u.verificationStatus]?.label || 'Identity not checked', VERIFICATION_STATUS[u.verificationStatus]?.tone || 'neutral', 'shield')}
          ${(isSelf || isBiz) && u.discoverableToBusinesses ? badge('Open to stable work', 'success', 'briefcase') : ''}
        </div>
      </div>
      <div class="profile-hero__actions">
        ${isSelf ? html`<a class="btn btn--primary" href="#/profile/edit">Edit profile</a>` : ''}
        ${myOpen.length ? html`<form class="invite-form" data-form="invite-from-profile" data-user="${u.id}">${select({ id: 'invite-task', name: 'task', label: 'Invite to one of your tasks', options: myOpen.map((x) => ({ value: x.id, label: x.title })), cls: 'field--compact' })}<button class="btn btn--secondary btn--sm" type="submit">Invite</button></form>` : ''}
        ${isBiz ? html`<a class="btn btn--secondary" href="#/candidates/${u.id}">Recruiting view</a>` : ''}
      </div>
    </section>
    ${isSelf ? notice({ tone: 'info', body: html`This is how others see your profile. ${completeness(u, p, proofs).pct}% complete — <a href="#/profile/edit">add more</a> if you like; it is never required.` }) : ''}
    <div class="layout">
      <div class="stack-lg">
        <section aria-labelledby="about-h"><h2 id="about-h">About</h2>
          ${p.bio ? html`<p class="prewrap">${p.bio}</p>` : html`<p class="muted">No bio yet.</p>`}
          ${p.experience ? html`<h3>Experience</h3><p>${p.experience}</p>` : ''}
        </section>
        <section aria-labelledby="work-h"><h2 id="work-h">Work</h2>
          <div class="chips">${p.categories.map((c) => html`<span class="chip chip--cat"><span aria-hidden="true">${category(c).emoji}</span> ${category(c).label}</span>`)}</div>
          ${p.skills.length ? html`<h3 class="h-small">Skills</h3><div class="chips">${p.skills.map((s) => html`<span class="chip">${s}</span>`)}</div>` : ''}
        </section>
        <section aria-labelledby="proof-h"><h2 id="proof-h">Proof</h2>
          ${proofs.length ? html`<ul class="proof-list">${proofs.map((x) => proofItem(x))}</ul>` : html`<p class="muted">No proof shared. Reviews and completed tasks are shown below.</p>`}
        </section>
        <section aria-labelledby="rev-h"><h2 id="rev-h">Reviews</h2>
          <div class="card">${ratingBreakdown(rep)}
            ${byCat.length ? html`<h3 class="h-small">By kind of task</h3><ul class="mini-list">${byCat.map(([c, s]) => html`<li><span>${category(c).label}</span><span>${fmt.rating(s.avg)} ★ · ${s.count} ${s.count === 1 ? 'task' : 'tasks'}</span></li>`)}</ul>` : ''}
            ${rep.tags.length ? html`<h3 class="h-small">Most mentioned</h3><div class="chips chips--sm">${rep.tags.slice(0, 6).map(([tg, n]) => html`<span class="chip">${tg} · ${n}</span>`)}</div>` : ''}
          </div>
          ${shown.length ? html`<ul class="review-list">${shown.map(reviewItem)}</ul>` : ''}
          ${reviews.length > ui.reviewsShown ? html`<button type="button" class="btn btn--secondary" data-action="more-reviews">Show more reviews</button>` : ''}
          <p class="small muted">Reviews describe single tasks. Disputed tasks are not reviewed until they are resolved.</p>
        </section>
      </div>
      <aside class="stack">
        <section class="card"><h2 class="card__title">Completed tasks</h2>
          <p class="stat__value">${p.completedTaskCount}</p>
          ${rel ? html`<p class="small">${icon('check', 14)} Completed ${rel.completed} of ${rel.accepted} accepted tasks.</p>` : html`<p class="small muted">A completion record is shown once there are at least 5 accepted tasks.</p>`}
          ${recent.length ? html`<ul class="mini-list">${recent.map((a) => html`<li><span>${taskById(a.taskId).title}</span><span class="muted">${fmt.day(a.completedAt)}</span></li>`)}</ul>` : ''}
        </section>
        <section class="card"><h2 class="card__title">Usual availability</h2>${availabilitySummary(p.availability)}</section>
        <section class="card"><h2 class="card__title">Rates</h2><p>${fmt.money0(p.rateMin)}–${fmt.money0(p.rateMax)} per hour</p><p class="small muted">A guide. The price is agreed per task.</p></section>
        ${(isSelf || isBiz) && p.employmentGoal?.seeking ? html`<section class="card"><h2 class="card__title">Work preferences</h2>
          ${kv([['Open to', (p.employmentGoal.types || []).map(employmentType).join(', ') || 'Any'], ['Fields', (p.employmentGoal.fields || []).map((f) => fieldById(f)?.label).join(', ') || 'Any field']])}
          ${p.employmentGoal.note ? html`<p class="small">${p.employmentGoal.note}</p>` : ''}
          <p class="small muted">${isSelf ? 'Only businesses that agreed to the recruiting rules can see this.' : 'Shared because this person chose to be visible for stable work.'}</p></section>` : ''}
        ${viewer && !isSelf ? safetyLinks('user', u.id, u.id) : ''}
      </aside>
    </div>
  </div>`;
}

function clientProfile(u, viewer) {
  const cs = clientSummary(u.id);
  const reviews = publicReviewsAbout(u.id);
  return html`<div class="wrap page page--narrow">
    <section class="card profile-hero">${personAvatar(u, 'xl')}<div class="profile-hero__text"><h1 tabindex="-1">${publicName(u)}</h1><p class="lead">${t('role.client')}${u.locationArea ? ` in ${areaLabel(u.locationArea, { withCode: false })}` : ''}</p><p class="meta-line">Member since ${fmt.month(u.createdAt)} · ${cs.posted} tasks posted · ${cs.completed} completed</p></div></section>
    <section class="section--flush"><h2>Rated by taskers</h2>${ratingBreakdown(summarize(reviews))}<ul class="review-list">${reviews.slice(0, 5).map(reviewItem)}</ul></section>
    ${viewer && viewer.id !== u.id ? safetyLinks('user', u.id, u.id) : ''}
  </div>`;
}

function businessProfile(u, viewer) {
  const b = businessOf(u.id);
  return html`<div class="wrap page page--narrow">
    <section class="card profile-hero">${personAvatar(u, 'xl')}<div class="profile-hero__text"><h1 tabindex="-1">${b.companyName}</h1><p class="lead">${fieldById(b.field)?.label || ''} · ${b.size} people</p><p class="meta-line">${icon('pin', 16)}${b.locationArea ? areaLabel(b.locationArea) : ''}</p><p>${badge(b.verifiedStatus === 'pending_review' ? 'Business details pending review' : 'Business details not checked', 'warn', 'shield')}</p></div></section>
    <section class="card"><h2 class="card__title">About</h2><p>${b.description}</p>${kv([['Hiring for', b.hiringIntent?.roles || '—'], ['Kind of work', (b.hiringIntent?.types || []).map(employmentType).join(', ') || '—'], ['Website', b.website || '—']])}</section>
    ${viewer && viewer.id !== u.id ? safetyLinks('user', u.id, u.id) : ''}
  </div>`;
}

export default {
  title: (ctx) => publicName(userById(ctx.params.id)) || 'Profile',
  render(ctx) {
    const u = userById(ctx.params.id);
    if (!u) return html`<div class="wrap page">${emptyState({ ic: 'user', title: 'Profile not found' })}</div>`;
    if (ctx.user && ctx.user.id !== u.id && isBlocked(ctx.user.id, u.id)) return html`<div class="wrap page">${notice({ tone: 'neutral', title: 'Not available', body: 'You cannot see this profile because one of you has blocked the other.' })}</div>`;
    if (u.roles.includes('business')) return businessProfile(u, ctx.user);
    if (u.roles.includes('tasker') && taskerProfileOf(u.id)) return taskerProfile(u, ctx.user);
    if (u.roles.includes('moderator')) return html`<div class="wrap page">${notice({ tone: 'info', body: 'This is a member of the safety team.' })}</div>`;
    return clientProfile(u, ctx.user);
  },
};

export const editor = {
  title: () => 'Edit profile',
  render(ctx) {
    const u = ctx.user;
    const p = taskerProfileOf(u.id);
    const e1 = errorsFor('edit-about');
    const e2 = errorsFor('edit-work');
    const e3 = errorsFor('edit-opp');
    const comp = completeness(u, p, visibleProofs(u.id, u));
    return html`<div class="wrap page page--narrow">
      ${pageHead({ back: { href: `/profile/${u.id}`, label: 'View public profile' }, eyebrow: 'Tasker profile', title: 'Edit your profile', lead: `${comp.pct}% complete. Every section saves on its own. Nothing here is required to browse or apply.` })}
      <form class="card" data-form="edit-about" novalidate>${errorSummary(e1, 'edit')}<h2 class="card__title">About you</h2>${aboutFields(u, p, e1, 'edit')}<div class="form-actions"><button class="btn btn--primary" type="submit">Save</button></div></form>
      <form class="card" data-form="edit-work" novalidate>${errorSummary(e2, 'edit')}<h2 class="card__title">Your work</h2>${workFields(p, e2, 'edit')}<div class="form-actions"><button class="btn btn--primary" type="submit">Save</button></div></form>
      <div class="card">${proofManager(u, errorsFor('proof'))}</div>
      <form class="card" data-form="edit-opp" novalidate id="discoverability">${errorSummary(e3, 'edit')}<h2 class="card__title">Opportunities beyond tasks</h2><p class="muted">${t('recruiting.promise')}</p>${opportunityFields(u, p, e3, 'edit')}<div class="form-actions"><button class="btn btn--primary" type="submit">Save</button></div></form>
    </div>`;
  },
};

export const actions = {
  'more-reviews'() { setUi({ reviewsShown: ui.reviewsShown + 10 }); },
};

export const forms = {
  'invite-from-profile'(form, data) {
    const res = inviteTasker(data.get('task'), me().id, form.dataset.user);
    toast(res.ok ? `Invitation sent to ${firstName(userById(form.dataset.user))}.` : res.message, res.ok ? 'success' : 'danger');
  },
  'edit-about'(form, data) {
    const res = saveTaskerAbout(me().id, parseAbout(data));
    if (!res.ok) return setErrors('edit-about', res.errors);
    clearErrors('edit-about');
    toast('Saved.');
  },
  'edit-work'(form, data) {
    const res = saveTaskerWork(me().id, parseWork(data));
    if (!res.ok) return setErrors('edit-work', res.errors);
    clearErrors('edit-work');
    ui.onboarding = {};
    toast('Saved. Recommendations now use your updated profile.');
  },
  'edit-opp'(form, data) {
    const d = parseOpportunity(data);
    const res = saveOpportunity(me().id, d);
    if (!res.ok) return setErrors('edit-opp', res.errors);
    clearErrors('edit-opp');
    toast(d.seeking ? 'You are now visible to businesses for stable work.' : 'You are not visible to businesses.');
  },
};
