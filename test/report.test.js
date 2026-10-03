import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { lastMonth, monthRange, recentMonths } from '../src/report.js';

test('month ranges in Israel time', () => {
  const oct3 = Date.parse('2026-10-03T09:00:00Z');
  assert.equal(lastMonth(oct3), '2026-09');
  assert.equal(lastMonth(Date.parse('2026-01-10T09:00:00Z')), '2025-12');
  // Just after midnight on the 1st in Israel (UTC+2 in winter) is already the new month.
  assert.equal(lastMonth(Date.parse('2026-10-31T22:30:00Z')), '2026-10');
  assert.equal(lastMonth(Date.parse('2026-10-31T21:30:00Z')), '2026-09');
  const r = monthRange('2026-09', oct3);
  assert.equal(r.label, 'ספטמבר 2026');
  assert.equal(new Date(r.from).toISOString(), '2026-08-31T21:00:00.000Z', 'September 1st 00:00 in Israel (UTC+3)');
  assert.equal(new Date(r.to).toISOString(), '2026-09-30T21:00:00.000Z');
  assert.equal(r.partial, false);
  assert.equal(monthRange('2026-10', oct3).partial, true);
  assert.equal(monthRange('2026-11', oct3), null, 'no future months');
  assert.equal(monthRange('nope', oct3), null);
  assert.equal(recentMonths(oct3)[0].key, '2026-10');
  assert.equal(recentMonths(oct3)[1].label, 'ספטמבר 2026');
});

test('the monthly report: page, AI bottom line once, and the email on the 1st', async () => {
  let summaries = 0;
  const ai = { monthlySummary: async (facts) => (summaries++, assert.match(facts, /ביקורות חדשות בגוגל: 2/), 'חודש טוב: הלקוחות אוהבים את הקפה. כדאי לקצר את זמני ההמתנה.') };
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, serp: null, ai, answerEngines: {}, cardcom: null, whatsapp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
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
    return { status: res.status, text: await res.text() };
  };
  try {
    await req('/register', { method: 'POST', form: { name: 'גל', email: 'rep@example.com', password: 'password123', business: 'ג׳קו סטריט', terms: '1' } });
    const biz = created.store.businessesFor(created.store.userByEmail('rep@example.com').id)[0];
    const month = lastMonth();
    const range = monthRange(month);
    const mid = new Date(range.from + 10 * 864e5).toISOString();

    let page = await req(`/admin/reports/monthly?month=${month}`);
    assert.match(page.text, /href="\/admin\/reports\/monthly"/, 'in the menu');
    assert.match(page.text, /אין עדיין נתונים/);

    // Two Google reviews last month (one great, one bad) and one the month before.
    const loc = created.store.addSerpLocation(biz.id, { dataId: '0x9:0x9', title: 'ג׳קו סטריט' });
    created.store.googleLocationStats(loc.id, 4.4, 320);
    const review = (name, rating, comment, at) =>
      created.store.upsertGoogleReview(loc.id, { name, reviewer: 'דנה', photo: '', rating, comment, createTime: at, updateTime: at, reply: '', replyTime: '' });
    review('a', 5, 'הקפה הכי טוב בדיזנגוף, צוות מקסים ושירות מהיר. נחזור!', mid);
    review('b', 2, 'חיכינו חצי שעה לשולחן ואף אחד לא התנצל על העיכוב.', mid);
    review('c', 4, 'נחמד', new Date(range.prevFrom + 5 * 864e5).toISOString());

    page = await req(`/admin/reports/monthly?month=${month}`);
    assert.match(page.text, /דוח חודשי/);
    assert.match(page.text, new RegExp(range.label));
    assert.match(page.text, /בשורה התחתונה/);
    assert.match(page.text, /הלקוחות אוהבים את הקפה/);
    assert.match(page.text, /הקפה הכי טוב בדיזנגוף/, 'a good quote');
    assert.match(page.text, /חיכינו חצי שעה/, 'a bad quote');
    assert.match(page.text, /▲ 1 מהחודש הקודם/, '2 new reviews against 1');
    assert.match(page.text, /window\.print\(\)/);
    await req(`/admin/reports/monthly?month=${month}`);
    assert.equal(summaries, 1, 'the bottom line is written once and kept');

    // The email goes out once, on the first days of the month.
    const firstOfMonth = new Date(range.to + 9 * 3600e3);
    const jobs = created.jobs;
    const { createJobs } = await import('../src/jobs.js');
    const early = createJobs({ store: created.store, notifier: created.notifier, now: () => firstOfMonth, backups: false });
    assert.equal(await early.monthlyReports(), 1);
    assert.equal(await early.monthlyReports(), 0, 'once');
    const mail = created.store.db.prepare("SELECT * FROM outbox WHERE kind = 'monthly_report'").get();
    assert.match(mail.subject, new RegExp(`${range.label}`));
    assert.match(mail.body, /reports\/monthly\?month=/);
    assert.ok(jobs.monthlyReports, 'the app runs it with the other jobs');
  } finally {
    server.close();
  }
});
