// Money: totals, payouts to approve or release, the full ledger, refunds.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { badge, statusBadge } from '../../ui/components.js';
import { getState } from '../../store.js';
import { userById, taskById } from '../../select.js';
import { can } from '../../logic/staff.js';
import { fmt } from '../../i18n.js';
import { APP } from '../../config.js';
import { pct } from '../../logic/money.js';
import * as BO from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { kpis } from '../data.js';
import { head, table, person, filters, kpi, section, btn, money, staffChip, tabs, downloadCsv } from '../ui.js';

const payoutBadge = (x) => (x.type !== 'earning' || x.status !== 'completed' ? '' : x.payoutStatus === 'held' ? badge('Payout on hold', 'danger') : x.payoutStatus === 'awaiting_approval' ? badge('Payout waiting', 'warn') : badge('Payout approved', 'success'));

export const money_ = {
  title: () => 'Money',
  render(ctx) {
    const s = getState();
    const k = kpis();
    const tab = ['payouts', 'ledger', 'refunds'].includes(ctx.query.tab) ? ctx.query.tab : 'payouts';
    const txs = s.walletTransactions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let body;
    if (tab === 'payouts') {
      const waiting = txs.filter((x) => x.type === 'earning' && x.payoutStatus === 'awaiting_approval');
      const held = txs.filter((x) => x.type === 'earning' && x.payoutStatus === 'held');
      const canPay = can(ctx.staff, 'money.payouts');
      const cols = [{ label: 'Tasker' }, { label: 'For' }, { label: 'Net', cls: 'bo-num' }, { label: 'Why' }, { label: 'Completed' }, { label: '' }];
      body = html`${section(`Waiting for approval (${waiting.length})`, table({ label: 'Payouts waiting', cols, rows: waiting.map((x) => [person(userById(x.userId)), taskById(x.relatedTaskId)?.title || x.label, html`<strong>${money(x.amount - x.fee)}</strong>`, x.payoutCheck === 'first_payout' ? 'First payout' : 'Over the limit', fmt.day(x.createdAt), canPay ? html`${btn('Approve', 'bo-payout', { id: x.id, d: 'approved' }, { tone: 'primary' })} ${btn('Hold', 'bo-payout', { id: x.id, d: 'held' }, { tone: 'ghost' })}` : html`<a href="#/case/payout/${x.id}">Open</a>`]), empty: 'No payouts are waiting.' }))}
        ${section(`On hold (${held.length})`, table({ label: 'Payouts on hold', cols: [...cols.slice(0, 3), { label: 'Reason' }, { label: 'By' }, { label: '' }], rows: held.map((x) => [person(userById(x.userId)), taskById(x.relatedTaskId)?.title || x.label, money(x.amount - x.fee), x.payoutNote, staffChip(x.payoutBy), canPay ? btn('Release', 'bo-payout', { id: x.id, d: 'approved' }) : '']), empty: 'Nothing on hold.' }))}
        <p class="bo-fine">Rule: payouts over ${money(s.settings.payoutApprovalOver)}${s.settings.firstPayoutNeedsApproval ? ' and every tasker’s first payout' : ''} need a person to approve them. Change it under Settings → Money.</p>`;
    } else if (tab === 'ledger') {
      const type = ctx.query.type || '';
      const status = ctx.query.status || '';
      let list = txs;
      if (type) list = list.filter((x) => x.type === type);
      if (status) list = list.filter((x) => x.status === status);
      const focus = ctx.query.tx;
      body = html`${filters('/money', [
        { name: 'type', type: 'select', label: 'Type', value: type, options: [{ value: '', label: 'All' }, { value: 'payment', label: 'Client payments' }, { value: 'earning', label: 'Tasker earnings' }] },
        { name: 'status', type: 'select', label: 'Status', value: status, options: [{ value: '', label: 'Any status' }, { value: 'pending', label: 'Pending / reserved' }, { value: 'completed', label: 'Completed' }, { value: 'on_hold', label: 'On hold' }, { value: 'refunded', label: 'Refunded' }] },
      ], html`<input type="hidden" name="tab" value="ledger">${can(ctx.staff, 'export') ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="bo-export-ledger">${icon('download', 16)}Export CSV</button>` : ''}`)}
        ${table({ label: 'Ledger', cols: [{ label: 'Date' }, { label: 'Person' }, { label: 'Description' }, { label: 'Type' }, { label: 'Amount', cls: 'bo-num' }, { label: 'Fee', cls: 'bo-num' }, { label: 'Status' }],
          rows: list.map((x) => ({ cls: x.id === focus ? 'bo-row--focus' : '', cells: [fmt.day(x.createdAt), person(userById(x.userId)), x.relatedTaskId ? html`<a href="#/tasks/${x.relatedTaskId}">${x.label}</a>` : x.label, x.goodwill ? 'goodwill refund' : x.type, money(x.amount), money(x.fee), html`${statusBadge('tx', x.status)} ${payoutBadge(x)}`] })),
          empty: 'No transactions match.' })}`;
    } else {
      const refunds = txs.filter((x) => x.status === 'refunded');
      body = section(`Refunds (${refunds.length})`, table({ label: 'Refunds', cols: [{ label: 'Date' }, { label: 'Client' }, { label: 'Task' }, { label: 'Amount', cls: 'bo-num' }, { label: 'Kind' }], rows: refunds.map((x) => [fmt.day(x.createdAt), person(userById(x.userId)), taskById(x.relatedTaskId)?.title || x.label, money(x.amount + x.fee), x.goodwill ? html`Goodwill · ${staffChip(x.by)}` : x.type === 'earning' ? 'Earning reversed' : 'Cancelled or disputed job']), empty: 'No refunds.' }));
    }
    return html`
      ${head({ title: 'Money', sub: html`Demo ledger: nothing here moves real money. Fees: clients ${pct(APP.fees.clientServiceRate)}, taskers ${pct(APP.fees.taskerPlatformRate)}.` })}
      <div class="bo-kpis">
        ${kpi('Volume (completed)', fmt.money(k.gmv), 'Agreed prices of paid jobs', 'lavender')}
        ${kpi('Platform revenue', fmt.money(k.revenue), 'Client + tasker fees', 'mint')}
        ${kpi('Reserved', fmt.money(k.reserved), 'For accepted jobs', 'sky')}
        ${kpi('On hold', fmt.money(k.onHold), 'Frozen by disputes', 'tomato')}
        ${kpi('Refunded', fmt.money(k.refunded), 'Cancelled, disputed, goodwill', 'sun')}
        ${kpi('Payouts waiting', k.payoutsWaiting, `${k.payoutsHeld} on hold`, 'bubble', '/money?tab=payouts')}
      </div>
      ${tabs([{ id: 'payouts', label: 'Payouts', href: '/money?tab=payouts', count: k.payoutsWaiting }, { id: 'ledger', label: 'Ledger', href: '/money?tab=ledger' }, { id: 'refunds', label: 'Refunds', href: '/money?tab=refunds' }], tab, 'Money sections')}
      ${body}`;
  },
};

export const actions = {
  'bo-export-ledger'(el, e, ctx) {
    const rows = getState().walletTransactions;
    const res = BO.logExport(ctx.staff.id, 'ledger', rows.length);
    if (!res.ok) { toast(res.message, 'danger'); return; }
    downloadCsv(`local-tasks-ledger-${new Date().toISOString().slice(0, 10)}.csv`, [['date', 'user', 'type', 'amount', 'fee', 'status', 'payout', 'task', 'label'], ...rows.map((x) => [x.createdAt, userById(x.userId)?.name, x.type, x.amount, x.fee, x.status, x.payoutStatus || '', x.relatedTaskId || '', x.label])]);
    toast(`Exported ${rows.length} rows. The export is logged.`, 'success');
  },
};
