import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createGoogle } from '../src/google.js';

// A stand-in for Google's token endpoint: the next sign-in returns these claims.
let claims = {};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fetchImpl = async (url) => {
  assert.match(url, /oauth2\.googleapis\.com\/token/);
  return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'a', id_token: `${b64({ alg: 'RS256' })}.${b64(claims)}.sig` }) };
};
const google = createGoogle({ clientId: 'cid.apps.googleusercontent.com', clientSecret: 'GOCSPX-test', fetchImpl });
const as = (email, extra = {}) => ({ iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, email, email_verified: true, name: 'דנה כהן', sub: '123', ...extra });

const client = (base) => {
  const jar = {};
  return async (path, { method = 'GET', form } = {}) => {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const k = pair.slice(0, pair.indexOf('='));
      const v = pair.slice(pair.indexOf('=') + 1);
      if (v) jar[k] = v;
      else delete jar[k];
    }
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
};

test('sign up and sign in with Google', async () => {
  const created = createApp(openDb(':memory:'), { authLimit: { windowMs: 60e3, max: 1000 }, backups: false, google, ai: null, answerEngines: {}, cardcom: null, whatsapp: null, serp: null });
  const server = created.app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { store } = created;
  // Google round trip: our redirect, then Google sends the browser back with the state.
  const viaGoogle = async (me, start = '/auth/google') => {
    const go = await me(start);
    const url = new URL(go.location);
    assert.equal(url.host, 'accounts.google.com');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    return me(`/auth/google/callback?code=c&state=${url.searchParams.get('state')}`);
  };
  try {
    // The operator first (the first account runs the system).
    await client(base)('/register', { method: 'POST', form: { name: 'מפעיל', email: 'op@example.com', password: 'password123', business: 'GoFive', terms: '1' } });

    const me = client(base);
    assert.match((await me('/register')).text, /href="\/auth\/google">.*הרשמה מהירה עם Google/s);
    assert.match((await me('/login')).text, /כניסה עם Google/);

    // New person: one step for the business name and the terms.
    claims = as('dana@example.com');
    const back = await viaGoogle(me);
    assert.equal(back.location, '/register/google');
    const step = (await me('/register/google')).text;
    assert.match(step, /dana@example\.com/);
    assert.match(step, /value="דנה כהן"/);
    const noTerms = await me('/register/google', { method: 'POST', form: { business: 'קפה דנה', name: 'דנה כהן' } });
    assert.equal(noTerms.status, 422);
    const done = await me('/register/google', { method: 'POST', form: { business: 'קפה דנה', name: 'דנה כהן', terms: '1', marketing: '1' } });
    assert.equal(done.location, '/admin');
    const user = store.userByEmail('dana@example.com');
    assert.match(user.password_hash, /^!google-/);
    assert.equal(user.marketing_consent, 1);
    assert.equal(store.businessesFor(user.id)[0].name, 'קפה דנה');
    assert.ok(store.db.prepare("SELECT 1 FROM outbox WHERE kind = 'welcome_guide' AND to_addr = 'dana@example.com'").get(), 'the guide email');
    assert.equal((await me('/register/google')).location, '/register', 'the pending sign-up is used up');

    // Next time: straight in.
    const again = client(base);
    claims = as('Dana@Example.com');
    assert.equal((await viaGoogle(again)).location, '/admin');
    assert.notEqual((await again('/admin')).status, 302);

    // An existing password account with two-factor still asks for the code.
    store.db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = 'JBSWY3DPEHPK3PXP' WHERE email = 'op@example.com'").run();
    claims = as('op@example.com');
    assert.equal((await viaGoogle(client(base))).location, '/login/2fa');

    // Refused: an unverified email, a token for another app, a forged state.
    for (const bad of [as('x@example.com', { email_verified: false }), as('x@example.com', { aud: 'other-app' }), as('x@example.com', { exp: 1 })]) {
      claims = bad;
      const r = await viaGoogle(client(base));
      assert.equal(r.status, 400);
    }
    const forged = client(base);
    await forged('/auth/google');
    assert.equal((await forged('/auth/google/callback?code=c&state=wrong')).status, 400);
    assert.equal(store.userByEmail('x@example.com'), undefined);

    // A free-access link carries through Google.
    const [{ code }] = [{ code: store.createPass({ plan: 'pro', days: 30, maxUses: 1, note: '' }) }];
    const pilot = client(base);
    claims = as('pilot@example.com');
    assert.equal((await viaGoogle(pilot, `/auth/google?pass=${code}`)).location, '/register/google');
    assert.match((await pilot('/register/google')).text, /30 ימים חינם/);
    await pilot('/register/google', { method: 'POST', form: { business: 'מספרה', name: 'רון', terms: '1' } });
    const b = store.businessesFor(store.userByEmail('pilot@example.com').id)[0];
    assert.deepEqual([b.billing, b.pilot], ['trial', 1]);
  } finally {
    server.close();
  }
});
