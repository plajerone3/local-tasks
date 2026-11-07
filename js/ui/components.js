// Presentational building blocks. No state access here; pass data in.
import { html, raw, attrs } from './html.js';
import { icon } from './icons.js';
import { category } from '../data/categories.js';
import { CITIES, areaKey } from '../data/geo.js';
import { fmt, tr, trn } from '../i18n.js';
import { initials, slug, WEEKDAYS, WEEKDAY_SHORT, WEEKDAY_LABEL, SLOTS } from '../util.js';
import {
  TASK_STATUS, APPLICATION_STATUS, ASSIGNMENT_STATUS, PAYMENT_STATUS, PROOF_STATUS, CONNECTION_STATUS, REPORT_STATUS, TX_STATUS, DISPUTE_STATUS,
} from '../logic/status.js';
import { NOT_USED } from '../logic/matching.js';

const STATUS_MAPS = {
  task: TASK_STATUS, application: APPLICATION_STATUS, assignment: ASSIGNMENT_STATUS, payment: PAYMENT_STATUS,
  proof: PROOF_STATUS, connection: CONNECTION_STATUS, report: REPORT_STATUS, tx: TX_STATUS, dispute: DISPUTE_STATUS,
};

export function badge(text, tone = 'neutral', ic = null) {
  return html`<span class="badge badge--${tone}">${ic ? icon(ic, 14) : ''}${text}</span>`;
}

export function statusBadge(kind, status) {
  const m = STATUS_MAPS[kind]?.[status] || { label: status, tone: 'neutral' };
  return html`<span class="badge badge--${m.tone} badge--status"><span class="badge__dot" aria-hidden="true"></span>${tr(m.label)}</span>`;
}

export const demoTag = (text = 'Demo') => html`<span class="badge badge--demo">${text}</span>`;

export function catLabel(id, { plain = false } = {}) {
  const c = category(id);
  return html`<span class="cat${plain ? ' cat--plain' : ''}"><span class="cat__icon" aria-hidden="true">${c.emoji}</span>${c.label}</span>`;
}

export function avatar(user, size = 'md') {
  if (!user) return html`<span class="avatar avatar--${size}" aria-hidden="true">?</span>`;
  return html`<span class="avatar avatar--${size}" style="--av:${user.avatar?.color || '#1E6B58'}" aria-hidden="true">${initials(user.roles?.includes('business') && user.orgName ? user.orgName : user.name)}</span>`;
}

export function starIcons(value) {
  const full = Math.round(value || 0);
  return raw(Array.from({ length: 5 }, (_, i) => `<span class="star${i < full ? ' star--on' : ''}" aria-hidden="true">★</span>`).join(''));
}

export function rating(summary, { compact = false, emptyText = tr('No reviews yet') } = {}) {
  if (!summary?.count) return html`<span class="rating rating--empty">${emptyText}</span>`;
  const label = trn(summary.count, 'Rated {avg} out of 5 from {n} review', 'Rated {avg} out of 5 from {n} reviews', { avg: fmt.rating(summary.avg) });
  return html`<span class="rating" role="img" aria-label="${label}"><span class="stars">${starIcons(summary.avg)}</span><strong>${fmt.rating(summary.avg)}</strong>${compact ? '' : html`<span class="muted"> (${summary.count})</span>`}</span>`;
}

export function proofBadge(status) {
  const m = PROOF_STATUS[status] || PROOF_STATUS.self_reported;
  return html`<span class="badge badge--${m.tone}" title="${tr(m.hint)}">${icon(status === 'verified' ? 'shieldcheck' : 'file', 14)}${tr(m.label)}</span>`;
}

export function proofItem(p, { showHint = true } = {}) {
  const m = PROOF_STATUS[p.status] || PROOF_STATUS.self_reported;
  return html`<li class="proof">
    <div class="proof__main">${icon('file')}<span class="proof__label">${p.label}</span></div>
    <div class="proof__meta">${proofBadge(p.status)}${showHint ? html`<span class="small muted">${tr(m.hint)}</span>` : ''}</div>
  </li>`;
}

export function fitBadge(fit) {
  if (!fit) return '';
  return html`<span class="badge badge--fit badge--${fit.tone}">${icon(fit.level === 'strong' ? 'sparkle' : 'compass', 14)}${fit.label}</span>`;
}

/** A recommendation with its reasons, plus a disclosure listing every factor and what is never used. */
export function fitBlock(fit, { title = 'Why this is recommended', compact = false } = {}) {
  if (!fit) return '';
  const factors = fit.factors.filter((f) => f.points > 0).sort((a, b) => b.points - a.points);
  return html`<div class="fit${compact ? ' fit--compact' : ''}">
    <div class="fit__head">${fitBadge(fit)}<span class="fit__title">${title}</span></div>
    <p class="fit__text">${fit.explanation}</p>
    ${compact ? '' : html`<details class="disclosure">
      <summary>How this was worked out</summary>
      <div class="disclosure__body">
        ${factors.length ? html`<ul class="checklist">${factors.map((f) => html`<li>${icon('check', 16)}<span>${f.text}</span></li>`)}</ul>` : ''}
        ${fit.caveats.length ? html`<p class="small"><strong>Worth checking:</strong></p><ul class="checklist checklist--muted">${fit.caveats.map((c) => html`<li>${icon('info', 16)}<span>${c}</span></li>`)}</ul>` : ''}
        <p class="small muted">This fit only describes this ${fit.perspective === 'self' ? 'task' : 'context'}. It is not an overall rating of a person. Never used: ${NOT_USED.join('; ')}.</p>
      </div>
    </details>`}
  </div>`;
}

export function notice({ tone = 'info', title, body, ic, actions, role }) {
  const iconName = ic || { info: 'info', warn: 'alert', danger: 'alert', success: 'check', demo: 'info', neutral: 'info' }[tone];
  return html`<div class="notice notice--${tone}" ${role ? attrs({ role }) : ''}>
    <span class="notice__icon">${icon(iconName, 20)}</span>
    <div class="notice__body">${title ? html`<p class="notice__title">${title}</p>` : ''}${body ? html`<div class="notice__text">${body}</div>` : ''}${actions ? html`<div class="notice__actions">${actions}</div>` : ''}</div>
  </div>`;
}

export function emptyState({ ic = 'search', title, body, actions }) {
  return html`<div class="empty">
    <span class="empty__icon">${icon(ic, 28)}</span>
    <p class="empty__title">${title}</p>
    ${body ? html`<p class="empty__text">${body}</p>` : ''}
    ${actions ? html`<div class="row row--center">${actions}</div>` : ''}
  </div>`;
}

export function pageHead({ eyebrow, title, lead, actions, back }) {
  return html`<header class="page-head">
    ${back ? html`<a class="back" href="#${back.href}">${icon('back', 16)}${back.label}</a>` : ''}
    <div class="page-head__row">
      <div class="page-head__text">
        ${eyebrow ? html`<p class="eyebrow">${eyebrow}</p>` : ''}
        <h1 tabindex="-1">${title}</h1>
        ${lead ? html`<p class="lead">${lead}</p>` : ''}
      </div>
      ${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}
    </div>
  </header>`;
}

export function meter(pct, label) {
  return html`<div class="meter-wrap">
    <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}"><span class="meter__bar" style="width:${pct}%"></span></div>
  </div>`;
}

export function timeline(lc) {
  return html`<ol class="timeline" aria-label="Progress">
    ${lc.steps.map((s) => html`<li class="timeline__step timeline__step--${s.state}" ${s.state === 'current' ? raw('aria-current="step"') : ''}>
      <span class="timeline__dot" aria-hidden="true">${s.state === 'done' ? icon('check', 12) : ''}</span>
      <span class="timeline__label">${s.label}${s.state === 'skipped' ? html`<span class="visually-hidden"> (skipped)</span>` : ''}</span>
    </li>`)}
  </ol>
  ${lc.terminal ? html`<p class="timeline__terminal">${badge(lc.terminal.label, lc.terminal.tone)}</p>` : ''}`;
}

export function tabs(items, current, { label = 'Sections' } = {}) {
  return html`<nav class="tabs" aria-label="${label}">${items.map((t) => html`<a class="tab" href="#${t.href}" ${t.id === current ? raw('aria-current="page"') : ''}>${t.label}${t.count != null ? html`<span class="tab__count">${t.count}</span>` : ''}</a>`)}</nav>`;
}

export const stat = (label, value, hint) => html`<div class="stat"><span class="stat__label">${label}</span><span class="stat__value">${value}</span>${hint ? html`<span class="stat__hint">${hint}</span>` : ''}</div>`;

// ---------- Forms ----------

const describedBy = (id, hint, error) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || null;

function labelEl(id, label, required, optional) {
  return html`<label class="field__label" for="${id}">${label}${required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}${optional ? html`<span class="field__optional"> (${tr('optional')})</span>` : ''}</label>`;
}
const hintEl = (id, hint) => (hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : '');
const errorEl = (id, error) => (error ? html`<p class="field__error" id="${id}-error">${icon('alert', 16)}<span>${error}</span></p>` : '');

export function input({ id, name = id, label, type = 'text', value = '', hint, error, required, optional, placeholder, min, max, step, autocomplete, inputmode, maxlength, extra = {}, cls = '' }) {
  return html`<div class="field${error ? ' field--error' : ''} ${cls}">
    ${labelEl(id, label, required, optional)}${hintEl(id, hint)}
    <input class="input" ${attrs({ id, name, type, value: value ?? '', placeholder, min, max, step, autocomplete, inputmode, maxlength, 'aria-required': required ? 'true' : null, 'aria-invalid': error ? 'true' : null, 'aria-describedby': describedBy(id, hint, error), ...extra })}>
    ${errorEl(id, error)}
  </div>`;
}

export function textarea({ id, name = id, label, value = '', hint, error, required, optional, rows = 4, placeholder, maxlength, extra = {} }) {
  return html`<div class="field${error ? ' field--error' : ''}">
    ${labelEl(id, label, required, optional)}${hintEl(id, hint)}
    <textarea class="input textarea" ${attrs({ id, name, rows, placeholder, maxlength, 'aria-required': required ? 'true' : null, 'aria-invalid': error ? 'true' : null, 'aria-describedby': describedBy(id, hint, error), ...extra })}>${value ?? ''}</textarea>
    ${errorEl(id, error)}
  </div>`;
}

export function select({ id, name = id, label, options, value = '', hint, error, required, optional, placeholder, extra = {}, cls = '' }) {
  const groups = [];
  for (const o of options) {
    const g = o.group || '';
    let bucket = groups.find((x) => x.name === g);
    if (!bucket) groups.push((bucket = { name: g, items: [] }));
    bucket.items.push(o);
  }
  const opt = (o) => html`<option ${attrs({ value: o.value, selected: String(o.value) === String(value), disabled: !!o.disabled })}>${o.label}</option>`;
  return html`<div class="field${error ? ' field--error' : ''} ${cls}">
    ${labelEl(id, label, required, optional)}${hintEl(id, hint)}
    <select class="input select" ${attrs({ id, name, 'aria-required': required ? 'true' : null, 'aria-invalid': error ? 'true' : null, 'aria-describedby': describedBy(id, hint, error), ...extra })}>
      ${placeholder != null ? html`<option value="">${placeholder}</option>` : ''}
      ${groups.map((g) => (g.name ? html`<optgroup label="${g.name}">${g.items.map(opt)}</optgroup>` : g.items.map(opt)))}
    </select>
    ${errorEl(id, error)}
  </div>`;
}

export function areaSelect({ id, name = 'area', label = 'Location area', value, hint, error, required = true, placeholder = 'Choose an area' }) {
  const options = CITIES.flatMap((c) => c.districts.map((d) => ({ value: `${c.id}:${d.id}`, label: `${d.label}${d.code ? ` (${d.code})` : ''}`, group: c.label })));
  return select({ id, name, label, options, value: typeof value === 'object' ? areaKey(value) : value, hint, error, required, placeholder });
}

/** Checkbox or radio chips inside a fieldset. options: [{ value, label, hint, disabled, badge }] */
export function choices({ id, name, legend, options, values = [], type = 'checkbox', error, hint, required, cls = '', extra = {} }) {
  const set = new Set((Array.isArray(values) ? values : [values]).map(String));
  return html`<fieldset class="field fieldset${error ? ' field--error' : ''}" id="${id}" tabindex="-1" ${attrs({ 'aria-describedby': describedBy(id, hint, error) })}>
    <legend class="field__label">${legend}${required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</legend>
    ${hintEl(id, hint)}
    <div class="choices ${cls}">
      ${options.map((o, i) => html`<label class="choice${o.disabled ? ' choice--disabled' : ''}${o.hint ? ' choice--rich' : ''}">
        <input ${attrs({ type, name, value: o.value, id: `${id}-${slug(String(o.value)) || i}`, checked: set.has(String(o.value)), disabled: !!o.disabled, ...extra })}>
        <span class="choice__box">${type === 'checkbox' ? icon('check', 14) : ''}</span>
        <span class="choice__text"><span class="choice__label">${o.label}${o.badge ? html` ${o.badge}` : ''}</span>${o.hint ? html`<span class="choice__hint">${o.hint}</span>` : ''}</span>
      </label>`)}
    </div>
    ${errorEl(id, error)}
  </fieldset>`;
}

export function checkbox({ id, name = id, label, checked, hint, error, extra = {} }) {
  return html`<div class="field field--check${error ? ' field--error' : ''}">
    <label class="check" for="${id}">
      <input ${attrs({ type: 'checkbox', id, name, value: 'on', checked: !!checked, 'aria-describedby': describedBy(id, hint, error), 'aria-invalid': error ? 'true' : null, ...extra })}>
      <span class="check__box">${icon('check', 14)}</span>
      <span class="check__label">${label}</span>
    </label>
    ${hintEl(id, hint)}${errorEl(id, error)}
  </div>`;
}

export function availabilityGrid({ id = 'availability', value = {}, error }) {
  return html`<fieldset class="field fieldset${error ? ' field--error' : ''}" id="${id}" tabindex="-1">
    <legend class="field__label">When are you usually available?<span class="req" aria-hidden="true"> *</span></legend>
    <p class="field__hint" id="${id}-hint">This is a guide for matching, not a promise. You confirm the time in each application.</p>
    <div class="table-wrap">
      <table class="avail">
        <thead><tr><th scope="col"><span class="visually-hidden">Day</span></th>${SLOTS.map((s) => html`<th scope="col">${s.label}<span class="avail__range">${s.range}</span></th>`)}</tr></thead>
        <tbody>${WEEKDAYS.map((d) => html`<tr><th scope="row">${WEEKDAY_SHORT[d]}</th>${SLOTS.map((s) => html`<td><label class="avail__cell"><input ${attrs({ type: 'checkbox', name: `avail-${d}`, value: s.id, id: `${id}-${d}-${s.id}`, checked: (value[d] || []).includes(s.id) })}><span class="visually-hidden">${WEEKDAY_LABEL[d]} ${s.label.toLowerCase()}</span><span class="avail__box" aria-hidden="true">${icon('check', 14)}</span></label></td>`)}</tr>`)}</tbody>
      </table>
    </div>
    ${errorEl(id, error)}
  </fieldset>`;
}

export function availabilitySummary(av = {}) {
  return html`<table class="avail avail--readonly">
    <caption class="visually-hidden">Usual availability</caption>
    <thead><tr><th scope="col"><span class="visually-hidden">Day</span></th>${SLOTS.map((s) => html`<th scope="col">${s.label}</th>`)}</tr></thead>
    <tbody>${WEEKDAYS.map((d) => html`<tr><th scope="row">${WEEKDAY_SHORT[d]}</th>${SLOTS.map((s) => {
      const on = (av[d] || []).includes(s.id);
      return html`<td><span class="avail__mark${on ? ' avail__mark--on' : ''}">${on ? icon('check', 14) : ''}<span class="visually-hidden">${on ? 'Available' : 'Not usually available'}</span></span></td>`;
    })}</tr>`)}</tbody>
  </table>`;
}

/** Error summary at the top of a form. Links focus the field. */
export function errorSummary(errors, prefix) {
  const entries = Object.entries(errors || {});
  if (!entries.length) return '';
  return html`<div class="error-summary" id="error-summary" tabindex="-1" role="alert" aria-labelledby="error-summary-title">
    <p class="error-summary__title" id="error-summary-title">${trn(entries.length, 'Please check one thing', 'Please check {n} things')}</p>
    <ul>${entries.map(([k, msg]) => html`<li><button type="button" class="link-btn" data-action="focus-field" data-target="${prefix}-${k}">${msg}</button></li>`)}</ul>
  </div>`;
}

export function kv(rows) {
  return html`<dl class="kv">${rows.filter(Boolean).map(([k, v]) => html`<div class="kv__row"><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
}

export const money = (n) => fmt.money(n);
