import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { findDrops, sendDropAlerts } from '../src/drops.js';

test('drop alerts: rating, map rank and AI visibility, each sent once', async () => {
  const store = createStore(openDb(':memory:'));
  const db = store.db;
  const userId = store.createUser({ email: 'd@example.com', name: 'דנה', passwordHash: 'x' });
  const bizId = store.createBusiness(userId, { name: 'ג׳קו' });
  const loc = Number(db.prepare("INSERT INTO google_locations (business_id, name, title, enabled, source) VALUES (?, 'serp:1', 'ג׳קו דיזנגוף', 1, 'serp')").run(bizId).lastInsertRowid);
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  store.snapshot('location', loc, { rating: 4.6, total: 300 }, day(8));
  store.snapshot('location', loc, { rating: 4.4, total: 306 }, day(0));

  const kw = store.addRankKeyword(bizId, loc, 'ראמן', 1000);
  store.saveRankCheck(kw, { avgRank: 3.2, found: 9 });
  store.saveRankCheck(kw, { avgRank: 5.0, found: 8 });

  const runAt = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  for (let i = 0; i < 5; i++) store.saveAiCheck(bizId, runAt(8), { query: `q${i}`, engine: 'chatgpt', mentioned: i < 3 });
  for (let i = 0; i < 5; i++) store.saveAiCheck(bizId, runAt(1), { query: `q${i}`, engine: 'chatgpt', mentioned: i < 1 });

  const business = store.businessById(bizId);
  const drops = findDrops(store, business);
  assert.deepEqual(drops.map((d) => d.kind), ['rating', 'rank', 'ai']);
  assert.match(drops[0].title, /4\.4/);
  assert.match(drops[1].detail, /3\.2 ל-5\.0/);
  assert.match(drops[2].title, /ירד ל-20/);

  const sent = [];
  const notifier = { dropsAlert: async (x) => sent.push(x) };
  assert.equal(await sendDropAlerts({ store, notifier }), 1);
  assert.equal(sent[0].drops.length, 3);
  assert.equal(await sendDropAlerts({ store, notifier }), 0, 'the same drops are not sent twice');

  // Turned off in the settings: nothing is checked.
  store.updateBusiness(bizId, { alert_drops: false });
  store.saveRankCheck(kw, { avgRank: 7.0, found: 8 });
  assert.equal(await sendDropAlerts({ store, notifier }), 0);
});
