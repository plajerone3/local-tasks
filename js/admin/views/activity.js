// Live activity across the whole app, and the staff audit log.
import { html } from '../../ui/html.js';
import { icon } from '../../ui/icons.js';
import { getState } from '../../store.js';
import { staffList, userById } from '../../select.js';
import { can } from '../../logic/staff.js';
import { DAY_MS } from '../../util.js';
import { logExport } from '../../services/backoffice.js';
import { toast } from '../../ui/dialog.js';
import { GROUPS, eventInfo, isDecision, nameOf, peopleIn } from '../events.js';
import { head, filters, timeline, table, staffChip, when, ago, downloadCsv, section } from '../ui.js';

const RANGES = { '': 'Any time', '1': 'Last 24 hours', '7': 'Last 7 days', '30': 'Last 30 days' };

function filtered(query, base = getState().activity) {
  const q = String(query.q || '').trim().toLowerCase();
  const days = Number(query.range) || 0;
  const now = Date.now();
  return base.filter((e) => {
    if (query.group && eventInfo(e.type).group !== query.group) return false;
    if (query.actor && e.actorKind !== query.actor) return false;
    if (query.user && !peopleIn(e).has(query.user) && e.actorId !== query.user) return false;
    if (days && now - new Date(e.at).getTime() > days * DAY_MS) return false;
    if (q) {
      const hay = `${nameOf(e.actorId)} ${eventInfo(e.type).text} ${e.type} ${e.targetId || ''} ${e.reason || ''} ${[...peopleIn(e)].map(nameOf).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const csvRows = (list) => [['time', 'actor', 'actor_kind', 'event', 'target_type', 'target_id', 'reason'], ...list.map((e) => [e.at, nameOf(e.actorId), e.actorKind, e.type, e.targetType, e.targetId, e.reason || ''])];

export const activity = {
  title: () => 'Live activity',
  render(ctx) {
    const list = filtered(ctx.query);
    const limit = Number(ctx.query.limit) || 80;
    const user = ctx.query.user && userById(ctx.query.user);
    return html`
      ${head({ title: 'Live activity', sub: html`Every action in the web app, the mobile app and the backoffice, newest first. It updates by itself when someone does something in another tab.${user ? html` Showing only <strong>${user.name}</strong>. <a href="#/activity">Show everyone</a>` : ''}`, actions: can(ctx.staff, 'export') ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="bo-export-activity">${icon('download', 16)}Export CSV</button>` : '' })}
      ${filters('/activity', [
        { name: 'q', type: 'search', label: 'Search', value: ctx.query.q, placeholder: 'Name, event, id, reason…' },
        { name: 'group', type: 'select', label: 'Type', value: ctx.query.group || '', options: [{ value: '', label: 'All types' }, ...Object.entries(GROUPS).map(([v, l]) => ({ value: v, label: l }))] },
        { name: 'actor', type: 'select', label: 'Done by', value: ctx.query.actor || '', options: [{ value: '', label: 'Anyone' }, { value: 'user', label: 'App users' }, { value: 'staff', label: 'Staff' }, { value: 'system', label: 'System (automatic)' }] },
        { name: 'range', type: 'select', label: 'When', value: ctx.query.range || '', options: Object.entries(RANGES).map(([v, l]) => ({ value: v, label: l })) },
      ], ctx.query.user ? html`<input type="hidden" name="user" value="${ctx.query.user}">` : '')}
      <p class="bo-count">${list.length} entries${list.length > limit ? `, showing the newest ${limit}` : ''}</p>
      <div class="bo-card">${timeline(list, { limit, empty: 'No activity matches these filters.' })}
        ${list.length > limit ? html`<p class="bo-center"><a class="btn btn--secondary btn--sm" href="#/activity?${new URLSearchParams({ ...ctx.query, limit: String(limit + 120) })}">Show more</a></p>` : ''}
      </div>`;
  },
};

export const audit = {
  title: () => 'Audit log',
  render(ctx) {
    const s = getState();
    const base = s.activity.filter((e) => e.actorKind === 'staff' || userById(e.actorId)?.roles.includes('moderator'));
    const who = ctx.query.staff || '';
    const kind = ctx.query.kind || 'decisions';
    let list = base;
    if (who) list = list.filter((e) => e.actorId === who);
    if (kind === 'decisions') list = list.filter((e) => isDecision(e) || e.actorKind === 'user');
    if (kind === 'privacy') list = list.filter((e) => ['conversation_viewed', 'impersonation_started', 'export_downloaded', 'data_request_completed'].includes(e.type));
    list = filtered(ctx.query, list);
    const access = (s.accessLog || []).filter((a) => !who || a.staffId === who);
    return html`
      ${head({ title: 'Audit log', sub: 'Who on the team did what, when and why. Entries cannot be edited or deleted. In-app moderator decisions are included.', actions: can(ctx.staff, 'export') ? html`<button type="button" class="btn btn--secondary btn--sm" data-action="bo-export-audit">${icon('download', 16)}Export CSV</button>` : '' })}
      ${filters('/audit', [
        { name: 'q', type: 'search', label: 'Search', value: ctx.query.q, placeholder: 'Name, reason, id…' },
        { name: 'staff', type: 'select', label: 'Staff member', value: who, options: [{ value: '', label: 'Whole team' }, ...staffList().map((x) => ({ value: x.id, label: x.name }))] },
        { name: 'kind', type: 'select', label: 'Show', value: kind, options: [{ value: 'decisions', label: 'Decisions only' }, { value: 'privacy', label: 'Privacy-relevant access' }, { value: 'all', label: 'Everything incl. sign-ins and notes' }] },
        { name: 'range', type: 'select', label: 'When', value: ctx.query.range || '', options: Object.entries(RANGES).map(([v, l]) => ({ value: v, label: l })) },
      ])}
      <p class="bo-count">${list.length} entries</p>
      <div class="bo-grid">
        <div class="bo-col"><div class="bo-card">${timeline(list, { limit: 150, empty: 'No staff actions match these filters.' })}</div></div>
        <div class="bo-col">
          ${section('Private conversations opened', table({ dense: true, label: 'Conversation access', cols: [{ label: 'Who' }, { label: 'Why' }, { label: 'When' }],
            rows: access.slice(0, 30).map((a) => [staffChip(a.staffId), html`<a href="#/conversations/${a.conversationId}">${a.reason}</a>`, html`<span title="${when(a.createdAt)}">${ago(a.createdAt)}</span>`]), empty: 'Nobody opened a private conversation.' }))}
        </div>
      </div>`;
  },
};

function exportList(ctx, list, name) {
  const res = logExport(ctx.staff.id, name, list.length);
  if (!res.ok) { toast(res.message, 'danger'); return; }
  downloadCsv(`local-tasks-${name}-${new Date().toISOString().slice(0, 10)}.csv`, csvRows(list));
  toast(`Exported ${list.length} rows. The export is logged.`, 'success');
}

export const actions = {
  'bo-export-activity'(el, e, ctx) { exportList(ctx, filtered(ctx.query), 'activity'); },
  'bo-export-audit'(el, e, ctx) { exportList(ctx, filtered(ctx.query, getState().activity.filter((x) => x.actorKind === 'staff')), 'audit'); },
};
