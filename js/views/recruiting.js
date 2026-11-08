// Tasker's recruiting inbox: connection requests from businesses.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, notice, statusBadge, emptyState, badge, select } from '../ui/components.js';
import { connectionsOfTasker, businessOf, userById, me, taskerProfileOf } from '../select.js';
import { field as fieldById } from '../data/fields.js';
import { areaLabel } from '../data/geo.js';
import { fmt, t } from '../i18n.js';
import { respondConnection, setOutcome, OUTCOMES } from '../services/recruiting.js';
import { setDiscoverability } from '../services/accounts.js';
import { BUSINESS_CHECK } from '../logic/status.js';
import { personAvatar, reportButton, blockButton } from './common.js';
import { consentText } from './profile-forms.js';
import { go } from '../router.js';
import { toast, confirmDialog } from '../ui/dialog.js';

export default {
  title: () => 'Recruiting inbox',
  render(ctx) {
    const user = ctx.user;
    const list = connectionsOfTasker(user.id);
    const pending = list.filter((c) => c.status === 'pending');
    const rest = list.filter((c) => c.status !== 'pending');
    const p = taskerProfileOf(user.id);
    return html`<div class="wrap page">
      ${pageHead({ eyebrow: 'Stable work', title: 'Recruiting inbox', lead: 'Requests from businesses that found you through candidate search. You decide whether to talk, and nothing here commits you to anything.' })}
      ${user.discoverableToBusinesses
        ? notice({ tone: 'success', ic: 'eye', title: 'You are visible to businesses for stable work', body: `Fields: ${(p.employmentGoal.fields || []).map((f) => fieldById(f)?.label).join(', ') || 'any'}. You can switch this off at any time; existing conversations stay.`, actions: html`<a class="btn btn--secondary btn--sm" href="#/settings#discoverability">Change preferences</a><button type="button" class="btn btn--ghost btn--sm" data-action="disc-off">Switch off</button>` })
        : html`<section class="card"><h2 class="card__title">You are not visible to businesses</h2><p>${t('recruiting.promise')} If you are open to a stable job, you can opt in and choose your fields and the kind of work you want.</p>${consentText()}<a class="btn btn--primary" href="#/settings#discoverability">Set up visibility</a></section>`}
      <section aria-labelledby="pending-h">
        <h2 id="pending-h">New requests</h2>
        ${pending.length ? html`<ul class="cand-list">${pending.map((c) => request(c, true))}</ul>` : emptyState({ ic: 'briefcase', title: 'No new requests', body: user.discoverableToBusinesses ? 'Businesses in your fields can find you. Requests appear here.' : 'Turn on visibility to receive requests.' })}
      </section>
      ${rest.length ? html`<section aria-labelledby="past-h"><h2 id="past-h">Earlier</h2><ul class="cand-list">${rest.map((c) => request(c, false))}</ul></section>` : ''}
    </div>`;
  },
};

function request(c, isPending) {
  const biz = businessOf(c.businessId);
  const bu = userById(c.businessId);
  return html`<li class="card cand">
    <div class="cand__head">
      <span class="person">${personAvatar(bu)}<span class="person__text"><a class="person__name" href="#/profile/${bu.id}">${biz.companyName}</a><span class="person__sub">${fieldById(biz.field)?.label} · ${biz.size} people · ${areaLabel(biz.locationArea)}</span></span></span>
      <div class="row row--tight">${badge((BUSINESS_CHECK[biz.verifiedStatus] || BUSINESS_CHECK.not_started).label, (BUSINESS_CHECK[biz.verifiedStatus] || BUSINESS_CHECK.not_started).tone, 'shield')}${statusBadge('connection', c.status)}</div>
    </div>
    <blockquote class="quote">${c.message}</blockquote>
    <p class="small muted">Received ${fmt.relative(c.createdAt)} · hiring: ${biz.hiringIntent?.roles || '—'}</p>
    ${isPending ? html`<div class="row">
      <button type="button" class="btn btn--primary" data-action="conn-accept" data-id="${c.id}">${icon('message')}Accept and reply</button>
      <button type="button" class="btn btn--secondary" data-action="conn-decline" data-id="${c.id}">Decline</button>
      ${reportButton('user', bu.id, { userId: bu.id })}${blockButton(bu.id)}
    </div>
    <p class="small muted">Accepting opens a conversation in the app. It is not an interview or a job offer, and your contact details stay private until you share them.</p>` : ''}
    ${c.status === 'accepted' ? html`<div class="row row--between outcome">
      <a class="btn btn--secondary btn--sm" href="#/messages/${c.conversationId}">Open conversation</a>
      ${select({ id: `outcome-${c.id}`, name: 'outcome', label: 'Where things stand (only you can set this)', value: c.outcome || 'talking', options: OUTCOMES.map((o) => ({ value: o.id, label: o.label })), extra: { 'data-change': 'conn-outcome', 'data-id': c.id, 'data-no-preserve': true }, cls: 'field--inline field--compact' })}
    </div>` : ''}
  </li>`;
}

export const actions = {
  'conn-accept'(el) {
    const res = respondConnection(el.dataset.id, me().id, true);
    if (!res.ok) return toast(res.message, 'danger');
    toast('Connected. Say hello!');
    go(`/messages/${res.conversationId}`);
  },
  async 'conn-decline'(el) {
    const yes = await confirmDialog({ title: 'Decline this request?', body: html`<p>The business is told you declined. They cannot send you another request for now.</p>`, confirmLabel: 'Decline' });
    if (!yes) return;
    const res = respondConnection(el.dataset.id, me().id, false);
    toast(res.ok ? 'Request declined.' : res.message, res.ok ? 'info' : 'danger');
  },
  async 'disc-off'() {
    const yes = await confirmDialog({ title: 'Stop being visible to businesses?', body: html`<p>You disappear from candidate search straight away. Conversations you already accepted stay open.</p>`, confirmLabel: 'Switch off' });
    if (!yes) return;
    setDiscoverability(me().id, false);
    toast('You are no longer visible to businesses.', 'info');
  },
};

export const changes = {
  'conn-outcome'(el) {
    const res = setOutcome(el.dataset.id, me().id, el.value);
    toast(res.ok ? 'Updated. Only you can change this.' : res.message, res.ok ? 'info' : 'danger');
  },
};
