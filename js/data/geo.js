// Location areas. Coordinates are rough district centres, used only to estimate
// distance between areas. Exact addresses are never part of public data.

export const CITIES = [
  {
    id: 'vienna', label: 'Vienna', local: 'Wien',
    districts: [
      { id: 'innere-stadt', label: 'Innere Stadt', code: '1010', lat: 48.2085, lng: 16.3721 },
      { id: 'leopoldstadt', label: 'Leopoldstadt', code: '1020', lat: 48.2167, lng: 16.4 },
      { id: 'landstrasse', label: 'Landstraße', code: '1030', lat: 48.1981, lng: 16.3948 },
      { id: 'wieden', label: 'Wieden', code: '1040', lat: 48.192, lng: 16.37 },
      { id: 'margareten', label: 'Margareten', code: '1050', lat: 48.188, lng: 16.355 },
      { id: 'mariahilf', label: 'Mariahilf', code: '1060', lat: 48.196, lng: 16.347 },
      { id: 'neubau', label: 'Neubau', code: '1070', lat: 48.202, lng: 16.348 },
      { id: 'josefstadt', label: 'Josefstadt', code: '1080', lat: 48.211, lng: 16.347 },
      { id: 'alsergrund', label: 'Alsergrund', code: '1090', lat: 48.225, lng: 16.357 },
      { id: 'favoriten', label: 'Favoriten', code: '1100', lat: 48.16, lng: 16.38 },
      { id: 'meidling', label: 'Meidling', code: '1120', lat: 48.175, lng: 16.33 },
      { id: 'penzing', label: 'Penzing', code: '1140', lat: 48.205, lng: 16.27 },
      { id: 'rudolfsheim', label: 'Rudolfsheim-Fünfhaus', code: '1150', lat: 48.195, lng: 16.325 },
      { id: 'ottakring', label: 'Ottakring', code: '1160', lat: 48.213, lng: 16.31 },
      { id: 'doebling', label: 'Döbling', code: '1190', lat: 48.25, lng: 16.33 },
      { id: 'brigittenau', label: 'Brigittenau', code: '1200', lat: 48.24, lng: 16.375 },
      { id: 'floridsdorf', label: 'Floridsdorf', code: '1210', lat: 48.28, lng: 16.41 },
      { id: 'donaustadt', label: 'Donaustadt', code: '1220', lat: 48.23, lng: 16.48 },
    ],
  },
  {
    id: 'graz', label: 'Graz', local: 'Graz',
    districts: [
      { id: 'innere-stadt', label: 'Innere Stadt', lat: 47.071, lng: 15.439 },
      { id: 'st-leonhard', label: 'St. Leonhard', lat: 47.073, lng: 15.462 },
      { id: 'geidorf', label: 'Geidorf', lat: 47.082, lng: 15.445 },
      { id: 'lend', label: 'Lend', lat: 47.076, lng: 15.425 },
      { id: 'gries', label: 'Gries', lat: 47.062, lng: 15.425 },
      { id: 'jakomini', label: 'Jakomini', lat: 47.06, lng: 15.445 },
      { id: 'liebenau', label: 'Liebenau', lat: 47.035, lng: 15.455 },
      { id: 'andritz', label: 'Andritz', lat: 47.11, lng: 15.425 },
      { id: 'eggenberg', label: 'Eggenberg', lat: 47.07, lng: 15.395 },
    ],
  },
  {
    id: 'linz', label: 'Linz', local: 'Linz',
    districts: [
      { id: 'innenstadt', label: 'Innenstadt', lat: 48.306, lng: 14.286 },
      { id: 'urfahr', label: 'Urfahr', lat: 48.32, lng: 14.285 },
      { id: 'franckviertel', label: 'Franckviertel', lat: 48.295, lng: 14.31 },
      { id: 'bindermichl', label: 'Bindermichl', lat: 48.28, lng: 14.285 },
      { id: 'kleinmuenchen', label: 'Kleinmünchen', lat: 48.265, lng: 14.3 },
      { id: 'dornach-auhof', label: 'Dornach-Auhof', lat: 48.33, lng: 14.32 },
      { id: 'ebelsberg', label: 'Ebelsberg', lat: 48.245, lng: 14.335 },
    ],
  },
];

export const city = (id) => CITIES.find((c) => c.id === id);

export function district(area) {
  return city(area?.city)?.districts.find((d) => d.id === area.district);
}

export function areaLabel(area, { withCode = true } = {}) {
  const c = city(area?.city);
  const d = district(area);
  if (!c) return 'Unknown area';
  if (!d) return c.label;
  return `${c.label} · ${d.label}${withCode && d.code ? ` (${d.code})` : ''}`;
}

export const areaKey = (area) => (area ? `${area.city}:${area.district}` : '');

export function parseAreaKey(key) {
  const [cityId, districtId] = String(key || '').split(':');
  if (!city(cityId)) return null;
  const area = { city: cityId, district: districtId };
  return district(area) ? area : null;
}

export function distanceKm(a, b) {
  const da = district(a);
  const db = district(b);
  if (!da || !db) return null;
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(db.lat - da.lat);
  const dLng = rad(db.lng - da.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(da.lat)) * Math.cos(rad(db.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceLabel(km) {
  if (km == null) return '';
  if (km < 1) return 'under 1 km away';
  if (km > 60) return `about ${Math.round(km / 10) * 10} km away`;
  return `about ${Math.round(km)} km away`;
}
