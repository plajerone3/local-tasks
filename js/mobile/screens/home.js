// Home screens. Client: search pill, colourful service tiles, tasks in progress.
// Tasker: map-first home with an "available" switch and a bottom sheet of tasks that fit.
import { html, raw } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { ui, setUi } from '../../ui/state.js';
import { tasksByClient, activeApplicationsForTask, assignmentsForUser, taskById, userById, taskers, isBlocked, publicReviewsAbout, transactionsOf, connectionsOfTasker, businessOf, unreadNotifications, firstName, visibleTasks, myApplication, policyOf, me } from '../../select.js';
import { CATEGORIES, category } from '../../data/categories.js';
import { district, city, distanceKm, distanceLabel } from '../../data/geo.js';
import { fmt } from '../../i18n.js';
import { walletSummary } from '../../logic/money.js';
import { summarize } from '../../logic/reputation.js';
import { statusBadge } from '../../ui/components.js';
import { recommendedTasks, fitFor } from '../../views/common.js';
import { setAvailableNow } from '../../services/accounts.js';
import { cityMap } from '../map.js';
import { screen, section, catBadge, mAvatar, catColor, emptyM } from '../ui.js';
import { initials } from '../../util.js';
import { toast } from '../../ui/dialog.js';

const ACTIVE = ['open', 'under_review', 'assigned', 'in_progress', 'awaiting_confirmation', 'disputed'];
const SAFE_CARDS = [
  ['tomato', '📍', 'Your address stays private', 'Taskers see the district until you accept someone.'],
  ['sky', '🔒', 'Contact details hidden', 'Phone numbers and emails are masked in chat.'],
  ['lavender', '⏸️', 'Disputes pause payments', 'Nobody gets a bad mark automatically.'],
];

function bell(user) {
  const n = unreadNotifications(user.id);
  return html`<a class="m-iconbtn m-iconbtn--solid" href="#/notifications" aria-label="Notifications${n ? `, ${n} unread` : ''}">${icon('bell', 20)}${n ? html`<span class="m-dot" aria-hidden="true">${n > 9 ? '9+' : n}</span>` : ''}</a>`;
}

export function taskRow(task, { viewer, fit, showFit = true } = {}) {
  const km = viewer?.locationArea?.city === task.locationArea.city ? distanceKm(viewer.locationArea, task.locationArea) : null;
  return html`<li><a class="m-trow" href="#/task/${task.id}">
    ${catBadge(task.category)}
    <span class="m-trow__text">
      <span class="m-trow__title">${task.title}</span>
      <span class="m-trow__sub">${fmt.date(task.date)} · ${fmt.window(task.timeWindow)} · ${district(task.locationArea)?.label}${km != null ? ` · ${distanceLabel(km).replace(' away', '')}` : ''}</span>
      ${fit && showFit && fit.level !== 'low' ? html`<span class="m-trow__fit c-${fit.level === 'strong' ? 'mint' : fit.level === 'good' ? 'sky' : 'stone'}">${fit.label}</span>` : ''}
    </span>
    <span class="m-trow__price">${fmt.range(task.budgetMin, task.budgetMax)}</span>
  </a></li>`;
}

function clientHome(ctx) {
  const user = ctx.user;
  const d = user.locationArea ? district(user.locationArea) : null;
  const tasks = tasksByClient(user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = tasks.filter((x) => ACTIVE.includes(x.status));
  const asgs = assignmentsForUser(user.id).filter((a) => taskById(a.taskId).clientId === user.id);
  const confirm = asgs.filter((a) => a.status === 'awaiting_confirmation');
  const offers = active.filter((x) => x.status === 'open' && activeApplicationsForTask(x.id).some((a) => ['applied', 'shortlisted'].includes(a.status)));
  const past = tasks.filter((x) => x.status === 'completed').slice(0, 3);
  const nearby = taskers().filter(({ user: u }) => u.id !== user.id && u.locationArea?.city === user.locationArea?.city && !isBlocked(user.id, u.id));
  const tiles = CATEGORIES.filter((c) => policyOf(c.id) === 'open');

  const content = html`<div class="m-pad">
    <div class="m-hello">
      <span class="m-loc">${icon('pin', 16)}${d ? `${d.label}, ${city(user.locationArea.city).label}` : 'Set your area'}</span>
      ${bell(user)}
    </div>
    <h1 class="m-h1" tabindex="-1">What needs doing, ${firstName(user)}?</h1>
    <a class="m-search" href="#/post">${icon('search', 22)}<span class="m-search__text">Describe a task</span><span class="m-search__when">${icon('clock', 16)}This week</span></a>

    ${confirm.map((a) => html`<a class="m-alert c-sun" href="#/job/${a.id}"><span class="m-alert__emoji" aria-hidden="true">✅</span><span><strong>${firstName(userById(a.taskerId))} says it’s done</strong><span>Check “${taskById(a.taskId).title}” and confirm</span></span>${icon('chevron', 18)}</a>`)}
    ${offers.map((x) => html`<a class="m-alert c-bubble" href="#/task/${x.id}/offers"><span class="m-alert__emoji" aria-hidden="true">🙋</span><span><strong>${activeApplicationsForTask(x.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length} offers waiting</strong><span>${x.title}</span></span>${icon('chevron', 18)}</a>`)}

    ${section('Suggestions', html`<ul class="m-tiles">${tiles.map((c) => html`<li><a class="m-tile c-${catColor(c.id)}" href="#/post?cat=${c.id}"><span class="m-tile__emoji" aria-hidden="true">${c.emoji}</span><span class="m-tile__label">${c.label.replace(' & care', '').replace(' & delivery', '')}</span></a></li>`)}</ul>`, { more: { href: '/post', label: 'All' }, id: 'h-sugg' })}

    ${active.length ? section('Your tasks', html`<ul class="m-hscroll">${active.map((x) => {
      const asg = asgs.find((a) => a.taskId === x.id && a.status !== 'cancelled');
      const apps = activeApplicationsForTask(x.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length;
      return html`<li><a class="m-tcard" href="#${asg ? `/job/${asg.id}` : `/task/${x.id}`}">
        <span class="m-tcard__band c-${catColor(x.category)}">${catBadge(x.category, 'sm')}<span>${category(x.category).label}</span></span>
        <span class="m-tcard__title">${x.title}</span>
        <span class="m-tcard__meta">${fmt.date(x.date)} · ${fmt.range(x.budgetMin, x.budgetMax)}</span>
        <span class="m-tcard__foot">${statusBadge('task', x.status)}${x.status === 'open' ? html`<span class="m-muted">${apps} ${apps === 1 ? 'offer' : 'offers'}</span>` : ''}</span>
      </a></li>`;
    })}</ul>`, { more: { href: '/activity' }, id: 'h-tasks' }) : ''}

    ${user.locationArea ? html`<section class="m-promo c-lime" aria-labelledby="h-near">
      <div class="m-promo__text"><h2 class="m-h3" id="h-near">${nearby.length} taskers in ${city(user.locationArea.city).label}</h2><p>Post a task and invite the ones that fit. Every suggestion says why.</p><a class="m-btn m-btn--primary m-btn--sm" href="#/post">Post a task</a></div>
      <div class="m-promo__map">${raw(cityMap({ cityId: user.locationArea.city, you: user.locationArea, center: user.locationArea, title: false, people: nearby.slice(0, 8).map(({ user: u }) => ({ area: u.locationArea, color: u.avatar.color, initials: initials(u.name) })) }))}</div>
    </section>` : ''}

    ${past.length ? section('Book again', html`<ul class="m-list">${past.map((x) => html`<li><a class="m-row" href="#/post?again=${x.id}"><span class="m-row__lead">${catBadge(x.category)}</span><span class="m-row__text"><span class="m-row__title">${x.title}</span><span class="m-row__sub">Last time ${fmt.range(x.budgetMin, x.budgetMax)}</span></span><span class="m-row__trail">${icon('refresh', 18)}</span></a></li>`)}</ul>`, { id: 'h-again' }) : ''}

    ${section('Built for safety', html`<ul class="m-hscroll m-hscroll--small">${SAFE_CARDS.map(([c, e, title, body]) => html`<li><a class="m-safe c-${c}" href="#/safety"><span class="m-safe__emoji" aria-hidden="true">${e}</span><strong>${title}</strong><span>${body}</span></a></li>`)}</ul>`, { id: 'h-safe' })}
  </div>`;
  return screen({ ctx, content });
}

function taskerHome(ctx) {
  const user = ctx.user;
  const online = user.availableNow !== false;
  const recs = recommendedTasks(user, 8);
  const w = walletSummary(transactionsOf(user.id).filter((x) => x.type === 'earning'));
  const asg = assignmentsForUser(user.id).find((a) => a.taskerId === user.id && ['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(a.status));
  const reqs = connectionsOfTasker(user.id).filter((c) => c.status === 'pending');
  const rep = summarize(publicReviewsAbout(user.id));
  const cityId = user.locationArea?.city || 'vienna';
  const pins = online ? recs.filter((r) => r.task.locationArea.city === cityId).map((r) => ({ href: `/task/${r.task.id}`, label: `${r.task.title}, ${fmt.range(r.task.budgetMin, r.task.budgetMax)}`, area: r.task.locationArea, category: r.task.category, price: fmt.money0(r.task.budgetMax) })) : [];

  const content = html`
    <div class="m-maphero">
      ${raw(cityMap({ cityId, pins, you: user.locationArea }))}
      <div class="m-mapbar">
        <a class="m-fab" href="#/account" aria-label="Account">${mAvatar(user, 'sm')}</a>
        <a class="m-earn" href="#/wallet"><span class="m-earn__value">${fmt.money(w.available)}</span><span class="m-earn__label">demo earnings</span></a>
        ${bell(user)}
      </div>
    </div>
    <section class="m-sheet" aria-labelledby="m-sheet-title">
      <span class="m-sheet__handle" aria-hidden="true"></span>
      <button type="button" class="m-online${online ? ' is-on' : ''}" data-action="m-toggle-online" aria-pressed="${online}">
        <span class="m-online__text"><strong>${online ? 'You’re available' : 'You’re offline'}</strong><span>${online ? 'New tasks near you appear on the map' : 'Switch on to see tasks that fit you'}</span></span>
        <span class="m-switch" aria-hidden="true"><span class="m-switch__knob"></span></span>
      </button>
      ${asg ? html`<a class="m-alert c-${{ accepted: 'sky', in_progress: 'sun', awaiting_confirmation: 'bubble', disputed: 'tomato' }[asg.status]}" href="#/job/${asg.id}"><span class="m-alert__emoji" aria-hidden="true">${category(taskById(asg.taskId).category).emoji}</span><span><strong>${asg.status === 'in_progress' ? 'Job in progress' : asg.status === 'accepted' ? 'You’re booked' : asg.status === 'disputed' ? 'Dispute open' : 'Waiting for the client'}</strong><span>${taskById(asg.taskId).title}</span></span>${icon('chevron', 18)}</a>` : ''}
      ${reqs.map((c) => html`<a class="m-alert c-lavender" href="#/recruiting"><span class="m-alert__emoji" aria-hidden="true">💼</span><span><strong>${businessOf(c.businessId).companyName}</strong><span>would like to talk about stable work</span></span>${icon('chevron', 18)}</a>`)}
      <div class="m-stats">
        <span class="m-stat c-sun"><strong>${rep.count ? fmt.rating(rep.avg) : 'New'}</strong><span>${rep.count ? `${rep.count} reviews` : 'no reviews yet'}</span></span>
        <span class="m-stat c-sky"><strong>${fmt.money0(Math.round(w.pending + w.onHold))}</strong><span>pending (demo)</span></span>
        <span class="m-stat c-bubble"><strong>${recs.length}</strong><span>tasks that fit</span></span>
      </div>
      <div class="m-section__head"><h2 class="m-h3" id="m-sheet-title" tabindex="-1">Tasks for you</h2><a class="m-more" href="#/work">See all${icon('chevron', 16)}</a></div>
      ${!online ? emptyM({ emoji: '😴', title: 'You’re offline', body: 'Switch on above when you have time for a task.', color: 'lavender' })
        : recs.length ? html`<ul class="m-tlist">${recs.map((r) => taskRow(r.task, { viewer: user, fit: r.fit }))}</ul>`
          : emptyM({ emoji: '🧭', title: 'Nothing close right now', body: 'Try “See all” or add a category in your profile.', color: 'sky' })}
      <p class="m-fine">${raw('Suggestions use your categories, availability, area and reviews on similar work. Nobody can pay to rank higher.')}</p>
    </section>`;
  return screen({ ctx, content, cls: 'm-screen--map' });
}

export const home = {
  title: () => 'Home',
  render(ctx) {
    return ctx.role === 'tasker' ? taskerHome(ctx) : clientHome(ctx);
  },
};

const SORTS = [['fit', 'Best fit'], ['near', 'Nearest'], ['soon', 'Soonest'], ['pay', 'Highest pay']];

export const work = {
  title: () => 'Find work',
  render(ctx) {
    const user = ctx.user;
    const cat = ui.mWorkCat || '';
    const sort = ui.mWorkSort || 'fit';
    let list = visibleTasks(user)
      .filter((x) => x.status === 'open' && x.clientId !== user.id && !x.hidden && !myApplication(x.id, user.id) && (!cat || x.category === cat))
      .map((task) => ({ task, fit: fitFor(task, user), km: user.locationArea?.city === task.locationArea.city ? distanceKm(user.locationArea, task.locationArea) : 999 }));
    const by = { fit: (a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0), near: (a, b) => a.km - b.km, soon: (a, b) => a.task.date.localeCompare(b.task.date), pay: (a, b) => b.task.budgetMax - a.task.budgetMax };
    list = list.sort(by[sort]);
    const content = html`<div class="m-pad">
      <div class="m-chips-scroll" role="group" aria-label="Category">
        <button type="button" class="m-fchip${!cat ? ' is-on' : ''}" data-action="m-work-cat" data-cat="" aria-pressed="${!cat}">All</button>
        ${CATEGORIES.filter((c) => policyOf(c.id) !== 'soon').map((c) => html`<button type="button" class="m-fchip c-${catColor(c.id)}${cat === c.id ? ' is-on' : ''}" data-action="m-work-cat" data-cat="${c.id}" aria-pressed="${cat === c.id}"><span aria-hidden="true">${c.emoji}</span>${c.label}</button>`)}
      </div>
      <div class="m-chips-scroll" role="group" aria-label="Sort by">${SORTS.map(([id, label]) => html`<button type="button" class="m-fchip m-fchip--sort${sort === id ? ' is-on' : ''}" data-action="m-work-sort" data-sort="${id}" aria-pressed="${sort === id}">${label}</button>`)}</div>
      <p class="m-count">${list.length} open ${list.length === 1 ? 'task' : 'tasks'}</p>
      ${list.length ? html`<ul class="m-tlist">${list.map((x) => taskRow(x.task, { viewer: user, fit: x.fit }))}</ul>` : emptyM({ emoji: '🔍', title: 'No open tasks here', body: 'Try another category.', color: 'sky' })}
    </div>`;
    return screen({ ctx, top: html`<header class="m-top"><a class="m-iconbtn" href="#/home" aria-label="Back">${icon('back', 22)}</a><h1 class="m-top__title" tabindex="-1">Find work</h1><span class="m-top__actions"></span></header>`, content });
  },
};

export const actions = {
  'm-toggle-online'() {
    const u = me();
    const on = u.availableNow === false;
    setAvailableNow(u.id, on);
    toast(on ? 'You’re available. Tasks that fit you are on the map.' : 'You’re offline. Nothing changes for tasks you already have.', 'info');
  },
  'm-work-cat'(el) { setUi({ mWorkCat: el.dataset.cat }); },
  'm-work-sort'(el) { setUi({ mWorkSort: el.dataset.sort }); },
};

