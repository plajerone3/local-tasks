// Staff sign-in and the overview dashboard.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { APP } from '../../config.js';
import { getState } from '../../store.js';
import { staffList } from '../../select.js';
import { ROLES } from '../../logic/staff.js';
import { fmt } from '../../i18n.js';
import { staffSignIn } from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { go } from '../../router.js';
import { kpis, openCases, eventsPerDay, KINDS } from '../data.js';
import { head, kpi, timeline, bars, section, priorityBadge, dueText, staffChip, table } from '../ui.js';

export const signin = {
  title: () => 'Sign in',
  render() {
    const team = staffList();
    return html`<div class="bo-signin">
      <div class="bo-signin__card">
        <p class="bo-brand bo-brand--big"><img src="icon.svg" alt="" width="44" height="44"><span><strong>${APP.name}</strong><span class="bo-brand__sub">Backoffice</span></span></p>
        <h1 tabindex="-1">Staff sign-in</h1>
        <p class="bo-sub">Pick a team member. Each role sees and can do different things, so try a few.</p>
        <ul class="bo-signin__list">${team.map((st) => html`<li>
          <button type="button" class="bo-signin__btn" data-action="bo-signin" data-id="${st.id}" ${st.active ? '' : 'disabled'}>
            <span class="bo-staff__dot bo-staff__dot--lg" style="--c:${st.color}" aria-hidden="true">${st.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
            <span class="bo-signin__text"><strong>${st.name}</strong><span>${st.title}${st.active ? '' : ' · deactivated'}</span></span>
            <span class="badge badge--${ROLES[st.role].tone}">${ROLES[st.role].label}</span>
          </button>
        </li>`)}</ul>
        <p class="bo-fine">${icon('lock', 14)}Demo only: there are no passwords. A real backoffice needs single sign-on with two-factor authentication, short sessions and an allow-list.</p>
      </div>
    </div>`;
  },
};

export const overview = {
  title: () => 'Overview',
  render(ctx) {
    const k = kpis();
    const cases = openCases();
    const byKind = Object.keys(KINDS).map((kind) => ({ kind, list: cases.filter((c) => c.kind === kind) })).filter((x) => x.list.length);
    const recent = getState().activity.slice(0, 14);
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    return html`
      ${head({ eyebrow: fmt.dateLong(new Date().toISOString().slice(0, 10)), title: `${hello}, ${ctx.staff.name.split(' ')[0]}`, sub: k.overdue ? `${k.openCases} open cases, ${k.overdue} past their target time.` : `${k.openCases} open cases. Nothing is overdue.`, actions: html`<a class="btn btn--primary btn--sm" href="#/queue">${icon('list', 16)}Open the work queue</a>` })}
      <div class="bo-kpis">
        ${kpi('Open cases', k.openCases, `${k.overdue} overdue · ${k.unassigned} unassigned`, k.overdue ? 'tomato' : 'mint', '/queue')}
        ${kpi('Users', fmt.number(k.users), `+${k.newUsers7} this week · ${k.activeToday} active today`, 'sky', '/users')}
        ${kpi('Live tasks', k.liveTasks, `${k.activeJobs} jobs in progress · ${k.posted7} posted this week`, 'sun', '/tasks')}
        ${kpi('Volume (demo)', fmt.money0(Math.round(k.gmv)), `Revenue ${fmt.money(k.revenue)}`, 'lavender', '/money')}
        ${kpi('Money held', fmt.money(k.reserved + k.onHold), `${fmt.money(k.onHold)} frozen by disputes`, 'bubble', '/money')}
        ${kpi('Accounts limited', k.restricted, 'Restricted, suspended or banned', 'lime', '/users?status=limited')}
      </div>
      <div class="bo-grid">
        <div class="bo-col">
          ${section('Needs a decision', byKind.length ? html`<ul class="bo-queue-sum">${byKind.map(({ kind, list }) => html`<li>
            <a href="#/queue?kind=${kind}" class="bo-queue-sum__link">${icon(KINDS[kind].icon, 18)}<span class="bo-queue-sum__label">${KINDS[kind].label}</span><span class="bo-queue-sum__n">${list.length}</span>${list.some((c) => c.overdue) ? html`<span class="badge badge--danger">${list.filter((c) => c.overdue).length} overdue</span>` : ''}</a>
          </li>`)}</ul>` : html`<p class="bo-empty">All queues are empty.</p>`, { actions: html`<a href="#/queue">All cases</a>` })}
          ${section('Most pressing', table({
            label: 'Most pressing cases', dense: true,
            cols: [{ label: 'Case' }, { label: 'Priority' }, { label: 'Target' }, { label: 'Owner' }],
            rows: cases.slice(0, 6).map((c) => [html`<a href="#${c.href}"><strong>${KINDS[c.kind].one}:</strong> ${c.title}</a><span class="bo-cell-sub">${c.sub}</span>`, priorityBadge(c.priority), dueText(c), staffChip(c.assigneeId)]),
            empty: 'No open cases.',
          }))}
          ${section('Activity in the last 14 days', html`${bars(eventsPerDay(14, (e) => e.actorKind === 'user'), { label: 'Actions by app users per day, last 14 days' })}<p class="bo-fine">Actions by app users per day (sign-ups, posts, applications, messages, reviews…). ${k.events24} entries in the last 24 hours.</p>`)}
        </div>
        <div class="bo-col">
          ${section('Live activity', timeline(recent, { limit: 14 }), { actions: html`<a href="#/activity">Full log</a>` })}
          ${section('Marketplace health', html`<dl class="bo-kv">
            <div class="bo-kv__row"><dt>Clients · taskers · businesses</dt><dd>${k.clients} · ${k.taskers} · ${k.businesses}</dd></div>
            <div class="bo-kv__row"><dt>Job completion rate</dt><dd>${k.completionRate == null ? '—' : `${k.completionRate}%`}</dd></div>
            <div class="bo-kv__row"><dt>Payouts waiting · on hold</dt><dd>${k.payoutsWaiting} · ${k.payoutsHeld}</dd></div>
            <div class="bo-kv__row"><dt>Refunded (demo)</dt><dd>${fmt.money(k.refunded)}</dd></div>
          </dl>`)}
        </div>
      </div>`;
  },
};

export const actions = {
  'bo-signin'(el) {
    const res = staffSignIn(el.dataset.id);
    if (!res.ok) { toast(res.message, 'danger'); return; }
    toast('Signed in to the backoffice.', 'success');
    go('/');
  },
};
