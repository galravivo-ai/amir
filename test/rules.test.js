import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;
let created;
let store;
let admin;

before(async () => {
  process.env.ICOUNT_URL_PRO_MONTHLY = 'https://example.com/pro';
  created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, ai: null, cardcom: null });
  store = created.store;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  // the first user is the system admin, whose own accounts are always open
  admin = await owner('admin@example.com');
});

after(() => {
  delete process.env.ICOUNT_URL_PRO_MONTHLY;
  server.close();
});

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
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
}

async function owner(email) {
  const req = client();
  await req('/register', { form: { name: 'Owner', email, password: 'password123', business: 'עסק', terms: '1' } });
  const csrf = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = store.db.prepare('SELECT b.* FROM businesses b JOIN users u ON u.id = b.user_id WHERE u.email = ?').get(email);
  return { req, csrf, biz };
}

const sql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

test('a plan paid on iCount and cancelled stays open until the paid period ends, then closes', async () => {
  const { req, csrf, biz } = await owner('cancel@example.com');
  store.updateBusiness(biz.id, { billing: 'active', plan: 'pro', billing_cycle: 'monthly' });
  // the plan was opened by a payment ten days ago
  store.db.prepare("INSERT INTO icount_payments (digest, payload, email, amount, result, business_id, created_at) VALUES ('d1', '{}', 'cancel@example.com', 169, 'activated: x', ?, ?)").run(biz.id, sql(Date.now() - 10 * 864e5));
  await req('/admin/plan/cancel', { form: { _csrf: csrf, reason: '' } });
  const after = store.businessById(biz.id);
  assert.equal(after.billing, 'active');
  assert.ok(after.canceled_at);
  const until = Date.parse(`${after.paid_until.replace(' ', 'T')}Z`);
  assert.ok(Math.abs(until - (Date.now() + 20 * 864e5)) < 2 * 864e5, 'a month after the payment that opened the plan');
  assert.match((await req('/admin/plan')).text, /פעיל עד/);
  const mail = store.db.prepare("SELECT body FROM outbox WHERE kind = 'subscription_cancelled' ORDER BY id DESC").get();
  assert.match(mail?.body ?? '', /לבטל ידנית את הוראת הקבע ב-iCount/);

  // nothing happens before the end; after it, the account closes
  assert.equal(await created.jobs.cancelledEnds(), 0);
  store.updateBusiness(biz.id, { paid_until: sql(Date.now() - 1000) });
  assert.equal(await created.jobs.cancelledEnds(), 1);
  assert.equal(store.businessById(biz.id).billing, 'paused');
});

test('changing one\'s mind before the end undoes an iCount cancellation', async () => {
  const { req, csrf, biz } = await owner('regret@example.com');
  store.updateBusiness(biz.id, { billing: 'active', plan: 'basic' });
  await req('/admin/plan/cancel', { form: { _csrf: csrf } });
  assert.ok(store.businessById(biz.id).canceled_at);
  await req('/admin/billing/auto-renew', { form: { _csrf: csrf, on: '1' } });
  const b = store.businessById(biz.id);
  assert.equal(b.canceled_at, null);
  store.updateBusiness(biz.id, { paid_until: sql(Date.now() - 1000) });
  assert.equal(await created.jobs.cancelledEnds(), 0);
});

test('the admin is reminded to stop the standing order in iCount, and marks it', async () => {
  const { req, csrf, biz } = await owner('stop@example.com');
  store.updateBusiness(biz.id, { billing: 'active', plan: 'pro' });
  await req('/admin/plan/cancel', { form: { _csrf: csrf } });
  const stops = (await admin.req('/superadmin')).text.split('id="icount-stops"')[1]?.split('</section>')[0] ?? '';
  assert.match(stops, /stop@example\.com/);

  // three days before the end, one reminder
  store.updateBusiness(biz.id, { paid_until: sql(Date.now() + 2 * 864e5) });
  await created.jobs.cancelledEnds();
  await created.jobs.cancelledEnds();
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'icount_stop_reminder' AND business_id = ?").get(biz.id).n, 1);

  // marked: off the list, and undoing the cancellation now needs a new payment
  await admin.req(`/superadmin/businesses/${biz.id}/icount-stopped`, { form: { _csrf: admin.csrf } });
  assert.ok(store.businessById(biz.id).icount_stopped_at);
  assert.doesNotMatch((await admin.req('/superadmin')).text.split('id="icount-stops"')[1]?.split('</section>')[0] ?? '', /stop@example\.com/);
  const plan = (await req('/admin/plan')).text;
  assert.match(plan, /בוחרים מסלול ומשלמים מחדש/);
  await req('/admin/billing/auto-renew', { form: { _csrf: csrf, on: '1' } });
  assert.ok(store.businessById(biz.id).canceled_at, 'still cancelled');
});

test('"paid until" set by the admin is where a cancellation ends (a year paid at once)', async () => {
  const { req, csrf, biz } = await owner('annual@example.com');
  const until = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
  await admin.req(`/superadmin/businesses/${biz.id}/plan`, { form: { _csrf: admin.csrf, plan: 'pro', cycle: 'annual', until, do: 'activate' } });
  assert.equal(store.businessById(biz.id).billing, 'active');
  assert.match((await admin.req('/superadmin')).text, new RegExp(`שולם עד ${until.split('-').reverse().join('\\.')}`));
  await req('/admin/plan/cancel', { form: { _csrf: csrf } });
  assert.equal(store.businessById(biz.id).paid_until.slice(0, 10), until);
});

test('one trial per owner: a second business starts by choosing a plan', async () => {
  const { req, csrf } = await owner('two@example.com');
  await req('/admin/businesses', { form: { _csrf: csrf, name: 'העסק השני' } });
  const second = store.db.prepare("SELECT * FROM businesses WHERE name = 'העסק השני'").get();
  assert.equal(second.billing, 'unpaid');
  assert.equal((await req('/admin')).location, '/admin/plan');
});

test('the weekly AI check skips paused accounts', () => {
  const user = store.createUser({ email: 'ai@example.com', name: 'A', passwordHash: 'x' });
  const on = store.createBusiness(user, { name: 'On', plan: 'pro' });
  const off = store.createBusiness(user, { name: 'Off', plan: 'pro' });
  for (const id of [on, off]) store.updateBusiness(id, { ai_queries: JSON.stringify(['מספרה בחולון']) });
  store.updateBusiness(off, { billing: 'paused' });
  const due = store.aiVisibilityDue(7).map((b) => b.id);
  assert.ok(due.includes(on));
  assert.ok(!due.includes(off));
});

test('in a pilot, only a manager marks steps and sends the answers', async () => {
  const { req, csrf, biz } = await owner('pilot-owner@example.com');
  store.updateBusiness(biz.id, { pilot: 1 });
  const viewer = client();
  await viewer('/register', { form: { name: 'V', email: 'pilot-viewer@example.com', password: 'password123', business: 'אחר', terms: '1' } });
  const v = store.userByEmail('pilot-viewer@example.com');
  store.db.prepare("INSERT INTO memberships (business_id, user_id, role) VALUES (?, ?, 'viewer')").run(biz.id, v.id);
  const vcsrf = (await viewer('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  await viewer('/admin/switch?b=' + biz.id);
  const page = (await viewer('/admin/pilot')).text;
  assert.match(page, /את התשובות שולח מנהל העסק/);
  assert.doesNotMatch(page, /action="\/admin\/pilot\/(mark|feedback)"/);
  assert.equal((await viewer('/admin/pilot/feedback', { form: { _csrf: vcsrf, helped: 'x', pay: 'yes' } })).status, 403);
  assert.equal((await req('/admin/pilot/mark', { form: { _csrf: csrf, on: '1' } })).status, 303);
});

test('the weekly tasks\' old "done" action is gone', async () => {
  const { req, csrf } = await owner('tasks@example.com');
  assert.equal((await req('/admin/tasks/campaign/done', { form: { _csrf: csrf } })).status, 404);
});

test('the customers asked for a review, from every campaign, with a download', async () => {
  const { req, biz } = await owner('requests@example.com');
  const c = store.db.prepare('SELECT id FROM campaigns WHERE business_id = ?').get(biz.id)
    ?? { id: Number(store.db.prepare("INSERT INTO campaigns (business_id, name, slug) VALUES (?, 'ראשי', 'req-main')").run(biz.id).lastInsertRowid) };
  store.db.prepare("INSERT INTO invites (campaign_id, token, customer_name, phone, opened_at, responded_at) VALUES (?, 't1', 'רונית', '0501234567', datetime('now'), datetime('now')), (?, 't2', 'משה', '0527654321', NULL, NULL)").run(c.id, c.id);
  const page = (await req('/admin/requests')).text;
  assert.match(page, /רונית/);
  assert.match(page, /משה/);
  assert.match(page, /דירג/);
  assert.doesNotMatch((await req('/admin/requests?status=rated')).text, /משה/);
  assert.match((await req('/admin/requests?q=0527')).text, /משה/);
  const csv = await req('/admin/requests?csv=1');
  assert.match(csv.text, /רונית,0501234567/);
});

test('every password field can be shown, also when logging in and changing it', async () => {
  const req = client();
  assert.match((await req('/login')).text, /class="pw-toggle"/);
  const { req: me } = await owner('pw@example.com');
  assert.equal(((await me('/account')).text.match(/class="pw-toggle"/g) || []).length, 2, 'current and new password');
});

test('a link to a page of the system comes back to that page after logging in', async () => {
  const { req } = await owner('back@example.com');
  await req('/logout', { form: {} }).catch(() => {});
  const anon = client();
  const first = await anon('/admin/google/reviews');
  assert.equal(first.location, '/login?next=%2Fadmin%2Fgoogle%2Freviews');
  const page = (await anon(first.location)).text;
  assert.match(page, /action="\/login\?next=%2Fadmin%2Fgoogle%2Freviews"/);
  const done = await anon('/login?next=%2Fadmin%2Fgoogle%2Freviews', { form: { email: 'back@example.com', password: 'password123' } });
  assert.equal(done.location, '/admin/google/reviews');
  // never to another site
  const evil = await client()('/login?next=%2F%2Fevil.com', { form: { email: 'back@example.com', password: 'password123' } });
  assert.equal(evil.location, '/admin');
});

test('inside an app, the Google sign-in says to open the browser', async () => {
  const { inAppBrowser } = await import('../src/util.js');
  assert.ok(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'));
  assert.ok(inAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'.replace('Android 14; wv', 'Android 14; Pixel; wv')));
  assert.ok(!inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'));
  assert.ok(!inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'));
});

test('invoice details: saved in settings, shown on the plan, sent to the card payment', async () => {
  const { req, csrf, biz } = await owner('invoice@example.com');
  assert.match((await req('/admin/business')).text, /פרטים לחשבונית/);
  const bad = await req('/admin/business/invoice', { form: { _csrf: csrf, taxId: 'abc' } });
  assert.match(decodeURIComponent(bad.location), /ספרות בלבד/);
  await req('/admin/business/invoice', { form: { _csrf: csrf, name: 'עסק בע"מ', taxId: '51-234567-8', address: 'הרצל 1', city: 'חולון', email: 'books@example.com', phone: '0501234567' } });
  const { invoiceOf } = await import('../src/util.js');
  assert.deepEqual(invoiceOf(store.businessById(biz.id)), { name: 'עסק בע"מ', taxId: '512345678', address: 'הרצל 1', city: 'חולון', email: 'books@example.com', phone: '0501234567' });
  assert.match((await req('/admin/plan')).text, /512345678/);
  // cleared: back to the business name
  await req('/admin/business/invoice', { form: { _csrf: csrf } });
  assert.equal(store.businessById(biz.id).invoice, '');
});

test('the invoices list: card payments and iCount payments, with number and link', async () => {
  const { req, biz } = await owner('invoices@example.com');
  assert.match((await req('/admin/business')).text, /עוד לא היו תשלומים/);
  const pid = store.createPayment(biz.id, { kind: 'checkout', plan: 'pro', cycle: 'monthly', amount: 169, createdBy: 'x' });
  store.settlePayment(pid, { status: 'paid', transactionId: 't1', document: '30017' });
  store.db.prepare("INSERT INTO icount_payments (digest, payload, email, amount, result, business_id) VALUES ('inv-d', ?, 'invoices@example.com', 99, 'activated: מסלול גוגל, חודשי (זוהה לפי הסכום, לא לפי המייל)', ?)")
    .run(JSON.stringify({ docnum: '5021', doc_url: 'https://app.icount.co.il/doc/abc123' }), biz.id);
  const page = (await req('/admin/business')).text;
  assert.match(page, /מס׳ 30017/);
  assert.match(page, /href="https:\/\/app\.icount\.co\.il\/doc\/abc123"/);
  assert.match(page, /מס׳ 5021/);
  assert.match(page, /מסלול גוגל, חודשי</);
});

test('the dashboard can show one calendar month', async () => {
  const { resolvePeriod, recentMonths } = await import('../src/period.js');
  const now = Date.parse('2026-10-31T10:00:00Z');
  const sep = resolvePeriod({ month: '2026-09' }, now);
  assert.equal(sep.key, 'month');
  assert.equal(sep.label, 'בספטמבר 2026');
  assert.equal(sep.fromDay, '2026-09-01');
  assert.equal(sep.toDay, '2026-09-30');
  assert.equal(sep.days, 30);
  assert.equal(resolvePeriod({ month: '2026-10' }, now).to, null, 'this month runs up to now');
  assert.equal(resolvePeriod({ month: '2027-01' }, now).key, '30d', 'not a future month');
  assert.deepEqual(recentMonths(2, now).map((m) => m.label), ['אוקטובר 2026', 'ספטמבר 2026']);
  const { req } = await owner('months@example.com');
  const page = (await req('/admin?month=2026-09')).text;
  assert.equal((await req('/admin?month=2026-09')).status, 200);
  assert.match(page, /name="month" value="2026-09"/);
});

test('a trial landing page in a quieter style, at /v2, not indexed', async () => {
  const res = await fetch(`${base}/v2`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const html = await res.text();
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /ומקבלים יותר לקוחות מגוגל/);
  assert.match(html, /data-rail/, 'sliders');
  assert.match(html, /href="\/register"|href="\/login"/);
});

test('forgot and reset the password while a session is still in the browser', async () => {
  const { req } = await owner('reset-logged@example.com');
  const sent = await req('/forgot', { form: { email: 'reset-logged@example.com' } });
  assert.equal(sent.status, 200, 'no "the form expired"');
  const mail = store.db.prepare("SELECT body FROM outbox WHERE to_addr = 'reset-logged@example.com' ORDER BY id DESC").get();
  const token = mail.body.match(/\/reset\/([\w-]+)/)[1];
  // other forms of a logged-in user still need the token
  assert.equal((await req('/admin/business', { form: { name: 'x' } })).status, 403);
  const done = await req(`/reset/${token}`, { form: { password: 'newpassword1', password2: 'newpassword1' } });
  assert.equal(done.location, '/login?reset=1');
  const back = await client()('/login', { form: { email: 'reset-logged@example.com', password: 'newpassword1' } });
  assert.equal(back.location, '/admin');
});

test('reply drafts run on the light model, and fall back to the main one on a refusal or an error', async () => {
  const { createAi, AI_MODEL, AI_LIGHT_MODEL } = await import('../src/ai.js');
  const calls = [];
  let mode = 'ok';
  const client = { beta: { messages: { create: async (p) => {
    calls.push(p);
    if (p.model === AI_LIGHT_MODEL && mode === 'refuse') return { model: p.model, stop_reason: 'refusal', content: [] };
    if (p.model === AI_LIGHT_MODEL && mode === 'error') throw new Error('overloaded');
    return { model: p.model, stop_reason: 'end_turn', content: [{ type: 'text', text: `by ${p.model}` }], usage: {} };
  } } } };
  const ai = createAi({ client });
  assert.equal(await ai.draftGoogleReply({ businessName: 'x', rating: 5, comment: 'טוב', reviewer: 'דנה' }), `by ${AI_LIGHT_MODEL}`);
  assert.equal(calls[0].fallbacks, undefined, 'no server-side fallback on the light model');
  for (const m of ['refuse', 'error']) {
    mode = m;
    assert.equal(await ai.draftGoogleReply({ businessName: 'x', rating: 1, comment: 'רע', reviewer: 'דנה' }), `by ${AI_MODEL}`);
  }
  // the deeper work stays on the main model
  mode = 'ok';
  calls.length = 0;
  await ai.insights?.({ businessName: 'x', stats: {}, feedback: [] }).catch(() => {});
  assert.ok(calls.every((c) => c.model === AI_MODEL));
});

test('signing in opens the phone menu once; a brand-new account does not', async () => {
  const fresh = client();
  await fresh('/register', { form: { name: 'Owner', email: 'menu@example.com', password: 'password123', business: 'עסק', terms: '1' } });
  const page = await fresh('/admin');
  assert.match(page.text, /gf_menu=1/, 'the layout knows to open the menu');
  const res = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=menu%40example.com&password=password123' });
  assert.ok(res.headers.getSetCookie().some((c) => c.startsWith('gf_menu=1')), 'signing in sets the one-time flag');
  const reg = await fetch(`${base}/register`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'name=N&email=menu2%40example.com&password=password123&business=x&terms=1' });
  assert.ok(!reg.headers.getSetCookie().some((c) => c.startsWith('gf_menu=')), 'a new account opens on its first steps');
});
