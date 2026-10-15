import crypto from 'node:crypto';
import express from 'express';
import { newBusiness, PLANS } from '../plans.js';
import QRCode from 'qrcode';
import { generateBackupCodes, generateSecret, otpauthUri, verifyCode } from '../totp.js';
import { operatorInfo } from '../views/site.js';
import { errorPage, hashPassword, isEmail, sha256, verifyPassword } from '../util.js';
import * as V from '../views/auth.js';
import { rateLimiter } from './public.js';
import { BIZ_COOKIE, SESSION_COOKIE } from './context.js';
import { ensureDemo } from '../demo.js';

const CHALLENGE_COOKIE = 'l2';
// "Sign in with Google": the round trip's state, and a sign-up waiting for its business name (both sealed).
const GOOGLE_STATE_COOKIE = 'gs';
const GOOGLE_SIGNUP_COOKIE = 'gp';

export function authRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();
  const limit = rateLimiter(ctx.authLimit);
  // Logins from one address, across all emails (password guessing on many accounts).
  const loginLimit = rateLimiter({ windowMs: ctx.authLimit.windowMs, max: ctx.authLimit.max * 2 });

  const clean = (body) => ({
    name: String(body.name ?? '').trim().slice(0, 80),
    email: String(body.email ?? '').trim().toLowerCase().slice(0, 120),
    business: String(body.business ?? '').trim().slice(0, 100),
    password: String(body.password ?? ''),
    terms: body.terms === '1',
    marketing: body.marketing === '1',
  });

  function validateNewUser(v, { needBusiness }) {
    if (!v.name || (needBusiness && !v.business)) return 'יש למלא את כל השדות';
    if (!isEmail(v.email)) return 'אימייל לא תקין';
    if (v.password.length < 8) return 'סיסמה חייבת להכיל לפחות 8 תווים';
    if (!v.terms) return 'יש לאשר את תנאי השימוש ומדיניות הפרטיות';
    // A browser's password manager sometimes fills the business name with the email or the password.
    if (needBusiness && (v.business === v.password || v.business.toLowerCase() === v.email || v.business.includes('@'))) {
      return 'נא לכתוב בשדה "שם העסק" את השם של העסק, כפי שיופיע בדשבורד';
    }
    if (store.userByEmail(v.email)) return 'האימייל כבר רשום. היכנסו לחשבון ופתחו שוב את הקישור';
    return '';
  }

  function createUser(v) {
    const first = store.countUsers() === 0;
    // An account made with Google has no password until the person sets one ("forgot password").
    const passwordHash = v.google ? `!google-${crypto.randomBytes(16).toString('hex')}` : hashPassword(v.password);
    const id = store.createUser({ email: v.email, name: v.name, passwordHash, marketing: v.marketing });
    // On a fresh install the first account runs the system, unless the
    // operator already named the admins (SUPERADMIN_EMAILS).
    const named = String(process.env.SUPERADMIN_EMAILS ?? '').trim();
    if (first && !named) store.setSuperadmin(id, true);
    return id;
  }

  // ---------- login ----------
  // A look around a sample business, without signing up (read-only).
  // Closed unless DEMO_OPEN=1: the landing page shows screenshots instead.
  router.get('/demo', (req, res) => {
    if (process.env.DEMO_OPEN !== '1') return res.redirect(303, '/#screens');
    const { userId, businessId } = ensureDemo(store);
    ctx.startSession(res, userId);
    res.cookie(BIZ_COOKIE, String(businessId), { ...ctx.cookieOpts, maxAge: 864e5 });
    res.redirect(303, '/admin');
  });

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/admin');
    const notice = req.query.reset ? 'הסיסמה עודכנה, אפשר להיכנס' : '';
    render(req, res, 'כניסה', V.loginView({ google: Boolean(ctx.google), allowSignup: ctx.signupOpen(), notice, next: req.query.next }));
  });

  const loginAttempts = new Map();
  router.post('/login', loginLimit, (req, res) => {
    const email = String(req.body.email ?? '').trim();
    const key = `${req.ip}|${email.toLowerCase()}`;
    const attempts = loginAttempts.get(key) || { n: 0, until: 0 };
    if (attempts.until > Date.now()) {
      res.status(429);
      return render(req, res, 'כניסה', V.loginView({ google: Boolean(ctx.google), error: 'יותר מדי ניסיונות, נסו שוב בעוד כמה דקות', values: { email } }));
    }
    const user = store.userByEmail(email);
    if (!user || !verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
      attempts.n++;
      if (attempts.n >= 5) Object.assign(attempts, { n: 0, until: Date.now() + 5 * 60e3 });
      loginAttempts.set(key, attempts);
      res.status(401);
      return render(req, res, 'כניסה', V.loginView({ google: Boolean(ctx.google), error: 'אימייל או סיסמה שגויים', values: { email }, allowSignup: ctx.signupOpen(), next: req.query.next }));
    }
    loginAttempts.delete(key);
    logIn(res, user, req.query.next);
  });

  /** The person is who they say (password or Google); the session starts now, or after the second factor. */
  function logIn(res, user, nextRaw) {
    const next = String(nextRaw ?? '');
    // The system admin lands on the system panel, everyone else on their business.
    const target = /^\/join\/[\w-]+$/.test(next) ? next : ctx.isSuperadmin(user) ? '/superadmin' : '/admin';
    if (user.totp_enabled) {
      const challenge = store.createLoginChallenge(user.id, target);
      res.cookie(CHALLENGE_COOKIE, challenge, { ...ctx.cookieOpts, maxAge: 5 * 60e3 });
      return res.redirect(303, '/login/2fa');
    }
    ctx.startSession(res, user.id);
    res.redirect(303, target);
  }

  // ---------- sign in / sign up with Google ----------
  const googleRedirect = (req) => `${ctx.baseUrl(req)}/auth/google/callback`;
  const unseal = (raw) => {
    try {
      return JSON.parse(ctx.google.open(raw));
    } catch {
      return null;
    }
  };
  const googleFail = (req, res, error) => {
    res.status(400);
    return render(req, res, 'כניסה', V.loginView({ google: Boolean(ctx.google), error, allowSignup: ctx.signupOpen() }));
  };

  router.get('/auth/google', (req, res) => {
    if (!ctx.google) return res.redirect('/login');
    const nonce = crypto.randomBytes(16).toString('base64url');
    const next = String(req.query.next ?? '');
    const state = { nonce, at: Date.now(), pass: passFor(req.query.pass)?.code || '', next: /^\/join\/[\w-]+$/.test(next) ? next : '' };
    res.cookie(GOOGLE_STATE_COOKIE, ctx.google.seal(JSON.stringify(state)), { ...ctx.cookieOpts, maxAge: 10 * 60e3 });
    res.redirect(303, ctx.google.signInUrl({ redirectUri: googleRedirect(req), state: nonce }));
  });

  router.get('/auth/google/callback', limit, async (req, res) => {
    if (!ctx.google) return res.redirect('/login');
    const state = unseal(req.cookies[GOOGLE_STATE_COOKIE]);
    res.clearCookie(GOOGLE_STATE_COOKIE);
    if (req.query.error) return googleFail(req, res, 'הכניסה עם גוגל בוטלה.');
    if (!state?.nonce || state.nonce !== req.query.state || Date.now() - state.at > 10 * 60e3) return googleFail(req, res, 'פג תוקף הכניסה. נסו שוב.');
    let who;
    try {
      who = await ctx.google.signIn({ code: String(req.query.code ?? ''), redirectUri: googleRedirect(req) });
    } catch (err) {
      console.warn('[auth] google sign-in failed:', err.message);
      return googleFail(req, res, 'הכניסה עם גוגל לא הצליחה. נסו שוב, או היכנסו עם מייל וסיסמה.');
    }
    const user = store.userByEmail(who.email);
    if (user) return logIn(res, user, state.next);
    if (!ctx.signupOpen()) return googleFail(req, res, 'אין חשבון עם המייל הזה, וההרשמה סגורה כרגע.');
    // A new person: one short step for the business name and the terms.
    res.cookie(GOOGLE_SIGNUP_COOKIE, ctx.google.seal(JSON.stringify({ ...who, pass: state.pass, at: Date.now() })), { ...ctx.cookieOpts, maxAge: 30 * 60e3 });
    res.redirect(303, '/register/google');
  });

  const pendingSignup = (req) => {
    const p = ctx.google && unseal(req.cookies[GOOGLE_SIGNUP_COOKIE]);
    return p?.email && Date.now() - p.at < 30 * 60e3 ? p : null;
  };

  router.get('/register/google', (req, res) => {
    const p = pendingSignup(req);
    if (!p || !ctx.signupOpen()) return res.redirect('/register');
    const pass = passFor(p.pass);
    render(req, res, 'הרשמה', V.googleSignupView({ trialOpen: Boolean(ctx.billing), who: p, pass, values: { name: p.name } }));
  });

  router.post('/register/google', limit, (req, res) => {
    const p = pendingSignup(req);
    if (!p || !ctx.signupOpen()) return res.redirect(303, '/register');
    const v = { ...clean(req.body), email: p.email, google: true };
    v.name = v.name || p.name || p.email.split('@')[0];
    const pass = passFor(p.pass);
    let error = '';
    if (!v.business) error = 'נא לכתוב את שם העסק';
    else if (v.business.toLowerCase() === v.email || v.business.includes('@')) error = 'נא לכתוב בשדה "שם העסק" את השם של העסק, כפי שיופיע בדשבורד';
    else if (!v.terms) error = 'יש לאשר את תנאי השימוש ומדיניות הפרטיות';
    if (error) {
      res.status(422);
      return render(req, res, 'הרשמה', V.googleSignupView({ trialOpen: Boolean(ctx.billing), who: p, pass, values: v, error }));
    }
    res.clearCookie(GOOGLE_SIGNUP_COOKIE);
    // Signed up meanwhile (another tab): just sign in.
    const existing = store.userByEmail(v.email);
    if (existing) return logIn(res, existing);
    startAccount(res, v, pass);
  });

  router.get('/login/2fa', (req, res) => {
    if (!store.loginChallenge(req.cookies[CHALLENGE_COOKIE])) return res.redirect('/login');
    render(req, res, 'אימות דו-שלבי', V.twoFactorLoginView({}));
  });

  router.post('/login/2fa', limit, (req, res) => {
    const raw = req.cookies[CHALLENGE_COOKIE];
    const challenge = store.loginChallenge(raw);
    if (!challenge) return res.redirect(303, '/login');
    const user = store.userById(challenge.user_id);
    const code = String(req.body.code ?? '').trim();
    const step = verifyCode(user.totp_secret, code, { lastStep: user.totp_last_step });
    const ok = step !== null || (/[a-z]/i.test(code) && store.useBackupCode(user.id, code));
    if (!ok) {
      store.failLoginChallenge(raw);
      res.status(401);
      return render(req, res, 'אימות דו-שלבי', V.twoFactorLoginView({ error: 'הקוד לא נכון או שפג תוקפו. נסו את הקוד הבא שמופיע באפליקציה.' }));
    }
    if (step !== null) store.setTotpLastStep(user.id, step);
    store.deleteLoginChallenge(raw);
    res.clearCookie(CHALLENGE_COOKIE);
    ctx.startSession(res, user.id);
    res.redirect(303, challenge.next || '/admin');
  });

  // ---------- register ----------
  // `?pass=` is a free-access link from the system admin: free days without a card.
  const passFor = (code) => {
    const pass = code ? store.usablePass(code) : null;
    return pass && PLANS[pass.plan] ? pass : null;
  };
  router.get('/register', (req, res) => {
    if (!ctx.signupOpen()) return res.redirect('/login');
    const pass = passFor(req.query.pass);
    render(req, res, 'הרשמה', V.registerView({ trialOpen: Boolean(ctx.billing), pass, values: { pass: pass?.code }, passGone: Boolean(req.query.pass && !pass), google: Boolean(ctx.google) }));
  });

  router.post('/register', limit, (req, res) => {
    if (!ctx.signupOpen()) return res.redirect(303, '/login');
    const v = clean(req.body);
    const pass = passFor(req.body.pass);
    const error = validateNewUser(v, { needBusiness: true });
    if (error) {
      res.status(422);
      return render(req, res, 'הרשמה', V.registerView({ trialOpen: Boolean(ctx.billing), error, values: { ...v, pass: pass?.code }, pass, google: Boolean(ctx.google) }));
    }
    startAccount(res, v, pass);
  });

  /** A new person and their business: the account, the trial or free pass, the session and the guide. */
  function startAccount(res, v, pass) {
    const userId = createUser(v);
    // The system admin's own business is never on a trial.
    const admin = ctx.isSuperadmin(store.userById(userId));
    const viaPass = !admin && pass && store.usePass(pass.id);
    const businessId = store.createBusiness(
      userId,
      admin ? { name: v.business, plan: 'business' } : viaPass ? { name: v.business, plan: pass.plan, trialDays: pass.days, passId: pass.id } : newBusiness(v.business),
    );
    ctx.startSession(res, userId);
    // The getting-started guide, by email (in the background: sign-up never waits for it).
    if (!admin) {
      ctx.notifier
        ?.welcomeGuide({ user: store.userById(userId), business: store.businessById(businessId) })
        .catch((err) => console.error('[notify] welcome guide failed:', err));
    }
    res.redirect(303, admin ? '/superadmin' : '/admin');
  }

  router.post('/logout', (req, res) => {
    if (req.user) store.deleteSession(req.user.session_id);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/login');
  });

  // ---------- password reset ----------
  router.get('/forgot', (req, res) => render(req, res, 'שכחתי סיסמה', V.forgotView({})));

  router.post('/forgot', limit, async (req, res) => {
    const user = store.userByEmail(String(req.body.email ?? '').trim());
    if (user) {
      const raw = store.createPasswordReset(user.id);
      await ctx.notifier.passwordReset({ user, link: `${ctx.baseUrl(req)}/reset/${raw}` });
    }
    // Same answer either way, so the form can't be used to discover accounts.
    render(req, res, 'שכחתי סיסמה', V.forgotView({ sent: true }));
  });

  router.get('/reset/:token', (req, res) => {
    if (!store.passwordResetByToken(req.params.token)) {
      return res.status(410).send(errorPage('הקישור לאיפוס פג תוקף או כבר נוצל'));
    }
    render(req, res, 'סיסמה חדשה', V.resetView({ token: req.params.token }));
  });

  router.post('/reset/:token', limit, (req, res) => {
    const reset = store.passwordResetByToken(req.params.token);
    if (!reset) return res.status(410).send(errorPage('הקישור לאיפוס פג תוקף או כבר נוצל'));
    const password = String(req.body.password ?? '');
    let error = '';
    if (password.length < 8) error = 'סיסמה חייבת להכיל לפחות 8 תווים';
    else if (password !== req.body.password2) error = 'הסיסמאות לא תואמות';
    if (error) {
      res.status(422);
      return render(req, res, 'סיסמה חדשה', V.resetView({ token: req.params.token, error }));
    }
    store.usePasswordReset(req.params.token);
    store.updateUserPassword(reset.user_id, hashPassword(password));
    res.redirect(303, '/login?reset=1');
  });

  // ---------- team invite acceptance ----------
  router.get('/join/:token', (req, res) => {
    const invite = store.teamInviteByToken(req.params.token);
    if (!invite) return res.status(410).send(errorPage('ההזמנה פגה או כבר נוצלה'));
    if (req.user) {
      return render(req, res, 'הזמנה', V.joinView({ invite, user: req.user, csrf: req.user.csrf, token: req.params.token }));
    }
    if (store.userByEmail(invite.email)) return res.redirect(`/login?next=/join/${encodeURIComponent(req.params.token)}`);
    render(req, res, 'הצטרפות', V.registerView({ trialOpen: Boolean(ctx.billing), invite, values: { token: req.params.token } }));
  });

  router.post('/join/:token', limit, (req, res) => {
    const invite = store.teamInviteByToken(req.params.token);
    if (!invite) return res.status(410).send(errorPage('ההזמנה פגה או כבר נוצלה'));
    let userId;
    if (req.user) {
      if (req.user.email !== invite.email) return res.status(403).send(errorPage('ההזמנה שייכת לאימייל אחר'));
      userId = req.user.id;
    } else {
      const v = { ...clean(req.body), email: invite.email };
      const error = validateNewUser(v, { needBusiness: false });
      if (error) {
        res.status(422);
        return render(req, res, 'הצטרפות', V.registerView({ trialOpen: Boolean(ctx.billing), invite, error, values: { ...v, token: req.params.token } }));
      }
      userId = createUser(v);
      ctx.startSession(res, userId);
    }
    store.acceptTeamInvite(invite, userId);
    res.cookie('biz', String(invite.business_id), { ...ctx.cookieOpts, maxAge: 365 * 864e5 });
    res.redirect(303, '/admin');
  });

  // ---------- account ----------
  const accountPage = (req, extra = {}) => {
    const full = store.userById(req.user.id);
    return V.accountView({
      user: req.user,
      csrf: req.user.csrf,
      totpEnabled: Boolean(full.totp_enabled),
      backupLeft: store.backupCodesLeft(full.id),
      businesses: store.businessesFor(full.id),
      marketing: Boolean(full.marketing_consent),
      saved: req.query.ok === '1',
      ...extra,
    });
  };

  router.get('/account', ctx.requireAuth, (req, res) => {
    render(req, res, 'החשבון שלי', accountPage(req));
  });

  // ---------- two-factor setup ----------
  async function setupPage(req, res, error = '') {
    const user = store.userById(req.user.id);
    if (!user.totp_secret || user.totp_enabled) return res.redirect(303, '/account');
    const uri = otpauthUri({ issuer: operatorInfo().brand, account: user.email, secret: user.totp_secret });
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 440 });
    if (error) res.status(422);
    render(req, res, 'אימות דו-שלבי', V.twoFactorSetupView({ csrf: req.user.csrf, qrDataUrl, secret: user.totp_secret, error }));
  }

  router.post('/account/2fa/setup', ctx.requireAuth, (req, res) => {
    const user = store.userById(req.user.id);
    if (!user.totp_enabled) store.setPendingTotp(user.id, generateSecret());
    res.redirect(303, '/account/2fa');
  });

  router.get('/account/2fa', ctx.requireAuth, (req, res, next) => setupPage(req, res).catch(next));

  router.post('/account/2fa/enable', ctx.requireAuth, (req, res, next) => {
    const user = store.userById(req.user.id);
    if (!user.totp_secret || user.totp_enabled) return res.redirect(303, '/account');
    const step = verifyCode(user.totp_secret, req.body.code);
    if (step === null) return setupPage(req, res, 'הקוד לא תואם. ודאו שהשעה בטלפון נכונה ונסו את הקוד הבא.').catch(next);
    const codes = generateBackupCodes();
    store.enableTotp(user.id, codes.map((c) => sha256(c)), step);
    render(req, res, 'אימות דו-שלבי', V.backupCodesView({ codes }));
  });

  router.post('/account/2fa/disable', ctx.requireAuth, (req, res) => {
    const user = store.userById(req.user.id);
    const code = String(req.body.code ?? '').trim();
    const codeOk = verifyCode(user.totp_secret, code, { lastStep: user.totp_last_step }) !== null ||
      (/[a-z]/i.test(code) && store.useBackupCode(user.id, code));
    if (!verifyPassword(String(req.body.password ?? ''), user.password_hash) || !codeOk) {
      res.status(422);
      return render(req, res, 'החשבון שלי', accountPage(req, { error: 'הסיסמה או הקוד לא נכונים' }));
    }
    store.disableTotp(user.id);
    res.redirect(303, '/account?ok=1');
  });

  router.post('/account', ctx.requireAuth, (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 80);
    if (name) store.updateUserName(req.user.id, name);
    res.redirect(303, '/account?ok=1');
  });

  router.post('/account/marketing', ctx.requireAuth, (req, res) => {
    store.setMarketingConsent(req.user.id, req.body.marketing === '1');
    res.redirect(303, '/account?ok=1#marketing');
  });

  // Renaming a business the user owns, right from the account page.
  router.post('/account/business/:id/name', ctx.requireAuth, (req, res) => {
    const business = store.business(Number(req.params.id), req.user.id);
    const name = String(req.body.name ?? '').trim().slice(0, 100);
    if (business?.role === 'owner' && name) store.updateBusiness(business.id, { name });
    res.redirect(303, '/account?ok=1#businesses');
  });

  router.post('/account/password', ctx.requireAuth, (req, res) => {
    const user = store.userById(req.user.id);
    const password = String(req.body.password ?? '');
    let error = '';
    if (!verifyPassword(String(req.body.current ?? ''), user.password_hash)) error = 'הסיסמה הנוכחית שגויה';
    else if (password.length < 8) error = 'סיסמה חייבת להכיל לפחות 8 תווים';
    if (error) {
      res.status(422);
      return render(req, res, 'החשבון שלי', V.accountView({ user: req.user, csrf: req.user.csrf, error }));
    }
    store.updateUserPassword(user.id, hashPassword(password), req.user.session_id);
    res.redirect(303, '/account?ok=1');
  });

  return router;
}

