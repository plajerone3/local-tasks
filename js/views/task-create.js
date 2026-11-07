// Create a task: form → preview (exactly what taskers see) → publish.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, input, textarea, select, areaSelect, errorSummary, notice, catLabel, badge } from '../ui/components.js';
import { ui, setUi, errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { me, policyOf } from '../select.js';
import { CATEGORIES, category, POLICY } from '../data/categories.js';
import { areaKey, parseAreaKey, areaLabel } from '../data/geo.js';
import { fmt, t } from '../i18n.js';
import { APP } from '../config.js';
import { impliedHourly, breakdown, pct } from '../logic/money.js';
import { todayIso, isoDate } from '../util.js';
import { draftFromForm, checkTask, publishTask } from '../services/marketplace.js';
import { hasErrors } from '../logic/validation.js';
import { go } from '../router.js';
import { toast } from '../ui/dialog.js';

function blankDraft(user) {
  const d = new Date(Date.now() + 3 * 864e5);
  return { title: '', category: '', description: '', date: isoDate(d), start: '10:00', end: '13:00', area: areaKey(user.locationArea), budgetMin: '', budgetMax: '', estimatedHours: '', requirements: '', safetyNotes: '', exactAddress: '', recurring: '' };
}

function categoryOptions() {
  return CATEGORIES.map((c) => {
    const pol = policyOf(c.id);
    return { value: c.id, label: `${c.emoji} ${c.label}${pol === 'review' ? ' — manual review' : pol === 'soon' ? ' — coming soon' : ''}`, disabled: pol === 'soon', group: pol === 'open' ? 'Available now' : pol === 'review' ? 'Checked by a moderator first' : 'Coming soon' };
  });
}

function editStep(d, e) {
  const pol = d.category ? policyOf(d.category) : null;
  const hourly = d.budgetMax && d.estimatedHours ? impliedHourly(d.budgetMax, d.estimatedHours) : null;
  return html`<form class="card form-card" data-form="task-preview" novalidate>
    ${errorSummary(e, 'task')}
    <div class="row row--between"><h2 class="card__title">Task details</h2>
      ${select({ id: 'task-example', name: 'example', label: 'Start from an example', options: CATEGORIES.filter((c) => c.example && policyOf(c.id) === 'open').map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` })), placeholder: 'Choose…', extra: { 'data-change': 'task-example', 'data-no-preserve': true }, cls: 'field--inline field--compact' })}
    </div>
    ${input({ id: 'task-title', name: 'title', label: 'Title', value: d.title, error: e.title, required: true, maxlength: 90, hint: 'Short and specific, for example “Carry a sofa to the 3rd floor (no lift)”.' })}
    ${select({ id: 'task-category', name: 'category', label: 'Category', options: categoryOptions(), value: d.category, placeholder: 'Choose a category', error: e.category, required: true, extra: { 'data-change': 'task-category' } })}
    ${pol === 'review' ? notice({ tone: 'warn', title: 'This category is checked first', body: `${category(d.category).note || ''} Your task goes live once a moderator approves it, usually within a day.` }) : ''}
    ${textarea({ id: 'task-description', name: 'description', label: 'Description', value: d.description, error: e.description, required: true, rows: 5, hint: 'What needs doing, how big it is, and anything the tasker should bring or know.' })}
    <fieldset class="fieldset field"><legend class="field__label">When</legend>
      <div class="row row--fields">
        ${input({ id: 'task-date', name: 'date', label: 'Date', type: 'date', value: d.date, min: todayIso(), error: e.date, required: true, cls: 'field--inline' })}
        ${input({ id: 'task-start', name: 'start', label: 'From', type: 'time', value: d.start, error: e.start, required: true, cls: 'field--inline' })}
        ${input({ id: 'task-end', name: 'end', label: 'To', type: 'time', value: d.end, required: true, cls: 'field--inline', extra: { 'aria-invalid': e.start ? 'true' : null } })}
      </div>
      ${input({ id: 'task-recurring', name: 'recurring', label: 'Repeats', value: d.recurring, optional: true, placeholder: 'For example “Every Tuesday”' })}
    </fieldset>
    ${areaSelect({ id: 'task-area', value: d.area, error: e.area, label: 'Area', hint: 'Taskers see only this area until you accept someone.' })}
    ${input({ id: 'task-exactAddress', name: 'exactAddress', label: 'Exact address (private)', value: d.exactAddress, optional: true, error: e.exactAddress, autocomplete: 'street-address', hint: 'Only you can see it. You choose when to share it with the tasker you accept.' })}
    <fieldset class="fieldset field" id="task-budgetMin" tabindex="-1"><legend class="field__label">Budget for the whole task<span class="req" aria-hidden="true"> *</span></legend>
      <div class="row row--fields">
        ${input({ id: 'task-budget-min', name: 'budgetMin', label: 'From (€)', type: 'number', value: d.budgetMin, min: 10, step: 5, inputmode: 'decimal', cls: 'field--inline', extra: { 'data-input': 'task-budget', 'aria-invalid': e.budgetMin ? 'true' : null, 'aria-describedby': e.budgetMin ? 'task-budget-error' : null } })}
        ${input({ id: 'task-budget-max', name: 'budgetMax', label: 'To (€)', type: 'number', value: d.budgetMax, min: 10, step: 5, inputmode: 'decimal', cls: 'field--inline', extra: { 'data-input': 'task-budget', 'aria-invalid': e.budgetMin ? 'true' : null, 'aria-describedby': e.budgetMin ? 'task-budget-error' : null } })}
        ${input({ id: 'task-estimatedHours', name: 'estimatedHours', label: 'About how many hours?', type: 'number', value: d.estimatedHours, min: 0.5, max: 24, step: 0.5, inputmode: 'decimal', error: e.estimatedHours, cls: 'field--inline', extra: { 'data-input': 'task-budget' } })}
      </div>
      ${e.budgetMin ? html`<p class="field__error" id="task-budget-error">${icon('alert', 16)}<span>${e.budgetMin}</span></p>` : ''}
      <p class="small muted" id="task-hourly" aria-live="polite">${hourlyHint(hourly)}</p>
    </fieldset>
    ${textarea({ id: 'task-requirements', name: 'requirements', label: 'Requirements', value: d.requirements, optional: true, rows: 3, hint: 'One per line, for example “Own car” or “Comfortable with large dogs”.' })}
    ${textarea({ id: 'task-safetyNotes', name: 'safetyNotes', label: 'Safety notes', value: d.safetyNotes, optional: true, rows: 2, hint: 'Stairs, pets, access, anything that helps the tasker work safely.' })}
    <div class="form-actions"><a class="btn btn--ghost" href="#/dashboard">Cancel</a><button class="btn btn--primary" type="submit">Preview task ${icon('chevron', 16)}</button></div>
  </form>`;
}

function hourlyHint(hourly) {
  if (!hourly) return 'Add the estimated hours to see what your budget works out to per hour.';
  if (hourly < APP.minFairHourly) return `That is about ${fmt.money0(Math.round(hourly))} per hour at most. Budgets under about ${fmt.money0(APP.minFairHourly)} per hour tend to get fewer applications.`;
  return `That is up to about ${fmt.money0(Math.round(hourly))} per hour.`;
}

function previewStep(d) {
  const area = parseAreaKey(d.area);
  const pol = policyOf(d.category);
  const lines = String(d.requirements || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const mid = Math.round((Number(d.budgetMin) + Number(d.budgetMax)) / 2);
  const b = breakdown(mid);
  return html`<div class="stack">
    ${notice({ tone: 'info', title: 'This is what taskers will see', body: 'Check the details, then publish. You can still cancel the task later.' })}
    <article class="card preview">
      <div class="row row--tight">${catLabel(d.category)}${pol === 'review' ? badge(POLICY.review.label, 'warn') : badge('Open', 'success')}</div>
      <h2 class="preview__title">${d.title}</h2>
      <dl class="facts">
        <div class="fact">${icon('calendar')}<dt>Date</dt><dd>${fmt.dateLong(d.date)}${d.recurring ? html`<span class="small muted">${d.recurring}</span>` : ''}</dd></div>
        <div class="fact">${icon('clock')}<dt>Time</dt><dd>${d.start}–${d.end}</dd></div>
        <div class="fact">${icon('pin')}<dt>Area</dt><dd>${areaLabel(area)}<span class="small muted">exact address hidden</span></dd></div>
        <div class="fact">${icon('euro')}<dt>Budget</dt><dd>${fmt.range(Number(d.budgetMin), Number(d.budgetMax))}</dd></div>
      </dl>
      <p class="prewrap">${d.description}</p>
      ${lines.length ? html`<h3>Requirements</h3><ul class="checklist">${lines.map((r) => html`<li>${icon('check', 16)}<span>${r}</span></li>`)}</ul>` : ''}
      ${d.safetyNotes ? html`<h3>Safety notes</h3><p>${d.safetyNotes}</p>` : ''}
    </article>
    <section class="card card--soft">
      <h2 class="card__title">Costs, explained before you accept anyone</h2>
      <p class="small">If you accept someone at ${fmt.money(b.price)}, you pay ${fmt.money(b.clientTotal)} including a ${pct(APP.fees.clientServiceRate)} service fee (${fmt.money(b.clientFee)}). The tasker receives ${fmt.money(b.taskerNet)}. No other fees.</p>
      <p class="small muted">${t('demo.wallet')}</p>
    </section>
    <form data-form="task-publish" class="form-actions">
      <button type="button" class="btn btn--secondary" data-action="task-edit">${icon('back', 16)}Edit</button>
      <button class="btn btn--primary btn--lg" type="submit">${pol === 'review' ? 'Send for review' : 'Publish task'}</button>
    </form>
  </div>`;
}

export default {
  title: () => 'Post a task',
  render(ctx) {
    if (!ui.taskDraft) ui.taskDraft = blankDraft(ctx.user);
    const step = ui.taskStep;
    const e = errorsFor('task');
    return html`<div class="wrap page page--narrow">
      ${pageHead({ eyebrow: step === 'preview' ? 'Step 2 of 2 · Preview' : 'Step 1 of 2 · Details', title: step === 'preview' ? 'Check your task' : 'Post a task', lead: step === 'preview' ? '' : 'Clear tasks get better applications. You will see a preview before anything is published.' })}
      ${step === 'preview' ? previewStep(ui.taskDraft) : editStep(ui.taskDraft, e)}
    </div>`;
  },
};

function readDraft() {
  const form = document.querySelector('form[data-form="task-preview"]');
  return form ? draftFromForm(Object.fromEntries(new FormData(form))) : ui.taskDraft;
}

export const forms = {
  'task-preview'(form, data) {
    const d = draftFromForm(Object.fromEntries(data));
    ui.taskDraft = d;
    const errors = checkTask(d);
    if (hasErrors(errors)) return setErrors('task', errors);
    clearErrors('task');
    setUi({ taskStep: 'preview' }, { preserve: false });
    window.scrollTo(0, 0);
  },
  'task-publish'() {
    const res = publishTask(me().id, ui.taskDraft);
    if (!res.ok) {
      setUi({ taskStep: 'edit' }, { preserve: false });
      return setErrors('task', res.errors);
    }
    setUi({ taskDraft: null, taskStep: 'edit' }, { preserve: false });
    toast(res.status === 'under_review' ? 'Sent for review. We will notify you when it is live.' : 'Your task is live. Taskers nearby can now apply.');
    go(`/tasks/${res.id}`);
  },
};

export const actions = {
  'task-edit'() { setUi({ taskStep: 'edit' }, { preserve: false }); },
};

export const changes = {
  'task-example'(el) {
    const c = category(el.value);
    if (!c.example) return;
    const cur = readDraft();
    const x = c.example;
    clearErrors('task');
    ui.taskDraft = { ...cur, category: c.id, title: x.title, description: x.description, requirements: x.requirements, safetyNotes: x.safetyNotes, budgetMin: String(x.budgetMin), budgetMax: String(x.budgetMax), estimatedHours: String(x.hours) };
    setUi({}, { preserve: false });
    document.getElementById('task-title')?.focus();
  },
  'task-category'() {
    ui.taskDraft = readDraft();
    setUi({});
  },
};

export const inputs = {
  'task-budget'() {
    const max = Number(document.getElementById('task-budget-max')?.value);
    const hours = Number(String(document.getElementById('task-estimatedHours')?.value).replace(',', '.'));
    const out = document.getElementById('task-hourly');
    if (out) out.textContent = hourlyHint(max && hours ? impliedHourly(max, hours) : null);
  },
};
