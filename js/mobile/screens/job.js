// Job tracking (like following a trip), dispute sheet, and the rating screen.
import { html, attrs } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { errorsFor, setErrors, clearErrors } from '../../ui/state.js';
import { textarea, errorSummary, input } from '../../ui/components.js';
import { assignmentById, taskById, userById, me, firstName, publicName, disputeForAssignment, reviewByFor, publicReviewsAbout, findConversation } from '../../select.js';
import { category } from '../../data/categories.js';
import { district, city } from '../../data/geo.js';
import { fmt } from '../../i18n.js';
import { APP } from '../../config.js';
import { breakdown, pct } from '../../logic/money.js';
import { summarize } from '../../logic/reputation.js';
import { PAYMENT_STATUS } from '../../logic/status.js';
import { startAssignment, markComplete, confirmCompletion, cancelAssignment, shareAddress, setTaskAddress, submitReview } from '../../services/marketplace.js';
import { openDispute, DISPUTE_REASONS } from '../../services/safety.js';
import { ensureTaskConversation } from '../../services/messaging.js';
import { reportButton } from '../../views/common.js';
import { screen, catBadge, chip, mAvatar, stars, emptyM, PALETTE } from '../ui.js';
import { openDialog, closeDialogs, toast, confirmDialog } from '../../ui/dialog.js';
import { go } from '../../router.js';

const STAGES = ['Booked', 'Working', 'Check', 'Done'];
const STAGE_OF = { accepted: 0, in_progress: 1, awaiting_confirmation: 2, completed: 3, disputed: 2, cancelled: 0 };

function headline(asg, role, other) {
  const n = firstName(other);
  const me_ = role === 'tasker';
  return {
    accepted: [me_ ? '📅' : '🙌', me_ ? 'You’re booked' : `${n} is booked`, me_ ? 'Tap “Start” when you begin.' : 'Share the exact address when you’re ready.', 'sky'],
    in_progress: ['🛠️', me_ ? 'You’re on the job' : `${n} is on the job`, me_ ? 'Mark it done when you finish.' : 'You can mark it done yourself when it’s finished.', 'sun'],
    awaiting_confirmation: ['🔎', me_ ? `Waiting for ${n}` : `${n} says it’s done`, me_ ? 'The demo payment is released when they confirm.' : 'Have a look, then confirm or report a problem.', 'bubble'],
    completed: ['🎉', 'All done', 'Reviews are open for both of you.', 'mint'],
    disputed: ['⏸️', 'Paused: dispute open', 'Payment and reviews wait until it’s settled. No automatic bad marks.', 'tomato'],
    cancelled: ['🚫', 'Cancelled', 'The demo payment was refunded. Cancellations are never shown as a rating.', 'stone'],
  }[asg.status];
}

function disputeSheet(asgId, v = {}) {
  const e = errorsFor('m-dispute');
  return html`<form data-form="m-dispute" data-asg="${asgId}" novalidate class="m-stack">
    <p class="m-small">A dispute pauses the demo payment and reviews for both of you. A moderator helps you agree a fair outcome. Nobody gets a bad mark automatically.</p>
    ${errorSummary(e, 'md')}
    <fieldset class="m-fieldset" id="md-reason" tabindex="-1"><legend class="m-label">What happened?</legend>
      <div class="m-radios">${DISPUTE_REASONS.map((r, i) => html`<label class="m-radio c-${PALETTE[i % PALETTE.length]}"><input ${attrs({ type: 'radio', name: 'reason', value: r.id, checked: v.reason === r.id })}><span>${r.label}</span></label>`)}</div>
      ${e.reason ? html`<p class="field__error">${icon('alert', 16)}<span>${e.reason}</span></p>` : ''}
    </fieldset>
    ${textarea({ id: 'md-details', name: 'details', label: 'Details, and what would be fair', value: v.details || '', rows: 4, error: e.details })}
    <button class="m-btn m-btn--danger m-btn--block" type="submit">Open dispute</button>
  </form>`;
}

export const track = {
  title: () => 'Your job',
  render(ctx) {
    const asg = assignmentById(ctx.params.id);
    const user = ctx.user;
    const task = asg && taskById(asg.taskId);
    const role = asg && (user.id === asg.taskerId ? 'tasker' : user.id === task.clientId ? 'client' : null);
    if (!role) return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: '🔒', title: 'Only the client and the tasker can see this job' })}</div>` });
    const other = userById(role === 'tasker' ? task.clientId : asg.taskerId);
    const otherRep = summarize(publicReviewsAbout(other.id));
    const [emoji, title, sub, color] = headline(asg, role, other);
    const stage = STAGE_OF[asg.status];
    const b = breakdown(asg.agreedPrice);
    const dispute = disputeForAssignment(asg.id);
    const reviewed = reviewByFor(asg.id, user.id);
    const pay = PAYMENT_STATUS[asg.paymentStatus];
    const live = ['accepted', 'in_progress', 'awaiting_confirmation'].includes(asg.status);

    let where;
    if (role === 'client') {
      where = asg.addressShared ? html`<span>${task.exactAddress} <span class="m-small m-muted">· shared with ${firstName(other)}</span></span>`
        : task.exactAddress ? html`<span>${task.exactAddress} <span class="m-small m-muted">· only you see this</span></span>`
          : html`<span>${district(task.locationArea).label}, ${city(task.locationArea.city).label}</span>`;
    } else {
      where = asg.addressShared && task.exactAddress ? html`<span>${task.exactAddress}</span>` : html`<span>${district(task.locationArea).label} <span class="m-small m-muted">· exact address once ${firstName(other)} shares it</span></span>`;
    }

    let footer = '';
    if (role === 'tasker' && asg.status === 'accepted') footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block m-btn--lg" data-action="m-start" data-asg="${asg.id}">${icon('play', 18)}Start task</button>`;
    else if (role === 'tasker' && asg.status === 'in_progress') footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block m-btn--lg" data-action="m-done" data-asg="${asg.id}">${icon('check', 18)}Mark as done</button>`;
    else if (role === 'client' && asg.status === 'awaiting_confirmation') footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block m-btn--lg" data-action="m-confirm" data-asg="${asg.id}">${icon('check', 18)}Confirm it’s done</button>`;
    else if (role === 'client' && ['accepted', 'in_progress'].includes(asg.status)) footer = html`<button type="button" class="m-btn m-btn--primary m-btn--block m-btn--lg" data-action="m-done" data-asg="${asg.id}">${icon('check', 18)}Mark as done</button>`;
    else if (asg.status === 'completed' && !reviewed) footer = html`<a class="m-btn m-btn--primary m-btn--block m-btn--lg" href="#/job/${asg.id}/rate">${icon('star', 18)}Rate ${firstName(other)}</a>`;

    const content = html`
      <section class="m-track c-${color}" aria-labelledby="track-title">
        <span class="m-track__emoji" aria-hidden="true">${emoji}</span>
        <h1 class="m-track__title" id="track-title" tabindex="-1">${title}</h1>
        <p class="m-track__sub">${sub}</p>
        <ol class="m-stages" aria-label="Progress">${STAGES.map((s, i) => html`<li class="m-stages__item${i <= stage && asg.status !== 'cancelled' ? ' is-done' : ''}${i === stage ? ' is-current' : ''}" ${i === stage ? attrs({ 'aria-current': 'step' }) : ''}><span class="m-stages__bar"></span><span class="m-stages__label">${s}</span></li>`)}</ol>
      </section>
      <div class="m-pad m-stack">
        <div class="m-card m-who">
          <a class="m-person" href="#/profile/${other.id}">${mAvatar(other, 'lg')}<span><strong>${publicName(other)}</strong><span class="m-small">${role === 'tasker' ? 'Client' : 'Tasker'} · ${stars(otherRep.avg, otherRep.count)}</span></span></a>
          <div class="m-round-actions">
            <button type="button" class="m-round c-sky" data-action="m-chat" data-asg="${asg.id}">${icon('message', 22)}<span>Message</span></button>
            <span class="m-round c-stone is-disabled" aria-disabled="true" title="Phone numbers stay private">${icon('phone', 22)}<span>Call</span></span>
            <a class="m-round c-tomato" href="#/safety">${icon('shield', 22)}<span>Safety</span></a>
            ${role === 'client' && !asg.addressShared && live ? html`<button type="button" class="m-round c-lime" data-action="m-share" data-asg="${asg.id}">${icon('pin', 22)}<span>Address</span></button>` : ''}
          </div>
          <p class="m-fine">Calls are off by design. Phone numbers stay private unless you share them in the chat.</p>
        </div>
        <div class="m-card">
          <div class="m-row-inline">${catBadge(task.category)}<strong class="m-grow">${task.title}</strong></div>
          <ul class="m-facts">
            <li>${icon('calendar', 18)}<span>${fmt.dateLong(task.date)} · ${fmt.window(task.timeWindow)}</span></li>
            <li>${icon('pin', 18)}${where}</li>
          </ul>
        </div>
        <div class="m-card m-pay">
          <h2 class="m-h4">${icon('euro', 18)} Demo payment ${pay ? chip(pay.label, { info: 'sky', success: 'mint', warn: 'sun', neutral: 'stone' }[pay.tone]) : ''}</h2>
          <dl class="m-dl">
            <div><dt>Agreed price</dt><dd>${fmt.money(b.price)}</dd></div>
            ${role === 'client' ? html`<div><dt>Service fee (${pct(APP.fees.clientServiceRate)})</dt><dd>${fmt.money(b.clientFee)}</dd></div><div class="m-dl__total"><dt>You pay</dt><dd>${fmt.money(b.clientTotal)}</dd></div>`
              : html`<div><dt>Platform fee (${pct(APP.fees.taskerPlatformRate)})</dt><dd>−${fmt.money(b.taskerFee)}</dd></div><div class="m-dl__total"><dt>You receive</dt><dd>${fmt.money(b.taskerNet)}</dd></div>`}
          </dl>
          <p class="m-fine">Demo wallet: no real money is transferred.</p>
        </div>
        ${role === 'client' && !task.exactAddress && live ? html`<form class="m-card" data-form="m-address" data-asg="${asg.id}" novalidate>
          ${input({ id: 'm-address', name: 'address', label: 'Add the exact address', error: errorsFor('m-address').address, autocomplete: 'street-address', hint: `Only ${firstName(other)} will see it.` })}
          <button class="m-btn m-btn--soft m-btn--sm" type="submit">${icon('pin', 16)}Save and share</button>
        </form>` : ''}
        ${dispute && dispute.status === 'open' ? html`<div class="m-card m-card--tint c-tomato-soft"><h2 class="m-h4">${icon('pause', 18)} Dispute</h2><p class="m-small">${DISPUTE_REASONS.find((r) => r.id === dispute.reason)?.label}. Opened by ${publicName(userById(dispute.openedBy))} ${fmt.relative(dispute.createdAt)}.</p><blockquote class="m-quote">${dispute.details}</blockquote></div>` : ''}
        ${reviewed ? html`<p class="m-note c-mint">${icon('check', 16)}<span>You rated ${firstName(other)} ${reviewed.stars} ★.</span></p>` : ''}
        <div class="m-links">
          ${live ? html`<button type="button" class="m-link" data-action="m-dispute-open" data-asg="${asg.id}">${icon('flag', 16)}Report a problem</button>` : reportButton('assignment', asg.id, { userId: other.id, cls: 'm-link' })}
          ${['accepted', 'in_progress'].includes(asg.status) ? html`<button type="button" class="m-link" data-action="m-cancel" data-asg="${asg.id}">Cancel</button>` : ''}
        </div>
      </div>`;
    const top = html`<header class="m-top m-top--float"><a class="m-iconbtn m-iconbtn--solid" href="#/activity" aria-label="Back to activity">${icon('back', 22)}</a><span class="m-top__spacer"></span></header>`;
    return screen({ ctx, top, content, footer, tabs: !footer, cls: 'm-screen--track' });
  },
};

const TAGS = {
  tasker: { good: ['On time', 'Friendly', 'Careful', 'Thorough', 'Good communication', 'Fair price', 'Went the extra mile'], improve: ['Arrived late', 'Missed details', 'Communication could improve'] },
  client: { good: ['Clear instructions', 'Friendly', 'Accurate description', 'Respectful', 'Well prepared'], improve: ['Task was bigger than described', 'Hard to reach', 'Changed plans late'] },
};

export const rate = {
  title: () => 'Rate',
  render(ctx) {
    const asg = assignmentById(ctx.params.id);
    const user = ctx.user;
    const task = asg && taskById(asg.taskId);
    const isClient = task && user.id === task.clientId;
    if (!asg || (!isClient && user.id !== asg.taskerId)) return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: '🔒', title: 'Not your job' })}</div>` });
    const other = userById(isClient ? asg.taskerId : task.clientId);
    if (reviewByFor(asg.id, user.id) || asg.status !== 'completed') {
      return screen({ ctx, content: html`<div class="m-pad">${emptyM({ emoji: asg.status === 'disputed' ? '⏸️' : '✅', title: asg.status === 'disputed' ? 'Reviews are paused during a dispute' : asg.status !== 'completed' ? 'You can rate once the job is done' : 'Thanks, you already rated this job', action: html`<a class="m-btn m-btn--primary" href="#/job/${asg.id}">Back to the job</a>` })}</div>` });
    }
    const e = errorsFor('m-rate');
    const tags = TAGS[isClient ? 'tasker' : 'client'];
    const content = html`<form class="m-pad m-rate" id="m-rate-form" data-form="m-rate" data-asg="${asg.id}" novalidate>
      <div class="m-rate__who">${mAvatar(other, 'xl')}<h1 class="m-h1" tabindex="-1">How was ${firstName(other)}?</h1><p class="m-muted">${task.title}</p></div>
      ${errorSummary(e, 'mr')}
      <fieldset class="m-bigstars" id="mr-stars" tabindex="-1"><legend class="visually-hidden">Rating out of 5</legend>
        ${[1, 2, 3, 4, 5].map((n) => html`<label class="m-bigstars__star"><input ${attrs({ type: 'radio', name: 'stars', value: n })}><span aria-hidden="true">★</span><span class="visually-hidden">${n} ${n === 1 ? 'star' : 'stars'}</span></label>`)}
        ${e.stars ? html`<p class="field__error">${icon('alert', 16)}<span>${e.stars}</span></p>` : ''}
      </fieldset>
      <fieldset class="m-fieldset"><legend class="m-label">What went well?</legend><div class="m-chips-wrap">${tags.good.map((x, i) => html`<label class="m-tagpick c-${PALETTE[i % PALETTE.length]}"><input type="checkbox" name="tags" value="${x}"><span>${x}</span></label>`)}</div></fieldset>
      <fieldset class="m-fieldset"><legend class="m-label">Could be better</legend><div class="m-chips-wrap">${tags.improve.map((x) => html`<label class="m-tagpick c-stone"><input type="checkbox" name="tags" value="${x}"><span>${x}</span></label>`)}</div></fieldset>
      ${textarea({ id: 'mr-comment', name: 'comment', label: 'Anything to add?', rows: 3, error: e.comment, optional: true, hint: 'Required for 1 or 2 stars. Describe this task, not the person.' })}
      <label class="m-toggle-row"><input type="checkbox" name="private" value="on"><span class="m-switch" aria-hidden="true"><span class="m-switch__knob"></span></span><span><strong>Private feedback only</strong><span class="m-small">Not shown on their profile or counted in the rating.</span></span></label>
    </form>`;
    const footer = html`<button type="submit" form="m-rate-form" class="m-btn m-btn--primary m-btn--block m-btn--lg">Submit rating</button>`;
    const top = html`<header class="m-top"><a class="m-iconbtn" href="#/job/${asg.id}" aria-label="Close">${icon('x', 22)}</a><span class="m-top__spacer"></span></header>`;
    return screen({ ctx, top, content, footer, tabs: false });
  },
};

export const actions = {
  'm-start'(el) {
    const res = startAssignment(el.dataset.asg, me().id);
    toast(res.ok ? 'Started. Good luck!' : res.message, res.ok ? 'success' : 'danger');
  },
  async 'm-done'(el) {
    const asg = assignmentById(el.dataset.asg);
    const isClient = taskById(asg.taskId).clientId === me().id;
    const yes = await confirmDialog({ title: 'Mark as done?', body: isClient ? html`<p>This confirms the work is finished and releases the demo payment to ${firstName(userById(asg.taskerId))}.</p>` : html`<p>The client is asked to confirm. The demo payment is released once they do.</p>`, confirmLabel: 'Mark as done' });
    if (!yes) return;
    const res = markComplete(asg.id, me().id);
    if (!res.ok) return toast(res.message, 'danger');
    toast(res.status === 'completed' ? 'Done! Time to rate.' : 'Marked as done. Waiting for the client.');
    if (res.status === 'completed') go(`/job/${asg.id}/rate`);
  },
  async 'm-confirm'(el) {
    const asg = assignmentById(el.dataset.asg);
    const yes = await confirmDialog({ title: 'Confirm it’s done?', body: html`<p>${firstName(userById(asg.taskerId))} receives ${fmt.money(breakdown(asg.agreedPrice).taskerNet)} (demo). Not happy? Choose “Report a problem” instead.</p>`, confirmLabel: 'Confirm' });
    if (!yes) return;
    const res = confirmCompletion(asg.id, me().id);
    if (!res.ok) return toast(res.message, 'danger');
    go(`/job/${asg.id}/rate`);
  },
  async 'm-cancel'(el) {
    const yes = await confirmDialog({ title: 'Cancel this job?', body: html`<p>The demo payment is refunded. Cancellations are recorded but never shown as a rating.</p>`, confirmLabel: 'Cancel job', cancelLabel: 'Keep it', tone: 'danger' });
    if (!yes) return;
    const res = cancelAssignment(el.dataset.asg, me().id, '');
    toast(res.ok ? 'Job cancelled.' : res.message, res.ok ? 'info' : 'danger');
  },
  async 'm-share'(el) {
    const asg = assignmentById(el.dataset.asg);
    if (!taskById(asg.taskId).exactAddress) return document.getElementById('m-address')?.focus();
    const yes = await confirmDialog({ title: 'Share the exact address?', body: html`<p>Only ${firstName(userById(asg.taskerId))} will see it, on this screen.</p>`, confirmLabel: 'Share' });
    if (!yes) return;
    const res = shareAddress(asg.id, me().id);
    toast(res.ok ? 'Address shared.' : res.message, res.ok ? 'success' : 'danger');
  },
  'm-chat'(el) {
    const asg = assignmentById(el.dataset.asg);
    const task = taskById(asg.taskId);
    const conv = findConversation('task', task.id, [task.clientId, asg.taskerId]) || { id: ensureTaskConversation(task.id, asg.taskerId).id };
    go(`/inbox/${conv.id}`);
  },
  'm-dispute-open'(el) {
    clearErrors('m-dispute');
    openDialog({ title: 'Report a problem', body: disputeSheet(el.dataset.asg) });
  },
};

export const forms = {
  'm-dispute'(form, data) {
    const v = { reason: data.get('reason'), details: data.get('details') || '' };
    const res = openDispute(form.dataset.asg, me().id, v);
    if (!res.ok) {
      if (res.message) { closeDialogs(); return toast(res.message, 'danger'); }
      setErrors('m-dispute', res.errors);
      const d = form.closest('dialog');
      d.querySelector('.dialog__body').innerHTML = String(disputeSheet(form.dataset.asg, v));
      d.querySelector('#error-summary')?.focus();
      return;
    }
    clearErrors('m-dispute');
    closeDialogs();
    toast('Dispute opened. Payment and reviews are paused, and a moderator will help.', 'info');
  },
  'm-address'(form, data) {
    const asg = assignmentById(form.dataset.asg);
    const res = setTaskAddress(asg.taskId, me().id, data.get('address') || '');
    if (!res.ok) return setErrors('m-address', res.errors);
    clearErrors('m-address');
    shareAddress(asg.id, me().id);
    toast('Address saved and shared.');
  },
  'm-rate'(form, data) {
    const res = submitReview(form.dataset.asg, me().id, { stars: data.get('stars'), tags: data.getAll('tags'), comment: data.get('comment') || '', visibility: data.get('private') === 'on' ? 'private' : 'public' });
    if (!res.ok) {
      if (res.message) return toast(res.message, 'danger');
      return setErrors('m-rate', res.errors);
    }
    clearErrors('m-rate');
    toast('Thanks for rating! It helps everyone find good help.');
    go(`/job/${form.dataset.asg}`);
  },
};

