import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSerp } from '../src/serp.js';

const day = 864e5;
const ago = (days) => new Date(Date.now() - days * day).toISOString();
const PLACES = {
  '0x1:0xa': { title: 'קפה לנדוור', address: 'דיזנגוף 100', rating: 4.6, reviews: 2400, recent: [1, 2, 3, 5, 8, 9, 12, 20] },
  '0x1:0xb': { title: 'קפה ארומה', address: 'דיזנגוף 150', rating: 4.1, reviews: 900, recent: [3, 40, 50] },
};
let landwerTotal = 2400;
const serpFetch = async (url) => {
  const u = new URL(url);
  const json = (b) => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(b) });
  if (u.searchParams.get('engine') === 'google_maps') {
    return json({ local_results: Object.entries(PLACES).map(([id, p]) => ({ data_id: id, title: p.title, address: p.address, rating: p.rating, reviews: p.reviews })) });
  }
  if (u.searchParams.get('engine') === 'google_maps_reviews') {
    const p = PLACES[u.searchParams.get('data_id')];
    return json({
      place_info: { title: p.title, address: p.address, rating: p.rating, reviews: p.title === 'קפה לנדוור' ? landwerTotal : p.reviews },
      reviews: p.recent.map((d, i) => ({ review_id: `${i}`, user: { name: 'x' }, rating: 5, snippet: 'טוב', iso_date: ago(d) })),
      serpapi_pagination: { next_page_token: 'more' },
    });
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
    authLimit: { windowMs: 60e3, max: 1000 },
    backups: false,
    google: null,
    ai: null,
    answerEngines: {},
    cardcom: null,
    whatsapp: null,
    serp: createSerp({ apiKey: 'k', fetchImpl: serpFetch }),
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('compare with competitors: rank, new reviews and trends', async () => {
  await req('/register', { method: 'POST', form: { name: 'גל', email: 'cmp@example.com', password: 'password123', business: 'ג׳קו סטריט', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = created.store.businessesFor(created.store.userByEmail('cmp@example.com').id)[0];

  let page = await req('/admin/competitors');
  assert.match(page.text, /href="\/admin\/competitors"/, 'in the menu');
  assert.match(page.text, /הוסיפו אותו קודם/, 'asks to add the business itself first');

  // The business's own place, with 5 reviews this month.
  const loc = created.store.addSerpLocation(biz.id, { dataId: '0x1:0xc', title: 'ג׳קו סטריט' });
  created.store.googleLocationStats(loc.id, 4.4, 320);
  for (let i = 0; i < 5; i++) created.store.upsertGoogleReview(loc.id, { name: `r${i}@${loc.id}`, reviewer: 'x', photo: '', rating: 5, comment: '', createTime: ago(i + 1), updateTime: ago(i + 1), reply: '', replyTime: '' });

  // Its own place can't be added as a competitor.
  const self = await req('/admin/competitors/add', { method: 'POST', form: { _csrf: token, data_id: '0x1:0xc', title: 'ג׳קו סטריט' } });
  assert.match(self.text, /זה העסק שלכם/);

  // Search, pick, and it's checked right away.
  const found = await req('/admin/competitors/find', { method: 'POST', form: { _csrf: token, q: 'בית קפה דיזנגוף' } });
  assert.match(found.text, /קפה לנדוור/);
  assert.match(found.text, /הוספה להשוואה/);
  for (const id of ['0x1:0xa', '0x1:0xb']) {
    const r = await req('/admin/competitors/add', { method: 'POST', form: { _csrf: token, data_id: id, title: PLACES[id].title } });
    assert.equal(r.location, '/admin/competitors?added=1');
  }
  const [landwer, aroma] = created.store.competitorsFor(biz.id);
  assert.equal(landwer.rating, 4.6);
  assert.equal(landwer.total, 2400);
  assert.equal(landwer.recent30, 8, 'all 8 on the first page are from this month');
  assert.equal(landwer.recent_capped, 1, 'and there are more pages');
  assert.equal(aroma.recent30, 1);
  assert.equal(aroma.recent_capped, 0);

  page = await req('/admin/competitors');
  assert.match(page.text, /2 <small>מתוך 3<\/small>/, 'ranked second by rating');
  assert.match(page.text, /8\+/);
  assert.match(page.text, /<td class="cmp-recent">.*<b>5<\/b>/s, 'own new reviews counted from the reviews');
  const table = page.text.slice(page.text.indexOf('cmp-table'));
  assert.ok(table.indexOf('קפה לנדוור') < table.indexOf('ג׳קו סטריט</b>'), 'sorted by rating');

  // A month of history: new reviews from the snapshot, and the rating change.
  const monthAgo = new Date(Date.now() - 31 * day).toISOString().slice(0, 10);
  created.store.snapshot('competitor', landwer.id, { rating: 4.5, total: 2370 }, monthAgo);
  landwerTotal = 2412;
  created.store.updateCompetitor(landwer.id, { checked_at: '2020-01-01 00:00:00' });
  assert.equal(await created.jobs.competitorChecks(), 1, 'only the one that is due');
  page = await req('/admin/competitors');
  assert.match(page.text, /<b>42<\/b>/, '2412 - 2370 new reviews in 30 days');
  assert.match(page.text, /▲ 0\.1/);
  assert.ok(created.store.snapshotOnOrBefore('location', loc.id, '9999-12-31'), 'own place snapshot recorded');

  // The plan's limit (basic: 3).
  created.store.updateBusiness(biz.id, { plan: 'basic', billing: 'active' });
  created.store.addCompetitor(biz.id, { dataId: '0x2:0x1', title: 'שלישי' });
  const over = await req('/admin/competitors/add', { method: 'POST', form: { _csrf: token, data_id: '0x2:0x2', title: 'רביעי' } });
  assert.match(over.text, /עד 3 מתחרים/);

  await req(`/admin/competitors/${aroma.id}/delete`, { method: 'POST', form: { _csrf: token } });
  assert.equal(created.store.competitorsFor(biz.id).length, 2);
});
