// Demo data. Dates are relative to "now" so the demo never goes stale.
// Every record follows the same shape a backend would return (see README data model).
import { APP } from '../config.js';
import { DAY_MS, isoDate, mulberry32, round2, WEEKDAYS } from '../util.js';
import { getLang } from '../i18n.js';
import { localizeSeed } from '../locales/de-seed.js';
import { addBackoffice } from './backoffice-seed.js';

const AVATAR = ['#1E6B58', '#2557A7', '#8A4B14', '#7A3E8E', '#A3302A', '#33658A', '#56601A', '#8C2F5B', '#3F5E3A', '#6B4E16'];

const POOL = {
  cleaning: {
    titles: ['Weekly flat clean', 'Kitchen deep clean', 'Bathroom and kitchen clean', 'Spring clean, 3 rooms', 'Clean after a party'],
    good: ['Spotless kitchen and bathroom, very thorough.', 'Worked carefully and used the eco products we asked for.', 'Our flat has not been this clean in months.', 'Friendly and efficient, would book again.'],
    mixed: ['Good overall, but the oven was missed.', 'Nice work, a few corners were skipped.'],
  },
  window_cleaning: {
    titles: ['Windows in a 3-room flat', 'Balcony doors and windows', 'Shop window clean'],
    good: ['Streak-free windows, frames wiped too.', 'Quick and careful with our old box windows.'],
    mixed: ['A few streaks were left on the balcony door.'],
  },
  gardening: {
    titles: ['Autumn leaf clearing', 'Hedge trimming', 'Lawn mowing and edging', 'Pruning fruit trees', 'Winter protection for roses', 'Planting a herb bed'],
    good: ['The hedge looks great and everything was cleaned up afterwards.', 'Knew exactly what the garden needed before winter.', 'Brought their own tools and worked steadily all afternoon.', 'Very careful around the flower beds.', 'Gave useful tips for the lawn in spring.'],
    mixed: ['Good work, it took a bit longer than planned.'],
  },
  pet_care: {
    titles: ['Dog walks for a week', 'Cat sitting over the weekend', 'Evening walks for a senior dog', 'Feeding and play visits'],
    good: ['Our dog was happy and calm after every walk.', 'Sent a short update after each visit, very reassuring.', 'Handled the medication exactly as asked.'],
    mixed: ['Lovely with the cat, one visit was a bit late.'],
  },
  errands: {
    titles: ['Grocery run', 'Pharmacy and post office', 'Weekly shopping for my father', 'Collecting a parcel'],
    good: ['Got everything on the list and checked about substitutes.', 'Patient and kind with my father.', 'Fast and reliable.'],
    mixed: ['Forgot one item but came back for it.'],
  },
  pickup_delivery: {
    titles: ['Collect a dining table', 'Deliver boxes across town', 'Pick up a bike from a seller'],
    good: ['Careful with the furniture and delivered on time.', 'Great communication on the way.'],
    mixed: ['Arrived later than agreed, the item was fine.'],
  },
  moving: {
    titles: ['Move a 2-room flat', 'Carry a fridge to the 4th floor', 'Help with a student move', 'Load a moving van'],
    good: ['Strong, careful and good at planning the stairwell.', 'Nothing broke and everything went where we wanted.', 'Very efficient with the heavy items.', 'Took the bed apart and put it back together perfectly.'],
    mixed: ['Good help, but arrived 30 minutes late.', 'Fine overall, one picture frame got scratched.'],
  },
  event_setup: {
    titles: ['Set up a garden party', 'Chairs and tables for a school event', 'Help after a wedding reception'],
    good: ['Everything was set up before the guests arrived.', 'Stayed to help clear up, much appreciated.'],
    mixed: ['Good help, needed more instructions than expected.'],
  },
  household: {
    titles: ['Assemble a wardrobe', 'Hang shelves and pictures', 'Declutter a storage room'],
    good: ['Wardrobe assembled perfectly and the packaging taken away.', 'Precise work, everything is level.'],
    mixed: ['Took longer than expected, but the result is good.'],
  },
};
const GOOD_TAGS = ['On time', 'Friendly', 'Careful', 'Good communication', 'Thorough', 'Fair price', 'Went the extra mile', 'Well prepared'];
const MIXED_TAGS = ['Arrived late', 'Missed details', 'Communication could improve'];
const CLIENT_TAGS = ['Clear instructions', 'Friendly', 'Accurate description', 'Respectful', 'Well prepared'];

function avail(spec) {
  const map = { m: 'morning', a: 'afternoon', e: 'evening' };
  const out = Object.fromEntries(WEEKDAYS.map((d) => [d, []]));
  for (const part of spec.split(' ')) {
    const [day, letters] = part.split(':');
    out[day] = letters.split('').map((l) => map[l]);
  }
  return out;
}

export function createSeed(now = new Date()) {
  const rand = mulberry32(20261107);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const base = new Date(now);
  base.setSeconds(0, 0);
  const ago = (days, hours = 0) => new Date(base.getTime() - days * DAY_MS - hours * 36e5).toISOString();
  const day = (n) => isoDate(new Date(base.getTime() + n * DAY_MS));
  const nextDow = (dow, min = 1) => {
    for (let n = min; n < min + 8; n++) {
      const d = new Date(base.getTime() + n * DAY_MS);
      if (WEEKDAYS[(d.getDay() + 6) % 7] === dow) return isoDate(d);
    }
    return day(min);
  };

  const s = {
    schemaVersion: APP.schemaVersion,
    seededAt: base.toISOString(),
    seedLang: getLang(),
    users: [], taskerProfiles: [], businessProfiles: [], tasks: [], applications: [], assignments: [],
    conversations: [], messages: [], reviews: [], proofItems: [], walletTransactions: [],
    businessConnections: [], savedCandidates: [], reports: [], blocks: [], disputes: [],
    notifications: [], dataRequests: [], categoryPolicy: {}, activity: [],
  };

  let n = 0;
  const id = (p) => `${p}_${(++n).toString(36).padStart(3, '0')}`;

  function addUser(uid, name, o) {
    const u = {
      id: uid, name, email: o.email || `${name.split(' ')[0].toLowerCase()}@example.com`,
      phone: o.phone || null, avatar: { color: AVATAR[o.color ?? (s.users.length % AVATAR.length)] },
      roles: o.roles, locationArea: { city: o.area[0], district: o.area[1] }, languages: o.langs || ['German'],
      createdAt: ago(o.since ?? 100), verificationStatus: o.verification || 'not_started',
      discoverableToBusinesses: !!o.discoverable, clientNeeds: o.needs || [],
      onboarded: { client: true, tasker: true, business: true }, demo: o.demo || null, seeded: true,
    };
    s.users.push(u);
    return u;
  }

  // ---------- Background clients (authors of historic reviews) ----------
  const background = [
    ['Petra Klein', 'vienna', 'josefstadt'], ['Stefan Moser', 'vienna', 'doebling'], ['Andrea Wimmer', 'vienna', 'landstrasse'],
    ['Johann Pichler', 'graz', 'st-leonhard'], ['Claudia Hofer', 'graz', 'eggenberg'], ['Markus Lang', 'graz', 'gries'],
    ['Birgit Eder', 'linz', 'innenstadt'], ['Florian Schwarz', 'linz', 'dornach-auhof'], ['Sabine Fuchs', 'vienna', 'penzing'], ['Georg Mayer', 'vienna', 'floridsdorf'],
  ].map(([name, c, d], i) => addUser(`u_bg${i + 1}`, name, { roles: ['client'], area: [c, d], since: 500 + i * 20, color: i % AVATAR.length }));

  // ---------- Clients ----------
  addUser('u_katharina', 'Katharina Huber', { roles: ['client'], area: ['vienna', 'wieden'], since: 380, color: 0, needs: ['moving', 'cleaning'], phone: '+43 660 000 0101', demo: { group: 'Client', blurb: 'Vienna. Moving flats: has applicants waiting, a clean in progress and unread messages.' } });
  addUser('u_martin', 'Martin Steiner', { roles: ['client'], area: ['graz', 'geidorf'], since: 610, color: 5, needs: ['gardening', 'household'], demo: { group: 'Client', blurb: 'Graz. A newcomer finished his wardrobe assembly: confirm it and leave the first review.' } });
  addUser('u_eva', 'Eva Lindner', { roles: ['client'], area: ['linz', 'urfahr'], since: 220, color: 3, needs: ['pet_care', 'pickup_delivery'], demo: { group: 'Client', blurb: 'Linz. Dog walks, a bookshelf pickup and a kitchen clean are open.' } });
  addUser('u_helga', 'Helga Brunner', { roles: ['client'], area: ['vienna', 'ottakring'], since: 480, color: 9, needs: ['errands', 'window_cleaning'] });
  addUser('u_thomas', 'Thomas Reiter', { roles: ['client'], area: ['graz', 'lend'], since: 140, color: 2, needs: ['event_setup'] });
  addUser('u_daniel', 'Daniel Hofer', { roles: ['client'], area: ['vienna', 'josefstadt'], since: 60, color: 1, needs: ['babysitting'] });
  addUser('u_spam', 'Quick Cash Jobs', { roles: ['client'], area: ['vienna', 'brigittenau'], since: 1, color: 4 });

  // ---------- Taskers ----------
  const TASKERS = [
    {
      id: 'u_lukas', name: 'Lukas Bauer', area: ['vienna', 'alsergrund'], langs: ['German', 'English'], since: 260, color: 1,
      demo: { group: 'Tasker', blurb: 'Student in Vienna. Has applied to a move and is in a dispute that pauses his rating.' },
      headline: 'Engineering student with a strong pair of hands for moves and events',
      bio: 'I study mechanical engineering at TU Wien and take on tasks around my lectures. I am used to carrying, assembling and organising, and I show up when I say I will.',
      categories: ['moving', 'pickup_delivery', 'event_setup', 'errands'], skills: ['Heavy lifting', 'Stair carries', 'Furniture disassembly', 'Bike courier', 'Chairs & tables'],
      experience: 'Two years of weekend moving help for friends and neighbours; event crew at the TU Wien ball.',
      avail: 'mon:e tue:e wed:e thu:e fri:ae sat:mae sun:ma', rate: [16, 22],
      goal: { seeking: false, fields: [], types: [], note: '' }, discoverable: false,
      proofs: [{ label: 'Student enrolment confirmation, TU Wien', type: 'enrolment', status: 'self_reported', visibility: 'public' }],
      history: { n: 9, avg: 4.6, extra: 1, cancelled: 1, cats: ['moving', 'moving', 'event_setup', 'pickup_delivery'] },
    },
    {
      id: 'u_ferdinand', name: 'Ferdinand Gruber', area: ['graz', 'andritz'], langs: ['German'], since: 700, color: 6,
      demo: { group: 'Tasker', blurb: 'Gardener in Graz with 30 years of experience. A gardening firm wants to connect.' },
      headline: 'Gardener with 30 years of experience: hedges, lawns and winter preparation',
      bio: 'I worked for many years in a garden nursery in Graz until it closed. Now I look after gardens across the city, bring my own tools and leave everything tidy.',
      categories: ['gardening', 'window_cleaning', 'household'], skills: ['Hedge trimming', 'Lawn care', 'Leaf clearing', 'Winter protection', 'Own tools', 'Tree pruning (small trees)'],
      experience: '30 years in a garden nursery and private gardens. Apprenticeship as a gardener (Gärtner).',
      avail: 'mon:ma tue:ma wed:ma thu:ma fri:ma sat:m', rate: [22, 30],
      goal: { seeking: true, fields: ['gardening'], types: ['part_time', 'seasonal'], note: 'Happy to join a gardening team part-time, ideally March to November.' }, discoverable: true,
      proofs: [
        { label: 'Gardener apprenticeship certificate (Lehrabschluss)', type: 'certificate', status: 'pending_review', visibility: 'public' },
        { label: 'Reference letter from former employer (garden nursery)', type: 'reference', status: 'self_reported', visibility: 'businesses' },
      ],
      history: { n: 37, avg: 4.9, extra: 4, cancelled: 0, cats: ['gardening', 'gardening', 'gardening', 'window_cleaning', 'household'] },
    },
    {
      id: 'u_mehmet', name: 'Mehmet Yılmaz', area: ['vienna', 'favoriten'], langs: ['German', 'Turkish', 'English'], since: 540, color: 2,
      demo: { group: 'Tasker', blurb: 'Experienced mover in Vienna. Shortlisted for a sofa move.' },
      headline: 'Experienced mover: stairs, heavy furniture and careful packing',
      bio: 'Eight years with a moving company taught me how to get a sofa up a narrow Viennese stairwell without a scratch. I plan the route first and work calmly.',
      categories: ['moving', 'pickup_delivery', 'household'], skills: ['Heavy lifting', 'Stair carries', 'Furniture disassembly', 'Packing fragile items', 'Van (licence B)'],
      experience: 'Eight years at a Vienna moving company, team lead for the last three.',
      avail: 'mon:mae tue:mae wed:mae thu:mae fri:mae sat:ma', rate: [20, 28],
      goal: { seeking: true, fields: ['logistics'], types: ['full_time'], note: 'Looking for a permanent role in logistics or removals.' }, discoverable: true,
      proofs: [
        { label: 'Driving licence, class B', type: 'licence', status: 'pending_review', visibility: 'businesses' },
        { label: 'Forklift licence (Staplerschein)', type: 'licence', status: 'self_reported', visibility: 'businesses' },
      ],
      history: { n: 52, avg: 4.7, extra: 3, cancelled: 1, cats: ['moving', 'moving', 'pickup_delivery', 'household'] },
    },
    {
      id: 'u_ana', name: 'Ana Petrović', area: ['vienna', 'meidling'], langs: ['German', 'Bosnian/Croatian/Serbian', 'English'], since: 420, color: 7,
      demo: { group: 'Tasker', blurb: 'Cleaner in Vienna. A clean is in progress today; a cleaning company wants to connect.' },
      headline: 'Thorough home cleaning, end-of-tenancy cleans and windows',
      bio: 'I have cleaned homes and offices in Vienna for six years. I bring my own eco products if you like, and I always walk through the result with you.',
      categories: ['cleaning', 'window_cleaning', 'household'], skills: ['Deep cleaning', 'Kitchen & bathroom', 'End-of-tenancy cleaning', 'Eco products', 'Ironing', 'Windows & frames'],
      experience: 'Six years of home and office cleaning, two of them with a cleaning company.',
      avail: 'mon:ma tue:ma wed:ma thu:ma fri:ma sat:m', rate: [17, 23],
      goal: { seeking: true, fields: ['cleaning'], types: ['part_time'], note: 'Open to a stable part-time position in the mornings.' }, discoverable: true,
      proofs: [{ label: 'Hygiene training certificate', type: 'certificate', status: 'self_reported', visibility: 'public' }],
      history: { n: 21, avg: 4.4, extra: 2, cancelled: 1, cats: ['cleaning', 'cleaning', 'window_cleaning'] },
    },
    {
      id: 'u_jana', name: 'Jana Novak', area: ['linz', 'urfahr'], langs: ['German', 'Czech', 'English'], since: 300, color: 3,
      demo: { group: 'Tasker', blurb: 'Pet carer in Linz. Applied to weekday dog walks.' },
      headline: 'Calm, reliable pet care: walks, visits and medication',
      bio: 'I am training as a veterinary assistant and grew up with dogs. I send a short update after every visit.',
      categories: ['pet_care', 'errands'], skills: ['Dog walking', 'Cat sitting', 'Large dogs', 'Pet medication'],
      experience: 'Pet sitting for neighbours since school; currently training as a veterinary assistant.',
      avail: 'mon:ma tue:ma wed:mae thu:ma fri:ma sat:mae sun:mae', rate: [14, 20],
      goal: { seeking: false, fields: [], types: [], note: '' }, discoverable: false,
      proofs: [{ label: 'Pet first-aid course', type: 'certificate', status: 'pending_review', visibility: 'public' }],
      history: { n: 14, avg: 4.8, extra: 1, cancelled: 0, cats: ['pet_care', 'pet_care', 'errands'] },
    },
    {
      id: 'u_elif', name: 'Elif Demir', area: ['vienna', 'leopoldstadt'], langs: ['German', 'English', 'Turkish'], since: 150, color: 3,
      demo: { group: 'Tasker', blurb: 'Economics graduate in Vienna. Visible to businesses; connected with a finance firm.' },
      headline: 'Economics graduate: organised help with events and errands, looking for an analyst role',
      bio: 'I finished my MSc in Economics at WU Vienna this year. While I look for a role in finance, I help with events, errands and anything that needs good organisation.',
      categories: ['errands', 'event_setup', 'household'], skills: ['Excel & data analysis', 'Financial modelling', 'Bookkeeping basics', 'Event logistics', 'Grocery shopping'],
      experience: 'Six-month internship in a bank’s risk team; event lead in a student association.',
      avail: 'mon:mae tue:mae wed:mae thu:mae fri:mae sat:ma', rate: [16, 24],
      goal: { seeking: true, fields: ['finance'], types: ['full_time', 'trainee'], note: 'Looking for a junior analyst or trainee role in finance.' }, discoverable: true,
      proofs: [
        { label: 'MSc Economics, WU Vienna', type: 'degree', status: 'pending_review', visibility: 'businesses' },
        { label: 'CFA Level I', type: 'certificate', status: 'self_reported', visibility: 'businesses' },
        { label: 'Microsoft Excel Expert certification', type: 'certificate', status: 'self_reported', visibility: 'public' },
      ],
      history: { n: 6, avg: 4.5, extra: 0, cancelled: 0, cats: ['event_setup', 'errands', 'household'] },
    },
    {
      id: 'u_tobias', name: 'Tobias Leitner', area: ['graz', 'jakomini'], langs: ['German', 'English'], since: 9, color: 8,
      demo: { group: 'Tasker', blurb: 'New in Graz, no reviews yet. Shows how newcomers still get seen.' },
      headline: 'Trained landscape gardener, new to Graz: gardens, assembly and lifting',
      bio: 'I finished my apprenticeship in landscape gardening in Carinthia and just moved to Graz. I am building up local work and take every task seriously.',
      categories: ['gardening', 'household', 'moving', 'event_setup'], skills: ['Hedge trimming', 'Leaf clearing', 'Lawn care', 'Furniture assembly', 'Heavy lifting'],
      experience: 'Three-year apprenticeship in landscape gardening (Garten- und Grünflächengestaltung).',
      avail: 'mon:ae tue:ae wed:mae thu:ae fri:mae sat:mae', rate: [18, 24],
      goal: { seeking: true, fields: ['gardening'], types: ['full_time'], note: 'Looking for a full-time role with a landscaping firm.' }, discoverable: true,
      proofs: [{ label: 'Apprenticeship certificate, landscape gardening', type: 'certificate', status: 'pending_review', visibility: 'public' }],
      history: { n: 0, avg: 0, extra: 0, cancelled: 0, cats: [] },
    },
    {
      id: 'u_sophie', name: 'Sophie Wagner', roles: ['client', 'tasker'], area: ['vienna', 'neubau'], langs: ['German', 'English', 'French'], since: 200, color: 5,
      demo: { group: 'Client and Tasker', blurb: 'Vienna. Uses both roles: switch between hiring help and doing tasks.' },
      headline: 'Freelance designer: pet visits and errands around Neubau',
      bio: 'I work from home as a designer, so I can fit in dog walks, cat visits and errands during the day.',
      categories: ['pet_care', 'errands'], skills: ['Dog walking', 'Cat sitting', 'Grocery shopping', 'Pharmacy pickup'],
      experience: 'Pet sitting for friends and neighbours for years.',
      avail: 'mon:a tue:a wed:a thu:a fri:a', rate: [15, 20],
      goal: { seeking: false, fields: [], types: [], note: '' }, discoverable: false,
      proofs: [],
      history: { n: 3, avg: 5, extra: 0, cancelled: 0, cats: ['pet_care', 'errands'] },
    },
  ];

  for (const t of TASKERS) {
    const u = addUser(t.id, t.name, { roles: t.roles || ['tasker'], area: t.area, langs: t.langs, since: t.since, color: t.color, discoverable: t.discoverable, demo: t.demo, verification: t.history.n > 20 ? 'pending_review' : 'not_started' });
    s.taskerProfiles.push({
      userId: u.id, headline: t.headline, bio: t.bio, categories: t.categories, skills: t.skills, experience: t.experience,
      availability: avail(t.avail), rateMin: t.rate[0], rateMax: t.rate[1],
      employmentGoal: { ...t.goal, consentAt: t.goal.seeking ? ago(Math.min(t.since, 30)) : null },
      proofItems: [], reputationSummary: null,
      completedTaskCount: t.history.n + t.history.extra, cancelledByTasker: t.history.cancelled,
    });
    for (const p of t.proofs) {
      const pid = id('pr');
      s.proofItems.push({ id: pid, taskerId: u.id, label: p.label, type: p.type, status: p.status, visibility: p.visibility, fileName: null, createdAt: ago(Math.min(t.since, 40)) });
      s.taskerProfiles.at(-1).proofItems.push(pid);
    }
    // Historic reviews: star counts chosen to land on the target average.
    const total = t.history.n;
    if (!total) continue;
    let deficit = Math.round(5 * total - t.history.avg * total);
    const stars = Array(total).fill(5);
    for (let i = 0; i < total && deficit > 0; i++) {
      if (deficit >= 2 && rand() < 0.22) { stars[i] = 3; deficit -= 2; } else { stars[i] = 4; deficit -= 1; }
    }
    stars.sort(() => rand() - 0.5);
    const span = Math.max(30, Math.min(t.since - 5, 640));
    stars.forEach((st, i) => {
      const cat = t.history.cats[i % t.history.cats.length];
      const pool = POOL[cat];
      const reviewer = pick(background.filter((b) => b.locationArea.city === u.locationArea.city).concat(background.slice(0, 1)));
      const tags = st >= 5 ? [pick(GOOD_TAGS), pick(GOOD_TAGS)] : st === 4 ? [pick(GOOD_TAGS)] : [pick(MIXED_TAGS)];
      s.reviews.push({
        id: id('rv'), reviewerId: reviewer.id, revieweeId: u.id, taskId: null, assignmentId: null,
        taskTitle: pick(pool.titles), category: cat, stars: st, tags: [...new Set(tags)],
        comment: st >= 4 ? pick(pool.good) : pick(pool.mixed), status: 'published', visibility: 'public',
        createdAt: ago(Math.round(5 + (span * (i + 1)) / (total + 1)), Math.floor(rand() * 10)),
      });
    });
    // A few earlier demo earnings so the wallet history is not empty.
    for (let i = 0; i < Math.min(3, total); i++) {
      const amount = Math.round((t.rate[0] + 4) * (2 + i)) ;
      s.walletTransactions.push({ id: id('tx'), userId: u.id, type: 'earning', amount, fee: round2(amount * APP.fees.taskerPlatformRate), status: 'completed', relatedTaskId: null, label: `Earlier task: ${pick(POOL[t.history.cats[i % t.history.cats.length]].titles)}`, createdAt: ago(20 + i * 17), demoOnly: true });
    }
  }

  // Client-side reviews (taskers rating clients) for client summaries.
  for (const [cid, count] of [['u_katharina', 5], ['u_martin', 6], ['u_eva', 3], ['u_helga', 4], ['u_thomas', 2], ['u_sophie', 2]]) {
    for (let i = 0; i < count; i++) {
      s.reviews.push({ id: id('rv'), reviewerId: pick(['u_lukas', 'u_ana', 'u_mehmet', 'u_ferdinand', 'u_jana', 'u_elif']), revieweeId: cid, taskId: null, assignmentId: null, taskTitle: 'Earlier task', category: null, stars: i === 0 && cid === 'u_eva' ? 4 : 5, tags: [pick(CLIENT_TAGS)], comment: 'Clear about what was needed and friendly throughout.', status: 'published', visibility: 'public', createdAt: ago(30 + i * 40) });
    }
  }

  // ---------- Businesses ----------
  const businesses = [
    { uid: 'u_gruenraum', contact: 'Andrea Koller', company: 'GrünRaum Gartenbau GmbH', field: 'gardening', size: '10–49', area: ['graz', 'liebenau'], description: 'Garden design and maintenance for private gardens and housing estates across Graz since 2004.', roles: 'Gardeners and seasonal garden helpers', types: ['full_time', 'seasonal', 'part_time'], openings: 3, blurb: 'Gardening firm in Graz. Has saved candidates and a pending request.' },
    { uid: 'u_clearspace', contact: 'Markus Wieser', company: 'ClearSpace Reinigung GmbH', field: 'cleaning', size: '50–249', area: ['vienna', 'landstrasse'], description: 'Office and residential cleaning in Vienna, with fixed teams and daytime shifts.', roles: 'Part-time cleaners for morning shifts', types: ['part_time'], openings: 5, blurb: 'Cleaning company in Vienna, hiring part-time.' },
    { uid: 'u_donau', contact: 'Julia Sommer', company: 'Donau Capital Partners AG', field: 'finance', size: '50–249', area: ['vienna', 'innere-stadt'], description: 'Independent asset management and corporate finance advisory for Austrian family businesses.', roles: 'Junior analysts and finance trainees', types: ['full_time', 'trainee'], openings: 2, blurb: 'Financial services firm in Vienna. Already connected with one candidate.' },
  ];
  businesses.forEach((b, i) => {
    addUser(b.uid, b.contact, { roles: ['business'], area: b.area, since: 120 + i * 30, color: [6, 2, 1][i], email: `${b.contact.split(' ')[0].toLowerCase()}@${b.uid.slice(2)}.example.com`, demo: { group: 'Business', blurb: b.blurb } });
    s.businessProfiles.push({
      userId: b.uid, organizationId: `org_${b.uid.slice(2)}`, companyName: b.company, field: b.field, size: b.size,
      locationArea: { city: b.area[0], district: b.area[1] }, description: b.description,
      hiringIntent: { roles: b.roles, types: b.types, openings: b.openings }, verifiedStatus: 'pending_review',
      recruitingEnabled: true, recruitingConsentAt: ago(30 - i * 5), website: `${b.uid.slice(2)}.example.com`,
    });
  });

  // ---------- Moderator ----------
  addUser('u_mira', 'Mira Hofbauer', { roles: ['moderator'], area: ['vienna', 'innere-stadt'], since: 400, color: 0, demo: { group: 'Moderator', blurb: 'Safety team. Reviews reports, proof, restricted tasks and disputes.' } });

  // ---------- Tasks ----------
  const T = (o) => {
    const task = {
      id: o.id, clientId: o.client, title: o.title, category: o.cat, description: o.desc,
      locationArea: { city: o.area[0], district: o.area[1] }, date: o.date, timeWindow: { start: o.win[0], end: o.win[1] },
      estimatedHours: o.hours ?? null, budgetMin: o.budget[0], budgetMax: o.budget[1],
      requirements: o.reqs || [], safetyNotes: o.safety || '', status: o.status || 'open',
      createdAt: o.created || ago(2), exactAddress: o.address || '', invitedIds: [], hidden: false, recurring: o.recurring || null,
      reviewNote: o.reviewNote || null,
    };
    s.tasks.push(task);
    return task;
  };

  T({ id: 't_sofa', client: 'u_katharina', title: 'Carry a sofa and 15 boxes to a 3rd-floor flat (no lift)', cat: 'moving', area: ['vienna', 'wieden'], date: nextDow('sat', 5), win: ['09:00', '12:00'], hours: 3, budget: [80, 120], reqs: ['Able to carry heavy items up narrow stairs', 'Two people would be ideal — you can mention a partner in your application'], safety: 'The stairwell is narrow and the steps are worn. Please wear sturdy shoes.', desc: 'I am moving into a flat on the 3rd floor of an old building without a lift. A three-seater sofa (about 70 kg) and 15 boxes, mostly books, need to go from the van to the flat. The van is booked and parked in front of the building.', address: 'Mustergasse 12/3, 1040 Wien', created: ago(2, 4) });
  T({ id: 't_hedge', client: 'u_martin', title: 'Hedge trimming and leaf clearing before winter', cat: 'gardening', area: ['graz', 'geidorf'], date: nextDow('wed', 3), win: ['13:00', '17:00'], hours: 4, budget: [90, 140], reqs: ['Own hedge trimmer preferred', 'Green-waste bags are provided'], safety: 'The hedge is about 1.8 m high; a small step ladder is available.', desc: 'About 25 metres of hornbeam hedge need a final trim before winter, and the leaves need clearing from the lawn and beds. The garden is behind a terraced house with easy access through a side gate.', address: 'Beispielweg 4, 8010 Graz', created: ago(1, 6) });
  T({ id: 't_bruno', client: 'u_eva', title: 'Weekday lunchtime walks for Bruno, a calm Labrador', cat: 'pet_care', area: ['linz', 'urfahr'], date: nextDow('mon', 2), win: ['12:00', '13:00'], hours: 10, budget: [130, 150], recurring: 'Monday to Friday for two weeks (10 walks)', reqs: ['Comfortable with a large dog (32 kg)', 'Meet Bruno once before the first walk'], safety: 'Bruno is friendly but pulls towards other dogs at first. Harness and lead are by the door.', desc: 'I am back in the office for two weeks and need someone to take Bruno for a one-hour walk along the Danube at lunchtime, Monday to Friday. He is 7 years old, calm and loves the water.', address: 'Musterstraße 21, 4040 Linz', created: ago(3) });
  T({ id: 't_clean', client: 'u_katharina', title: 'End-of-tenancy clean for a 2-room flat', cat: 'cleaning', area: ['vienna', 'wieden'], date: day(0), win: ['08:00', '13:00'], hours: 5, budget: [140, 180], status: 'in_progress', reqs: ['Experience with end-of-tenancy cleans', 'Oven and limescale removal'], safety: 'The flat is empty; the landlord inspects it tomorrow.', desc: 'My old flat (52 m², two rooms, kitchen and bathroom) needs a thorough clean before the handover. The oven and the bathroom tiles need the most attention.', address: 'Mustergasse 5/14, 1040 Wien', created: ago(5) });
  T({ id: 't_windows', client: 'u_helga', title: 'Clean 8 windows including a balcony door', cat: 'window_cleaning', area: ['vienna', 'ottakring'], date: day(-9), win: ['09:00', '12:00'], hours: 3, budget: [80, 100], status: 'completed', reqs: ['Comfortable on a small ladder'], safety: '', desc: 'Eight box windows and the balcony door, inside and out. Ladder, cloths and cleaning products are available in the flat.', address: 'Beispielgasse 33/7, 1160 Wien', created: ago(14) });
  T({ id: 't_shelf', client: 'u_eva', title: 'Collect a bookshelf from IKEA Haid and bring it to Urfahr', cat: 'pickup_delivery', area: ['linz', 'urfahr'], date: nextDow('thu', 3), win: ['10:00', '14:00'], hours: 2.5, budget: [40, 60], reqs: ['Car or van needed — the flat-pack box is 200 cm long'], safety: 'I will meet you downstairs to carry it up together.', desc: 'I ordered a BILLY bookshelf for click-and-collect at IKEA Haid. Please collect it (already paid) and bring it to my flat in Urfahr. Carrying it up to the 1st floor together is enough, no assembly needed.', address: 'Musterstraße 21, 4040 Linz', created: ago(0, 20) });
  T({ id: 't_event', client: 'u_thomas', title: 'Set up 40 chairs and 10 tables for a neighbourhood evening', cat: 'event_setup', area: ['graz', 'lend'], date: nextDow('fri', 4), win: ['15:00', '18:00'], hours: 3, budget: [60, 90], reqs: ['Some lifting (folding tables)'], safety: 'The community room is on the ground floor with step-free access.', desc: 'Our residents’ association hosts a neighbourhood evening. We need help carrying chairs and tables from the storage room, setting them up, and putting up a few string lights.', address: 'Beispielplatz 2, 8020 Graz', created: ago(1) });
  T({ id: 't_groceries', client: 'u_helga', title: 'Weekly grocery shop and pharmacy pickup for my mother', cat: 'errands', area: ['vienna', 'ottakring'], date: nextDow('tue', 2), win: ['09:00', '11:00'], hours: 2, budget: [25, 35], recurring: 'Every Tuesday', reqs: ['Patient and friendly', 'Keep receipts'], safety: 'My mother is 84. Please take your time and introduce yourself when you arrive.', desc: 'My mother lives alone and needs her weekly shop done from a list, plus her prescription collected from the pharmacy around the corner. I pay for everything in advance through the app.', address: 'Beispielgasse 40/2, 1160 Wien', created: ago(2, 2) });
  T({ id: 't_wardrobe', client: 'u_martin', title: 'Assemble two IKEA PAX wardrobes', cat: 'household', area: ['graz', 'geidorf'], date: day(-1), win: ['14:00', '17:00'], hours: 3, budget: [60, 80], status: 'awaiting_confirmation', reqs: ['Experience with flat-pack furniture', 'Wall fixing (drill available)'], safety: '', desc: 'Two PAX wardrobe frames (236 cm high) with doors need assembling and fixing to the wall in the bedroom. Tools and a drill are available.', address: 'Beispielweg 4, 8010 Graz', created: ago(6) });
  T({ id: 't_babysit', client: 'u_daniel', title: 'Babysitter for two children (5 and 8) on Friday evenings', cat: 'babysitting', area: ['vienna', 'josefstadt'], date: nextDow('fri', 5), win: ['18:00', '22:00'], hours: 4, budget: [60, 80], status: 'under_review', recurring: 'Every Friday', reqs: ['First-aid course for children', 'References from other families'], safety: 'We would like to meet you first, together with the kids.', desc: 'We are looking for a calm, reliable babysitter for our two children on Friday evenings, so we can have a regular evening out. Dinner will be ready; the children go to bed at 20:00.', address: 'Musterplatz 8/5, 1080 Wien', created: ago(0, 9) });
  T({ id: 't_storage', client: 'u_sophie', title: 'Carry 30 boxes to a storage unit in Neubau', cat: 'moving', area: ['vienna', 'neubau'], date: day(-3), win: ['10:00', '13:00'], hours: 3, budget: [60, 75], status: 'disputed', reqs: ['Careful with fragile boxes'], safety: '', desc: 'Thirty boxes (some with glassware, clearly marked) need to go from my flat to a storage unit two streets away. A hand truck is available.', address: 'Musterstraße 77/9, 1070 Wien', created: ago(8) });
  T({ id: 't_kitchen', client: 'u_eva', title: 'Kitchen deep clean after a small renovation', cat: 'cleaning', area: ['linz', 'urfahr'], date: day(9), win: ['09:00', '14:00'], hours: 5, budget: [110, 150], reqs: ['Removing dust and paint marks', 'Own vacuum preferred'], safety: 'Some fresh paint on the window frames — please be careful there.', desc: 'The kitchen was just renovated. Fine dust is everywhere and there are some paint marks on the floor tiles. Cupboards inside and out, floor, windows and the new appliances.', address: 'Musterstraße 21, 4040 Linz', created: ago(0, 6) });
  T({ id: 't_washer', client: 'u_katharina', title: 'Help moving a washing machine to the cellar', cat: 'moving', area: ['vienna', 'wieden'], date: day(4), win: ['17:00', '18:30'], hours: 1.5, budget: [30, 45], status: 'cancelled', reqs: [], safety: '', desc: 'The old washing machine needs to go down to the cellar for collection. Cancelled: the landlord arranged it after all.', created: ago(4) });
  T({ id: 't_scam', client: 'u_spam', title: 'Earn €500 a day — simple delivery jobs, start today', cat: 'pickup_delivery', area: ['vienna', 'brigittenau'], date: day(2), win: ['08:00', '20:00'], hours: 12, budget: [500, 500], reqs: ['Send a copy of your ID first'], safety: '', desc: 'Easy money! Deliver small packages around Vienna. No questions asked, cash every evening. Message me on WhatsApp +43 660 123 45 67 or quickcash@example.com to start.', created: ago(0, 7) });

  // ---------- Applications ----------
  const A = (o) => {
    const a = { id: o.id, taskId: o.task, taskerId: o.tasker, note: o.note, proposedRate: o.price, availability: o.when, relevantSkills: o.skills || [], status: o.status || 'applied', createdAt: o.created || ago(1), shortlistedAt: o.shortlisted ? ago(0, 20) : null, simulated: false };
    s.applications.push(a);
    return a;
  };
  A({ id: 'ap_sofa_lukas', task: 't_sofa', tasker: 'u_lukas', note: 'I can bring a friend from my course, so you would have two people for the stairs. I have carried sofas up Altbau stairwells before and I am careful with door frames.', price: 100, when: 'Saturday from 9:00, can stay until 13:00 if needed', skills: ['Heavy lifting', 'Stair carries'], created: ago(1, 5) });
  A({ id: 'ap_sofa_mehmet', task: 't_sofa', tasker: 'u_mehmet', note: 'Eight years of moves in Vienna. I would bring straps and a dolly for the boxes and plan the stairwell before we start. I can bring a colleague for the sofa.', price: 115, when: 'Saturday 9:00–12:00 works', skills: ['Heavy lifting', 'Stair carries', 'Furniture disassembly'], status: 'shortlisted', shortlisted: true, created: ago(1, 2) });
  A({ id: 'ap_hedge_ferdinand', task: 't_hedge', tasker: 'u_ferdinand', note: 'I can do the hedge with my own trimmer and take the cuttings away in your green-waste bags. The leaves too, of course. Hornbeam takes a late trim well.', price: 120, when: 'Wednesday from 13:00, about four hours', skills: ['Hedge trimming', 'Leaf clearing', 'Own tools'], created: ago(1, 3) });
  A({ id: 'ap_hedge_tobias', task: 't_hedge', tasker: 'u_tobias', note: 'Trained landscape gardener, new in Graz. I will bring a hedge trimmer and a rake and leave everything tidy. Happy to show photos from my apprenticeship.', price: 100, when: 'Wednesday from 13:00', skills: ['Hedge trimming', 'Leaf clearing'], created: ago(0, 22) });
  A({ id: 'ap_bruno_jana', task: 't_bruno', tasker: 'u_jana', note: 'I live in Urfahr too and I am used to large dogs. I would love to meet Bruno first and I send a short update after each walk.', price: 140, when: 'Monday to Friday, 12:00–13:00, both weeks', skills: ['Dog walking', 'Large dogs'], created: ago(2) });
  A({ id: 'ap_groc_elif', task: 't_groceries', tasker: 'u_elif', note: 'I live nearby and can do the shop and the pharmacy pickup on Tuesday mornings. I will keep the receipts and check with you about any substitutes.', price: 30, when: 'Tuesday 9:00–11:00, every week', skills: ['Grocery shopping'], created: ago(1, 8) });
  A({ id: 'ap_groc_sophie', task: 't_groceries', tasker: 'u_sophie', note: 'Happy to help your mother every week. I am usually free in the afternoons — could Tuesday around 13:00 also work?', price: 28, when: 'Tuesday afternoon would suit me better', skills: ['Grocery shopping', 'Pharmacy pickup'], created: ago(1, 1) });
  A({ id: 'ap_clean_ana', task: 't_clean', tasker: 'u_ana', note: 'I do end-of-tenancy cleans regularly and bring an oven cleaner and limescale remover. I will walk through the flat with you at the end.', price: 160, when: 'Today 8:00–13:00', skills: ['End-of-tenancy cleaning', 'Kitchen & bathroom'], status: 'accepted', created: ago(4) });
  A({ id: 'ap_windows_ana', task: 't_windows', tasker: 'u_ana', note: 'I can clean all the windows and the balcony door in one morning.', price: 95, when: 'Morning works', skills: ['Windows & frames'], status: 'accepted', created: ago(13) });
  A({ id: 'ap_wardrobe_tobias', task: 't_wardrobe', tasker: 'u_tobias', note: 'I have assembled several PAX wardrobes and can fix them safely to the wall.', price: 70, when: 'Afternoon works well', skills: ['Furniture assembly'], status: 'accepted', created: ago(5) });
  A({ id: 'ap_storage_lukas', task: 't_storage', tasker: 'u_lukas', note: 'Two streets is easy with a hand truck. I will take extra care with the boxes marked fragile.', price: 60, when: 'Morning', skills: ['Heavy lifting'], status: 'accepted', created: ago(7) });

  // ---------- Assignments ----------
  const AS = (o) => { s.assignments.push({ id: o.id, taskId: o.task, taskerId: o.tasker, applicationId: o.app, agreedPrice: o.price, acceptedAt: o.accepted, startedAt: o.started || null, completedAt: o.completed || null, status: o.status, previousStatus: o.prev || null, paymentStatus: o.pay, completionRequestedBy: o.requestedBy || null, completionRequestedAt: o.requestedAt || null, addressShared: o.shared ?? true, cancelReason: null }); };
  AS({ id: 'as_clean', task: 't_clean', tasker: 'u_ana', app: 'ap_clean_ana', price: 160, accepted: ago(2), started: ago(0, 1), status: 'in_progress', pay: 'reserved_demo' });
  AS({ id: 'as_windows', task: 't_windows', tasker: 'u_ana', app: 'ap_windows_ana', price: 95, accepted: ago(12), started: ago(9, -1), completed: ago(9, -4), status: 'completed', pay: 'released_demo' });
  AS({ id: 'as_wardrobe', task: 't_wardrobe', tasker: 'u_tobias', app: 'ap_wardrobe_tobias', price: 70, accepted: ago(3), started: ago(1), status: 'awaiting_confirmation', pay: 'reserved_demo', requestedBy: 'u_tobias', requestedAt: ago(0, 18) });
  AS({ id: 'as_storage', task: 't_storage', tasker: 'u_lukas', app: 'ap_storage_lukas', price: 60, accepted: ago(6), started: ago(3), status: 'disputed', prev: 'awaiting_confirmation', pay: 'on_hold_demo', requestedBy: 'u_lukas', requestedAt: ago(3, -3) });

  s.disputes.push({ id: 'dp_storage', assignmentId: 'as_storage', openedBy: 'u_sophie', reason: 'damage', details: 'Two boxes with glassware were dropped on the stairs and several glasses broke. Lukas told me straight away. I would like to agree a partial price instead of the full amount.', status: 'open', outcome: null, createdAt: ago(2, 3), resolvedAt: null });

  // ---------- Wallet ----------
  const TX = (userId, type, amount, status, taskId, label, created) => {
    const rate = type === 'earning' ? APP.fees.taskerPlatformRate : APP.fees.clientServiceRate;
    s.walletTransactions.push({ id: id('tx'), userId, type, amount, fee: round2(amount * rate), status, relatedTaskId: taskId, label, createdAt: created, demoOnly: true });
  };
  TX('u_helga', 'payment', 95, 'completed', 't_windows', 'Payment for “Clean 8 windows including a balcony door”', ago(9));
  TX('u_ana', 'earning', 95, 'completed', 't_windows', 'Earning for “Clean 8 windows including a balcony door”', ago(9));
  TX('u_katharina', 'payment', 160, 'pending', 't_clean', 'Reserved for “End-of-tenancy clean for a 2-room flat”', ago(2));
  TX('u_ana', 'earning', 160, 'pending', 't_clean', 'Pending for “End-of-tenancy clean for a 2-room flat”', ago(2));
  TX('u_martin', 'payment', 70, 'pending', 't_wardrobe', 'Reserved for “Assemble two IKEA PAX wardrobes”', ago(3));
  TX('u_tobias', 'earning', 70, 'pending', 't_wardrobe', 'Pending for “Assemble two IKEA PAX wardrobes”', ago(3));
  TX('u_sophie', 'payment', 60, 'on_hold', 't_storage', 'On hold: “Carry 30 boxes to a storage unit in Neubau”', ago(6));
  TX('u_lukas', 'earning', 60, 'on_hold', 't_storage', 'On hold: “Carry 30 boxes to a storage unit in Neubau”', ago(6));

  // ---------- Reviews on live tasks ----------
  s.reviews.push({ id: id('rv'), reviewerId: 'u_helga', revieweeId: 'u_ana', taskId: 't_windows', assignmentId: 'as_windows', taskTitle: 'Clean 8 windows including a balcony door', category: 'window_cleaning', stars: 4, tags: ['Friendly', 'Thorough', 'Missed details'], comment: 'The windows look much better. A few streaks were left on the balcony door, and Ana came back to fix them right away.', status: 'published', visibility: 'public', createdAt: ago(8) });
  s.reviews.push({ id: id('rv'), reviewerId: 'u_ana', revieweeId: 'u_helga', taskId: 't_windows', assignmentId: 'as_windows', taskTitle: 'Clean 8 windows including a balcony door', category: null, stars: 5, tags: ['Clear instructions', 'Friendly'], comment: 'Very friendly and everything was prepared.', status: 'published', visibility: 'public', createdAt: ago(8) });

  // ---------- Conversations ----------
  const C = (cid, contextType, contextId, participants, msgs) => {
    s.conversations.push({ id: cid, contextType, contextId, participantIds: participants, createdAt: msgs[0]?.[2] || ago(1) });
    for (const [sender, body, at, opts = {}] of msgs) {
      s.messages.push({ id: id('m'), conversationId: cid, senderId: sender, body, createdAt: at, readBy: opts.unreadFor ? [sender] : participants.slice(), system: !!opts.system, masked: false, simulated: false, hidden: false });
    }
  };
  C('c_clean', 'task', 't_clean', ['u_katharina', 'u_ana'], [
    ['u_katharina', 'Hi Ana, thanks for applying! The flat is 52 m², two rooms, kitchen and bathroom. The oven needs the most attention.', ago(3, 2)],
    ['u_ana', 'Hello Katharina, no problem. I will bring my own products and an oven cleaner. Is there a vacuum in the flat?', ago(3, 1)],
    ['u_katharina', 'Yes, the vacuum stays until the handover. I have accepted your application — see you on the day!', ago(2, 1)],
    [null, 'Katharina shared the exact address with Ana.', ago(2), { system: true }],
    ['u_ana', 'Good morning! I am on my way and will arrive around 8:15.', ago(0, 1)],
  ]);
  C('c_sofa_mehmet', 'task', 't_sofa', ['u_katharina', 'u_mehmet'], [
    ['u_katharina', 'Hi Mehmet, could you bring a dolly? There are 15 boxes, mostly books.', ago(1, 1)],
    ['u_mehmet', 'Yes, I will bring a dolly and straps. Is there space for the van right in front of the building?', ago(0, 3), { unreadFor: true }],
  ]);
  C('c_wardrobe', 'task', 't_wardrobe', ['u_martin', 'u_tobias'], [
    ['u_martin', 'Hi Tobias, both wardrobes are PAX, 236 cm high. Do you need help lifting them upright?', ago(3, 2)],
    ['u_tobias', 'Thanks Martin! I can tilt them up on my own, but it would be great if you could hold the frame for a minute at the end.', ago(3, 1)],
    ['u_tobias', 'All done: both wardrobes are assembled and fixed to the wall. I have marked the task as completed — please have a look when you can.', ago(0, 18), { unreadFor: true }],
  ]);
  C('c_storage', 'task', 't_storage', ['u_sophie', 'u_lukas'], [
    ['u_lukas', 'All the boxes are in the storage unit. I am really sorry about the box with the glasses — it slipped on the last flight of stairs.', ago(3, -3)],
    ['u_sophie', 'Thank you for telling me straight away. I have opened a dispute so we can agree a fair price. Nothing personal.', ago(2, 3)],
  ]);
  C('c_donau_elif', 'recruiting', 'bc_donau_elif', ['u_donau', 'u_elif'], [
    ['u_donau', 'Hello Elif, we are hiring two junior analysts in our Vienna office. Your economics background and Excel skills look relevant. Would you be open to a short call?', ago(4)],
    ['u_elif', 'Hello, thank you for reaching out! Yes, I would be happy to talk. I am available most mornings next week.', ago(3)],
    ['u_donau', 'Great — we will suggest a time here in the chat. There is no need to share your phone number yet.', ago(2)],
  ]);

  // ---------- Recruiting ----------
  s.businessConnections.push(
    { id: 'bc_gruen_ferdinand', businessId: 'u_gruenraum', taskerId: 'u_ferdinand', status: 'pending', message: 'Hello Ferdinand, we are a gardening firm in Graz-Liebenau looking for experienced gardeners for the coming season, part-time possible. Your reviews on hedge and lawn work stood out. Would you like to talk?', createdAt: ago(1), respondedAt: null, conversationId: null, outcome: null },
    { id: 'bc_donau_elif', businessId: 'u_donau', taskerId: 'u_elif', status: 'accepted', message: 'Hello Elif, we are hiring two junior analysts in our Vienna office. Your economics background and Excel skills look relevant. Would you be open to a short call?', createdAt: ago(4), respondedAt: ago(3), conversationId: 'c_donau_elif', outcome: 'talking' },
    { id: 'bc_clear_ana', businessId: 'u_clearspace', taskerId: 'u_ana', status: 'pending', message: 'Hello Ana, we are hiring part-time cleaners for offices in the 3rd district, mornings only. Your end-of-tenancy experience is a great fit. Interested in a chat?', createdAt: ago(2), respondedAt: null, conversationId: null, outcome: null },
  );
  s.savedCandidates.push(
    { businessId: 'u_gruenraum', taskerId: 'u_tobias', createdAt: ago(1) },
    { businessId: 'u_gruenraum', taskerId: 'u_ferdinand', createdAt: ago(2) },
    { businessId: 'u_donau', taskerId: 'u_elif', createdAt: ago(5) },
    { businessId: 'u_clearspace', taskerId: 'u_ana', createdAt: ago(3) },
  );

  // ---------- Safety ----------
  // The scam account also wrote to Lukas before he reported the task (contact details were masked on send).
  C('c_scam_lukas', 'task', 't_scam', ['u_spam', 'u_lukas'], [
    ['u_spam', 'Hi! Easy money, I pay cash every evening. Write me on WhatsApp [contact details hidden] and send a copy of your ID first.', ago(0, 6)],
    ['u_lukas', 'Sorry, I do not send ID copies to strangers. I will keep everything in the app.', ago(0, 5)],
  ]);
  s.messages.find((m) => m.conversationId === 'c_scam_lukas' && m.senderId === 'u_spam').masked = true;
  s.reports.push({ id: 'rp_spam_old', reporterId: 'u_ana', targetType: 'user', targetId: 'u_spam', reason: 'spam', details: 'This account keeps posting job adverts that have nothing to do with small tasks.', status: 'resolved', decision: 'warning', note: 'First warning: advertising outside the rules.', createdAt: ago(1, 2), resolvedAt: ago(0, 22), resolvedBy: 'st_mira' });
  s.dataRequests.push({ id: 'dr_bg3', userId: 'u_bg3', type: 'deletion', status: 'received', createdAt: ago(5) });
  s.reports.push({ id: 'rp_scam', reporterId: 'u_lukas', targetType: 'task', targetId: 't_scam', reason: 'scam', details: 'Promises €500 a day and asks people to continue on WhatsApp and send ID copies. Looks like a scam.', status: 'pending_review', decision: null, createdAt: ago(0, 5), resolvedAt: null });

  // ---------- Notifications ----------
  const N = (userId, text, href, created, actorId = null) => s.notifications.push({ id: id('n'), userId, text, href, read: false, createdAt: created, actorId });
  N('u_katharina', 'Mehmet replied about “Carry a sofa and 15 boxes…”.', '/messages/c_sofa_mehmet', ago(0, 3), 'u_mehmet');
  N('u_katharina', '2 people applied to “Carry a sofa and 15 boxes…”.', '/tasks/t_sofa/applicants', ago(1, 2), 'u_mehmet');
  N('u_martin', 'Tobias marked “Assemble two IKEA PAX wardrobes” as completed. Please confirm.', '/assignments/as_wardrobe', ago(0, 18), 'u_tobias');
  N('u_ferdinand', 'GrünRaum Gartenbau GmbH would like to connect about stable work.', '/recruiting', ago(1), 'u_gruenraum');
  N('u_ana', 'ClearSpace Reinigung GmbH would like to connect about stable work.', '/recruiting', ago(2), 'u_clearspace');
  N('u_lukas', 'Sophie opened a dispute on “Carry 30 boxes…”. Ratings and payments are paused while it is open.', '/assignments/as_storage', ago(2, 3), 'u_sophie');
  N('u_mira', 'New report: “Earn €500 a day…” (possible scam).', '/moderation?tab=reports', ago(0, 5), 'u_lukas');
  N('u_mira', 'Task waiting for manual review: “Babysitter for two children…”.', '/moderation?tab=tasks', ago(0, 9), 'u_daniel');
  N('u_mira', 'Dispute opened on “Carry 30 boxes to a storage unit in Neubau”.', '/moderation?tab=disputes', ago(2, 3), 'u_sophie');
  N('u_daniel', 'Your babysitting task is in manual review. We will let you know when it is live.', '/tasks/t_babysit', ago(0, 9));
  N('u_tobias', 'Martin has not confirmed yet. The payment stays reserved (demo) until then.', '/assignments/as_wardrobe', ago(0, 17));

  if (s.seedLang === 'de') localizeSeed(s);
  addBackoffice(s, { ago, id });
  return s;
}
