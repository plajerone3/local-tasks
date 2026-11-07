// Small pure helpers shared by logic, services and views.

export const DAY_MS = 864e5;

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export const nowIso = () => new Date().toISOString();

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayIso = () => isoDate(new Date());

export function parseDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function diffDays(aIso, bIso) {
  return Math.round((parseDate(aIso) - parseDate(bIso)) / DAY_MS);
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAY_LABEL = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
export const WEEKDAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export function weekdayKey(iso) {
  return WEEKDAYS[(parseDate(iso).getDay() + 6) % 7];
}

export const SLOTS = [
  { id: 'morning', label: 'Morning', range: '6–12', start: 6, end: 12 },
  { id: 'afternoon', label: 'Afternoon', range: '12–17', start: 12, end: 17 },
  { id: 'evening', label: 'Evening', range: '17–22', start: 17, end: 22 },
];

function toHours(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h + (m || 0) / 60;
}

export function slotsForWindow(tw) {
  if (!tw?.start || !tw?.end) return [];
  const s = toHours(tw.start);
  const e = toHours(tw.end);
  return SLOTS.filter((x) => s < x.end && e > x.start).map((x) => x.id);
}

export function windowHours(tw) {
  return Math.max(0, toHours(tw.end) - toHours(tw.start));
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export const round2 = (n) => Math.round(n * 100) / 100;
export const round1 = (n) => Math.round(n * 10) / 10;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function joinList(items, conj = 'and') {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} ${conj} ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, ${conj} ${list.at(-1)}`;
}

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Deterministic PRNG for seed data, so every reset looks the same.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
