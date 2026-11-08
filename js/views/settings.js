// Settings: account, roles, discoverability, evidence visibility, company, notifications, data.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, input, areaSelect, choices, errorSummary, notice, badge, select, checkbox } from '../ui/components.js';
import { errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { me, taskerProfileOf, businessOf, proofsOf, deletionRequestOf } from '../select.js';
import { LANGUAGES } from '../data/fields.js';
import { t } from '../i18n.js';
import { updateAccount, saveOpportunity, saveBusiness, exportMyData, requestDeletion, switchRole, setRecruiting } from '../services/accounts.js';
import { opportunityFields, parseOpportunity } from './profile-forms.js';
import { businessFields, parseBusiness } from './onboarding.js';
import { toast, confirmDialog } from '../ui/dialog.js';
import { PROOF_STATUS, VERIFICATION_STATUS } from '../logic/status.js';

const VIS = [{ value: 'public', label: 'Everyone' }, { value: 'businesses', label: 'Businesses only' }, { value: 'private', label: 'Only me' }];

export default {
  title: () => 'Settings',
  render(ctx) {
    const u = ctx.user;
    const ea = errorsFor('account');
    const p = taskerProfileOf(u.id);
    const b = businessOf(u.id);
    const proofs = proofsOf(u.id);
    const deletion = deletionRequestOf(u.id);
    const isBiz = u.roles.includes('business');
    return html`<div class="wrap page page--narrow">
      ${pageHead({ title: 'Settings', lead: 'Your account, who can see what, and your data.' })}
      <nav class="toc card card--flat" aria-label="On this page">
        <a href="#/settings" data-action="scroll-to" data-target="s-account">Account</a>
        ${!isBiz ? html`<a href="#/settings" data-action="scroll-to" data-target="s-roles">Roles</a>` : ''}
        ${p ? html`<a href="#/settings" data-action="scroll-to" data-target="discoverability">Visibility for stable work</a><a href="#/settings" data-action="scroll-to" data-target="s-evidence">Evidence</a>` : ''}
        ${b ? html`<a href="#/settings" data-action="scroll-to" data-target="s-company">Company</a>` : ''}
        <a href="#/settings" data-action="scroll-to" data-target="s-notifications">Notifications</a>
        <a href="#/settings" data-action="scroll-to" data-target="s-data">Your data</a>
      </nav>

      <form class="card" id="s-account" data-form="account" novalidate>
        <h2 class="card__title">Account</h2>
        ${errorSummary(ea, 'acc')}
        ${input({ id: 'acc-name', name: 'name', label: isBiz ? 'Contact person' : 'Name', value: u.name, error: ea.name, required: true, autocomplete: 'name', hint: isBiz ? '' : 'Others see your first name and last initial.' })}
        ${input({ id: 'acc-email', name: 'email', label: 'Email', type: 'email', value: u.email, error: ea.email, required: true, autocomplete: 'email', hint: 'Private. Never shown to other people.' })}
        ${input({ id: 'acc-phone', name: 'phone', label: 'Phone', type: 'tel', value: u.phone || '', optional: true, autocomplete: 'tel', hint: 'Private. Hidden from everyone by default; you can share it in a chat after a task is accepted.' })}
        ${areaSelect({ id: 'acc-area', value: u.locationArea, error: ea.area })}
        ${!isBiz ? choices({ id: 'acc-languages', name: 'languages', legend: 'Languages', options: LANGUAGES.map((l) => ({ value: l, label: l })), values: u.languages }) : ''}
        <p class="small">${badge(VERIFICATION_STATUS[u.verificationStatus]?.label || 'Identity not checked', VERIFICATION_STATUS[u.verificationStatus]?.tone || 'neutral', 'shield')} <span class="muted">Identity checks are not part of the prototype.</span></p>
        <div class="form-actions"><button class="btn btn--primary" type="submit">Save account</button></div>
      </form>

      ${!isBiz ? html`<section class="card" id="s-roles"><h2 class="card__title">Roles</h2>
        <p class="small muted">One account can post tasks and do tasks. Switch between the two views at any time.</p>
        <ul class="role-list">${['client', 'tasker'].map((r) => html`<li class="row row--between">
          <span><strong>${t(`role.${r}`)}</strong> <span class="small muted">${r === 'client' ? 'Post tasks and hire help' : 'Apply to tasks and build a reputation'}</span></span>
          ${u.roles.includes(r) ? (ctx.role === r ? badge('Active view', 'success') : html`<button type="button" class="btn btn--secondary btn--sm" data-action="settings-switch" data-role="${r}">Switch to ${t(`role.${r}`)}</button>`)
            : html`<button type="button" class="btn btn--secondary btn--sm" data-action="add-role" data-role="${r}">Add role</button>`}
        </li>`)}</ul>
        <p class="small muted">Recruiting for an organisation needs a separate business account.</p>
      </section>` : ''}

      ${p ? html`<form class="card" id="discoverability" data-form="settings-opp" novalidate>
        <h2 class="card__title">${icon('eye')} Visibility for stable work</h2>
        <p>${t('recruiting.promise')}</p>
        ${u.discoverableToBusinesses ? notice({ tone: 'success', body: 'You are currently visible to businesses.' }) : notice({ tone: 'neutral', body: 'You are currently not visible to businesses.' })}
        ${errorSummary(errorsFor('settings-opp'), 'set')}
        ${opportunityFields(u, p, errorsFor('settings-opp'), 'set')}
        <div class="form-actions"><button class="btn btn--primary" type="submit">Save visibility</button></div>
      </form>
      <section class="card" id="s-evidence"><h2 class="card__title">${icon('file')} Evidence visibility</h2>
        <p class="small muted">Choose who can see each proof item. Taskers decide; businesses never see items marked “Only me”.</p>
        ${proofs.length ? html`<ul class="row-list row-list--flush">${proofs.map((x) => html`<li class="row-item"><div class="row-item__main"><span class="row-item__title">${x.label}</span><span class="row-item__sub">${PROOF_STATUS[x.status].label}</span></div><div class="row-item__side">${select({ id: `set-vis-${x.id}`, name: 'visibility', label: 'Visible to', options: VIS, value: x.visibility, extra: { 'data-change': 'proof-visibility', 'data-id': x.id, 'data-no-preserve': true }, cls: 'field--inline field--compact' })}</div></li>`)}</ul>` : html`<p class="muted">No proof items yet. <a href="#/profile/edit">Add one</a></p>`}
      </section>` : ''}

      ${b ? html`<form class="card" id="s-company" data-form="settings-business" novalidate>
        <h2 class="card__title">${icon('briefcase')} Company profile and recruiting</h2>
        ${errorSummary(errorsFor('settings-business'), 'setb')}
        ${businessFields(b, errorsFor('settings-business'), 'setb')}
        <div class="form-actions">${b.recruitingEnabled ? html`<button type="button" class="btn btn--ghost" data-action="recruiting-off">Turn off candidate search</button>` : ''}<button class="btn btn--primary" type="submit">Save company profile</button></div>
      </form>` : ''}

      <section class="card" id="s-notifications"><h2 class="card__title">${icon('bell')} Notifications</h2>
        <p class="small muted">In-app notifications work in the demo. Email and push are coming later.</p>
        ${checkbox({ id: 'n-email', name: 'email', label: 'Email me about new applications and messages (coming soon)', extra: { disabled: true } })}
        ${checkbox({ id: 'n-push', name: 'push', label: 'Push notifications on my phone (coming soon)', extra: { disabled: true } })}
        ${checkbox({ id: 'n-digest', name: 'digest', label: 'Weekly summary of tasks near me (coming soon)', extra: { disabled: true } })}
      </section>

      <section class="card" id="s-data"><h2 class="card__title">${icon('download')} Your data</h2>
        <p class="small">Download everything this account has created or received, including your reviews, so your reputation stays portable.</p>
        <div class="row"><button type="button" class="btn btn--secondary" data-action="export-data">${icon('download', 16)}Download my data (JSON)</button></div>
        <h3 class="h-small">Delete account</h3>
        ${deletion ? notice({ tone: 'info', body: `Deletion requested ${new Date(deletion.createdAt).toLocaleDateString()}. In a real system, this starts a documented deletion process (demo only).` })
          : html`<p class="small muted">Requests are handled by a person, so open disputes and legal records can be settled first.</p><button type="button" class="btn btn--danger" data-action="request-deletion">Request account deletion</button>`}
      </section>
    </div>`;
  },
};

export const forms = {
  account(form, data) {
    const res = updateAccount(me().id, { name: data.get('name') || '', email: data.get('email') || '', phone: data.get('phone') || '', area: data.get('area'), languages: data.getAll('languages').length ? data.getAll('languages') : undefined });
    if (!res.ok) return setErrors('account', res.errors);
    clearErrors('account');
    toast('Account saved.');
  },
  'settings-opp'(form, data) {
    const d = parseOpportunity(data);
    const res = saveOpportunity(me().id, d);
    if (!res.ok) return setErrors('settings-opp', res.errors);
    clearErrors('settings-opp');
    toast(d.seeking ? 'You are now visible to businesses for stable work.' : 'You are no longer visible to businesses.');
  },
  'settings-business'(form, data) {
    const res = saveBusiness(me().id, parseBusiness(data));
    if (!res.ok) return setErrors('settings-business', res.errors);
    clearErrors('settings-business');
    toast('Company profile saved.');
  },
};

export const actions = {
  'settings-switch'(el) {
    switchRole(el.dataset.role);
    toast(`Switched to your ${t(`role.${el.dataset.role}`)} view.`, 'info');
  },
  'scroll-to'(el) {
    const target = document.getElementById(el.dataset.target);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.querySelector('h2')?.setAttribute('tabindex', '-1');
    target?.querySelector('h2')?.focus({ preventScroll: true });
  },
  'export-data'() {
    const blob = new Blob([JSON.stringify(exportMyData(me().id), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-local-tasks-data.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Your data was downloaded.');
  },
  async 'request-deletion'() {
    const yes = await confirmDialog({ title: 'Request account deletion?', body: html`<p>In a real system, a person would confirm the request and delete your account and personal data after open tasks and disputes are settled. In the demo, the request is only recorded.</p>`, confirmLabel: 'Request deletion', tone: 'danger' });
    if (!yes) return;
    requestDeletion(me().id);
    toast('Deletion request recorded (demo).', 'info');
  },
  async 'recruiting-off'() {
    const yes = await confirmDialog({ title: 'Turn off candidate search?', body: html`<p>You will no longer be able to search candidates. Existing conversations stay open.</p>`, confirmLabel: 'Turn off' });
    if (!yes) return;
    setRecruiting(me().id, false);
    toast('Candidate search is off.', 'info');
  },
};
