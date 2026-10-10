import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { pixelTags, sourceLabel } from '../src/tracking.js';

let server;
let base;
let store;
before(async () => {
  delete process.env.META_PIXEL_ID;
  delete process.env.GOOGLE_TAG_ID;
  const created = createApp(openDb(':memory:'), { ai: null, backups: false, google: null, authLimit: { windowMs: 60e3, max: 1000 } });
  store = created.store;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

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
      const i = pair.indexOf('=');
      const v = pair.slice(i + 1);
      if (v) jar[pair.slice(0, i)] = v;
      else delete jar[pair.slice(0, i)];
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }
  return { req, jar };
}

const register = (c, email) =>
  c.req('/register', { method: 'POST', form: { name: 'Owner', email, password: 'password123', business: `Biz ${email}`, terms: '1' } });

test('ad sources: kept from the ad link to the lead and the sign-up, and reported to the system admin', async () => {
  const admin = client();
  await register(admin, 'admin@example.com'); // the first account is the system admin

  // No pixels while their ids are not set.
  const plain = await fetch(base + '/');
  assert.doesNotMatch(await plain.text(), /fbevents|googletagmanager/);
  assert.doesNotMatch(plain.headers.get('content-security-policy'), /facebook|googletagmanager/);

  const visitor = client();
  await visitor.req('/?utm_source=facebook&utm_medium=paid&utm_campaign=dentists-tlv&fbclid=abc');
  assert.match(decodeURIComponent(visitor.jar.src), /"s":"facebook".*"c":"dentists-tlv".*"click":"meta"/);
  await visitor.req('/contact', { method: 'POST', form: { kind: 'chain', name: 'Dana', phone: '0501234567' } });
  assert.equal((await register(visitor, 'owner@example.com')).status, 303);
  const biz = store.allBusinesses().find((b) => b.name === 'Biz owner@example.com');
  assert.equal(sourceLabel(biz.source), 'facebook / dentists-tlv');
  assert.equal(sourceLabel(store.recentLeads()[0].source), 'facebook / dentists-tlv');

  // A click with no UTM still counts, by its network.
  const googler = client();
  await googler.req('/register?gclid=xyz');
  await register(googler, 'g@example.com');
  assert.equal(sourceLabel(store.allBusinesses().find((b) => b.name === 'Biz g@example.com').source), 'google');

  // A direct visit has no source.
  await register(client(), 'direct@example.com');

  const report = await admin.req('/superadmin');
  assert.match(report.text, /מאיפה מגיעים/);
  const row = (label) => report.text.match(new RegExp(`<b>${label}</b></td><td data-l="פניות">(\\d+)</td><td data-l="נרשמו">(\\d+)</td>`));
  assert.deepEqual(row('facebook / dentists-tlv').slice(1), ['1', '1']);
  assert.deepEqual(row('google').slice(1), ['0', '1']);
  assert.deepEqual(row('ישיר / לא ידוע').slice(1), ['0', '1'], 'the system admin\'s own business is left out');
  assert.match(report.text, /הפיקסלים כבויים/);
});

test('pixels: on the marketing site once set, with lead, sign-up and purchase conversions', async () => {
  process.env.META_PIXEL_ID = '123456789012345';
  process.env.GOOGLE_TAG_ID = 'AW-987654321';
  process.env.GOOGLE_ADS_SIGNUP_LABEL = 'AW-987654321/SignUpLabel';
  try {
    const home = await fetch(base + '/');
    const html = await home.text();
    assert.match(html, /fbq\('init','123456789012345'\);fbq\('track','PageView'\);<\/script>/);
    assert.match(html, /gtag\/js\?id=AW-987654321/);
    const csp = home.headers.get('content-security-policy');
    assert.match(csp, /script-src [^;]*https:\/\/connect\.facebook\.net/);
    assert.match(csp, /connect-src [^;]*https:\/\/www\.facebook\.com/);

    assert.match(await (await fetch(base + '/?sent=1')).text(), /fbq\('track','Lead'\);.*gtag\('event','generate_lead',\{\}\)/s);
    assert.match(await (await fetch(base + '/register')).text(), /fbq\('init'/, 'the sign-up page measures too');

    // The page after a sign-up reports it, once.
    const c = client();
    await register(c, 'px@example.com');
    const next = await c.req('/admin/plan');
    assert.match(next.text, /fbq\('track','CompleteRegistration'\)/);
    assert.match(next.text, /gtag\('event','conversion',\{send_to:'AW-987654321\/SignUpLabel'\}\)/);
    assert.doesNotMatch((await c.req('/admin/plan')).text, /CompleteRegistration|fbevents/, 'once, and no pixels inside the app otherwise');

    // Never on a customer's survey.
    const owner = store.allBusinesses().find((b) => b.name === 'Biz px@example.com');
    const campaignId = store.createCampaign(owner.id, { name: 'Main', slug: 'px-survey', google_review_url: 'https://g.page/r/x/review' });
    assert.ok(campaignId);
    const survey = await fetch(`${base}/r/px-survey`);
    assert.equal(survey.status, 200);
    assert.doesNotMatch(await survey.text(), /fbevents|gtag/);

    // The cookie notice and policy say so.
    const cookies = await (await fetch(base + '/cookies')).text();
    assert.match(cookies, /כלי מדידה של צד שלישי/);
    assert.match(cookies, /<code>src<\/code>/);
    assert.match(await (await fetch(base + '/privacy')).text(), /כלי מדידה של Meta/);
  } finally {
    delete process.env.META_PIXEL_ID;
    delete process.env.GOOGLE_TAG_ID;
    delete process.env.GOOGLE_ADS_SIGNUP_LABEL;
  }
});

test('pixel tags: bad ids are ignored, purchase carries its value', () => {
  assert.equal(pixelTags([], { META_PIXEL_ID: '<script>', GOOGLE_TAG_ID: 'x");alert(1)//' }), '');
  const tags = pixelTags([{ name: 'purchase', value: 169 }], { META_PIXEL_ID: '123456789', GOOGLE_TAG_ID: 'G-ABC123', GOOGLE_ADS_PURCHASE_LABEL: 'AW-1/abc' });
  assert.match(tags, /fbq\('track','Purchase',\{value:169,currency:'ILS'\}\)/);
  assert.match(tags, /gtag\('event','purchase',\{value:169,currency:'ILS'\}\)/);
  assert.match(tags, /gtag\('event','conversion',\{send_to:'AW-1\/abc',value:169,currency:'ILS'\}\)/);
});
