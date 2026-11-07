// Demo-only: seeded people respond to invites and messages so the prototype feels alive
// without switching accounts. Everything they produce is labelled as simulated.
import { APP } from '../config.js';
import { session } from '../store.js';
import { userById, taskById, conversationById, taskerProfileOf, myApplication, firstName } from '../select.js';
import { onHook } from './common.js';
import { applyToTask, suggestedPrice } from './marketplace.js';
import { sendMessage } from './messaging.js';
import { fmt } from '../i18n.js';

let enabled = APP.simulation;
export const setSimulation = (on) => { enabled = on; };

const replies = {};
const isSeeded = (u) => !!u?.seeded && u.id !== 'u_spam';
const current = () => session.get()?.userId;

const TASKER_LINES = [
  'Thanks for the message! That works for me.',
  'Sure, I can bring that along. See you then.',
  'Sounds good. I will send a message when I am on my way.',
];
const CLIENT_LINES = [
  'Thank you! That sounds good.',
  'Great, see you then.',
  'Perfect, thanks for checking.',
];
const BUSINESS_LINES = [
  'Thank you! We will suggest a time for a short call here in the chat.',
  'Great to hear. Could you tell us which days suit you best?',
];
const CANDIDATE_LINES = [
  'Thank you, I am interested. Mornings work best for me.',
  'Thanks for reaching out. Happy to hear more about the role.',
];

export function initSimulation() {
  onHook('invited', ({ taskId, taskerId }) => {
    if (!enabled || taskerId === current()) return;
    const tasker = userById(taskerId);
    if (!isSeeded(tasker)) return;
    setTimeout(() => {
      const task = taskById(taskId);
      if (!task || task.status !== 'open' || myApplication(taskId, taskerId)) return;
      const p = taskerProfileOf(taskerId);
      applyToTask(taskId, taskerId, {
        note: `Thanks for the invite! I have done similar tasks before${p?.skills?.length ? ` (${p.skills.slice(0, 2).join(', ').toLowerCase()})` : ''} and I am happy to help.`,
        proposedRate: suggestedPrice(task),
        availability: `${fmt.date(task.date)}, ${fmt.window(task.timeWindow)} works for me`,
        relevantSkills: (p?.skills || []).slice(0, 2),
      }, { simulated: true });
    }, 2200);
  });

  onHook('message', ({ convId, senderId }) => {
    if (!enabled || senderId !== current()) return;
    const conv = conversationById(convId);
    const otherId = conv?.participantIds.find((p) => p !== senderId);
    const other = userById(otherId);
    if (!other || other.id === current() || !isSeeded(other)) return;
    replies[convId] = (replies[convId] || 0) + 1;
    if (replies[convId] > 3) return;
    const pool = conv.contextType === 'recruiting'
      ? (other.roles.includes('business') ? BUSINESS_LINES : CANDIDATE_LINES)
      : (taskById(conv.contextId)?.clientId === otherId ? CLIENT_LINES : TASKER_LINES);
    setTimeout(() => {
      sendMessage(convId, otherId, pool[(replies[convId] - 1) % pool.length], { simulated: true });
    }, 1800);
  });
}

export const simulatedLabel = (u) => `${firstName(u)} (demo reply)`;
