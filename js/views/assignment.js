// Assignment status: timeline, next actions for each side, private address, demo payment, disputes.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, statusBadge, notice, timeline, kv, catLabel, badge, choices, textarea, input, errorSummary, emptyState } from '../ui/components.js';
import { errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { assignmentById, taskById, userById, applicationById, me, firstName, publicName, disputeForAssignment, reviewByFor, reviewsForAssignment, findConversation } from '../select.js';
import { lifecycle, PAYMENT_STATUS } from '../logic/status.js';
import { breakdown, pct } from '../logic/money.js';
import { fmt, t } from '../i18n.js';
import { APP } from '../config.js';
import { areaLabel } from '../data/geo.js';
import { startAssignment, markComplete, confirmCompletion, cancelAssignment, shareAddress, setTaskAddress } from '../services/marketplace.js';
import { openDispute, DISPUTE_REASONS } from '../services/safety.js';
import { ensureTaskConversation } from '../services/messaging.js';
import { person, safetyLinks, reviewItem, reportedNotice } from './common.js';
import { openDialog, closeDialogs, toast, confirmDialog } from '../ui/dialog.js';
import { go } from '../router.js';

function disputeForm(asgId, v = {}) {
  const e = errorsFor('dispute');
  return html`<form data-form="open-dispute" data-asg="${asgId}" novalidate class="stack">
    <p>A dispute pauses the demo payment and reviews for both of you. Nobody gets a negative mark automatically, and a moderator helps you agree a fair outcome.</p>
    ${errorSummary(e, 'dispute')}
    ${choices({ id: 'dispute-reason', name: 'reason', legend: 'What is it about?', type: 'radio', options: DISPUTE_REASONS.map((r) => ({ value: r.id, label: r.label })), values: v.reason ? [v.reason] : [], error: e.reason, required: true, cls: 'choices--stack' })}
    ${textarea({ id: 'dispute-details', name: 'details', label: 'What happened, and what would be fair?', value: v.details || '', error: e.details, required: true, rows: 4 })}
    <div class="dialog__actions"><button type="button" class="btn btn--secondary" data-action="dialog-close">Cancel</button><button class="btn btn--danger" type="submit">Open dispute</button></div>
  </form>`;
}

function actionsFor(asg, task, role, user) {
  const out = [];
  const reviewed = reviewByFor(asg.id, user.id);
  if (role === 'tasker') {
    if (asg.status === 'accepted') out.push(html`<button type="button" class="btn btn--primary" data-action="asg-start" data-asg="${asg.id}">${icon('play', 16)}Start task</button>`);
    if (['accepted', 'in_progress'].includes(asg.status)) out.push(html`<button type="button" class="btn ${asg.status === 'in_progress' ? 'btn--primary' : 'btn--secondary'}" data-action="asg-complete" data-asg="${asg.id}">${icon('check')}Mark as completed</button>`);
  }
  if (role === 'client') {
    if (asg.status === 'awaiting_confirmation') out.push(html`<button type="button" class="btn btn--primary" data-action="asg-confirm" data-asg="${asg.id}">${icon('check')}Confirm completion</button>`);
    if (['accepted', 'in_progress'].includes(asg.status)) out.push(html`<button type="button" class="btn btn--secondary" data-action="asg-complete" data-asg="${asg.id}">${icon('check')}Mark as completed</button>`);
  }
  if (asg.status === 'completed' && !reviewed) out.push(html`<a class="btn btn--primary" href="#/assignments/${asg.id}/review">${icon('star')}Leave a review</a>`);
  out.push(html`<button type="button" class="btn btn--secondary" data-action="asg-message" data-asg="${asg.id}">${icon('message')}Message</button>`);
  if (['accepted', 'in_progress', 'awaiting_confirmation'].includes(asg.status)) out.push(html`<button type="button" class="btn btn--ghost" data-action="asg-dispute" data-asg="${asg.id}">${icon('flag', 16)}Report a problem</button>`);
  if (['accepted', 'in_progress'].includes(asg.status)) out.push(html`<button type="button" class="btn btn--ghost" data-action="asg-cancel" data-asg="${asg.id}">Cancel</button>`);
  return out;
}

function nextStepText(asg, role, other) {
  const name = firstName(other);
  const map = {
    accepted: role === 'tasker' ? 'You are booked. Press “Start task” when you begin.' : `${name} is booked. Share the exact address when you are ready.`,
    in_progress: role === 'tasker' ? 'When you are done, mark the task as completed. The client then confirms.' : `${name} is working on it. You can mark it as completed yourself when it is done.`,
    awaiting_confirmation: role === 'tasker' ? `You marked the task as completed. Waiting for ${name} to confirm.` : `${name} marked the task as completed. Please check and confirm, or report a problem.`,
    completed: 'Done. Reviews are now open for both of you.',
    disputed: 'A dispute is open. Payment and reviews are paused until it is resolved.',
    cancelled: 'This assignment was cancelled. The demo payment was refunded. Cancellations are not shown as a rating.',
  };
  return map[asg.status];
}

export default {
  title: () => 'Assignment',
  render(ctx) {
    const asg = assignmentById(ctx.params.id);
    if (!asg) return html`<div class="wrap page">${emptyState({ title: 'Assignment not found' })}</div>`;
    const task = taskById(asg.taskId);
    const user = ctx.user;
    const isMod = user.roles.includes('moderator');
    const role = user.id === asg.taskerId ? 'tasker' : user.id === task.clientId ? 'client' : isMod ? 'moderator' : null;
    if (!role) return html`<div class="wrap page">${notice({ tone: 'warn', title: 'Only the client and the tasker can see this assignment.' })}</div>`;
    const tasker = userById(asg.taskerId);
    const client = userById(task.clientId);
    const other = role === 'tasker' ? client : tasker;
    const b = breakdown(asg.agreedPrice);
    const dispute = disputeForAssignment(asg.id);
    const reviews = reviewsForAssignment(asg.id);

    let address;
    if (role === 'client') {
      address = asg.addressShared
        ? html`<p>${icon('check', 16)} You shared the exact address with ${firstName(tasker)}: <strong>${task.exactAddress}</strong></p>`
        : task.exactAddress
          ? html`<p class="small">Only you can see: <strong>${task.exactAddress}</strong></p><button type="button" class="btn btn--secondary btn--sm" data-action="asg-share" data-asg="${asg.id}">${icon('pin', 16)}Share exact address with ${firstName(tasker)}</button>`
          : html`<form class="invite-form" data-form="asg-address" data-asg="${asg.id}" novalidate>${input({ id: 'asg-address', name: 'address', label: 'Exact address (private)', autocomplete: 'street-address', error: errorsFor('asg-address').address, hint: `Only ${firstName(tasker)} will see it, after you press the button.`, cls: 'field--compact' })}<button class="btn btn--secondary btn--sm" type="submit">${icon('pin', 16)}Save and share</button></form>`;
    } else {
      address = asg.addressShared && task.exactAddress
        ? html`<p><strong>${task.exactAddress}</strong></p><p class="small muted">Shared by ${firstName(client)}. Please keep it private.</p>`
        : html`<p>${areaLabel(task.locationArea)}</p><p class="small muted">${t('privacy.address').replace('Your', 'The')} The exact address appears here once ${firstName(client)} shares it.</p>`;
    }

    return html`<div class="wrap page">
      ${pageHead({ back: { href: role === 'client' ? '/my-tasks' : '/my-work?tab=assignments', label: role === 'client' ? 'My tasks' : 'My work' }, eyebrow: 'Assignment', title: task.title, lead: html`${catLabel(task.category, { plain: true })} · ${fmt.dateLong(task.date)} · ${fmt.window(task.timeWindow)}` })}
      ${reportedNotice('assignment', asg.id)}
      <div class="layout">
        <div class="stack-lg">
          <section class="card" aria-labelledby="status-h">
            <div class="row row--between"><h2 id="status-h" class="card__title">Status</h2>${statusBadge('assignment', asg.status)}</div>
            ${timeline(lifecycle(applicationById(asg.applicationId), asg))}
            <p class="next-step">${nextStepText(asg, role, other)}</p>
            ${role !== 'moderator' ? html`<div class="row">${actionsFor(asg, task, role, user)}</div>` : ''}
          </section>
          ${asg.status === 'disputed' && dispute ? html`<section class="card card--danger" aria-labelledby="disp-h">
            <h2 id="disp-h" class="card__title">${icon('pause')} Dispute open</h2>
            ${kv([['Opened by', publicName(userById(dispute.openedBy))], ['When', fmt.relative(dispute.createdAt)], ['About', DISPUTE_REASONS.find((r) => r.id === dispute.reason)?.label || dispute.reason]])}
            <blockquote class="quote">${dispute.details}</blockquote>
            <ul class="checklist checklist--sm">
              <li>${icon('pause', 14)}<span>The demo payment is on hold.</span></li>
              <li>${icon('pause', 14)}<span>Reviews are paused for both sides. Nobody gets an automatic negative mark.</span></li>
              <li>${icon('users', 14)}<span>A moderator will contact you both in the app. Most disputes are settled with a partial price or a second visit.</span></li>
            </ul>
          </section>` : ''}
          ${dispute && dispute.status === 'resolved' ? notice({ tone: 'success', title: 'Dispute resolved', body: `Outcome: ${{ release: 'payment released', refund: 'payment refunded', resume: 'the task continued' }[dispute.outcome]}.` }) : ''}
          <section class="card" aria-labelledby="addr-h"><h2 id="addr-h" class="card__title">${icon('pin')} Location</h2>${address}</section>
          ${reviews.length ? html`<section aria-labelledby="rev-h"><h2 id="rev-h">Reviews for this task</h2><ul class="review-list">${reviews.map(reviewItem)}</ul></section>` : ''}
        </div>
        <aside class="stack">
          <section class="card">
            <h2 class="card__title">People</h2>
            <div class="stack-sm">${person(client, { sub: 'Client' })}${person(tasker, { sub: 'Tasker' })}</div>
          </section>
          <section class="card" aria-labelledby="pay-h">
            <h2 id="pay-h" class="card__title">${icon('euro')} Demo payment</h2>
            ${kv([
              ['Agreed price', fmt.money(b.price)],
              role !== 'tasker' ? [`Client service fee (${pct(APP.fees.clientServiceRate)})`, fmt.money(b.clientFee)] : null,
              role !== 'tasker' ? ['Client pays', html`<strong>${fmt.money(b.clientTotal)}</strong>`] : null,
              role !== 'client' ? [`Platform fee (${pct(APP.fees.taskerPlatformRate)})`, fmt.money(b.taskerFee)] : null,
              role !== 'client' ? ['Tasker receives', html`<strong>${fmt.money(b.taskerNet)}</strong>`] : null,
              ['Status', badge(PAYMENT_STATUS[asg.paymentStatus]?.label || asg.paymentStatus, PAYMENT_STATUS[asg.paymentStatus]?.tone)],
            ])}
            <p class="small muted">${t('demo.wallet')}</p>
            <a class="small" href="#/wallet">See all transactions</a>
          </section>
          ${role !== 'moderator' ? safetyLinks('assignment', asg.id, other.id) : ''}
        </aside>
      </div>
    </div>`;
  },
};

export const actions = {
  'asg-start'(el) {
    const res = startAssignment(el.dataset.asg, me().id);
    toast(res.ok ? 'Task started. Good luck!' : res.message, res.ok ? 'success' : 'danger');
  },
  async 'asg-complete'(el) {
    const asg = assignmentById(el.dataset.asg);
    const isClient = taskById(asg.taskId).clientId === me().id;
    const yes = await confirmDialog({
      title: 'Mark as completed?',
      body: isClient ? html`<p>This confirms the work is done and releases the demo payment to ${firstName(userById(asg.taskerId))}. You can then leave a review.</p>` : html`<p>The client is asked to confirm. The demo payment is released once they do.</p>`,
      confirmLabel: 'Mark as completed',
    });
    if (!yes) return;
    const res = markComplete(asg.id, me().id);
    if (!res.ok) return toast(res.message, 'danger');
    toast(res.status === 'completed' ? 'Completed. You can now leave a review.' : 'Marked as completed. Waiting for the client to confirm.');
  },
  async 'asg-confirm'(el) {
    const asg = assignmentById(el.dataset.asg);
    const yes = await confirmDialog({ title: 'Confirm the task is done?', body: html`<p>The demo payment of ${fmt.money(breakdown(asg.agreedPrice).taskerNet)} is released to ${firstName(userById(asg.taskerId))}. If something is not right, choose “Report a problem” instead.</p>`, confirmLabel: 'Confirm completion' });
    if (!yes) return;
    const res = confirmCompletion(asg.id, me().id);
    if (!res.ok) return toast(res.message, 'danger');
    toast('Thanks for confirming. Please leave a review.');
    go(`/assignments/${asg.id}/review`);
  },
  async 'asg-cancel'(el) {
    const asg = assignmentById(el.dataset.asg);
    const isTasker = asg.taskerId === me().id;
    const yes = await confirmDialog({ title: 'Cancel this assignment?', body: html`<p>${isTasker ? 'The task opens again for other taskers.' : 'The task is cancelled.'} The demo payment is refunded. Cancellations are recorded but never shown as a rating.</p>`, confirmLabel: 'Cancel assignment', cancelLabel: 'Keep it', tone: 'danger' });
    if (!yes) return;
    const res = cancelAssignment(asg.id, me().id, '');
    toast(res.ok ? 'Assignment cancelled.' : res.message, res.ok ? 'info' : 'danger');
  },
  async 'asg-share'(el) {
    const asg = assignmentById(el.dataset.asg);
    const yes = await confirmDialog({ title: 'Share the exact address?', body: html`<p>${firstName(userById(asg.taskerId))} will see the full address on this page. Only the accepted tasker can see it.</p>`, confirmLabel: 'Share address' });
    if (!yes) return;
    const res = shareAddress(asg.id, me().id);
    toast(res.ok ? 'Address shared.' : res.message, res.ok ? 'success' : 'danger');
  },
  'asg-message'(el) {
    const asg = assignmentById(el.dataset.asg);
    const task = taskById(asg.taskId);
    const existing = findConversation('task', task.id, [task.clientId, asg.taskerId]);
    const id = existing?.id || ensureTaskConversation(task.id, asg.taskerId).id;
    go(`/messages/${id}`);
  },
  'asg-dispute'(el) {
    clearErrors('dispute');
    openDialog({ title: 'Report a problem with this task', body: disputeForm(el.dataset.asg) });
  },
};

export const forms = {
  'asg-address'(form, data) {
    const asg = assignmentById(form.dataset.asg);
    const saved = setTaskAddress(asg.taskId, me().id, data.get('address') || '');
    if (!saved.ok) return setErrors('asg-address', saved.errors);
    clearErrors('asg-address');
    shareAddress(asg.id, me().id);
    toast(`Address shared with ${firstName(userById(asg.taskerId))}.`);
  },
  'open-dispute'(form, data) {
    const asgId = form.dataset.asg;
    const v = { reason: data.get('reason'), details: data.get('details') || '' };
    const res = openDispute(asgId, me().id, v);
    if (!res.ok) {
      if (res.message) { closeDialogs(); return toast(res.message, 'danger'); }
      setErrors('dispute', res.errors);
      const d = form.closest('dialog');
      d.querySelector('.dialog__body').innerHTML = String(disputeForm(asgId, v));
      d.querySelector('#error-summary')?.focus();
      return;
    }
    clearErrors('dispute');
    closeDialogs();
    toast('Dispute opened. Payment and reviews are paused, and a moderator will help.', 'info');
  },
};
