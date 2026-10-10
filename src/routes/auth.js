import express from 'express';
import { newBusiness } from '../plans.js';
import QRCode from 'qrcode';
import { generateBackupCodes, generateSecret, otpauthUri, verifyCode } from '../totp.js';
import { operatorInfo } from '../views/site.js';
import { errorPage, hashPassword, isEmail, sha256, verifyPassword } from '../util.js';
import * as V from '../views/auth.js';
import { rateLimiter } from './public.js';
import { BIZ_COOKIE, SESSION_COOKIE } from './context.js';
import { ensureDemo } from '../demo.js';

const CHALLENGE_COOKIE = 'l2';

export function authRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();
  const limit = rateLimiter(ctx.authLimit);

  const clean = (body) => ({
    name: String(body.name ?? '').trim().slice(0, 80),
    email: String(body.email ?? '').trim().toLowerCase().slice(0, 120),
    business: String(body.business ?? '').trim().slice(0, 100),
    password: String(body.password ?? ''),
    terms: body.terms === '1',
  });

  function validateNewUser(v, { needBusiness }) {
    if (!v.name || (needBusiness && !v.business)) return 'יש למלא את כל השדות';
    if (!isEmail(v.email)) return 'אימייל לא תקין';
    if (v.password.length < 8) return 'סיסמה חייבת להכיל לפחות 8 תווים';
    if (!v.terms) return 'יש לאשר את תנאי השימוש ומדיניות הפרטיות';
    if (store.userByEmail(v.email)) return 'האימייל כבר רשום. היכנסו לחשבון ופתחו שוב את הקישור';
    return '';
  }

  function createUser(v) {
    const first = store.countUsers() === 0;
    const id = store.createUser({ email: v.email, name: v.name, passwordHash: hashPassword(v.password) });
    // On a fresh install the first account runs the system.
    if (first) store.setSuperadmin(id, true);
    return id;
  }

  // ---------- login ----------
  // A look around a sample business, without signing up (read-only).
  router.get('/demo', (req, res) => {
    const { userId, businessId } = ensureDemo(store);
    ctx.startSession(res, userId);
    res.cookie(BIZ_COOKIE, String(businessId), { ...ctx.cookieOpts, maxAge: 864e5 });
    res.redirect(303, '/admin');
  });

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/admin');
    const notice = req.query.reset ? 'הסיסמה עודכנה, אפשר להיכנס' : '';
    render(req, res, 'כניסה', V.loginView({ allowSignup: ctx.signupOpen(), notice, next: req.query.next }));
  });

  const loginAttempts = new Map();
  router.post('/login', (req, res) => {
    const email = String(req.body.email ?? '').trim();
    const key = `${req.ip}|${email.toLowerCase()}`;
    const attempts = loginAttempts.get(key) || { n: 0, until: 0 };
    if (attempts.until > Date.now()) {
      res.status(429);
      return render(req, res, 'כניסה', V.loginView({ error: 'יותר מדי ניסיונות, נסו שוב בעוד כמה דקות', values: { email } }));
    }
    const user = store.userByEmail(email);
    if (!user || !verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
      attempts.n++;
      if (attempts.n >= 5) Object.assign(attempts, { n: 0, until: Date.now() + 5 * 60e3 });
      loginAttempts.set(key, attempts);
      res.status(401);
      return render(req, res, 'כניסה', V.loginView({ error: 'אימייל או סיסמה שגויים', values: { email }, allowSignup: ctx.signupOpen(), next: req.query.next }));
    }
    loginAttempts.delete(key);
    const next = String(req.query.next ?? '');
    // The system admin lands on the system panel, everyone else on their business.
    const target = /^\/join\/[\w-]+$/.test(next) ? next : ctx.isSuperadmin(user) ? '/superadmin' : '/admin';
    if (user.totp_enabled) {
      // Password is right; the session starts only after the second factor.
      const challenge = store.createLoginChallenge(user.id, target);
      res.cookie(CHALLENGE_COOKIE, challenge, { ...ctx.cookieOpts, maxAge: 5 * 60e3 });
      return res.redirect(303, '/login/2fa');
    }
    ctx.startSession(res, user.id);
    res.redirect(303, target);
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
  router.get('/register', (req, res) => {
    if (!ctx.signupOpen()) return res.redirect('/login');
    render(req, res, 'הרשמה', V.registerView({}));
  });

  router.post('/register', limit, (req, res) => {
    if (!ctx.signupOpen()) return res.redirect(303, '/login');
    const v = clean(req.body);
    const error = validateNewUser(v, { needBusiness: true });
    if (error) {
      res.status(422);
      return render(req, res, 'הרשמה', V.registerView({ error, values: v }));
    }
    const userId = createUser(v);
    // The system admin's own business is never on a trial.
    const admin = ctx.isSuperadmin(store.userById(userId));
    store.createBusiness(userId, admin ? { name: v.business, plan: 'business' } : newBusiness(v.business));
    ctx.startSession(res, userId);
    res.redirect(303, admin ? '/superadmin' : '/admin');
  });

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
    render(req, res, 'הצטרפות', V.registerView({ invite, values: { token: req.params.token } }));
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
        return render(req, res, 'הצטרפות', V.registerView({ invite, error, values: { ...v, token: req.params.token } }));
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

