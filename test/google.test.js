import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createGoogle } from '../src/google.js';

// A stand-in for Google's OAuth and Business Profile APIs.
const fakeGoogle = {
  calls: [],
  reviews: [
    { name: 'accounts/1/locations/9/reviews/a', reviewer: { displayName: 'דנה' }, starRating: 'FIVE', comment: 'מעולה', createTime: '2026-09-01T10:00:00Z', updateTime: '2026-09-01T10:00:00Z' },
  ],
  async fetch(url, init = {}) {
    fakeGoogle.calls.push([init.method || 'GET', url, init.body || '']);
    const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') {
        const idToken = `x.${Buffer.from(JSON.stringify({ email: 'owner@biz.test' })).toString('base64url')}.y`;
        return json(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, id_token: idToken });
      }
      return json(200, { access_token: 'AT2', expires_in: 3600 });
    }
    if (url.startsWith('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
      return json(200, { accounts: [{ name: 'accounts/1' }] });
    }
    if (url.startsWith('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations')) {
      return json(200, {
        locations: [
          { name: 'locations/9', title: 'קפה במרכז', storefrontAddress: { addressLines: ['הרצל 1'], locality: 'תל אביב' }, metadata: { placeId: 'P9', newReviewUri: 'https://g.page/r/abc/review' } },
        ],
      });
    }
    if (url.startsWith('https://mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews?')) {
      return json(200, { reviews: fakeGoogle.reviews, averageRating: 4.5, totalReviewCount: 12 });
    }
    if (url.endsWith('/reply') && init.method === 'PUT') return json(200, JSON.parse(init.body));
    if (url.endsWith('/localPosts') && init.method === 'POST') {
      if (fakeGoogle.postsFail) return json(403, { error: { message: 'The caller does not have permission' } });
      return json(200, { name: `${url.split('/v4/')[1]}/1`, state: 'LIVE', searchUrl: 'https://local.google.com/place?post=1' });
    }
    if (url.startsWith('https://businessprofileperformance.googleapis.com/v1/locations/9:fetchMultiDailyMetricsTimeSeries?')) {
      fakeGoogle.perfCalls = (fakeGoogle.perfCalls || 0) + 1;
      const q = new URL(url).searchParams;
      const start = Date.UTC(q.get('dailyRange.start_date.year'), q.get('dailyRange.start_date.month') - 1, q.get('dailyRange.start_date.day'));
      const end = Date.UTC(q.get('dailyRange.end_date.year'), q.get('dailyRange.end_date.month') - 1, q.get('dailyRange.end_date.day'));
      const series = (metric, v) => ({
        dailyMetric: metric,
        timeSeries: {
          datedValues: Array.from({ length: Math.round((end - start) / 864e5) + 1 }, (_, i) => {
            const d = new Date(start + i * 864e5);
            // Google leaves out the value on days with none.
            return { date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, ...(v ? { value: String(v) } : {}) };
          }),
        },
      });
      return json(200, {
        multiDailyMetricTimeSeries: [{
          dailyMetricTimeSeries: [
            series('BUSINESS_IMPRESSIONS_MOBILE_MAPS', 30), series('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 10),
            series('CALL_CLICKS', 2), series('WEBSITE_CLICKS', 1), series('BUSINESS_DIRECTION_REQUESTS', 3), series('BUSINESS_BOOKINGS', 0),
          ],
        }],
      });
    }
    if (url.startsWith('https://businessprofileperformance.googleapis.com/v1/locations/9/searchkeywords/impressions/monthly?')) {
      return json(200, { searchKeywordsCounts: [{ searchKeyword: 'בית קפה תל אביב', insightsValue: { value: '420' } }, { searchKeyword: 'קפה הרצל', insightsValue: { threshold: '15' } }] });
    }
    return json(404, { error: { message: `unexpected ${url}` } });
  },
};

const fakeAi = {
  async draftGoogleReply(input) {
    return `תודה ${input.reviewer}!`;
  },
  async draftPost(input) {
    return `פוסט על: ${input.idea}`;
  },
};

let server;
let base;
let created;

before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    ai: fakeAi,
    backups: false,
    google: createGoogle({ clientId: 'cid', clientSecret: 'secret', fetchImpl: fakeGoogle.fetch }),
  });
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
      jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  req.raw = async (path, body) => {
    const res = await fetch(base + path, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
      body,
    });
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
  return req;
}
const csrf = async (req) => (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];

async function owner(email) {
  const req = client();
  await req('/register', { method: 'POST', form: { name: 'Owner', email, password: 'password123', business: 'Cafe', terms: '1' } });
  return req;
}

test('connect Google, follow a location, get alerts and answer reviews', async () => {
  const { store, googleSync } = created;
  const req = await owner('g-owner@example.com');
  const token = await csrf(req);
  const biz = store.businessesFor(store.userByEmail('g-owner@example.com').id)[0];
  await req('/admin/campaigns', { method: 'POST', form: { _csrf: token, name: 'Main', lang: 'he', threshold: '4' } });
  const campaign = store.campaignsFor(biz.id)[0];

  // Not connected yet: the page offers to connect.
  const page = (await req('/admin/google')).text;
  assert.match(page, /התחברות עם חשבון גוגל/);
  // The first user is the system admin and sees what the server read from the environment.
  assert.match(page, /בדיקת הגדרות/);
  assert.match(page, /❌ GOOGLE_CLIENT_ID: <code dir="ltr">cid</);

  // Start OAuth: redirected to Google with our state.
  const start = await req('/admin/google/connect', { method: 'POST', form: { _csrf: token } });
  const auth = new URL(start.location);
  // The browser only follows the form's redirect if the CSP allows Google.
  const csp = (await fetch(base + '/admin/google')).headers.get('content-security-policy');
  assert.match(csp, /form-action 'self'[^;]* https:\/\/accounts\.google\.com/);
  assert.equal(auth.host, 'accounts.google.com');
  assert.match(auth.searchParams.get('scope'), /business\.manage/);
  assert.equal(auth.searchParams.get('access_type'), 'offline');
  const state = auth.searchParams.get('state');

  // A forged state is refused.
  const forged = await req('/admin/google/callback?code=zzz&state=wrong');
  assert.match(decodeURIComponent(forged.location), /פג תוקף/);

  // The real callback stores the connection (tokens sealed) and the location.
  const again = await req('/admin/google/connect', { method: 'POST', form: { _csrf: token } });
  const state2 = new URL(again.location).searchParams.get('state');
  assert.notEqual(state, state2);
  const cb = await req(`/admin/google/callback?code=abc&state=${state2}`);
  assert.equal(cb.location, '/admin/google?connected=1');
  const conn = store.googleConnection(biz.id);
  assert.equal(conn.email, 'owner@biz.test');
  assert.ok(!conn.refresh_token.includes('RT1'), 'refresh token is encrypted at rest');
  const [loc] = store.googleLocations(biz.id);
  assert.equal(loc.title, 'קפה במרכז');
  assert.equal(loc.enabled, 1, 'a single location is followed automatically');
  assert.equal(loc.name, 'accounts/1/locations/9');

  // First sync imported history without alerts.
  assert.equal(store.googleReviews(biz.id).length, 1);
  assert.equal(store.googleSummary(biz.id).total, 12);

  // Link the location to the campaign: the empty review link is filled from Google.
  await req(`/admin/google/locations/${loc.id}`, { method: 'POST', form: { _csrf: token, enabled: '1', campaign: String(campaign.id) } });
  assert.equal(store.campaignById(campaign.id).google_review_url, 'https://g.page/r/abc/review');

  // A new 2-star review arrives: it is stored and triggers an email alert.
  fakeGoogle.reviews.unshift({ name: 'accounts/1/locations/9/reviews/b', reviewer: { displayName: 'אבי' }, starRating: 'TWO', comment: 'חיכינו המון', createTime: '2026-09-28T10:00:00Z', updateTime: '2026-09-28T10:00:00Z' });
  assert.equal(await googleSync.syncBusiness(store.businessById(biz.id)), 1);
  const alert = store.db.prepare("SELECT * FROM outbox WHERE kind = 'google_review'").all();
  assert.equal(alert.length, 1);
  assert.match(alert[0].body, /חיכינו המון/);
  // Syncing again changes nothing.
  assert.equal(await googleSync.syncBusiness(store.businessById(biz.id)), 0);

  // Dashboard and list show the Google rating and the unanswered review.
  const dash = (await req('/admin')).text;
  assert.match(dash, /<b>4\.5<\/b><span class="cover-star">/);
  assert.match(dash, /חיכינו המון/, 'the negative Google review waits for handling on the dashboard');
  assert.match(dash, /12 ביקורות בגוגל/);
  const list = await req('/admin/google/reviews?filter=unanswered');
  assert.match(list.text, /חיכינו המון/);
  assert.doesNotMatch(list.text, /Invalid Date/);
  assert.match(list.text, /28\.9\.2026/);
  const review = store.googleReviews(biz.id, { filter: 'negative' })[0];

  // AI draft, then publish the reply to Google.
  const draft = await req(`/admin/google/reviews/${review.id}/draft`, { method: 'POST', form: { _csrf: token } });
  assert.match(draft.text, /תודה אבי!/);
  const replied = await req(`/admin/google/reviews/${review.id}/reply`, { method: 'POST', form: { _csrf: token, reply: 'מצטערים, נשמח לדבר' } });
  assert.equal(replied.location, `/admin/google/reviews/${review.id}?saved=1`);
  const put = fakeGoogle.calls.find(([m, u]) => m === 'PUT' && u.includes('/reviews/b/reply'));
  assert.ok(put, 'reply sent to Google');
  assert.equal(JSON.parse(put[2]).comment, 'מצטערים, נשמח לדבר');
  assert.equal(store.googleReview(review.id, biz.id).reply, 'מצטערים, נשמח לדבר');

  // Another business cannot see or answer these reviews.
  const other = await owner('g-other@example.com');
  assert.doesNotMatch((await other('/admin/google')).text, /בדיקת הגדרות/, 'only the system admin sees the setup check');
  assert.equal((await other(`/admin/google/reviews/${review.id}`)).status, 404);
  const t2 = await csrf(other);
  assert.equal((await other(`/admin/google/reviews/${review.id}/reply`, { method: 'POST', form: { _csrf: t2, reply: 'x' } })).status, 404);

  // An expired access token is refreshed before calling Google.
  store.updateGoogleToken(biz.id, conn.access_token, Date.now() - 1000);
  await googleSync.syncBusiness(store.businessById(biz.id));
  assert.ok(fakeGoogle.calls.some(([, u, b]) => u.includes('oauth2') && String(b).includes('refresh_token')));

  // Disconnect removes the connection and the stored reviews.
  await req('/admin/google/disconnect', { method: 'POST', form: { _csrf: token } });
  assert.equal(store.googleConnection(biz.id), null);
  assert.equal(store.googleReviews(biz.id).length, 0);
});

test('without Google credentials the page explains the setup to the system admin', async () => {
  const plain = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, ai: null, backups: false, google: null });
  const srv = plain.app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const old = base;
  base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const req = await owner('first@example.com'); // first user: system admin
    const page = await req('/admin/google');
    assert.match(page.text, /GOOGLE_CLIENT_ID/);
    assert.match(page.text, /\/admin\/google\/callback/);
  } finally {
    base = old;
    srv.close();
  }
});

test('compose a Google post, with AI and a photo, and publish it to a location', async () => {
  const { store } = created;
  const req = await owner('g-poster@example.com');
  const token = await csrf(req);
  const biz = store.businessesFor(store.userByEmail('g-poster@example.com').id)[0];

  // Before connecting: the composer works, publishing explains what's missing.
  const before = await req('/admin/google/posts');
  assert.match(before.text, /פוסטים בגוגל/);
  assert.match(before.text, /לחבר את חשבון הגוגל/);
  assert.doesNotMatch(before.text, /פרסום בגוגל<\/button>/);

  const start = await req('/admin/google/connect', { method: 'POST', form: { _csrf: token } });
  const state = new URL(start.location).searchParams.get('state');
  await req(`/admin/google/callback?code=abc&state=${state}`);
  const [loc] = store.googleLocations(biz.id);

  // Multipart requests carry the CSRF token in the query string.
  const send = async (path, fields, file) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) fd.append(k, x);
    if (file) fd.append('photo', new Blob([file], { type: 'image/png' }), 'photo.png');
    return req.raw(`${path}?_csrf=${encodeURIComponent(token)}`, fd);
  };

  const page = await req('/admin/google/posts');
  assert.match(page.text, /פרסום בגוגל<\/button>/);
  assert.match(page.text, new RegExp(`name="locations" value="${loc.id}" checked`));

  // The AI drafts from an idea; the photo survives the round trip.
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
  const drafted = await send('/admin/google/posts/draft', { topic: 'STANDARD', idea: 'קפה ב-10 ש"ח' }, png);
  assert.match(drafted.text, /פוסט על: קפה ב-10 ש&quot;ח|פוסט על: קפה ב-10 ש"ח/);
  const imageToken = drafted.text.match(/name="image_token" value="([\w-]+)"/)[1];
  const img = await fetch(`${base}/m/${imageToken}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');

  // An offer without dates is refused with a clear message.
  const bad = await send('/admin/google/posts', { topic: 'OFFER', title: '1+1', summary: 'x', locations: String(loc.id) });
  assert.match(bad.text, /צריך תאריך התחלה ותאריך סיום/);

  // Publish an offer with a button and the photo.
  const ok = await send('/admin/google/posts', {
    topic: 'OFFER', title: '1+1 על קפה', starts_at: '2026-10-05T08:00', ends_at: '2026-10-12T11:00', coupon: 'COFFEE',
    summary: 'כל השבוע', cta_type: 'ORDER', cta_url: 'https://example.com/order', image_token: imageToken, locations: String(loc.id),
  });
  assert.equal(ok.status, 303);
  const call = fakeGoogle.calls.findLast(([m, u]) => m === 'POST' && u.endsWith('/localPosts'));
  assert.ok(call[1].endsWith('/v4/accounts/1/locations/9/localPosts'));
  const body = JSON.parse(call[2]);
  assert.equal(body.topicType, 'OFFER');
  assert.equal(body.event.title, '1+1 על קפה');
  assert.deepEqual(body.event.schedule.startDate, { year: 2026, month: 10, day: 5 });
  assert.equal(body.event.schedule.endTime.hours, 11);
  assert.equal(body.offer.couponCode, 'COFFEE');
  assert.deepEqual(body.callToAction, { actionType: 'ORDER', url: 'https://example.com/order' });
  assert.equal(body.media[0].sourceUrl, `${base}/m/${imageToken}`);
  const after = await req(ok.location);
  assert.match(after.text, /הפוסט נשלח לגוגל/);
  assert.match(after.text, /✓ קפה במרכז/);

  // When Google refuses (API not approved yet), nothing is saved and the reason is clear.
  fakeGoogle.postsFail = true;
  const refused = await send('/admin/google/posts', { topic: 'STANDARD', summary: 'שלום', locations: String(loc.id) });
  fakeGoogle.postsFail = false;
  assert.match(refused.text, /גוגל עוד לא אישרה/);
  assert.equal(store.googlePosts(biz.id).length, 1);
});

test('Google posts has its own menu item', async () => {
  const req = await owner('g-menu@example.com');
  const page = await req('/admin/google/posts');
  assert.match(page.text, /<a href="\/admin\/google\/posts" class="active" aria-current="page">/);
  assert.doesNotMatch(page.text, /class="g-tabs"/);
});

test('profile performance: views, calls, directions and searches from Google', async () => {
  const { store, googleSync } = created;
  const req = await owner('perf-owner@example.com');
  const token = await csrf(req);
  const biz = store.businessesFor(store.userByEmail('perf-owner@example.com').id)[0];

  // Not connected: the dashboard previews the numbers and asks to connect.
  assert.equal((await req('/admin/performance')).location, '/admin#google', 'the old page now lives on the dashboard');
  const locked = (await req('/admin')).text;
  assert.match(locked, /כך זה ייראה אחרי החיבור לגוגל/);
  assert.match(locked, /עוד לא עוקבים אחרי העסק בגוגל/);

  const start = await req('/admin/google/connect', { method: 'POST', form: { _csrf: token } });
  await req(`/admin/google/callback?code=abc&state=${new URL(start.location).searchParams.get('state')}`);
  // The first pull starts in the background on connect; run one here to wait for it.
  await googleSync.syncMetrics(store.businessById(biz.id));
  const [loc] = store.googleLocations(biz.id);
  assert.ok(loc.metrics_at);
  assert.equal(loc.metrics_error, null);
  const days = store.db.prepare("SELECT COUNT(DISTINCT date) AS n FROM profile_metrics WHERE location_id = ? AND metric = 'CALL_CLICKS'").get(loc.id).n;
  assert.ok(days >= 500, 'the first pull goes back about 18 months');
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM profile_metrics WHERE location_id = ? AND metric = 'BUSINESS_BOOKINGS' AND value != 0").get(loc.id).n, 0);

  // 30 days: 40 views a day, 6 actions a day.
  const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const page = (await req(`/admin?range=custom&from=${ago(40)}&to=${ago(11)}`)).text;
  assert.match(page, /צפיות בפרופיל<\/span>\s*<span class="kpi-value">1,200</);
  assert.match(page, /שיחות<\/span>\s*<span class="kpi-value">60</);
  assert.match(page, /בקשות הגעה<\/span>\s*<span class="kpi-value">90</);
  assert.match(page, /כניסות לאתר<\/span>\s*<span class="kpi-value">30</);
  assert.match(page, /15\.0%/, 'conversion: actions out of views');
  assert.match(page, /בית קפה תל אביב/);
  assert.match(page, /פחות מ-15/);
  assert.match(page, /מפות גוגל <b>900<\/b> \(75%\)/);
  assert.match((await req('/admin?range=365d')).text, /לפי שבוע/);

  // Reputation from the reviews sits next to the private numbers.
  assert.match(page, /דירוג בגוגל/);
  assert.match(page, /אחוז מענה לביקורות/);
  assert.doesNotMatch(page, /התצוגה מאחור היא דוגמה/);

  // Later pulls only go back three weeks.
  const before = fakeGoogle.calls.length;
  await googleSync.syncMetrics(store.businessById(biz.id));
  const q = new URL(fakeGoogle.calls.slice(before).find((c) => c[1].includes(':fetchMultiDailyMetricsTimeSeries'))[1]).searchParams;
  const from = Date.UTC(q.get('dailyRange.start_date.year'), q.get('dailyRange.start_date.month') - 1, q.get('dailyRange.start_date.day'));
  assert.ok(Date.now() - from < 23 * 864e5);
});
