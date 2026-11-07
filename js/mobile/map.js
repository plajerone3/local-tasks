// Illustrated area map (SVG). Not a street map: districts are placed by their rough centres,
// rivers and parks are stylised, and pins sit on the district, never on an address.
import { city, cityName } from '../data/geo.js';
import { tr, trn } from '../i18n.js';
import { category } from '../data/categories.js';
import { HEX, catColor } from './ui.js';
import { esc } from '../ui/html.js';
import { mulberry32 } from '../util.js';

const RIVERS = {
  vienna: [[48.31, 16.33], [48.265, 16.37], [48.232, 16.405], [48.205, 16.44], [48.165, 16.51]],
  graz: [[47.135, 15.418], [47.098, 15.428], [47.068, 15.432], [47.038, 15.44], [47.005, 15.452]],
  linz: [[48.322, 14.215], [48.312, 14.268], [48.306, 14.296], [48.288, 14.326], [48.256, 14.366], [48.226, 14.405]],
};

let counter = 0;

function projector(cityId) {
  const ds = city(cityId).districts;
  const lat0 = ds.reduce((a, d) => a + d.lat, 0) / ds.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = ds.map((d) => d.lng * k);
  const ys = ds.map((d) => -d.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const W = 400;
  const pad = 64;
  const scale = (W - 2 * pad) / (maxX - minX);
  const H = Math.max(380, (maxY - minY) * scale + 2 * pad);
  const offY = (H - (maxY - minY) * scale) / 2;
  const project = (lat, lng) => [pad + (lng * k - minX) * scale, offY + (-lat - minY) * scale];
  return { project, W, H, ds };
}

function smooth(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const last = points.at(-1);
  return `${d} T${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
}

/**
 * pins: [{ href, label, area, category, price }]   you: area of the viewer   focus: area to zoom into
 */
export function cityMap({ cityId, pins = [], you = null, focus = null, center = null, title = true, people = [] }) {
  if (!city(cityId)) return '';
  const id = `m${++counter}`;
  const { project, W, H, ds } = projector(cityId);
  const rand = mulberry32(cityId.length * 9973);

  const river = smooth(RIVERS[cityId].map(([la, ln]) => project(la, ln)));
  const parks = ds.filter((_, i) => i % 3 === 1).map((d) => {
    const [x, y] = project(d.lat, d.lng);
    return `<ellipse cx="${(x + (rand() - 0.5) * 50).toFixed(0)}" cy="${(y + (rand() - 0.5) * 50).toFixed(0)}" rx="${(22 + rand() * 26).toFixed(0)}" ry="${(14 + rand() * 18).toFixed(0)}" fill="#C8F1DC" transform="rotate(${(rand() * 60 - 30).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }).join('');
  const roads = [0, 1, 2, 3].map((i) => {
    const y = (H / 5) * (i + 1) + (rand() - 0.5) * 30;
    return `<path d="M-400 ${y.toFixed(0)} L${W + 400} ${(y + (rand() - 0.5) * 140).toFixed(0)}" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>`;
  }).join('') + [0, 1, 2].map((i) => {
    const x = (W / 4) * (i + 1) + (rand() - 0.5) * 40;
    return `<path d="M${x.toFixed(0)} -400 L${(x + (rand() - 0.5) * 120).toFixed(0)} ${H + 400}" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');
  const labels = ds.map((d) => {
    const [x, y] = project(d.lat, d.lng);
    return `<text x="${x.toFixed(0)}" y="${(y + 30).toFixed(0)}" class="m-map__label">${esc(d.label)}</text>`;
  }).join('');

  const used = {};
  const place = (area) => {
    const d = ds.find((x) => x.id === area.district);
    if (!d) return null;
    const n = (used[area.district] = (used[area.district] || 0) + 1) - 1;
    const [x, y] = project(d.lat, d.lng);
    const a = n * 2.4;
    const r = n ? 24 * Math.sqrt(n) : 0;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  };

  const peopleSvg = people.map((p) => {
    const at = place(p.area);
    if (!at) return '';
    return `<g transform="translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})" class="m-map__person"><circle r="13" fill="${p.color}" stroke="#121212" stroke-width="2"/><text class="m-map__initials">${esc(p.initials)}</text></g>`;
  }).join('');

  const pinSvg = pins.map((p) => {
    const at = place(p.area);
    if (!at) return '';
    const hex = HEX[catColor(p.category)];
    const body = `<g transform="translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})">
      <circle r="17" cx="3" cy="3" fill="#121212"/>
      <circle r="17" fill="${hex}" stroke="#121212" stroke-width="2.5" class="m-map__pin"/>
      <text class="m-map__emoji">${category(p.category).emoji}</text>
      ${p.price ? `<g transform="translate(0 -31)"><rect x="-27" y="-11" width="54" height="22" rx="11" fill="#FFFFFF" stroke="#121212" stroke-width="2"/><text class="m-map__price">${esc(p.price)}</text></g>` : ''}
    </g>`;
    return p.href ? `<a href="#${esc(p.href)}" aria-label="${esc(p.label)}" class="m-map__link">${body}</a>` : body;
  }).join('');

  let youSvg = '';
  if (you && you.city === cityId) {
    const d = ds.find((x) => x.id === you.district);
    if (d) {
      const [x, y] = project(d.lat, d.lng);
      youSvg = `<g transform="translate(${(x - 20).toFixed(1)} ${(y + 18).toFixed(1)})"><circle r="24" fill="#3D5AFE" opacity=".18" class="m-map__pulse"/><circle r="9" fill="#3D5AFE" stroke="#FFFFFF" stroke-width="3"/></g>`;
    }
  }

  let viewBox = `0 0 ${W} ${H.toFixed(0)}`;
  let aspect = 'xMidYMid meet';
  if (focus) {
    const d = ds.find((x) => x.id === focus.district);
    if (d) {
      const [x, y] = project(d.lat, d.lng);
      viewBox = `${(x - 150).toFixed(0)} ${(y - 105).toFixed(0)} 300 210`;
      aspect = 'xMidYMid slice';
    }
  } else if (center) {
    // Portrait crop around one area, for small map thumbnails.
    const d = ds.find((x) => x.id === center.district);
    if (d) {
      const [x, y] = project(d.lat, d.lng);
      viewBox = `${(x - 110).toFixed(0)} ${(y - 150).toFixed(0)} 220 300`;
      aspect = 'xMidYMid slice';
    }
  }
  const name = cityName(cityId);
  const aria = pins.length
    ? trn(pins.length, 'Illustrated map of {city} with {n} task. Pins show the district only, not addresses.', 'Illustrated map of {city} with {n} tasks. Pins show the district only, not addresses.', { city: name })
    : tr('Illustrated map of {city}. Pins show the district only, not addresses.', { city: name });

  return `<svg class="m-map" viewBox="${viewBox}" preserveAspectRatio="${aspect}" role="img" aria-label="${esc(aria)}" focusable="false">
    <defs><pattern id="${id}-streets" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(16)"><path d="M0 15H30M15 0V30" stroke="#E9DDC7" stroke-width="2.5"/></pattern></defs>
    <rect x="-800" y="-800" width="${W + 1600}" height="${H + 1600}" fill="#F3E9D7"/>
    <rect x="-800" y="-800" width="${W + 1600}" height="${H + 1600}" fill="url(#${id}-streets)"/>
    ${roads}${parks}
    <path d="${river}" fill="none" stroke="#7FD8F2" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${river}" fill="none" stroke="#B8EBFA" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14"/>
    ${title && !focus ? `<text x="${W / 2}" y="40" class="m-map__city">${esc(name)}</text>` : ''}
    ${labels}${youSvg}${peopleSvg}${pinSvg}
  </svg>`;
}
