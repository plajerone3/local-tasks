// Tagged-template HTML with automatic escaping. Interpolated values are escaped unless
// they are themselves html`` results or wrapped in raw(). Arrays are joined.

class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new SafeHtml(String(s ?? ''));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

function stringify(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(stringify).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += stringify(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** attrs({ id: 'x', checked: true, disabled: false }) → id="x" checked */
export function attrs(obj) {
  return raw(Object.entries(obj)
    .filter(([, v]) => v !== false && v != null && v !== '')
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(' '));
}
