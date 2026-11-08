// Product-level settings. The working title lives here so it can change in one place.
export const APP = Object.freeze({
  name: 'Local Tasks',
  fullName: 'Local Task Marketplace',
  locale: 'en-AT',          // English copy, Austrian number and date formatting
  currency: 'EUR',
  storageKey: 'ltm.state.v1',
  sessionKey: 'ltm.session.v1',
  schemaVersion: 6,         // bump to force a reseed when the data shape changes

  // Placeholder fees. Both are shown before anyone accepts. TODO: confirm the business model.
  fees: Object.freeze({ clientServiceRate: 0.05, taskerPlatformRate: 0.05 }),

  newcomerThreshold: 3,     // fewer completed tasks than this = newcomer exposure boost
  minFairHourly: 12,        // budgets below this per hour show a gentle hint to the client
  latencyMs: 260,           // simulated network delay so loading states are visible
  simulation: true,         // seeded demo people reply to invites and messages
});
