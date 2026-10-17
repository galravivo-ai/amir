import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsPlan } from '../src/maps.js';

// A store with just what the plan reads.
function fakeStore({ locations, audits = [], stats = { unanswered: 0, waiting: [] }, fresh = 0, competitors = [], posts = [], keywords = [], checks = {}, done = [] }) {
  return {
    googleLocations: () => locations,
    latestAudits: () => audits,
    googleStats: () => stats,
    googleReviewCount: () => fresh,
    competitorsFor: () => competitors,
    googlePosts: () => posts,
    rankKeywords: () => keywords,
    rankChecks: (id) => checks[id] || [],
    tasksDone: () => done,
  };
}

const loc = { id: 1, enabled: 1, source: 'gbp', total_reviews: 87 };
const P = (rank) => ({ rank, top: ['קפה המוביל'] });

test('the maps plan: steps from the profile check, reviews, posts and the rank grid', () => {
  const store = fakeStore({
    locations: [loc],
    audits: [{ items: JSON.stringify([
      { key: 'phone', label: 'מספר טלפון', weight: 6, state: 'fail', fix: 'הוסיפו טלפון' },
      { key: 'reviews', label: 'לפחות 100 ביקורות', weight: 10, state: 'fail', fix: '' },
      { key: 'hours', label: 'שעות פתיחה', weight: 8, state: 'pass', fix: '' },
    ]) }],
    stats: { unanswered: 3, waiting: [{}] },
    fresh: 2,
    competitors: [{ title: 'קפה המוביל', total: 212, recent30: 9, recent_capped: 0 }],
    keywords: [{ id: 5, keyword: 'בית קפה' }],
    checks: { 5: [{ points: JSON.stringify([P(2), P(3), P(15), P(1), P(1), P(null), P(4), P(5), P(6)]) }] },
  });
  const plan = mapsPlan(store, { id: 1 }, { serpOn: true, limit: 10 });
  const keys = plan.map((s) => s.key);
  assert.deepEqual(keys, ['reply', 'ask', 'profile-phone', 'posts', 'area-5']);
  assert.match(plan[1].why, /לקפה המוביל יש 212 ביקורות ולכם 87/);
  assert.match(plan[1].why, /קיבלו 9, ואתם 2/);
  assert.equal(plan[1].action, 'wa');
  assert.ok(!keys.includes('profile-reviews'), 'reviews are their own step, not "fill in the profile"');
  assert.match(plan[4].title, /צפון-מזרח, מזרח/);
  assert.deepEqual([...new Set(plan.map((s) => s.factor))].sort(), ['distance', 'prominence', 'relevance']);

  const later = mapsPlan({ ...store, tasksDone: () => ['reply', 'ask'] }, { id: 1 }, { serpOn: true });
  assert.equal(later[0].key, 'profile-phone', 'steps marked done this week are hidden');
  assert.deepEqual(mapsPlan(fakeStore({ locations: [] }), { id: 1 }), [], 'nothing before Google is connected');
});

test('the maps plan: ahead of the leader on fresh reviews, the step says keep going', () => {
  const store = fakeStore({ locations: [loc], fresh: 20, competitors: [{ title: 'המוביל', total: 500, recent30: 10, recent_capped: 0 }] });
  const ask = mapsPlan(store, { id: 1 }).find((s) => s.key === 'ask');
  assert.equal(ask.title, 'להמשיך לבקש דירוגים בקצב הזה');
  assert.match(ask.why, /אתם בקצב טוב יותר/);
});
