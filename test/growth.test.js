import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { growthPlan, markPeriod } from '../src/growth.js';
import { checkSite, readSite } from '../src/siteCheck.js';

let server;
let base;
let store;
const written = [];
const ai = { growthDraft: async ({ kind, facts }) => (written.push({ kind, facts }), `טיוטה: ${kind}`) };
const siteCheck = async (url) => ({ url, https: true, title: 'מספרה בחולון', description: 'תספורות', viewport: true, localSchema: true, faqSchema: false, phoneOnPage: true, mapLink: true, cityInHead: true });

before(async () => {
  const created = createApp(openDb(':memory:'), { backups: false, ai, cardcom: null, authLimit: { windowMs: 60e3, max: 1000 }, growth: { siteCheck } });
  store = created.store;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function client() {
  const jar = {};
  return async (path, { form } = {}) => {
    const res = await fetch(base + path, {
      method: form ? 'POST' : 'GET',
      redirect: 'manual',
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      jar[pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), type: res.headers.get('content-type') || '' };
  };
}

async function owner(email) {
  const req = client();
  await req('/register', { form: { name: 'Owner', email, password: 'password123', business: 'מספרת דני', terms: '1' } });
  const page = await req('/admin/growth');
  const csrf = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = store.db.prepare('SELECT b.* FROM businesses b JOIN users u ON u.id = b.user_id WHERE u.email = ?').get(email);
  return { req, csrf, biz, page };
}

test('the website check reads the title, the markup, the phone and the map link', () => {
  const html = `<html><head><title>מספרה לגברים בחולון | מספרת דני</title><meta name="description" content="תספורות">
    <meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"HairSalon","name":"x"},{"@type":"FAQPage"}]}</script></head>
    <body><h1>מספרת דני</h1><a href="tel:+972-3-555-1234">התקשרו</a><a href="https://maps.app.goo.gl/abc">מפה</a></body></html>`;
  const r = readSite(html, { url: 'https://dani.co.il/', phone: '03-5551234', city: 'חולון' });
  assert.equal(r.title, 'מספרה לגברים בחולון | מספרת דני');
  assert.equal(r.localSchema, true);
  assert.equal(r.faqSchema, true);
  assert.equal(r.phoneOnPage, true);
  assert.equal(r.mapLink, true);
  assert.equal(r.cityInHead, true);
  assert.equal(r.viewport, true);
  const bare = readSite('<title>x</title>', { url: 'http://a.co/', phone: '03-5551234', city: 'חולון' });
  assert.deepEqual([bare.localSchema, bare.faqSchema, bare.phoneOnPage, bare.mapLink, bare.cityInHead, bare.https], [false, false, false, false, false, false]);
});

test('the website check opens only public addresses, and checks each redirect', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://public.example/')) return new Response('', { status: 301, headers: { location: 'http://127.0.0.1/admin' } });
    return new Response('<title>ok</title>', { status: 200 });
  };
  const lookup = async (host) => [{ address: host === 'public.example' ? '93.184.216.34' : '10.0.0.1' }];
  assert.match((await checkSite('http://localhost/', { fetchImpl, lookup })).error, /לא ציבורית/);
  assert.match((await checkSite('https://inside.example/', { fetchImpl, lookup })).error, /לא ציבורית/);
  // a public site that redirects to a private address is stopped at the redirect
  assert.match((await checkSite('public.example', { fetchImpl, lookup })).error, /לא ציבורית/);
  assert.deepEqual(calls, ['https://public.example/']);
});

test('a new business starts low, and marks raise the score: weekly ones for the week only', () => {
  const user = store.createUser({ email: 'plan@example.com', name: 'P', passwordHash: 'x' });
  const biz = store.businessById(store.createBusiness(user, { name: 'Plan', plan: 'pro', trialDays: 7 }));
  const start = growthPlan(store, biz);
  assert.ok(start.score < 10, `score ${start.score}`);
  assert.ok(start.next.length > 0);
  const now = Date.parse('2026-10-20T10:00:00Z');
  store.setGrowthMark(biz.id, 'photos', markPeriod('photos', now), true);
  store.setGrowthMark(biz.id, 'booking', markPeriod('booking', now), true);
  for (const d of ['b144', 'd', 'easy', 'facebook', 'waze']) store.setGrowthMark(biz.id, `dir:${d}`, '', true);
  const marked = growthPlan(store, biz, { now });
  const items = Object.values(marked.tracks).flatMap((t) => t.items);
  assert.equal(items.find((i) => i.key === 'photos').state, 'done');
  assert.equal(items.find((i) => i.key === 'citations').state, 'done', 'five directories make the directories action done');
  assert.ok(marked.score > start.score);
  // a week later the photos are due again
  const later = growthPlan(store, biz, { now: now + 8 * 864e5 });
  assert.equal(Object.values(later.tracks).flatMap((t) => t.items).find((i) => i.key === 'photos').state, 'todo');
  assert.equal(markPeriod('nope'), null);
  assert.equal(markPeriod('dir:nope'), null);
});

test('the plan page: marking an action, the website, the business details and the AI writer', async () => {
  const { req, csrf, biz, page } = await owner('growth@example.com');
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>[\s\S]*?קידום בגוגל מפות<\/h1>/);
  assert.match(page.text, /אינדקסים ואזכורים/);

  const mark = await req('/admin/growth/mark', { form: { _csrf: csrf, key: 'booking', on: '1' } });
  assert.equal(mark.status, 303);
  assert.equal(mark.location, '/admin/growth#a-booking');
  assert.deepEqual(store.growthMarks(biz.id).map((m) => m.key), ['booking']);
  assert.equal((await req('/admin/growth/mark', { form: { _csrf: csrf, key: 'whatever', on: '1' } })).status, 400);

  await req('/admin/growth/services', { form: { _csrf: csrf, services: 'תספורות גברים וילדים' } });
  await req('/admin/growth/site', { form: { _csrf: csrf, url: 'dani.co.il' } });
  const after = store.businessById(biz.id);
  assert.equal(after.ai_site, 'https://dani.co.il/');
  assert.equal(JSON.parse(after.site_check).localSchema, true);
  const site = await req('/admin/growth');
  assert.match(site.text, /סימון עסק מקומי/);

  const res = await req('/admin/growth/write', { form: { _csrf: csrf, kind: 'faq' } });
  assert.match(res.type, /json/);
  assert.deepEqual(JSON.parse(res.text), { text: 'טיוטה: faq' });
  assert.equal(written.at(-1).facts.services, 'תספורות גברים וילדים');
  assert.equal(store.growthDrafts(biz.id).faq.text, 'טיוטה: faq');
  assert.match(JSON.parse((await req('/admin/growth/write', { form: { _csrf: csrf, kind: 'poem' } })).text).error, /לא מוכר/);
});

test('the demo shows the plan with a sample website check and an AI text', async () => {
  const before = process.env.DEMO_OPEN;
  process.env.DEMO_OPEN = '1';
  const req = client();
  await req('/demo');
  if (before === undefined) delete process.env.DEMO_OPEN;
  else process.env.DEMO_OPEN = before;
  const page = await req('/admin/growth');
  assert.equal(page.status, 200);
  assert.match(page.text, /אין סימון עסק מקומי/);
  assert.match(page.text, /ביסטרו משפחתי/);
  const dash = await req('/admin');
  assert.match(dash.text, /todo-card/);
});

test('the pilot checklist: only for pilot businesses, marks what it sees, and sends the answers to the operator', async () => {
  const { req, csrf, biz } = await owner('pilot@example.com');
  assert.equal((await req('/admin/pilot')).location, '/admin');
  store.updateBusiness(biz.id, { pilot: 1 });
  const page = await req('/admin/pilot');
  assert.equal(page.status, 200);
  assert.match(page.text, /שבוע 1: הקמה/);
  assert.match(page.text, /<b class="pl-count">0<small>\/10/);
  assert.match((await req('/admin')).text, /pl-strip/);

  await req('/admin/growth/services', { form: { _csrf: csrf, services: 'תספורות' } });
  await req('/admin/pilot/mark', { form: { _csrf: csrf, on: '1' } });
  assert.match((await req('/admin/pilot')).text, /<b class="pl-count">2<small>\/10/);

  const sent = await req('/admin/pilot/feedback', { form: { _csrf: csrf, helped: 'התשובות לביקורות', confusing: '', pay: 'maybe', more: '' } });
  assert.equal(sent.location, '/admin/pilot?sent=1#feedback');
  const lead = store.db.prepare("SELECT * FROM leads WHERE kind = 'pilot' ORDER BY id DESC").get();
  assert.match(lead.message, /מה הכי עזר: התשובות לביקורות/);
  assert.match(lead.message, /משלמים ₪99 בחודש: אולי/);
  assert.match(lead.message, /צעדים שבוצעו: 2\/10/);
});

test('stage 2: goals against the area with last month for comparison, and the weekly routine streak', async () => {
  const { leadGoals, routine } = await import('../src/goals.js');
  const { weekKey } = await import('../src/tasks.js');
  const user = store.createUser({ email: 'lead@example.com', name: 'L', passwordHash: 'x' });
  const biz = store.businessById(store.createBusiness(user, { name: 'Lead', plan: 'pro', trialDays: 7 }));
  const loc = store.addSerpLocation(biz.id, { dataId: '0x9:0x9', placeId: 'ChIJlead', title: 'Lead' });
  store.db.prepare('UPDATE google_locations SET total_reviews = 100 WHERE id = ?').run(loc.id);
  const kwId = store.addRankKeyword(biz.id, loc.id, 'מספרה', 1000);
  const points = (top) => JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ rank: i < top ? 2 : 8 })));
  const sql = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  store.db.prepare('INSERT INTO rank_checks (keyword_id, run_at, points) VALUES (?, ?, ?)').run(kwId, sql(Date.now() - 40 * 864e5), points(3));
  store.db.prepare('INSERT INTO rank_checks (keyword_id, run_at, points) VALUES (?, ?, ?)').run(kwId, sql(Date.now() - 864e5), points(6));
  const rival = store.addCompetitor(biz.id, { dataId: '0x8:0x8', title: 'המתחרה' });
  store.db.prepare('UPDATE competitors SET total = 300, recent30 = 9 WHERE id = ?').run(rival.id);

  const goals = leadGoals(store, biz);
  const maps = goals.find((g) => g.key === 'maps');
  assert.deepEqual([maps.before, maps.now, maps.target], [30, 60, 70]);
  const reviews = goals.find((g) => g.key === 'reviews');
  assert.equal(reviews.target, 300);
  assert.equal(reviews.sub, 'המתחרה');

  // two weeks of post + photos in a row, this week not yet
  const now = Date.parse('2026-10-21T10:00:00Z');
  const w0 = weekKey(now);
  const w1 = weekKey(now - 7 * 864e5);
  const w2 = weekKey(now - 14 * 864e5);
  for (const w of [w1, w2]) {
    store.setGrowthMark(biz.id, 'posts', w, true);
    store.setGrowthMark(biz.id, 'photos', w, true);
  }
  assert.equal(routine(store, biz, { now }).streak, 2);
  store.setGrowthMark(biz.id, 'posts', w0, true);
  store.setGrowthMark(biz.id, 'photos', w0, true);
  assert.equal(routine(store, biz, { now }).streak, 3, 'this week counts once it is done');
});

test('stage 2 opens on the plan page once the score reaches 85', async () => {
  const { req, biz } = await owner('stage2@example.com');
  store.addSerpLocation(biz.id, { dataId: '0x7:0x7', placeId: 'ChIJs2', title: 'S2' });
  assert.match((await req('/admin/growth')).text, /gr-stage2 locked/);
  const { growthPlan, markPeriod } = await import('../src/growth.js');
  for (const t of Object.values(growthPlan(store, store.businessById(biz.id)).tracks)) for (const i of t.items) store.setGrowthMark(biz.id, i.key, markPeriod(i.key), true);
  const page = (await req('/admin/growth')).text;
  assert.match(page, /id="stage2"/);
  assert.match(page, /השגרה השבועית/);
  assert.match(page, /לגדול לעוד חיפושים/);
});
