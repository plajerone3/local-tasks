// Post a task in five short steps, ending on a confirm screen.
import { html, attrs } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { ui, setUi, errorsFor, setErrors, clearErrors } from '../../ui/state.js';
import { input, textarea, areaSelect, errorSummary } from '../../ui/components.js';
import { me, policyOf, taskById } from '../../select.js';
import { CATEGORIES, category, catLabel, catWord, catNote, catExample } from '../../data/categories.js';
import { areaKey, parseAreaKey, areaLabel } from '../../data/geo.js';
import { fmt, tr } from '../../i18n.js';
import { APP } from '../../config.js';
import { breakdown, impliedHourly, pct } from '../../logic/money.js';
import { todayIso, isoDate, weekdayKey } from '../../util.js';
import { draftFromForm, checkTask, publishTask } from '../../services/marketplace.js';
import { go } from '../../router.js';
import { toast } from '../../ui/dialog.js';
import { screen, catBadge, catColor, PALETTE } from '../ui.js';

const STEPS = [
  { title: 'What do you need done?', fields: ['category', 'title'] },
  { title: 'Tell taskers the details', fields: ['description'] },
  { title: 'Where and when?', fields: ['area', 'date', 'start', 'exactAddress'] },
  { title: 'Set a fair budget', fields: ['budgetMin', 'estimatedHours'] },
  { title: 'Check and post', fields: [] },
];
const WINDOWS = [['Morning', '08:00', '12:00'], ['Afternoon', '13:00', '17:00'], ['Evening', '17:00', '21:00']];

const inDays = (n) => isoDate(new Date(Date.now() + n * 864e5));
function nextSaturday() {
  for (let n = 0; n < 8; n++) if (weekdayKey(inDays(n)) === 'sat') return inDays(n);
  return inDays(1);
}

function freshDraft(user, query) {
  const base = { title: '', category: '', description: '', requirements: '', safetyNotes: '', recurring: '', area: areaKey(user.locationArea), exactAddress: '', date: inDays(2), start: '13:00', end: '17:00', budgetMin: '40', budgetMax: '60', estimatedHours: '2' };
  const again = query.again && taskById(query.again);
  if (again && again.clientId === user.id) {
    return { ...base, title: again.title, category: again.category, description: again.description, requirements: again.requirements.join('\n'), safetyNotes: again.safetyNotes, area: areaKey(again.locationArea), exactAddress: again.exactAddress || '', start: again.timeWindow.start, end: again.timeWindow.end, budgetMin: String(again.budgetMin), budgetMax: String(again.budgetMax), estimatedHours: String(again.estimatedHours || 2) };
  }
  if (query.cat && catExample(query.cat)) {
    const x = catExample(query.cat);
    return { ...base, category: query.cat, budgetMin: String(x.budgetMin), budgetMax: String(x.budgetMax), estimatedHours: String(x.hours) };
  }
  return { ...base, category: query.cat || '' };
}

function state(ctx) {
  const key = JSON.stringify(ctx.query);
  if (!ui.mPost || ui.mPost.key !== key) ui.mPost = { key, step: ctx.query.again ? 4 : 0, draft: freshDraft(ctx.user, ctx.query) };
  return ui.mPost;
}

function progress(step) {
  return html`<ol class="m-progress" aria-label="${tr('Step {n} of {total}', { n: step + 1, total: STEPS.length })}">${STEPS.map((s, i) => html`<li class="m-progress__seg c-${PALETTE[i]}${i <= step ? ' is-done' : ''}"><span class="visually-hidden">${tr(s.title)}${i < step ? ` (${tr('done')})` : i === step ? ` (${tr('current')})` : ''}</span></li>`)}</ol>`;
}

function stepWhat(d, e) {
  return html`
    <fieldset class="m-fieldset" id="mp-category" tabindex="-1">
      <legend class="m-label">${tr('Category')}</legend>
      <div class="m-catgrid">${CATEGORIES.map((c) => {
        const pol = policyOf(c.id);
        return html`<label class="m-catpick c-${pol === 'open' ? catColor(c.id) : 'stone'}${pol === 'soon' ? ' is-disabled' : ''}">
          <input ${attrs({ type: 'radio', name: 'category', value: c.id, checked: d.category === c.id, disabled: pol === 'soon', 'data-change': 'm-post-cat' })}>
          <span class="m-catpick__emoji" aria-hidden="true">${c.emoji}</span>
          <span class="m-catpick__label">${tr(c.label)}</span>
          ${pol !== 'open' ? html`<span class="m-catpick__tag">${tr(pol === 'review' ? 'Checked first' : 'Soon')}</span>` : ''}
        </label>`;
      })}</div>
      ${e.category ? html`<p class="field__error">${icon('alert', 16)}<span>${e.category}</span></p>` : ''}
    </fieldset>
    ${d.category && policyOf(d.category) === 'review' ? html`<p class="m-note c-sun">${icon('shield', 16)}<span>${catNote(d.category)} ${tr('It goes live after a moderator approves it.')}</span></p>` : ''}
    ${input({ id: 'mp-title', name: 'title', label: tr('Short title'), value: d.title, error: e.title, maxlength: 90, placeholder: tr('Carry a sofa to the 3rd floor') })}
    ${d.category && catExample(d.category) ? html`<button type="button" class="m-btn m-btn--soft m-btn--sm" data-action="m-post-example">${icon('sparkle', 16)}${tr('Fill in an example {cat} task', { cat: catWord(d.category) })}</button>` : ''}`;
}

function stepDetails(d, e) {
  return html`
    ${textarea({ id: 'mp-description', name: 'description', label: tr('What needs doing?'), value: d.description, error: e.description, rows: 5, hint: tr('How big is it, what should they bring, anything special?') })}
    ${textarea({ id: 'mp-requirements', name: 'requirements', label: tr('Requirements'), value: d.requirements, optional: true, rows: 3, hint: tr('One per line, e.g. “Own car”.') })}
    ${textarea({ id: 'mp-safetyNotes', name: 'safetyNotes', label: tr('Safety notes'), value: d.safetyNotes, optional: true, rows: 2, hint: tr('Stairs, pets, access…') })}
    ${input({ id: 'mp-recurring', name: 'recurring', label: tr('Repeats'), value: d.recurring, optional: true, placeholder: tr('Every Tuesday') })}`;
}

function stepWhere(d, e) {
  const dates = [['Today', todayIso()], ['Tomorrow', inDays(1)], ['Saturday', nextSaturday()]];
  return html`
    ${areaSelect({ id: 'mp-area', value: d.area, error: e.area, label: tr('Area'), hint: tr('Taskers only see this area until you accept someone.') })}
    ${input({ id: 'mp-exactAddress', name: 'exactAddress', label: tr('Exact address (private)'), value: d.exactAddress, optional: true, error: e.exactAddress, autocomplete: 'street-address', hint: tr('Only you see it. You choose when to share it.') })}
    <div class="m-field" id="mp-date" tabindex="-1">
      <span class="m-label">${tr('Day')}</span>
      <div class="m-chips-row">${dates.map(([label, iso], i) => html`<button type="button" class="m-fchip c-${PALETTE[i + 2]}${d.date === iso ? ' is-on' : ''}" data-action="m-post-set" data-field="date" data-value="${iso}" aria-pressed="${String(d.date === iso)}">${tr(label)}<small>${fmt.date(iso)}</small></button>`)}</div>
      ${input({ id: 'mp-date-input', name: 'date', label: tr('Or pick a date'), type: 'date', value: d.date, min: todayIso(), error: e.date })}
    </div>
    <div class="m-field" id="mp-start" tabindex="-1">
      <span class="m-label">${tr('Time')}</span>
      <div class="m-chips-row">${WINDOWS.map(([label, s, en], i) => html`<button type="button" class="m-fchip c-${PALETTE[i + 4]}${d.start === s && d.end === en ? ' is-on' : ''}" data-action="m-post-window" data-start="${s}" data-end="${en}" aria-pressed="${String(d.start === s && d.end === en)}">${tr(label)}<small>${s}–${en}</small></button>`)}</div>
      <div class="m-two">
        ${input({ id: 'mp-start-input', name: 'start', label: tr('From'), type: 'time', value: d.start, error: e.start })}
        ${input({ id: 'mp-end-input', name: 'end', label: tr('To'), type: 'time', value: d.end })}
      </div>
    </div>`;
}

function fairness(d) {
  const h = impliedHourly(d.budgetMax, d.estimatedHours);
  if (!h) return html`<p class="m-fair c-stone">${tr('Add the hours to see the hourly equivalent.')}</p>`;
  if (h < APP.minFairHourly) return html`<p class="m-fair c-tomato">${icon('alert', 16)}<span>${tr('Up to about {rate}/h. Under {min}/h usually gets few offers.', { rate: fmt.money0(Math.round(h)), min: fmt.money0(APP.minFairHourly) })}</span></p>`;
  if (h < 18) return html`<p class="m-fair c-sun">${icon('info', 16)}<span>${tr('Up to about {rate}/h. Fine, a bit more gets faster offers.', { rate: fmt.money0(Math.round(h)) })}</span></p>`;
  return html`<p class="m-fair c-mint">${icon('check', 16)}<span>${tr('Up to about {rate}/h. A fair budget.', { rate: fmt.money0(Math.round(h)) })}</span></p>`;
}

function stepper(name, label, value, step, unit) {
  return html`<div class="m-stepper">
    <span class="m-stepper__label" id="mp-${name}-label">${tr(label)}</span>
    <div class="m-stepper__row">
      <button type="button" class="m-stepper__btn" data-action="m-post-bump" data-field="${name}" data-delta="${-step}" aria-label="${tr('Less: {label}', { label: tr(label) })}">−</button>
      <input class="m-stepper__input" id="mp-${name}" name="${name}" type="number" inputmode="decimal" value="${value}" aria-labelledby="mp-${name}-label" data-input="m-post-live">
      <span class="m-stepper__unit">${unit}</span>
      <button type="button" class="m-stepper__btn" data-action="m-post-bump" data-field="${name}" data-delta="${step}" aria-label="${tr('More: {label}', { label: tr(label) })}">+</button>
    </div>
  </div>`;
}

function stepBudget(d, e) {
  return html`
    <div class="m-bigprice c-${catColor(d.category)}" aria-live="polite"><span class="m-bigprice__label">${tr('Budget for the whole task')}</span><span class="m-bigprice__value" data-live="range">${fmt.range(Number(d.budgetMin) || 0, Number(d.budgetMax) || 0)}</span></div>
    <div id="mp-budgetMin" tabindex="-1">
      ${stepper('budgetMin', 'From', d.budgetMin, 5, '€')}
      ${stepper('budgetMax', 'Up to', d.budgetMax, 5, '€')}
      ${e.budgetMin ? html`<p class="field__error">${icon('alert', 16)}<span>${e.budgetMin}</span></p>` : ''}
    </div>
    <div id="mp-estimatedHours" tabindex="-1">${stepper('estimatedHours', 'About how long', d.estimatedHours, 0.5, 'h')}${e.estimatedHours ? html`<p class="field__error">${icon('alert', 16)}<span>${e.estimatedHours}</span></p>` : ''}</div>
    <div data-live="fair">${fairness(d)}</div>`;
}

function stepConfirm(d) {
  const area = parseAreaKey(d.area);
  const pol = policyOf(d.category);
  const b = breakdown(Math.round((Number(d.budgetMin) + Number(d.budgetMax)) / 2));
  const reqs = String(d.requirements || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return html`<article class="m-confirm">
      <div class="m-confirm__band c-${catColor(d.category)}">${catBadge(d.category, 'lg')}<span>${catLabel(d.category)}</span></div>
      <div class="m-confirm__body">
        <h2 class="m-h2">${d.title}</h2>
        <ul class="m-facts">
          <li>${icon('calendar', 18)}<span>${fmt.dateLong(d.date)}${d.recurring ? ` · ${d.recurring}` : ''}</span><button type="button" class="m-link" data-action="m-post-goto" data-step="2">${tr('Edit')}</button></li>
          <li>${icon('clock', 18)}<span>${d.start}–${d.end} · ${tr('about {h} h', { h: fmt.number(Number(d.estimatedHours) || 0) })}</span><button type="button" class="m-link" data-action="m-post-goto" data-step="2">${tr('Edit')}</button></li>
          <li>${icon('pin', 18)}<span>${area ? areaLabel(area) : '—'}${d.exactAddress ? ` · ${tr('address kept private')}` : ''}</span><button type="button" class="m-link" data-action="m-post-goto" data-step="2">${tr('Edit')}</button></li>
          <li>${icon('euro', 18)}<span>${fmt.range(Number(d.budgetMin), Number(d.budgetMax))}</span><button type="button" class="m-link" data-action="m-post-goto" data-step="3">${tr('Edit')}</button></li>
        </ul>
        <p class="m-desc">${d.description}</p>
        ${reqs.length ? html`<div class="m-chips-wrap">${reqs.map((r, i) => html`<span class="m-chip c-${PALETTE[i % PALETTE.length]}">${r}</span>`)}</div>` : ''}
      </div>
    </article>
    <section class="m-card m-card--soft">
      <h3 class="m-h4">${tr('No surprises')}</h3>
      <p class="m-small">${tr('Accept someone at {price} and you pay {total} ({fee} service fee). They receive {net}. Demo only: no real money moves.', { price: fmt.money(b.price), total: fmt.money(b.clientTotal), fee: pct(APP.fees.clientServiceRate), net: fmt.money(b.taskerNet) })}</p>
    </section>
    ${pol === 'review' ? html`<p class="m-note c-sun">${icon('shield', 16)}<span>${tr('{cat} tasks are checked by a moderator before they go live.', { cat: catLabel(d.category) })}</span></p>` : ''}`;
}

export const post = {
  title: () => tr('Post a task'),
  render(ctx) {
    const s = state(ctx);
    const d = s.draft;
    const e = errorsFor('m-post');
    const body = [stepWhat, stepDetails, stepWhere, stepBudget, stepConfirm][s.step](d, e);
    const last = s.step === STEPS.length - 1;
    const top = html`<header class="m-top m-top--post">
      ${s.step === 0 ? html`<a class="m-iconbtn" href="#/home" aria-label="${tr('Close')}">${icon('x', 22)}</a>` : html`<button type="button" class="m-iconbtn" data-action="m-post-back" aria-label="${tr('Back')}">${icon('back', 22)}</button>`}
      ${progress(s.step)}
      <span class="m-top__step">${s.step + 1}/${STEPS.length}</span>
    </header>`;
    const content = html`<form class="m-pad m-post" id="m-post-form" data-form="m-post-next" novalidate>
      <h1 class="m-h1" tabindex="-1">${tr(STEPS[s.step].title)}</h1>
      ${errorSummary(e, 'mp')}
      ${body}
    </form>`;
    const footer = html`<button type="submit" form="m-post-form" class="m-btn m-btn--primary m-btn--block m-btn--lg">${tr(last ? (policyOf(d.category) === 'review' ? 'Send for review' : 'Post task') : 'Continue')}${last ? '' : icon('chevron', 18)}</button>`;
    return screen({ ctx, top, content, footer, tabs: false });
  },
};

function readForm() {
  const form = document.getElementById('m-post-form');
  if (!form) return;
  const data = new FormData(form);
  const d = ui.mPost.draft;
  for (const key of ['title', 'category', 'description', 'requirements', 'safetyNotes', 'recurring', 'area', 'exactAddress', 'date', 'start', 'end', 'budgetMin', 'budgetMax', 'estimatedHours']) {
    if (data.has(key)) d[key] = data.get(key);
  }
}

function stepErrors(step) {
  const all = checkTask(draftFromForm(ui.mPost.draft));
  return Object.fromEntries(Object.entries(all).filter(([k]) => STEPS[step].fields.includes(k)));
}

const rerender = () => setUi({}, { preserve: false });

export const forms = {
  'm-post-next'() {
    readForm();
    const s = ui.mPost;
    if (s.step < STEPS.length - 1) {
      const errors = stepErrors(s.step);
      if (Object.keys(errors).length) return setErrors('m-post', errors);
      clearErrors('m-post');
      s.step += 1;
      return rerender();
    }
    const res = publishTask(me().id, draftFromForm(s.draft));
    if (!res.ok) {
      const first = STEPS.findIndex((st) => st.fields.some((f) => res.errors[f]));
      s.step = Math.max(0, first);
      return setErrors('m-post', res.errors);
    }
    clearErrors('m-post');
    ui.mPost = null;
    toast(tr(res.status === 'under_review' ? 'Sent for review. We’ll tell you when it’s live.' : 'Your task is live. Offers will show up here.'));
    go(`/task/${res.id}`);
  },
};

export const actions = {
  'm-post-back'() { readForm(); clearErrors('m-post'); ui.mPost.step = Math.max(0, ui.mPost.step - 1); rerender(); },
  'm-post-goto'(el) { ui.mPost.step = Number(el.dataset.step); clearErrors('m-post'); rerender(); },
  'm-post-example'() {
    readForm();
    const d = ui.mPost.draft;
    const x = catExample(d.category);
    Object.assign(d, { title: x.title, description: x.description, requirements: x.requirements, safetyNotes: x.safetyNotes, budgetMin: String(x.budgetMin), budgetMax: String(x.budgetMax), estimatedHours: String(x.hours) });
    clearErrors('m-post');
    rerender();
  },
  'm-post-set'(el) { readForm(); ui.mPost.draft[el.dataset.field] = el.dataset.value; rerender(); },
  'm-post-window'(el) { readForm(); Object.assign(ui.mPost.draft, { start: el.dataset.start, end: el.dataset.end }); rerender(); },
  'm-post-bump'(el) {
    readForm();
    const d = ui.mPost.draft;
    const f = el.dataset.field;
    const min = f === 'estimatedHours' ? 0.5 : 10;
    const next = Math.max(min, (Number(String(d[f]).replace(',', '.')) || 0) + Number(el.dataset.delta));
    d[f] = String(next);
    if (f === 'budgetMin' && Number(d.budgetMax) < next) d.budgetMax = String(next);
    if (f === 'budgetMax' && Number(d.budgetMin) > next) d.budgetMin = String(next);
    rerender();
    setTimeout(() => document.querySelector(`[data-action="m-post-bump"][data-field="${f}"][data-delta="${el.dataset.delta}"]`)?.focus(), 0);
  },
};

export const changes = {
  'm-post-cat'() { readForm(); clearErrors('m-post'); rerender(); },
};

export const inputs = {
  'm-post-live'() {
    readForm();
    const d = ui.mPost.draft;
    const range = document.querySelector('[data-live="range"]');
    if (range) range.textContent = fmt.range(Number(d.budgetMin) || 0, Number(d.budgetMax) || 0);
    const fair = document.querySelector('[data-live="fair"]');
    if (fair) fair.innerHTML = String(fairness(d));
  },
};

