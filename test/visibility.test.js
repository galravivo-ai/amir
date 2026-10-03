import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSerp } from '../src/serp.js';
import { flattenSerpAnswer, matchAnswer, namesOf, normalize } from '../src/visibility.js';

test('matching a business in an AI answer', () => {
  assert.equal(normalize('ג׳קו  סטריט!'), 'גקו סטריט');
  assert.equal(normalize("ג'קו סטריט"), 'גקו סטריט');
  const names = namesOf({ businessName: 'ג׳קו סטריט', aliases: "Jacko's, ג'קוס", places: ['ג׳קו סטריט · דיזנגוף'] });
  assert.ok(names.includes('גקו סטריט') && names.includes('jackos'));

  const a = { text: 'הנה כמה המלצות: קפה לנדוור הוא קלאסי. גם ג\'קו סטריט בדיזנגוף מעולה לבוקר.', sources: [{ title: 'Jacko\'s Street - Google Maps', link: 'https://www.google.com/maps/place/x' }] };
  const m = matchAnswer(a, { names, site: 'jackos.co.il' });
  assert.equal(m.mentioned, true);
  assert.equal(m.cited, true, 'a Google Maps source titled with the name counts as the profile');
  assert.match(m.snippet, /דיזנגוף מעולה/);

  const bySite = matchAnswer({ text: 'אין', sources: [{ title: 'x', link: 'https://www.jackos.co.il/menu' }] }, { names, site: 'https://jackos.co.il' });
  assert.deepEqual([bySite.mentioned, bySite.cited], [false, true]);
  // A name inside another word does not count.
  assert.equal(matchAnswer({ text: 'בגקו סטריטים' }, { names }).mentioned, false);

  // SerpApi blocks: the answer's text counts, the references only as sources.
  const flat = flattenSerpAnswer({
    text_blocks: [{ type: 'paragraph', snippet: 'מומלצים:' }, { type: 'list', list: [{ title: 'ג׳קו סטריט', snippet: 'ארוחות בוקר', reference_indexes: [0] }] }],
    references: [{ title: 'קפה לנדוור', link: 'https://landwer.co.il', index: 0 }],
  });
  assert.match(flat.text, /ג׳קו סטריט/);
  assert.doesNotMatch(flat.text, /לנדוור/);
  assert.deepEqual(flat.sources, [{ title: 'קפה לנדוור', link: 'https://landwer.co.il' }]);
});

const serpFetch = async (url) => {
  const u = new URL(url);
  const json = (b) => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(b) });
  if (u.searchParams.get('engine') === 'google_ai_mode') {
    return json({ text_blocks: [{ type: 'paragraph', snippet: 'כדאי לנסות את ג׳קו סטריט בדיזנגוף.' }], references: [{ title: 'ג׳קו סטריט', link: 'https://jackos.co.il' }] });
  }
  if (u.searchParams.get('engine') === 'google') {
    if (/ערב/.test(u.searchParams.get('q'))) return json({ organic_results: [] });
    return json({ ai_overview: { page_token: 'T1' } });
  }
  if (u.searchParams.get('engine') === 'google_ai_overview') {
    assert.equal(u.searchParams.get('page_token'), 'T1');
    return json({ ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'מקומות מומלצים: קפה לנדוור.' }], references: [] } });
  }
  return json({ error: 'unexpected' });
};

let server;
let base;
let created;
before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    backups: false,
    google: null,
    serp: createSerp({ apiKey: 'k', fetchImpl: serpFetch }),
    ai: {
      webAnswer: async () => ({ text: 'אני ממליץ על קפה לנדוור.', sources: [{ title: 'Landwer', link: 'https://landwer.co.il' }] }),
      suggestQueries: async () => ['איפה יש בראנץ׳ טוב בתל אביב?', 'בית קפה שקט לעבודה בדיזנגוף'],
    },
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('set the questions, run a check, see the results', async () => {
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
  await req('/register', { method: 'POST', form: { name: 'גל', email: 'vis@example.com', password: 'password123', business: 'ג׳קו סטריט', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const page = await req('/admin/ai-visibility');
  assert.match(page.text, /נראות ב-AI/);
  assert.match(page.text, /href="\/admin\/ai-visibility"/);

  const suggested = await req('/admin/ai-visibility/suggest', { method: 'POST', form: { _csrf: token, about: 'בית קפה' } });
  assert.match(suggested.text, /value="איפה יש בראנץ׳ טוב בתל אביב\?"/);

  const queries = new URLSearchParams({ _csrf: token, aliases: "Jacko's", site: 'jackos.co.il', city: 'תל אביב' });
  queries.append('queries', 'איפה יש ארוחת בוקר טובה בדיזנגוף?');
  queries.append('queries', 'איפה לאכול ארוחת ערב?');
  queries.append('queries', '');
  const saved = await fetch(`${base}/admin/ai-visibility/settings`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), 'content-type': 'application/x-www-form-urlencoded' },
    body: queries.toString(),
  });
  assert.equal(saved.status, 303);
  const biz = created.store.businessesFor(created.store.userByEmail('vis@example.com').id)[0];
  const fresh = created.store.businessById(biz.id);
  assert.deepEqual(JSON.parse(fresh.ai_queries), ['איפה יש ארוחת בוקר טובה בדיזנגוף?', 'איפה לאכול ארוחת ערב?']);
  assert.equal(fresh.ai_site, 'https://jackos.co.il/');

  // Run synchronously for the test (the button runs it in the background).
  const r = await created.visibility.runBusiness(fresh);
  assert.equal(r.mentioned, 2, 'Google AI Mode mentions the business for both questions');
  const { latest, runs } = created.store.aiVisibility(biz.id);
  assert.equal(latest.length, 6, '2 questions × 3 engines');
  const mode = latest.find((x) => x.engine === 'google_ai_mode');
  assert.equal(mode.cited, 1, 'the business site is a source');
  assert.equal(latest.find((x) => x.engine === 'claude').mentioned, 0);
  assert.equal(latest.filter((x) => x.error === 'no_answer').length, 1, 'no AI Overview for one search');
  assert.equal(runs[0].answered, 5);

  const view = (await req('/admin/ai-visibility')).text;
  assert.match(view, /הוזכרתם בתשובות/);
  assert.match(view, /40%/, '2 of 5 answers mention the business');
  assert.match(view, /כדאי לנסות את ג׳קו סטריט/);
  assert.match(view, /אין תשובת AI/);

  // Due once a week.
  assert.equal(created.store.aiVisibilityDue(7).some((b) => b.id === biz.id), false);
  created.store.db.prepare("UPDATE businesses SET ai_checked_at = datetime('now', '-8 days') WHERE id = ?").run(biz.id);
  assert.equal(created.store.aiVisibilityDue(7).some((b) => b.id === biz.id), true);
});
