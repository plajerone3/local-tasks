// Sign in, sign up, and the "sign in to continue" gate.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { input, choices, checkbox, errorSummary, notice, pageHead } from '../ui/components.js';
import { errorsFor, setErrors, clearErrors } from '../ui/state.js';
import { signIn, signUp } from '../services/accounts.js';
import { demoAccountList, homeFor } from './common.js';
import { go } from '../router.js';
import { toast } from '../ui/dialog.js';

const ROLE_OPTIONS = [
  { value: 'client', label: 'Get tasks done', hint: 'Post tasks and hire local help (Client)' },
  { value: 'tasker', label: 'Earn by doing tasks', hint: 'Build a profile and apply to tasks (Tasker)' },
  { value: 'business', label: 'Recruit for my organisation', hint: 'Find opted-in people for stable work (Business)' },
];

export const signin = {
  title: () => 'Sign in',
  render(ctx) {
    const e = errorsFor('signin');
    return html`<div class="wrap page page--narrow">
      ${pageHead({ title: 'Sign in', lead: 'Pick a demo account to explore, or sign in with the email of an account you created.' })}
      <section class="card" aria-labelledby="demo-h">
        <h2 id="demo-h" class="card__title">Demo accounts</h2>
        ${demoAccountList({ next: ctx.query.next || '' })}
      </section>
      <section class="card" aria-labelledby="email-h">
        <h2 id="email-h" class="card__title">Sign in with email</h2>
        ${notice({ tone: 'demo', body: 'Demo sign-in: there is no password. Real sign-in would use secure, passwordless email links or another proper method.' })}
        <form data-form="signin" novalidate>
          ${errorSummary(e, 'signin')}
          ${input({ id: 'signin-email', name: 'email', label: 'Email', type: 'email', autocomplete: 'email', error: e.email, required: true })}
          <input type="hidden" name="next" value="${ctx.query.next || ''}">
          <div class="row"><button class="btn btn--primary" type="submit">Sign in</button><a href="#/signup">Create an account instead</a></div>
        </form>
      </section>
    </div>`;
  },
};

export const signup = {
  title: () => 'Create an account',
  render(ctx) {
    const e = errorsFor('signup');
    const preset = ctx.query.role ? [ctx.query.role] : [];
    return html`<div class="wrap page page--narrow">
      ${pageHead({ title: 'Create an account', lead: 'One account can post tasks and do tasks. Organisations get a separate business account with recruiting tools.' })}
      <form class="card" data-form="signup" novalidate>
        ${errorSummary(e, 'signup')}
        ${input({ id: 'signup-name', name: 'name', label: 'Your name', autocomplete: 'name', error: e.name, required: true, hint: 'Other people see your first name and the first letter of your last name.' })}
        ${input({ id: 'signup-email', name: 'email', label: 'Email', type: 'email', autocomplete: 'email', error: e.email, required: true, hint: 'Never shown to other people.' })}
        ${choices({ id: 'signup-roles', name: 'roles', legend: 'What would you like to do?', options: ROLE_OPTIONS, values: preset, error: e.roles, required: true, hint: 'Choose Client, Tasker or both. Business accounts are for organisations.', cls: 'choices--stack' })}
        ${checkbox({ id: 'signup-agree', name: 'agree', label: 'I have read the community guidelines: be honest, respectful and safe, and keep payments and contact in the app.', error: e.agree })}
        <div class="row"><button class="btn btn--primary" type="submit">Create account</button><a href="#/signin">I already have an account</a></div>
        <p class="small muted">Demo: your account is stored only in this browser. No email is sent.</p>
      </form>
    </div>`;
  },
};

export const signinGate = {
  title: () => 'Sign in to continue',
  render(ctx) {
    return html`<div class="wrap page page--narrow">
      ${pageHead({ title: 'Sign in to continue', lead: 'This page needs an account. Choose a demo account to continue straight to it.' })}
      <div class="card">${demoAccountList({ next: ctx.path + (Object.keys(ctx.query).length ? `?${new URLSearchParams(ctx.query)}` : '') })}</div>
      <p><a href="#/signin">Sign in with email</a> · <a href="#/signup">Create an account</a></p>
    </div>`;
  },
};

export const forms = {
  signin(form, data) {
    const res = signIn(data.get('email'));
    if (!res.ok) return setErrors('signin', res.errors);
    clearErrors('signin');
    toast('Signed in.', 'info');
    go(data.get('next') || homeFor(res.role));
  },
  signup(form, data) {
    let roles = data.getAll('roles');
    if (roles.includes('business') && roles.length > 1) {
      return setErrors('signup', { roles: 'A business account is for an organisation. Choose Business on its own, or Client and/or Tasker for a personal account.' });
    }
    const res = signUp({ name: data.get('name'), email: data.get('email'), roles, agree: data.get('agree') === 'on' });
    if (!res.ok) return setErrors('signup', res.errors);
    clearErrors('signup');
    toast('Account created. Let’s set up your profile.');
    roles = roles.length ? roles : ['client'];
    go(`/onboarding/${roles.includes('tasker') ? 'tasker' : roles[0]}`);
  },
};

export const actions = {};
export { icon };
