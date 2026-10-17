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
    assert.match(plan, /עוד שני צעדים קצרים ומתחילים/);
    assert.match(plan, /מחברים את פרופיל העסק בגוגל/);
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

test('a free-access link: pilot customers sign up without a card and get the full plan for the set days', async () => {
  const before = process.env.SIGNUP_TRIAL_DAYS;
  process.env.SIGNUP_TRIAL_DAYS = '0';
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { store } = created;
  try {
    const op = client(base);
    await op('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });
    store.db.prepare('UPDATE users SET is_superadmin = 1 WHERE email = ?').run('op@example.com');
    const opToken = (await op('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    await op('/superadmin/passes', { method: 'POST', form: { _csrf: opToken, plan: 'pro', days: '30', uses: '1', note: 'מספרת דנה' } });
    const panel = (await op('/superadmin')).text;
    const link = panel.match(/value="(http[^"]+\/register\?pass=[^"]+)"/)[1];
    assert.match(panel, /מספרת דנה/);
    const path = link.slice(link.indexOf('/register'));

    const me = client(base);
    const page = (await me(path)).text;
    assert.match(page, /הוזמנתם ל-<b>30 ימים חינם<\/b> במסלול <b>גוגל \+ AI<\/b>/);
    const code = path.split('=')[1];
    await me('/register', { method: 'POST', form: { name: 'דנה', email: 'pilot@example.com', password: 'password123', business: 'מספרת דנה', terms: '1', pass: code } });
    const biz = store.businessesFor(store.userByEmail('pilot@example.com').id)[0];
    assert.deepEqual([biz.billing, biz.plan, biz.pilot], ['trial', 'pro', 1]);
    assert.ok(Date.parse(`${biz.trial_ends_at.replace(' ', 'T')}Z`) > Date.now() + 29 * 864e5);
    assert.equal((await me('/admin')).status, 200, 'straight in, no card');
    // Full quotas, not the trial's.
    const { planOf } = await import('../src/plans.js');
    const { limitsOf } = await import('../src/usage.js');
    assert.equal(planOf(store.businessById(biz.id)).rankKeywords, 4);
    assert.equal(limitsOf(store.businessById(biz.id)).ai_draft, 200);
    assert.match((await op('/superadmin')).text, /התנסות חינם · עוד 30 ימים/);

    // Used up: the next person signs up normally.
    const other = client(base);
    assert.match((await other(path)).text, /כבר נוצל או בוטל/);
    await other('/register', { method: 'POST', form: { name: 'אבי', email: 'late@example.com', password: 'password123', business: 'מאוחר', terms: '1', pass: code } });
    assert.equal(store.businessesFor(store.userByEmail('late@example.com').id)[0].billing, 'unpaid');
  } finally {
    server.close();
    if (before === undefined) delete process.env.SIGNUP_TRIAL_DAYS;
    else process.env.SIGNUP_TRIAL_DAYS = before;
  }
});

test('sign-up: the business name comes first, and an email or password there is refused', async () => {
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const me = client(`http://127.0.0.1:${server.address().port}`);
  try {
    const form = (await me('/register')).text;
    assert.ok(form.indexOf('name="business"') < form.indexOf('name="password"'), 'before the password');
    assert.match(form, /name="business"[^>]*autocomplete="organization"/);
    for (const business of ['password123', 'x@example.com']) {
      const r = await me('/register', { method: 'POST', form: { name: 'דנה', email: 'x@example.com', password: 'password123', business, terms: '1' } });
      assert.equal(r.status, 422);
      assert.match(r.text, /שם העסק/);
    }
    assert.equal(created.store.userByEmail('x@example.com'), undefined);
  } finally {
    server.close();
  }
});

test('the system admin can delete a user and the businesses they own', async () => {
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { store } = created;
  try {
    const op = client(base);
    await op('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });
    store.db.prepare('UPDATE users SET is_superadmin = 1 WHERE email = ?').run('op@example.com');
    const gone = client(base);
    await gone('/register', { method: 'POST', form: { name: 'אור', email: 'gone@example.com', password: 'password123', business: 'עסק למחיקה', terms: '1' } });
    const id = store.userByEmail('gone@example.com').id;
    const bizId = store.businessesFor(id)[0].id;
    const token = (await op('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.match((await op('/superadmin')).text, new RegExp(`/superadmin/users/${id}/delete`));
    // The email must be typed to confirm.
    await op(`/superadmin/users/${id}/delete`, { method: 'POST', form: { _csrf: token, confirm: 'wrong' } });
    assert.ok(store.userByEmail('gone@example.com'));
    await op(`/superadmin/users/${id}/delete`, { method: 'POST', form: { _csrf: token, confirm: 'gone@example.com' } });
    assert.equal(store.userByEmail('gone@example.com'), undefined);
    assert.ok(!store.businessById(bizId), 'their business too');
    assert.match((await gone('/admin')).location || '', /\/login/, 'signed out');
    // Never the admin themselves.
    const me = store.userByEmail('op@example.com').id;
    await op(`/superadmin/users/${me}/delete`, { method: 'POST', form: { _csrf: token, confirm: 'op@example.com' } });
    assert.ok(store.userByEmail('op@example.com'));
  } finally {
    server.close();
  }
});

test('a free week without a card, then paying on an iCount page; the operator activates', async () => {
  const saved = { trial: process.env.SIGNUP_TRIAL_DAYS, url: process.env.ICOUNT_URL_BASIC_MONTHLY };
  delete process.env.SIGNUP_TRIAL_DAYS;
  process.env.ICOUNT_URL_BASIC_MONTHLY = 'https://app.icount.co.il/m/test-basic';
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { store } = created;
  try {
    const op = client(base);
    await op('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });
    store.db.prepare('UPDATE users SET is_superadmin = 1 WHERE email = ?').run('op@example.com');
    const me = client(base);
    const form = (await me('/register')).text;
    assert.match(form, /7 ימים חינם, בלי כרטיס אשראי/);
    await me('/register', { method: 'POST', form: { name: 'דנה', email: 'icount@example.com', password: 'password123', business: 'קפה', terms: '1' } });
    const biz = () => store.businessesFor(store.userByEmail('icount@example.com').id)[0];
    assert.equal(biz().billing, 'trial', 'straight in, no card');
    assert.equal((await me('/admin')).status, 200);
    assert.match((await me('/terms')).text, /בלי כרטיס אשראי/);

    const confirm = (await me('/admin/plan/change?plan=basic&cycle=monthly')).text;
    assert.match(confirm, /לדף התשלום המאובטח של iCount, לתשלום של <b>₪99<\/b> לחודש/);
    const token = confirm.match(/name="_csrf" value="([^"]+)"/)[1];
    const go = await me('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } });
    assert.equal(go.location, 'https://app.icount.co.il/m/test-basic');
    assert.match(biz().plan_request, /"plan":"basic"/);
    // Back on the plan page: paid? it will be activated.
    assert.match((await me('/admin/plan')).text, /אם כבר שילמתם בדף של iCount/);
    // A plan without its own page and no general page: the request stays manual.
    const pro = await me('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'pro', cycle: 'monthly' } });
    assert.equal(pro.location, '/admin/plan?requested=1');
    // The operator activates.
    const opToken = (await op('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    await op(`/superadmin/businesses/${biz().id}/plan`, { method: 'POST', form: { _csrf: opToken, plan: 'basic', cycle: 'monthly', do: 'activate' } });
    assert.equal(biz().billing, 'active');
  } finally {
    server.close();
    for (const [k, v] of [['SIGNUP_TRIAL_DAYS', saved.trial], ['ICOUNT_URL_BASIC_MONTHLY', saved.url]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
