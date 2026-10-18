import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { readPayment } from '../src/icount.js';

const SECRET = 'test-secret-0123456789abcdef';
let server;
let base;
let store;

before(async () => {
  process.env.ICOUNT_IPN_SECRET = SECRET;
  process.env.ICOUNT_URL_PRO_MONTHLY = 'https://example.com/pro';
  process.env.SUPERADMIN_EMAILS = 'op@example.com';
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, ai: null, cardcom: null });
  store = created.store;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  for (const k of ['ICOUNT_IPN_SECRET', 'ICOUNT_URL_PRO_MONTHLY', 'SUPERADMIN_EMAILS']) delete process.env[k];
  server.close();
});

const ipn = (form, secret = SECRET) =>
  fetch(`${base}/billing/icount/ipn/${secret}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });

function owner(email, plan = 'basic') {
  const user = store.createUser({ email, name: 'Owner', passwordHash: 'x' });
  return store.businessById(store.createBusiness(user, { name: `Biz ${email}`, plan, trialDays: 7 }));
}

test('the payer and the amount are read from any field name', () => {
  assert.deepEqual(readPayment({ docnum: '1001', client: { email: 'A@B.co' }, totalsum: '1,690.00' }), { emails: ['a@b.co'], amounts: [1690] });
});

test('a call without the right secret is turned away and changes nothing', async () => {
  const biz = owner('nosecret@example.com');
  store.updateBusiness(biz.id, { plan_request: JSON.stringify({ plan: 'pro', cycle: 'monthly' }) });
  assert.equal((await ipn({ email: 'nosecret@example.com', sum: '169' }, 'wrong-secret-0123456789abc')).status, 404);
  assert.equal(store.businessById(biz.id).billing, 'trial');
  assert.equal(store.recentIcountPayments().length, 0);
});

test('a payment that matches a plan request opens the plan, once', async () => {
  const biz = owner('payer@example.com');
  store.updateBusiness(biz.id, { plan_request: JSON.stringify({ plan: 'pro', cycle: 'annual' }) });
  const form = { doc_id: '77', email: 'Payer@example.com', sum: '1690' };
  assert.equal(await (await ipn(form)).text(), 'OK');
  const after = store.businessById(biz.id);
  assert.equal(after.billing, 'active');
  assert.equal(after.plan, 'pro');
  assert.equal(after.billing_cycle, 'annual');
  assert.equal(after.plan_request, null);
  assert.match(store.recentIcountPayments()[0].result, /^activated/);
  const mail = store.db.prepare("SELECT subject FROM outbox WHERE kind = 'icount_payment' ORDER BY id DESC").get();
  assert.match(mail.subject, /תשלום התקבל והופעל/);
  // iCount sends it again: kept once, nothing more happens
  await ipn(form);
  assert.equal(store.recentIcountPayments().filter((p) => p.email === 'payer@example.com').length, 1);
});

test('a payment of another amount waits for the operator', async () => {
  const biz = owner('other@example.com');
  store.updateBusiness(biz.id, { plan_request: JSON.stringify({ plan: 'pro', cycle: 'monthly' }) });
  await ipn({ email: 'other@example.com', sum: '99' });
  assert.equal(store.businessById(biz.id).billing, 'trial');
  assert.equal(store.recentIcountPayments()[0].result, 'manual');
  assert.match(store.db.prepare("SELECT subject FROM outbox WHERE kind = 'icount_payment' ORDER BY id DESC").get().subject, /לא הופעל אוטומטית/);
});

test('a paid branch opens', async () => {
  const biz = owner('branches@example.com', 'pro');
  store.updateBusiness(biz.id, { billing: 'active' });
  store.upsertGoogleLocations(biz.id, [
    { name: 'locations/1', title: 'Main', address: 'A', placeId: 'p1', reviewUrl: '' },
    { name: 'locations/2', title: 'North', address: 'B', placeId: 'p2', reviewUrl: '' },
  ]);
  const [main, north] = store.googleLocations(biz.id).sort((a, b) => a.id - b.id);
  store.updateGoogleLocation(main.id, { enabled: true });
  store.setLocationPending(north.id, true);
  store.markBranchPayRequested(north.id);
  await ipn({ email: 'branches@example.com', sum: '135' });
  const opened = store.googleLocation(north.id, biz.id);
  assert.equal(opened.pending_pay, 0);
  assert.equal(opened.enabled, 1);
});

test('the system admin sees the address to give iCount', async () => {
  const res = await fetch(`${base}/register`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'Op', email: 'op@example.com', password: 'password123', business: 'Ops', terms: '1' }).toString() });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const page = await (await fetch(`${base}/superadmin`, { headers: { cookie } })).text();
  assert.match(page, new RegExp(`/billing/icount/ipn/${SECRET}`));
});
