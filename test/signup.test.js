import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

const client = (base) => {
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
  return req;
};

test('no free trial: a new account picks a plan and pays before it starts', async () => {
  const before = process.env.SIGNUP_TRIAL_DAYS;
  process.env.SIGNUP_TRIAL_DAYS = '0';
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { store } = created;
  try {
    const home = (await client(base)('/')).text;
    assert.doesNotMatch(home, /ימים חינם|ימי ניסיון|ניסיון חינם/);
    assert.match(home, /להתחיל עכשיו/);

    const op = client(base);
    await op('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });
    store.db.prepare('UPDATE users SET is_superadmin = 1 WHERE email = ?').run('op@example.com');
    const me = client(base);
    await me('/register', { method: 'POST', form: { name: 'דנה', email: 'new@example.com', password: 'password123', business: 'קפה חדש', terms: '1' } });
    const biz = () => store.businessesFor(store.userByEmail('new@example.com').id)[0];
    assert.equal(biz().billing, 'unpaid');
    assert.equal(biz().trial_ends_at, null);

    // Everything leads to the plan page until the first payment.
    assert.equal((await me('/admin')).location, '/admin/plan');
    assert.equal((await me('/admin/google')).location, '/admin/plan');
    assert.equal((await me('/admin/ai-visibility')).location, '/admin/plan');
    const plan = (await me('/admin/plan')).text;
    assert.match(plan, /בוחרים מסלול ומתחילים/);
    assert.match(plan, /href="\/demo"/);
    const token = plan.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.equal((await me('/admin/campaigns', { method: 'POST', form: { _csrf: token, name: 'x' } })).status, 402);

    // Choosing a plan (without online payment, the operator activates it).
    assert.equal((await me('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } })).location, '/admin/plan?requested=1');
    const opToken = (await op('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    await op(`/superadmin/businesses/${biz().id}/plan`, { method: 'POST', form: { _csrf: opToken, plan: 'basic', cycle: 'monthly', do: 'activate' } });
    assert.equal(biz().billing, 'active');
    assert.equal((await me('/admin')).status, 200);
  } finally {
    server.close();
    if (before === undefined) delete process.env.SIGNUP_TRIAL_DAYS;
    else process.env.SIGNUP_TRIAL_DAYS = before;
  }
});
