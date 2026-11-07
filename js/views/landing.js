// Public landing page.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { badge, fitBadge } from '../ui/components.js';
import { CATEGORIES } from '../data/categories.js';
import { visibleTasks, policyOf, userById, taskerProfileOf } from '../select.js';
import { taskCard, fitFor, personAvatar } from './common.js';
import { t } from '../i18n.js';
import { APP } from '../config.js';

function step(n, title, body) {
  return html`<li class="step"><span class="step__n" aria-hidden="true">${n}</span><div><h4 class="step__title">${title}</h4><p class="step__body">${body}</p></div></li>`;
}

export default {
  title: () => 'Practical help nearby',
  render() {
    const open = visibleTasks(null).filter((x) => x.status === 'open' && !x.hidden && policyOf(x.category) === 'open' && x.budgetMax < 400);
    const hedge = open.find((x) => x.id === 't_hedge') || open[0];
    const tobias = userById('u_tobias');
    const sampleFit = hedge && tobias && taskerProfileOf(tobias.id) ? fitFor(hedge, tobias, 'client') : null;
    const cats = CATEGORIES.filter((c) => policyOf(c.id) === 'open');
    const review = CATEGORIES.filter((c) => policyOf(c.id) !== 'open');

    return html`
    <section class="hero">
      <div class="wrap hero__grid">
        <div class="hero__copy">
          <p class="eyebrow">Vienna · Graz · Linz</p>
          <h1 class="hero__title" tabindex="-1">Find practical help for the work you do not have time for.</h1>
          <p class="hero__lead">Post a small task and compare local taskers by price, availability, reviews on similar work, and proof of what they can do. Or offer your time and skills, and build a reputation that can open doors.</p>
          <div class="row hero__cta">
            <a class="btn btn--primary btn--lg" href="#/signup?role=client">${icon('plus')}Post a task</a>
            <a class="btn btn--secondary btn--lg" href="#/signup?role=tasker">Earn as a tasker</a>
          </div>
          <p class="small muted">Just looking? <a href="#/guide">Take the guided demo</a> or <a href="#/tasks">browse open tasks</a>. No sign-up needed.</p>
        </div>
        <div class="hero__visual">
          ${hedge ? html`<div class="hero-card">
            ${taskCard(hedge, { showFitText: false })}
            ${sampleFit ? html`<div class="hero-card__applicant">
              <div class="row row--tight">${personAvatar(tobias, 'sm')}<strong>Tobias L.</strong>${badge('New here', 'accent', 'sparkle')}${fitBadge(sampleFit)}</div>
              <p class="small">${sampleFit.explanation}</p>
            </div>` : ''}
          </div>` : ''}
          <p class="hero__caption small muted">Real demo data. Each recommendation explains itself, and newcomers get a fair start.</p>
        </div>
      </div>
    </section>

    <section class="section" id="how" aria-labelledby="how-h">
      <div class="wrap">
        <h2 id="how-h" class="section__title">How it works</h2>
        <div class="grid grid--3">
          <div class="card card--soft">
            <h3 class="card__title">${icon('home')} For clients</h3>
            <ol class="steps-list">
              ${step(1, 'Describe the task', 'Say what, when, roughly where, and your budget. You see a preview before you publish.')}
              ${step(2, 'Compare applicants', 'Price, availability, relevant reviews and proof, side by side, with the reasons someone is suggested.')}
              ${step(3, 'Confirm and review', 'Mark the work as done, see the demo transaction, and leave a fair review.')}
            </ol>
          </div>
          <div class="card card--soft" id="taskers">
            <h3 class="card__title">${icon('user')} For taskers</h3>
            <ol class="steps-list">
              ${step(1, 'Show what you can do', 'Categories, skills, availability, rates and optional proof. No degree required.')}
              ${step(2, 'Apply with a short note', 'You see the exact earnings after fees before you apply.')}
              ${step(3, 'Build your reputation', 'Every completed task adds to a record that belongs to you.')}
            </ol>
          </div>
          <div class="card card--soft">
            <h3 class="card__title">${icon('briefcase')} For businesses</h3>
            <ol class="steps-list">
              ${step(1, 'Create a company profile', 'Field, location and the kind of roles you are hiring for.')}
              ${step(2, 'Search opted-in people', 'Only taskers who chose to be visible for stable work appear.')}
              ${step(3, 'Connect respectfully', 'Send a request. The tasker decides whether to talk.')}
            </ol>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--tint" aria-labelledby="examples-h">
      <div class="wrap">
        <div class="section-head"><h2 id="examples-h" class="section__title">Tasks people post</h2><a href="#/tasks">See all open tasks ${icon('chevron', 16)}</a></div>
        <ul class="cat-grid">${cats.map((c) => html`<li><a class="cat-tile" href="#/tasks?category=${c.id}"><span class="cat-tile__icon" aria-hidden="true">${c.emoji}</span><span>${c.label}</span></a></li>`)}</ul>
        <div class="grid grid--cards">${open.slice(0, 3).map((x) => taskCard(x))}</div>
        <p class="small muted">Some categories need extra care: ${review.slice(0, 4).map((c) => c.label.toLowerCase()).join(', ')} and others go through manual review or are coming later. <a href="#/safety">Why?</a></p>
      </div>
    </section>

    <section class="section" aria-labelledby="opportunity-h">
      <div class="wrap split">
        <div>
          <p class="eyebrow">Tasker opportunity</p>
          <h2 id="opportunity-h" class="section__title">Show what you can do. Build trust one completed task at a time.</h2>
          <p>Being reliable, careful and good with people is valuable, with or without a degree. Your profile shows the evidence: reviews on similar work, a completion record once there is enough of it, and proof you choose to add.</p>
          <ul class="checklist">
            <li>${icon('check')}<span><strong>A fair start.</strong> New taskers get extra visibility in recommendations, so an empty history does not mean being invisible.</span></li>
            <li>${icon('check')}<span><strong>No overall score.</strong> ${t('fair.noScore')}</span></li>
            <li>${icon('check')}<span><strong>Clear earnings.</strong> You see the agreed price, the ${Math.round(APP.fees.taskerPlatformRate * 100)}% platform fee and what you keep before you apply.</span></li>
            <li>${icon('check')}<span><strong>Your reputation is yours.</strong> Export it any time from Settings.</span></li>
          </ul>
          <a class="btn btn--primary" href="#/signup?role=tasker">Create a tasker profile</a>
        </div>
        <div class="card explain-card">
          <h3 class="card__title">What a recommendation looks like</h3>
          <p class="explain-card__quote">“Recommended because you selected gardening, you are usually available on Wednesday afternoons, it is about 2 km from your area, and you are new here (new taskers get a fair start).”</p>
          <p class="small muted">Inputs: category, relevant skills, availability, distance, reviews on similar work, completion record, relevant proof, budget fit, newcomer boost. Never used: age, gender, origin, religion, disability, photos, payments, or how often someone logs in.</p>
        </div>
      </div>
    </section>

    <section class="section section--tint" id="business" aria-labelledby="business-h">
      <div class="wrap split">
        <div>
          <p class="eyebrow">Business recruiting</p>
          <h2 id="business-h" class="section__title">${t('recruiting.promise')}</h2>
          <p>Taskers can switch on “visible for stable work”. Businesses that agree to the recruiting rules can then search them by evidence that matters for their field, and send a connection request. The tasker decides whether to talk.</p>
          <ul class="checklist">
            <li>${icon('check')}<span>A gardening firm sees gardening history and gardening proof.</span></li>
            <li>${icon('check')}<span>A financial services firm sees economics or finance proof, and general reliability.</span></li>
            <li>${icon('check')}<span>Nobody sees phone numbers, emails, addresses or private messages.</span></li>
            <li>${icon('check')}<span>Taskers can switch visibility off at any time.</span></li>
          </ul>
          <a class="btn btn--secondary" href="#/signup?role=business">Create a business profile</a>
        </div>
        <div class="card">
          <h3 class="card__title">The rules businesses agree to</h3>
          <ol class="numbered">
            <li>Contact candidates only through the platform.</li>
            <li>Respect each candidate’s visibility settings and replies.</li>
            <li>No copying candidate data into other systems without their consent.</li>
            <li>Never ask about age, family plans, religion or origin.</li>
          </ol>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="trust-h">
      <div class="wrap">
        <h2 id="trust-h" class="section__title">Trust and safety, built in</h2>
        <div class="grid grid--3 trust-grid">
          <div class="trust">${icon('pin', 22)}<h3>Approximate areas only</h3><p>${t('privacy.address')} Taskers see the district until they are accepted.</p></div>
          <div class="trust">${icon('lock', 22)}<h3>Contact details hidden</h3><p>${t('privacy.contact')} Keep the conversation in the app.</p></div>
          <div class="trust">${icon('file', 22)}<h3>Honest proof labels</h3><p>Every proof item shows whether it is self-reported, pending review or checked.</p></div>
          <div class="trust">${icon('flag', 22)}<h3>Report and block everywhere</h3><p>On profiles, tasks, messages and assignments. Reports never delete content automatically.</p></div>
          <div class="trust">${icon('pause', 22)}<h3>Disputes pause consequences</h3><p>While a dispute is open, ratings and payments wait. Nobody is penalised automatically.</p></div>
          <div class="trust">${icon('info', 22)}<h3>No hidden fees</h3><p>Fees appear before you accept. No countdowns, no pressure, no pay-to-rank.</p></div>
        </div>
        ${html`<div class="notice notice--demo"><span class="notice__icon">${icon('info', 20)}</span><div class="notice__body"><p class="notice__title">What this prototype does not do yet</p><div class="notice__text">No real payments, no background checks, no identity, insurance or licence checks. Payments shown are demo-only. <a href="#/safety">Read the safety center</a>.</div></div></div>`}
      </div>
    </section>

    <section class="cta-band">
      <div class="wrap cta-band__inner">
        <h2 class="cta-band__title">Ready to try it?</h2>
        <div class="row row--center">
          <a class="btn btn--primary btn--lg" href="#/signup">Get started</a>
          <a class="btn btn--secondary btn--lg" href="#/guide">${icon('compass')}Guided demo</a>
        </div>
      </div>
    </section>`;
  },
  after(ctx) {
    const s = ctx.query.s;
    if (s) document.getElementById(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
};
