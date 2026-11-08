// Backoffice building blocks: page head, tables, filters, timelines, notes and decision dialogs.
import { html, raw, attrs } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { badge, avatar } from '../ui/components.js';
import { openDialog, closeDialogOf } from '../ui/dialog.js';
import { fmt } from '../i18n.js';
import { initials } from '../util.js';
import { staffById } from '../select.js';
import { describe, eventDetails, eventInfo, nameOf } from './events.js';
import { PRIORITY } from './data.js';
import { ACCOUNT_STATUS, standing } from '../logic/enforcement.js';
import { ROLES } from '../logic/staff.js';

export const when = (iso) => (iso ? `${fmt.day(iso)}, ${fmt.time(iso)}` : '—');
export const ago = (iso) => (iso ? fmt.relative(iso) : '—');

export function head({ title, sub, actions, back, eyebrow }) {
  return html`<header class="bo-head">
    ${back ? html`<a class="bo-back" href="#${back.href}">${icon('back', 16)}${back.label}</a>` : ''}
    <div class="bo-head__row">
      <div>
        ${eyebrow ? html`<p class="bo-eyebrow">${eyebrow}</p>` : ''}
        <h1 tabindex="-1">${title}</h1>
        ${sub ? html`<p class="bo-sub">${sub}</p>` : ''}
      </div>
      ${actions ? html`<div class="bo-head__actions">${actions}</div>` : ''}
    </div>
  </header>`;
}

export const kpi = (label, value, hint, color = 'sun', href = null) => {
  const body = html`<span class="bo-kpi__label">${label}</span><span class="bo-kpi__value">${value}</span>${hint ? html`<span class="bo-kpi__hint">${hint}</span>` : ''}`;
  return href ? html`<a class="bo-kpi bo-kpi--${color}" href="#${href}">${body}</a>` : html`<div class="bo-kpi bo-kpi--${color}">${body}</div>`;
};

/** cols: [{ label, cls }], rows: arrays of cells (or { cells, cls }). */
export function table({ cols, rows, empty = 'Nothing here.', label, dense = false }) {
  if (!rows.length) return html`<p class="bo-empty">${empty}</p>`;
  return html`<div class="bo-table-wrap" role="region" aria-label="${label || 'Table'}" tabindex="0"><table class="bo-table${dense ? ' bo-table--dense' : ''}">
    <thead><tr>${cols.map((c) => html`<th scope="col" class="${c.cls || ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => {
      const cells = Array.isArray(r) ? r : r.cells;
      return html`<tr class="${Array.isArray(r) ? '' : r.cls || ''}">${cells.map((c, i) => html`<td class="${cols[i]?.cls || ''}">${c}</td>`)}</tr>`;
    })}</tbody>
  </table></div>`;
}

export function person(u, { sub, href = true, size = 'sm' } = {}) {
  if (!u) return html`<span class="muted">Unknown</span>`;
  const name = nameOf(u.id);
  return html`<span class="bo-person">${avatar(u, size)}<span class="bo-person__text">${href ? html`<a href="#/users/${u.id}">${name}</a>` : html`<strong>${name}</strong>`}${sub ? html`<span class="bo-person__sub">${sub}</span>` : ''}</span></span>`;
}

export function staffChip(id, { withRole = false } = {}) {
  const st = staffById(id);
  if (!st) return html`<span class="muted">Unassigned</span>`;
  return html`<span class="bo-staff"><span class="bo-staff__dot" style="--c:${st.color}" aria-hidden="true">${initials(st.name)}</span>${st.name}${withRole ? html` <span class="muted">· ${ROLES[st.role]?.label}</span>` : ''}</span>`;
}

export const standingBadge = (u) => {
  const st = standing(u);
  const m = ACCOUNT_STATUS[st];
  return badge(m.label, m.tone);
};

export const priorityBadge = (p) => badge(PRIORITY[p].label, PRIORITY[p].tone);

export function dueText(c, now = Date.now()) {
  const diff = new Date(c.dueAt).getTime() - now;
  const h = Math.abs(diff) / 36e5;
  const span = h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  return diff < 0 ? html`<span class="bo-due bo-due--late">${icon('clock', 14)}Overdue by ${span}</span>` : html`<span class="bo-due">${icon('clock', 14)}Due in ${span}</span>`;
}

/** A filter bar. fields: [{ name, label, type: 'search'|'select', options, value }]. Changes update the URL query. */
export function filters(base, fields, extra = '') {
  return html`<form class="bo-filters" data-form="bo-filter" data-base="${base}" role="search">
    ${fields.map((f) => f.type === 'select'
      ? html`<label class="bo-filter"><span class="bo-filter__label">${f.label}</span><select class="input select" name="${f.name}" id="flt-${f.name}" data-change="bo-filter" data-no-preserve>${f.options.map((o) => html`<option value="${o.value}" ${o.value === (f.value ?? '') ? raw('selected') : ''}>${o.label}</option>`)}</select></label>`
      : html`<label class="bo-filter bo-filter--grow"><span class="bo-filter__label">${f.label}</span><input class="input" type="search" name="${f.name}" id="flt-${f.name}" value="${f.value || ''}" placeholder="${f.placeholder || ''}" data-input="bo-filter-live" autocomplete="off"></label>`)}
    ${extra}
  </form>`;
}

export function timeline(events, { empty = 'No activity yet.', limit = 60 } = {}) {
  if (!events.length) return html`<p class="bo-empty">${empty}</p>`;
  return html`<ol class="bo-feed">${events.slice(0, limit).map((e) => {
    const info = eventInfo(e.type);
    const details = eventDetails(e);
    return html`<li class="bo-feed__item bo-feed__item--${info.tone}${e.actorKind === 'staff' ? ' bo-feed__item--staff' : ''}">
      <span class="bo-feed__dot" aria-hidden="true"></span>
      <div class="bo-feed__body">
        <p class="bo-feed__text">${describe(e)}</p>
        ${e.reason ? html`<p class="bo-feed__reason">${icon('info', 14)}${e.reason}</p>` : ''}
        ${details.length ? html`<p class="bo-feed__meta">${details.map((d) => html`<span>${d}</span>`)}</p>` : ''}
      </div>
      <time class="bo-feed__time" datetime="${e.at}" title="${when(e.at)}">${ago(e.at)}</time>
    </li>`;
  })}</ol>${events.length > limit ? html`<p class="bo-more">${events.length - limit} older entries not shown. Use the activity log for the full history.</p>` : ''}`;
}

export function notesPanel(targetType, targetId, notes, canWrite) {
  return html`<section class="bo-card" aria-labelledby="notes-${targetId}">
    <h2 class="bo-card__title" id="notes-${targetId}">${icon('file', 18)}Internal notes <span class="muted">(staff only)</span></h2>
    ${notes.length ? html`<ul class="bo-notes">${notes.map((n) => html`<li class="bo-note"><p>${n.body}</p><p class="bo-note__meta">${staffChip(n.staffId)} · ${ago(n.createdAt)}</p></li>`)}</ul>` : html`<p class="bo-empty">No notes yet.</p>`}
    ${canWrite ? html`<form class="bo-note-form" data-form="bo-note" data-type="${targetType}" data-id="${targetId}">
      <label class="visually-hidden" for="note-${targetId}">Add a note</label>
      <textarea class="input textarea" id="note-${targetId}" name="body" rows="2" maxlength="1000" placeholder="Add a note for the team…"></textarea>
      <button type="submit" class="btn btn--secondary btn--sm">Add note</button>
    </form>` : ''}
  </section>`;
}

/** Bars for one series (single hue, no legend; the title names it). Each column is a hover/focus target with a tooltip. */
export function bars(buckets, { label, fmtDay = (d) => fmt.date(d.toISOString().slice(0, 10)) } = {}) {
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return html`<figure class="bo-bars" aria-label="${label}">
    <div class="bo-bars__plot">${buckets.map((b) => html`<div class="bo-bars__col" tabindex="0" data-tip="${fmtDay(b.day)}: ${b.n}" aria-label="${fmtDay(b.day)}: ${b.n}">
      <span class="bo-bars__bar" style="height:${b.n ? Math.max(4, Math.round((b.n / max) * 100)) : 0}%"></span>
    </div>`)}</div>
    <div class="bo-bars__axis" aria-hidden="true"><span>${fmtDay(buckets[0].day)}</span><span>${fmtDay(buckets.at(-1).day)}</span></div>
    <figcaption class="visually-hidden">${label}. ${buckets.map((b) => `${fmtDay(b.day)}: ${b.n}`).join('; ')}</figcaption>
  </figure>`;
}

export function kv(rows) {
  return html`<dl class="bo-kv">${rows.filter(Boolean).map(([k, v]) => html`<div class="bo-kv__row"><dt>${k}</dt><dd>${v ?? '—'}</dd></div>`)}</dl>`;
}

export function section(title, body, { actions, id } = {}) {
  const hid = id || `s-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return html`<section class="bo-card" aria-labelledby="${hid}">
    <div class="bo-card__head"><h2 class="bo-card__title" id="${hid}">${title}</h2>${actions ? html`<div class="bo-card__actions">${actions}</div>` : ''}</div>
    ${body}
  </section>`;
}

export const tabs = (items, current, label = 'Sections') => html`<nav class="bo-tabs" aria-label="${label}">${items.map((t) => html`<a class="bo-tab" href="#${t.href}" ${t.id === current ? raw('aria-current="page"') : ''}>${t.label}${t.count ? html`<span class="bo-tab__count">${t.count}</span>` : ''}</a>`)}</nav>`;

export const btn = (label, action, data = {}, { tone = 'secondary', ic, disabled = false, title } = {}) => html`<button type="button" class="btn btn--${tone} btn--sm" ${attrs({ 'data-action': action, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v])), disabled, title, 'aria-disabled': disabled ? 'true' : null })}>${ic ? icon(ic, 16) : ''}${label}</button>`;

export const flagChips = (flags = [], label) => html`<span class="bo-flags">${flags.map((f) => badge(label(f.rule), f.severity === 'high' ? 'danger' : 'warn', 'alert'))}</span>`;

/**
 * A decision dialog that stays open until the action succeeds.
 * fields: [{ name, label, type: 'textarea'|'text'|'number'|'select'|'checkbox', options, hint, value, required }]
 * run(values) must return a service result ({ ok, errors, message }).
 */
export function decisionDialog({ title, intro, fields = [], confirmLabel = 'Confirm', tone = 'primary', run }) {
  return new Promise((resolve) => {
    const field = (f) => {
      const id = `dlg-${f.name}`;
      if (f.type === 'checkbox') return html`<div class="field field--check"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${f.value ? raw('checked') : ''}><span class="check__box" aria-hidden="true"></span><span class="check__label">${f.label}</span></label>${f.hint ? html`<p class="field__hint">${f.hint}</p>` : ''}</div>`;
      const control = f.type === 'textarea'
        ? html`<textarea class="input textarea" id="${id}" name="${f.name}" rows="${f.rows || 3}" ${f.required ? raw('required') : ''} maxlength="${f.max || 600}">${f.value || ''}</textarea>`
        : f.type === 'select'
          ? html`<select class="input select" id="${id}" name="${f.name}">${f.options.map((o) => html`<option value="${o.value}" ${o.value === f.value ? raw('selected') : ''}>${o.label}</option>`)}</select>`
          : html`<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${f.value ?? ''}" ${f.type === 'number' ? raw(`step="${f.step || 'any'}" inputmode="decimal"`) : ''} ${f.required ? raw('required') : ''}>`;
      return html`<div class="field" data-field="${f.name}"><label class="field__label" for="${id}">${f.label}${f.optional ? html` <span class="field__optional">(optional)</span>` : ''}</label>${f.hint ? html`<p class="field__hint" id="${id}-hint">${f.hint}</p>` : ''}${control}<p class="field__error" id="${id}-err" hidden></p></div>`;
    };
    const d = openDialog({
      title,
      body: html`<form class="bo-dialog-form" id="bo-dialog-form" novalidate>${intro ? html`<div class="bo-dialog-intro">${intro}</div>` : ''}${fields.map(field)}<p class="bo-dialog-error" role="alert" hidden></p></form>`,
      footer: html`<button type="button" class="btn btn--secondary" data-dlg="cancel">Cancel</button><button type="submit" form="bo-dialog-form" class="btn btn--${tone}">${confirmLabel}</button>`,
    });
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const form = d.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        values[f.name] = f.type === 'checkbox' ? el.checked : el.value;
      }
      const res = run(values);
      d.querySelectorAll('.field__error').forEach((p) => { p.hidden = true; p.textContent = ''; });
      d.querySelectorAll('.field--error').forEach((p) => p.classList.remove('field--error'));
      const box = d.querySelector('.bo-dialog-error');
      if (res?.ok) { finish(res); closeDialogOf(form); return; }
      let shown = false;
      for (const [k, msg] of Object.entries(res?.errors || {})) {
        const p = d.querySelector(`#dlg-${k}-err`);
        if (p) { p.textContent = msg; p.hidden = false; p.closest('.field').classList.add('field--error'); shown = true; }
      }
      if (!shown || (res?.message && !Object.keys(res.errors || {}).length)) { box.textContent = res?.message || 'That did not work.'; box.hidden = false; }
      d.querySelector('.field--error textarea, .field--error input, .field--error select')?.focus();
    });
    d.addEventListener('click', (e) => { if (e.target.closest('[data-dlg="cancel"]')) { finish(null); closeDialogOf(form); } });
    d.addEventListener('dialog-done', () => finish(null), { once: true });
  });
}

export const REASON = (label = 'Reason', hint = 'Kept in the audit log.') => ({ name: 'reason', label, type: 'textarea', required: true, hint });

export function downloadCsv(name, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const money = (n) => fmt.money(n);
