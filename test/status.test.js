import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSerp } from '../src/serp.js';
import { createMeter, withBusiness } from '../src/meter.js';
import { monthKey } from '../src/usage.js';

test('usage is counted per business, and the status page shows connections and costs', async () => {
  const db = openDb(':memory:');
  let meter;
  const serpFetch = async (url) => {
    const json = (b) => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(b) });
    if (url.startsWith('https://serpapi.com/account.json')) return json({ plan_name: 'Developer', searches_per_month: 5000, plan_searches_left: 4100, this_month_usage: 900 });
    return json({ local_results: [] });
  };
  const serp = createSerp({ apiKey: 'k', fetchImpl: serpFetch, onCall: () => meter.record('serp') });
  const created = createApp(db, { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: { chatgpt: async () => ({ text: 'ירושלים', sources: [{ link: 'https://he.wikipedia.org' }] }), gemini: async () => { throw new Error('API key not valid'); } }, cardcom: null, whatsapp: null, serp });
  meter = createMeter(created.store);
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = {};
  const req = async (path, form) => {
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
    return { status: res.status, text: await res.text() };
  };
  try {
    // The first account is the system admin.
    await req('/register', { name: 'מפעיל', email: 'st@example.com', password: 'password123', business: 'ג׳קו סטריט', terms: '1' });
    const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    const biz = created.store.businessesFor(created.store.userByEmail('st@example.com').id)[0];

    // A search from a business page counts against it; one outside any business counts as the system's.
    await req('/admin/competitors/find', { _csrf: token, q: 'בית קפה' });
    await withBusiness(biz.id, () => serp.search('עוד חיפוש'));
    await serp.search('בלי עסק');
    const rows = created.store.apiUsage(monthKey());
    assert.equal(rows.find((r) => r.business_id === biz.id && r.service === 'serp').calls, 2);
    assert.equal(rows.find((r) => r.business_id === 0).calls, 1);

    const page = (await req('/superadmin/status')).text;
    assert.match(page, /מצב המערכת/);
    assert.match(page, /❌<\/td><td><b>עוזר AI \(Anthropic\)/);
    assert.match(page, /✅<\/td><td><b>SerpApi/);
    assert.match(page, /Developer/);
    assert.match(page, />900</, 'used this month, from the account');
    assert.match(page, /ג׳קו סטריט<\/b>.*?<td>2<\/td>/s);
    assert.match(page, /מערכת \(בלי עסק\)/);
    assert.match((await req('/superadmin')).text, /href="\/superadmin\/status"/);

    // The engines test asks each one a short question and shows what came back.
    assert.equal((await req('/superadmin/engines-test', { _csrf: token })).status, 303);
    const tested = (await req('/superadmin/status')).text;
    assert.match(tested, /✅ <b>ChatGPT<\/b> <span class="muted">ענה: "ירושלים" · 1 מקורות/);
    assert.match(tested, /❌ <b>Gemini<\/b> <span class="danger-text">API key not valid/);
    assert.match(tested, /❌ <b>Perplexity<\/b> <span class="danger-text">המפתח לא מוגדר/);
  } finally {
    server.close();
  }
});
