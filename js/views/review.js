// Review form: stars, structured tags, comment, visibility. Neutral link to dispute/report.
import { html, attrs } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, choices, textarea, errorSummary, notice, emptyState } from '../ui/components.js';
import { errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { assignmentById, taskById, userById, me, firstName, reviewByFor } from '../select.js';
import { submitReview } from '../services/marketplace.js';
import { go } from '../router.js';
import { toast } from '../ui/dialog.js';

const TAGS_FOR_TASKER = { good: ['On time', 'Friendly', 'Careful', 'Thorough', 'Good communication', 'Fair price', 'Went the extra mile', 'Well prepared'], improve: ['Arrived late', 'Missed details', 'Communication could improve'] };
const TAGS_FOR_CLIENT = { good: ['Clear instructions', 'Friendly', 'Accurate description', 'Respectful', 'Well prepared'], improve: ['Task was bigger than described', 'Hard to reach', 'Changed plans late'] };
const STAR_LABELS = ['', 'Poor', 'Below expectations', 'OK', 'Good', 'Excellent'];

function starInput(value, error) {
  return html`<fieldset class="field fieldset stars-input${error ? ' field--error' : ''}" id="review-stars" tabindex="-1">
    <legend class="field__label">Overall rating<span class="req" aria-hidden="true"> *</span></legend>
    <div class="stars-input__row">${[1, 2, 3, 4, 5].map((n) => html`<label class="stars-input__star">
      <input ${attrs({ type: 'radio', name: 'stars', value: n, id: `review-stars-${n}`, checked: Number(value) === n })}>
      <span aria-hidden="true">★</span><span class="stars-input__label">${n} – ${STAR_LABELS[n]}</span>
    </label>`)}</div>
    ${error ? html`<p class="field__error">${icon('alert', 16)}<span>${error}</span></p>` : ''}
  </fieldset>`;
}

export default {
  title: () => 'Leave a review',
  render(ctx) {
    const asg = assignmentById(ctx.params.id);
    if (!asg) return html`<div class="wrap page">${emptyState({ title: 'Assignment not found' })}</div>`;
    const task = taskById(asg.taskId);
    const user = ctx.user;
    const isClient = user.id === task.clientId;
    if (!isClient && user.id !== asg.taskerId) return html`<div class="wrap page">${notice({ tone: 'warn', title: 'Only the people on this task can review it.' })}</div>`;
    const other = userById(isClient ? asg.taskerId : task.clientId);
    const existing = reviewByFor(asg.id, user.id);
    const back = { href: `/assignments/${asg.id}`, label: 'Back to assignment' };
    if (existing) return html`<div class="wrap page page--narrow">${pageHead({ back, title: 'Review sent', lead: `You reviewed ${firstName(other)} for “${task.title}”. Thank you.` })}<a class="btn btn--secondary" href="#/profile/${other.id}">View ${firstName(other)}’s profile</a></div>`;
    if (asg.status === 'disputed') return html`<div class="wrap page page--narrow">${pageHead({ back, title: 'Reviews are paused' })}${notice({ tone: 'warn', body: 'While a dispute is open, neither side can leave a review. This protects both of you from a review written in the heat of the moment.' })}</div>`;
    if (asg.status !== 'completed') return html`<div class="wrap page page--narrow">${pageHead({ back, title: 'Not ready for a review yet' })}${notice({ tone: 'info', body: 'You can leave a review once the task is marked as completed and confirmed.' })}</div>`;

    const e = errorsFor('review');
    const tags = isClient ? TAGS_FOR_TASKER : TAGS_FOR_CLIENT;
    return html`<div class="wrap page page--narrow">
      ${pageHead({ back, eyebrow: 'Review', title: `How did it go with ${firstName(other)}?`, lead: `For “${task.title}”. A review describes this one task, not the person as a whole.` })}
      <form class="card" data-form="review" data-asg="${asg.id}" novalidate>
        ${errorSummary(e, 'review')}
        ${starInput(null, e.stars)}
        ${choices({ id: 'review-good', name: 'tags', legend: 'What went well?', options: tags.good.map((x) => ({ value: x, label: x })) })}
        ${choices({ id: 'review-improve', name: 'tags', legend: 'What could be better?', options: tags.improve.map((x) => ({ value: x, label: x })), hint: 'Optional. Specific, kind feedback helps people improve.' })}
        ${textarea({ id: 'review-comment', name: 'comment', label: 'Comment', rows: 4, error: e.comment, optional: true, hint: 'Required for ratings of 1 or 2 stars. Please stick to what happened during the task.' })}
        ${choices({ id: 'review-visibility', name: 'visibility', legend: 'Who can see this review?', type: 'radio', values: ['public'], options: [{ value: 'public', label: 'Public on their profile', hint: 'Counts towards their rating summary.' }, { value: 'private', label: 'Private feedback to the platform only', hint: 'Not shown on their profile and not counted in the rating.' }], cls: 'choices--stack' })}
        <div class="form-actions"><a class="btn btn--ghost" href="#/assignments/${asg.id}">Later</a><button class="btn btn--primary" type="submit">Publish review</button></div>
        <p class="small muted">Something serious happened? <a href="#/safety">Report it in the Safety center</a> instead of, or as well as, a review. Reports go to a moderator.</p>
      </form>
    </div>`;
  },
};

export const forms = {
  review(form, data) {
    const asgId = form.dataset.asg;
    const res = submitReview(asgId, me().id, { stars: data.get('stars'), tags: data.getAll('tags'), comment: data.get('comment') || '', visibility: data.get('visibility') });
    if (!res.ok) {
      if (res.message) return toast(res.message, 'danger');
      return setErrors('review', res.errors);
    }
    clearErrors('review');
    const reviewee = userById(res.revieweeId);
    toast(data.get('visibility') === 'private' ? 'Thanks — your private feedback was sent.' : `Thanks — your review is now on ${firstName(reviewee)}’s profile.`);
    go(reviewee.roles.includes('tasker') && taskById(assignmentById(asgId).taskId).clientId === me().id ? `/profile/${reviewee.id}` : `/assignments/${asgId}`);
  },
};
