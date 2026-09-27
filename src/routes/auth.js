import express from 'express';
import { errorPage, hashPassword, isEmail, verifyPassword } from '../util.js';
import * as V from '../views/auth.js';
import { rateLimiter } from './public.js';
import { SESSION_COOKIE } from './context.js';

export function authRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();
  const limit = rateLimiter(ctx.authLimit);

  const clean = (body) => ({
    name: String(body.name ?? '').trim().slice(0, 80),
    email: String(body.email ?? '').trim().toLowerCase().slice(0, 120),
    business: String(body.business ?? '').trim().slice(0, 100),
    password: String(body.password ?? ''),
  });

  function validateNewUser(v, { needBusiness }) {
    if (!v.name || (needBusiness && !v.business)) return 'יש למלא את כל השדות';
    if (!isEmail(v.email)) return 'אימייל לא תקין';
    if (v.password.length < 8) return 'סיסמה חייבת להכיל לפחות 8 תווים';
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

  router.get('/', (req, res) => res.redirect(req.user ? '/admin' : '/login'));

  // ---------- login ----------
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
    ctx.startSession(res, user.id);
    const next = String(req.query.next ?? '');
    res.redirect(303, next.startsWith('/join/') ? next : '/admin');
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
    store.createBusiness(userId, { name: v.business });
    ctx.startSession(res, userId);
    res.redirect(303, '/admin');
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
  router.get('/account', ctx.requireAuth, (req, res) => {
    render(req, res, 'החשבון שלי', V.accountView({ user: req.user, csrf: req.user.csrf }));
  });

  router.post('/account', ctx.requireAuth, (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 80);
    if (name) store.updateUserName(req.user.id, name);
    res.redirect(303, '/account?ok=1');
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

