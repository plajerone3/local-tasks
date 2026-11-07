// Localization layer. Shared labels go through t(); all money and dates go through fmt.
// TODO: move the remaining inline view copy into STRINGS and add a German dictionary.
import { APP } from './config.js';
import { parseDate } from './util.js';

const STRINGS = {
  en: {
    'role.client': 'Client',
    'role.tasker': 'Tasker',
    'role.business': 'Business',
    'role.moderator': 'Moderator',
    'demo.wallet': 'Demo wallet: no real money is transferred in this prototype.',
    'demo.proof': 'This proof is self-reported and has not been verified yet.',
    'privacy.address': 'Your exact address stays private until you choose to share more.',
    'privacy.contact': 'Phone numbers and email addresses are hidden until a task is accepted.',
    'recruiting.promise': 'Businesses can discover taskers who have chosen to be visible for stable work.',
    'fair.noScore': 'There is no overall score for people here. Recommendations depend on the task and are explained.',
  },
};

let lang = 'en';
export const setLanguage = (l) => { if (STRINGS[l]) lang = l; };

export function t(key, vars = {}) {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const money2 = new Intl.NumberFormat(APP.locale, { style: 'currency', currency: APP.currency });
const money0 = new Intl.NumberFormat(APP.locale, { style: 'currency', currency: APP.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat(APP.locale, { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat(APP.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dShort = new Intl.DateTimeFormat(APP.locale, { weekday: 'short', day: 'numeric', month: 'short' });
const dLong = new Intl.DateTimeFormat(APP.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dMonth = new Intl.DateTimeFormat(APP.locale, { month: 'long', year: 'numeric' });
const dDay = new Intl.DateTimeFormat(APP.locale, { day: 'numeric', month: 'short', year: 'numeric' });
const tTime = new Intl.DateTimeFormat(APP.locale, { hour: '2-digit', minute: '2-digit' });
const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const fmt = {
  money: (n) => money2.format(n),
  money0: (n) => (Number.isInteger(n) ? money0 : money2).format(n),
  range: (a, b) => (a === b ? fmt.money0(a) : `${fmt.money0(a)}–${num0.format(b)}`),
  rating: (n) => num1.format(n),
  number: (n) => num0.format(n),
  date: (iso) => dShort.format(parseDate(iso)),
  dateLong: (iso) => dLong.format(parseDate(iso)),
  day: (isoDateTime) => dDay.format(new Date(isoDateTime)),
  month: (isoDateTime) => dMonth.format(new Date(isoDateTime)),
  time: (isoDateTime) => tTime.format(new Date(isoDateTime)),
  window: (tw) => (tw ? `${tw.start}–${tw.end}` : ''),
  relative(isoDateTime) {
    const diff = (new Date(isoDateTime) - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 60) return 'just now';
    if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
    if (abs < 86400 * 30) return rel.format(Math.round(diff / 86400), 'day');
    if (abs < 86400 * 365) return rel.format(Math.round(diff / (86400 * 30)), 'month');
    return rel.format(Math.round(diff / (86400 * 365)), 'year');
  },
};
