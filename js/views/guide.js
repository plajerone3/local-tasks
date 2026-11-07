// Guided demo: one-click entry points for every core flow.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead } from '../ui/components.js';
import { demoAccountList } from './common.js';

const FLOWS = [
  { n: 1, title: 'Post a task as a client', body: 'Fill in the form, check the preview, publish. The task appears in Browse and on the client dashboard.', user: 'u_katharina', role: 'client', to: '/tasks/new', cta: 'Start as Katharina' },
  { n: 2, title: 'Apply as a tasker', body: 'Open a recommended task, read why it is recommended, and apply. The application appears in the client’s applicant review.', user: 'u_tobias', role: 'tasker', to: '/tasks/t_event', cta: 'Start as Tobias (newcomer)' },
  { n: 3, title: 'Compare applicants and accept one', body: 'Two applicants for a sofa move: compare price, availability, reviews on similar work and proof. Accepting updates the task and creates an assignment.', user: 'u_katharina', role: 'client', to: '/tasks/t_sofa/applicants', cta: 'Review applicants' },
  { n: 4, title: 'Confirm completion and review', body: 'A newcomer finished his first task. Confirm it, then leave a review: his profile’s rating and history update.', user: 'u_martin', role: 'client', to: '/assignments/as_wardrobe', cta: 'Start as Martin' },
  { n: 5, title: 'Mark work as done from the tasker side', body: 'Ana is cleaning right now. Mark the task as completed; the client then confirms.', user: 'u_ana', role: 'tasker', to: '/assignments/as_clean', cta: 'Start as Ana' },
  { n: 6, title: 'Become visible to businesses', body: 'Lukas is not visible yet. Turn on “visible for stable work” in Settings and read exactly what businesses can see.', user: 'u_lukas', role: 'tasker', to: '/settings', cta: 'Start as Lukas' },
  { n: 7, title: 'Search candidates and send a request', body: 'A gardening firm searches opted-in people by relevant evidence and sends a connection request.', user: 'u_gruenraum', role: 'business', to: '/candidates', cta: 'Start as GrünRaum' },
  { n: 8, title: 'Answer a recruiting request', body: 'Ferdinand has a request from a gardening firm waiting in his recruiting inbox.', user: 'u_ferdinand', role: 'tasker', to: '/recruiting', cta: 'Start as Ferdinand' },
  { n: 9, title: 'Report something and moderate it', body: 'Report a task or message: it gets a visible “pending moderation” state, nothing is deleted. Then review it as the moderator.', user: 'u_mira', role: 'moderator', to: '/moderation', cta: 'Start as the moderator' },
  { n: 10, title: 'See a dispute in action', body: 'A dropped box of glasses: the payment is on hold and the review is paused while the dispute is open.', user: 'u_sophie', role: 'client', to: '/assignments/as_storage', cta: 'Start as Sophie' },
];

export default {
  title: () => 'Guided demo',
  render() {
    return html`<div class="wrap page">
      ${pageHead({ eyebrow: 'Guided demo', title: 'Try every part of the product in a few minutes', lead: 'Each step signs you in as a seeded demo account and opens the right screen. Your changes persist in this browser, including after a refresh. Use “Reset” in the top strip to start over.' })}
      <ol class="guide">
        ${FLOWS.map((f) => html`<li class="guide__item card">
          <span class="guide__n" aria-hidden="true">${f.n}</span>
          <div class="guide__body"><h2 class="guide__title">${f.title}</h2><p class="muted">${f.body}</p></div>
          <button type="button" class="btn btn--secondary btn--sm" data-action="demo-login" data-user="${f.user}" data-role="${f.role}" data-next="${f.to}">${f.cta}${icon('chevron', 16)}</button>
        </li>`)}
      </ol>
      <section class="section--flush" aria-labelledby="all-accounts">
        <h2 id="all-accounts">All demo accounts</h2>
        <p class="muted">Tip: open a second browser tab. Each tab can be signed in as a different person, and both stay in sync.</p>
        ${demoAccountList()}
      </section>
    </div>`;
  },
};
