// Rating summaries and profile completeness. Pure functions over plain data.
import { round1 } from '../util.js';

export function summarize(reviews) {
  const pub = reviews.filter((r) => r.status === 'published' && r.visibility !== 'private');
  const count = pub.length;
  const sum = pub.reduce((a, r) => a + r.stars, 0);
  const dist = [0, 0, 0, 0, 0];
  const tagMap = {};
  const byCategory = {};
  for (const r of pub) {
    dist[r.stars - 1] += 1;
    for (const tag of r.tags || []) tagMap[tag] = (tagMap[tag] || 0) + 1;
    if (r.category) {
      const c = (byCategory[r.category] ??= { count: 0, sum: 0, avg: 0 });
      c.count += 1;
      c.sum += r.stars;
    }
  }
  for (const c of Object.values(byCategory)) c.avg = round1(c.sum / c.count);
  return {
    count,
    avg: count ? round1(sum / count) : null,
    dist,
    tags: Object.entries(tagMap).sort((a, b) => b[1] - a[1]),
    byCategory,
  };
}

// Completion record, only shown once there is enough data to be meaningful.
export function reliability(profile) {
  const accepted = (profile?.completedTaskCount || 0) + (profile?.cancelledByTasker || 0);
  if (accepted < 5) return null;
  return { completed: profile.completedTaskCount, accepted, rate: profile.completedTaskCount / accepted };
}

// Completeness is guidance, not a gate: basic discovery works at any percentage.
export function completeness(user, profile, proofs = []) {
  const p = profile || {};
  const slots = Object.values(p.availability || {}).reduce((a, s) => a + s.length, 0);
  const items = [
    { key: 'area', label: 'Location area', done: !!user?.locationArea },
    { key: 'headline', label: 'Headline', done: (p.headline || '').trim().length >= 10 },
    { key: 'bio', label: 'Short bio', done: (p.bio || '').trim().length >= 40 },
    { key: 'categories', label: 'At least one category', done: (p.categories || []).length > 0 },
    { key: 'skills', label: 'Three or more skills', done: (p.skills || []).length >= 3 },
    { key: 'availability', label: 'Availability', done: slots > 0 },
    { key: 'rates', label: 'Rates', done: p.rateMin > 0 && p.rateMax >= p.rateMin },
    { key: 'languages', label: 'Languages', done: (user?.languages || []).length > 0 },
    { key: 'experience', label: 'Experience', done: (p.experience || '').trim().length >= 10 },
    { key: 'proof', label: 'A proof item (optional)', done: proofs.length > 0 },
  ];
  const done = items.filter((i) => i.done).length;
  return { pct: Math.round((done / items.length) * 100), items, missing: items.filter((i) => !i.done) };
}
