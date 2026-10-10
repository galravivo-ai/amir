import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { buildReport, monthRange } from '../src/report.js';
import { fillTemplate } from '../src/network.js';
import { createSerp } from '../src/serp.js';

const client = (base) => {
  const jar = {};
  const req = async (path, { method = 'GET', form } = {}) => {
    const res = await fetch(base + path, {
      method,
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
  req.csrf = async () => (await req('/account')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  return req;
};

test('a network of branches: comparison, a manager per branch, shared templates, one report', async () => {
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null,
    serp: createSerp({ apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, text: async () => '{}', json: async () => ({}) }) }) });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { store } = created;
  try {
    const op = client(base);
    await op('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });
    const owner = client(base);
    await owner('/register', { method: 'POST', form: { name: 'דנה', email: 'chain@example.com', password: 'password123', business: 'קפה רשת', terms: '1' } });
    const token = await owner.csrf();
    const biz = store.businessesFor(store.userByEmail('chain@example.com').id)[0];

    // One profile: the page explains what a network gets.
    const a = store.addSerpLocation(biz.id, { dataId: '0x1:0x1', placeId: 'ChIJaaaaaaaaaa', title: 'סניף דיזנגוף', address: 'דיזנגוף 1, תל אביב' });
    assert.match((await owner('/admin/network')).text, /מהפרופיל השני בגוגל, החשבון הופך לחשבון רשת/);
    const b = store.addSerpLocation(biz.id, { dataId: '0x2:0x2', placeId: 'ChIJbbbbbbbbbb', title: 'סניף חיפה', address: 'הנמל 5, חיפה' });
    store.db.prepare('UPDATE google_locations SET avg_rating = ?, total_reviews = ? WHERE id = ?').run(4.8, 120, a.id);
    store.db.prepare('UPDATE google_locations SET avg_rating = ?, total_reviews = ? WHERE id = ?').run(4.1, 40, b.id);
    const now = new Date().toISOString();
    const add = (loc, name, rating, reviewer, reply = '') =>
      store.upsertGoogleReview(loc, { name, reviewer, photo: '', rating, comment: 'טקסט', createTime: now, updateTime: now, reply, replyTime: reply ? now : '' });
    add(a.id, 'r1', 5, 'יוסי כהן', 'תודה');
    add(a.id, 'r2', 5, 'מיכל', 'תודה');
    add(b.id, 'r3', 2, 'אבי לוי');
    add(b.id, 'r4', 3, 'רון');
    add(b.id, 'r5', 1, 'גלית');

    // The comparison: both branches, totals, who leads and who needs attention.
    const net = (await owner('/admin/network?range=30d&sort=waiting')).text;
    assert.match(net, /href="\/admin\/network"/, 'in the menu');
    assert.match(net, /2 סניפים/);
    assert.match(net, /סניף דיזנגוף/);
    assert.match(net, /סניף חיפה<\/b><\/a>.*?<\/tr>/s);
    assert.match(net, /דירוג הרשת<\/span><span class="st-value">4\.6/, 'weighted by reviews');
    assert.match(net, /סניף חיפה<\/b><\/a> · 3 ביקורות מחכות לתשובה/);
    assert.ok(net.indexOf('סניף חיפה</b></a><small>') < net.indexOf('סניף דיזנגוף</b></a><small>'), 'sorted by waiting replies');
    assert.match((await owner(`/admin/network/${b.id}`)).text, /אבי לוי/);

    // Shared reply templates, filled for the review.
    await owner('/admin/reply-templates/starter', { method: 'POST', form: { _csrf: token } });
    assert.equal(store.replyTemplates(biz.id).length, 3);
    const low = store.googleReviews(biz.id, { locationId: b.id }).find((r) => r.reviewer === 'אבי לוי');
    const page = (await owner(`/admin/google/reviews/${low.id}`)).text;
    assert.match(page, /ביקורת שלילית/);
    assert.match(page, /שלום אבי, מצטערים מאוד לשמוע על החוויה בסניף חיפה/);
    assert.doesNotMatch(page, /תודה על ביקורת חיובית/, 'only templates for this rating');
    assert.equal(fillTemplate('תודה {שם}!', { reviewer: '' }), 'תודה!');

    // A manager limited to one branch.
    const mgr = client(base);
    await mgr('/register', { method: 'POST', form: { name: 'רון', email: 'haifa@example.com', password: 'password123', business: 'שלי', terms: '1' } });
    const mgrId = store.userByEmail('haifa@example.com').id;
    store.addMember(biz.id, mgrId, 'manager');
    await owner('/admin/team/members/' + mgrId, { method: 'POST', form: { _csrf: token, action: 'branch', location: String(b.id) } });
    assert.equal(store.membersOf(biz.id).find((m) => m.id === mgrId).location_id, b.id);
    assert.match((await owner('/admin/team')).text, /<option value="\d+" selected>סניף חיפה<\/option>/);
    await mgr(`/admin/switch?b=${biz.id}`);
    assert.equal((await mgr('/admin')).location, `/admin/network/${b.id}`);
    assert.equal((await mgr(`/admin/network/${a.id}`)).location, `/admin/network/${b.id}`);
    const mine = (await mgr(`/admin/network/${b.id}`)).text;
    assert.match(mine, /הסניף שלי/);
    assert.doesNotMatch(mine, /href="\/admin\/campaigns"/, 'a short menu');
    const reviews = (await mgr('/admin/google/reviews')).text;
    assert.match(reviews, /אבי לוי/);
    assert.doesNotMatch(reviews, /יוסי כהן/);
    const other = store.googleReviews(biz.id, { locationId: a.id })[0];
    assert.equal((await mgr(`/admin/google/reviews/${other.id}`)).status, 404);
    assert.equal((await mgr('/admin/business')).location, `/admin/network/${b.id}`);
    const mtoken = await mgr.csrf();
    assert.equal((await mgr('/admin/campaigns', { method: 'POST', form: { _csrf: mtoken, name: 'x' } })).status, 403);
    assert.equal((await mgr('/admin/reply-templates', { method: 'POST', form: { _csrf: mtoken, title: 'x', body: 'y' } })).status, 403);
    assert.match((await mgr('/admin/reply-templates')).text, /ביקורת שלילית/, 'uses the templates, does not edit them');
    // Alerts: the branch's own reviews only.
    assert.deepEqual(store.branchRecipients(b.id), ['haifa@example.com']);
    assert.ok(!store.alertRecipients(biz.id).includes('haifa@example.com'));
    // Back to every branch.
    await owner('/admin/team/members/' + mgrId, { method: 'POST', form: { _csrf: token, action: 'branch', location: '' } });
    assert.equal((await mgr('/admin/business')).status, 403, 'a manager again, not an owner');

    // The monthly report: a table of the branches.
    const ym = now.slice(0, 7);
    const report = buildReport(store, store.businessById(biz.id), monthRange(ym));
    assert.equal(report.branches.length, 2);
    assert.equal(report.branches.find((r) => r.id === b.id).unanswered, 3);
    assert.match((await owner(`/admin/reports/monthly?month=${ym}`)).text, /הסניפים החודש/);

    // The landing page makes it clear.
    const home = (await client(base)('/')).text;
    assert.match(home, /id="network"/);
    assert.match(home, /כל הסניפים שלכם בגוגל, במסך אחד/);
    assert.match(home, /כמה סניפים\? חשבון רשת בלי תוספת/);
  } finally {
    server.close();
  }
});
