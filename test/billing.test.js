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
  assert.match(planPage.text, /בחירה בגוגל \+ AI/);
  // Choosing a plan first shows what happens.
  const confirm = (await req('/admin/plan/change?plan=basic&cycle=monthly')).text;
  assert.match(confirm, /תועברו לדף התשלום המאובטח של קארדקום, לתשלום של <b>₪99<\/b> לחודש/);
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
  assert.match((await req('/admin/plan?paid=1')).text, /החידוש הבא<\/dt><dd>[\d.]+<\/dd>.*•••• 4242/s);

  // The plan page: the subscription at a glance, with an upgrade and a cancel link.
  const mine = (await req('/admin/plan')).text;
  assert.match(mine, /המנוי פעיל/);
  assert.match(mine, /href="\/admin\/plan\/change\?plan=pro&cycle=monthly">שדרוג לגוגל \+ AI/);
  assert.match(mine, /href="\/admin\/plan\/cancel"/);
  // Before upgrading: the prorated charge, said up front.
  const upQuote = (await req('/admin/plan/change?plan=pro&cycle=monthly')).text;
  assert.match(upQuote, /השדרוג נכנס לתוקף <b>מיד<\/b>/);
  assert.match(upQuote, /תחויבו עכשיו ב-<b>₪(6\d|70)(\.\d+)?<\/b>/);

  // Upgrade: charged now for the rest of the month, no new page.
  const up = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'pro', cycle: 'monthly' } });
  assert.equal(up.location, '/admin/plan?change=upgraded');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].Token, 'tok-1');
  assert.equal(charges[0].CardExpirationMMYY, '0729');
  assert.ok(charges[0].Amount > 58 && charges[0].Amount <= 70, `prorated ${charges[0].Amount}`);
  assert.equal(fresh().plan, 'pro');
  assert.equal(fresh().paid_until, paidUntil, 'the billing day stays');

  // Downgrade waits for the renewal, and can be undone.
  assert.match((await req('/admin/plan/change?plan=basic&cycle=monthly')).text, /השינוי ייכנס לתוקף <b>בחידוש הבא/);
  let down = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } });
  assert.equal(down.location, '/admin/plan?change=scheduled');
  assert.match((await req('/admin/plan')).text, /תעברו ל<b>גוגל<\/b>/);
  await req('/admin/plan/keep', { method: 'POST', form: { _csrf: token } });
  assert.equal(fresh().next_plan, null);
  down = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } });
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

  // Cancelling: what happens first, then a reason; the paid year stays, the operator hears (a yearly refund).
  const cancelPage = (await req('/admin/plan/cancel')).text;
  assert.match(cancelPage, /יוחזרו לכם.{0,10}1,521/, 'a yearly plan: 1,690 less one used month at 169');
  assert.equal((await req('/admin/plan/cancel', { method: 'POST', form: { _csrf: token, reason: 'price', details: 'יקר לי' } })).location, '/admin/plan?canceled=1');
  assert.equal(fresh().auto_renew, 0);
  assert.equal(fresh().cancel_reason, 'המחיר גבוה מדי · יקר לי');
  assert.ok(fresh().canceled_at);
  assert.match((await req('/admin/plan?canceled=1')).text, /המנוי בוטל/);
  assert.equal(created.store.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'subscription_cancelled'").get().n, 1);
  // Resuming before the end undoes it.
  await req('/admin/billing/auto-renew', { method: 'POST', form: { _csrf: token, on: '1' } });
  assert.equal(fresh().auto_renew, 1);
  assert.equal(fresh().cancel_reason, null);
  await req('/admin/plan/cancel', { method: 'POST', form: { _csrf: token } });
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

test('the price: the plan for the first Google profile, every branch 20% off', async () => {
  const { amountFor } = await import('../src/billing.js');
  assert.equal(amountFor('basic', 'monthly'), 99);
  assert.equal(amountFor('pro', 'monthly', 3), 169 + 135 + 135);
  assert.equal(amountFor('pro', 'annual', 2), 1690 + 1350, 'a branch is 20% off');
  assert.equal(amountFor('basic', 'monthly', 3), 99 + 79 + 79);
  assert.equal(amountFor('enterprise', 'monthly', 4), null);
});

test('7 free days with a saved card: nothing charged, small quotas, charged when the trial ends unless cancelled', async () => {
  const signUp = async (email) => {
    for (const k of Object.keys(jar)) delete jar[k];
    await req('/register', { method: 'POST', form: { name: 'ניסיון', email, password: 'password123', business: `עסק ${email.split('@')[0]}`, terms: '1' } });
    const b = created.store.businessesFor(created.store.userByEmail(email).id)[0];
    // A new account starts waiting for its first step (no trial without a card).
    created.store.updateBusiness(b.id, { billing: 'unpaid', trial_ends_at: null });
    return { id: b.id, token: (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1] };
  };
  for (const k of Object.keys(jar)) delete jar[k];
  assert.match((await req('/')).text, /href="\/register">7 ימים חינם</, 'the landing page offers the trial');
  const { id, token } = await signUp('trial-card@example.com');
  const fresh = () => created.store.businessById(id);

  const plan = (await req('/admin/plan')).text;
  assert.match(plan, /בוחרים מסלול ומתחילים 7 ימים חינם/);
  assert.match(plan, /מחברים את פרופיל העסק בגוגל/);
  assert.match(plan, /7 ימים חינם · גוגל \+ AI/);
  const confirm = (await req('/admin/plan/change?plan=pro&cycle=monthly')).text;
  assert.match(confirm, /היום לא מחויבים/);
  assert.match(confirm, /<b>₪169<\/b> לחודש/);

  // Cardcom's page only saves the card: no charge, no invoice.
  const go = await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'pro', cycle: 'monthly' } });
  const lp = go.location.split('/').at(-1);
  const page = pages.get(lp).body;
  assert.equal(page.Operation, 'CreateTokenOnly');
  assert.equal(page.Document, undefined);
  const chargesBefore = charges.length;
  pages.get(lp).paid = true;
  assert.equal((await req(`/admin/billing/done?p=${page.ReturnValue}`)).location, '/admin/google?started=1');
  let b = fresh();
  assert.deepEqual([b.billing, b.plan, b.card_token, b.auto_renew], ['trial', 'pro', 'tok-1', 1]);
  assert.equal(b.paid_until, b.trial_ends_at);
  assert.equal(charges.length, chargesBefore, 'nothing charged yet');
  assert.equal((await req('/admin')).status, 200, 'the system is open during the trial');

  // Small quotas during the trial.
  const { planOf } = await import('../src/plans.js');
  assert.equal(planOf(b).rankKeywords, 1);
  assert.equal(planOf(b).waMonthly, 20);
  const mine = (await req('/admin/plan')).text;
  assert.match(mine, /ניסיון חינם במסלול גוגל \+ AI/);
  assert.match(mine, /יחויב ב-₪169 לחודש/);
  assert.match(mine, /ביטול הניסיון, בלי חיוב/);
  assert.doesNotMatch(mine, /שמירת כרטיס לניסיון|₪0/, 'the card check is not in the payments list');

  // Switching plans during the trial: still free.
  assert.equal((await req('/admin/plan/request', { method: 'POST', form: { _csrf: token, plan: 'basic', cycle: 'monthly' } })).location, '/admin/plan?change=switched');
  assert.equal(fresh().plan, 'basic');
  assert.equal(charges.length, chargesBefore);

  // The day before: an email that says what will be charged.
  created.store.updateBusiness(id, { trial_ends_at: new Date(Date.now() + 20 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') });
  await created.jobs.trialNotices();
  const ending = created.store.db.prepare("SELECT body FROM outbox WHERE kind = 'trial_ending' ORDER BY id DESC LIMIT 1").get();
  assert.match(ending.body, /יחויב ב-<b>₪99<\/b> לחודש/);

  // The trial ends: the first charge, and the plan is active for a month.
  const ended = new Date(Date.now() - 3600e3).toISOString().slice(0, 19).replace('T', ' ');
  created.store.updateBusiness(id, { trial_ends_at: ended, paid_until: ended });
  assert.equal((await req('/admin')).status, 200, 'no gap before the charge');
  assert.equal(await created.jobs.renewals(), 1);
  b = fresh();
  assert.equal(charges.at(-1).Amount, 99);
  assert.equal(charges.at(-1).Token, 'tok-1');
  assert.deepEqual([b.billing, b.trial_ends_at], ['active', null]);
  assert.ok(Date.parse(`${b.paid_until.replace(' ', 'T')}Z`) > Date.now() + 27 * 864e5);

  // One trial per person.
  const { canTrial } = created.billing;
  created.store.updateBusiness(id, { billing: 'unpaid' });
  assert.equal(canTrial(fresh()), false);

  // Cancelled during the trial: never charged, paused at the end.
  const second = await signUp('trial-cancel@example.com');
  const go2 = await req('/admin/plan/request', { method: 'POST', form: { _csrf: second.token, plan: 'basic', cycle: 'monthly' } });
  const lp2 = go2.location.split('/').at(-1);
  pages.get(lp2).paid = true;
  await req(`/admin/billing/done?p=${pages.get(lp2).body.ReturnValue}`);
  assert.match((await req('/admin/plan/cancel')).text, /לא תחויבו בכלל/);
  assert.equal((await req('/admin/plan/cancel', { method: 'POST', form: { _csrf: second.token } })).location, '/admin/plan?canceled=trial');
  assert.match((await req('/admin/plan')).text, /הניסיון בוטל: לא תחויבו/);
  created.store.updateBusiness(second.id, { trial_ends_at: ended, paid_until: ended });
  const n = charges.length;
  await created.jobs.renewals();
  assert.equal(charges.length, n);
  assert.equal(created.store.businessById(second.id).billing, 'paused');

  // A declined first charge pauses right away.
  const third = await signUp('trial-declined@example.com');
  const go3 = await req('/admin/plan/request', { method: 'POST', form: { _csrf: third.token, plan: 'basic', cycle: 'monthly' } });
  const lp3 = go3.location.split('/').at(-1);
  pages.get(lp3).paid = true;
  await req(`/admin/billing/done?p=${pages.get(lp3).body.ReturnValue}`);
  created.store.updateBusiness(third.id, { trial_ends_at: ended, paid_until: ended });
  declineCharges = true;
  await created.jobs.renewals();
  declineCharges = false;
  assert.equal(created.store.businessById(third.id).billing, 'paused');
  assert.ok(created.store.db.prepare("SELECT 1 FROM outbox WHERE kind = 'billing_trial_failed'").get());
});
