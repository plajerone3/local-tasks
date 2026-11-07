// Building blocks for the mobile app view. Pure markup helpers; styles live in css/mobile.css.
import { html, raw, attrs } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { category } from '../data/categories.js';
import { initials } from '../util.js';
import { publicName, unreadMessages, assignmentsForUser, taskById, connectionsOfTasker } from '../select.js';
import { fmt } from '../i18n.js';

// Eight-colour palette. Every category owns one colour, so a task is recognisable at a glance.
export const HEX = {
  sun: '#FFC933', tomato: '#FF6B4A', mint: '#3DDC97', sky: '#4CC9F0', bubble: '#FF8FC7',
  lavender: '#B49CFF', lime: '#C6F432', cobalt: '#3D5AFE', periwinkle: '#8EA2FF', peach: '#FFB38A', stone: '#E2D8C6',
};
export const PALETTE = ['sun', 'tomato', 'mint', 'sky', 'bubble', 'lavender', 'lime', 'cobalt'];

const CAT_COLOR = {
  cleaning: 'sky', window_cleaning: 'lavender', gardening: 'mint', pet_care: 'sun', errands: 'bubble',
  pickup_delivery: 'tomato', moving: 'lime', event_setup: 'periwinkle', household: 'peach',
};
export const catColor = (id) => CAT_COLOR[id] || 'stone';

export function catBadge(id, size = 'md') {
  return html`<span class="m-cat m-cat--${size} c-${catColor(id)}" aria-hidden="true">${category(id).emoji}</span>`;
}

export function chip(text, color = 'stone', ic = null) {
  return html`<span class="m-chip c-${color}">${ic ? icon(ic, 14) : ''}${text}</span>`;
}

export function mAvatar(user, size = 'md') {
  if (!user) return html`<span class="m-av m-av--${size}" aria-hidden="true">?</span>`;
  const label = user.roles.includes('business') ? publicName(user) : user.name;
  return html`<span class="m-av m-av--${size}" style="--av:${user.avatar?.color || '#121212'}" aria-hidden="true">${initials(label)}</span>`;
}

export function stars(avg, count, { empty = 'New here' } = {}) {
  if (!count) return html`<span class="m-stars m-stars--new">${icon('sparkle', 13)}${empty}</span>`;
  return html`<span class="m-stars" aria-label="Rated ${fmt.rating(avg)} out of 5 from ${count} reviews"><span aria-hidden="true">★</span> ${fmt.rating(avg)} <span class="m-stars__n">(${count})</span></span>`;
}

export function topbar({ title, back, actions, large = false }) {
  return html`<header class="m-top${large ? ' m-top--large' : ''}">
    ${back ? html`<a class="m-iconbtn" href="#${back}" aria-label="Back">${icon('back', 22)}</a>` : html`<span class="m-top__spacer"></span>`}
    ${title ? html`<h1 class="m-top__title" tabindex="-1">${title}</h1>` : ''}
    <span class="m-top__actions">${actions || ''}</span>
  </header>`;
}

function needsAttention(user, role) {
  const asgs = assignmentsForUser(user.id);
  if (role === 'client') return asgs.some((a) => a.status === 'awaiting_confirmation' && taskById(a.taskId)?.clientId === user.id);
  return asgs.some((a) => a.taskerId === user.id && ['accepted', 'in_progress'].includes(a.status));
}

export function tabbar(ctx) {
  const { user, role } = ctx;
  const inbox = unreadMessages(user.id);
  const items = role === 'tasker'
    ? [['/home', 'Home', 'home'], ['/activity', 'Activity', 'list', needsAttention(user, role)], ['/wallet', 'Earnings', 'wallet'], ['/inbox', 'Inbox', 'message', inbox], ['/account', 'Account', 'user', connectionsOfTasker(user.id).some((c) => c.status === 'pending')]]
    : [['/home', 'Home', 'home'], ['/activity', 'Activity', 'list', needsAttention(user, role)], ['/inbox', 'Inbox', 'message', inbox], ['/account', 'Account', 'user']];
  const active = (href) => ctx.path === href || (href !== '/home' && ctx.path.startsWith(href));
  return html`<nav class="m-tabs" aria-label="Main">${items.map(([href, label, ic, badge]) => html`<a class="m-tab" href="#${href}" ${active(href) ? raw('aria-current="page"') : ''}>
    <span class="m-tab__icon">${icon(ic, 22)}${badge ? html`<span class="m-tab__badge">${typeof badge === 'number' ? (badge > 9 ? '9+' : badge) : ''}<span class="visually-hidden"> (new)</span></span>` : ''}</span>
    <span class="m-tab__label">${label}</span>
  </a>`)}</nav>`;
}

/** A full screen: optional top bar, scrolling main area, sticky footer, tab bar. */
export function screen({ ctx, top, content, footer, tabs = true, cls = '' }) {
  return html`<div class="m-screen ${cls}">
    ${top || ''}
    <main class="m-main" id="main" tabindex="-1">${content}</main>
    ${footer ? html`<div class="m-footer">${footer}</div>` : ''}
    ${tabs && ctx?.user ? tabbar(ctx) : ''}
  </div>`;
}

export function section(title, body, { more, id } = {}) {
  return html`<section class="m-section" ${id ? attrs({ 'aria-labelledby': id }) : ''}>
    <div class="m-section__head"><h2 class="m-h3" ${id ? attrs({ id }) : ''}>${title}</h2>${more ? html`<a class="m-more" href="#${more.href}">${more.label || 'See all'}${icon('chevron', 16)}</a>` : ''}</div>
    ${body}
  </section>`;
}

/** A tappable list row. Pass href for navigation or action (+ data) for a button. */
export function row({ href, action, data = {}, lead, title, sub, trail, cls = '' }) {
  const inner = html`<span class="m-row__lead">${lead || ''}</span>
    <span class="m-row__text"><span class="m-row__title">${title}</span>${sub ? html`<span class="m-row__sub">${sub}</span>` : ''}</span>
    <span class="m-row__trail">${trail ?? icon('chevron', 18)}</span>`;
  if (href) return html`<li><a class="m-row ${cls}" href="#${href}">${inner}</a></li>`;
  if (action) return html`<li><button type="button" class="m-row ${cls}" data-action="${action}" ${attrs(Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v])))}>${inner}</button></li>`;
  return html`<li><div class="m-row ${cls}">${inner}</div></li>`;
}

export function segmented(items, current, label) {
  return html`<nav class="m-seg" aria-label="${label}">${items.map((x) => html`<a class="m-seg__item" href="#${x.href}" ${x.id === current ? raw('aria-current="page"') : ''}>${x.label}${x.count ? html`<span class="m-seg__count">${x.count}</span>` : ''}</a>`)}</nav>`;
}

export function emptyM({ emoji = '✨', title, body, action, color = 'sun' }) {
  return html`<div class="m-empty">
    <span class="m-empty__art c-${color}" aria-hidden="true">${emoji}</span>
    <p class="m-empty__title">${title}</p>
    ${body ? html`<p class="m-empty__text">${body}</p>` : ''}
    ${action || ''}
  </div>`;
}

// Map web-app notification links onto the mobile routes.
export function toMobile(href = '') {
  const h = href.split('?')[0];
  let m;
  if ((m = h.match(/^\/tasks\/([^/]+)\/applicants$/))) return `/task/${m[1]}/offers`;
  if ((m = h.match(/^\/tasks\/([^/]+)$/)) && m[1] !== 'new') return `/task/${m[1]}`;
  if ((m = h.match(/^\/assignments\/([^/]+)\/review$/))) return `/job/${m[1]}/rate`;
  if ((m = h.match(/^\/assignments\/([^/]+)$/))) return `/job/${m[1]}`;
  if ((m = h.match(/^\/messages\/([^/]+)$/))) return `/inbox/${m[1]}`;
  if (h === '/recruiting') return '/recruiting';
  if ((m = h.match(/^\/profile\/([^/]+)$/)) && m[1] !== 'edit') return `/profile/${m[1]}`;
  if (h === '/safety') return '/safety';
  return '/home';
}
