import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createSerp, parseMapsLink } from '../src/serp.js';

const DATA_ID = '0x151d4b7a1a1a1a1a:0x9f9f9f9f9f9f9f9f';
// A stand-in for SerpApi (and for Google's short-link redirect).
const fake = {
  calls: [],
  hebrewEmpty: false,
  reviews: [
    { review_id: 'r1', rating: 5, iso_date: '2026-09-20T10:00:00Z', snippet: 'מקום מעולה', user: { name: 'נועה' }, link: 'https://maps.google.com/r1' },
    { review_id: 'r2', rating: 4, iso_date: '2026-09-10T10:00:00Z', snippet: 'טוב', user: { name: 'יוסי' }, response: { snippet: 'תודה!', iso_date: '2026-09-11T10:00:00Z' } },
  ],
  async fetch(url, init = {}) {
    fake.calls.push(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers(), text: async () => JSON.stringify(body) });
    // share.google goes through google.com/share.google to a Google search for the place.
    if (url.startsWith('https://share.google/')) {
      return { ok: false, status: 302, headers: new Headers({ location: 'https://www.google.com/share.google?q=TOKEN123' }), text: async () => '' };
    }
    if (url.startsWith('https://www.google.com/share.google')) {
      return { ok: false, status: 302, headers: new Headers({ location: 'https://www.google.com/search?q=%D7%A7%D7%A4%D7%94+%D7%9C%D7%A0%D7%93%D7%95%D7%95%D7%A8&kgmid=/g/11abc' }), text: async () => '' };
    }
    if (url.startsWith('https://maps.app.goo.gl/')) {
      assert.equal(init.redirect, 'manual');
      return { ok: false, status: 302, headers: new Headers({ location: `https://www.google.com/maps/place/Cafe/@32,34,17z/data=!4m6!3m5!1s${DATA_ID}!8m2` }), text: async () => '' };
    }
    const u = new URL(url);
    assert.equal(u.searchParams.get('api_key'), 'serp-key');
    if (u.searchParams.get('engine') === 'google_maps') {
      if (/nothing/.test(u.searchParams.get('q'))) return json({ error: "Google hasn't returned any results for this query." });
      return json({ local_results: [
        { title: 'קפה לנדוור', address: 'ביאליק 1, רמת גן', rating: 4.4, reviews: 812, data_id: DATA_ID, place_id: 'ChIJabcdefghijk' },
        { title: 'קפה לנדוור סניף 2', address: 'הרצל 5, חולון', rating: 4.1, reviews: 300, data_id: '0x1:0x2', place_id: 'ChIJzzzzzzzzzz' },
      ] });
    }
    if (u.searchParams.get('engine') === 'google_maps_reviews') {
      const info = { title: 'קפה לנדוור', address: 'ביאליק 1, רמת גן', rating: 4.4, reviews: 812 };
      // Some answers carry the rating but no reviews in Hebrew.
      if (fake.hebrewEmpty && u.searchParams.get('hl') === 'iw') return json({ place_info: info, topics: [] });
      return json({ place_info: info, reviews: fake.reviews });
    }
    return json({ error: 'unexpected' }, 400);
  },
};

let server;
let lastDraft = null;
let base;
let created;
before(async () => {
  created = createApp(openDb(':memory:'), {
    authLimit: { windowMs: 60e3, max: 1000 },
    ai: { draftGoogleReply: async (input) => { lastDraft = input; return `תודה ${input.reviewer}!`; } },
    backups: false,
    google: null,
    serp: createSerp({ apiKey: 'serp-key', fetchImpl: fake.fetch }),
  });
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function client() {
  const jar = {};
  return async function req(path, { method = 'GET', form } = {}) {
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
  };
}

test('parse Google Maps links', () => {
  assert.deepEqual(parseMapsLink(`https://www.google.com/maps/place/Caf%C3%A9+Landwer/@32,34,17z/data=!4m6!3m5!1s${DATA_ID}!8m2`), { dataId: DATA_ID, placeId: '', name: 'Café Landwer' });
  assert.equal(parseMapsLink('https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJabcdefghijk').placeId, 'ChIJabcdefghijk');
  // Newer share links and Google's consent page.
  assert.equal(parseMapsLink(`https://consent.google.com/m?continue=${encodeURIComponent(`https://www.google.com/maps/place/X/data=!4m2!3m1!1s${DATA_ID}`)}`).dataId, DATA_ID);
  assert.equal(parseMapsLink(`https://www.google.com/maps?ftid=${DATA_ID}&entry=gps`).dataId, DATA_ID);
  assert.equal(parseMapsLink('https://www.google.com/maps/place/%E0%A4%A').name, '%E0%A4%A', 'a broken escape does not throw');
  assert.equal(parseMapsLink('not a link'), null);
});

test('follow a place by link or by name, get alerts, answer on Google', async () => {
  const { store, serpSync } = created;
  // The first account is the system admin (business plan); test with a regular trial account.
  await client()('/register', { method: 'POST', form: { name: 'Admin', email: 'serp-admin@example.com', password: 'password123', business: 'HQ', terms: '1' } });
  const req = client();
  await req('/register', { method: 'POST', form: { name: 'Owner', email: 'serp-owner@example.com', password: 'password123', business: 'Cafe', terms: '1' } });
  const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const biz = store.businessesFor(store.userByEmail('serp-owner@example.com').id)[0];

  // Without a Google OAuth client the page still offers following by link.
  const page = await req('/admin/google');
  assert.match(page.text, /מעקב אחרי הביקורות בגוגל/);
  assert.doesNotMatch(page.text, /התחברות עם חשבון הגוגל של העסק/);

  // A search by name lists places to choose from.
  const found = await req('/admin/google/places/find', { method: 'POST', form: { _csrf: token, q: 'קפה לנדוור רמת גן' } });
  assert.match(found.text, /בחרו את העסק/);
  assert.match(found.text, /הרצל 5, חולון/);
  const none = await req('/admin/google/places/find', { method: 'POST', form: { _csrf: token, q: 'nothing here' } });
  assert.match(none.text, /לא מצאנו את העסק/);

  // A short share link is followed to the place and its reviews load at once.
  const added = await req('/admin/google/places/find', { method: 'POST', form: { _csrf: token, q: 'https://maps.app.goo.gl/AbCd123' } });
  assert.equal(added.location, '/admin/google?added=1');
  const [loc] = store.googleLocations(biz.id);
  assert.equal(loc.source, 'serp');
  assert.equal(loc.data_id, DATA_ID);
  assert.equal(loc.title, 'קפה לנדוור');
  assert.equal(loc.total_reviews, 812);
  assert.equal(store.googleReviews(biz.id).length, 2);
  assert.equal(store.googleSummary(biz.id).unanswered, 1, 'the review the owner answered on Google counts as answered');
  // The first load is history: no alerts.
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'google_review'").get().n, 0);

  // No branch limit: each followed profile is billed at the plan's price.
  for (const [d, p] of [['0x1:0x2', 'ChIJzzzzzzzzzz'], ['0x3:0x4', 'ChIJyyyyyyyyyy']]) {
    assert.equal((await req('/admin/google/places/add', { method: 'POST', form: { _csrf: token, data_id: d, place_id: p, title: 'x', address: '' } })).location, '/admin/google?added=1');
  }
  const fourth = await req('/admin/google/places/add', { method: 'POST', form: { _csrf: token, data_id: '0x5:0x6', place_id: 'ChIJxxxxxxxxxx', title: 'x' } });
  assert.equal(fourth.location, '/admin/google?added=1');
  assert.match((await req('/admin/plan')).text, /פרופילים בגוגל<\/dt><dd>4<\/dd>.*<b>₪574<\/b> <small>₪169 \+ 3 סניפים × ₪135/s);
  for (const d of ['0x3:0x4', '0x5:0x6']) {
    const extra = store.googleLocations(biz.id).find((l) => l.data_id === d);
    await req(`/admin/google/locations/${extra.id}/delete`, { method: 'POST', form: { _csrf: token } });
  }
  assert.equal(store.serpLocationCount(biz.id), 2);

  // A new 2-star review: stored, alerted by email; the background job skips places checked recently.
  fake.reviews.unshift({ review_id: 'r3', rating: 2, iso_date: '2026-09-29T10:00:00Z', snippet: 'חיכינו שעה', user: { name: 'דני' }, link: 'https://maps.google.com/r3' });
  assert.equal(await serpSync.syncAll(), 0, 'nothing is due yet');
  store.db.prepare("UPDATE google_locations SET synced_at = datetime('now', '-7 hours') WHERE id = ?").run(loc.id);
  const before = fake.calls.length;
  assert.equal(await serpSync.syncAll(), 1);
  assert.equal(fake.calls.length - before, 1, 'one page is enough when it reaches known reviews');
  const alert = store.db.prepare("SELECT * FROM outbox WHERE kind = 'google_review'").all();
  assert.equal(alert.length, 1);
  assert.match(alert[0].body, /חיכינו שעה/);

  // The review page: an AI draft to copy, and a link to answer on Google; no publishing from here.
  const review = store.googleReviews(biz.id, { filter: 'negative' })[0];
  const view = await req(`/admin/google/reviews/${review.id}`);
  assert.match(view.text, /מענה בגוגל/);
  assert.match(view.text, /https:\/\/maps\.google\.com\/r3/);
  const draft = await req(`/admin/google/reviews/${review.id}/draft`, { method: 'POST', form: { _csrf: token } });
  assert.match(draft.text, /תודה דני!/);
  assert.equal((await req(`/admin/google/reviews/${review.id}/reply`, { method: 'POST', form: { _csrf: token, reply: 'x' } })).status, 404);

  // The list and the dashboard show the Google rating.
  assert.match((await req('/admin/google/reviews')).text, /חיכינו שעה/);
  assert.match((await req('/admin')).text, /בגוגל/);
});

test('a rating with no reviews is reported, and the admin can see the raw answer', async () => {
  const { store, serpSync } = created;
  const saved = fake.reviews.splice(0);
  try {
    const biz = store.businessesFor(store.userByEmail('serp-admin@example.com').id)[0];
    const loc = store.addSerpLocation(biz.id, { dataId: '0x9:0x9', title: 'x' });
    const before = fake.calls.length;
    await assert.rejects(serpSync.syncLocation(biz, loc), /בלי רשימת ביקורות\. שדות: place_info, reviews/);
    assert.equal(fake.calls.length - before, 3, 'retried without Hebrew, then without sorting');
    assert.match(store.googleLocation(loc.id, biz.id).sync_error, /בלי רשימת ביקורות/);
  } finally {
    fake.reviews.push(...saved);
  }
});

test('when Hebrew answers have no reviews, a plainer request is used', async () => {
  const { store, serpSync } = created;
  fake.hebrewEmpty = true;
  try {
    const biz = store.businessesFor(store.userByEmail('serp-admin@example.com').id)[0];
    const loc = store.addSerpLocation(biz.id, { dataId: '0x7:0x7', title: 'y' });
    assert.ok((await serpSync.syncLocation(biz, loc)) > 0);
    assert.equal(store.googleLocation(loc.id, biz.id).sync_error, null);
    const last = new URL(fake.calls.at(-1));
    assert.equal(last.searchParams.get('hl'), null);
    assert.equal(last.searchParams.get('sort_by'), 'newestFirst');
  } finally {
    fake.hebrewEmpty = false;
  }
});

test('the dashboard follows the chosen range', async () => {
  const req = client();
  await req('/login', { method: 'POST', form: { email: 'serp-owner@example.com', password: 'password123' } });
  const all = (await req('/admin?range=365d')).text;
  assert.match(all, /dash-cover/);
  assert.match(all, /בשנה האחרונה/);
  // A range before any review counts none of them; reviews still waiting for a reply stay on the dashboard.
  const old = (await req('/admin?range=custom&from=2025-01-01&to=2025-01-31')).text;
  assert.match(old, /בין 1\.1\.2025 ל-31\.1\.2025/);
  assert.match(old, /ביקורות חדשות<\/span><span class="st-value">0</);
});

test('a share.google link leads to a search by the place name', async () => {
  const serp = createSerp({ apiKey: 'serp-key', fetchImpl: (url, init) => fake.fetch(url, init) });
  const before = fake.calls.length;
  const found = await serp.find('https://share.google/PQditwFuU3V7sz2ZJ');
  assert.equal(found.matches.length, 2);
  const search = fake.calls.slice(before).find((u) => u.includes('engine=google_maps'));
  assert.equal(new URL(search).searchParams.get('q'), 'קפה לנדוור', 'searched by the name, not the share token');
});

test('a paying account pays for a new branch before it opens; the system admin activates it', async () => {
  const { store } = created;
  process.env.ICOUNT_URL_BRANCH = 'https://app.icount.co.il/m/branch';
  try {
    const admin = client();
    await admin('/login', { method: 'POST', form: { email: 'serp-admin@example.com', password: 'password123' } });
    const req = client();
    await req('/register', { method: 'POST', form: { name: 'Payer', email: 'serp-payer@example.com', password: 'password123', business: 'Cafe Pay', terms: '1' } });
    const token = (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
    const biz = store.businessesFor(store.userByEmail('serp-payer@example.com').id)[0];
    store.updateBusiness(biz.id, { billing: 'active', plan: 'pro', billing_cycle: 'monthly', trial_ends_at: null });

    // The first place opens right away; the second waits for its payment.
    const add = (d, p) => req('/admin/google/places/add', { method: 'POST', form: { _csrf: token, data_id: d, place_id: p, title: 'סניף', address: '' } });
    assert.equal((await add('0x7:0x7', 'ChIJpay1111111')).location, '/admin/google?added=1');
    const second = await add('0x8:0x8', 'ChIJpay2222222');
    const pending = store.googleLocations(biz.id).find((l) => l.data_id === '0x8:0x8');
    assert.equal(second.location, `/admin/google?pending=${pending.id}`);
    assert.equal(pending.enabled, 0, 'not followed, and not billed, before it is paid');
    assert.equal(pending.pending_pay, 1);
    const page = await req('/admin/google');
    assert.match(page.text, /ממתין לתשלום/);
    assert.match(page.text, /₪135 לחודש/);
    assert.match((await req('/admin/plan')).text, /פרופילים בגוגל<\/dt><dd>1<\/dd>/);

    // Paying: off to the branch's payment page, and the operator hears with the new total.
    const pay = await req(`/admin/google/locations/${pending.id}/pay`, { method: 'POST', form: { _csrf: token } });
    assert.equal(pay.location, 'https://app.icount.co.il/m/branch');
    const mail = store.db.prepare("SELECT * FROM outbox WHERE kind = 'branch_request' ORDER BY id DESC").get();
    assert.match(mail.to_addr, /serp-admin@example\.com/);
    assert.match(mail.body, /₪135 לחודש/);
    assert.match(mail.body, /₪304 לחודש/);

    // The system admin sees it and opens it; the business hears.
    const sa = await admin('/superadmin');
    assert.match(sa.text, /סניפים שממתינים לתשלום/);
    const saToken = sa.text.match(/name="_csrf" value="([^"]+)"/)[1];
    await admin(`/superadmin/branches/${pending.id}/activate`, { method: 'POST', form: { _csrf: saToken } });
    const opened = store.googleLocation(pending.id, biz.id);
    assert.equal(opened.enabled, 1);
    assert.equal(opened.pending_pay, 0);
    assert.ok(store.db.prepare("SELECT 1 FROM outbox WHERE kind = 'branch_active' AND business_id = ?").get(biz.id));
    assert.match((await req('/admin/plan')).text, /פרופילים בגוגל<\/dt><dd>2<\/dd>.*<b>₪304<\/b>/s);

    // A business on its trial adds branches freely.
    store.updateBusiness(biz.id, { billing: 'trial', trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 19).replace('T', ' ') });
    assert.equal((await add('0x9:0x9', 'ChIJpay3333333')).location, '/admin/google?added=1');
  } finally {
    delete process.env.ICOUNT_URL_BRANCH;
  }
});

test('reviews of a place followed by link are answered from the list: copy, then reply on Google', async () => {
  const req = client();
  await req('/login', { method: 'POST', form: { email: 'serp-owner@example.com', password: 'password123' } });
  const owner = created.store.userByEmail('serp-owner@example.com');
  const biz = created.store.db.prepare('SELECT id FROM businesses WHERE user_id = ?').get(owner.id);
  if (!created.store.campaignsFor(biz.id).length) created.store.createCampaign(biz.id, { name: 'ראשי' });
  const list = (await req('/admin/google/reviews')).text;
  assert.match(list, /העתקה ופתיחה בגוגל/);
  assert.match(list, /onclick="gfCopy\(this,'https:\/\/maps\.google\.com\/r1'\)"/, 'Google opens at the review');
  assert.match(list, /<p class="" dir="auto">מקום מעולה/, 'review text keeps its own direction');
  assert.match(list, /התשובה הועתקה, אבל עוד לא פורסמה/, 'after copying, it says the reply is not published yet');
  assert.match(list, /בקשת ביקורת בוואטסאפ/, 'asking for a review on WhatsApp starts from the reviews page');
  assert.match(list, /<dialog id="wa-send"/);
  assert.match(list, /name="back" value="\/admin\/google\/reviews"/);
});

test('the AI writes replies in the style the business chose', async () => {
  const req = client();
  await req('/login', { method: 'POST', form: { email: 'serp-owner@example.com', password: 'password123' } });
  const list = (await req('/admin/google/reviews')).text;
  const csrf = list.match(/name="_csrf" value="([^"]+)"/)[1];
  const saved = await req('/admin/google/reply-style', { method: 'POST', form: { _csrf: csrf, tone: 'fun', emoji: '1', sign: 'דנה והצוות', notes: 'לא מזכירים מחירים' } });
  assert.equal(saved.location, '/admin/google/reviews?style=saved');
  assert.match((await req(saved.location)).text, /קליל ומחויך · חתימה: דנה והצוות/);
  const review = created.store.db.prepare('SELECT id FROM google_reviews LIMIT 1').get();
  await req(`/admin/google/reviews/${review.id}/draft`, { method: 'POST', form: { _csrf: csrf, json: '1' } });
  assert.deepEqual(lastDraft.style, { tone: 'fun', emoji: true, sign: 'דנה והצוות', notes: 'לא מזכירים מחירים' });
  // an unknown tone is dropped
  await req('/admin/google/reply-style', { method: 'POST', form: { _csrf: csrf, tone: 'evil' } });
  await req(`/admin/google/reviews/${review.id}/draft`, { method: 'POST', form: { _csrf: csrf, json: '1' } });
  assert.equal(lastDraft.style.tone, '');
});

test('a review that already has a reply can be answered again from the list', async () => {
  const req = client();
  await req('/login', { method: 'POST', form: { email: 'serp-owner@example.com', password: 'password123' } });
  const list = (await req('/admin/google/reviews')).text;
  assert.match(list, /<summary>עדכון התשובה<\/summary>[\s\S]*?<textarea name="reply"[^>]*>תודה!<\/textarea>/);
});

test('reviews filter by stars, status, text, period and search, and sort', async () => {
  const req = client();
  await req('/login', { method: 'POST', form: { email: 'serp-owner@example.com', password: 'password123' } });
  const has = async (qs, re) => re.test((await req(`/admin/google/reviews?${qs}`)).text);
  assert.ok(await has('stars=5', /מקום מעולה/));
  assert.ok(!(await has('stars=4', /מקום מעולה/)));
  assert.ok(await has('filter=answered', /<p class="" dir="auto">טוב</));
  assert.ok(!(await has('filter=answered', /מקום מעולה/)));
  const found = (await req('/admin/google/reviews?q=' + encodeURIComponent('מעולה'))).text;
  assert.match(found, /נמצא/);
  assert.match(found, /מקום מעולה/);
  assert.doesNotMatch(found, /<p class="" dir="auto">טוב</);
  assert.ok(await has('q=' + encodeURIComponent('%'), /אין ביקורות שמתאימות לסינון/), 'a % is searched as itself');
  assert.ok(await has('text=without', /אין ביקורות שמתאימות לסינון/));
  const low = (await req('/admin/google/reviews?sort=low')).text;
  assert.ok(low.indexOf('>טוב<') < low.indexOf('מקום מעולה'), 'lowest first');
});

test('out of SerpApi searches: a clear message, and the operator hears once', async () => {
  const sent = [];
  const serp = createSerp({
    apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 429, headers: new Headers(), text: async () => JSON.stringify({ error: 'Your account has run out of searches.' }) }),
    onQuota: (d) => sent.push(d),
  });
  await assert.rejects(serp.reviews({ dataId: 'x' }), (err) => err.quota && /מכסת החיפושים החודשית/.test(err.message));
  assert.equal(sent.length, 1);
});
