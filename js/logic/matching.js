// Transparent, contextual recommendations.
//
// There is deliberately no function that scores a person in general. Every score is
// for one task (taskFit) or one business field (candidateFit), every score comes with
// the plain-language reasons that produced it, and the inputs never include protected
// characteristics (age, gender, origin, religion, disability, photo) or payments.
// Low activity is never a negative signal; newcomers get a small exposure boost.
import { APP } from '../config.js';
import { category, catWord, catSkills } from '../data/categories.js';
import { field as fieldById } from '../data/fields.js';
import { distanceKm, city, cityName } from '../data/geo.js';
import { joinList, slotsForWindow, weekdayKey, WEEKDAY_LABEL } from '../util.js';
import { summarize, reliability } from './reputation.js';
import { fmt, tr, getLang } from '../i18n.js';

export const LEVEL_LABEL = { strong: 'Strong fit', good: 'Good fit', possible: 'Possible fit', low: 'Not a close fit' };
export const LEVEL_TONE = { strong: 'success', good: 'info', possible: 'neutral', low: 'neutral' };

export const NOT_USED = [
  'age, gender, origin, religion or disability',
  'profile photos',
  'payments or subscriptions',
  'how often someone logs in',
];

export function levelFor(score) {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'good';
  if (score >= 25) return 'possible';
  return 'low';
}

const firstName = (u) => String(u?.name || '').split(' ')[0];
const PROOF_WEIGHT = { verified: 1, pending_review: 0.75, self_reported: 0.4, rejected: 0 };
const PROOF_NOTE = { verified: 'checked by a moderator in the demo', pending_review: 'pending review', self_reported: 'self-reported' };
const proofNote = (status) => tr(PROOF_NOTE[status]);

// "Wednesday afternoons" / "mittwochs nachmittags"
const DAY_ADV = { mon: 'montags', tue: 'dienstags', wed: 'mittwochs', thu: 'donnerstags', fri: 'freitags', sat: 'samstags', sun: 'sonntags' };
const SLOT_ADV = { morning: 'vormittags', afternoon: 'nachmittags', evening: 'abends' };
const when = (day, slot) => (getLang() === 'de' ? `${DAY_ADV[day]} ${SLOT_ADV[slot] || ''}`.trim() : `${WEEKDAY_LABEL[day]} ${slot ? `${slot}s` : ''}`.trim());

function textHit(skill, text) {
  return skill.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length >= 4).some((w) => text.includes(w.slice(0, 6)));
}

const ORDER = ['low', 'possible', 'good', 'strong'];
const capLevel = (level, max) => (ORDER.indexOf(level) > ORDER.indexOf(max) ? max : level);

// factors: { key, points, you, they }. `they` is a phrase without the name: "offers gardening",
// in German a verb-final clause ("Gartenarbeit anbietet"), so they can be joined after "weil <name>".
function finish(rawFactors, caveats, { you, name, lowText, maxLevel = 'strong' }) {
  const factors = rawFactors.map((f) => ({ ...f, text: you ? f.you : `${name} ${f.they}` }));
  const score = Math.round(factors.reduce((a, f) => a + f.points, 0));
  const level = capLevel(levelFor(score), maxLevel);
  const top = factors
    .filter((f) => f.points > 0 && f.key !== 'newcomer')
    .sort((a, b) => b.points - a.points)
    .slice(0, 4);
  const newcomer = factors.find((f) => f.key === 'newcomer');
  if (newcomer) top.push(newcomer);
  const phrases = top.map((f) => (you ? f.you : f.they));
  const reasons = `${you ? '' : `${name} `}${joinList(phrases, tr('and'))}`;
  const explanation = level === 'low' || !phrases.length
    ? lowText
    : tr(level === 'possible' ? 'A possible fit: {reasons}.' : 'Recommended because {reasons}.', { reasons });
  return { score, level, label: tr(LEVEL_LABEL[level]), tone: LEVEL_TONE[level], factors, caveats, explanation, perspective: you ? 'self' : 'other', name };
}

/**
 * How well one tasker fits one task.
 * perspective 'tasker' writes reasons as "you …", 'client' as "<name> …".
 */
export function taskFit({ task, tasker, profile, reviews = [], proofs = [], perspective = 'tasker' }) {
  const you = perspective === 'tasker';
  const name = firstName(tasker);
  const factors = [];
  const caveats = [];
  const add = (key, points, youText, theyText) => factors.push({ key, points, you: youText, they: theyText });
  let maxLevel = 'strong';
  const cat = category(task.category);
  const catName = catWord(task.category);
  const p = profile || { categories: [], skills: [], availability: {} };

  // 1. Category fit
  if (p.categories.includes(task.category)) add('category', 30, tr('you selected {cat}', { cat: catName }), tr('offers {cat}', { cat: catName }));
  else if ((cat.related || []).some((r) => p.categories.includes(r))) add('category', 12, tr('it is close to work you already do'), tr('does related work'));
  else {
    maxLevel = 'possible';
    caveats.push(you ? tr('You have not selected {cat} on your profile.', { cat: catName }) : tr('{name} has not listed {cat}.', { name, cat: catName }));
  }

  // 2. Relevant skills
  const taskText = `${task.title} ${task.description} ${(task.requirements || []).join(' ')}`.toLowerCase();
  const known = catSkills(task.category);
  const direct = p.skills.filter((s) => textHit(s, taskText));
  const inCategory = p.skills.filter((s) => !direct.includes(s) && known.includes(s));
  const skillPoints = Math.min(18, direct.length * 6 + inCategory.length * 3);
  const shown = joinList([...direct, ...inCategory].slice(0, 2), tr('and'));
  if (skillPoints > 0) add('skills', skillPoints, tr('your skills ({skills}) match', { skills: shown }), tr('lists {skills}', { skills: shown }));

  // 3. Availability on that weekday and time of day
  const day = weekdayKey(task.date);
  const slots = slotsForWindow(task.timeWindow);
  const open = slots.filter((s) => (p.availability?.[day] || []).includes(s));
  if (open.length) add('availability', 15, tr('you are usually available on {when}', { when: when(day, open[0]) }), tr('is usually available on {when}', { when: when(day, open[0]) }));
  else if (maxLevel === 'strong') maxLevel = 'good';
  if (!open.length) caveats.push(you ? tr('You have not marked {when} as available.', { when: when(day, slots[0]) }) : tr('{name} has not marked {when} as usually available — check the application.', { name, when: when(day, slots[0]) }));

  // 4. Location area
  const km = distanceKm(task.locationArea, tasker.locationArea);
  const sameCity = task.locationArea?.city === tasker.locationArea?.city;
  if (sameCity && km != null && km <= 3) add('location', 15, tr('it is about {km} km from your area', { km: Math.max(1, Math.round(km)) }), tr('is about {km} km away', { km: Math.max(1, Math.round(km)) }));
  else if (sameCity && km != null && km <= 8) add('location', 11, tr('it is about {km} km from your area', { km: Math.round(km) }), tr('is about {km} km away', { km: Math.round(km) }));
  else if (sameCity) add('location', 7, tr('it is in {city}, where you work', { city: cityName(task.locationArea.city) }), tr('works in {city}', { city: cityName(task.locationArea.city) }));
  else {
    maxLevel = 'low';
    caveats.push(you ? tr('This task is in another city.') : tr('{name} is based in another city.', { name }));
  }

  // 5. Reviews for similar work (not overall popularity)
  const rep = summarize(reviews);
  const sim = rep.byCategory[task.category];
  if (sim && sim.count >= 3 && sim.avg >= 4.5) {
    const v = { avg: fmt.rating(sim.avg), n: sim.count, cat: catName };
    add('reviews', 12, tr('you have strong reviews on similar work ({avg} from {n} {cat} tasks)', v), tr('has strong reviews on similar work ({avg} from {n} {cat} tasks)', v));
  } else if (sim && sim.count >= 1 && sim.avg >= 4) add('reviews', 7, tr('you have good reviews on similar work'), tr('has good reviews on similar work'));
  else if (rep.count >= 3 && rep.avg >= 4.5) add('reviews', 4, tr('you have strong reviews on other tasks'), tr('has strong reviews on other tasks'));

  // 6. Reliable completion record (only counts when there is enough history; never negative)
  const rel = reliability(p);
  if (rel && rel.rate >= 0.9) add('reliability', 6, tr('you have a dependable completion record'), tr('has a dependable completion record ({done} of {accepted} accepted tasks completed)', { done: rel.completed, accepted: rel.accepted }));

  // 7. Relevant proof
  const relevant = proofs.filter((pr) => cat.proofKeywords?.some((k) => pr.label.toLowerCase().includes(k)) && pr.status !== 'rejected');
  if (relevant.length) {
    const best = relevant.sort((a, b) => PROOF_WEIGHT[b.status] - PROOF_WEIGHT[a.status])[0];
    const v = { label: best.label, note: proofNote(best.status) };
    add('proof', Math.round(8 * PROOF_WEIGHT[best.status]), tr('your proof “{label}” is relevant ({note})', v), tr('has relevant proof: “{label}”, {note}', v));
  }

  // 8. Budget fits the tasker's usual rate
  if (task.estimatedHours && p.rateMin) {
    const hourly = task.budgetMax / task.estimatedHours;
    if (hourly >= p.rateMin) add('budget', 5, tr('the budget fits your usual rate'), tr('usually charges within this budget'));
    else caveats.push(you ? tr('The budget works out below your usual minimum of {rate}/h.', { rate: fmt.money0(p.rateMin) }) : tr('{name}’s usual minimum is {rate}/h.', { name, rate: fmt.money0(p.rateMin) }));
  }

  // 9. Newcomer exposure: an empty history should not mean invisibility
  if ((p.completedTaskCount || 0) < APP.newcomerThreshold) {
    add('newcomer', 8, tr('you are new here (new taskers get a fair start)'), tr('is new here (newcomers get a fair start, so check the profile and proof)'));
  }

  return finish(factors, caveats, {
    you,
    name,
    lowText: you ? tr('Shown because it matches your filters. It is not a close match for your profile yet.') : tr('Shown because {name} applied. The profile is not a close match for this task.', { name }),
    maxLevel,
  });
}

/**
 * How relevant an opted-in tasker is to one business field.
 * Callers must only pass taskers who passed isRecruitable().
 */
export function candidateFit({ business, tasker, profile, reviews = [], proofs = [], fieldId }) {
  const fieldDef = fieldById(fieldId || business.field) || { categories: [], keywords: [], proofKeywords: [], label: 'this field' };
  const name = firstName(tasker);
  const factors = [];
  const caveats = [];
  const add = (key, points, they) => factors.push({ key, points, they, you: they });
  const goal = profile.employmentGoal || {};
  const fieldName = fieldDef.label.toLowerCase();
  const workName = fieldDef.short || fieldName;

  // Stated goal: what the tasker said they want
  if ((goal.fields || []).includes(fieldDef.id)) add('goal', 15, `is looking for work in ${fieldName}`);
  const wanted = business.hiringIntent?.types || [];
  const typeMatch = (goal.types || []).filter((t) => wanted.includes(t));
  if (typeMatch.length) add('type', 8, 'is open to the kind of role you offer');
  else if (wanted.length) caveats.push(`${name} did not list the employment types you offer.`);

  // Relevant proof, weighted by review status
  const relevant = proofs.filter((pr) => pr.status !== 'rejected' && fieldDef.proofKeywords.some((k) => pr.label.toLowerCase().includes(k)));
  relevant.sort((a, b) => PROOF_WEIGHT[b.status] - PROOF_WEIGHT[a.status]);
  relevant.slice(0, 2).forEach((pr, i) => add(`proof${i}`, Math.round(18 * PROOF_WEIGHT[pr.status]) - i * 4, `has relevant proof: “${pr.label}”, ${PROOF_NOTE[pr.status]}`));

  // Skills that relate to the field
  const skills = profile.skills.filter((s) => fieldDef.keywords.some((k) => s.toLowerCase().includes(k)));
  if (skills.length) add('skills', Math.min(18, skills.length * 6), `lists ${joinList(skills.slice(0, 2))}`);

  // Task history and review quality, only in the field's own categories
  const rep = summarize(reviews);
  const inField = fieldDef.categories.map((c) => rep.byCategory[c]).filter(Boolean);
  const fieldCount = inField.reduce((a, c) => a + c.count, 0);
  const fieldAvg = fieldCount ? inField.reduce((a, c) => a + c.sum, 0) / fieldCount : null;
  if (fieldCount >= 10) add('history', 18, `has completed ${fieldCount} ${workName} tasks here`);
  else if (fieldCount >= 3) add('history', 12, `has completed ${fieldCount} ${workName} tasks here`);
  else if (fieldCount >= 1) add('history', 6, `has some ${workName} task history`);
  if (fieldAvg != null && fieldCount >= 3 && fieldAvg >= 4.7) add('quality', 14, `averages ${fmt.rating(fieldAvg)} on ${workName} work`);
  else if (fieldAvg != null && fieldAvg >= 4.3) add('quality', 9, `has good reviews on ${workName} work`);

  // General dependability, useful when the field has no task categories (e.g. finance)
  if (!fieldCount && (profile.completedTaskCount || 0) >= 5 && rep.avg >= 4.3) add('reliability', 6, `has a dependable record across ${profile.completedTaskCount} completed tasks`);

  // Location
  if (tasker.locationArea?.city === business.locationArea?.city) add('location', 10, `is based in ${city(business.locationArea.city).label}`);
  else caveats.push(`${name} is based in ${city(tasker.locationArea.city)?.label || 'another city'}.`);

  if ((profile.completedTaskCount || 0) < APP.newcomerThreshold) {
    add('newcomer', 5, 'is new to tasks here, so most evidence comes from proof and profile');
  }

  return finish(factors, caveats, { you: false, name, lowText: `Shown because ${name} matches your filters, but there is little evidence relevant to ${workName} work yet.` });
}

/** The consent gate. Nobody appears to businesses without opting in. */
export function isRecruitable(user, profile) {
  return !!(user?.roles?.includes('tasker') && user.discoverableToBusinesses && profile?.employmentGoal?.seeking);
}
