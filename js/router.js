// Hash router: #/path?query. Works on any static host without rewrite rules.

export function parseHash(hash = location.hash) {
  const rawHash = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = rawHash.split('?');
  const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return { path: path.length > 1 ? path.replace(/\/$/, '') : path, query: Object.fromEntries(new URLSearchParams(queryPart)) };
}

export function matchRoute(routes, path) {
  for (const r of routes) {
    const keys = [];
    const re = new RegExp(`^${r.path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
    const m = path.match(re);
    if (m) return { route: r, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

let rerender = () => {};
export const setRerender = (fn) => { rerender = fn; };

export function go(path) {
  if (location.hash === `#${path}`) rerender();
  else location.hash = path;
}
