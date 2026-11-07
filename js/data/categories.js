import { getLang, tr } from '../i18n.js';
import { EXAMPLES_DE, SKILLS_DE } from '../locales/de-content.js';

// Task categories and their default availability policy.
//   open   – anyone can post and apply
//   review – tasks go to a moderator first; applications open after approval
//   soon   – visible but not yet bookable
// Moderators can change a policy in the moderation console (stored in state.categoryPolicy),
// so regulated categories can be switched on once the legal side is settled.

export const POLICY = {
  open: { label: 'Available', tone: 'success' },
  review: { label: 'Manual review', tone: 'warn' },
  soon: { label: 'Coming soon', tone: 'neutral' },
};

export const CATEGORIES = [
  {
    id: 'cleaning', label: 'Cleaning', emoji: '🧽', policy: 'open',
    skills: ['Deep cleaning', 'Kitchen & bathroom', 'End-of-tenancy cleaning', 'Eco products', 'Ironing'],
    related: ['window_cleaning', 'household'],
    proofKeywords: ['clean', 'hygiene', 'reinigung'],
    example: {
      title: 'Kitchen and bathroom deep clean',
      description: 'Our kitchen and bathroom need a proper deep clean: oven, fridge, tiles and the shower glass. Cleaning products are available, but feel free to bring your own.',
      requirements: 'Experience with deep cleaning\nOwn gloves', safetyNotes: 'Please ring the bell at the side door.',
      budgetMin: 70, budgetMax: 100, hours: 4,
    },
  },
  {
    id: 'window_cleaning', label: 'Window cleaning', emoji: '🪟', policy: 'open',
    skills: ['Windows & frames', 'Balcony doors', 'Streak-free finish'],
    related: ['cleaning'],
    proofKeywords: ['clean', 'window'],
    example: {
      title: 'Clean 6 windows and a balcony door',
      description: 'Six double windows (old Viennese box windows) plus a balcony door, inside and out. Ladder and cloths are available.',
      requirements: 'Comfortable on a small ladder', safetyNotes: 'Windows open inwards; no outside ledge work needed.',
      budgetMin: 60, budgetMax: 90, hours: 3,
    },
  },
  {
    id: 'gardening', label: 'Gardening', emoji: '🌿', policy: 'open',
    skills: ['Hedge trimming', 'Lawn care', 'Leaf clearing', 'Planting', 'Winter protection', 'Own tools'],
    related: ['household'],
    proofKeywords: ['garden', 'gärtner', 'landscap', 'grün'],
    example: {
      title: 'Leaf clearing and winter preparation',
      description: 'Small garden (about 150 m²) that needs leaves cleared from the lawn and beds, and the roses covered for winter. Green-waste bags are provided.',
      requirements: 'Own rake or leaf blower\nKnows how to protect roses for winter', safetyNotes: 'Our dog will be inside during the task.',
      budgetMin: 80, budgetMax: 120, hours: 4,
    },
  },
  {
    id: 'pet_care', label: 'Pet walking & care', emoji: '🐕', policy: 'open',
    skills: ['Dog walking', 'Cat sitting', 'Large dogs', 'Pet medication'],
    related: ['errands'],
    proofKeywords: ['pet', 'tier', 'animal', 'vet'],
    example: {
      title: 'Evening walks for a friendly beagle',
      description: 'Looking for someone to walk Luna, a 4-year-old beagle, for about 45 minutes on weekday evenings while I work late. She pulls a little at the start.',
      requirements: 'Experience with dogs', safetyNotes: 'Key handover in person first.',
      budgetMin: 60, budgetMax: 80, hours: 4,
    },
  },
  {
    id: 'errands', label: 'Errands', emoji: '🛒', policy: 'open',
    skills: ['Grocery shopping', 'Pharmacy pickup', 'Post office', 'Senior-friendly'],
    related: ['pickup_delivery'],
    proofKeywords: [],
    example: {
      title: 'Weekly grocery shop',
      description: 'I need someone to do a weekly grocery shop from a list (about 2 bags) and bring it to my flat on the 2nd floor. I pay for the groceries in advance.',
      requirements: 'Keep the receipt', safetyNotes: 'There is no lift in the building.',
      budgetMin: 20, budgetMax: 30, hours: 1.5,
    },
  },
  {
    id: 'pickup_delivery', label: 'Pickup & delivery', emoji: '📦', policy: 'open',
    skills: ['Own car', 'Van (licence B)', 'Bike courier', 'Bulky items'],
    related: ['moving', 'errands'],
    proofKeywords: ['licence', 'license', 'driving'],
    example: {
      title: 'Pick up a second-hand bike',
      description: 'I bought a bike from a seller in another district. Please collect it (paid already) and bring it to me. It fits in a car with folded seats or can be ridden over.',
      requirements: 'Car or able to ride a bike across town', safetyNotes: 'Seller is expecting a call 10 minutes before arrival via the in-app chat.',
      budgetMin: 25, budgetMax: 40, hours: 1.5,
    },
  },
  {
    id: 'moving', label: 'Moving help', emoji: '🚚', policy: 'open',
    skills: ['Heavy lifting', 'Stair carries', 'Furniture disassembly', 'Packing fragile items', 'Van (licence B)'],
    related: ['pickup_delivery', 'household'],
    proofKeywords: ['licence', 'license', 'forklift', 'stapler', 'moving'],
    example: {
      title: 'Help carrying boxes into a new flat',
      description: 'About 20 boxes and a few small furniture pieces need to go from the van to a 2nd-floor flat. The van is already booked.',
      requirements: 'Able to carry heavy boxes up stairs', safetyNotes: 'Wear sturdy shoes; the stairwell is narrow.',
      budgetMin: 50, budgetMax: 80, hours: 2.5,
    },
  },
  {
    id: 'event_setup', label: 'Event setup', emoji: '🎪', policy: 'open',
    skills: ['Chairs & tables', 'Decoration', 'Stage & lights (basic)', 'Clean-up after events'],
    related: ['moving'],
    proofKeywords: ['event', 'hospitality'],
    example: {
      title: 'Set up and clear away a birthday party',
      description: 'Set up tables, chairs and simple decorations in a rented room before a birthday party, and help clear away afterwards.',
      requirements: '', safetyNotes: '',
      budgetMin: 60, budgetMax: 90, hours: 4,
    },
  },
  {
    id: 'household', label: 'Household help', emoji: '🏠', policy: 'open',
    skills: ['Furniture assembly', 'Hanging shelves & pictures', 'Decluttering', 'Small fixes (no electrics)'],
    related: ['cleaning', 'moving'],
    proofKeywords: ['carpent', 'tischler', 'assembly'],
    example: {
      title: 'Assemble a bed and a chest of drawers',
      description: 'Flat-pack bed (160 cm) and a chest of drawers need assembling. All parts and instructions are there; I have a basic toolbox.',
      requirements: 'Experience with flat-pack furniture', safetyNotes: '',
      budgetMin: 50, budgetMax: 80, hours: 3,
    },
  },

  // Higher-risk or regulated. Defaults keep them out of instant posting.
  { id: 'babysitting', label: 'Babysitting & care of minors', emoji: '🧸', policy: 'review', skills: ['Childcare', 'First aid for children'], related: [], proofKeywords: ['first-aid', 'first aid', 'childcare', 'pädagog'], note: 'A moderator checks each task, and taskers need relevant references before they can be booked.' },
  { id: 'food', label: 'Prepared food & catering', emoji: '🍲', policy: 'review', skills: ['Cooking', 'Catering'], related: [], proofKeywords: ['hygiene', 'food', 'koch'], note: 'Food hygiene rules apply. Tasks are checked before they go live.' },
  { id: 'finance', label: 'Financial advice & investment', emoji: '📈', policy: 'review', skills: ['Budgeting'], related: [], proofKeywords: ['finance', 'cfa', 'licen'], note: 'Advice on investments is regulated. A moderator checks the request first.' },
  { id: 'tax', label: 'Tax filing help', emoji: '🧾', policy: 'review', skills: ['Tax forms'], related: [], proofKeywords: ['tax', 'steuer'], note: 'Only general help with forms. A moderator checks the request first.' },
  { id: 'personal_care', label: 'Personal care', emoji: '🤲', policy: 'review', skills: ['Personal care'], related: [], proofKeywords: ['care', 'pflege'], note: 'Close personal contact. A moderator checks each task first.' },
  { id: 'construction', label: 'Construction & renovation', emoji: '🧱', policy: 'review', skills: ['Painting', 'Tiling'], related: ['household'], proofKeywords: ['meister', 'trade'], note: 'Larger building work may need a licensed trade. Checked before going live.' },
  { id: 'licensed_pro', label: 'Other licensed professional services', emoji: '⚖️', policy: 'review', skills: [], related: [], proofKeywords: ['licen'], note: 'Needs a professional licence. Checked before going live.' },
  { id: 'medical', label: 'Medical & therapeutic services', emoji: '🩺', policy: 'soon', skills: [], related: [], proofKeywords: [], note: 'Not bookable yet.' },
  { id: 'electrical_gas', label: 'Electrical & gas work', emoji: '⚡', policy: 'soon', skills: [], related: [], proofKeywords: [], note: 'Needs a licensed trade. Not bookable yet.' },
  { id: 'structural', label: 'Structural work', emoji: '🏗️', policy: 'soon', skills: [], related: [], proofKeywords: [], note: 'Needs a licensed trade. Not bookable yet.' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function category(id) {
  return BY_ID[id] || { id, label: id, emoji: '•', policy: 'soon', skills: [], related: [], proofKeywords: [] };
}

export const defaultPolicy = (id) => category(id).policy;

// Language-aware accessors for display. Matching and data keep using ids.
export const catLabel = (id) => tr(category(id).label);
/** Category name inside a sentence: lower-case in English ("gardening"), as-is in German ("Gartenarbeit"). */
export const catWord = (id) => (getLang() === 'de' ? tr(category(id).label) : category(id).label.toLowerCase());
export const catNote = (id) => (category(id).note ? tr(category(id).note) : '');
export const catExample = (id) => (getLang() === 'de' ? EXAMPLES_DE[id] : null) || category(id).example || null;
/** Skill names for a category in every language, so matching works on German and English profiles. */
export const catSkills = (id) => [...(category(id).skills || []), ...(SKILLS_DE[id] || [])];
