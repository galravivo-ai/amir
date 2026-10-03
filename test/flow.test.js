import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { googleReviewUrl, csvEscape, waNumber } from '../src/util.js';

// Deterministic stand-in for the Claude-backed helper.
const fakeAi = {
  calls: [],
  async draftReply(input) {
    this.calls.push(['draft', input]);
    return `טיוטה עבור ${input.customerName}`;
  },
  async tagComments(items) {
    this.calls.push(['tag', items]);
    return new Map(items.map((i) => [i.id, /slow|wait/i.test(i.text) ? ['זמן המתנה'] : ['שירות']]));
  },
  async summarize(input) {
    this.calls.push(['summary', input]);
    return `## בשורה התחתונה\nנותחו ${input.rows.length} משובים\n- **שירות** טוב`;
  },
};

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

  const created = createApp(openDb(':memory:'), {
    publicLimit: { windowMs: 60e3, max: 1000 },
    authLimit: { windowMs: 60e3, max: 1000 },
    ai: fakeAi,
    backups: false,
  });
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
  async function req(path, { method = 'GET', form, multipart } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: multipart || (form ? new URLSearchParams(form).toString() : undefined),
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
  const page = await c.req('/account');
  return page.text.match(/name="_csrf" value="([^"]+)"/)[1];
}

async function registeredOwner(email) {
  const c = client();
  const r = await c.req('/register', {
    method: 'POST',
    form: { name: 'Owner', email, password: 'password123', business: 'Test Cafe', terms: '1' },
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
      ask_consent: '1',
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
  await owner.req('/admin/business/notifications', {
    method: 'POST',
    form: {
      _csrf: csrf,
      alert_negative: '1',
      sla_hours: '24',
      webhook_url: `http://127.0.0.1:${hookServer.address().port}/hook`,
    },
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

// ------------------------------------------------------------ new features

const outbox = (kind) => store.recentOutbox(500).filter((m) => m.kind === kind);
const bizOf = (email) => store.businessesFor(store.userByEmail(email).id)[0];

async function completeSurvey(slug, rating, form = {}) {
  const customer = client();
  const rate = await customer.req(`/r/${slug}/rate`, { method: 'POST', form: { rating: String(rating) } });
  await customer.req(rate.location, { method: 'POST', form });
  return store.responseByToken(rate.location.split('/').pop());
}

test('negative feedback emails the owner', async () => {
  const owner = await registeredOwner('alerts@example.com');
  const campaign = await createCampaign(owner);
  await completeSurvey(campaign.slug, 1, { comment: 'terrible', customer_name: 'Avi' });
  const mail = outbox('negative_alert').find((m) => m.to_addr === 'alerts@example.com');
  assert.ok(mail, 'alert email recorded');
  assert.match(mail.body, /terrible/);
});

test('password reset flow', async () => {
  await registeredOwner('forgot@example.com');
  const anon = client();
  const r = await anon.req('/forgot', { method: 'POST', form: { email: 'forgot@example.com' } });
  assert.match(r.text, /אם האימייל רשום/);
  const mail = outbox('password_reset').find((m) => m.to_addr === 'forgot@example.com');
  const link = mail.body.match(/\/reset\/([\w-]+)/)[0];

  const mismatch = await anon.req(link, { method: 'POST', form: { password: 'newpassword1', password2: 'other' } });
  assert.equal(mismatch.status, 422);
  const ok = await anon.req(link, { method: 'POST', form: { password: 'newpassword1', password2: 'newpassword1' } });
  assert.equal(ok.status, 303);
  const reused = await anon.req(link);
  assert.equal(reused.status, 410, 'reset link works only once');

  const login = await client().req('/login', { method: 'POST', form: { email: 'forgot@example.com', password: 'newpassword1' } });
  assert.equal(login.location, '/admin');
  // Unknown emails get the same answer and no mail.
  await anon.req('/forgot', { method: 'POST', form: { email: 'nobody@example.com' } });
  assert.equal(outbox('password_reset').filter((m) => m.to_addr === 'nobody@example.com').length, 0);
});

test('team invites and roles', async () => {
  const owner = await registeredOwner('boss@example.com');
  const campaign = await createCampaign(owner);
  store.updateBusiness(campaign.business_id, { plan: 'pro' });

  const inv = await owner.req('/admin/team/invite', {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), email: 'staff@example.com', role: 'viewer' },
  });
  const raw = new URL(base + inv.location).searchParams.get('link');
  assert.ok(outbox('team_invite').some((m) => m.to_addr === 'staff@example.com'));

  const staff = client();
  const join = await staff.req(`/join/${raw}`, { method: 'POST', form: { name: 'Staff', password: 'password123', terms: '1' } });
  assert.equal(join.status, 303);
  assert.equal(store.business(campaign.business_id, store.userByEmail('staff@example.com').id).role, 'viewer');
  assert.equal((await staff.req(`/join/${raw}`)).status, 410, 'invite is single use');

  // Viewer: can read, cannot change.
  assert.equal((await staff.req('/admin/responses')).status, 200);
  assert.equal((await staff.req('/admin/business')).status, 403);
  assert.equal((await staff.req('/admin/campaigns/new')).status, 403);
  const r = await completeSurvey(campaign.slug, 2, { comment: 'meh' });
  const upd = await staff.req(`/admin/responses/${r.id}`, {
    method: 'POST',
    form: { _csrf: await csrfOf(staff), status: 'resolved', notes: '' },
  });
  assert.equal(upd.status, 403);

  // Owner promotes to manager, who can then handle tickets.
  const staffId = store.userByEmail('staff@example.com').id;
  await owner.req(`/admin/team/members/${staffId}`, { method: 'POST', form: { _csrf: await csrfOf(owner), role: 'manager' } });
  const upd2 = await staff.req(`/admin/responses/${r.id}`, {
    method: 'POST',
    form: { _csrf: await csrfOf(staff), status: 'resolved', notes: 'done' },
  });
  assert.equal(upd2.status, 303);
  assert.ok(store.responseForBusiness(r.id, campaign.business_id).resolved_at);

  // The last owner can't be demoted.
  const bossId = store.userByEmail('boss@example.com').id;
  const demote = await owner.req(`/admin/team/members/${bossId}`, {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), role: 'viewer' },
  });
  assert.match(demote.location, /err=/);
});

test('plan limits: basic plan has one branch', async () => {
  const owner = await registeredOwner('free@example.com');
  store.updateBusiness(bizOf('free@example.com').id, { plan: 'basic', billing: 'active' });
  await createCampaign(owner);
  const second = await owner.req('/admin/campaigns', {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), name: 'Second', threshold: '4', lang: 'he' },
  });
  assert.equal(second.status, 422);
  assert.equal(store.campaignsFor(bizOf('free@example.com').id).length, 1);
  assert.match(second.text, /במסלול בסיסי אפשר עד 1 סניף/);
});

test('publish consent and testimonials widget', async () => {
  const owner = await registeredOwner('widget@example.com');
  const campaign = await createCampaign(owner);
  const biz = bizOf('widget@example.com');

  const r = await completeSurvey(campaign.slug, 5, {
    comment: 'Best hummus in town',
    customer_name: 'Noa Cohen',
    publish_consent: '1',
  });
  assert.equal(r.publish_consent, 1);
  assert.equal(r.published, 0, 'needs approval unless auto-publish is on');

  // A paused account's widget goes dark.
  store.updateBusiness(biz.id, { billing: 'paused' });
  assert.equal((await client().req(`/widget/${biz.widget_key}`)).status, 404);

  store.updateBusiness(biz.id, { plan: 'basic', billing: 'active' });
  await owner.req(`/admin/responses/${r.id}/publish`, { method: 'POST', form: { _csrf: await csrfOf(owner), published: '1' } });
  const page = await client().req(`/widget/${biz.widget_key}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Best hummus in town/);
  assert.match(page.text, />Noa</, 'first name only');
  assert.doesNotMatch(page.text, /Cohen/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors \*/);
  const js = await client().req(`/widget/${biz.widget_key}.js`);
  assert.match(js.text, /iframe/);

  // Negative feedback can never be published, even if the field is forged.
  const bad = await completeSurvey(campaign.slug, 1, { comment: 'awful', publish_consent: '1' });
  assert.equal(bad.publish_consent, 0);
});

test('AI reply drafts and insights', async () => {
  const owner = await registeredOwner('ai@example.com');
  const campaign = await createCampaign(owner);
  store.updateBusiness(campaign.business_id, { plan: 'pro' });
  const r = await completeSurvey(campaign.slug, 2, { comment: 'slow service', customer_name: 'Dana' });

  const draft = await owner.req(`/admin/responses/${r.id}/draft`, { method: 'POST', form: { _csrf: await csrfOf(owner) } });
  assert.equal(draft.status, 303);
  const detail = await owner.req(`/admin/responses/${r.id}`);
  assert.match(detail.text, /טיוטה עבור Dana/);
  const [, input] = fakeAi.calls.find(([k]) => k === 'draft');
  assert.equal(input.comment, 'slow service');

  const few = await owner.req('/admin/insights', { method: 'POST', form: { _csrf: await csrfOf(owner), days: '30' } });
  assert.match(few.location, /err=/, 'needs at least 3 responses');
  await completeSurvey(campaign.slug, 5, { comment: 'great' });
  await completeSurvey(campaign.slug, 4, { comment: 'nice' });
  await owner.req('/admin/insights', { method: 'POST', form: { _csrf: await csrfOf(owner), days: '30' } });
  const page = await owner.req('/admin/insights');
  assert.match(page.text, /נותחו 3 משובים/);
  assert.match(page.text, /<b>שירות<\/b>/);
});

test('jobs: SLA alerts and email reminders are sent once', async () => {
  const owner = await registeredOwner('jobs@example.com');
  const campaign = await createCampaign(owner);
  store.updateBusiness(campaign.business_id, { plan: 'pro' });
  const { jobs } = createApp(store.db, { ai: null, backups: false });

  const r = await completeSurvey(campaign.slug, 1, { comment: 'late ticket' });
  store.db.prepare("UPDATE responses SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(r.id);
  const list = await owner.req('/admin/responses?overdue=1');
  assert.match(list.text, /late ticket/);
  const before = outbox('sla_alert').length;
  await jobs.slaAlerts();
  await jobs.slaAlerts();
  assert.equal(outbox('sla_alert').length, before + 1);

  await owner.req(`/admin/campaigns/${campaign.id}/invites`, {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), customer_name: 'Rina', email: 'rina@example.com' },
  });
  assert.ok(outbox('customer_invite').some((m) => m.to_addr === 'rina@example.com'));
  store.db.prepare("UPDATE invites SET email_sent_at = datetime('now', '-49 hours') WHERE email = 'rina@example.com'").run();
  await jobs.inviteReminders();
  await jobs.inviteReminders();
  assert.equal(outbox('customer_reminder').filter((m) => m.to_addr === 'rina@example.com').length, 1);
});

test('superadmin panel is restricted', async () => {
  const someone = await registeredOwner('plain@example.com');
  assert.equal((await someone.req('/superadmin')).status, 404);
  const firstUser = store.allUsers().at(-1);
  assert.equal(firstUser.is_superadmin, 1, 'first account is the system admin');
});

test('customer-controlled text never lands inside inline scripts', async () => {
  const owner = await registeredOwner('xss2@example.com');
  const campaign = await createCampaign(owner);
  store.updateBusiness(campaign.business_id, { plan: 'pro' });
  const r = await completeSurvey(campaign.slug, 1, {
    comment: 'x',
    customer_name: "a');alert(1);('",
    phone: '0501234567',
    email: "evil'+alert(1)+'@x.co",
  });
  assert.equal(r.email, "evil'+alert(1)+'@x.co");
  const bad = await completeSurvey(campaign.slug, 1, { email: 'not an email' });
  assert.equal(bad.email, '', 'invalid emails are dropped');
  await owner.req(`/admin/responses/${r.id}/draft`, { method: 'POST', form: { _csrf: await csrfOf(owner) } });
  const page = await owner.req(`/admin/responses/${r.id}`);
  for (const [, handler] of page.text.matchAll(/\son\w+="([^"]*)"/g)) {
    assert.doesNotMatch(handler, /alert|&#39;\)/, `inline handler contains user data: ${handler}`);
  }
});

test('registration requires accepting the terms', async () => {
  const r = await client().req('/register', {
    method: 'POST',
    form: { name: 'No Terms', email: 'noterms@example.com', password: 'password123', business: 'X' },
  });
  assert.equal(r.status, 422);
  assert.equal(store.userByEmail('noterms@example.com'), undefined);
  const ok = await registeredOwner('terms@example.com');
  assert.ok(ok);
  assert.ok(store.userByEmail('terms@example.com').terms_accepted_at);
});

test('landing, privacy and terms pages are public', async () => {
  const anon = client();
  const landing = await anon.req('/');
  assert.equal(landing.status, 200);
  assert.match(landing.text, /מערכת לניהול ביקורות ושביעות רצון/);
  assert.match(landing.text, /id="pricing"/);
  assert.match((await anon.req('/privacy')).text, /מדיניות פרטיות/);
  assert.match((await anon.req('/terms')).text, /תנאי שימוש/);
  // Logged-in users skip the landing page.
  const owner = await registeredOwner('landing@example.com');
  assert.equal((await owner.req('/')).location, '/admin');
  // The survey links to the privacy policy.
  const campaign = await createCampaign(owner);
  assert.match((await anon.req(`/r/${campaign.slug}`)).text, /href="\/privacy"/);
});

test('logo upload accepts real images only', async () => {
  const owner = await registeredOwner('logo@example.com');
  const campaign = await createCampaign(owner);
  const csrf = await csrfOf(owner);
  const upload = (bytes, name) => {
    const fd = new FormData();
    fd.append('logo', new Blob([bytes]), name);
    return owner.req(`/admin/business/logo?_csrf=${encodeURIComponent(csrf)}`, { method: 'POST', multipart: fd });
  };
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  // CSRF is enforced on multipart too.
  const fd = new FormData();
  fd.append('logo', new Blob([png]), 'a.png');
  assert.equal((await owner.req('/admin/business/logo', { method: 'POST', multipart: fd })).status, 403);

  // An SVG (or anything that is not a real image) is refused, whatever its name.
  const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.png');
  assert.match(svg.location, /err=/);
  assert.equal(store.logoOf(campaign.business_id), null);

  const big = await upload(Buffer.concat([png, Buffer.alloc(1024 * 1024 + 1)]), 'big.png');
  assert.match(big.location, /err=/);

  const ok = await upload(png, 'logo.png');
  assert.match(ok.location, /ok=1/);
  const biz = store.businessById(campaign.business_id);
  assert.ok(biz.logo_version);
  const img = await client().req(`/logo/${biz.id}?v=${biz.logo_version}`);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('content-security-policy'), /sandbox/);
  // Shown on the customer survey.
  assert.match((await client().req(`/r/${campaign.slug}`)).text, new RegExp(`/logo/${biz.id}\\?v=`));

  await owner.req('/admin/business/logo/delete', { method: 'POST', form: { _csrf: csrf } });
  assert.equal(store.logoOf(biz.id), null);
});

test('owner can delete a response and its customer data', async () => {
  const owner = await registeredOwner('gdpr@example.com');
  const campaign = await createCampaign(owner);
  const r = await completeSurvey(campaign.slug, 2, { comment: 'delete me', phone: '0501111111' });
  const del = await owner.req(`/admin/responses/${r.id}/delete`, { method: 'POST', form: { _csrf: await csrfOf(owner) } });
  assert.equal(del.status, 303);
  assert.equal(store.responseByToken(r.token), null);
});

test('backups: consistent copy, rotation keeps the newest', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { backupDb } = await import('../src/backup.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, `reviews-20200101000${i}.db`), 'old');
  const { file, removed } = backupDb(store.db, { dir, keep: 2 });
  assert.equal(removed, 2);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['reviews-202001010002.db', path.basename(file)].sort());
  const { DatabaseSync } = await import('node:sqlite');
  const copy = new DatabaseSync(file);
  assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0);
  copy.close();
  fs.rmSync(dir, { recursive: true });
});

test('two-factor authentication', async () => {
  const { codeAt, currentStep } = await import('../src/totp.js');
  const owner = await registeredOwner('2fa@example.com');
  const csrf = await csrfOf(owner);
  await owner.req('/account/2fa/setup', { method: 'POST', form: { _csrf: csrf } });
  const setup = await owner.req('/account/2fa');
  assert.match(setup.text, /data:image\/png;base64/);
  const { totp_secret: secret } = store.userByEmail('2fa@example.com');

  const wrong = await owner.req('/account/2fa/enable', { method: 'POST', form: { _csrf: csrf, code: '000000' } });
  assert.equal(wrong.status, 422);
  const enabled = await owner.req('/account/2fa/enable', {
    method: 'POST',
    form: { _csrf: csrf, code: codeAt(secret, currentStep()) },
  });
  const backups = [...enabled.text.matchAll(/>([a-z2-9]{4}-[a-z2-9]{4})</g)].map((m) => m[1]);
  assert.equal(backups.length, 10);

  // Password alone no longer opens a session.
  const c = client();
  const step1 = await c.req('/login', { method: 'POST', form: { email: '2fa@example.com', password: 'password123' } });
  assert.equal(step1.location, '/login/2fa');
  assert.equal((await c.req('/admin')).location, '/login');
  assert.equal((await c.req('/login/2fa', { method: 'POST', form: { code: '123456' } })).status, 401);
  // The code used to enable 2FA can't be replayed; the next step's code works.
  const next = await c.req('/login/2fa', { method: 'POST', form: { code: codeAt(secret, currentStep() + 1) } });
  assert.equal(next.location, '/admin');
  assert.equal((await c.req('/admin')).status, 200);

  // A backup code works once.
  const c2 = client();
  await c2.req('/login', { method: 'POST', form: { email: '2fa@example.com', password: 'password123' } });
  assert.equal((await c2.req('/login/2fa', { method: 'POST', form: { code: backups[0] } })).location, '/admin');
  const c3 = client();
  await c3.req('/login', { method: 'POST', form: { email: '2fa@example.com', password: 'password123' } });
  assert.equal((await c3.req('/login/2fa', { method: 'POST', form: { code: backups[0] } })).status, 401);

  // Turning it off needs the password and a code.
  const off = await owner.req('/account/2fa/disable', {
    method: 'POST',
    form: { _csrf: csrf, password: 'password123', code: backups[1] },
  });
  assert.equal(off.location, '/account?ok=1');
  assert.equal(store.userByEmail('2fa@example.com').totp_enabled, 0);
});

test('campaign templates and survey languages', async () => {
  const owner = await registeredOwner('templates@example.com');
  const picker = await owner.req('/admin/campaigns/new');
  assert.match(picker.text, /מסעדה ובית קפה/);
  const form = await owner.req('/admin/campaigns/new?template=restaurant&lang=ar');
  assert.match(form.text, /ما الذي أعجبك أكثر؟/);
  assert.match(form.text, /الطعام/);

  const campaign = await createCampaign(owner, { lang: 'ar' });
  const page = await client().req(`/r/${campaign.slug}`);
  assert.match(page.text, /<html lang="ar" dir="rtl">/);
  assert.match(page.text, /كيف كانت تجربتك؟/);
  assert.match(page.text, /سياسة الخصوصية/);

  store.db.prepare("UPDATE campaigns SET lang = 'ru' WHERE id = ?").run(campaign.id);
  const ru = await client().req(`/r/${campaign.slug}`);
  assert.match(ru.text, /<html lang="ru" dir="ltr">/);
  assert.match(ru.text, /Как вам у нас\?/);
});

test('onboarding checklist tracks real progress', async () => {
  const owner = await registeredOwner('onboard@example.com');
  let dash = await owner.req('/admin');
  assert.match(dash.text, /צעדים ראשונים/);
  assert.match(dash.text, /0 מתוך 5/);

  const campaign = await createCampaign(owner);
  await owner.req(`/admin/campaigns/${campaign.id}/poster`);
  await completeSurvey(campaign.slug, 5, {});
  dash = await owner.req('/admin');
  assert.match(dash.text, /4 מתוך 5/, 'campaign, google link, poster and test response are done; logo is not');

  await owner.req('/admin/onboarding/dismiss', { method: 'POST', form: { _csrf: await csrfOf(owner) } });
  dash = await owner.req('/admin');
  assert.doesNotMatch(dash.text, /צעדים ראשונים/);
});

test('closing the loop with unhappy customers', async () => {
  const owner = await registeredOwner('loop@example.com');
  const campaign = await createCampaign(owner);
  const resolve = async (r) =>
    owner.req(`/admin/responses/${r.id}`, { method: 'POST', form: { _csrf: await csrfOf(owner), status: 'resolved', notes: 'called' } });

  // With an email: the question goes out automatically.
  const a = await completeSurvey(campaign.slug, 1, { comment: 'cold soup', email: 'dana@example.com', customer_name: 'Dana' });
  await resolve(a);
  const mail = outbox('followup').find((m) => m.to_addr === 'dana@example.com');
  assert.ok(mail, 'follow-up email sent');
  const link = mail.body.match(/\/c\/[\w-]+/)[0];
  const page = await client().req(link);
  assert.match(page.text, /האם הטיפול בפנייה שלך עזר\?/);

  const no = await client().req(link, { method: 'POST', form: { answer: 'no' } });
  assert.match(no.text, /מצטערים לשמוע/);
  const reopened = store.responseForBusiness(a.id, campaign.business_id);
  assert.equal(reopened.status, 'in_progress');
  assert.equal(reopened.recovered, 0);
  assert.match(reopened.notes, /נפתחה מחדש/);
  assert.ok(outbox('followup_no').some((m) => m.to_addr === 'loop@example.com'));
  // Answering again changes nothing.
  const again = await client().req(link, { method: 'POST', form: { answer: 'yes' } });
  assert.match(again.text, /כבר ענית/);
  assert.equal(store.responseForBusiness(a.id, campaign.business_id).recovered, 0);

  // Phone only: the ticket offers the link to send on WhatsApp.
  const b = await completeSurvey(campaign.slug, 2, { comment: 'slow', phone: '0507654321' });
  await resolve(b);
  const detail = await owner.req(`/admin/responses/${b.id}`);
  assert.match(detail.text, /שאלת המשך ללקוח/);
  const bLink = store.responseForBusiness(b.id, campaign.business_id).followup_token;
  const yes = await client().req(`/c/${bLink}`, { method: 'POST', form: { answer: 'yes' } });
  assert.match(yes.text, /שמחים שהסתדר/);
  assert.match(yes.text, /\/go\/[^"]+\/google/, 'public review links stay available');

  const stats = store.stats(campaign.business_id, { campaignId: campaign.id });
  assert.equal(stats.recoveredYes, 1);
  assert.equal(stats.recoveredAnswered, 2);
});

test('public API: automatic survey requests', async () => {
  const owner = await registeredOwner('api@example.com');
  const campaign = await createCampaign(owner);
  const api = (path, { method = 'GET', key, body, raw } = {}) =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), 'content-type': 'application/json' },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    }).then(async (r) => ({ status: r.status, json: await r.json() }));

  store.updateBusiness(campaign.business_id, { plan: 'pro' });
  const created = await owner.req('/admin/integrations/keys', { method: 'POST', form: { _csrf: await csrfOf(owner), name: 'POS' } });
  const key = decodeURIComponent(created.location.match(/key=([^&]+)/)[1]);
  assert.match(key, /^rk_/);
  store.updateBusiness(campaign.business_id, { plan: 'basic', billing: 'paused' });
  assert.equal((await api('/ping', { key })).status, 402);
  store.updateBusiness(campaign.business_id, { plan: 'basic', billing: 'active' });
  assert.equal((await api('/ping', { key })).status, 200, 'every plan includes the API');

  assert.equal((await api('/ping', { key: 'rk_wrong' })).status, 401);
  assert.equal((await api('/ping', { key })).json.business.name, 'Test Cafe');
  assert.equal((await api('/invites', { method: 'POST', key, raw: '{not json' })).status, 400);
  assert.equal((await api('/invites', { method: 'POST', key, body: { name: 'x' } })).status, 422);

  const now = await api('/invites', { method: 'POST', key, body: { campaign: campaign.slug, name: 'Avi', email: 'avi@example.com' } });
  assert.equal(now.status, 201);
  assert.equal(now.json.status, 'sent');
  assert.match(now.json.invite.link, new RegExp(`/r/${campaign.slug}\\?i=`));
  assert.ok(outbox('customer_invite').some((m) => m.to_addr === 'avi@example.com'));

  const dup = await api('/invites', { method: 'POST', key, body: { campaign: campaign.slug, email: 'avi@example.com' } });
  assert.equal(dup.json.status, 'skipped');

  const phoneOnly = await api('/invites', { method: 'POST', key, body: { phone: '0501112233' } });
  assert.equal(phoneOnly.json.status, 'created', 'no email: the caller gets the link to send');

  const later = await api('/invites', { method: 'POST', key, body: { email: 'later@example.com', delay_minutes: 120 } });
  assert.equal(later.json.status, 'scheduled');
  const { jobs } = createApp(store.db, { ai: null, backups: false });
  await jobs.scheduledInvites();
  assert.ok(!outbox('customer_invite').some((m) => m.to_addr === 'later@example.com'), 'not before its time');
  store.db.prepare("UPDATE invites SET send_at = datetime('now', '-1 minute') WHERE email = 'later@example.com'").run();
  await jobs.scheduledInvites();
  await jobs.scheduledInvites();
  assert.equal(outbox('customer_invite').filter((m) => m.to_addr === 'later@example.com').length, 1);

  // Revoked keys stop working.
  const [k] = store.apiKeysFor(campaign.business_id);
  await owner.req(`/admin/integrations/keys/${k.id}/revoke`, { method: 'POST', form: { _csrf: await csrfOf(owner) } });
  assert.equal((await api('/ping', { key })).status, 401);
});

test('AI topic tagging', async () => {
  const owner = await registeredOwner('tags@example.com');
  const campaign = await createCampaign(owner);
  const free = await completeSurvey(campaign.slug, 2, { comment: 'slow service before upgrade' });
  store.updateBusiness(campaign.business_id, { plan: 'pro' });
  const a = await completeSurvey(campaign.slug, 1, { comment: 'we had to wait an hour' });
  const b = await completeSurvey(campaign.slug, 5, { comment: 'lovely staff' });
  const { jobs } = createApp(store.db, { ai: fakeAi, backups: false });
  // Everything pending across businesses gets tagged in small batches.
  while ((await jobs.aiTagging()) > 0);
  assert.deepEqual(JSON.parse(store.responseByToken(a.token).tags), ['זמן המתנה']);
  assert.deepEqual(JSON.parse(store.responseByToken(b.token).tags), ['שירות']);
  assert.ok(store.responseByToken(free.token).tagged_at, 'plan checked at tagging time');

  const filtered = await owner.req(`/admin/responses?tag=${encodeURIComponent('זמן המתנה')}`);
  assert.match(filtered.text, /wait an hour/);
  assert.doesNotMatch(filtered.text, /lovely staff/);
  const dash = await owner.req('/admin');
  assert.match(dash.text, /נושאים חוזרים/);
});

test('installable app and push notifications', async () => {
  const anon = client();
  const manifest = JSON.parse((await anon.req('/manifest.webmanifest')).text);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.length, 2);
  const sw = await anon.req('/sw.js');
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.match(sw.text, /showNotification/);

  const owner = await registeredOwner('push@example.com');
  const campaign = await createCampaign(owner);
  const key = JSON.parse((await owner.req('/push/key')).text).key;
  assert.ok(key.length > 40);
  const bad = await owner.req('/push/subscribe', { method: 'POST', form: { _csrf: await csrfOf(owner), endpoint: 'http://insecure', p256dh: 'x', auth: 'y' } });
  assert.equal(bad.status, 422);
  const sub = { endpoint: 'https://push.example.com/send/abc123', p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
  const ok = await owner.req('/push/subscribe', { method: 'POST', form: { _csrf: await csrfOf(owner), ...sub } });
  assert.equal(ok.status, 200);

  const sent = [];
  let fail = null;
  const fakeWebpush = {
    generateVAPIDKeys: () => ({ publicKey: 'pub', privateKey: 'priv' }),
    setVapidDetails() {},
    async sendNotification(target, body) {
      if (fail) throw fail;
      sent.push({ endpoint: target.endpoint, payload: JSON.parse(body) });
    },
  };
  const { notifier } = createApp(store.db, { ai: null, backups: false, webpush: fakeWebpush });
  const business = store.businessById(campaign.business_id);
  const push = () =>
    notifier.feedbackCompleted({
      business,
      campaign,
      response: { id: 1, rating: 1, sentiment: 'negative', source: '' },
      data: { answers: {}, comment: 'cold food', customer_name: '', phone: '', email: '' },
      questions: [],
    });
  await push();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, sub.endpoint);
  assert.match(sent[0].payload.title, /לקוח לא מרוצה/);
  assert.equal(sent[0].payload.body, 'cold food');

  // An expired subscription is forgotten.
  fail = Object.assign(new Error('gone'), { statusCode: 410 });
  await push();
  assert.equal(store.pushSubscriptionsForBusiness(business.id).length, 0);
});

test('agencies with white-label branding', async () => {
  const root = await registeredOwner('root@example.com');
  store.setSuperadmin(store.userByEmail('root@example.com').id, true);
  const agencyUser = await registeredOwner('agency@example.com');
  const outsider = await registeredOwner('outsider@example.com');
  assert.equal((await agencyUser.req('/agency')).status, 404);

  await root.req('/superadmin/agencies', { method: 'POST', form: { _csrf: await csrfOf(root), name: 'Stars Agency', email: 'agency@example.com' } });
  const agency = store.agenciesForUser(store.userByEmail('agency@example.com').id)[0];
  assert.equal(agency.name, 'Stars Agency');
  assert.equal((await outsider.req('/agency')).status, 404);
  assert.match((await agencyUser.req('/admin')).text, /href="\/agency"/, 'agency link in the menu');

  const created = await agencyUser.req(`/agency/${agency.id}/clients`, {
    method: 'POST',
    form: { _csrf: await csrfOf(agencyUser), name: 'Client Bakery', owner_email: 'baker@example.com' },
  });
  assert.match(created.location, /link=/);
  const client1 = store.agencyClients(agency.id)[0];
  assert.equal(client1.name, 'Client Bakery');
  assert.equal(client1.plan, 'pro');
  assert.ok(outbox('team_invite').some((m) => m.to_addr === 'baker@example.com'));

  await agencyUser.req(`/agency/${agency.id}/branding`, {
    method: 'POST',
    form: { _csrf: await csrfOf(agencyUser), brand_name: 'Rev Agency', brand_color: '#e0452b', logo_url: '' },
  });
  const enter = await agencyUser.req(`/agency/${agency.id}/enter/${client1.id}`, { method: 'POST', form: { _csrf: await csrfOf(agencyUser) } });
  assert.equal(enter.location, '/admin');
  const dash = await agencyUser.req('/admin');
  assert.match(dash.text, /Client Bakery/);
  assert.match(dash.text, /Rev Agency/, 'client screens carry the agency brand');
  assert.match(dash.text, /--purple:#e0452b/);

  // Outsiders can't enter someone else's client.
  assert.equal((await outsider.req(`/agency/${agency.id}/enter/${client1.id}`, { method: 'POST', form: { _csrf: await csrfOf(outsider) } })).status, 404);

  // Client limit.
  await root.req(`/superadmin/agencies/${agency.id}`, {
    method: 'POST',
    form: { _csrf: await csrfOf(root), custom_domain: 'reviews.agency.test', max_clients: '1', default_plan: 'pro' },
  });
  const over = await agencyUser.req(`/agency/${agency.id}/clients`, { method: 'POST', form: { _csrf: await csrfOf(agencyUser), name: 'Second' } });
  assert.match(decodeURIComponent(over.location), /הגעתם למספר הלקוחות/);

  // The agency's own domain shows its brand and skips the platform landing page.
  const http = await import('node:http');
  const viaHost = (path) =>
    new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: server.address().port, path, headers: { host: 'reviews.agency.test' } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
      });
    });
  assert.equal((await viaHost('/')).location, '/login');
  const login = await viaHost('/login');
  assert.match(login.body, /Rev Agency/);
  assert.doesNotMatch(login.body, /GoFive/);

  // HTTPS certificates are issued on demand only for agency domains.
  const check = async (d) => (await client().req(`/.well-known/tls-check?domain=${d}`)).status;
  assert.equal(await check('reviews.agency.test'), 200);
  assert.equal(await check('REVIEWS.agency.test'), 200);
  assert.equal(await check('evil.example'), 404);
  assert.equal(await check(''), 404);
});

test('staff and branch leaderboard', async () => {
  const owner = await registeredOwner('leader@example.com');
  const campaign = await createCampaign(owner, { ask_staff: '1' });
  const bizId = campaign.business_id;
  const csrf = await csrfOf(owner);
  for (const name of ['Dana', 'Yossi', '<b>Eve</b>']) {
    await owner.req('/admin/staff', { method: 'POST', form: { _csrf: csrf, name } });
  }
  const byName = Object.fromEntries(store.staffFor(bizId).map((s) => [s.name, s]));
  const { Dana: dana, Yossi: yossi } = byName;
  const eve = byName['<b>Eve</b>'];
  assert.ok(dana && yossi && eve);

  // The staff page escapes names and offers a personal link + QR per employee.
  const page = await owner.req('/admin/staff');
  assert.ok(!page.text.includes('<b>Eve</b>'));
  assert.match(page.text, new RegExp(`/r/${campaign.slug}\\?e=${dana.code}`));
  const qr = await owner.req(`/admin/campaigns/${campaign.id}/qr.svg?e=${dana.code}`);
  assert.equal(qr.status, 200);

  // Personal link: the rating counts for Dana, and the question is not asked.
  const viaLink = async (code, rating) => {
    const customer = client();
    const scan = await customer.req(`/r/${campaign.slug}?e=${code}`);
    assert.match(scan.text, new RegExp(`name="e" value="${code}"`));
    const rate = await customer.req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: String(rating), e: code } });
    const q = await customer.req(rate.location);
    assert.doesNotMatch(q.text, /מי נתן לך שירות/);
    await customer.req(rate.location, { method: 'POST', form: {} });
  };
  for (const r of [5, 5, 4]) await viaLink(dana.code, r);

  // No link: the customer picks who served them.
  const customer = client();
  const rate = await customer.req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '5' } });
  const q = await customer.req(rate.location);
  assert.match(q.text, /מי נתן לך שירות/);
  assert.ok(!q.text.includes('<b>Eve</b>'));
  await customer.req(rate.location, { method: 'POST', form: { staff: String(yossi.id) } });
  // A staff id from another business is ignored.
  const other = await completeSurvey(campaign.slug, 2, { staff: '999999' });
  assert.equal(other.staff_id, null);
  // A fake code is ignored as well.
  const fake = await client().req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '1', e: 'nope' } });
  assert.equal(store.responseByToken(fake.location.split('/').pop()).staff_id, null);

  const board = store.leaderboard(bizId, { days: 30 });
  const top = board.staff[0];
  assert.equal(top.name, 'Dana');
  assert.equal(top.responses, 3);
  assert.ok(top.ranked);
  assert.equal(board.staff.find((s) => s.name === 'Yossi').ranked, false, 'one rating is not enough for a place');
  assert.equal(board.unassigned, 2);
  assert.equal(board.branches[0].responses, 6);

  const html = await owner.req('/admin/leaderboard');
  assert.equal(html.status, 200);
  assert.match(html.text, /דירוג עובדים וסניפים/);
  assert.match(html.text, /Dana/);
  const filtered = await owner.req(`/admin/responses?staff=${dana.id}`);
  assert.equal((filtered.text.match(/href="\/admin\/responses\/\d+"/g) || []).length, 3);

  // Deactivated staff stop collecting ratings through their link.
  await owner.req(`/admin/staff/${dana.id}`, { method: 'POST', form: { _csrf: csrf, name: 'Dana', active: '0' } });
  const late = await client().req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '5', e: dana.code } });
  assert.equal(store.responseByToken(late.location.split('/').pop()).staff_id, null);

  // Deleting keeps the ratings, without the employee.
  await owner.req(`/admin/staff/${yossi.id}/delete`, { method: 'POST', form: { _csrf: csrf } });
  assert.equal(store.staffMember(yossi.id, bizId), null);
  assert.equal(store.leaderboard(bizId).branches[0].responses, 7);

  // Other businesses cannot touch these employees.
  const stranger = await registeredOwner('stranger-staff@example.com');
  const r = await stranger.req(`/admin/staff/${eve.id}/delete`, { method: 'POST', form: { _csrf: await csrfOf(stranger) } });
  assert.equal(r.status, 404);
  assert.ok(store.staffMember(eve.id, bizId));
});

test('every admin screen renders for an owner', async () => {
  const owner = await registeredOwner('screens@example.com');
  const campaign = await createCampaign(owner);
  const pages = [
    '/admin', '/admin/responses', '/admin/campaigns', '/admin/campaigns/new', '/admin/campaigns/new?template=clinic&lang=ar',
    `/admin/campaigns/${campaign.id}`, `/admin/campaigns/${campaign.id}/share`, `/admin/campaigns/${campaign.id}/poster`,
    '/admin/leaderboard', '/admin/staff', '/admin/insights', '/admin/widget', '/admin/team', '/admin/integrations',
    '/admin/business', '/admin/plan', '/account',
  ];
  for (const p of pages) {
    const r = await owner.req(p);
    assert.ok([200, 403].includes(r.status), `${p} -> ${r.status}`);
    assert.doesNotMatch(r.text, /undefined|NaN|\[object Object\]/, `${p} has a rendering leak`);
  }
  const missing = await owner.req('/admin/nope');
  assert.equal(missing.status, 404);
  assert.match(missing.text, /לדף הראשי/);
});

test('trial, plan request and activation', async () => {
  const owner = await registeredOwner('trial@example.com');
  const biz = () => bizOf('trial@example.com');
  assert.equal(biz().billing, 'trial');
  assert.equal(biz().plan, 'pro', 'the trial opens every feature');

  const dash = await owner.req('/admin');
  assert.match(dash.text, /תקופת ניסיון: עוד 7 ימים/);
  const campaign = await createCampaign(owner);
  assert.equal((await client().req(`/r/${campaign.slug}`)).status, 200);

  // The day before the end: one reminder, then silence.
  store.updateBusiness(biz().id, { trial_ends_at: new Date(Date.now() + 12 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') });
  const { jobs } = createApp(store.db, { ai: null, backups: false });
  await jobs.trialNotices();
  await jobs.trialNotices();
  assert.equal(outbox('trial_ending').filter((m) => m.to_addr === 'trial@example.com').length, 1);

  // Trial over: surveys, API and widget stop; the data stays visible.
  store.updateBusiness(biz().id, { trial_ends_at: '2000-01-01 00:00:00' });
  await jobs.trialNotices();
  assert.equal(outbox('trial_ended').filter((m) => m.to_addr === 'trial@example.com').length, 1);
  const scan = await client().req(`/r/${campaign.slug}`);
  assert.match(scan.text, /לא פעיל כרגע/);
  const rate = await client().req(`/r/${campaign.slug}/rate`, { method: 'POST', form: { rating: '5' } });
  assert.equal(rate.location, `/r/${campaign.slug}`, 'no rating is recorded');
  assert.match((await owner.req('/admin')).text, /תקופת הניסיון הסתיימה/);

  // The owner asks for a plan; admins are told.
  const req = await owner.req('/admin/plan/request', { method: 'POST', form: { _csrf: await csrfOf(owner), plan: 'business', cycle: 'annual' } });
  assert.equal(req.location, '/admin/plan?requested=1');
  const page = await owner.req(req.location);
  assert.match(page.text, /ביקשת את מסלול <b>עסקי<\/b> \(שנתי\)/);
  assert.match(page.text, /₪3,990/);
  assert.match(page.text, /₪159/);

  // A system admin sees the request and activates it.
  const root = await registeredOwner('billing-admin@example.com');
  store.setSuperadmin(store.userByEmail('billing-admin@example.com').id, true);
  assert.match((await root.req('/superadmin')).text, /ביקש: עסקי שנתי/);
  await root.req(`/superadmin/businesses/${biz().id}/plan`, {
    method: 'POST',
    form: { _csrf: await csrfOf(root), plan: 'business', cycle: 'annual', do: 'activate' },
  });
  assert.equal(biz().billing, 'active');
  assert.equal(biz().plan, 'business');
  assert.equal(biz().plan_request, null);
  assert.equal((await client().req(`/r/${campaign.slug}`)).status, 200);
  assert.doesNotMatch((await client().req(`/r/${campaign.slug}`)).text, /לא פעיל כרגע/);

  // Extending a trial and pausing work from the same form.
  await root.req(`/superadmin/businesses/${biz().id}/plan`, { method: 'POST', form: { _csrf: await csrfOf(root), do: 'pause' } });
  assert.match((await client().req(`/r/${campaign.slug}`)).text, /לא פעיל כרגע/);
  await root.req(`/superadmin/businesses/${biz().id}/plan`, { method: 'POST', form: { _csrf: await csrfOf(root), do: 'extend' } });
  assert.equal(biz().billing, 'trial');
  assert.doesNotMatch((await client().req(`/r/${campaign.slug}`)).text, /לא פעיל כרגע/);

  // An unknown plan is ignored.
  const bad = await owner.req('/admin/plan/request', { method: 'POST', form: { _csrf: await csrfOf(owner), plan: 'nope' } });
  assert.equal(bad.location, '/admin/plan');
});

test('quote requests from agencies and large chains', async () => {
  const home = await client().req('/');
  assert.match(home.text, /רשת עם יותר מ-10 סניפים/);
  assert.doesNotMatch(home.text, /₪79 /);
  assert.doesNotMatch(home.text, /לכל עסק שאתם מנהלים/);

  const missing = await client().req('/contact', { method: 'POST', form: { name: 'Avi', kind: 'chain' } });
  assert.equal(missing.status, 422);
  assert.match(missing.text, /טלפון או אימייל/);

  const before = store.recentLeads().length;
  const bot = await client().req('/contact', { method: 'POST', form: { name: 'Bot', phone: '1', website: 'spam.example' } });
  assert.equal(bot.location, '/?sent=1#contact');
  assert.equal(store.recentLeads().length, before, 'honeypot submissions are dropped');

  const ok = await client().req('/contact', {
    method: 'POST',
    form: { name: 'דנה', phone: '050-1234567', company: 'רשת הקפה', kind: 'chain', size: '24', message: '<b>hi</b>' },
  });
  assert.equal(ok.location, '/?sent=1#contact');
  const lead = store.recentLeads()[0];
  assert.equal(lead.kind, 'chain');
  assert.equal(lead.size, '24');
  assert.match((await client().req(ok.location)).text, /קיבלנו את הפרטים/);

  const admin = await registeredOwner('leads-admin@example.com');
  store.setSuperadmin(store.userByEmail('leads-admin@example.com').id, true);
  const panel = await admin.req('/superadmin');
  assert.match(panel.text, /רשת הקפה/);
  assert.ok(!panel.text.includes('<b>hi</b>'));
  await admin.req(`/superadmin/leads/${lead.id}`, { method: 'POST', form: { _csrf: await csrfOf(admin), handled: '1' } });
  assert.ok(store.recentLeads().find((l) => l.id === lead.id).handled_at);

  // A business asks for a chain quote from its plan page; the chain plan is off the price list.
  const plan = await admin.req('/admin/plan');
  assert.doesNotMatch(plan.text, /בחירה ברשת/);
  await admin.req('/admin/plan/request', { method: 'POST', form: { _csrf: await csrfOf(admin), plan: 'enterprise' } });
  assert.match((await admin.req('/admin/plan')).text, /ביקשת הצעת מחיר לרשת/);
  assert.ok(outbox('plan_request').some((m) => m.to_addr.includes('leads-admin@example.com')));
});

test('the system admin is not treated like a trial customer', async () => {
  const c = await registeredOwner('sysadmin@example.com');
  const boss = store.userByEmail('sysadmin@example.com');
  assert.equal(bizOf('sysadmin@example.com').billing, 'trial', 'a regular signup starts on a trial');
  store.setSuperadmin(boss.id, true);

  // Their own business is switched to active on the next visit.
  const dash = await c.req('/admin');
  assert.doesNotMatch(dash.text, /תקופת ניסיון/);
  assert.match(dash.text, /מנהל מערכת/);
  assert.equal(bizOf('sysadmin@example.com').billing, 'active');

  // Logging in lands on the system panel.
  const fresh = client();
  const login = await fresh.req('/login', { method: 'POST', form: { email: 'sysadmin@example.com', password: 'password123' } });
  assert.equal(login.location, '/superadmin');
  const plain = client();
  await registeredOwner('plain-owner@example.com');
  const r = await plain.req('/login', { method: 'POST', form: { email: 'plain-owner@example.com', password: 'password123' } });
  assert.equal(r.location, '/admin');
});

test('poster designer: choose a look, save it, it comes back', async () => {
  const owner = await registeredOwner('poster@example.com');
  const campaign = await createCampaign(owner);
  const page = await owner.req(`/admin/campaigns/${campaign.id}/poster`);
  assert.equal(page.status, 200);
  assert.match(page.text, /עיצוב שלט QR/);
  assert.match(page.text, /class="poster-sheet style-classic size-a4"/);
  assert.match(page.text, /@page \{ size: 210mm 297mm/);
  assert.match(page.text, /<svg[^>]*>/, 'the QR code is inline');
  assert.match(page.text, /vendor\/html-to-image\.js\?v=/);

  const saved = await owner.req(`/admin/campaigns/${campaign.id}/poster`, {
    method: 'POST',
    form: {
      _csrf: await csrfOf(owner), size: 'a6', style: 'dark', color: '#0f7a4a', accent: 'red;}</style>',
      title: 'דרגו אותנו!', subtitle: '', badge: 'סרקו', footer: 'תודה שבאתם', showLogo: '1', showStars: '1', src: 'table4',
    },
  });
  assert.equal(saved.location, `/admin/campaigns/${campaign.id}/poster?saved=1&src=table4`);
  const again = await owner.req(saved.location);
  assert.match(again.text, /class="poster-sheet style-dark size-a6"/);
  assert.match(again.text, /--c:#0f7a4a/);
  assert.match(again.text, /--a:#ffd23f/, 'a bad color falls back to the default');
  assert.match(again.text, /דרגו אותנו!/);
  assert.match(again.text, /תודה שבאתם/);
  assert.match(again.text, /@page \{ size: 105mm 148mm/);
  assert.match(again.text, /class="ps-steps" data-show="showSteps" hidden/, 'unticked parts stay hidden');
  assert.match(again.text, /העיצוב נשמר/);

  const lib = await fetch(`${base}/static/vendor/html-to-image.js`);
  assert.equal(lib.status, 200);
});

test('quick WhatsApp send from the dashboard', async () => {
  const owner = await registeredOwner('wa-send@example.com');
  const campaign = await createCampaign(owner);
  const dash = await owner.req('/admin');
  assert.match(dash.text, /שליחה בוואטסאפ/);
  assert.match(dash.text, /<dialog id="wa-send"/);
  const csp = (await fetch(`${base}/admin`)).headers.get('content-security-policy');
  assert.match(csp, /form-action [^;]*https:\/\/wa\.me/, 'the browser may follow the redirect to WhatsApp');
  const token = await csrfOf(owner);
  const sent = await owner.req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '050-123 4567', customer_name: 'דנה', campaign: String(campaign.id) } });
  assert.equal(sent.status, 303);
  const wa = new URL(sent.location);
  assert.equal(wa.host, 'wa.me');
  assert.equal(wa.pathname, '/972501234567');
  const text = wa.searchParams.get('text');
  assert.match(text, /^היי דנה! תודה שבחרת ב/);
  const t = text.match(/\/r\/[\w-]+\?i=([\w-]+)/)[1];
  assert.ok(store.inviteByToken(campaign.id, t), 'a personal invite was created, so the answer is linked to the customer');
  const bad = await owner.req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '12' } });
  assert.equal(bad.location, '/admin?send=bad');
  assert.match((await owner.req(bad.location)).text, /מספר הטלפון לא נראה תקין/);
});

test('WhatsApp wording: the business writes its own, and can tweak one message', async () => {
  const owner = await registeredOwner('wa-wording@example.com');
  const campaign = await createCampaign(owner);
  const token = await csrfOf(owner);
  // The designer is one click away: menu, campaign list and first steps.
  assert.match((await owner.req('/admin')).text, /href="\/admin\/poster"/);
  assert.equal((await owner.req('/admin/poster')).location, `/admin/campaigns/${campaign.id}/poster`);
  assert.match((await owner.req('/admin/campaigns')).text, new RegExp(`/admin/campaigns/${campaign.id}/poster`));

  const settings = await owner.req('/admin/business');
  assert.match(settings.text, /נוסח ההודעה בוואטסאפ/);
  await owner.req('/admin/business/invite-message', { method: 'POST', form: { _csrf: token, invite_template: 'שלום {שם} 🙂 איך היה אצלנו ב{עסק}? נשמח לדירוג' } });
  const sent = await owner.req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0521234567', customer_name: 'רון', campaign: String(campaign.id) } });
  const text = new URL(sent.location).searchParams.get('text');
  assert.match(text, /^שלום רון 🙂 איך היה אצלנו ב.+\? נשמח לדירוג https?:\/\/[^ ]+\/r\/[\w-]+\?i=[\w-]+$/, 'the link is added when the wording left it out');

  // Without a name the greeting stays tidy.
  const noName = new URL((await owner.req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0521234567' } })).location).searchParams.get('text');
  assert.match(noName, /^שלום 🙂/);

  // A one-off edit in the send window wins for that message only.
  const once = new URL((await owner.req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0521234567', message: 'מבצע! {קישור}' } })).location).searchParams.get('text');
  assert.match(once, /^מבצע! https?:/);

  // Back to the original wording.
  await owner.req('/admin/business/invite-message', { method: 'POST', form: { _csrf: token, reset: '1' } });
  const reset = new URL((await owner.req('/admin/send', { method: 'POST', form: { _csrf: token, phone: '0521234567' } })).location).searchParams.get('text');
  assert.match(reset, /^היי! תודה שבחרת ב/);
});

test('the owner renames the business from the account page', async () => {
  const { openDb } = await import('../src/db.js');
  const { createApp } = await import('../src/app.js');
  const app = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google: null, serp: null, ai: null, answerEngines: {}, cardcom: null, whatsapp: null });
  const srv = app.app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const jar = {};
  const call = async (path, form) => {
    const res = await fetch(url + path, {
      method: form ? 'POST' : 'GET',
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
  try {
    await call('/register', { name: 'גל', email: 'rename@example.com', password: 'password123', business: 'העסק שלי', terms: '1' });
    const page = await call('/account');
    assert.match(page.text, /id="businesses"/);
    const token = page.text.match(/name="_csrf" value="([^"]+)"/)[1];
    const biz = app.store.businessesFor(app.store.userByEmail('rename@example.com').id)[0];
    const r = await call(`/account/business/${biz.id}/name`, { _csrf: token, name: 'ג׳קו סטריט' });
    assert.equal(r.location, '/account?ok=1#businesses');
    assert.equal(app.store.businessById(biz.id).name, 'ג׳קו סטריט');
    assert.match((await call('/admin')).text, /<a href="\/account#businesses" title="שינוי שם העסק" class="biz-card">/);
    // Someone else's business can't be renamed.
    const other = app.store.createBusiness(app.store.userByEmail('rename@example.com').id, { name: 'אחר' });
    app.store.db.prepare('DELETE FROM memberships WHERE business_id = ?').run(other);
    await call(`/account/business/${other}/name`, { _csrf: token, name: 'נפרץ' });
    assert.equal(app.store.businessById(other).name, 'אחר');
  } finally {
    srv.close();
  }
});
