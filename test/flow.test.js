import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { googleReviewUrl, csvEscape, waNumber } from '../src/util.js';

let server;
let base;
let store;
const webhookCalls = [];
let hookServer;

before(async () => {
  hookServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      webhookCalls.push(JSON.parse(body));
      res.end('ok');
    });
  });
  await new Promise((r) => hookServer.listen(0, r));

  const created = createApp(openDb(':memory:'), { publicLimit: { windowMs: 60e3, max: 1000 } });
  store = created.store;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  hookServer.close();
});

/** Minimal cookie-keeping client. */
function client() {
  const jar = {};
  async function req(path, { method = 'GET', form } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      jar[k] = v;
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }
  return { req, jar };
}

async function csrfOf(c) {
  const page = await c.req('/admin/business');
  return page.text.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function registeredOwner(email) {
  const c = client();
  const r = await c.req('/register', {
    method: 'POST',
    form: { name: 'Owner', email, password: 'password123', business: 'Test Cafe' },
  });
  assert.equal(r.status, 303);
  return c;
}

async function createCampaign(c, extra = {}) {
  const csrf = await csrfOf(c);
  const r = await c.req('/admin/campaigns', {
    method: 'POST',
    form: {
      _csrf: csrf,
      name: 'Main branch',
      lang: 'he',
      threshold: '4',
      google_review_url: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      link_label: 'Facebook',
      link_url: 'https://facebook.com/test',
      q_id: 'nps',
      q_label: 'Recommend?',
      q_type: 'nps',
      q_audience: 'all',
      q_options: '',
      q_required: '0',
      ...extra,
    },
  });
  assert.equal(r.status, 303);
  const id = Number(r.location.match(/campaigns\/(\d+)/)[1]);
  return store.campaignById(id);
}

test('helpers', () => {
  assert.equal(
    googleReviewUrl('ChIJN1t_tDeuEmsRUsoyG83frY4'),
    'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
  );
  assert.equal(googleReviewUrl('javascript:alert(1)'), '');
  assert.equal(csvEscape('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(waNumber('050-123-4567'), '972501234567');
});

test('admin pages require login', async () => {
  const r = await client().req('/admin');
  assert.equal(r.status, 303);
  assert.equal(r.location, '/login');
});

test('happy customer: rating -> questions -> Google review link tracked', async () => {
  const owner = await registeredOwner('happy@example.com');
  const campaign = await createCampaign(owner);
  const customer = client();

  const scan = await customer.req(`/r/${campaign.slug}?src=table-3`);
  assert.equal(scan.status, 200);
  assert.match(scan.text, /Test Cafe/);

  const rate = await customer.req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '5', src: 'table-3' } });
  assert.equal(rate.status, 303);
  const tokenPath = rate.location;
  const questions = await customer.req(tokenPath);
  assert.match(questions.text, /Recommend\?/);
  assert.doesNotMatch(questions.text, /name="phone"/, 'happy customers are not asked for contact details');

  const done = await customer.req(tokenPath, { method: 'POST', form: { q_nps: '10', comment: 'great' } });
  assert.equal(done.status, 303);
  const thanks = await customer.req(done.location);
  assert.match(thanks.text, /כתיבת ביקורת בגוגל/);

  const tok = tokenPath.split('/').pop();
  const go = await customer.req(`/go/${tok}/google`);
  assert.equal(go.status, 302);
  assert.match(go.location, /search\.google\.com\/local\/writereview\?placeid=ChIJN1t/);

  const stats = store.stats(campaign.business_id, { campaignId: campaign.id });
  assert.equal(stats.scans, 1);
  assert.equal(stats.responses, 1);
  assert.equal(stats.positive, 1);
  assert.equal(stats.reviewClicks, 1);
  assert.equal(stats.nps, 100);
  assert.deepEqual(stats.sources.map((s) => ({ ...s })), [{ source: 'table-3', scans: 1 }]);
});

test('unhappy customer: private feedback + ticket + webhook, public links still available', async () => {
  const owner = await registeredOwner('sad@example.com');
  const csrf = await csrfOf(owner);
  await owner.req('/admin/business', {
    method: 'POST',
    form: { _csrf: csrf, name: 'Test Cafe', brand_color: '#123456', webhook_url: `http://127.0.0.1:${hookServer.address().port}/hook` },
  });
  const campaign = await createCampaign(owner);
  const customer = client();

  const rate = await customer.req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '2' } });
  const form = await customer.req(rate.location);
  assert.match(form.text, /name="phone"/, 'unhappy customers are offered a contact form');

  const done = await customer.req(rate.location, {
    method: 'POST',
    form: { comment: 'cold coffee', customer_name: 'Dana', phone: '0501234567', wants_contact: '1' },
  });
  const thanks = await customer.req(done.location);
  assert.match(thanks.text, /הועברה ישירות להנהלה/);
  // No review gating: the public review link is still offered.
  assert.match(thanks.text, /\/go\/[^"]+\/google/);

  const [row] = store.listResponses(campaign.business_id, { sentiment: 'negative' });
  assert.equal(row.comment, 'cold coffee');
  assert.equal(row.status, 'new');

  await new Promise((r) => setTimeout(r, 100));
  const hook = webhookCalls.find((w) => w.response?.comment === 'cold coffee');
  assert.ok(hook, 'webhook was called');
  assert.equal(hook.event, 'feedback.negative');

  const detail = await owner.req(`/admin/responses/${row.id}`);
  assert.match(detail.text, /wa\.me\/972501234567/);

  const upd = await owner.req(`/admin/responses/${row.id}`, {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), status: 'resolved', notes: 'called her' },
  });
  assert.equal(upd.status, 303);
  assert.equal(store.responseForBusiness(row.id, campaign.business_id).status, 'resolved');

  const csv = await owner.req('/admin/responses.csv');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.text, /cold coffee/);
});

test('required questions are enforced', async () => {
  const owner = await registeredOwner('req@example.com');
  const campaign = await createCampaign(owner, { q_required: '1' });
  const customer = client();
  const rate = await customer.req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '5' } });
  const bad = await customer.req(rate.location, { method: 'POST', form: {} });
  assert.equal(bad.status, 422);
  const good = await customer.req(rate.location, { method: 'POST', form: { q_nps: '8' } });
  assert.equal(good.status, 303);
});

test('invites are tracked', async () => {
  const owner = await registeredOwner('invite@example.com');
  const campaign = await createCampaign(owner);
  const r = await owner.req(`/admin/campaigns/${campaign.id}/invites`, {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), customer_name: 'Yossi', phone: '0521112222' },
  });
  const tok = new URL(base + r.location).searchParams.get('invite');
  const share = await owner.req(r.location);
  assert.match(share.text, /wa\.me\/972521112222/);

  const customer = client();
  const page = await customer.req(`/r/${campaign.slug}?i=${tok}`);
  assert.match(page.text, /Yossi/);
  await customer.req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '5', i: tok } });
  const inv = store.inviteByToken(campaign.id, tok);
  assert.ok(inv.opened_at && inv.responded_at);
});

test('CSRF and tenant isolation', async () => {
  const a = await registeredOwner('a@example.com');
  const b = await registeredOwner('b@example.com');
  const campaign = await createCampaign(a);

  const noCsrf = await a.req('/admin/business', { method: 'POST', form: { name: 'Hacked' } });
  assert.equal(noCsrf.status, 403);

  const other = await b.req(`/admin/campaigns/${campaign.id}`);
  assert.equal(other.status, 404);
  const otherQr = await b.req(`/admin/campaigns/${campaign.id}/qr.svg`);
  assert.equal(otherQr.status, 404);
});

test('output is escaped', async () => {
  const owner = await registeredOwner('xss@example.com');
  const campaign = await createCampaign(owner, { name: '<script>alert(1)</script>' });
  const page = await owner.req('/admin/campaigns');
  assert.doesNotMatch(page.text, /<script>alert\(1\)<\/script>/);
  assert.match(page.text, /&lt;script&gt;/);
  const qr = await owner.req(`/admin/campaigns/${campaign.id}/qr.svg`);
  assert.match(qr.text, /<svg/);
});
