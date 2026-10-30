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
