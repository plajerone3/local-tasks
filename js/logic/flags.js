// Automatic risk flags for tasks and messages. A flag never removes anything by itself:
// it puts the item in a backoffice queue, and (if the setting is on) holds a high-risk task
// for review before it goes live. Staff edit the word lists under Settings → Rules.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+|00)?\d[\d\s\-/().]{6,}\d/g;

export const FLAG_RULES = [
  {
    id: 'off_platform', label: 'Moves the conversation off the platform', severity: 'high',
    terms: ['whatsapp', 'whats app', 'telegram', 'signal', 'viber', 'snapchat'],
  },
  {
    id: 'upfront', label: 'Asks for money, ID copies or payment details up front', severity: 'high',
    terms: ['copy of your id', 'send your id', 'id copy', 'passport', 'ausweis', 'reisepass', 'vorauszahlung', 'upfront fee', 'deposit first', 'western union', 'moneygram', 'gift card', 'paysafecard', 'bitcoin', 'crypto', 'krypto', 'iban'],
  },
  {
    id: 'cash', label: 'Cash only or “no questions asked”', severity: 'medium',
    terms: ['cash only', 'cash every', 'nur bar', 'bar auf die hand', 'schwarz', 'no questions asked', 'keine fragen'],
  },
  { id: 'contact', label: 'Contains a phone number or email address', severity: 'medium', terms: [] },
  { id: 'pay', label: 'Unusually high pay for the work described', severity: 'medium', terms: [] },
];

export const SEVERITY = { high: { label: 'High risk', tone: 'danger' }, medium: { label: 'Check', tone: 'warn' } };

export const defaultFlagSettings = () => ({
  enabled: true,
  holdHighRisk: true,
  maxHourly: 60,
  terms: Object.fromEntries(FLAG_RULES.filter((r) => r.terms.length).map((r) => [r.id, r.terms.slice()])),
});

const ruleById = (id) => FLAG_RULES.find((r) => r.id === id);
export const flagLabel = (id) => ruleById(id)?.label || id;

function hasContact(text) {
  if (EMAIL.test(text)) return true;
  return (text.match(PHONE) || []).some((m) => m.replace(/\D/g, '').length >= 8 && !/^\d{4}-\d{2}-\d{2}$/.test(m.trim()));
}

/** Scan free text. Returns [{ rule, severity, match }] (one entry per rule). */
export function scanText(text, settings = defaultFlagSettings()) {
  if (!settings?.enabled) return [];
  const lower = String(text || '').toLowerCase();
  const out = [];
  for (const rule of FLAG_RULES) {
    if (rule.id === 'contact') {
      if (hasContact(text || '')) out.push({ rule: rule.id, severity: rule.severity, match: 'contact details' });
      continue;
    }
    const terms = settings.terms?.[rule.id] || rule.terms;
    const hit = terms.find((t) => t && lower.includes(String(t).toLowerCase()));
    if (hit) out.push({ rule: rule.id, severity: rule.severity, match: hit });
  }
  return out;
}

/** Scan a task: title, description, requirements, plus the pay-per-hour check. */
export function scanTask(task, settings = defaultFlagSettings()) {
  if (!settings?.enabled) return [];
  const text = [task.title, task.description, ...(task.requirements || []), task.safetyNotes].filter(Boolean).join('\n');
  const flags = scanText(text, settings);
  const hours = Number(task.estimatedHours) || null;
  const max = Number(task.budgetMax) || 0;
  if (hours && max / hours > (settings.maxHourly || 60)) flags.push({ rule: 'pay', severity: 'medium', match: `€${Math.round(max / hours)}/h` });
  else if (!hours && max >= 400 && /day|tag|easy|einfach/i.test(text)) flags.push({ rule: 'pay', severity: 'medium', match: `€${max}` });
  return flags;
}

export const isHighRisk = (flags = []) => flags.some((f) => f.severity === 'high');
