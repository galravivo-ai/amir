import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createCardcom } from '../src/cardcom.js';
import { addPeriod } from '../src/billing.js';

// A stand-in for Cardcom: pages, their results, and token charges.
const pages = new Map();
const charges = [];
let declineCharges = false;
const cardcomFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const json = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
  assert.equal(body.TerminalNumber, 1000);
  assert.equal(body.ApiName, 'test');
  if (url.endsWith('/LowProfile/Create')) {
    const id = `lp-${pages.size + 1}`;
    pages.set(id, { body, paid: false });
    return json({ ResponseCode: 0, LowProfileId: id, Url: `https://secure.cardcom.solutions/pay/${id}` });
  }
  if (url.endsWith('/LowProfile/GetLpResult')) {
    const p = pages.get(body.LowProfileId);
    if (!p.paid) return json({ ResponseCode: 700, Description: 'not done' });
    return json({
      ResponseCode: 0, TranzactionId: 555, ReturnValue: p.body.ReturnValue,
      TranzactionInfo: { ResponseCode: 0, Amount: p.body.Amount, Last4CardDigitsString: '4242', CardMonth: 7, CardYear: 2029 },
      TokenInfo: { Token: 'tok-1', CardMonth: 7, CardYear: 2029 },
    });
  }
  if (url.endsWith('/Transactions/Transaction')) {
    charges.push(body);
    return json(declineCharges ? { ResponseCode: 33, Description: 'כרטיס חסום' } : { ResponseCode: 0, TranzactionId: 600 + charges.length });
  }
  return { ok: false, status: 404, text: async () => '{}' };
};

let created;
let server;
let base;
const jar = {};
const req = async (path, { method = 'GET', form, json } = {}) => {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : json ? { 'content-type': 'application/json' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
  });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    jar[pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
  }
  return { status: res.status, location: res.headers.get('location'), text: await res.text() };
};

before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    backups: false,
    google: null,
    serp: null,
    ai: null,
    answerEngines: {},
    cardcom: createCardcom({ env: { CARDCOM_TERMINAL: '1000', CARDCOM_API_NAME: 'test' }, fetchImpl: cardcomFetch }),
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('pay by card, renew every month, upgrade, downgrade, cancel', async () => {
  assert.equal(createCardcom({ env: {} }), null);
  // The first account on a new system is the operator's; customers come after it.
  await req('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });
  for (const k of Object.keys(jar)) delete jar[k];
  await req('/register', { method: 'POST', form: { name: 'גל', email: 'pay@example.com', password: 'password123', business: 'קפה תשלום', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = created.store.businessesFor(created.store.userByEmail('pay@example.com').id)[0];
  const fresh = () => created.store.businessById(biz.id);

  const planPage = await req('/admin/plan');
  assert.match(planPage.text, /תשלום ומעבר לגוגל \+ AI/);
  assert.match(planPage.text, /קארדקום/);

  // Checkout: off to Cardcom's page with the right amount and a document.
  const go = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } });
  assert.equal(go.status, 303);
  assert.equal(go.location, 'https://secure.cardcom.solutions/pay/lp-1');
  const page = pages.get('lp-1').body;
  assert.equal(page.Operation, 'ChargeAndCreateToken');
  assert.equal(page.Amount, 99);
  assert.equal(page.Document.Email, 'pay@example.com');
  const paymentId = Number(page.ReturnValue);
  assert.match(page.SuccessRedirectUrl, new RegExp(`/admin/billing/done\\?p=${paymentId}$`));

  // Back before paying: nothing changes.
  let back = await req(`/admin/billing/done?p=${paymentId}`);
  assert.match(decodeURIComponent(back.location), /עוד לא אושר/);
  assert.equal(fresh().billing, 'trial');

  // A forged webhook changes nothing: the result is read from Cardcom.
  await req(`/billing/cardcom/webhook?p=${paymentId}`, { method: 'POST', json: { ResponseCode: 0 } });
  assert.equal(fresh().billing, 'trial');

  pages.get('lp-1').paid = true;
  assert.equal((await req(`/billing/cardcom/webhook?p=${paymentId}`, { method: 'POST', json: {} })).text, 'OK');
  let b = fresh();
  assert.equal(b.billing, 'active');
  assert.equal(b.plan, 'basic');
  assert.equal(b.card_token, 'tok-1');
  assert.equal(b.card_expiry, '0729');
  assert.equal(b.card_last4, '4242');
  const paidUntil = b.paid_until;
  assert.ok(Date.parse(`${paidUntil.replace(' ', 'T')}Z`) > Date.now() + 27 * 864e5);
  // The redirect after the webhook doesn't extend twice.
  back = await req(`/admin/billing/done?p=${paymentId}`);
  assert.equal(back.location, '/admin/plan?paid=1');
  assert.equal(fresh().paid_until, paidUntil);
  assert.match((await req('/admin/plan?paid=1')).text, /החידוש הבא ב-.*4242/);

  // Upgrade: charged now for the rest of the month, no new page.
  const up = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'pro', cycle: 'monthly' } });
  assert.equal(up.location, '/admin/plan?change=upgraded');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].Token, 'tok-1');
  assert.equal(charges[0].CardExpirationMMYY, '0729');
  assert.ok(charges[0].Amount > 58 && charges[0].Amount <= 70, `prorated ${charges[0].Amount}`);
  assert.equal(fresh().plan, 'pro');
  assert.equal(fresh().paid_until, paidUntil, 'the billing day stays');

  // Downgrade waits for the renewal.
  const down = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } });
  assert.equal(down.location, '/admin/plan?change=scheduled');
  assert.equal(fresh().plan, 'pro');
  assert.equal(fresh().next_plan, 'basic');

  // Renewal day: charges the new plan and moves the date a month on.
  created.store.updateBusiness(biz.id, { paid_until: '2026-01-31 10:00:00' });
  assert.equal(await created.jobs.renewals(), 1);
  b = fresh();
  assert.equal(charges.at(-1).Amount, 99);
  assert.equal(b.plan, 'basic');
  assert.equal(b.next_plan, null);
  assert.ok(b.paid_until > '2026-01-31', 'renewed from now, since it was far behind');

  // A declined card: retried daily, paused after three failures, with emails.
  declineCharges = true;
  created.store.updateBusiness(biz.id, { paid_until: new Date(Date.now() - 3600e3).toISOString().slice(0, 19).replace('T', ' ') });
  assert.equal(await created.jobs.renewals(), 0);
  assert.equal(fresh().pay_failures, 1);
  assert.equal(fresh().billing, 'active');
  await created.jobs.renewals();
  assert.equal(fresh().pay_failures, 1, 'no second try the same day');
  for (let i = 0; i < 2; i++) {
    created.store.db.prepare("UPDATE payments SET created_at = datetime('now', '-2 days')").run();
    await created.jobs.renewals();
  }
  assert.equal(fresh().pay_failures, 3);
  assert.equal(fresh().billing, 'paused');
  const mails = created.store.db.prepare("SELECT kind FROM outbox WHERE kind LIKE 'billing_%'").all().map((m) => m.kind);
  assert.deepEqual(mails, ['billing_failed', 'billing_failed', 'billing_paused']);
  assert.match((await req('/admin/plan')).text, /נכשל/);

  // Paying again restarts everything.
  declineCharges = false;
  const again = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'pro', cycle: 'annual' } });
  const lp = again.location.split('/').at(-1);
  assert.equal(pages.get(lp).body.Amount, 1690);
  pages.get(lp).paid = true;
  await req(`/admin/billing/done?p=${pages.get(lp).body.ReturnValue}`);
  b = fresh();
  assert.deepEqual([b.billing, b.plan, b.billing_cycle, b.pay_failures], ['active', 'pro', 'annual', 0]);

  // Cancelling keeps the paid year, then pauses without charging.
  await req('/admin/billing/auto-renew', { method: 'POST', form: { _csrf: token, on: '0' } });
  assert.equal(fresh().auto_renew, 0);
  assert.match((await req('/admin/plan')).text, /בלי חידוש אוטומטי/);
  const before = charges.length;
  created.store.updateBusiness(biz.id, { paid_until: '2026-01-01 00:00:00' });
  await created.jobs.renewals();
  assert.equal(charges.length, before);
  assert.equal(fresh().billing, 'paused');
});

test('periods keep the day of the month', () => {
  assert.equal(new Date(addPeriod(Date.UTC(2026, 0, 15), 'monthly')).toISOString().slice(0, 10), '2026-02-15');
  assert.equal(new Date(addPeriod(Date.UTC(2026, 0, 15), 'annual')).toISOString().slice(0, 10), '2027-01-15');
});

test('the price is per Google profile', async () => {
  const { amountFor } = await import('../src/billing.js');
  assert.equal(amountFor('basic', 'monthly'), 99);
  assert.equal(amountFor('pro', 'monthly', 3), 507);
  assert.equal(amountFor('pro', 'annual', 2), 3380);
  assert.equal(amountFor('enterprise', 'monthly', 4), null);
});
