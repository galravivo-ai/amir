import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSerp, profileOf } from '../src/serp.js';
import { healthChecks } from '../src/health.js';

test('the health score counts what is known, and says what to fix', () => {
  const full = healthChecks(
    { rating: 4.7, reviews: 320, phone: '03-1234567', website: 'https://x.co.il', hours: true, description: 'א'.repeat(300), types: ['בית קפה', 'מסעדה'], photos: 40, attributes: true },
    { recent30: 9, replyRate: 0.95, postsRecent: 2 },
  );
  assert.equal(full.score, 100);
  const weak = healthChecks({ rating: 3.9, reviews: 12, phone: '', website: '', hours: false, description: '', types: ['בית קפה'], photos: null, attributes: false }, { recent30: 0, replyRate: 0.2, postsRecent: null });
  assert.ok(weak.score < 20, `low score ${weak.score}`);
  assert.equal(weak.items.find((i) => i.key === 'photos').state, 'unknown', 'unknown is not counted');
  assert.equal(weak.items.find((i) => i.key === 'categories').state, 'partial');
  assert.ok(!weak.items.some((i) => i.key === 'posts'), 'posts only when we can know');
  assert.match(weak.items.find((i) => i.key === 'website').fix, /אתר/);
  const p = profileOf({ title: 'x', rating: '4.4', reviews: '1,234', type: 'בית קפה', operating_hours: { sunday: '8-22' }, description: { snippet: 'תיאור' } });
  assert.deepEqual([p.reviews, p.types, p.hours, p.description], [1234, ['בית קפה'], true, 'תיאור']);
});

const serpFetch = async (url) => {
  const u = new URL(url);
  const json = (b) => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(b) });
  if (u.searchParams.get('engine') === 'google_maps' && u.searchParams.get('place_id') === 'ChIJplace12345') {
    return json({ place_results: { title: 'ג׳קו סטריט', rating: 4.4, reviews: 326, type: 'בית קפה', types: ['בית קפה'], address: 'דיזנגוף 1', phone: '', website: 'https://jackos.co.il', operating_hours: { sunday: '8-23' } } });
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

let tipsAsked = '';
before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, answerEngines: {}, cardcom: null, whatsapp: null,
    serp: createSerp({ apiKey: 'k', fetchImpl: serpFetch }),
    ai: { profileTips: async (facts) => ((tipsAsked = facts), '## מה לעשות קודם\n- הוסיפו טלפון\n## הצעה לתיאור העסק\nבית קפה שכונתי בלב דיזנגוף.\n## קטגוריות משניות מומלצות\nמסעדת ארוחת בוקר') },
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('the profile page: check, score, fixes and AI advice', async () => {
  await req('/register', { method: 'POST', form: { name: 'גל', email: 'hl@example.com', password: 'password123', business: 'ג׳קו סטריט', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = created.store.businessesFor(created.store.userByEmail('hl@example.com').id)[0];
  assert.match((await req('/admin/profile')).text, /הוסיפו קודם את העסק/);

  const loc = created.store.addSerpLocation(biz.id, { dataId: '0x1:0x1', placeId: 'ChIJplace12345', title: 'ג׳קו סטריט' });
  const at = new Date(Date.now() - 3 * 864e5).toISOString();
  created.store.upsertGoogleReview(loc.id, { name: 'a', reviewer: 'x', photo: '', rating: 5, comment: '', createTime: at, updateTime: at, reply: 'תודה', replyTime: at });
  created.store.upsertGoogleReview(loc.id, { name: 'b', reviewer: 'x', photo: '', rating: 4, comment: '', createTime: at, updateTime: at, reply: '', replyTime: '' });

  assert.equal((await req('/admin/profile/run', { method: 'POST', form: { _csrf: token } })).location, '/admin/profile?started=1');
  await created.health.checkBusiness(created.store.businessById(biz.id));
  const [audit] = created.store.latestAudits(biz.id);
  assert.ok(audit.score > 0 && audit.score < 100, `score ${audit.score}`);
  assert.match(tipsAsked, /מה חסר או חלקי: .*מספר טלפון/);

  const page = (await req('/admin/profile')).text;
  assert.match(page, /href="\/admin\/profile"/, 'in the menu');
  assert.match(page, new RegExp(`<b>${audit.score}</b>`));
  assert.match(page, /הוסיפו טלפון לפרופיל/);
  assert.match(page, /50% נענו/);
  assert.match(page, /<textarea id="desc-\d+" rows="5" readonly>בית קפה שכונתי בלב דיזנגוף\.<\/textarea>/);

  // Weekly: not due again right away.
  assert.equal(await created.jobs.profileHealth(), 0);
});

test('this week\'s tasks: picked from the data, gone when done', async () => {
  const { weekKey } = await import('../src/tasks.js');
  assert.equal(weekKey(Date.parse('2026-10-03T10:00:00Z')), '2026-09-27', 'Saturday belongs to the week that began on Sunday');
  assert.equal(weekKey(Date.parse('2026-10-03T22:30:00Z')), '2026-10-04', 'Sunday 00:30 in Israel starts a new week');

  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  let page = (await req('/admin')).text;
  assert.match(page, /המשימות השבוע/);
  assert.match(page, /ליצור קמפיין ושלט QR/);
  assert.match(page, /לענות לביקורת שמחכה בגוגל/);
  assert.match(page, /לשפר בפרופיל: מספר טלפון/);
  assert.equal((page.match(/<li>\s*<div class="task-body">/g) || []).length, 3, 'three at most');

  assert.equal((await req('/admin/tasks/campaign/done', { method: 'POST', form: { _csrf: token } })).location, '/admin#tasks');
  page = (await req('/admin')).text;
  assert.doesNotMatch(page, /ליצור קמפיין ושלט QR/);
  assert.match(page, /להוסיף 2-3 מתחרים|לבקש דירוג/, 'the next one moves up');
});
