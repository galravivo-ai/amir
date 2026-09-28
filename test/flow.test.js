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

test('plan limits: free plan has one campaign and no AI', async () => {
  const owner = await registeredOwner('free@example.com');
  await createCampaign(owner);
  const second = await owner.req('/admin/campaigns', {
    method: 'POST',
    form: { _csrf: await csrfOf(owner), name: 'Second', threshold: '4', lang: 'he' },
  });
  assert.equal(second.status, 422);
  assert.equal(store.campaignsFor(bizOf('free@example.com').id).length, 1);
  const insights = await owner.req('/admin/insights', { method: 'POST', form: { _csrf: await csrfOf(owner), days: '30' } });
  assert.equal(insights.status, 403);
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

  // Free plan: widget disabled.
  assert.equal((await client().req(`/widget/${biz.widget_key}`)).status, 404);

  store.updateBusiness(biz.id, { plan: 'pro' });
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

  // Free plan: no API.
  store.updateBusiness(campaign.business_id, { plan: 'pro' });
  const created = await owner.req('/admin/integrations/keys', { method: 'POST', form: { _csrf: await csrfOf(owner), name: 'POS' } });
  const key = decodeURIComponent(created.location.match(/key=([^&]+)/)[1]);
  assert.match(key, /^rk_/);
  store.updateBusiness(campaign.business_id, { plan: 'free' });
  assert.equal((await api('/ping', { key })).status, 403);
  store.updateBusiness(campaign.business_id, { plan: 'pro' });

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
