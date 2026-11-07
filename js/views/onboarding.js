// Role onboarding. Tasker: three short steps, each saved as you go. Client and business: one step.
import { html, raw } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, errorSummary, input, textarea, select, areaSelect, choices, checkbox, notice } from '../ui/components.js';
import { ui, setUi, errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { taskerProfileOf, businessOf, me } from '../select.js';
import { CATEGORIES } from '../data/categories.js';
import { FIELDS, EMPLOYMENT_TYPES, COMPANY_SIZES } from '../data/fields.js';
import { saveTaskerAbout, saveTaskerWork, saveOpportunity, finishOnboarding, saveClient, saveBusiness, addRole, switchRole } from '../services/accounts.js';
import { aboutFields, parseAbout, workFields, parseWork, opportunityFields, parseOpportunity, proofManager } from './profile-forms.js';
import { go } from '../router.js';
import { toast } from '../ui/dialog.js';

const TASKER_STEPS = ['About you', 'Your work', 'Proof and opportunities'];

function stepper(steps, current) {
  return html`<ol class="stepper" aria-label="Setup progress">${steps.map((s, i) => html`<li class="stepper__step${i < current ? ' is-done' : ''}${i === current ? ' is-current' : ''}" ${i === current ? raw('aria-current="step"') : ''}><span class="stepper__n" aria-hidden="true">${i < current ? icon('check', 14) : i + 1}</span><span class="stepper__label">${s}<span class="visually-hidden">${i < current ? ' (done)' : ''}</span></span></li>`)}</ol>`;
}

const RECRUITING_RULES = html`<ul class="checklist checklist--sm">
  <li>${icon('check', 14)}<span>Contact candidates only through the platform.</span></li>
  <li>${icon('check', 14)}<span>Respect candidates’ visibility settings and their replies.</span></li>
  <li>${icon('check', 14)}<span>Do not copy candidate data into other systems without their consent.</span></li>
  <li>${icon('check', 14)}<span>Never ask about age, family plans, religion, origin or health.</span></li>
</ul>`;

export function businessFields(b, e, prefix) {
  return html`
    ${input({ id: `${prefix}-companyName`, name: 'companyName', label: 'Organisation name', value: b.companyName, error: e.companyName, required: true })}
    ${select({ id: `${prefix}-field`, name: 'field', label: 'Field', options: FIELDS.map((f) => ({ value: f.id, label: f.label })), value: b.field, placeholder: 'Choose a field', error: e.field, required: true, hint: 'Candidate matching looks at evidence that is relevant to this field.' })}
    ${select({ id: `${prefix}-size`, name: 'size', label: 'Size (people)', options: COMPANY_SIZES.map((x) => ({ value: x, label: x })), value: b.size, placeholder: 'Choose a size', error: e.size, required: true })}
    ${areaSelect({ id: `${prefix}-area`, value: b.locationArea, error: e.area, label: 'Where you are based' })}
    ${textarea({ id: `${prefix}-description`, name: 'description', label: 'About the organisation', value: b.description, error: e.description, required: true, rows: 3 })}
    ${input({ id: `${prefix}-website`, name: 'website', label: 'Website', value: b.website, optional: true, placeholder: 'example.com' })}
    <fieldset class="fieldset field"><legend class="field__label">Hiring intent</legend>
      ${input({ id: `${prefix}-roles`, name: 'roles', label: 'Roles you are hiring for', value: b.hiringIntent?.roles, optional: true, placeholder: 'Gardeners, seasonal helpers' })}
      ${choices({ id: `${prefix}-types`, name: 'types', legend: 'Kind of work', options: EMPLOYMENT_TYPES.map((x) => ({ value: x.id, label: x.label })), values: b.hiringIntent?.types || [] })}
      ${input({ id: `${prefix}-openings`, name: 'openings', label: 'Open positions', type: 'number', value: b.hiringIntent?.openings || 1, min: 1, max: 99, inputmode: 'numeric' })}
    </fieldset>
    <div class="consent">
      <p class="consent__title">${icon('shield', 18)} Recruiting rules</p>
      ${RECRUITING_RULES}
      <p class="small muted">You will only see taskers who switched on “visible for stable work”. Connection requests do not guarantee a reply.</p>
    </div>
    ${checkbox({ id: `${prefix}-recruitingEnabled`, name: 'recruitingEnabled', label: 'Turn on candidate search for my organisation', checked: b.recruitingEnabled })}
    ${checkbox({ id: `${prefix}-consent`, name: 'consent', label: 'We agree to the recruiting rules above.', checked: !!b.recruitingConsentAt, error: e.consent })}`;
}

export function parseBusiness(data) {
  return {
    companyName: data.get('companyName') || '', field: data.get('field') || '', size: data.get('size') || '', area: data.get('area') || '',
    description: data.get('description') || '', website: data.get('website') || '', roles: data.get('roles') || '', types: data.getAll('types'),
    openings: data.get('openings'), recruitingEnabled: data.get('recruitingEnabled') === 'on', consent: data.get('consent') === 'on',
  };
}

function taskerStep(user, profile, step) {
  const e = errorsFor(`onb-${step}`);
  if (step === 0) {
    return html`<form class="card" data-form="onb-tasker-0" novalidate>
      ${errorSummary(e, 'onb')}
      <h2 class="card__title">About you</h2>
      ${aboutFields(user, profile, e, 'onb')}
      <div class="form-actions"><button class="btn btn--primary" type="submit">Save and continue</button></div>
    </form>`;
  }
  if (step === 1) {
    return html`<form class="card" data-form="onb-tasker-1" novalidate>
      ${errorSummary(e, 'onb')}
      <h2 class="card__title">Your work</h2>
      ${workFields(profile, e, 'onb')}
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-action="onb-back">Back</button><button class="btn btn--primary" type="submit">Save and continue</button></div>
    </form>`;
  }
  return html`<div class="stack">
    <div class="card">${proofManager(user, errorsFor('proof'))}</div>
    <form class="card" data-form="onb-tasker-2" novalidate>
      ${errorSummary(e, 'onb')}
      <h2 class="card__title">Opportunities beyond tasks</h2>
      <p class="muted">${raw('Businesses can discover taskers who have chosen to be visible for stable work. This is completely optional.')}</p>
      ${opportunityFields(user, profile, e, 'onb')}
      <div class="form-actions"><button type="button" class="btn btn--ghost" data-action="onb-back">Back</button><button class="btn btn--primary" type="submit">Finish setup</button></div>
    </form>
  </div>`;
}

export default {
  title: (ctx) => `Set up your ${ctx.params.role} profile`,
  render(ctx) {
    const { user } = ctx;
    const role = ctx.params.role;
    if (role === 'tasker') {
      if (!user.roles.includes('tasker')) {
        return html`<div class="wrap page page--narrow">${pageHead({ title: 'Earn as a tasker', lead: 'Add the tasker role to this account. You keep everything you have as a client.' })}<button class="btn btn--primary" data-action="add-role" data-role="tasker">Add the tasker role</button></div>`;
      }
      const profile = taskerProfileOf(user.id);
      const step = ui.onboarding.step ?? 0;
      return html`<div class="wrap page page--narrow">
        ${pageHead({ eyebrow: 'Tasker setup', title: 'Show what you can do', lead: 'Three short steps. Everything is saved as you go, and you can change it later. You can browse and apply at any point; a fuller profile just helps people trust you.' })}
        ${stepper(TASKER_STEPS, step)}
        ${taskerStep(user, profile, step)}
        <p class="center"><button type="button" class="link-btn" data-action="onb-skip" data-role="tasker">Skip for now and go to the dashboard</button></p>
      </div>`;
    }
    if (role === 'client') {
      const e = errorsFor('onb-client');
      return html`<div class="wrap page page--narrow">
        ${pageHead({ eyebrow: 'Client setup', title: 'Where do you need help?', lead: 'We use your area to show nearby taskers. Your exact address is only shared with the tasker you accept, and only when you choose to.' })}
        <form class="card" data-form="onb-client" novalidate>
          ${errorSummary(e, 'onbc')}
          ${areaSelect({ id: 'onbc-area', value: user.locationArea, error: e.area })}
          ${choices({ id: 'onbc-needs', name: 'needs', legend: 'What might you need help with?', options: CATEGORIES.filter((c) => c.policy === 'open').map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` })), values: user.clientNeeds, hint: 'Optional. Helps us suggest relevant taskers.' })}
          <div class="form-actions">
            <button class="btn btn--secondary" type="submit" name="next" value="dashboard">Go to my dashboard</button>
            <button class="btn btn--primary" type="submit" name="next" value="post">${icon('plus')}Post my first task</button>
          </div>
        </form>
      </div>`;
    }
    if (role === 'business') {
      const b = businessOf(user.id);
      if (!b) return html`<div class="wrap page">${notice({ tone: 'warn', body: 'This account is not a business account. Create a separate account for your organisation.' })}</div>`;
      const e = errorsFor('onb-business');
      return html`<div class="wrap page page--narrow">
        ${pageHead({ eyebrow: 'Business setup', title: 'Tell taskers who you are', lead: 'Your profile is shown with every connection request, so candidates can decide whether to talk.' })}
        <form class="card" data-form="onb-business" novalidate>
          ${errorSummary(e, 'onbb')}
          ${businessFields(b, e, 'onbb')}
          <div class="form-actions"><button class="btn btn--primary" type="submit">Save and continue</button></div>
          <p class="small muted">Organisation details are marked “pending review” until a moderator checks them. The demo does not verify company registers.</p>
        </form>
      </div>`;
    }
    return html`<div class="wrap page">${notice({ tone: 'warn', body: 'Unknown setup step.' })}</div>`;
  },
};

const nextStep = (n) => setUi({ onboarding: { ...ui.onboarding, step: n } }, { preserve: false });

export const forms = {
  'onb-tasker-0'(form, data) {
    const res = saveTaskerAbout(me().id, parseAbout(data));
    if (!res.ok) return setErrors('onb-0', res.errors);
    clearErrors('onb-0');
    nextStep(1);
    window.scrollTo(0, 0);
  },
  'onb-tasker-1'(form, data) {
    const res = saveTaskerWork(me().id, parseWork(data));
    if (!res.ok) return setErrors('onb-1', res.errors);
    clearErrors('onb-1');
    nextStep(2);
    window.scrollTo(0, 0);
  },
  'onb-tasker-2'(form, data) {
    const res = saveOpportunity(me().id, parseOpportunity(data));
    if (!res.ok) return setErrors('onb-2', res.errors);
    clearErrors('onb-2');
    finishOnboarding(me().id, 'tasker');
    switchRole('tasker');
    setUi({ onboarding: {} }, { preserve: false });
    toast('Your tasker profile is ready. Here are tasks that fit you.');
    go('/dashboard');
  },
  'onb-client'(form, data, ctx, submitter) {
    const res = saveClient(me().id, { area: data.get('area'), needs: data.getAll('needs') });
    if (!res.ok) return setErrors('onb-client', res.errors);
    clearErrors('onb-client');
    toast('Saved.');
    go(submitter?.value === 'post' ? '/tasks/new' : '/dashboard');
  },
  'onb-business'(form, data) {
    const res = saveBusiness(me().id, parseBusiness(data));
    if (!res.ok) return setErrors('onb-business', res.errors);
    clearErrors('onb-business');
    toast('Company profile saved.');
    go(businessOf(me().id).recruitingEnabled ? '/candidates' : '/dashboard');
  },
};

export const actions = {
  'onb-back'() { nextStep(Math.max(0, (ui.onboarding.step ?? 0) - 1)); },
  'onb-skip'(el) {
    finishOnboarding(me().id, el.dataset.role);
    setUi({ onboarding: {} }, { preserve: false });
    go('/dashboard');
  },
  'add-role'(el) {
    const role = el.dataset.role;
    const res = addRole(me().id, role);
    if (!res.ok) return toast(res.message, 'danger');
    toast(role === 'tasker' ? 'Tasker role added. Let’s set up your profile.' : 'Client role added.');
    setUi({ onboarding: {} }, { preserve: false });
    go(`/onboarding/${role}`);
  },
};
