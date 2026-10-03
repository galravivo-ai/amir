import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createWhatsApp } from '../src/whatsapp.js';

const sent = [];
let failNext = false;
const metaFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  sent.push({ url, body, auth: init.headers.authorization });
  if (failNext) {
    failNext = false;
    return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: 'Recipient not on WhatsApp' } }) };
  }
  return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }) };
};

let created;
let server;
let base;
const jar = {};
const req = async (path, { method = 'GET', form, json, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    redirect: 'manual',
    headers: {
      cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : json ? { 'content-type': 'application/json' } : {}),
      ...headers,
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
  process.env.WHATSAPP_APP_SECRET = 'app-secret';
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    backups: false,
    google: null,
    serp: null,
    ai: null,
    answerEngines: {},
    cardcom: null,
    whatsapp: createWhatsApp({ env: { WHATSAPP_TOKEN: 'wa-token', WHATSAPP_PHONE_NUMBER_ID: '123' }, fetchImpl: metaFetch }),
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

test('rating requests go out by WhatsApp: from the dashboard, a campaign and the API', async () => {
  assert.equal(createWhatsApp({ env: {} }), null);
  await req('/register', { method: 'POST', form: { name: 'גל', email: 'wa@example.com', password: 'password123', business: 'קפה וואטסאפ', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = created.store.businessesFor(created.store.userByEmail('wa@example.com').id)[0];
  const campaignId = created.store.createCampaign(biz.id, { name: 'סניף ראשי', google_review_url: 'https://g.page/r/x/review' });
  const campaign = created.store.campaignById(campaignId);

  const dash = await req('/admin');
  assert.match(dash.text, /שליחה אוטומטית/);
  assert.match(dash.text, /נשארו 1000 מתוך 1000/);

  // From the dashboard's send window.
  const r = await req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '050-1234567', customer_name: 'דנה', campaign: String(campaignId), via: 'auto' } });
  assert.equal(r.location, '/admin?wa=sent');
  const msg = sent.at(-1);
  assert.equal(msg.url, 'https://graph.facebook.com/v23.0/123/messages');
  assert.equal(msg.auth, 'Bearer wa-token');
  assert.equal(msg.body.to, '972501234567');
  assert.equal(msg.body.template.name, 'review_request');
  assert.equal(msg.body.template.language.code, 'he');
  const [name, business, link] = msg.body.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual([name, business], ['דנה', 'קפה וואטסאפ']);
  assert.match(link, new RegExp(`/r/${campaign.slug}\\?i=[\\w-]+$`));
  assert.match((await req('/admin?wa=sent')).text, /ההודעה נשלחה ללקוח בוואטסאפ/);

  // The manual path still opens WhatsApp.
  const manual = await req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0501234567', campaign: String(campaignId), via: 'manual' } });
  assert.match(manual.location, /^https:\/\/wa\.me\/972501234567/);

  // A failure is shown, not hidden.
  failNext = true;
  const bad = await req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0521111111', campaign: String(campaignId), via: 'auto' } });
  assert.match(decodeURIComponent(bad.location), /Recipient not on WhatsApp/);

  // From the campaign page, with the delivery status in the list.
  const share = await req(`/admin/campaigns/${campaignId}/invites`, { method: 'POST', form: { _csrf: token, phone: '0549999999', customer_name: 'אבי', wa: '1' } });
  const sharePage = await req(share.location);
  assert.match(sharePage.text, /נשלח בוואטסאפ\./);

  // Meta reports delivery and reading, signed with the app secret.
  const id = sent.at(-1) && `wamid.${sent.length}`;
  const update = (status) => ({ entry: [{ changes: [{ value: { statuses: [{ id, status }] } }] }] });
  const sign = (b) => `sha256=${crypto.createHmac('sha256', 'app-secret').update(JSON.stringify(b)).digest('hex')}`;
  assert.equal((await req('/whatsapp/webhook', { method: 'POST', json: update('read') })).status, 401, 'unsigned updates are refused');
  assert.equal((await req('/whatsapp/webhook', { method: 'POST', json: update('read'), headers: { 'x-hub-signature-256': sign(update('read')) } })).status, 200);
  await req('/whatsapp/webhook', { method: 'POST', json: update('delivered'), headers: { 'x-hub-signature-256': sign(update('delivered')) } });
  const inv = created.store.db.prepare('SELECT * FROM invites WHERE wa_message_id = ?').get(id);
  assert.equal(inv.wa_status, 'read', 'a late "delivered" does not go back');
  assert.match((await req(`/admin/campaigns/${campaignId}/share`)).text, /נקרא בוואטסאפ/);
  assert.equal((await req('/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42')).text, '42');
  assert.equal((await req('/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42')).status, 403);

  // From the API (a POS): two hours later, by the job.
  const raw = created.store.createApiKey(biz.id, { name: 'קופה', createdBy: null });
  const api = await fetch(`${base}/api/v1/invites`, {
    method: 'POST',
    headers: { authorization: `Bearer ${raw}`, 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '0537777777', name: 'רון', delay_minutes: 120 }),
  }).then((x) => x.json());
  assert.equal(api.status, 'scheduled', JSON.stringify(api));
  assert.equal(api.invite.whatsapp, 'scheduled');
  const before = sent.length;
  assert.equal(await created.jobs.scheduledWhatsApp(), 0, 'not yet');
  created.store.db.prepare("UPDATE invites SET wa_send_at = datetime('now', '-1 minute') WHERE wa_send_at IS NOT NULL").run();
  assert.equal(await created.jobs.scheduledWhatsApp(), 1);
  assert.equal(sent.length, before + 1);
  assert.equal(await created.jobs.scheduledWhatsApp(), 0, 'sent once');

  // The monthly quota.
  created.store.updateBusiness(biz.id, { plan: 'basic' });
  created.store.db.prepare("UPDATE invites SET wa_sent_at = datetime('now') WHERE id IN (SELECT id FROM invites LIMIT 1)").run();
  for (let i = 0; i < 100; i++) created.store.db.prepare("INSERT INTO invites (campaign_id, token, phone, wa_sent_at) VALUES (?, ?, '050', datetime('now'))").run(campaignId, `q${i}`);
  const over = await req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0501234567', campaign: String(campaignId), via: 'auto' } });
  assert.match(decodeURIComponent(over.location), /נגמרה מכסת ההודעות/);
  assert.match((await req('/admin')).text, /המכסה החודשית נוצלה/);
});
