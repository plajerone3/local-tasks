// Business candidate search (consent-gated) and the recruiting-only candidate view.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, select, input, emptyState, notice, fitBlock, proofItem, availabilitySummary, kv, badge, statusBadge, textarea, errorSummary, checkbox } from '../ui/components.js';
import { ui, setUi, errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { businessOf, userById, taskerProfileOf, publicReviewsAbout, visibleProofs, isSaved, connectionBetween, publicName, firstName, me, isBlocked } from '../select.js';
import { FIELDS, field as fieldById, EMPLOYMENT_TYPES, employmentType } from '../data/fields.js';
import { areaLabel } from '../data/geo.js';
import { category } from '../data/categories.js';
import { fmt, t } from '../i18n.js';
import { summarize } from '../logic/reputation.js';
import { candidateFit, isRecruitable } from '../logic/matching.js';
import { searchCandidates, toggleSave, sendConnection } from '../services/recruiting.js';
import { enableRecruiting } from '../services/accounts.js';
import { person, personAvatar, safetyLinks } from './common.js';
import { BUSINESS_CANNOT_SEE } from './profile-forms.js';
import { openDialog, closeDialogs, toast } from '../ui/dialog.js';

let debounce = null;

function gate(b) {
  const e = errorsFor('enable-recruiting');
  return html`<div class="wrap page page--narrow">
    ${pageHead({ eyebrow: 'Candidate search', title: 'Turn on recruiting', lead: `${t('recruiting.promise')} Before you can search, please agree to the recruiting rules.` })}
    <form class="card" data-form="enable-recruiting" novalidate>
      ${errorSummary(e, 'rec')}
      <ul class="checklist">
        <li>${icon('check')}<span>Contact candidates only through the platform.</span></li>
        <li>${icon('check')}<span>Respect each candidate’s visibility settings and replies.</span></li>
        <li>${icon('check')}<span>Do not copy candidate data into other systems without their consent.</span></li>
        <li>${icon('check')}<span>Never ask about age, family plans, religion, origin or health.</span></li>
      </ul>
      ${checkbox({ id: 'rec-consent', name: 'consent', label: `We agree to the recruiting rules${b.companyName ? ` on behalf of ${b.companyName}` : ''}.`, error: e.consent })}
      <button class="btn btn--primary" type="submit">Turn on candidate search</button>
    </form>
  </div>`;
}

function connectBody(tasker, v = {}) {
  const e = errorsFor('connect');
  return html`<form data-form="connect" data-user="${tasker.id}" novalidate class="stack">
    <p>${firstName(tasker)} sees your company profile and this message, and decides whether to talk. If they accept, a recruiting conversation opens in the app. A request is not an interview or an offer.</p>
    ${errorSummary(e, 'connect')}
    ${textarea({ id: 'connect-message', name: 'message', label: 'Your message', rows: 5, value: v.message || '', error: e.message, required: true, hint: 'Say which role, where, and why their experience caught your attention. Do not ask for personal details.' })}
    <div class="dialog__actions"><button type="button" class="btn btn--secondary" data-action="dialog-close">Cancel</button><button class="btn btn--primary" type="submit">${icon('send')}Send request</button></div>
  </form>`;
}

function candidateActions(bizId, tasker) {
  const conn = connectionBetween(bizId, tasker.id);
  const saved = isSaved(bizId, tasker.id);
  return html`<div class="row row--tight">
    <button type="button" class="btn btn--ghost btn--sm" data-action="cand-save" data-user="${tasker.id}" aria-pressed="${saved}">${icon('bookmark', 16)}${saved ? 'Saved' : 'Save'}</button>
    ${conn ? html`${statusBadge('connection', conn.status)}${conn.conversationId ? html`<a class="btn btn--secondary btn--sm" href="#/messages/${conn.conversationId}">Open chat</a>` : ''}`
      : html`<button type="button" class="btn btn--primary btn--sm" data-action="cand-connect" data-user="${tasker.id}">${icon('send', 16)}Connect</button>`}
  </div>`;
}

export const search = {
  title: () => 'Candidates',
  render(ctx) {
    const b = businessOf(ctx.user.id);
    if (!b) return html`<div class="wrap page">${notice({ tone: 'warn', body: 'Candidate search is for business accounts.' })}</div>`;
    if (!b.recruitingEnabled) return gate(b);
    const f = { ...ui.candidates, field: ui.candidates.field || b.field };
    const results = searchCandidates(ctx.user.id, f);
    const fieldDef = fieldById(f.field);
    return html`<div class="wrap page">
      ${pageHead({ eyebrow: b.companyName, title: 'Find candidates', lead: 'Only people who chose to be visible for stable work appear here. They can switch this off at any time, and they are never ranked on one overall score.' })}
      <div class="browse">
        <form class="filters card" role="search" aria-label="Filter candidates" data-form="noop" novalidate>
          <div class="filters__head"><h2 class="filters__title">${icon('filter', 18)}Filters</h2><button type="button" class="link-btn" data-action="cand-reset">Reset</button></div>
          ${select({ id: 'c-field', name: 'field', label: 'Field', value: f.field, options: FIELDS.map((x) => ({ value: x.id, label: x.label })), hint: 'Matching uses evidence relevant to this field.', extra: { 'data-change': 'cand-filter' } })}
          ${input({ id: 'c-q', name: 'q', label: 'Skills or keywords', type: 'search', value: f.q, placeholder: 'Excel, hedge, licence…', extra: { 'data-input': 'cand-filter', autocomplete: 'off' } })}
          ${select({ id: 'c-evidence', name: 'evidence', label: 'Evidence', value: f.evidence, options: [{ value: 'any', label: 'Any' }, { value: 'any_proof', label: 'Has proof items' }, { value: 'reviewed', label: 'Proof sent for review or checked' }, { value: 'verified', label: 'Proof checked by a moderator' }], extra: { 'data-change': 'cand-filter' } })}
          ${select({ id: 'c-history', name: 'history', label: fieldDef?.categories.length ? `${fieldDef.short} tasks completed` : 'Tasks completed', value: f.history, options: [{ value: 'any', label: 'Any, including newcomers' }, { value: '1', label: '1 or more' }, { value: '5', label: '5 or more' }, { value: '10', label: '10 or more' }], extra: { 'data-change': 'cand-filter' } })}
          ${select({ id: 'c-rating', name: 'rating', label: 'Review quality', value: f.rating, options: [{ value: 'any', label: 'Any' }, { value: '4', label: '4.0 or higher' }, { value: '4.5', label: '4.5 or higher' }], hint: fieldDef?.categories.length ? `On ${fieldDef.short} tasks.` : 'Across all tasks.', extra: { 'data-change': 'cand-filter' } })}
          ${select({ id: 'c-type', name: 'type', label: 'Open to', value: f.type, options: [{ value: 'any', label: 'Any kind of work' }, ...EMPLOYMENT_TYPES.map((x) => ({ value: x.id, label: x.label }))], extra: { 'data-change': 'cand-filter' } })}
          ${select({ id: 'c-availability', name: 'availability', label: 'Availability', value: f.availability, options: [{ value: 'any', label: 'Any' }, { value: 'weekdays', label: 'Weekdays' }, { value: 'weekends', label: 'Weekends' }], extra: { 'data-change': 'cand-filter' } })}
          ${select({ id: 'c-location', name: 'location', label: 'Location', value: f.location, options: [{ value: 'any', label: 'Anywhere' }, { value: 'same_city', label: `Same city as you` }], extra: { 'data-change': 'cand-filter' } })}
        </form>
        <section class="results" aria-labelledby="cand-h">
          <h2 id="cand-h" class="results__count">${results.length} ${results.length === 1 ? 'candidate' : 'candidates'}</h2>
          ${results.length ? html`<ul class="cand-list">${results.map((c) => {
            const relevantCats = fieldDef?.categories || [];
            const hist = relevantCats.map((cat) => c.rep.byCategory[cat]).filter(Boolean);
            const n = hist.reduce((a, x) => a + x.count, 0);
            return html`<li class="card cand">
              <div class="cand__head">${person(c.user, { sub: c.profile.headline, link: false })}${candidateActions(ctx.user.id, c.user)}</div>
              <div class="cand__facts small">
                <span>${icon('pin', 14)} ${areaLabel(c.user.locationArea)}</span>
                <span>${icon('briefcase', 14)} Open to ${(c.profile.employmentGoal.types || []).map(employmentType).join(', ').toLowerCase() || 'any work'}</span>
                <span>${icon('check', 14)} ${relevantCats.length ? `${n} ${fieldDef.short} ${n === 1 ? 'task' : 'tasks'}` : `${c.profile.completedTaskCount} tasks`}${c.rep.count ? ` · ${fmt.rating(c.rep.avg)} ★ overall` : ' · no reviews yet'}</span>
              </div>
              ${fitBlock(c.fit, { title: 'Why they match your field' })}
              ${c.proofs.length ? html`<ul class="proof-list proof-list--compact">${c.proofs.slice(0, 3).map((p) => proofItem(p, { showHint: false }))}</ul>` : ''}
              <a class="small" href="#/candidates/${c.user.id}">View recruiting profile ${icon('chevron', 14)}</a>
            </li>`;
          })}</ul>` : emptyState({ ic: 'users', title: 'No opted-in candidates match', body: 'Try “Any” for evidence or history. Newcomers with relevant proof may not have task history yet.', actions: html`<button type="button" class="btn btn--secondary" data-action="cand-reset">Reset filters</button>` })}
        </section>
      </div>
    </div>`;
  },
};

export const detail = {
  title: (ctx) => publicName(userById(ctx.params.id)),
  render(ctx) {
    const b = businessOf(ctx.user.id);
    const u = userById(ctx.params.id);
    const p = u && taskerProfileOf(u.id);
    if (!u || !p || !isRecruitable(u, p) || isBlocked(ctx.user.id, u.id) || !b?.recruitingEnabled) {
      return html`<div class="wrap page">${pageHead({ back: { href: '/candidates', label: 'Candidates' }, title: 'Not visible' })}${notice({ tone: 'neutral', body: 'This person is not visible for stable work at the moment. People can switch visibility off at any time.' })}</div>`;
    }
    const reviews = publicReviewsAbout(u.id);
    const proofs = visibleProofs(u.id, ctx.user);
    const rep = summarize(reviews);
    const fit = candidateFit({ business: b, tasker: u, profile: p, reviews, proofs });
    const fieldDef = fieldById(b.field);
    const relevantReviews = reviews.filter((r) => !fieldDef?.categories.length || fieldDef.categories.includes(r.category)).slice(0, 4);
    return html`<div class="wrap page">
      ${pageHead({ back: { href: '/candidates', label: 'Candidates' }, eyebrow: 'Recruiting profile', title: publicName(u), lead: p.headline })}
      <div class="layout">
        <div class="stack-lg">
          <section class="card">${fitBlock(fit, { title: `Relevance to ${fieldDef?.label.toLowerCase() || 'your field'}` })}</section>
          <section><h2>About</h2><p>${p.bio}</p>${p.experience ? html`<h3 class="h-small">Experience</h3><p>${p.experience}</p>` : ''}
            <div class="chips">${p.skills.map((s) => html`<span class="chip">${s}</span>`)}</div></section>
          <section><h2>Proof</h2>${proofs.length ? html`<ul class="proof-list">${proofs.map((x) => proofItem(x))}</ul>` : html`<p class="muted">No proof shared with businesses.</p>`}</section>
          <section><h2>Task history</h2>
            ${Object.keys(rep.byCategory).length ? html`<ul class="mini-list">${Object.entries(rep.byCategory).map(([c, s]) => html`<li><span>${category(c).label}</span><span>${s.count} tasks · ${fmt.rating(s.avg)} ★</span></li>`)}</ul>` : html`<p class="muted">No completed tasks yet. Newcomers are shown so that evidence from proof and profile counts too.</p>`}
            ${relevantReviews.length ? html`<h3 class="h-small">Relevant reviews</h3><ul class="review-list">${relevantReviews.map((r) => html`<li class="review"><div class="review__head"><span class="stars" aria-label="${r.stars} out of 5">${'★'.repeat(r.stars)}</span><span class="review__task">${r.taskTitle}</span></div><p class="review__text">${r.comment}</p></li>`)}</ul>` : ''}
          </section>
        </div>
        <aside class="stack">
          <section class="card"><h2 class="card__title">Connect</h2>${candidateActions(ctx.user.id, u)}</section>
          <section class="card"><h2 class="card__title">Work preferences</h2>${kv([['Open to', (p.employmentGoal.types || []).map(employmentType).join(', ')], ['Fields', (p.employmentGoal.fields || []).map((x) => fieldById(x)?.label).join(', ') || 'Any'], ['Area', areaLabel(u.locationArea)], ['Languages', u.languages.join(', ')]])}${p.employmentGoal.note ? html`<p class="small">${p.employmentGoal.note}</p>` : ''}</section>
          <section class="card"><h2 class="card__title">Usual availability</h2>${availabilitySummary(p.availability)}</section>
          <section class="card card--soft"><h2 class="card__title">${icon('lock')} Not shared with you</h2><ul class="checklist checklist--sm checklist--muted">${BUSINESS_CANNOT_SEE.map((x) => html`<li>${icon('x', 14)}<span>${x.replace(/^your /, '')}</span></li>`)}</ul></section>
          ${safetyLinks('user', u.id, u.id)}
        </aside>
      </div>
    </div>`;
  },
};

function updateFilter(el) { ui.candidates = { ...ui.candidates, [el.name]: el.value }; }

export const inputs = { 'cand-filter'(el) { updateFilter(el); clearTimeout(debounce); debounce = setTimeout(() => setUi({}), 160); } };
export const changes = { 'cand-filter'(el) { updateFilter(el); setUi({}); } };

export const actions = {
  'cand-reset'() { setUi({ candidates: { field: '', q: '', evidence: 'any', availability: 'any', location: 'any', history: 'any', rating: 'any', type: 'any' } }, { preserve: false }); },
  'cand-save'(el) {
    const res = toggleSave(me().id, el.dataset.user);
    toast(res.saved ? 'Saved to your candidates.' : 'Removed from saved candidates.', 'info');
  },
  'cand-connect'(el) {
    clearErrors('connect');
    const u = userById(el.dataset.user);
    openDialog({ title: `Connect with ${publicName(u)}`, body: connectBody(u) });
  },
};

export const forms = {
  'enable-recruiting'(form, data) {
    const res = enableRecruiting(me().id, data.get('consent') === 'on');
    if (!res.ok) {
      if (res.message) return toast(res.message, 'danger');
      return setErrors('enable-recruiting', res.errors);
    }
    clearErrors('enable-recruiting');
    toast('Candidate search is on.');
  },
  connect(form, data) {
    const u = userById(form.dataset.user);
    const message = data.get('message') || '';
    const res = sendConnection(me().id, u.id, message);
    if (!res.ok) {
      if (res.message) { closeDialogs(); return toast(res.message, 'danger'); }
      setErrors('connect', res.errors);
      const d = form.closest('dialog');
      d.querySelector('.dialog__body').innerHTML = String(connectBody(u, { message }));
      d.querySelector('#error-summary')?.focus();
      return;
    }
    clearErrors('connect');
    closeDialogs();
    toast(`Request sent. ${firstName(u)} will see it in their recruiting inbox.`);
  },
};

