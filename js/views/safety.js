// Safety center: report, block, disputes, emergency guidance, privacy, category rules.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, statusBadge, badge } from '../ui/components.js';
import { me, reportsBy, blockedBy, userById, publicName, disputesOf, assignmentById, taskById, policyOf } from '../select.js';
import { CATEGORIES, POLICY } from '../data/categories.js';
import { REPORT_REASONS, TARGET_LABEL, DECISION_LABEL, unblockUser } from '../services/safety.js';
import { fmt, t } from '../i18n.js';
import { personAvatar, reportButton } from './common.js';
import { toast } from '../ui/dialog.js';

const EMERGENCY = [
  ['112', 'European emergency number'],
  ['133', 'Police'],
  ['144', 'Ambulance'],
  ['122', 'Fire brigade'],
  ['142', 'Telefonseelsorge (emotional support, 24/7, free)'],
];

export default {
  title: () => 'Safety center',
  render(ctx) {
    const user = ctx.user;
    const reports = user ? reportsBy(user.id) : [];
    const blocks = user ? blockedBy(user.id) : [];
    const disputes = user ? disputesOf(user.id) : [];
    const restricted = CATEGORIES.filter((c) => policyOf(c.id) !== 'open');
    return html`<div class="wrap page">
      ${pageHead({ eyebrow: 'Safety center', title: 'Staying safe and treated fairly', lead: 'How to report a problem, block someone, settle a dispute and control what others see. The prototype models these flows; a real launch adds trained moderators, identity checks and insurance.' })}
      <section class="card card--danger emergency" aria-labelledby="em-h">
        <h2 id="em-h" class="card__title">${icon('phone')} In an emergency, call first</h2>
        <ul class="emergency__list">${EMERGENCY.map(([n, label]) => html`<li><a class="emergency__num" href="tel:${n}">${n}</a><span>${label}</span></li>`)}</ul>
        <p class="small">If you feel unsafe during a task, you may leave at any time. That never counts against you. Report it here afterwards.</p>
      </section>
      <div class="layout">
        <div class="stack-lg">
          <section class="card" aria-labelledby="rep-h">
            <h2 id="rep-h" class="card__title">${icon('flag')} Report a problem</h2>
            <p>Use “Report” on any profile, task, message or assignment so the moderator sees exactly what you mean. For anything else:</p>
            ${user ? reportButton('other', 'general', { label: 'Report something else', cls: 'btn btn--secondary' }) : html`<a class="btn btn--secondary" href="#/signin?next=/safety">Sign in to report</a>`}
            <ul class="checklist checklist--sm"><li>${icon('check', 14)}<span>Reports go to a moderator. Nothing is removed automatically.</span></li><li>${icon('check', 14)}<span>The other person is not told who reported them.</span></li><li>${icon('check', 14)}<span>Reasons include: ${REPORT_REASONS.slice(0, 5).map((r) => r.label.toLowerCase()).join('; ')}.</span></li></ul>
          </section>
          ${user ? html`<section aria-labelledby="myrep-h"><h2 id="myrep-h">Your reports</h2>
            ${reports.length ? html`<ul class="row-list">${reports.map((r) => html`<li class="row-item"><div class="row-item__main"><span class="row-item__title">${REPORT_REASONS.find((x) => x.id === r.reason)?.label || r.reason}</span><span class="row-item__sub">About a ${TARGET_LABEL[r.targetType] || 'item'} · ${fmt.relative(r.createdAt)}${r.decision ? ` · outcome: ${DECISION_LABEL[r.decision]}` : ''}</span></div><div class="row-item__side">${statusBadge('report', r.status)}</div></li>`)}</ul>` : html`<p class="muted">You have not reported anything.</p>`}
          </section>
          <section aria-labelledby="disp-h"><h2 id="disp-h">Disputes</h2>
            <p class="small muted">Use “Report a problem” on an assignment to open one. While a dispute is open, the demo payment and reviews are paused for both sides, and nobody receives an automatic negative mark.</p>
            ${disputes.length ? html`<ul class="row-list">${disputes.map((d) => { const a = assignmentById(d.assignmentId); return html`<li class="row-item"><div class="row-item__main"><a class="row-item__title" href="#/assignments/${a.id}">${taskById(a.taskId).title}</a><span class="row-item__sub">Opened ${fmt.relative(d.createdAt)}</span></div><div class="row-item__side">${statusBadge('dispute', d.status)}</div></li>`; })}</ul>` : html`<p class="muted">No disputes.</p>`}
          </section>
          <section aria-labelledby="blk-h"><h2 id="blk-h">People you blocked</h2>
            ${blocks.length ? html`<ul class="row-list">${blocks.map((b) => { const u = userById(b.blockedId); return html`<li class="row-item"><div class="row-item__main"><span class="person">${personAvatar(u, 'sm')}<span>${publicName(u)}</span></span></div><div class="row-item__side"><button type="button" class="btn btn--secondary btn--sm" data-action="unblock" data-user="${u.id}">Unblock</button></div></li>`; })}</ul>` : html`<p class="muted">You have not blocked anyone. Blocking hides tasks, applications and messages in both directions.</p>`}
          </section>` : ''}
          <section aria-labelledby="cat-h"><h2 id="cat-h">Categories with extra rules</h2>
            <p class="small muted">Some work involves children, health, food, money or licensed trades. These categories are checked by a moderator first or are not bookable yet. Moderators can adjust this as the legal and insurance side is settled.</p>
            <div class="table-wrap" role="region" aria-labelledby="cat-h" tabindex="0"><table class="table"><thead><tr><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Why</th></tr></thead>
              <tbody>${restricted.map((c) => html`<tr><td><span aria-hidden="true">${c.emoji}</span> ${c.label}</td><td>${badge(POLICY[policyOf(c.id)].label, POLICY[policyOf(c.id)].tone)}</td><td class="small">${c.note || ''}</td></tr>`)}</tbody></table></div>
            <p class="small muted">Never allowed: anything illegal, weapons, drugs, adult services, debt collection, or asking anyone to pay to get work.</p>
          </section>
        </div>
        <aside class="stack">
          <section class="card"><h2 class="card__title">${icon('lock')} Privacy by default</h2>
            <ul class="checklist checklist--sm">
              <li>${icon('check', 14)}<span>${t('privacy.address')}</span></li>
              <li>${icon('check', 14)}<span>${t('privacy.contact')}</span></li>
              <li>${icon('check', 14)}<span>Others see your first name and last initial only.</span></li>
              <li>${icon('check', 14)}<span>Businesses only see you if you opt in.</span></li>
            </ul>
            ${user ? html`<a class="small" href="#/settings">Privacy settings</a>` : ''}
          </section>
          <section class="card"><h2 class="card__title">${icon('shield')} Before you meet</h2>
            <ul class="checklist checklist--sm">
              <li>${icon('check', 14)}<span>Keep messages and payment in the app.</span></li>
              <li>${icon('check', 14)}<span>Never send ID copies, bank details or money to get a task.</span></li>
              <li>${icon('check', 14)}<span>Tell someone where you are going.</span></li>
              <li>${icon('check', 14)}<span>Trust your instincts. You can leave.</span></li>
            </ul>
          </section>
          <section class="card card--soft"><h2 class="card__title">What this prototype does not do</h2>
            <ul class="checklist checklist--sm checklist--muted">
              <li>${icon('x', 14)}<span>Background or criminal record checks</span></li>
              <li>${icon('x', 14)}<span>Identity, licence or insurance checks</span></li>
              <li>${icon('x', 14)}<span>Real payments or payment protection</span></li>
              <li>${icon('x', 14)}<span>Guarantees of income, employment or safety</span></li>
            </ul>
            <p class="small muted">“Checked by moderator (demo)” means a person in the demo looked at an item. It is not an official verification.</p>
          </section>
        </aside>
      </div>
    </div>`;
  },
};

export const actions = {
  unblock(el) {
    unblockUser(me().id, el.dataset.user);
    toast(`${publicName(userById(el.dataset.user))} is unblocked.`, 'info');
  },
};

