// Ephemeral UI state (filters, drafts, current step). Not persisted with the demo data.
const listeners = new Set();

export const ui = {
  browse: { q: '', category: '', city: '', distance: 'any', date: 'any', minPay: '', status: 'active', sort: 'recommended' },
  candidates: { field: '', q: '', evidence: 'any', availability: 'any', location: 'any', history: 'any', rating: 'any', type: 'any' },
  applicantSort: 'recommended',
  taskDraft: null,
  taskStep: 'edit',
  onboarding: {},
  reviewsShown: 6,
  errors: {},
  focusErrorSummary: false,
  skipPreserve: false,
};

export function setUi(patch, { preserve = true } = {}) {
  Object.assign(ui, patch);
  if (!preserve) ui.skipPreserve = true;
  listeners.forEach((fn) => fn());
}

export const onUiChange = (fn) => listeners.add(fn);

export function setErrors(form, errors) {
  ui.errors = { ...ui.errors, [form]: errors };
  ui.focusErrorSummary = Object.keys(errors || {}).length > 0;
  listeners.forEach((fn) => fn());
}

export const errorsFor = (form) => ui.errors[form] || {};

export function clearErrors(form) {
  if (ui.errors[form]) {
    const next = { ...ui.errors };
    delete next[form];
    ui.errors = next;
  }
}
