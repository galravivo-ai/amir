import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { dataArrival } from '../src/arrival.js';

test('after connecting Google: what arrives when, ticked as it arrives', () => {
  const store = createStore(openDb(':memory:'));
  const user = store.createUser({ email: 'arr@example.com', name: 'A', passwordHash: 'x' });
  const business = store.businessById(store.createBusiness(user, { name: 'Cafe', plan: 'pro' }));
  store.saveGoogleConnection(business.id, { email: 'o@gmail.com', refreshToken: 'x', accessToken: 'x', expiresAt: 0 });
  store.upsertGoogleLocations(business.id, [{ name: 'locations/1', title: 'Cafe', address: 'A', placeId: 'p', reviewUrl: '' }]);

  let a = dataArrival(store, business, { serpOn: true, aiPlus: true });
  assert.ok(a.connected && a.fresh);
  assert.deepEqual(a.items.map((i) => i.key), ['reviews', 'metrics', 'searches', 'health', 'rank', 'ai', 'live']);
  assert.equal(a.items.find((i) => i.key === 'reviews').done, false);
  assert.ok(a.items.find((i) => i.key === 'rank').todo, 'map rank waits for a search to track');

  const loc = store.googleLocations(business.id)[0];
  store.googleLocationStats(loc.id, 4.6, 120);
  store.saveProfileMetrics(loc.id, [{ date: '2026-10-01', metric: 'CALL_CLICKS', value: 3 }]);
  a = dataArrival(store, business, { serpOn: true, aiPlus: true });
  assert.equal(a.items.find((i) => i.key === 'reviews').done, true);
  assert.equal(a.items.find((i) => i.key === 'metrics').done, true);
  assert.equal(a.pending, 3, 'health, rank and AI still on the way');
  // Without the paid extras, they aren't listed at all.
  assert.deepEqual(dataArrival(store, business).items.map((i) => i.key), ['reviews', 'metrics', 'searches', 'live']);
});
