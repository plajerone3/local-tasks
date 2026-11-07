// The mock persistence layer: one JSON document in localStorage.
// A real backend replaces this module and services/*.js; views only use services and select.js.
import { APP } from './config.js';
import { createSeed } from './data/seed.js';

let state = null;
let storageOk = true;
const listeners = new Set();

function storage(kind) {
  try {
    const s = kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    return s || null;
  } catch {
    return null;
  }
}
function read(key, kind = 'local') {
  try { return storage(kind)?.getItem(key) ?? null; } catch { return null; }
}
function write(key, value, kind = 'local') {
  try { storage(kind)?.setItem(key, value); return !!storage(kind); } catch { return false; }
}
function remove(key, kind = 'local') {
  try { storage(kind)?.removeItem(key); } catch { /* storage unavailable */ }
}

export function loadState() {
  const raw = read(APP.storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.schemaVersion === APP.schemaVersion) {
        state = parsed;
        return { restored: true };
      }
    } catch { /* fall through to reseed */ }
  }
  state = createSeed(new Date());
  persist();
  return { restored: false };
}

function persist() {
  storageOk = write(APP.storageKey, JSON.stringify(state));
}

export const getState = () => state;
export const storageAvailable = () => storageOk;

export function update(mutator) {
  const result = mutator(state);
  persist();
  emit();
  return result;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function resetDemo() {
  state = createSeed(new Date());
  persist();
  session.clear();
  emit();
}

// Keep several tabs in sync, so a reviewer can be the client in one tab and the tasker in another.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== APP.storageKey || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue);
      emit();
    } catch { /* ignore partial writes */ }
  });
}

// Session: per tab (sessionStorage) with the last account as the default for new tabs.
export const session = {
  get() {
    const raw = read(APP.sessionKey, 'session') ?? read(APP.sessionKey);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  set(value) {
    const raw = JSON.stringify(value);
    write(APP.sessionKey, raw, 'session');
    write(APP.sessionKey, raw);
    emit();
  },
  clear() {
    remove(APP.sessionKey, 'session');
    remove(APP.sessionKey);
  },
};
