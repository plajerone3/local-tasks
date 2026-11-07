// Demo wallet: earnings for taskers, payments for clients. Never presented as withdrawable money.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, stat, statusBadge, emptyState, tabs, notice } from '../ui/components.js';
import { transactionsOf, taskById } from '../select.js';
import { walletSummary, pct } from '../logic/money.js';
import { fmt, t } from '../i18n.js';
import { APP } from '../config.js';
import { feeNote } from '../services/marketplace.js';

export default {
  title: (ctx) => (ctx.role === 'tasker' ? 'Earnings' : 'Payments'),
  render(ctx) {
    const user = ctx.user;
    const both = user.roles.includes('client') && user.roles.includes('tasker');
    const view = both ? (ctx.query.view || ctx.role) : (user.roles.includes('tasker') ? 'tasker' : 'client');
    const asTasker = view === 'tasker';
    const txs = transactionsOf(user.id).filter((x) => (asTasker ? x.type === 'earning' : x.type === 'payment'));
    const s = walletSummary(txs);
    return html`<div class="wrap page">
      ${pageHead({ eyebrow: 'Demo wallet', title: asTasker ? 'Earnings' : 'Payments', lead: asTasker ? 'What you have earned, what is pending, and the fees taken.' : 'What you have paid, what is reserved for upcoming tasks, and the fees.' })}
      ${both ? tabs([{ id: 'tasker', label: 'As a tasker', href: '/wallet?view=tasker' }, { id: 'client', label: 'As a client', href: '/wallet?view=client' }], view, { label: 'Wallet view' }) : ''}
      ${notice({ tone: 'demo', title: t('demo.wallet'), body: 'Balances are a simulation of how payments would work. They cannot be withdrawn, and no bank or card is connected.' })}
      <div class="stats stats--4">
        ${asTasker
          ? html`${stat('Demo balance', fmt.money(s.available), 'Not withdrawable')}${stat('Pending', fmt.money(s.pending), 'Released when the client confirms')}${stat('On hold', fmt.money(s.onHold), 'Paused during a dispute')}${stat('Fees paid', fmt.money(s.fees), `${pct(APP.fees.taskerPlatformRate)} platform fee`)}`
          : html`${stat('Paid', fmt.money(s.paid))}${stat('Reserved', fmt.money(s.pending), 'For accepted tasks')}${stat('On hold', fmt.money(s.onHold), 'During a dispute')}${stat('Service fees', fmt.money(s.fees), `${pct(APP.fees.clientServiceRate)} per task`)}`}
      </div>
      <div class="layout">
        <section aria-labelledby="tx-h">
          <h2 id="tx-h">Transactions</h2>
          ${txs.length ? html`<div class="table-wrap" role="region" aria-labelledby="tx-h" tabindex="0"><table class="table">
            <thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="num">Amount</th><th scope="col" class="num">Fee</th><th scope="col" class="num">${asTasker ? 'You receive' : 'Total'}</th><th scope="col">Status</th></tr></thead>
            <tbody>${txs.map((x) => html`<tr>
              <td>${fmt.day(x.createdAt)}</td>
              <td>${x.relatedTaskId && taskById(x.relatedTaskId) ? html`<a href="#/tasks/${x.relatedTaskId}">${x.label}</a>` : x.label}<span class="badge badge--demo badge--tiny">demo</span></td>
              <td class="num">${fmt.money(x.amount)}</td>
              <td class="num">${asTasker ? '−' : '+'}${fmt.money(x.fee)}</td>
              <td class="num"><strong>${fmt.money(asTasker ? x.amount - x.fee : x.amount + x.fee)}</strong></td>
              <td>${statusBadge('tx', x.status)}</td>
            </tr>`)}</tbody>
          </table></div>` : emptyState({ ic: 'wallet', title: 'No transactions yet', body: asTasker ? 'When a client accepts you, the amount appears here as pending.' : 'When you accept a tasker, the amount appears here as reserved.' })}
        </section>
        <aside class="stack">
          <section class="card">
            <h2 class="card__title">${icon('lock')} ${asTasker ? 'Payouts' : 'Payment methods'}</h2>
            <p class="small">${asTasker ? 'Payouts to a bank account are not available in this prototype.' : 'No card or bank account is connected in this prototype.'}</p>
            <button type="button" class="btn btn--secondary btn--block" disabled aria-describedby="payout-note">${asTasker ? 'Request payout' : 'Add payment method'}</button>
            <p class="small muted" id="payout-note">Coming later, with a licensed payment provider, identity checks and proper receipts.</p>
          </section>
          <section class="card card--soft">
            <h2 class="card__title">Fees, without surprises</h2>
            <p class="small">${feeNote()} There are no subscription fees, no paid ranking and no hidden charges.</p>
          </section>
        </aside>
      </div>
    </div>`;
  },
};
