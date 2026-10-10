import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSerp } from '../src/serp.js';
import { gridPoints } from '../src/rankings.js';

test('nine points around the place, the place in the middle', () => {
  const pts = gridPoints(32.08, 34.78, 1000);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[4], { lat: 32.08, lng: 34.78 });
  assert.ok(pts[1].lat > 32.08 && Math.abs(pts[1].lat - 32.08 - 0.009) < 0.0002, 'north is about 1 km up');
  assert.ok(pts[3].lng < 34.78, 'west is left');
});

const searches = [];
const serpFetch = async (url) => {
  const u = new URL(url);
  const json = (b) => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(b) });
  if (u.searchParams.get('place_id') === 'ChIJmine12345') {
    return json({ place_results: { title: 'ג׳קו סטריט', gps_coordinates: { latitude: 32.08, longitude: 34.78 } } });
  }
  if (u.searchParams.get('engine') === 'google_maps' && u.searchParams.get('ll')) {
    searches.push(u.searchParams.get('ll'));
    const [lat] = u.searchParams.get('ll').slice(1).split(',').map(Number);
    // Near the place we're 2nd; north of it we're not in the results at all.
    const mine = { data_id: '0x1:0xmine', place_id: 'ChIJmine12345', title: 'ג׳קו סטריט' };
    const rivals = [{ data_id: '0x2', title: 'קפה לנדוור' }, { data_id: '0x3', title: 'בנדיקט' }, { data_id: '0x4', title: 'ארומה' }];
    const list = lat > 32.081 ? rivals : [rivals[0], mine, ...rivals.slice(1)];
    return json({ local_results: list.map((x, i) => ({ ...x, position: i + 1 })) });
  }
  return json({ error: 'unexpected' });
};

let created;
let server;
let base;
const jar = {};
const req = async (path, { method = 'GET', form } = {}) => {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    jar[pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
  }
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
};

before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null,
    serp: createSerp({ apiKey: 'k', fetchImpl: serpFetch }),
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('follow a search: a grid of ranks, the average, and who leads', async () => {
  await req('/register', { method: 'POST', form: { name: 'גל', email: 'rk@example.com', password: 'password123', business: 'ג׳קו סטריט', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = created.store.businessesFor(created.store.userByEmail('rk@example.com').id)[0];
  assert.match((await req('/admin/rankings')).text, /הוסיפו קודם את העסק/);
  const loc = created.store.addSerpLocation(biz.id, { dataId: '0x1:0xmine', placeId: 'ChIJmine12345', title: 'ג׳קו סטריט' });

  const added = await req('/admin/rankings', { method: 'POST', form: { _csrf: token, keyword: '  בית   קפה ', location: String(loc.id), radius: '1000' } });
  assert.equal(added.location, '/admin/rankings?added=1');
  // The first check runs in the background; wait for it.
  for (let i = 0; i < 50 && !created.store.rankChecks(created.store.rankKeywords(biz.id)[0].id, 1).length; i++) await new Promise((r) => setTimeout(r, 20));
  const [k] = created.store.rankKeywords(biz.id);
  assert.equal(k.keyword, 'בית קפה');
  assert.equal(created.store.googleLocations(biz.id)[0].lat, 32.08, 'the place\'s position is kept');
  assert.equal(searches.length, 9);
  assert.match(searches[0], /^@32\.08\d+,34\.76\d+,15z$/, "north-west first");
  const [check] = created.store.rankChecks(k.id, 1);
  assert.equal(check.found, 6, 'the 3 northern points don\'t find us');
  assert.equal(check.avg_rank, +((6 * 2 + 3 * 21) / 9).toFixed(1));

  const page = (await req('/admin/rankings')).text;
  assert.match(page, /href="\/admin\/rankings"/, 'in the menu');
  assert.match(page, /«בית קפה»/);
  assert.match(page, /6 מתוך 9/);
  assert.match(page, /קפה לנדוור <span class="muted small">\(9 מתוך 9\)/);
  assert.match(page, /<b>20\+<\/b><small>צפון<\/small>/);

  // The plan's limit (basic: 2 searches).
  created.store.updateBusiness(biz.id, { plan: 'basic', billing: 'active' });
  assert.equal((await req('/admin/rankings', { method: 'POST', form: { _csrf: token, keyword: 'ארוחת בוקר', location: String(loc.id), radius: '1000' } })).location, '/admin/rankings?added=1');
  for (let i = 0; i < 50 && created.store.rankKeywords(biz.id).some((x) => !created.store.rankChecks(x.id, 1).length); i++) await new Promise((r) => setTimeout(r, 20));
  const over = await req('/admin/rankings', { method: 'POST', form: { _csrf: token, keyword: 'בראנץ׳', location: String(loc.id), radius: '1000' } });
  assert.match(over.text, /עד 2 חיפושים/);

  assert.equal(await created.jobs.mapRankings(), 0, 'weekly, not again right away');
  for (const x of created.store.rankKeywords(biz.id)) await req(`/admin/rankings/${x.id}/delete`, { method: 'POST', form: { _csrf: token } });
  assert.equal(created.store.rankKeywords(biz.id).length, 0);
});

test('monthly limits on actions started by hand', async () => {
  const { monthKey, usageOf } = await import('../src/usage.js');
  const biz = created.store.businessesFor(created.store.userByEmail('rk@example.com').id)[0];
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  created.store.updateBusiness(biz.id, { plan: 'basic', billing: 'active' });
  const loc = created.store.googleLocations(biz.id)[0];
  created.store.resetUsage(biz.id, monthKey());

  // Basic: 2 manual map checks a month; adding a search counts its first check.
  await req('/admin/rankings', { method: 'POST', form: { _csrf: token, keyword: 'קפה', location: String(loc.id), radius: '500' } });
  for (let i = 0; i < 50 && created.store.rankChecks(created.store.rankKeywords(biz.id)[0].id, 1).length === 0; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(usageOf(created.store, created.store.businessById(biz.id)).rank_run.used, 1);
  await new Promise((r) => setTimeout(r, 50));
  await req('/admin/rankings/run', { method: 'POST', form: { _csrf: token } });
  for (let i = 0; i < 50 && created.store.rankChecks(created.store.rankKeywords(biz.id)[0].id, 5).length < 2; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 50));
  const over = await req('/admin/rankings/run', { method: 'POST', form: { _csrf: token } });
  assert.match(over.text, /הגעתם למגבלה החודשית/);
  assert.match((await req('/admin/rankings')).text, /נשארו 0 בדיקות ידניות החודש/);

  // Shown on the plan page; a system admin can reset it.
  const plan = (await req('/admin/plan')).text;
  assert.match(plan, /שימוש החודש/);
  assert.match(plan, /בדיקת מיקום במפות ידנית \(לכל חיפוש\)<\/span><span>2 \/ 2/);
  created.store.db.prepare('UPDATE users SET is_superadmin = 1 WHERE email = ?').run('rk@example.com');
  await req(`/superadmin/businesses/${biz.id}/reset-usage`, { method: 'POST', form: { _csrf: token } });
  assert.equal(usageOf(created.store, created.store.businessById(biz.id)).rank_run.used, 0);
});
