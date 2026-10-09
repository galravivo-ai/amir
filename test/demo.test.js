import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

test('demo: anyone can look around a full sample business, and change nothing', async () => {
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = {};
  const req = async (path, { method = 'GET', form } = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      jar[pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
  try {
    assert.match((await req('/')).text, /href="\/demo"/);
    const go = await req('/demo');
    assert.equal(go.location, '/admin');
    const dash = (await req('/admin')).text;
    assert.match(dash, /חשבון דמו/);
    assert.match(dash, /ביסטרו הגפן/);
    assert.match(dash, /צפיות בפרופיל<\/span><span class="st-value">[\d,]+</, 'the Google profile numbers are there');
    assert.match((await req('/admin/ai-visibility')).text, /איך להופיע ב-AI/);
    assert.match((await req('/admin/ai-visibility')).text, /על מי ממליצים במקומכם/);
    assert.match((await req('/admin/rankings')).text, /ביסטרו/);
    assert.match((await req('/admin/competitors')).text, /פסטה דה לוקה/);
    assert.match((await req('/admin/profile')).text, /מתוך 100/);

    // Read-only: no form goes through.
    const token = dash.match(/name="_csrf" value="([^"]+)"/)?.[1] || '';
    const blocked = await req('/account/profile', { method: 'POST', form: { _csrf: token, name: 'האקר' } });
    assert.equal(blocked.status, 403);

    // It isn't counted as a user, isn't listed for the operator, and the jobs leave it alone.
    const { store } = created;
    assert.equal(store.countUsers(), 0);
    assert.equal(store.allBusinesses().length, 0);
    assert.equal(store.aiVisibilityDue(0).length, 0);
    assert.equal(store.auditsDue(0).length, 0);
    assert.equal(store.rankKeywordsDue(0).length, 0);
    assert.equal(store.competitorsDue(0).length, 0);

    // A second visit reuses it.
    const id = store.db.prepare('SELECT id FROM businesses WHERE is_demo = 1').get().id;
    await req('/demo');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM businesses WHERE is_demo = 1').get().n, 1);
    assert.equal(store.db.prepare('SELECT id FROM businesses WHERE is_demo = 1').get().id, id);
  } finally {
    server.close();
  }
});
