// Staff & roles, settings (rules, categories, SLAs, money), announcements and global search.
import { html, raw } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { badge } from '../../ui/components.js';
import { getState } from '../../store.js';
import { staffList, staffById, policyOf, businessOf } from '../../select.js';
import { can, ROLES, PERMS, roleLabel } from '../../logic/staff.js';
import { FLAG_RULES } from '../../logic/flags.js';
import { CATEGORIES, POLICY } from '../../data/categories.js';
import { DEFAULT_SLA } from '../../data/backoffice-seed.js';
import * as BO from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { go } from '../../router.js';
import { nameOf } from '../events.js';
import { head, table, person, section, btn, decisionDialog, REASON, ago, tabs, staffChip, timeline } from '../ui.js';

// ---------- Staff ----------

export const staff = {
  title: () => 'Staff & roles',
  render(ctx) {
    const team = staffList();
    const manage = can(ctx.staff, 'staff.manage');
    const roles = Object.entries(ROLES);
    const s = getState();
    const actionsBy = (id) => s.activity.filter((e) => e.actorId === id && e.type !== 'staff_signed_in').length;
    return html`
      ${head({ title: 'Staff & roles', sub: 'Who works in the backoffice and what each role may do. Every staff action is in the audit log.', actions: manage ? btn('Add a team member', 'bo-staff-add', {}, { tone: 'primary', ic: 'plus' }) : '' })}
      ${table({
        label: 'Team',
        cols: [{ label: 'Name' }, { label: 'Role' }, { label: 'Status' }, { label: 'Actions logged', cls: 'bo-num' }, { label: 'Last sign-in' }, { label: '' }],
        rows: team.map((x) => {
          const last = s.activity.find((e) => e.actorId === x.id && e.type === 'staff_signed_in');
          return [
            html`${staffChip(x.id)}<span class="bo-cell-sub">${x.title} · ${x.email}</span>`,
            manage && x.id !== ctx.staff.id ? html`<label class="visually-hidden" for="role-${x.id}">Role for ${x.name}</label><select class="input select bo-select-sm" id="role-${x.id}" data-change="bo-staff-role" data-id="${x.id}" data-no-preserve>${roles.map(([k, r]) => html`<option value="${k}" ${x.role === k ? raw('selected') : ''}>${r.label}</option>`)}</select>` : badge(ROLES[x.role].label, ROLES[x.role].tone),
            x.active ? badge('Active', 'success') : badge('Deactivated', 'neutral'),
            html`<a href="#/audit?staff=${x.id}&kind=all">${actionsBy(x.id)}</a>`,
            last ? ago(last.at) : '—',
            manage && x.id !== ctx.staff.id ? btn(x.active ? 'Deactivate' : 'Reactivate', 'bo-staff-active', { id: x.id, on: x.active ? '0' : '1' }, { tone: x.active ? 'ghost' : 'secondary' }) : x.id === ctx.staff.id ? html`<span class="muted">You</span>` : '',
          ];
        }),
      })}
      ${section('What each role can do', html`<div class="bo-table-wrap" role="region" aria-label="Permissions by role" tabindex="0"><table class="bo-table bo-table--dense bo-matrix">
        <thead><tr><th scope="col">Permission</th>${roles.map(([, r]) => html`<th scope="col" class="bo-center">${r.label}</th>`)}</tr></thead>
        <tbody>${Object.entries(PERMS).map(([p, label]) => html`<tr><th scope="row">${label}<span class="bo-cell-sub">${p}</span></th>${roles.map(([, r]) => html`<td class="bo-center">${r.perms.includes(p) ? html`<span class="bo-yes" aria-label="yes">${icon('check', 16)}</span>` : html`<span class="bo-no" aria-label="no">–</span>`}</td>`)}</tr>`)}</tbody>
      </table></div>
      <ul class="bo-role-notes">${roles.map(([, r]) => html`<li><strong>${r.label}:</strong> ${r.blurb}</li>`)}</ul>`)}`;
  },
};

// ---------- Settings ----------

const SLA_LABEL = { report: 'Reports', flagged_task: 'Flagged tasks', task_review: 'Task approvals', flagged_message: 'Flagged messages', dispute: 'Disputes', payout: 'Payouts', proof: 'Proof checks', identity: 'ID checks', business: 'Business checks', data_request: 'Data requests' };

export const settings = {
  title: () => 'Settings',
  render(ctx) {
    const st = getState().settings;
    const edit = can(ctx.staff, 'settings.manage');
    const tab = ['rules', 'categories', 'sla', 'money', 'announce'].includes(ctx.query.tab) ? ctx.query.tab : 'rules';
    const dis = edit ? '' : raw('disabled');
    const recent = getState().activity.filter((e) => ['settings_changed', 'category_open', 'category_review', 'category_soon', 'announcement_sent'].includes(e.type));
    let body;
    if (tab === 'rules') {
      body = html`<form class="bo-card bo-form" data-form="bo-settings" data-section="rules">
        <h2 class="bo-card__title">Automatic risk flags</h2>
        <p class="bo-fine">New tasks and messages are scanned when they are sent. A flag puts the item in the work queue. It never deletes anything.</p>
        <div class="field field--check"><label class="check"><input type="checkbox" name="flagsEnabled" id="set-flags" ${st.flags.enabled ? raw('checked') : ''} ${dis}><span class="check__box" aria-hidden="true"></span><span class="check__label">Scan new tasks and messages</span></label></div>
        <div class="field field--check"><label class="check"><input type="checkbox" name="holdHighRisk" id="set-hold" ${st.flags.holdHighRisk ? raw('checked') : ''} ${dis}><span class="check__box" aria-hidden="true"></span><span class="check__label">Hold high-risk tasks for approval before they go live</span></label><p class="field__hint">Otherwise they go live and wait in the “Flagged tasks” queue.</p></div>
        <div class="field"><label class="field__label" for="set-hourly">Flag pay above this hourly rate (€)</label><input class="input bo-input-sm" type="number" id="set-hourly" name="maxHourly" value="${st.flags.maxHourly}" min="20" max="500" ${dis}></div>
        ${FLAG_RULES.filter((r) => r.terms.length).map((r) => html`<div class="field"><label class="field__label" for="set-terms-${r.id}">${r.label} ${badge(r.severity === 'high' ? 'High risk' : 'Check', r.severity === 'high' ? 'danger' : 'warn')}</label><p class="field__hint">Words or phrases, separated by commas. Matching ignores upper and lower case.</p><textarea class="input textarea" id="set-terms-${r.id}" name="terms_${r.id}" rows="2" ${dis}>${(st.flags.terms[r.id] || []).join(', ')}</textarea></div>`)}
        <p class="bo-fine">Also always checked: phone numbers and email addresses in the text (“Contains a phone number or email address”).</p>
        ${edit ? saveRow() : ''}
      </form>`;
    } else if (tab === 'categories') {
      body = html`<div class="bo-card"><h2 class="bo-card__title">Category policies</h2><p class="bo-fine">“Manual review” sends every new task in that category to the Task approvals queue. “Coming soon” stops new tasks. Changes apply immediately in both apps.</p>
        ${table({ dense: true, label: 'Category policies', cols: [{ label: 'Category' }, { label: 'Live tasks', cls: 'bo-num' }, { label: 'Policy' }],
          rows: CATEGORIES.map((c) => [html`<span aria-hidden="true">${c.emoji}</span> ${c.label}`, getState().tasks.filter((t) => t.category === c.id && t.status === 'open').length,
            edit ? html`<label class="visually-hidden" for="pol-${c.id}">Policy for ${c.label}</label><select class="input select bo-select-sm" id="pol-${c.id}" data-change="bo-policy" data-cat="${c.id}" data-no-preserve>${Object.entries(POLICY).map(([k, v]) => html`<option value="${k}" ${policyOf(c.id) === k ? raw('selected') : ''}>${v.label}</option>`)}</select>` : badge(POLICY[policyOf(c.id)].label, POLICY[policyOf(c.id)].tone)]) })}
      </div>`;
    } else if (tab === 'sla') {
      body = html`<form class="bo-card bo-form" data-form="bo-settings" data-section="sla">
        <h2 class="bo-card__title">Target times (hours)</h2>
        <p class="bo-fine">How long a case may wait before it shows as overdue in the queue.</p>
        <div class="bo-form-grid">${Object.keys(DEFAULT_SLA).map((k) => html`<div class="field"><label class="field__label" for="sla-${k}">${SLA_LABEL[k]}</label><input class="input" type="number" id="sla-${k}" name="sla_${k}" value="${st.sla[k]}" min="1" max="2160" ${dis}></div>`)}</div>
        ${edit ? saveRow() : ''}
      </form>`;
    } else if (tab === 'money') {
      body = html`<form class="bo-card bo-form" data-form="bo-settings" data-section="money">
        <h2 class="bo-card__title">Payouts</h2>
        <div class="field"><label class="field__label" for="set-limit">Payouts above this amount need approval (€)</label><input class="input bo-input-sm" type="number" id="set-limit" name="payoutApprovalOver" value="${st.payoutApprovalOver}" min="0" max="5000" ${dis}></div>
        <div class="field field--check"><label class="check"><input type="checkbox" name="firstPayoutNeedsApproval" id="set-first" ${st.firstPayoutNeedsApproval ? raw('checked') : ''} ${dis}><span class="check__box" aria-hidden="true"></span><span class="check__label">Every tasker’s first payout needs approval</span></label></div>
        <p class="bo-fine">Fees are set in <code>js/config.js</code> for now (clients 5%, taskers 5%), because changing them affects prices already shown to users.</p>
        ${edit ? saveRow() : ''}
      </form>`;
    } else {
      const canSend = can(ctx.staff, 'comms.broadcast');
      body = html`<form class="bo-card bo-form" data-form="bo-broadcast">
        <h2 class="bo-card__title">Send an announcement</h2>
        <p class="bo-fine">Arrives as an in-app notification, prefixed with “${'Local Tasks'}:”. Banned and suspended accounts are skipped. Use it for service news, not marketing.</p>
        <div class="field"><label class="field__label" for="bc-aud">Who gets it</label><select class="input select bo-input-sm" id="bc-aud" name="audience" ${canSend ? '' : raw('disabled')}>${Object.entries(BO.AUDIENCES).map(([k, v]) => html`<option value="${k}">${v} (${BO.audienceOf(k).length})</option>`)}</select></div>
        <div class="field"><label class="field__label" for="bc-text">Message</label><textarea class="input textarea" id="bc-text" name="text" rows="3" maxlength="300" ${canSend ? '' : raw('disabled')}></textarea></div>
        ${canSend ? html`<div class="row"><button type="submit" class="btn btn--primary btn--sm">${icon('send', 16)}Send announcement</button></div>` : html`<p class="bo-fine">${icon('lock', 14)}Your role cannot send announcements.</p>`}
      </form>`;
    }
    return html`
      ${head({ title: 'Settings', sub: edit ? 'Changes apply immediately to the web and mobile apps. Each change asks for a reason and is logged.' : 'You can see the settings but your role cannot change them.' })}
      ${tabs([{ id: 'rules', label: 'Risk rules', href: '/settings?tab=rules' }, { id: 'categories', label: 'Categories', href: '/settings?tab=categories' }, { id: 'sla', label: 'Target times', href: '/settings?tab=sla' }, { id: 'money', label: 'Money', href: '/settings?tab=money' }, { id: 'announce', label: 'Announcements', href: '/settings?tab=announce' }], tab, 'Settings sections')}
      <div class="bo-grid bo-grid--case"><div class="bo-col">${body}</div><div class="bo-col">${section('Recent changes', timeline(recent, { limit: 15, empty: 'No changes yet.' }))}</div></div>`;
  },
};

const saveRow = () => html`<div class="row"><button type="submit" class="btn btn--primary btn--sm">Save changes…</button></div>`;

// ---------- Search ----------

export const search = {
  title: () => 'Search',
  render(ctx) {
    const q = String(ctx.query.q || '').trim();
    const s = getState();
    const lq = q.toLowerCase();
    const hit = (str) => String(str || '').toLowerCase().includes(lq);
    const users = q ? s.users.filter((u) => hit(u.name) || hit(u.email) || u.id === q || hit(businessOf(u.id)?.companyName)).slice(0, 20) : [];
    const tasks = q ? s.tasks.filter((t) => hit(t.title) || hit(t.description) || t.id === q).slice(0, 20) : [];
    const reports = q ? s.reports.filter((r) => r.id === q || hit(r.details)).slice(0, 10) : [];
    const team = q ? s.staff.filter((x) => hit(x.name) || hit(x.email)) : [];
    const txs = q ? s.walletTransactions.filter((x) => x.id === q) : [];
    const total = users.length + tasks.length + reports.length + team.length + txs.length;
    return html`
      ${head({ title: q ? `Results for “${q}”` : 'Search', sub: q ? `${total} results` : 'Search for people, companies, emails, tasks, reports or ids from the bar at the top.' })}
      ${users.length ? section(`People (${users.length})`, table({ dense: true, label: 'People', cols: [{ label: 'Person' }, { label: 'Email' }, { label: 'Id' }], rows: users.map((u) => [person(u), u.email, u.id]) })) : ''}
      ${tasks.length ? section(`Tasks (${tasks.length})`, table({ dense: true, label: 'Tasks', cols: [{ label: 'Task' }, { label: 'Client' }, { label: 'Id' }], rows: tasks.map((t) => [html`<a href="#/tasks/${t.id}">${t.title}</a>`, nameOf(t.clientId), t.id]) })) : ''}
      ${reports.length ? section(`Reports (${reports.length})`, html`<ul class="bo-list">${reports.map((r) => html`<li><a href="#/case/report/${r.id}">${r.id}</a> · ${r.details.slice(0, 100)}</li>`)}</ul>`) : ''}
      ${team.length ? section(`Staff (${team.length})`, html`<ul class="bo-list">${team.map((x) => html`<li>${staffChip(x.id, { withRole: true })}</li>`)}</ul>`) : ''}
      ${txs.length ? section('Transactions', html`<ul class="bo-list">${txs.map((x) => html`<li><a href="#/money?tab=ledger&tx=${x.id}">${x.id}</a> · ${x.label}</li>`)}</ul>`) : ''}
      ${q && !total ? html`<p class="bo-empty">Nothing found.</p>` : ''}`;
  },
};

// ---------- Handlers ----------

const done = (res, msg) => { toast(res?.ok ? msg : res?.message || 'That did not work.', res?.ok ? 'success' : 'danger'); return res?.ok; };

export const actions = {
  async 'bo-staff-add'(el, e, ctx) {
    const res = await decisionDialog({
      title: 'Add a team member', intro: html`<p>They can sign in straight away with the role you choose. In production they would get an invite to set up single sign-on and two-factor authentication.</p>`,
      fields: [{ name: 'name', label: 'Name' }, { name: 'email', label: 'Work email', type: 'email' }, { name: 'title', label: 'Job title', optional: true }, { name: 'role', label: 'Role', type: 'select', value: 'support', options: Object.entries(ROLES).filter(([k]) => k !== 'owner' || ctx.staff.role === 'owner').map(([k, r]) => ({ value: k, label: `${r.label} — ${r.blurb}` })) }],
      confirmLabel: 'Add to the team', run: (v) => BO.addStaff(ctx.staff.id, v),
    });
    if (res) done(res, 'Team member added.');
  },
  async 'bo-staff-active'(el, e, ctx) {
    const on = el.dataset.on === '1';
    const x = staffById(el.dataset.id);
    if (on) { done(BO.setStaffActive(ctx.staff.id, x.id, true), `${x.name} can sign in again.`); return; }
    const res = await decisionDialog({ title: `Deactivate ${x.name}`, intro: html`<p>They can no longer sign in. Their past actions stay in the audit log. Cases assigned to them stay assigned until you reassign them.</p>`, fields: [REASON()], confirmLabel: 'Deactivate', tone: 'danger', run: (v) => BO.setStaffActive(ctx.staff.id, x.id, false, v.reason) });
    if (res) done(res, `${x.name} deactivated.`);
  },
};

export const changes = {
  'bo-staff-role'(el, e, ctx) {
    const res = BO.setStaffRole(ctx.staff.id, el.dataset.id, el.value);
    if (!done(res, `Role changed to ${roleLabel(el.value)}.`)) go('/staff');
  },
  'bo-policy'(el, e, ctx) {
    const res = BO.setPolicy(ctx.staff.id, el.dataset.cat, el.value);
    done(res, `Policy set to “${POLICY[el.value]?.label}”.`);
  },
};

export const forms = {
  async 'bo-settings'(form, data, ctx) {
    const section = form.dataset.section;
    const patch = {};
    if (section === 'rules') {
      patch.flagsEnabled = data.get('flagsEnabled') === 'on';
      patch.holdHighRisk = data.get('holdHighRisk') === 'on';
      patch.maxHourly = data.get('maxHourly');
      patch.terms = Object.fromEntries(FLAG_RULES.filter((r) => r.terms.length).map((r) => [r.id, data.get(`terms_${r.id}`)]));
    } else if (section === 'sla') {
      patch.sla = Object.fromEntries(Object.keys(DEFAULT_SLA).map((k) => [k, data.get(`sla_${k}`)]));
    } else if (section === 'money') {
      patch.payoutApprovalOver = data.get('payoutApprovalOver');
      patch.firstPayoutNeedsApproval = data.get('firstPayoutNeedsApproval') === 'on';
    }
    const res = await decisionDialog({ title: 'Save settings', intro: html`<p>Changes apply immediately in both apps.</p>`, fields: [REASON('Why are you changing this?')], confirmLabel: 'Save', run: (v) => BO.updateSettings(ctx.staff.id, patch, v.reason) });
    if (res) done(res, `${res.changed} setting${res.changed > 1 ? 's' : ''} saved.`);
  },
  async 'bo-broadcast'(form, data, ctx) {
    const audience = data.get('audience');
    const text = data.get('text');
    const n = BO.audienceOf(audience).length;
    const res = await decisionDialog({ title: `Send to ${n} people?`, intro: html`<blockquote class="bo-quote">${text}</blockquote><p>Notifications cannot be recalled once sent.</p>`, fields: [], confirmLabel: 'Send now', run: () => BO.broadcast(ctx.staff.id, audience, text) });
    if (res) { done(res, `Sent to ${res.count} people.`); form.reset(); }
  },
};
