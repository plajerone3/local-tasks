// Task sheet over a zoomed map, the apply sheet, and "Choose your tasker" (offers).
import { html, raw } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { ui, setUi, errorsFor, setErrors, clearErrors } from '../../ui/state.js';
import { statusBadge, proofBadge, textarea, input, errorSummary } from '../../ui/components.js';
import { taskById, userById, me, myApplication, assignmentForTask, policyOf, activeApplicationsForTask, applicationById, taskerProfileOf, clientSummary, publicReviewsAbout, visibleProofs, firstName, publicName, isBlocked, taskers } from '../../select.js';
import { category, catLabel, catWord } from '../../data/categories.js';
import { district, cityName, distanceKm, distanceLabel } from '../../data/geo.js';
import { fmt, tr, trn } from '../../i18n.js';
import { APP } from '../../config.js';
import { breakdown, impliedHourly, pct } from '../../logic/money.js';
import { maskContacts, suggestsOffPlatform } from '../../logic/privacy.js';
import { summarize } from '../../logic/reputation.js';
import { taskFit } from '../../logic/matching.js';
import { applyToTask, withdrawApplication, acceptApplication, inviteTasker, cancelTask, suggestedPrice } from '../../services/marketplace.js';
import { ensureTaskConversation } from '../../services/messaging.js';
import { fitFor, reportButton, blockButton } from '../../views/common.js';
import { cityMap } from '../map.js';
import { screen, catColor, chip, mAvatar, stars, emptyM, PALETTE } from '../ui.js';
import { openDialog, closeDialogs, toast, confirmDialog } from '../../ui/dialog.js';
import { go } from '../../router.js';

const LEVEL_COLOR = { strong: 'mint', good: 'sky', possible: 'sun', low: 'stone' };

function backFor(ctx, task) {
  if (ctx.user?.id === task.clientId) return '/activity';
  return ctx.role === 'tasker' ? '/home' : '/home';
}

function applySheet(task, v = {}) {
  const e = errorsFor('m-apply');
  const price = v.proposedRate ?? suggestedPrice(task);
  return html`<form data-form="m-apply" data-task="${task.id}" novalidate class="m-stack">
    ${errorSummary(e, 'ma')}
    <div class="m-bigprice c-${catColor(task.category)}"><span class="m-bigprice__label">${tr('You would receive')}</span><span class="m-bigprice__value" data-earn>${fmt.money(breakdown(Number(price) || 0).taskerNet)}</span><span class="m-small">${tr('after the {fee} platform fee (demo)', { fee: pct(APP.fees.taskerPlatformRate) })}</span></div>
    ${input({ id: 'ma-proposedRate', name: 'proposedRate', label: tr('Your price for the whole task (€)'), type: 'number', value: price, inputmode: 'decimal', error: e.proposedRate, hint: tr('Budget {budget}', { budget: fmt.range(task.budgetMin, task.budgetMax) }), extra: { 'data-input': 'm-apply-price' } })}
    ${textarea({ id: 'ma-note', name: 'note', label: tr('Note to the client'), value: v.note || '', rows: 3, error: e.note, hint: tr('Why you’re a good fit, what you’d bring.') })}
    ${input({ id: 'ma-availability', name: 'availability', label: tr('When can you do it?'), value: v.availability || tr('{date}, {time} works for me', { date: fmt.date(task.date), time: fmt.window(task.timeWindow) }), error: e.availability })}
    <button class="m-btn m-btn--primary m-btn--block m-btn--lg" type="submit">${icon('send', 18)}${tr('Send offer')}</button>
    <p class="m-fine">${tr('The client sees your note, price, profile and reviews. Your contact details stay hidden.')}</p>
  </form>`;
}

export const detail = {
  title: (ctx) => taskById(ctx.params.id)?.title || tr('Task'),
  render(ctx) {
    const task = taskById(ctx.params.id);
    const user = ctx.user;
    if (!task || (task.hidden && task.clientId !== user.id) || isBlocked(user.id, task.clientId)) {
      return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: '🫥', title: tr('This task isn’t available'), body: tr('It may have been removed or hidden after a report.'), action: html`<a class="m-btn m-btn--primary" href="#/home">${tr('Back home')}</a>` })}</div>` });
    }
    const cat = category(task.category);
    const color = catColor(task.category);
    const isOwner = user.id === task.clientId;
    const client = userById(task.clientId);
    const cs = clientSummary(client.id);
    const app = myApplication(task.id, user.id);
    const asg = assignmentForTask(task.id);
    const offers = activeApplicationsForTask(task.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length;
    const fit = ctx.role === 'tasker' && !isOwner ? fitFor(task, user) : null;
    const km = user.locationArea?.city === task.locationArea.city ? distanceKm(user.locationArea, task.locationArea) : null;
    const hourly = impliedHourly(task.budgetMax, task.estimatedHours);
    const desc = isOwner ? { text: task.description, masked: false } : maskContacts(task.description);

    let footer;
    if (isOwner) {
      if (task.status === 'open') footer = html`<a class="m-btn m-btn--primary m-btn--block m-btn--lg" href="#/task/${task.id}/offers">${offers ? trn(offers, 'See {n} offer', 'See {n} offers') : tr('Find a tasker')}${icon('chevron', 18)}</a>`;
      else if (asg && asg.status !== 'cancelled') footer = html`<a class="m-btn m-btn--primary m-btn--block m-btn--lg" href="#/job/${asg.id}">${tr('Track the job')}${icon('chevron', 18)}</a>`;
      else if (task.status === 'under_review') footer = html`<p class="m-footnote">${icon('shield', 16)}${tr('A moderator checks this task before it goes live.')}</p>`;
    } else if (ctx.role === 'tasker') {
      if (app) {
        const mine = asg && asg.taskerId === user.id && asg.status !== 'cancelled';
        footer = mine ? html`<a class="m-btn m-btn--primary m-btn--block m-btn--lg" href="#/job/${asg.id}">${tr('Open your job')}${icon('chevron', 18)}</a>`
          : html`<div class="m-footer__split"><span class="m-footer__status">${statusBadge('application', app.status)}<span class="m-small">${tr('You offered {price}', { price: fmt.money(app.proposedRate) })}</span></span>${['applied', 'shortlisted'].includes(app.status) ? html`<button type="button" class="m-btn m-btn--ghost" data-action="m-withdraw" data-app="${app.id}">${tr('Withdraw')}</button>` : ''}</div>`;
      } else if (task.status === 'under_review') footer = html`<p class="m-footnote">${icon('shield', 16)}${tr('Offers open after a moderator approves this task.')}</p>`;
      else if (task.status !== 'open') footer = html`<p class="m-footnote">${tr('This task already has a tasker.')}</p>`;
      else if (policyOf(task.category) === 'review' && !taskerProfileOf(user.id)?.categories.includes(task.category)) footer = html`<p class="m-footnote">${icon('shield', 16)}${tr('Add {cat} and relevant proof to your profile in the web app before offering.', { cat: catWord(task.category) })}</p>`;
      else footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block m-btn--lg" data-action="m-apply-open" data-task="${task.id}">${tr('Make an offer · you get {amount}', { amount: fmt.money0(breakdown(suggestedPrice(task)).taskerNet) })}</button>`;
    } else if (user.roles.includes('tasker')) {
      footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block" data-action="m-switch-role" data-role="tasker">${tr('Switch to Tasker to make an offer')}</button>`;
    }

    const content = html`
      <div class="m-taskmap">${raw(cityMap({ cityId: task.locationArea.city, focus: task.locationArea, pins: [{ area: task.locationArea, category: task.category }] }))}
        <a class="m-fab m-fab--back" href="#${backFor(ctx, task)}" aria-label="${tr('Back')}">${icon('back', 22)}</a>
        <span class="m-maptag">${icon('pin', 14)}${district(task.locationArea).label} · ${tr('approximate area')}</span>
      </div>
      <article class="m-sheet m-sheet--task">
        <span class="m-sheet__handle" aria-hidden="true"></span>
        <div class="m-row-inline">${chip(`${cat.emoji} ${catLabel(task.category)}`, color)}${statusBadge('task', task.status)}</div>
        <h1 class="m-h2" tabindex="-1">${task.title}</h1>
        <p class="m-price">${fmt.range(task.budgetMin, task.budgetMax)}<span>${task.estimatedHours ? ` · ${tr('about {h} h', { h: fmt.number(task.estimatedHours) })}` : ''}${hourly ? ` · ${tr('up to {rate}/h', { rate: fmt.money0(Math.round(hourly)) })}` : ''}</span></p>
        ${suggestsOffPlatform(task.description) && !isOwner ? html`<p class="m-note c-tomato">${icon('alert', 16)}<span>${tr('This mentions another app or cash. Keep messages and payment here, and never send ID copies.')}</span></p>` : ''}
        <ul class="m-facts">
          <li>${icon('calendar', 18)}<span>${fmt.dateLong(task.date)}${task.recurring ? ` · ${task.recurring}` : ''}</span></li>
          <li>${icon('clock', 18)}<span>${fmt.window(task.timeWindow)}</span></li>
          <li>${icon('pin', 18)}<span>${district(task.locationArea).label}, ${cityName(task.locationArea.city)}${km != null ? ` · ${distanceLabel(km)}` : ''}</span></li>
        </ul>
        ${fit ? html`<div class="m-why c-${LEVEL_COLOR[fit.level]}"><strong>${fit.label}</strong><p>${fit.explanation}</p></div>` : ''}
        <h2 class="m-h4">${tr('About the task')}</h2>
        <p class="m-desc">${desc.text}</p>
        ${task.requirements.length ? html`<div class="m-chips-wrap">${task.requirements.map((r, i) => html`<span class="m-chip c-${PALETTE[(i + 3) % PALETTE.length]}">${r}</span>`)}</div>` : ''}
        <div class="m-card m-card--tint c-tomato-soft">
          <h2 class="m-h4">${icon('shield', 18)} ${tr('Safety')}</h2>
          ${task.safetyNotes ? html`<p class="m-small"><strong>${tr('From the client:')}</strong> ${task.safetyNotes}</p>` : ''}
          <p class="m-small">${tr('The exact address is shared only after someone is accepted. Leave any time you feel unsafe. In an emergency call 112.')}</p>
        </div>
        <a class="m-person" href="#/profile/${client.id}">${mAvatar(client)}<span><strong>${publicName(client)}</strong><span class="m-small">${trn(cs.posted, '{n} task posted', '{n} tasks posted')} · ${cs.reviewCount ? tr('{avg} ★ from taskers', { avg: fmt.rating(cs.avg) }) : tr('no ratings yet')}</span></span>${icon('chevron', 18)}</a>
        ${!isOwner ? html`<div class="m-links">${reportButton('task', task.id, { userId: client.id, cls: 'm-link' })}${blockButton(client.id, { cls: 'm-link' })}</div>` : ''}
      </article>`;
    return screen({ ctx, content, footer, tabs: false, cls: 'm-screen--task' });
  },
};

function offerRows(task) {
  const viewer = me();
  return activeApplicationsForTask(task.id).filter((a) => ['applied', 'shortlisted', 'accepted'].includes(a.status)).map((a) => {
    const tasker = userById(a.taskerId);
    const profile = taskerProfileOf(a.taskerId);
    const reviews = publicReviewsAbout(a.taskerId);
    const proofs = visibleProofs(a.taskerId, viewer);
    return { a, tasker, profile, proofs, rep: summarize(reviews), fit: taskFit({ task, tasker, profile, reviews, proofs, perspective: 'client' }) };
  });
}

const OFFER_SORTS = [['fit', 'Best fit'], ['price', 'Lowest price'], ['rating', 'Top rated']];

export const offers = {
  title: () => tr('Choose your tasker'),
  render(ctx) {
    const task = taskById(ctx.params.id);
    if (!task || task.clientId !== ctx.user.id) return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: '🔒', title: tr('Only the client can see offers') })}</div>` });
    const sort = ui.mOfferSort || 'fit';
    const list = offerRows(task);
    const by = { fit: (x, y) => y.fit.score - x.fit.score, price: (x, y) => x.a.proposedRate - y.a.proposedRate, rating: (x, y) => (y.rep.byCategory[task.category]?.avg ?? 0) - (x.rep.byCategory[task.category]?.avg ?? 0) };
    list.sort(by[sort]);
    const open = task.status === 'open';
    const picked = list.find((r) => r.a.id === ui.mPicked) || list[0];
    const asg = assignmentForTask(task.id);
    const suggested = open ? taskers()
      .filter(({ user: u }) => u.id !== ctx.user.id && !isBlocked(ctx.user.id, u.id) && !activeApplicationsForTask(task.id).some((a) => a.taskerId === u.id))
      .map(({ user: u }) => ({ u, fit: fitFor(task, u, 'client') })).filter((x) => x.fit && ['strong', 'good'].includes(x.fit.level))
      .sort((a, b) => b.fit.score - a.fit.score).slice(0, 3) : [];

    const content = html`<div class="m-pad">
      <p class="m-sub">${task.title} · ${fmt.range(task.budgetMin, task.budgetMax)}</p>
      ${list.length > 1 ? html`<div class="m-chips-row" role="group" aria-label="${tr('Sort offers')}">${OFFER_SORTS.map(([id, label]) => html`<button type="button" class="m-fchip m-fchip--sort${sort === id ? ' is-on' : ''}" data-action="m-offer-sort" data-sort="${id}" aria-pressed="${String(sort === id)}">${tr(label)}</button>`)}</div>` : ''}
      ${list.length ? html`<ul class="m-offers" role="list">${list.map((r, i) => {
        const sel = picked && r.a.id === picked.a.id;
        const b = breakdown(r.a.proposedRate);
        const catRep = r.rep.byCategory[task.category];
        const newcomer = (r.profile?.completedTaskCount || 0) < APP.newcomerThreshold;
        return html`<li class="m-offer${sel ? ' is-picked' : ''}">
          <button type="button" class="m-offer__main" data-action="m-pick-offer" data-app="${r.a.id}" aria-pressed="${String(!!sel)}" aria-label="${publicName(r.tasker)}, ${fmt.money(r.a.proposedRate)}, ${r.fit.label}">
            <span class="m-offer__av">${mAvatar(r.tasker, 'lg')}${i === 0 && sort === 'fit' && list.length > 1 ? html`<span class="m-offer__ribbon">${tr('Best fit')}</span>` : ''}</span>
            <span class="m-offer__text">
              <span class="m-offer__name">${publicName(r.tasker)} ${newcomer ? chip(tr('New'), 'bubble', 'sparkle') : ''}</span>
              <span class="m-small">${catRep ? tr('★ {avg} on {cat} ({n})', { avg: fmt.rating(catRep.avg), cat: catWord(task.category), n: catRep.count }) : stars(r.rep.avg, r.rep.count)}</span>
              <span class="m-small m-muted">${r.a.availability}</span>
            </span>
            <span class="m-offer__price"><strong>${fmt.money0(r.a.proposedRate)}</strong><span class="m-small">${tr('you pay {total}', { total: fmt.money(b.clientTotal) })}</span></span>
          </button>
          ${sel ? html`<div class="m-offer__more">
            <div class="m-why c-${LEVEL_COLOR[r.fit.level]}"><strong>${r.fit.label}</strong><p>${r.fit.explanation}</p></div>
            <blockquote class="m-quote">${r.a.note}</blockquote>
            ${r.proofs.length ? html`<ul class="m-proofs">${r.proofs.map((p) => html`<li><span>${p.label}</span>${proofBadge(p.status)}</li>`)}</ul>` : ''}
            <div class="m-row-inline">
              <button type="button" class="m-btn m-btn--soft m-btn--sm" data-action="m-message" data-task="${task.id}" data-user="${r.tasker.id}">${icon('message', 16)}${tr('Message')}</button>
              <a class="m-btn m-btn--soft m-btn--sm" href="#/profile/${r.tasker.id}">${icon('user', 16)}${tr('Profile')}</a>
              ${r.a.simulated ? chip(tr('Demo simulation'), 'lavender') : ''}
            </div>
          </div>` : ''}
        </li>`;
      })}</ul>` : emptyM({ emoji: '⏳', title: tr('No offers yet'), body: tr('Most tasks get a first offer within a day. You can invite people who fit below.'), color: 'sky' })}
      ${suggested.length ? html`<section class="m-section"><div class="m-section__head"><h2 class="m-h3">${tr('Invite people who fit')}</h2></div>
        <ul class="m-list m-list--card">${suggested.map(({ u, fit }) => html`<li><div class="m-row">
          <span class="m-row__lead">${mAvatar(u)}</span>
          <span class="m-row__text"><span class="m-row__title">${publicName(u)} ${chip(fit.label, LEVEL_COLOR[fit.level])}</span><span class="m-row__sub">${fit.explanation}</span></span>
          <span class="m-row__trail">${task.invitedIds.includes(u.id) ? chip(tr('Invited'), 'mint', 'check') : html`<button type="button" class="m-btn m-btn--soft m-btn--sm" data-action="m-invite" data-task="${task.id}" data-user="${u.id}">${tr('Invite')}</button>`}</span>
        </div></li>`)}</ul>
        <p class="m-fine">${APP.simulation ? tr('Demo: invited people may answer with an offer within a few seconds.') : ''}</p></section>` : ''}
    </div>`;
    let footer = '';
    if (open && picked) {
      const b = breakdown(picked.a.proposedRate);
      footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block m-btn--lg" data-action="m-accept" data-app="${picked.a.id}">${tr('Choose {name} · {total}', { name: firstName(picked.tasker), total: fmt.money(b.clientTotal) })}</button><p class="m-fine m-fine--center">${tr('Shown as reserved (demo). No real money moves.')}</p>`;
    } else if (asg && asg.status !== 'cancelled') {
      footer = html`<a class="m-btn m-btn--primary m-btn--block m-btn--lg" href="#/job/${asg.id}">${tr('Track the job')}${icon('chevron', 18)}</a>`;
    } else if (open) {
      footer = html`<button type="button" class="m-btn m-btn--ghost m-btn--block" data-action="m-cancel-task" data-task="${task.id}">${tr('Cancel this task')}</button>`;
    }
    const top = html`<header class="m-top"><a class="m-iconbtn" href="#/task/${task.id}" aria-label="${tr('Back to task')}">${icon('back', 22)}</a><h1 class="m-top__title" tabindex="-1">${tr('Choose your tasker')}</h1><span class="m-top__actions"></span></header>`;
    return screen({ ctx, top, content, footer, tabs: false });
  },
};

export const actions = {
  'm-apply-open'(el) {
    clearErrors('m-apply');
    openDialog({ title: tr('Make an offer'), body: applySheet(taskById(el.dataset.task)) });
  },
  async 'm-withdraw'(el) {
    const yes = await confirmDialog({ title: tr('Withdraw your offer?'), body: html`<p>${tr('The client won’t see it anymore. It doesn’t affect your profile.')}</p>`, confirmLabel: tr('Withdraw') });
    if (!yes) return;
    const res = withdrawApplication(el.dataset.app, me().id);
    toast(res.ok ? tr('Offer withdrawn.') : res.message, res.ok ? 'info' : 'danger');
  },
  'm-offer-sort'(el) { setUi({ mOfferSort: el.dataset.sort, mPicked: null }); },
  'm-pick-offer'(el) { setUi({ mPicked: el.dataset.app }); },
  async 'm-accept'(el) {
    const a = applicationById(el.dataset.app);
    const tasker = userById(a.taskerId);
    const b = breakdown(a.proposedRate);
    const yes = await confirmDialog({
      title: tr('Choose {name}?', { name: firstName(tasker) }),
      body: html`<p>${tr('You pay {total}: {price} plus a {fee} service fee. {name} receives {net}.', { total: fmt.money(b.clientTotal), price: fmt.money(b.price), fee: pct(APP.fees.clientServiceRate), name: firstName(tasker), net: fmt.money(b.taskerNet) })}</p><p class="m-small m-muted">${tr('Demo: the amount is only shown as reserved. Other people who offered are told the task is filled, with no mark on their profile.')}</p>`,
      confirmLabel: tr('Confirm'),
    });
    if (!yes) return;
    const res = acceptApplication(a.id, me().id);
    if (!res.ok) return toast(res.message, 'danger');
    setUi({ mPicked: null });
    toast(tr('{name} is booked!', { name: firstName(tasker) }));
    go(`/job/${res.assignmentId}`);
  },
  'm-invite'(el) {
    const res = inviteTasker(el.dataset.task, me().id, el.dataset.user);
    toast(res.ok ? tr('Invited {name}.', { name: firstName(userById(el.dataset.user)) }) : res.message, res.ok ? 'success' : 'danger');
  },
  'm-message'(el) {
    const res = ensureTaskConversation(el.dataset.task, el.dataset.user);
    if (res.ok) go(`/inbox/${res.id}`);
  },
  async 'm-cancel-task'(el) {
    const yes = await confirmDialog({ title: tr('Cancel this task?'), body: html`<p>${tr('Anyone who offered is told it was cancelled. It doesn’t affect anyone’s profile.')}</p>`, confirmLabel: tr('Cancel task'), cancelLabel: tr('Keep it'), tone: 'danger' });
    if (!yes) return;
    const res = cancelTask(el.dataset.task, me().id);
    toast(res.ok ? tr('Task cancelled.') : res.message, res.ok ? 'info' : 'danger');
    if (res.ok) go('/activity');
  },
};

export const forms = {
  'm-apply'(form, data) {
    const task = taskById(form.dataset.task);
    const v = { note: data.get('note') || '', proposedRate: data.get('proposedRate'), availability: data.get('availability') || '' };
    const res = applyToTask(task.id, me().id, v);
    if (!res.ok) {
      if (res.message) { closeDialogs(); return toast(res.message, 'danger'); }
      setErrors('m-apply', res.errors);
      const d = form.closest('dialog');
      d.querySelector('.dialog__body').innerHTML = String(applySheet(task, v));
      d.querySelector('#error-summary')?.focus();
      return;
    }
    clearErrors('m-apply');
    closeDialogs();
    toast(tr('Offer sent! You’ll get a notification when the client replies.'));
  },
};

export const inputs = {
  'm-apply-price'(el) {
    const out = document.querySelector('[data-earn]');
    const v = Number(String(el.value).replace(',', '.'));
    if (out) out.textContent = v > 0 ? fmt.money(breakdown(v).taskerNet) : '—';
  },
};

