import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { translate, translateText, untranslated } from '../src/lang.js';
import { canonTokens, englishTokens, inviteMessage } from '../src/util.js';
import { fillTemplate } from '../src/network.js';

let server;
let base;
let store;
let notifier;

before(async () => {
  process.env.DEMO_OPEN = '1';
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, ai: null, cardcom: null });
  store = created.store;
  notifier = created.notifier;
  server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  delete process.env.DEMO_OPEN;
  server.close();
});

function client(cookies = {}) {
  const jar = { ...cookies };
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
  return { req, jar };
}

const HEB = /[֐-׿]/;

test('translating a page: text, numbers, slots, quotes, attributes and scripts', () => {
  assert.equal(translateText('דשבורד ראשי'), 'Dashboard');
  assert.equal(translateText('נשארו 3 בדיקות ידניות החודש'), '3 manual checks left this month');
  assert.equal(translateText('{loc} · רדיוס {r}'.replace('{loc}', 'Vine Bistro').replace('{r}', 'קילומטר')), 'Vine Bistro · radius 1 km');
  // the same text, written raw or escaped by h()
  assert.equal(translateText('עוד לא נבדק. לחצו &quot;בדיקת פרופיל&quot;.'), 'Not checked yet. Click “Check profile”.');
  // a business's own text stays as it is
  assert.equal(translateText('הפסטה הכי טובה בעיר'), 'הפסטה הכי טובה בעיר');
  // a list in a slot is translated only when every part is interface text
  assert.equal(translateText('לחזק את האזור: צפון, מזרח'), 'Strengthen the area: North, East');

  const page = translate(`<!doctype html><html lang="he" dir="rtl"><body>
    <button title="יוסתר עד השבוע הבא" onclick="return confirm('למחוק את התבנית?')">מחיקה</button>
    <input placeholder="למשל: דנה">
    <script>t.textContent='הועתק ✓'</script>
    <p>ביסטרו שלי</p></body></html>`);
  assert.match(page, /<html lang="en" dir="ltr">/);
  assert.match(page, /title="Hidden until next week"/);
  assert.match(page, /confirm\('Delete this template\?'\)/);
  assert.match(page, />Delete</);
  assert.match(page, /placeholder="e.g. Dana"/);
  assert.match(page, /textContent='Copied ✓'/);
  assert.match(page, /<p>ביסטרו שלי<\/p>/);
  assert.deepEqual(untranslated(page), ['ביסטרו שלי']);
});

test('text taken from the page goes back escaped, so a name cannot break out of an attribute', () => {
  const out = translate('<html lang="he" dir="rtl"><span title="שאלה &quot; onmouseover=&quot;x"></span><p>הגדלת צילום המסך: a&quot; onclick=&quot;x</p></html>');
  assert.doesNotMatch(out, /title="[^"]*" onmouseover/);
  assert.match(out, /Enlarge screenshot: a&quot; onclick=&quot;x/);
});

test('message templates: English placeholders mean the same as the Hebrew ones', () => {
  assert.equal(canonTokens('Hi {name}, {Business}: {link}'), 'Hi {שם}, {עסק}: {קישור}');
  assert.equal(englishTokens('היי {שם} מ{סניף}'), 'היי {name} מ{branch}');
  assert.equal(inviteMessage({ name: 'Dana', businessName: 'Vine', link: 'L', template: 'Hey {name}! {business}' }), 'Hey Dana! Vine L');
  assert.equal(inviteMessage({ name: '', businessName: 'Vine', link: 'L', english: true }), "Hi! Thanks for choosing Vine. We'd love to hear how it went (takes less than a minute): L");
  assert.equal(fillTemplate('Thanks {name}, see you at {branch}!', { reviewer: 'Emma Collins', location_title: 'Downtown' }), 'Thanks Emma, see you at Downtown!');
});

test('the English landing page: its own address, in English, linked both ways', async () => {
  const c = client();
  const he = await c.req('/');
  assert.match(he.text, /<html lang="he" dir="rtl">/);
  assert.match(he.text, /hreflang="en" href="[^"]*\/en"/);
  assert.match(he.text, /class="lang-switch" href="\/en"/);

  const en = await c.req('/en');
  assert.equal(en.status, 200);
  assert.match(en.text, /<html lang="en" dir="ltr">/);
  assert.match(en.text, /Manage your/);
  assert.match(en.text, /<link rel="canonical" href="[^"]*\/en">/);
  assert.match(en.text, /href="\/\?lang=he"[^>]*>עברית</);
  assert.equal(c.jar.lang, 'en', 'the choice is remembered');
  // and the Hebrew home page now leads back to the English one, until Hebrew is chosen
  assert.equal((await c.req('/')).location, '/en');
  assert.match((await c.req('/?lang=he')).text, /<html lang="he" dir="rtl">/);
  assert.equal(c.jar.lang, 'he');
});

test('someone who signs up in English gets the dashboard in English, and can switch', async () => {
  const c = client({ lang: 'en' });
  const r = await c.req('/register', { method: 'POST', form: { name: 'Emma', email: 'emma@example.com', password: 'password123', business: 'Vine Bistro', terms: '1' } });
  assert.equal(r.status, 303);
  assert.equal(store.userByEmail('emma@example.com').lang, 'en');
  delete c.jar.lang; // the setting is on the user, not only in the browser
  const account = await c.req('/account');
  assert.match(account.text, /<html lang="en" dir="ltr">/);
  assert.match(account.text, /Change password/);
  const csrf = account.text.match(/name="_csrf" value="([^"]+)"/)[1];
  await c.req('/account/lang', { method: 'POST', form: { _csrf: csrf, lang: 'he' } });
  assert.equal(store.userByEmail('emma@example.com').lang, '');
  assert.match((await c.req('/account')).text, /שינוי סיסמה/);
});

test('the sample business in English, with no Hebrew interface text left', async () => {
  const c = client({ lang: 'en' });
  await c.req('/demo');
  const pages = ['/admin', '/admin/maps', '/admin/ai-visibility', '/admin/google/reviews', '/admin/responses', '/admin/competitors', '/admin/reports/monthly', '/admin/network', '/admin/campaigns', '/admin/plan', '/account'];
  for (const p of pages) {
    const page = await c.req(p);
    assert.equal(page.status, 200, p);
    assert.match(page.text, /<html lang="en" dir="ltr">/, p);
    const left = untranslated(page.text).filter((t) => !/^(עברית|Language · שפה)$/.test(t));
    assert.deepEqual(left, [], `${p} still has Hebrew: ${left.slice(0, 5).join(' | ')}`);
  }
  // the Hebrew sample is a separate business
  const he = client();
  await he.req('/demo');
  assert.match((await he.req('/admin')).text, /ביסטרו הגפן/);
});

test('Hebrew stays the default, untouched', async () => {
  const c = client();
  await c.req('/register', { method: 'POST', form: { name: 'גל', email: 'gal@example.com', password: 'password123', business: 'קפה', terms: '1' } });
  const page = await c.req('/admin/plan');
  assert.match(page.text, /<html lang="he" dir="rtl">/);
  // The website widget is off the menu for a business that doesn't use it, and its page still works.
  assert.doesNotMatch(page.text, /href="\/admin\/widget"/);
  assert.equal((await c.req('/admin/widget')).status, 200);
  assert.ok(HEB.test(page.text));
  assert.equal(store.userByEmail('gal@example.com').lang, '');
});

test('emails to someone who reads English go out in English, left to right', async () => {
  const en = store.createUser({ email: 'reader@example.com', name: 'Reader', passwordHash: 'x' });
  store.setUserLang(en, 'en');
  const he = store.createUser({ email: 'korea@example.com', name: 'קורא', passwordHash: 'x' });
  await notifier.passwordReset({ user: store.userById(en), link: 'https://example.com/reset/1' });
  await notifier.passwordReset({ user: store.userById(he), link: 'https://example.com/reset/2' });
  const mail = (to) => store.db.prepare('SELECT subject, body FROM outbox WHERE to_addr = ? ORDER BY id DESC').get(to);
  const english = mail('reader@example.com');
  assert.equal(english.subject, 'Reset password');
  assert.match(english.body, /<html lang="en" dir="ltr">/);
  assert.match(english.body, /Choose a new password/);
  assert.doesNotMatch(english.body, /text-align:right/);
  assert.equal(mail('korea@example.com').subject, 'איפוס סיסמה');
});

test("a business's customers get its emails in the campaign's language", async () => {
  const owner = store.createUser({ email: 'owner-en@example.com', name: 'Owner', passwordHash: 'x' });
  const business = store.businessById(store.createBusiness(owner, { name: 'Vine Bistro' }));
  const send = async (lang, email) => {
    const campaign = store.campaignById(store.createCampaign(business.id, { name: lang, lang, slug: `c-${lang}` }));
    store.createInvite(campaign.id, { customer_name: 'Emma', phone: '', email });
    const invite = store.db.prepare('SELECT * FROM invites WHERE email = ?').get(email);
    await notifier.customerInvite({ business, campaign, invite });
    await notifier.followUp({ business, response: { email, customer_name: '', campaign_id: campaign.id }, link: 'https://example.com/c/1' });
    return store.db.prepare('SELECT subject, body FROM outbox WHERE to_addr = ? ORDER BY id').all(email);
  };
  const [invite, followUp] = await send('en', 'emma@customer.example');
  assert.equal(invite.subject, 'How was Vine Bistro?');
  assert.equal(followUp.subject, 'Vine Bistro: did we solve it?');
  for (const m of [invite, followUp]) {
    assert.match(m.body, /dir="ltr"/);
    assert.deepEqual(untranslated(m.body), []);
  }
  assert.equal((await send('he', 'dana@customer.example'))[0].subject, 'איך היה בVine Bistro?');
});

test('the connection video comes in the reader\'s language', async () => {
  assert.match((await client({ lang: 'en' }).req('/guide/connect')).text, /media\/guide-connect-en\.mp4/);
  assert.match((await client().req('/guide/connect')).text, /media\/guide-connect\.mp4/);
});

test('the plan confirmation page lets you switch between monthly and annual', async () => {
  const c = client();
  await c.req('/register', { method: 'POST', form: { name: 'Cy', email: 'cycle@example.com', password: 'password123', business: 'Cycle', terms: '1' } });
  const page = (await c.req('/admin/plan/change?plan=pro&cycle=monthly')).text;
  assert.match(page, /class="on" href="\/admin\/plan\/change\?plan=pro&cycle=monthly"/);
  assert.match(page, /href="\/admin\/plan\/change\?plan=pro&cycle=annual"[^>]*>שנתי · ₪1,690 לשנה/);
});
