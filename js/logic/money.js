// Fee maths and wallet summaries. Every amount here is demo-only.
import { APP } from '../config.js';
import { round2 } from '../util.js';

export function breakdown(price) {
  const p = round2(Number(price) || 0);
  const clientFee = round2(p * APP.fees.clientServiceRate);
  const taskerFee = round2(p * APP.fees.taskerPlatformRate);
  return { price: p, clientFee, clientTotal: round2(p + clientFee), taskerFee, taskerNet: round2(p - taskerFee) };
}

export function impliedHourly(amount, hours) {
  const h = Number(hours);
  if (!h || h <= 0) return null;
  return round2(Number(amount) / h);
}

export const pct = (rate) => `${Math.round(rate * 100)}%`;

// Tasker perspective: earnings. Client perspective: payments.
export function walletSummary(txs) {
  const s = { available: 0, pending: 0, onHold: 0, earned: 0, paid: 0, fees: 0, refunded: 0 };
  for (const t of txs) {
    if (t.type === 'earning') {
      const net = t.amount - t.fee;
      if (t.status === 'completed') { s.available += net; s.earned += net; s.fees += t.fee; }
      else if (t.status === 'pending') s.pending += net;
      else if (t.status === 'on_hold') s.onHold += net;
    } else if (t.type === 'payment') {
      const total = t.amount + t.fee;
      if (t.status === 'completed') { s.paid += total; s.fees += t.fee; }
      else if (t.status === 'pending') s.pending += total;
      else if (t.status === 'on_hold') s.onHold += total;
      else if (t.status === 'refunded') s.refunded += total;
    }
  }
  for (const k of Object.keys(s)) s[k] = round2(s[k]);
  return s;
}
