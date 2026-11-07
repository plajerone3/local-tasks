// "My tasks" for clients and "My work" for taskers, with status tabs.
import { html } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { pageHead, tabs, statusBadge, catLabel, emptyState, timeline } from '../ui/components.js';
import { tasksByClient, activeApplicationsForTask, assignmentForTask, applicationsByTasker, taskById, assignmentsForUser, reviewByFor, userById, publicName } from '../select.js';
import { lifecycle } from '../logic/status.js';
import { fmt } from '../i18n.js';
import { areaLabel } from '../data/geo.js';

const CLIENT_TABS = {
  active: ['open', 'under_review', 'assigned', 'in_progress', 'awaiting_confirmation', 'disputed'],
  completed: ['completed'],
  closed: ['cancelled', 'not_approved'],
};

export const myTasks = {
  title: () => 'My tasks',
  render(ctx) {
    const tab = CLIENT_TABS[ctx.query.tab] ? ctx.query.tab : 'active';
    const all = tasksByClient(ctx.user.id);
    const list = all.filter((x) => CLIENT_TABS[tab].includes(x.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return html`<div class="wrap page">
      ${pageHead({ title: 'My tasks', actions: html`<a class="btn btn--primary" href="#/tasks/new">${icon('plus')}Post a task</a>` })}
      ${tabs([
        { id: 'active', label: 'Active', href: '/my-tasks?tab=active', count: all.filter((x) => CLIENT_TABS.active.includes(x.status)).length },
        { id: 'completed', label: 'Completed', href: '/my-tasks?tab=completed', count: all.filter((x) => x.status === 'completed').length },
        { id: 'closed', label: 'Cancelled', href: '/my-tasks?tab=closed', count: all.filter((x) => CLIENT_TABS.closed.includes(x.status)).length },
      ], tab, { label: 'Task status' })}
      ${list.length ? html`<ul class="row-list">${list.map((x) => {
        const apps = activeApplicationsForTask(x.id).filter((a) => ['applied', 'shortlisted'].includes(a.status)).length;
        const asg = assignmentForTask(x.id);
        let cta = html`<a class="btn btn--ghost btn--sm" href="#/tasks/${x.id}">View</a>`;
        if (x.status === 'open') cta = html`<a class="btn btn--secondary btn--sm" href="#/tasks/${x.id}/applicants">${apps} ${apps === 1 ? 'applicant' : 'applicants'}</a>`;
        else if (asg && asg.status !== 'cancelled') cta = html`<a class="btn btn--secondary btn--sm" href="#/assignments/${asg.id}">${asg.status === 'completed' && !reviewByFor(asg.id, ctx.user.id) ? 'Leave a review' : 'Open assignment'}</a>`;
        return html`<li class="row-item">
          <div class="row-item__main"><a class="row-item__title" href="#/tasks/${x.id}">${x.title}</a><span class="row-item__sub">${catLabel(x.category, { plain: true })} · ${fmt.date(x.date)} · ${areaLabel(x.locationArea)} · ${fmt.range(x.budgetMin, x.budgetMax)}${asg && asg.status !== 'cancelled' ? ` · with ${publicName(userById(asg.taskerId))}` : ''}</span></div>
          <div class="row-item__side">${statusBadge('task', x.status)}${cta}</div>
        </li>`;
      })}</ul>` : emptyState({ ic: 'list', title: tab === 'active' ? 'No active tasks' : 'Nothing here yet', actions: tab === 'active' ? html`<a class="btn btn--primary" href="#/tasks/new">Post a task</a>` : '' })}
    </div>`;
  },
};

export const myWork = {
  title: () => 'My work',
  render(ctx) {
    const uid = ctx.user.id;
    const tab = ['applications', 'assignments', 'completed', 'closed'].includes(ctx.query.tab) ? ctx.query.tab : 'applications';
    const apps = applicationsByTasker(uid);
    const asgs = assignmentsForUser(uid).filter((a) => a.taskerId === uid);
    const groups = {
      applications: apps.filter((a) => ['applied', 'shortlisted'].includes(a.status)).map((a) => ({ a, asg: null })),
      assignments: asgs.filter((x) => ['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(x.status)).map((asg) => ({ a: apps.find((p) => p.id === asg.applicationId), asg })),
      completed: asgs.filter((x) => x.status === 'completed').map((asg) => ({ a: apps.find((p) => p.id === asg.applicationId), asg })),
      closed: [...apps.filter((a) => ['declined', 'withdrawn'].includes(a.status) && !asgs.some((s) => s.applicationId === a.id)).map((a) => ({ a, asg: null })), ...asgs.filter((x) => x.status === 'cancelled').map((asg) => ({ a: apps.find((p) => p.id === asg.applicationId), asg }))],
    };
    const list = groups[tab];
    return html`<div class="wrap page">
      ${pageHead({ title: 'My work', actions: html`<a class="btn btn--primary" href="#/tasks">${icon('search')}Find tasks</a>` })}
      ${tabs([
        { id: 'applications', label: 'Applications', href: '/my-work?tab=applications', count: groups.applications.length },
        { id: 'assignments', label: 'Active', href: '/my-work?tab=assignments', count: groups.assignments.length },
        { id: 'completed', label: 'Completed', href: '/my-work?tab=completed', count: groups.completed.length },
        { id: 'closed', label: 'Closed', href: '/my-work?tab=closed', count: groups.closed.length },
      ], tab, { label: 'Work status' })}
      ${list.length ? html`<ul class="work-list">${list.map(({ a, asg }) => {
        const task = taskById(asg?.taskId || a.taskId);
        return html`<li class="card work-item">
          <div class="work-item__head"><div><a class="row-item__title" href="#${asg ? `/assignments/${asg.id}` : `/tasks/${task.id}`}">${task.title}</a><p class="row-item__sub">${catLabel(task.category, { plain: true })} · ${fmt.date(task.date)} ${fmt.window(task.timeWindow)} · ${areaLabel(task.locationArea)}${a ? ` · ${fmt.money(a.proposedRate)}` : ''}</p></div>
            ${asg ? statusBadge('assignment', asg.status) : statusBadge('application', a.status)}</div>
          ${timeline(lifecycle(a, asg))}
          ${asg?.status === 'completed' && !reviewByFor(asg.id, uid) ? html`<a class="btn btn--secondary btn--sm" href="#/assignments/${asg.id}/review">Review the client</a>` : ''}
        </li>`;
      })}</ul>` : emptyState({ ic: 'list', title: 'Nothing here yet', body: tab === 'applications' ? 'Find a task that fits you and apply with a short note.' : '', actions: tab === 'applications' ? html`<a class="btn btn--primary" href="#/tasks">Find tasks</a>` : '' })}
    </div>`;
  },
};
