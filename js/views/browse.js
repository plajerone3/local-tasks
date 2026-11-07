// Browse tasks with search and filters. Filters live in UI state; results re-render as you type.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, select, input, emptyState } from '../ui/components.js';
import { ui, setUi } from '../ui/state.js';
import { visibleTasks, policyOf, myApplication } from '../select.js';
import { CATEGORIES, category } from '../data/categories.js';
import { CITIES, distanceKm } from '../data/geo.js';
import { taskCard, fitFor } from './common.js';
import { todayIso, diffDays, weekdayKey } from '../util.js';
import { announce } from '../ui/dialog.js';

const DEFAULTS = { q: '', category: '', city: '', distance: 'any', date: 'any', minPay: '', status: 'active', sort: 'recommended' };
let lastCount = null;
let debounce = null;

function matchesDate(task, f) {
  const d = diffDays(task.date, todayIso());
  if (f.date === 'today') return d === 0;
  if (f.date === 'week') return d >= 0 && d <= 7;
  if (f.date === 'weekend') return d >= 0 && d <= 7 && ['sat', 'sun'].includes(weekdayKey(task.date));
  if (f.date === 'month') return d >= 0 && d <= 30;
  return true;
}

export function filterTasks(viewer, role, f) {
  const q = f.q.trim().toLowerCase();
  const minPay = Number(f.minPay) || 0;
  let list = visibleTasks(viewer).filter((t) => {
    if (f.status === 'active' && !['open', 'under_review'].includes(t.status)) return false;
    if (f.status !== 'active' && f.status !== 'all' && t.status !== f.status) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.city && t.locationArea.city !== f.city) return false;
    if (q && !`${t.title} ${t.description} ${category(t.category).label}`.toLowerCase().includes(q)) return false;
    if (minPay && t.budgetMax < minPay) return false;
    if (!matchesDate(t, f)) return false;
    if (f.distance !== 'any' && viewer?.locationArea) {
      if (t.locationArea.city !== viewer.locationArea.city) return false;
      const km = distanceKm(viewer.locationArea, t.locationArea);
      if (f.distance === '3' && km > 3) return false;
      if (f.distance === '8' && km > 8) return false;
    }
    return true;
  });
  const withFit = list.map((t) => ({ task: t, fit: role === 'tasker' && viewer && t.status === 'open' && t.clientId !== viewer.id ? fitFor(t, viewer) : null }));
  const sorters = {
    recommended: (a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || b.task.createdAt.localeCompare(a.task.createdAt),
    newest: (a, b) => b.task.createdAt.localeCompare(a.task.createdAt),
    soonest: (a, b) => a.task.date.localeCompare(b.task.date),
    pay: (a, b) => b.task.budgetMax - a.task.budgetMax,
  };
  list = withFit.sort(sorters[f.sort] || (role === 'tasker' ? sorters.recommended : sorters.newest));
  return list;
}

export default {
  title: () => 'Find tasks',
  render(ctx) {
    if (ctx.query.category && ui._browseCat !== ctx.query.category) {
      ui._browseCat = ctx.query.category;
      ui.browse = { ...ui.browse, category: ctx.query.category };
    }
    const f = ui.browse;
    const viewer = ctx.user;
    const isTasker = ctx.role === 'tasker';
    const sort = isTasker ? f.sort : (f.sort === 'recommended' ? 'newest' : f.sort);
    const results = filterTasks(viewer, ctx.role, { ...f, sort });
    lastCount = results.length;
    const active = Object.entries(f).filter(([k, v]) => v !== DEFAULTS[k] && k !== 'sort').length;

    return html`<div class="wrap page">
      ${pageHead({ title: 'Find tasks', lead: 'Open tasks in Vienna, Graz and Linz. Only the area is shown; the exact address is shared with the accepted tasker.', actions: ctx.role === 'client' ? html`<a class="btn btn--primary" href="#/tasks/new">${icon('plus')}Post a task</a>` : '' })}
      <div class="browse">
        <form class="filters card" role="search" aria-label="Filter tasks" data-form="noop" novalidate>
          <div class="filters__head"><h2 class="filters__title">${icon('filter', 18)}Filters</h2>${active ? html`<button type="button" class="link-btn" data-action="browse-reset">Clear ${active}</button>` : ''}</div>
          ${input({ id: 'f-q', name: 'q', label: 'Search', type: 'search', value: f.q, placeholder: 'Hedge, sofa, dog…', extra: { 'data-input': 'browse-filter', autocomplete: 'off' } })}
          ${select({ id: 'f-category', name: 'category', label: 'Category', value: f.category, placeholder: 'All categories', options: CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}`, group: policyOf(c.id) === 'open' ? 'Available' : 'Manual review or coming soon' })), extra: { 'data-change': 'browse-filter' } })}
          ${select({ id: 'f-city', name: 'city', label: 'City', value: f.city, placeholder: 'All cities', options: CITIES.map((c) => ({ value: c.id, label: c.label })), extra: { 'data-change': 'browse-filter' } })}
          ${viewer?.locationArea ? select({ id: 'f-distance', name: 'distance', label: 'Distance from your area', value: f.distance, options: [{ value: 'any', label: 'Any distance' }, { value: 'city', label: 'My city' }, { value: '8', label: 'Within about 8 km' }, { value: '3', label: 'Within about 3 km' }], extra: { 'data-change': 'browse-filter' } }) : ''}
          ${select({ id: 'f-date', name: 'date', label: 'Date', value: f.date, options: [{ value: 'any', label: 'Any date' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Next 7 days' }, { value: 'weekend', label: 'This weekend' }, { value: 'month', label: 'Next 30 days' }], extra: { 'data-change': 'browse-filter' } })}
          ${input({ id: 'f-minPay', name: 'minPay', label: 'Budget at least (€)', type: 'number', value: f.minPay, min: 0, step: 5, inputmode: 'numeric', extra: { 'data-input': 'browse-filter' } })}
          ${select({ id: 'f-status', name: 'status', label: 'Status', value: f.status, options: [{ value: 'active', label: 'Open and in review' }, { value: 'open', label: 'Open only' }, { value: 'under_review', label: 'In manual review' }, { value: 'assigned', label: 'Tasker accepted' }, { value: 'completed', label: 'Completed' }, { value: 'all', label: 'All' }], extra: { 'data-change': 'browse-filter' } })}
          ${select({ id: 'f-sort', name: 'sort', label: 'Sort by', value: sort, options: [...(isTasker ? [{ value: 'recommended', label: 'Best fit for me' }] : []), { value: 'newest', label: 'Newest' }, { value: 'soonest', label: 'Soonest date' }, { value: 'pay', label: 'Highest budget' }], extra: { 'data-change': 'browse-filter' } })}
          ${isTasker ? html`<p class="small muted">“Best fit” uses your categories, skills, availability, area and reviews on similar work. Nobody can pay to rank higher.</p>` : ''}
        </form>
        <section class="results" aria-labelledby="results-h">
          <h2 id="results-h" class="results__count">${results.length} ${results.length === 1 ? 'task' : 'tasks'}</h2>
          ${results.length ? html`<div class="grid grid--cards">${results.map((r) => taskCard(r.task, { viewer, fit: r.fit && r.fit.level !== 'low' && !myApplication(r.task.id, viewer.id) ? r.fit : null }))}</div>`
            : emptyState({ ic: 'search', title: 'No tasks match these filters', body: active ? 'Try a wider distance, another date, or clear the filters.' : 'There are no open tasks right now. Check back soon.', actions: active ? html`<button type="button" class="btn btn--secondary" data-action="browse-reset">Clear filters</button>` : (ctx.role === 'client' ? html`<a class="btn btn--primary" href="#/tasks/new">Post a task</a>` : '') })}
        </section>
      </div>
    </div>`;
  },
  after() {
    if (lastCount != null) announce(`${lastCount} ${lastCount === 1 ? 'task' : 'tasks'} found`);
  },
};

function updateFilter(el) {
  ui.browse = { ...ui.browse, [el.name]: el.value };
}

export const inputs = {
  'browse-filter'(el) {
    updateFilter(el);
    clearTimeout(debounce);
    debounce = setTimeout(() => setUi({}), 160);
  },
};

export const changes = {
  'browse-filter'(el) {
    updateFilter(el);
    setUi({});
  },
};

export const actions = {
  'browse-reset'() {
    ui._browseCat = null;
    setUi({ browse: { ...DEFAULTS } }, { preserve: false });
    if (location.hash.includes('category=')) location.hash = '/tasks';
  },
};
