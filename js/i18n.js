// Localization layer.
//   tr('English text', { vars })   → translated text (English is the key and the fallback)
//   trn(n, 'one {n}', 'many {n}')  → plural-aware
//   t('key')                       → a few shared, keyed labels
//   fmt.*                          → money, numbers and dates in the active language
// The web app runs in English; the mobile app defaults to German (js/locales/de.js).
import { APP } from './config.js';
import { parseDate } from './util.js';
import DE from './locales/de.js';

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
  de: {
    'role.client': 'Auftraggeber:in',
    'role.tasker': 'Helfer:in',
    'role.business': 'Unternehmen',
    'role.moderator': 'Moderation',
    'demo.wallet': 'Demo-Wallet: In diesem Prototyp wird kein echtes Geld überwiesen.',
    'demo.proof': 'Dieser Nachweis ist selbst angegeben und wurde noch nicht geprüft.',
    'privacy.address': 'Deine genaue Adresse bleibt privat, bis du dich entscheidest, mehr zu teilen.',
    'privacy.contact': 'Telefonnummern und E-Mail-Adressen bleiben verborgen, bis ein Auftrag angenommen ist.',
    'recruiting.promise': 'Unternehmen finden Helfer:innen, die sich bewusst für feste Jobs sichtbar gemacht haben.',
    'fair.noScore': 'Es gibt hier keine Gesamtbewertung von Menschen. Empfehlungen hängen vom Auftrag ab und werden erklärt.',
  },
};

const DICTS = { de: DE };
export const LANGUAGES = [{ id: 'de', label: 'Deutsch' }, { id: 'en', label: 'English' }];

let lang = 'en';
/** Strings looked up in a non-English language without a translation (used by tests). */
export const missing = new Set();

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

export function t(key, vars = {}) {
  return fill(STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key, vars);
}

export function tr(en, vars = {}) {
  if (lang === 'en' || en == null || en === '') return fill(en ?? '', vars);
  const hit = DICTS[lang]?.[en];
  if (hit == null) missing.add(en);
  return fill(hit ?? en, vars);
}

export const trn = (n, one, many, vars = {}) => tr(n === 1 ? one : many, { n, ...vars });

export const getLang = () => lang;

let F;
function buildFormatters() {
  const locale = lang === 'de' ? 'de-AT' : APP.locale;
  F = {
    money2: new Intl.NumberFormat(locale, { style: 'currency', currency: APP.currency }),
    money0: new Intl.NumberFormat(locale, { style: 'currency', currency: APP.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    num0: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    num1: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    dShort: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
    dLong: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    dMonth: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    dDay: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    tTime: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
    rel: new Intl.RelativeTimeFormat(lang === 'de' ? 'de' : 'en', { numeric: 'auto' }),
  };
}
buildFormatters();

export function setLanguage(l) {
  if (!STRINGS[l]) return;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  if (l === lang) return;
  lang = l;
  buildFormatters();
}

// The chosen language is a per-browser preference, kept apart from the demo data.
const LANG_KEY = 'ltm.lang';
export function savedLanguage(fallback = 'en') {
  try {
    const v = globalThis.localStorage?.getItem(LANG_KEY);
    return STRINGS[v] ? v : fallback;
  } catch { return fallback; }
}
export function saveLanguage(l) {
  try { globalThis.localStorage?.setItem(LANG_KEY, l); } catch { /* private mode: fine for this visit */ }
}

export const fmt = {
  money: (n) => F.money2.format(n),
  money0: (n) => (Number.isInteger(n) ? F.money0 : F.money2).format(n),
  range: (a, b) => (a === b ? fmt.money0(a) : `${fmt.money0(a)}–${F.num0.format(b)}`),
  rating: (n) => F.num1.format(n),
  number: (n) => F.num0.format(n),
  date: (iso) => F.dShort.format(parseDate(iso)),
  dateLong: (iso) => F.dLong.format(parseDate(iso)),
  day: (isoDateTime) => F.dDay.format(new Date(isoDateTime)),
  month: (isoDateTime) => F.dMonth.format(new Date(isoDateTime)),
  time: (isoDateTime) => F.tTime.format(new Date(isoDateTime)),
  window: (tw) => (tw ? `${tw.start}–${tw.end}` : ''),
  relative(isoDateTime) {
    const diff = (new Date(isoDateTime) - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 60) return tr('just now');
    if (abs < 3600) return F.rel.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return F.rel.format(Math.round(diff / 3600), 'hour');
    if (abs < 86400 * 30) return F.rel.format(Math.round(diff / 86400), 'day');
    if (abs < 86400 * 365) return F.rel.format(Math.round(diff / (86400 * 30)), 'month');
    return F.rel.format(Math.round(diff / (86400 * 365)), 'year');
  },
};
