// Form validation with plain-language messages. Each validator returns { field: message }.
import { diffDays } from '../util.js';
import { fmt, tr } from '../i18n.js';

const filled = (v) => v != null && String(v).trim() !== '';
const len = (v) => String(v ?? '').trim().length;
const num = (v) => (filled(v) ? Number(String(v).replace(',', '.')) : NaN);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateTask(d, { today, policy }) {
  const e = {};
  if (len(d.title) < 8) e.title = tr('Add a short title so taskers know what the task is (at least 8 characters).');
  else if (len(d.title) > 90) e.title = tr('Keep the title under 90 characters.');
  if (!filled(d.category)) e.category = tr('Choose a category.');
  else if (policy === 'soon') e.category = tr('This category is not bookable yet. Please choose another one.');
  if (len(d.description) < 30) e.description = tr('Describe the task in a few sentences (at least 30 characters): what needs doing, how big it is, and anything to bring.');
  else if (len(d.description) > 2000) e.description = tr('Keep the description under 2,000 characters.');
  if (!filled(d.date)) e.date = tr('Choose a date.');
  else if (d.date < today) e.date = tr('That date is in the past. Choose today or a later date.');
  else if (diffDays(d.date, today) > 180) e.date = tr('Choose a date within the next six months.');
  if (!filled(d.start) || !filled(d.end)) e.start = tr('Add a start and an end time.');
  else if (d.end <= d.start) e.start = tr('The end time needs to be later than the start time.');
  if (!filled(d.area)) e.area = tr('Choose the area where the task happens.');
  const min = num(d.budgetMin);
  const max = num(d.budgetMax);
  if (!Number.isFinite(min) || min < 10) e.budgetMin = tr('Set a minimum budget of at least {amount}.', { amount: fmt.money0(10) });
  else if (!Number.isFinite(max) || max < min) e.budgetMin = tr('The maximum budget needs to be the same as or higher than the minimum.');
  else if (max > 5000) e.budgetMin = tr('Tasks above {amount} are not supported in this prototype.', { amount: fmt.money0(5000) });
  if (filled(d.estimatedHours)) {
    const h = num(d.estimatedHours);
    if (!(h >= 0.5 && h <= 24)) e.estimatedHours = tr('Estimated time should be between 0.5 and 24 hours.');
  }
  if (len(d.exactAddress) > 0 && len(d.exactAddress) < 5) e.exactAddress = tr('That address looks too short.');
  return e;
}

export function validateApplication(d) {
  const e = {};
  if (len(d.note) < 20) e.note = tr('Write a short note (at least 20 characters) about why you are a good fit.');
  else if (len(d.note) > 1000) e.note = tr('Keep your note under 1,000 characters.');
  const p = num(d.proposedRate);
  if (!Number.isFinite(p) || p < 10) e.proposedRate = tr('Propose a price of at least {amount}.', { amount: fmt.money0(10) });
  else if (p > 5000) e.proposedRate = tr('Prices above {amount} are not supported in this prototype.', { amount: fmt.money0(5000) });
  if (len(d.availability) < 3) e.availability = tr('Say when you can do the task.');
  return e;
}

export function validateSignup(d) {
  const e = {};
  if (len(d.name) < 2) e.name = tr('Enter your name (at least 2 characters).');
  if (!EMAIL.test(String(d.email || '').trim())) e.email = tr('Enter an email address like name@example.com.');
  if (!d.roles?.length) e.roles = tr('Choose at least one way to use the platform.');
  if (!d.agree) e.agree = tr('Please confirm that you have read the community guidelines.');
  return e;
}

export function validateTaskerAbout(d) {
  const e = {};
  if (!filled(d.area)) e.area = tr('Choose your location area. We only ever show the area, never your address.');
  if (!d.languages?.length) e.languages = tr('Choose at least one language you can work in.');
  if (len(d.headline) < 10) e.headline = tr('Add a headline of at least 10 characters, for example "Reliable help with moves and events".');
  else if (len(d.headline) > 100) e.headline = tr('Keep the headline under 100 characters.');
  if (len(d.bio) > 800) e.bio = tr('Keep your bio under 800 characters.');
  return e;
}

export function validateTaskerWork(d) {
  const e = {};
  if (!d.categories?.length) e.categories = tr('Choose at least one kind of task you would like to do.');
  const min = num(d.rateMin);
  const max = num(d.rateMax);
  if (!Number.isFinite(min) || min < 5) e.rateMin = tr('Set a minimum hourly rate of at least {amount}.', { amount: fmt.money0(5) });
  else if (!Number.isFinite(max) || max < min) e.rateMin = tr('The maximum rate needs to be the same as or higher than the minimum.');
  else if (max > 250) e.rateMin = tr('Hourly rates above {amount} are not supported in this prototype.', { amount: fmt.money0(250) });
  if (!d.slotCount) e.availability = tr('Tick at least one time slot when you are usually available.');
  return e;
}

export function validateOpportunity(d) {
  const e = {};
  if (d.seeking && !d.consent) e.consent = tr('Please confirm that you understand what businesses will be able to see.');
  if (d.seeking && !d.types?.length) e.types = tr('Choose at least one kind of work you are open to.');
  return e;
}

export function validateProof(d) {
  const e = {};
  if (len(d.label) < 3) e.label = tr('Describe the proof, for example "First-aid course, Red Cross 2025".');
  if (!filled(d.type)) e.type = tr('Choose what kind of proof this is.');
  return e;
}

export function validateClient(d) {
  const e = {};
  if (!filled(d.area)) e.area = tr('Choose your location area.');
  return e;
}

export function validateBusiness(d) {
  const e = {};
  if (len(d.companyName) < 2) e.companyName = tr('Enter the organisation name.');
  if (!filled(d.field)) e.field = tr('Choose the field your organisation works in.');
  if (!filled(d.size)) e.size = tr('Choose the organisation size.');
  if (!filled(d.area)) e.area = tr('Choose where the organisation is based.');
  if (len(d.description) < 20) e.description = tr('Describe the organisation in a sentence or two (at least 20 characters).');
  if (d.recruitingEnabled && !d.consent) e.consent = tr('To search candidates, please agree to the recruiting rules.');
  return e;
}

export function validateReview(d) {
  const e = {};
  const s = Number(d.stars);
  if (!(s >= 1 && s <= 5)) e.stars = tr('Choose a star rating from 1 to 5.');
  else if (s <= 2 && len(d.comment) < 20) e.comment = tr('Please add a short comment (at least 20 characters) about what went wrong. It helps the other person improve.');
  if (len(d.comment) > 1000) e.comment = tr('Keep your comment under 1,000 characters.');
  return e;
}

export function validateReport(d) {
  const e = {};
  if (!filled(d.reason)) e.reason = tr('Choose what the problem is.');
  if (len(d.details) < 10) e.details = tr('Add a few words about what happened (at least 10 characters).');
  return e;
}

export function validateDispute(d) {
  const e = {};
  if (!filled(d.reason)) e.reason = tr('Choose what the dispute is about.');
  if (len(d.details) < 20) e.details = tr('Describe what happened and what outcome you think is fair (at least 20 characters).');
  return e;
}

export function validateConnection(d) {
  const e = {};
  if (len(d.message) < 20) e.message = tr('Write a short, specific message (at least 20 characters): the role, the place and why you are reaching out.');
  else if (len(d.message) > 1000) e.message = tr('Keep the message under 1,000 characters.');
  return e;
}

export function validateMessage(d) {
  const e = {};
  if (len(d.body) < 1) e.body = tr('Write a message first.');
  else if (len(d.body) > 2000) e.body = tr('Keep messages under 2,000 characters.');
  return e;
}

export function validateAccount(d) {
  const e = {};
  if (len(d.name) < 2) e.name = tr('Enter your name (at least 2 characters).');
  if (!EMAIL.test(String(d.email || '').trim())) e.email = tr('Enter an email address like name@example.com.');
  if (!filled(d.area)) e.area = tr('Choose your location area.');
  return e;
}

export const hasErrors = (e) => Object.keys(e).length > 0;
