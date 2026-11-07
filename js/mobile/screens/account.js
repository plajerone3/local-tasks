// Account, wallet, safety toolkit, recruiting requests and public profiles.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { proofBadge, statusBadge } from '../../ui/components.js';
import { me, userById, taskerProfileOf, businessOf, publicReviewsAbout, visibleProofs, publicName, transactionsOf, connectionsOfTasker, unreadMessages, clientSummary, taskById, isBlocked } from '../../select.js';
import { category } from '../../data/categories.js';
import { field as fieldById } from '../../data/fields.js';
import { district, city } from '../../data/geo.js';
import { fmt, t } from '../../i18n.js';
import { APP } from '../../config.js';
import { walletSummary, pct } from '../../logic/money.js';
import { summarize, reliability } from '../../logic/reputation.js';
import { respondConnection } from '../../services/recruiting.js';
import { setDiscoverability } from '../../services/accounts.js';
import { BUSINESS_CAN_SEE, BUSINESS_CANNOT_SEE } from '../../views/profile-forms.js';
import { reportButton, blockButton } from '../../views/common.js';
import { screen, topbar, section, row, chip, mAvatar, stars, emptyM, catColor, PALETTE } from '../ui.js';
import { openDialog, closeDialogs, toast, confirmDialog } from '../../ui/dialog.js';
import { go } from '../../router.js';

export const account = {
  title: () => 'Account',
  render(ctx) {
    const user = ctx.user;
    const rep = summarize(publicReviewsAbout(user.id));
    const both = user.roles.includes('client') && user.roles.includes('tasker');
    const other = ctx.role === 'tasker' ? 'client' : 'tasker';
    const reqs = user.roles.includes('tasker') ? connectionsOfTasker(user.id).filter((c) => c.status === 'pending').length : 0;
    const inbox = unreadMessages(user.id);
    const content = html`<div class="m-pad">
      <header class="m-acct">
        <div><h1 class="m-h1" tabindex="-1">${user.name}</h1>${rep.count ? chip(`★ ${fmt.rating(rep.avg)} · ${rep.count} reviews`, 'sun') : chip('New here', 'bubble', 'sparkle')}</div>
        ${mAvatar(user, 'xl')}
      </header>
      <ul class="m-qtiles">
        <li><a class="m-qtile c-tomato" href="#/safety">${icon('shield', 24)}<span>Safety</span></a></li>
        <li><a class="m-qtile c-mint" href="#/wallet">${icon('wallet', 24)}<span>${ctx.role === 'tasker' ? 'Earnings' : 'Wallet'}</span></a></li>
        <li><a class="m-qtile c-sky" href="#/inbox">${icon('message', 24)}<span>Inbox${inbox ? ` (${inbox})` : ''}</span></a></li>
      </ul>
      ${both ? html`<button type="button" class="m-banner c-lavender" data-action="m-switch-role" data-role="${other}"><span><strong>Switch to ${t(`role.${other}`)}</strong><span>${other === 'tasker' ? 'Find work and track your jobs' : 'Post tasks and hire help'}</span></span><span class="m-banner__emoji" aria-hidden="true">${other === 'tasker' ? '🧰' : '🏠'}</span></button>`
        : !user.roles.includes('tasker') ? html`<a class="m-banner c-lime" href="index.html#/onboarding/tasker"><span><strong>Earn as a tasker</strong><span>Turn your free hours into income. No degree needed.</span></span><span class="m-banner__emoji" aria-hidden="true">💸</span></a>` : ''}
      <ul class="m-list">
        ${user.roles.includes('tasker') ? row({ href: `/profile/${user.id}`, lead: html`<span class="m-ico c-sun">${icon('user', 18)}</span>`, title: 'My public profile', sub: 'What clients see' }) : ''}
        ${user.roles.includes('tasker') ? row({ href: '/recruiting', lead: html`<span class="m-ico c-lavender">${icon('briefcase', 18)}</span>`, title: 'Stable work', sub: user.discoverableToBusinesses ? 'Visible to businesses' : 'Not visible to businesses', trail: reqs ? html`<span class="m-unread">${reqs}</span>` : undefined }) : ''}
        ${row({ href: '/notifications', lead: html`<span class="m-ico c-bubble">${icon('bell', 18)}</span>`, title: 'Notifications' })}
        ${row({ href: '/safety', lead: html`<span class="m-ico c-tomato">${icon('shield', 18)}</span>`, title: 'Safety toolkit' })}
        <li><a class="m-row" href="index.html#/settings"><span class="m-row__lead"><span class="m-ico c-sky">${icon('sliders', 18)}</span></span><span class="m-row__text"><span class="m-row__title">Settings and privacy</span><span class="m-row__sub">Opens the web app</span></span><span class="m-row__trail">${icon('chevron', 18)}</span></a></li>
        <li><a class="m-row" href="index.html#/dashboard"><span class="m-row__lead"><span class="m-ico c-mint">${icon('home', 18)}</span></span><span class="m-row__text"><span class="m-row__title">Full web app</span><span class="m-row__sub">Same account, same data</span></span><span class="m-row__trail">${icon('chevron', 18)}</span></a></li>
      </ul>
      <h2 class="m-sheet-label">Demo</h2>
      <ul class="m-list">
        ${row({ action: 'm-open-accounts', lead: html`<span class="m-ico c-lime">${icon('users', 18)}</span>`, title: 'Switch demo account' })}
        ${row({ action: 'm-reset', lead: html`<span class="m-ico c-stone">${icon('refresh', 18)}</span>`, title: 'Reset demo data' })}
        ${row({ action: 'm-signout', lead: html`<span class="m-ico c-stone">${icon('logout', 18)}</span>`, title: 'Sign out', trail: '' })}
      </ul>
      <p class="m-fine">${APP.name} — working title · prototype · ${t('demo.wallet')}</p>
    </div>`;
    return screen({ ctx, content });
  },
};

export const wallet = {
  title: (ctx) => (ctx.role === 'tasker' ? 'Earnings' : 'Wallet'),
  render(ctx) {
    const asTasker = ctx.role === 'tasker';
    const txs = transactionsOf(ctx.user.id).filter((x) => x.type === (asTasker ? 'earning' : 'payment'));
    const s = walletSummary(txs);
    const content = html`<div class="m-pad m-stack">
      <section class="m-balance ${asTasker ? 'c-mint' : 'c-sky'}" aria-label="Demo balance">
        <span class="m-balance__label">${asTasker ? 'Demo balance' : 'Paid so far'}</span>
        <span class="m-balance__value">${fmt.money(asTasker ? s.available : s.paid)}</span>
        <span class="m-balance__note">${icon('lock', 14)}Demo money. Nothing can be withdrawn.</span>
      </section>
      <div class="m-stats">
        <span class="m-stat c-sun"><strong>${fmt.money0(Math.round(s.pending))}</strong><span>${asTasker ? 'pending' : 'reserved'}</span></span>
        <span class="m-stat c-tomato"><strong>${fmt.money0(Math.round(s.onHold))}</strong><span>on hold</span></span>
        <span class="m-stat c-lavender"><strong>${fmt.money0(Math.round(s.fees))}</strong><span>fees (${pct(asTasker ? APP.fees.taskerPlatformRate : APP.fees.clientServiceRate)})</span></span>
      </div>
      <button type="button" class="m-btn m-btn--soft m-btn--block" disabled aria-describedby="m-payout-note">${asTasker ? 'Cash out' : 'Add a card'} · coming later</button>
      <p class="m-fine" id="m-payout-note">Real payouts need a licensed payment provider and identity checks. Not part of the prototype.</p>
      ${section('Transactions', txs.length ? html`<ul class="m-list">${txs.map((x, i) => {
        const task = x.relatedTaskId && taskById(x.relatedTaskId);
        const net = asTasker ? x.amount - x.fee : x.amount + x.fee;
        const inner = html`<span class="m-row__lead"><span class="m-ico c-${task ? catColor(task.category) : PALETTE[i % PALETTE.length]}" aria-hidden="true">${task ? category(task.category).emoji : '€'}</span></span>
          <span class="m-row__text"><span class="m-row__title">${x.label.replace(/^(Earning for|Payment for|Pending for|Reserved for|On hold:|Refunded:|Earlier task:)\s*/, '')}</span><span class="m-row__sub">${fmt.day(x.createdAt)} · ${statusBadge('tx', x.status)}</span></span>
          <span class="m-row__trail m-amount">${asTasker ? '+' : '−'}${fmt.money(net)}</span>`;
        return task ? html`<li><a class="m-row" href="#/task/${task.id}">${inner}</a></li>` : html`<li><div class="m-row">${inner}</div></li>`;
      })}</ul>` : emptyM({ emoji: '🪙', title: 'No transactions yet', color: 'mint' }))}
    </div>`;
    return screen({ ctx, top: topbar({ title: asTasker ? 'Earnings' : 'Wallet', large: true }), content });
  },
};

const NUMBERS = [['112', 'EU emergency', 'tomato'], ['133', 'Police', 'sky'], ['144', 'Ambulance', 'bubble'], ['122', 'Fire', 'sun'], ['142', 'Emotional support', 'lavender']];

export const safety = {
  title: () => 'Safety toolkit',
  render(ctx) {
    const content = html`<div class="m-pad m-stack">
      <a class="m-sos" href="tel:112"><span class="m-sos__icon" aria-hidden="true">${icon('phone', 26)}</span><span><strong>Call 112</strong><span>Emergency? Call first, report later.</span></span></a>
      <ul class="m-numbers">${NUMBERS.slice(1).map(([n, label, c]) => html`<li><a class="m-number c-${c}" href="tel:${n}"><strong>${n}</strong><span>${label}</span></a></li>`)}</ul>
      <ul class="m-list">
        ${ctx.user ? html`<li>${reportButton('other', 'general', { label: 'Report a problem', cls: 'm-row m-row--btn' })}</li>` : ''}
        ${row({ href: '/activity', lead: html`<span class="m-ico c-lavender">${icon('pause', 18)}</span>`, title: 'Open a dispute', sub: 'From a job: “Report a problem” pauses payment and reviews' })}
        <li><a class="m-row" href="index.html#/safety"><span class="m-row__lead"><span class="m-ico c-sky">${icon('shield', 18)}</span></span><span class="m-row__text"><span class="m-row__title">Safety center</span><span class="m-row__sub">Blocked people, your reports, category rules</span></span><span class="m-row__trail">${icon('chevron', 18)}</span></a></li>
      </ul>
      ${section('Before you meet', html`<ul class="m-tips">${[
        ['mint', 'Keep messages and payment in the app.'],
        ['sun', 'Never send ID copies, bank details or money to get a task.'],
        ['sky', 'Tell someone where you are going.'],
        ['bubble', 'Trust your instincts. You can always leave.'],
      ].map(([c, text]) => html`<li class="m-tip c-${c}">${icon('check', 16)}<span>${text}</span></li>`)}</ul>`)}
      <p class="m-fine">The prototype does not do background, identity, licence or insurance checks.</p>
    </div>`;
    return screen({ ctx, top: topbar({ title: 'Safety', back: ctx.user ? '/account' : '/', large: true }), content, tabs: !!ctx.user });
  },
};

function consentSheet() {
  return html`<div class="m-stack">
    <p>Businesses that agreed to the recruiting rules can then find you for stable work.</p>
    <div class="m-card m-card--tint c-mint-soft"><h3 class="m-h4">They can see</h3><ul class="m-checks">${BUSINESS_CAN_SEE.map((x) => html`<li>${icon('check', 14)}<span>${x}</span></li>`)}</ul></div>
    <div class="m-card m-card--tint c-tomato-soft"><h3 class="m-h4">They can’t see</h3><ul class="m-checks">${BUSINESS_CANNOT_SEE.map((x) => html`<li>${icon('x', 14)}<span>${x}</span></li>`)}</ul></div>
    <p class="m-small">You can switch this off any time. Being visible doesn’t guarantee contact or a job.</p>
    <button type="button" class="m-btn m-btn--primary m-btn--block" data-action="m-visible" data-on="1">I understand, make me visible</button>
  </div>`;
}

export const recruiting = {
  title: () => 'Stable work',
  render(ctx) {
    const user = ctx.user;
    const list = connectionsOfTasker(user.id);
    const p = taskerProfileOf(user.id);
    const content = html`<div class="m-pad m-stack">
      <button type="button" class="m-online${user.discoverableToBusinesses ? ' is-on' : ''}" data-action="m-visible" data-on="${user.discoverableToBusinesses ? '' : '1'}" aria-pressed="${user.discoverableToBusinesses}">
        <span class="m-online__text"><strong>${user.discoverableToBusinesses ? 'Visible to businesses' : 'Not visible to businesses'}</strong><span>${user.discoverableToBusinesses ? `Fields: ${(p.employmentGoal.fields || []).map((f) => fieldById(f)?.short).join(', ') || 'any'}` : 'Switch on if you’re open to a stable job'}</span></span>
        <span class="m-switch" aria-hidden="true"><span class="m-switch__knob"></span></span>
      </button>
      ${list.length ? html`<ul class="m-reqs">${list.map((c, i) => {
        const biz = businessOf(c.businessId);
        const bu = userById(c.businessId);
        return html`<li class="m-req c-${['lavender', 'sky', 'sun', 'mint'][i % 4]}">
          <div class="m-req__head">${mAvatar(bu)}<span><strong>${biz.companyName}</strong><span class="m-small">${fieldById(biz.field)?.label} · ${biz.size} people · ${city(biz.locationArea.city).label}</span></span></div>
          <div class="m-row-inline">${statusBadge('connection', c.status)}${chip('Business details pending review', 'stone', 'shield')}</div>
          <blockquote class="m-quote">${c.message}</blockquote>
          ${c.status === 'pending' ? html`<div class="m-two"><button type="button" class="m-btn m-btn--primary" data-action="m-conn" data-id="${c.id}" data-accept="1">Accept and chat</button><button type="button" class="m-btn m-btn--soft" data-action="m-conn" data-id="${c.id}" data-accept="">Decline</button></div><p class="m-fine">Accepting opens a chat. It isn’t an interview or a job offer.</p>`
            : c.conversationId ? html`<a class="m-btn m-btn--soft m-btn--block" href="#/inbox/${c.conversationId}">${icon('message', 16)}Open chat</a>` : ''}
        </li>`;
      })}</ul>` : emptyM({ emoji: '💼', title: 'No requests yet', body: user.discoverableToBusinesses ? 'Businesses in your fields can find you now.' : 'Switch on visibility above to receive requests.', color: 'lavender' })}
    </div>`;
    return screen({ ctx, top: topbar({ title: 'Stable work', back: '/account', large: true }), content });
  },
};

export const profile = {
  title: (ctx) => publicName(userById(ctx.params.id)),
  render(ctx) {
    const u = userById(ctx.params.id);
    if (!u || (u.id !== ctx.user.id && isBlocked(ctx.user.id, u.id))) return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: '🫥', title: 'Profile not available' })}</div>` });
    const p = taskerProfileOf(u.id);
    const reviews = publicReviewsAbout(u.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const rep = summarize(reviews);
    const color = p?.categories?.length ? catColor(p.categories[0]) : 'sun';
    const isSelf = u.id === ctx.user.id;
    const rel = p && reliability(p);
    const cs = clientSummary(u.id);
    const content = html`
      <section class="m-profile-hero c-${color}">
        ${mAvatar(u, 'xl')}
        <h1 class="m-h1" tabindex="-1">${isSelf ? u.name : publicName(u)}</h1>
        <p>${p ? p.headline : `Client · ${cs.posted} tasks posted`}</p>
        <div class="m-row-inline m-row-inline--center">${stars(rep.avg, rep.count)}${u.locationArea ? chip(`${district(u.locationArea)?.label}, ${city(u.locationArea.city).label}`, 'stone', 'pin') : ''}${p && p.completedTaskCount < APP.newcomerThreshold ? chip('New here', 'bubble', 'sparkle') : ''}</div>
      </section>
      <div class="m-pad m-stack">
        ${p ? html`<div class="m-stats">
          <span class="m-stat c-sun"><strong>${p.completedTaskCount}</strong><span>tasks done</span></span>
          <span class="m-stat c-mint"><strong>${rel ? `${Math.round(rel.rate * 100)}%` : '—'}</strong><span>${rel ? 'completed' : 'record after 5 tasks'}</span></span>
          <span class="m-stat c-sky"><strong>${fmt.money0(p.rateMin)}–${p.rateMax}</strong><span>€ per hour</span></span>
        </div>
        ${p.bio ? html`<p>${p.bio}</p>` : ''}
        <div class="m-chips-wrap">${p.categories.map((c) => html`<span class="m-chip c-${catColor(c)}">${category(c).emoji} ${category(c).label}</span>`)}</div>
        <div class="m-chips-wrap">${p.skills.map((s) => html`<span class="m-chip c-stone">${s}</span>`)}</div>
        ${visibleProofs(u.id, ctx.user).length ? section('Proof', html`<ul class="m-proofs">${visibleProofs(u.id, ctx.user).map((x) => html`<li><span>${x.label}</span>${proofBadge(x.status)}</li>`)}</ul>`) : ''}` : ''}
        ${section(`Reviews${rep.count ? ` · ${fmt.rating(rep.avg)} ★` : ''}`, reviews.length ? html`<ul class="m-reviews">${reviews.slice(0, 8).map((r, i) => html`<li class="m-review c-${PALETTE[i % PALETTE.length]}-soft">
          <span class="m-review__stars" aria-label="${r.stars} out of 5">${'★'.repeat(r.stars)}<span class="m-review__off">${'★'.repeat(5 - r.stars)}</span></span>
          <strong>${r.taskTitle}</strong>${r.comment ? html`<p>${r.comment}</p>` : ''}
          <span class="m-small m-muted">${publicName(userById(r.reviewerId))} · ${fmt.month(r.createdAt)}</span>
        </li>`)}</ul>` : emptyM({ emoji: '🌱', title: 'No reviews yet', body: 'Everyone starts here. New people get a fair start in recommendations.', color: 'mint' }))}
        ${!isSelf ? html`<div class="m-links">${reportButton('user', u.id, { userId: u.id, cls: 'm-link' })}${blockButton(u.id, { cls: 'm-link' })}</div>` : html`<a class="m-btn m-btn--soft m-btn--block" href="index.html#/profile/edit">Edit profile in the web app</a>`}
      </div>`;
    const top = html`<header class="m-top m-top--float"><a class="m-iconbtn m-iconbtn--solid" href="#/home" data-action="m-back" aria-label="Back">${icon('back', 22)}</a><span class="m-top__spacer"></span></header>`;
    return screen({ ctx, top, content, cls: 'm-screen--profile' });
  },
};

export const actions = {
  async 'm-visible'(el) {
    const u = me();
    if (el.dataset.on) {
      if (!el.closest('dialog')) return openDialog({ title: 'Be visible for stable work?', body: consentSheet() });
      setDiscoverability(u.id, true);
      closeDialogs();
      return toast('You’re visible to businesses for stable work.');
    }
    const yes = await confirmDialog({ title: 'Stop being visible?', body: html`<p>You leave candidate search straight away. Chats you already accepted stay open.</p>`, confirmLabel: 'Switch off' });
    if (!yes) return;
    setDiscoverability(u.id, false);
    toast('You’re no longer visible to businesses.', 'info');
  },
  'm-conn'(el) {
    const res = respondConnection(el.dataset.id, me().id, !!el.dataset.accept);
    if (!res.ok) return toast(res.message, 'danger');
    if (res.conversationId) { toast('Connected. Say hello!'); go(`/inbox/${res.conversationId}`); } else toast('Request declined.', 'info');
  },
  'm-back'() { history.length > 1 ? history.back() : go('/home'); },
};

