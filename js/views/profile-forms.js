// Tasker profile form sections, shared by onboarding and the profile editor.
import { html, raw } from '../ui/html.js';
import { toast, confirmDialog } from '../ui/dialog.js';
import { addProof, requestProofReview, removeProof, setProofVisibility } from '../services/accounts.js';
import { me } from '../select.js';
import { setErrors, clearErrors, errorsFor } from '../ui/state.js';
import { icon } from '../ui/icons.js';
import { input, textarea, select, areaSelect, choices, checkbox, availabilityGrid, proofBadge, badge, notice } from '../ui/components.js';
import { CATEGORIES, POLICY } from '../data/categories.js';
import { LANGUAGES, FIELDS, EMPLOYMENT_TYPES, PROOF_TYPES, proofType } from '../data/fields.js';
import { WEEKDAYS } from '../util.js';
import { policyOf, proofsOf } from '../select.js';
import { ui, setUi } from '../ui/state.js';
import { PROOF_STATUS } from '../logic/status.js';

export function aboutFields(user, profile, e, prefix) {
  return html`
    ${areaSelect({ id: `${prefix}-area`, value: user.locationArea, error: e.area, hint: 'Clients and businesses only ever see this area, never your address.' })}
    ${choices({ id: `${prefix}-languages`, name: 'languages', legend: 'Languages you can work in', options: LANGUAGES.map((l) => ({ value: l, label: l })), values: user.languages, error: e.languages, required: true })}
    ${input({ id: `${prefix}-headline`, name: 'headline', label: 'Headline', value: profile.headline, error: e.headline, required: true, maxlength: 100, hint: 'One line about the help you offer, for example “Careful, strong help with moves and events”.' })}
    ${textarea({ id: `${prefix}-bio`, name: 'bio', label: 'Short bio', value: profile.bio, error: e.bio, optional: true, rows: 4, maxlength: 800, hint: 'What you are good at and how you work. You do not need to mention qualifications or explain gaps.' })}`;
}

export function parseAbout(data) {
  return { area: data.get('area'), languages: data.getAll('languages'), headline: data.get('headline') || '', bio: data.get('bio') || '' };
}

export function workFields(profile, e, prefix) {
  const selected = ui.onboarding.cats ?? profile.categories;
  const suggestions = [...new Set([...CATEGORIES.filter((c) => selected.includes(c.id)).flatMap((c) => c.skills), ...profile.skills])];
  const catOptions = CATEGORIES.map((c) => {
    const pol = policyOf(c.id);
    return { value: c.id, label: `${c.emoji} ${c.label}`, disabled: pol === 'soon', badge: pol === 'open' ? '' : badge(POLICY[pol].label, POLICY[pol].tone), hint: pol === 'open' ? '' : c.note };
  });
  return html`
    ${choices({ id: `${prefix}-categories`, name: 'categories', legend: 'What kind of tasks would you like to do?', options: catOptions, values: selected, error: e.categories, required: true, hint: 'Categories marked “Manual review” need a moderator check before you can be booked for them.', extra: { 'data-change': 'work-cats' } })}
    ${suggestions.length ? choices({ id: `${prefix}-skills`, name: 'skills', legend: 'Skills', options: suggestions.map((s) => ({ value: s, label: s })), values: profile.skills, hint: 'Suggestions are based on the categories you picked.' }) : ''}
    ${input({ id: `${prefix}-otherSkills`, name: 'otherSkills', label: 'Other skills', optional: true, hint: 'Separate with commas, for example “Bike repair, Speaks sign language”.' })}
    ${textarea({ id: `${prefix}-experience`, name: 'experience', label: 'Experience', value: profile.experience, optional: true, rows: 3, hint: 'Paid, unpaid, family or volunteer experience all count.' })}
    <fieldset class="field fieldset" id="${prefix}-rateMin" tabindex="-1">
      <legend class="field__label">Usual hourly rate<span class="req" aria-hidden="true"> *</span></legend>
      <p class="field__hint">A guide for clients. You propose a price for each task.</p>
      <div class="row row--fields">
        ${input({ id: `${prefix}-rate-min`, name: 'rateMin', label: 'From (€/h)', type: 'number', value: profile.rateMin, min: 5, max: 250, step: 1, inputmode: 'numeric', cls: 'field--inline', extra: { 'aria-invalid': e.rateMin ? 'true' : null } })}
        ${input({ id: `${prefix}-rate-max`, name: 'rateMax', label: 'To (€/h)', type: 'number', value: profile.rateMax, min: 5, max: 250, step: 1, inputmode: 'numeric', cls: 'field--inline', extra: { 'aria-invalid': e.rateMin ? 'true' : null } })}
      </div>
      ${e.rateMin ? html`<p class="field__error">${icon('alert', 16)}<span>${e.rateMin}</span></p>` : ''}
    </fieldset>
    ${availabilityGrid({ id: `${prefix}-availability`, value: profile.availability, error: e.availability })}`;
}

export function parseWork(data) {
  const availability = Object.fromEntries(WEEKDAYS.map((d) => [d, data.getAll(`avail-${d}`)]));
  return {
    categories: data.getAll('categories'), skills: data.getAll('skills'), otherSkills: data.get('otherSkills') || '',
    experience: data.get('experience') || '', rateMin: data.get('rateMin'), rateMax: data.get('rateMax'), availability,
  };
}

export const BUSINESS_CAN_SEE = [
  'your first name and the first letter of your last name',
  'your headline, categories, skills and experience',
  'your location area (district, never your address)',
  'your usual availability',
  'completed tasks and reviews',
  'proof items you mark as visible to businesses',
  'the work preferences you set below',
];
export const BUSINESS_CANNOT_SEE = ['your email or phone number', 'your exact address', 'your messages with clients', 'proof items you keep private'];

export function consentText() {
  return html`<div class="consent">
    <p class="consent__title">${icon('eye', 18)} What businesses will see</p>
    <div class="consent__cols">
      <div><p class="small"><strong>Can see</strong></p><ul class="checklist checklist--sm">${BUSINESS_CAN_SEE.map((x) => html`<li>${icon('check', 14)}<span>${x}</span></li>`)}</ul></div>
      <div><p class="small"><strong>Cannot see</strong></p><ul class="checklist checklist--sm checklist--muted">${BUSINESS_CANNOT_SEE.map((x) => html`<li>${icon('x', 14)}<span>${x}</span></li>`)}</ul></div>
    </div>
    <p class="small muted">Only businesses that agreed to the recruiting rules can search. You can switch this off at any time in Settings. Being visible does not guarantee contact or a job offer.</p>
  </div>`;
}

export function opportunityFields(user, profile, e, prefix) {
  const g = profile.employmentGoal || {};
  return html`
    ${checkbox({ id: `${prefix}-seeking`, name: 'seeking', label: 'Make me visible to businesses for stable work', checked: g.seeking, hint: 'Optional. Your tasks and profile work the same either way.' })}
    ${consentText()}
    ${choices({ id: `${prefix}-fields`, name: 'fields', legend: 'Fields you are interested in', options: FIELDS.map((f) => ({ value: f.id, label: f.label })), values: g.fields || [], hint: 'Helps businesses in these fields find you. Leave empty to be open to any field.' })}
    ${choices({ id: `${prefix}-types`, name: 'types', legend: 'Kind of work you are open to', options: EMPLOYMENT_TYPES.map((t) => ({ value: t.id, label: t.label })), values: g.types || [], error: e.types })}
    ${textarea({ id: `${prefix}-note`, name: 'note', label: 'Note for businesses', value: g.note, optional: true, rows: 2, hint: 'For example the hours you prefer or when you could start.' })}
    ${checkbox({ id: `${prefix}-consent`, name: 'consent', label: 'I understand what businesses will be able to see, and that I can switch this off at any time.', checked: g.seeking, error: e.consent })}`;
}

export function parseOpportunity(data) {
  return { seeking: data.get('seeking') === 'on', consent: data.get('consent') === 'on', fields: data.getAll('fields'), types: data.getAll('types'), note: data.get('note') || '' };
}

const VIS = [
  { value: 'public', label: 'Everyone' },
  { value: 'businesses', label: 'Businesses only' },
  { value: 'private', label: 'Only me' },
];

export function proofManager(user, e = {}) {
  const proofs = proofsOf(user.id);
  return html`<section class="proof-manager" aria-labelledby="proof-h">
    <h3 id="proof-h">Proof of skills and experience</h3>
    <p class="muted small">Optional. Certificates, references, licences or photos of past work. New items are labelled “self-reported” until a moderator checks them.</p>
    ${notice({ tone: 'demo', body: 'Demo: files are not uploaded. Only the file name is kept.' })}
    ${proofs.length ? html`<ul class="proof-list">${proofs.map((p) => html`<li class="proof proof--edit">
      <div class="proof__main">${icon('file')}<span><span class="proof__label">${p.label}</span><span class="small muted"> · ${proofType(p.type)}${p.fileName ? ` · ${p.fileName}` : ''}</span></span></div>
      <div class="proof__meta">
        ${proofBadge(p.status)}<span class="small muted">${PROOF_STATUS[p.status].hint}</span>
      </div>
      <div class="proof__actions row row--tight">
        ${select({ id: `proof-vis-${p.id}`, name: 'visibility', label: 'Who can see this', options: VIS, value: p.visibility, extra: { 'data-change': 'proof-visibility', 'data-id': p.id, 'data-no-preserve': true }, cls: 'field--inline field--compact' })}
        ${p.status === 'self_reported' ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="proof-review" data-id="${p.id}">Request review</button>` : ''}
        <button type="button" class="btn btn--ghost btn--sm" data-action="proof-remove" data-id="${p.id}">${icon('trash', 16)}Remove</button>
      </div>
    </li>`)}</ul>` : html`<p class="muted">No proof added yet. That is fine — reviews and your profile count too.</p>`}
    <details class="disclosure" ${Object.keys(e).length ? raw('open') : ''}>
      <summary>${icon('plus', 16)} Add a proof item</summary>
      <form class="disclosure__body" data-form="add-proof" novalidate>
        ${input({ id: 'proof-label', name: 'label', label: 'What is it?', error: e.label, required: true, placeholder: 'First-aid course, Red Cross, 2025' })}
        ${select({ id: 'proof-type', name: 'type', label: 'Type', options: PROOF_TYPES.map((t) => ({ value: t.id, label: t.label })), placeholder: 'Choose a type', error: e.type, required: true })}
        <div class="field"><label class="field__label" for="proof-file">File <span class="field__optional">(optional)</span></label><p class="field__hint" id="proof-file-hint">PDF or image. In this demo the file stays on your device.</p><input class="input input--file" type="file" id="proof-file" name="file" accept=".pdf,.jpg,.jpeg,.png" aria-describedby="proof-file-hint"></div>
        ${select({ id: 'proof-visibility', name: 'visibility', label: 'Who can see this', options: VIS, value: 'public' })}
        ${checkbox({ id: 'proof-request', name: 'requestReview', label: 'Ask a moderator to review it', hint: 'Reviewed proof is labelled “pending review” until a moderator has looked at it.' })}
        <button class="btn btn--secondary" type="submit">${icon('upload', 16)}Add proof</button>
      </form>
    </details>
  </section>`;
}

export const changes = {
  'work-cats'(el) {
    const form = el.closest('form');
    const cats = [...form.querySelectorAll('input[name=categories]:checked')].map((x) => x.value);
    setUi({ onboarding: { ...ui.onboarding, cats } });
  },
};

export const actions = {
  'proof-review'(el) {
    requestProofReview(me().id, el.dataset.id);
    toast('Sent for review. It shows as “pending review” until a moderator has looked at it.');
  },
  async 'proof-remove'(el) {
    const yes = await confirmDialog({ title: 'Remove this proof item?', body: html`<p>It will no longer appear on your profile.</p>`, confirmLabel: 'Remove', tone: 'danger' });
    if (yes) { removeProof(me().id, el.dataset.id); toast('Proof removed.'); }
  },
};

Object.assign(changes, {
  'proof-visibility'(el) {
    setProofVisibility(me().id, el.dataset.id, el.value);
    toast('Visibility updated.');
  },
});

export const forms = {
  'add-proof'(form, data) {
    const file = data.get('file');
    const res = addProof(me().id, { label: data.get('label') || '', type: data.get('type') || '', visibility: data.get('visibility'), requestReview: data.get('requestReview') === 'on', fileName: file && file.name ? file.name : null });
    if (!res.ok) return setErrors('proof', res.errors);
    clearErrors('proof');
    form.reset();
    toast('Proof added.');
  },
};
