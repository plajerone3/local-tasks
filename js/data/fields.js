// Business fields and the evidence that is relevant to each one.
// Candidate ranking only looks at evidence relevant to the business's field,
// so a bank sees economics proof and a gardening firm sees gardening history.

export const FIELDS = [
  {
    id: 'gardening', short: 'gardening', label: 'Gardening & landscaping', categories: ['gardening'],
    keywords: ['garden', 'hedge', 'lawn', 'leaf', 'plant', 'prun', 'tree', 'landscap', 'winter'],
    proofKeywords: ['gärtner', 'garden', 'grün', 'landscap', 'apprentice', 'employer'],
  },
  {
    id: 'cleaning', short: 'cleaning', label: 'Cleaning & facility services', categories: ['cleaning', 'window_cleaning'],
    keywords: ['clean', 'ironing', 'eco', 'window', 'tenancy', 'kitchen'],
    proofKeywords: ['clean', 'reinigung', 'hygiene'],
  },
  {
    id: 'finance', short: 'finance', label: 'Financial services', categories: [],
    keywords: ['excel', 'financ', 'econom', 'account', 'bookkeep', 'data', 'model', 'analy'],
    proofKeywords: ['econom', 'finance', 'cfa', 'msc', 'bachelor', 'excel', 'account'],
  },
  {
    id: 'logistics', short: 'moving and delivery', label: 'Logistics & moving', categories: ['moving', 'pickup_delivery'],
    keywords: ['lift', 'van', 'driv', 'forklift', 'packing', 'courier', 'stair'],
    proofKeywords: ['licence', 'license', 'forklift', 'stapler', 'driving'],
  },
  {
    id: 'events', short: 'event', label: 'Events & hospitality', categories: ['event_setup'],
    keywords: ['event', 'chairs', 'stage', 'decoration', 'hospitality'],
    proofKeywords: ['event', 'hospitality', 'gastro'],
  },
  {
    id: 'animal_care', short: 'animal care', label: 'Animal care', categories: ['pet_care'],
    keywords: ['dog', 'cat', 'pet', 'animal'],
    proofKeywords: ['pet', 'tier', 'animal', 'vet'],
  },
  {
    id: 'household_services', short: 'household', label: 'Household services', categories: ['household', 'errands'],
    keywords: ['assembly', 'shelf', 'shopping', 'declutter'],
    proofKeywords: ['carpent', 'tischler'],
  },
];

export const field = (id) => FIELDS.find((f) => f.id === id);

export const EMPLOYMENT_TYPES = [
  { id: 'full_time', label: 'Full-time' },
  { id: 'part_time', label: 'Part-time' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'trainee', label: 'Trainee or apprenticeship' },
];

export const employmentType = (id) => EMPLOYMENT_TYPES.find((t) => t.id === id)?.label ?? id;

export const COMPANY_SIZES = ['1–9', '10–49', '50–249', '250+'];

export const LANGUAGES = [
  'German', 'English', 'Bosnian/Croatian/Serbian', 'Turkish', 'Romanian', 'Polish', 'Hungarian',
  'Czech', 'Slovak', 'Ukrainian', 'Arabic', 'Italian', 'French', 'Spanish',
];

export const PROOF_TYPES = [
  { id: 'certificate', label: 'Certificate or course' },
  { id: 'degree', label: 'Degree or diploma' },
  { id: 'licence', label: 'Licence' },
  { id: 'reference', label: 'Reference letter' },
  { id: 'enrolment', label: 'Student enrolment' },
  { id: 'portfolio', label: 'Photos or portfolio' },
  { id: 'other', label: 'Other' },
];

export const proofType = (id) => PROOF_TYPES.find((t) => t.id === id)?.label ?? 'Other';
