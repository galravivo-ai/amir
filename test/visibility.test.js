import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { cityOf } from '../src/routes/visibility.js';
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
let lastSuggest = null;
let planInput = null;

before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    backups: false,
    google: null,
    serp: createSerp({ apiKey: 'k', fetchImpl: serpFetch }),
    ai: {
      webAnswer: async () => ({ text: 'אני ממליץ על קפה לנדוור.', sources: [{ title: 'Landwer', link: 'https://landwer.co.il' }] }),
      visibilityPlan: async ({ facts, answers }) => {
        planInput = { facts, answers };
        return { names: new Map(answers.map((a) => [a.i, a.engine === 'Claude' ? ['קפה לנדוור', 'ארומה'] : ['קפה לנדוור']])), plan: '## איפה אתם עומדים\nממליצים על לנדוור.\n## מה לעשות\n- להופיע ב-Rest' };
      },
      suggestQueries: async (input) => {
        lastSuggest = input;
        return ['איפה יש בראנץ׳ טוב בתל אביב?', 'בית קפה שקט לעבודה בדיזנגוף'];
      },
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

  // Suggestions are local: they get the business's place and as many questions as the plan allows.
  const biz0 = created.store.businessesFor(created.store.userByEmail('vis@example.com').id)[0];
  created.store.db.prepare("INSERT INTO google_locations (business_id, name, title, address, enabled, source) VALUES (?, 'serp:x', 'ג׳קו סטריט', 'דיזנגוף 120, תל אביב-יפו, ישראל', 1, 'serp')").run(biz0.id);
  assert.match((await req('/admin/ai-visibility')).text, /name="city" value="תל אביב-יפו"/, 'the city comes from the Google address');
  const suggested = await req('/admin/ai-visibility/suggest', { method: 'POST', form: { _csrf: token, about: 'בית קפה', city: '' } });
  assert.match(suggested.text, /value="איפה יש בראנץ׳ טוב בתל אביב\?"/);
  assert.equal(lastSuggest.city, 'תל אביב-יפו');
  assert.equal(lastSuggest.address, 'דיזנגוף 120, תל אביב-יפו, ישראל');
  assert.equal(lastSuggest.about, 'בית קפה');
  assert.ok(lastSuggest.count >= 5);
  created.store.db.prepare("DELETE FROM google_locations WHERE name = 'serp:x'").run();

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

  // The button runs the check in the background; the page shows live progress and reloads when it ends.
  const started = await fetch(`${base}/admin/ai-visibility/run`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: token }).toString(),
  });
  assert.equal(started.status, 303);
  const prog = async () => (await fetch(`${base}/admin/ai-visibility/progress`, { headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') } })).json();
  for (let i = 0; i < 50 && (await prog()).running; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(await prog(), { running: false });
  assert.match((await req('/admin/ai-visibility?done=1')).text, /הבדיקה הסתיימה/);
  created.store.db.prepare('DELETE FROM ai_checks WHERE business_id = ?').run(biz.id);

  // Run synchronously for the test, with the progress it reports.
  const steps = [];
  const r = await created.visibility.runBusiness(fresh, (done, total) => steps.push(`${done}/${total}`));
  assert.deepEqual([steps[0], steps.at(-1)], ['0/6', '6/6']);
  assert.equal(r.mentioned, 2, 'Google AI Mode mentions the business for both questions');
  const { latest, runs } = created.store.aiVisibility(biz.id);
  assert.equal(latest.length, 6, '2 questions × 3 engines');
  const mode = latest.find((x) => x.engine === 'google_ai_mode');
  assert.equal(mode.cited, 1, 'the business site is a source');
  assert.equal(latest.find((x) => x.engine === 'claude').mentioned, 0);
  assert.equal(latest.filter((x) => x.error === 'no_answer').length, 1, 'no AI Overview for one search');
  assert.equal(runs[0].answered, 5);

  const view = (await req('/admin/ai-visibility')).text;
  assert.match(view, /ציון הנראות ב-AI/);
  assert.match(view, /הוזכרתם ב-2 מתוך 5 תשובות/);
  assert.match(view, /40%/, '2 of 5 answers mention the business');
  assert.match(view, /כדאי לנסות את ג׳קו סטריט/);
  assert.match(view, /אין תשובת AI/);

  // One AI request after the check: who the answers recommend instead, and a plan.
  assert.match(planInput.facts, /הוזכר ב-2 מתוך/);
  assert.ok(planInput.answers.every((a) => a.text && a.query));
  assert.match(view, /איך להופיע ב-AI/);
  assert.match(view, /להופיע ב-Rest/);
  assert.match(view, /על מי ממליצים במקומכם/);
  assert.match(view, /קפה לנדוור<\/span>/);

  // Due once a week.
  assert.equal(created.store.aiVisibilityDue(7).some((b) => b.id === biz.id), false);
  created.store.db.prepare("UPDATE businesses SET ai_checked_at = datetime('now', '-8 days') WHERE id = ?").run(biz.id);
  assert.equal(created.store.aiVisibilityDue(7).some((b) => b.id === biz.id), true);
});

test('ChatGPT, Gemini and Perplexity read their answers and sources', async () => {
  const { createAnswerEngines } = await import('../src/answerEngines.js');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const json = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
    if (url.includes('openai.com')) {
      return json({ output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'נסו את ג׳קו סטריט.', annotations: [{ type: 'url_citation', url: 'https://jackos.co.il/', title: 'Jacko' }] }] }] });
    }
    if (url.includes('googleapis.com') && url.includes('gemini-old')) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: { message: 'This model models/gemini-old is no longer available to new users. Please update your code to use models/gemini-9-flash for the latest features.' } }) };
    }
    if (url.includes('googleapis.com')) {
      return json({ candidates: [{ content: { parts: [{ text: 'קפה לנדוור' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/x', title: 'landwer.co.il' } }] } }] });
    }
    if (url.includes('perplexity.ai')) {
      return json({
        output: [
          { type: 'search_results', results: [{ url: 'https://www.timeout.co.il/a', title: 'Time Out' }] },
          { type: 'message', content: [{ type: 'output_text', text: 'ג׳קו סטריט', annotations: [{ type: 'url_citation', url: 'https://www.timeout.co.il/a', title: 'Time Out' }] }] },
        ],
      });
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };
  assert.deepEqual(Object.keys(createAnswerEngines({ env: {}, fetchImpl })), []);
  const e = createAnswerEngines({ env: { OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g', PERPLEXITY_API_KEY: 'p' }, fetchImpl });
  assert.deepEqual(await e.chatgpt('q', { city: 'תל אביב' }), { text: 'נסו את ג׳קו סטריט.', sources: [{ title: 'Jacko', link: 'https://jackos.co.il/' }] });
  assert.equal(calls[0].body.tools[0].type, 'web_search');
  assert.equal(calls[0].body.tools[0].user_location.city, 'תל אביב');
  assert.equal(calls[0].headers.authorization, 'Bearer o');
  assert.deepEqual((await e.gemini('q')).sources, [{ title: 'landwer.co.il', link: 'https://landwer.co.il' }], 'the redirect is replaced by the site');
  assert.equal(calls[1].headers['x-goog-api-key'], 'g');
  assert.deepEqual(await e.perplexity('q', { city: 'חיפה' }), { text: 'ג׳קו סטריט', sources: [{ title: 'Time Out', link: 'https://www.timeout.co.il/a' }] });
  const pplx = calls.at(-1);
  assert.equal(pplx.url, 'https://api.perplexity.ai/v1/responses', 'the Agent API, not the retired Sonar chat completions');
  assert.equal(pplx.body.preset, 'fast');
  assert.deepEqual(pplx.body.tools, [{ type: 'web_search' }]);
  assert.match(pplx.body.instructions, /חיפה/);

  // A retired Gemini model: switch to the one Google names, and keep using it.
  const old = createAnswerEngines({ env: { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-old' }, fetchImpl });
  assert.equal((await old.gemini('q')).text, 'קפה לנדוור');
  assert.match(calls.at(-1).url, /models\/gemini-9-flash:generateContent/);
  await old.gemini('q');
  assert.match(calls.at(-1).url, /gemini-9-flash/);
});

test('wider AI visibility: in "pro" and up, a gift on "basic", more engines and questions', async () => {
  const asked = [];
  const app = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    backups: false,
    google: null,
    serp: null,
    ai: null,
    answerEngines: { chatgpt: async (q) => (asked.push(q), { text: 'ממליץ על פלאס קפה', sources: [] }) },
  });
  const srv = app.app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const jar = {};
  const req = async (path, { method = 'GET', form } = {}) => {
    const res = await fetch(url + path, {
      method,
      redirect: 'manual',
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? (form instanceof URLSearchParams ? form : new URLSearchParams(form)).toString() : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      jar[pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
    }
    return { status: res.status, text: await res.text() };
  };
  try {
    await req('/register', { method: 'POST', form: { name: 'דנה', email: 'plus@example.com', password: 'password123', business: 'פלאס קפה', terms: '1' } });
    const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    const biz = app.store.businessesFor(app.store.userByEmail('plus@example.com').id)[0];
    const fresh = () => app.store.businessById(biz.id);

    // The trial is on "pro", which includes it.
    assert.deepEqual(app.visibility.engines(fresh()), ['chatgpt']);
    assert.match((await req('/admin/ai-visibility')).text, /עד 10\)/);

    app.store.updateBusiness(biz.id, { plan: 'basic', billing: 'active' });
    let page = (await req('/admin/ai-visibility')).text;
    assert.match(page, /לשדרוג המסלול/, 'basic is offered the upgrade');
    assert.match(page, /עד 5\)/);
    assert.doesNotMatch(page, /בדיקה עכשיו/, 'no engine is on for basic here');
    assert.deepEqual(app.visibility.engines(fresh()), []);

    const pricing = (await req('/admin/plan')).text;
    assert.match(pricing, /נראות ב-AI בגוגל וב-Claude/);
    assert.match(pricing, /נראות ב-AI גם ב-ChatGPT, Gemini ו-Perplexity/);

    // A system admin can give it to one basic business.
    app.store.db.prepare('UPDATE users SET is_superadmin = 1 WHERE email = ?').run('plus@example.com');
    assert.match((await req('/superadmin')).text, /נראות ב-AI מורחבת במתנה/);
    assert.equal((await req(`/superadmin/businesses/${biz.id}/ai-plus`, { method: 'POST', form: { _csrf: token, on: '1' } })).status, 303);
    assert.equal(fresh().ai_plus, 1);

    const form = new URLSearchParams({ _csrf: token });
    for (let i = 1; i <= 12; i++) form.append('queries', `שאלה מספר ${i}`);
    await req('/admin/ai-visibility/settings', { method: 'POST', form });
    assert.equal(JSON.parse(fresh().ai_queries).length, 10, 'up to 10 questions');

    page = (await req('/admin/ai-visibility')).text;
    assert.match(page, /בדיקה עכשיו/);
    assert.doesNotMatch(page, /לשדרוג המסלול/);
    const r = await app.visibility.runBusiness(fresh());
    assert.equal(r.mentioned, 10);
    assert.equal(asked.length, 10);
  } finally {
    srv.close();
  }
});

test('the city of a Google address', () => {
  assert.equal(cityOf('דיזנגוף 120, תל אביב-יפו, ישראל'), 'תל אביב-יפו');
  assert.equal(cityOf('HaYarkon St 5, Haifa, Israel'), 'Haifa');
  assert.equal(cityOf('הרצל 1, ראשון לציון 7525101'), 'ראשון לציון');
  assert.equal(cityOf('תל אביב'), '');
});
