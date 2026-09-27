import express from 'express';
import QRCode from 'qrcode';
import { EDITABLE_TEXT_KEYS, textsFor } from '../i18n.js';
import { DEFAULT_QUESTIONS, normalizeQuestions, STATUSES } from '../store.js';
import { clampInt, csvEscape, errorPage, googleReviewUrl, hashPassword, safeColor, safeUrl, verifyPassword } from '../util.js';
import { parseJson } from '../db.js';
import { adminPage } from '../views/layout.js';
import * as V from '../views/admin.js';

const SESSION_COOKIE = 'sid';
const BIZ_COOKIE = 'biz';
const PAGE_SIZE = 50;

export function adminRoutes(store, { allowSignup = true, secureCookies = false } = {}) {
  const router = express.Router();
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: secureCookies };

  const baseUrl = (req) => process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
  const signupOpen = () => allowSignup || store.countUsers() === 0;

  // ---------- session loading + CSRF ----------
  router.use((req, res, next) => {
    req.user = store.sessionUser(req.cookies[SESSION_COOKIE]);
    if (req.method === 'POST' && req.user && req.body?._csrf !== req.user.csrf) {
      return res.status(403).send(errorPage('פג תוקף הטופס. רעננו את הדף ונסו שוב'));
    }
    next();
  });

  const render = (req, res, title, body, extra = {}) =>
    res.send(
      adminPage({
        title,
        user: req.user,
        business: req.business,
        businesses: req.businesses,
        csrf: req.user?.csrf,
        flash: req.query.ok ? 'נשמר בהצלחה' : '',
        body,
        ...extra,
      }),
    );

  function requireAuth(req, res, next) {
    if (!req.user) return res.redirect(303, '/login');
    req.businesses = store.businessesFor(req.user.id);
    const wanted = Number(req.cookies[BIZ_COOKIE]);
    req.business = req.businesses.find((b) => b.id === wanted) || req.businesses[0];
    if (!req.business) {
      const id = store.createBusiness(req.user.id, { name: 'העסק שלי' });
      req.business = store.business(id, req.user.id);
      req.businesses = [req.business];
    }
    next();
  }

  // ---------- auth ----------
  router.get('/', (req, res) => res.redirect(req.user ? '/admin' : '/login'));

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/admin');
    render(req, res, 'כניסה', V.authView({ mode: 'login', allowSignup: signupOpen() }));
  });

  const loginAttempts = new Map();
  router.post('/login', (req, res) => {
    const email = String(req.body.email ?? '').trim();
    const key = `${req.ip}|${email.toLowerCase()}`;
    const attempts = loginAttempts.get(key) || { n: 0, until: 0 };
    if (attempts.until > Date.now()) {
      return render(req, res, 'כניסה', V.authView({ mode: 'login', error: 'יותר מדי ניסיונות, נסו שוב בעוד כמה דקות', values: { email } }));
    }
    const user = store.userByEmail(email);
    if (!user || !verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
      attempts.n++;
      if (attempts.n >= 5) Object.assign(attempts, { n: 0, until: Date.now() + 5 * 60e3 });
      loginAttempts.set(key, attempts);
      res.status(401);
      return render(req, res, 'כניסה', V.authView({ mode: 'login', error: 'אימייל או סיסמה שגויים', values: { email }, allowSignup: signupOpen() }));
    }
    loginAttempts.delete(key);
    res.cookie(SESSION_COOKIE, store.createSession(user.id), { ...cookieOpts, maxAge: 30 * 864e5 });
    res.redirect(303, '/admin');
  });

  router.get('/register', (req, res) => {
    if (!signupOpen()) return res.redirect('/login');
    render(req, res, 'הרשמה', V.authView({ mode: 'register' }));
  });

  router.post('/register', (req, res) => {
    if (!signupOpen()) return res.redirect(303, '/login');
    const values = {
      name: String(req.body.name ?? '').trim().slice(0, 80),
      email: String(req.body.email ?? '').trim().slice(0, 120),
      business: String(req.body.business ?? '').trim().slice(0, 100),
    };
    const password = String(req.body.password ?? '');
    let error = '';
    if (!values.name || !values.business) error = 'יש למלא את כל השדות';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) error = 'אימייל לא תקין';
    else if (password.length < 8) error = 'סיסמה חייבת להכיל לפחות 8 תווים';
    else if (store.userByEmail(values.email)) error = 'האימייל כבר רשום';
    if (error) {
      res.status(422);
      return render(req, res, 'הרשמה', V.authView({ mode: 'register', error, values }));
    }
    const userId = store.createUser({ email: values.email, name: values.name, passwordHash: hashPassword(password) });
    store.createBusiness(userId, { name: values.business });
    res.cookie(SESSION_COOKIE, store.createSession(userId), { ...cookieOpts, maxAge: 30 * 864e5 });
    res.redirect(303, '/admin');
  });

  router.post('/logout', (req, res) => {
    if (req.user) store.deleteSession(req.user.session_id);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/login');
  });

  // ---------- everything below requires login ----------
  const admin = express.Router();
  router.use('/admin', requireAuth, admin);

  admin.get('/switch', (req, res) => {
    const b = req.businesses.find((x) => x.id === Number(req.query.b));
    if (b) res.cookie(BIZ_COOKIE, String(b.id), { ...cookieOpts, maxAge: 365 * 864e5 });
    res.redirect(303, '/admin');
  });

  admin.get('/', (req, res) => {
    const campaigns = store.campaignsFor(req.business.id);
    const campaignId = campaigns.find((c) => c.id === Number(req.query.campaign))?.id ?? null;
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const stats = store.stats(req.business.id, { campaignId, days });
    const recentNegative = store.listResponses(req.business.id, { campaignId, sentiment: 'negative', limit: 8 });
    render(req, res, 'לוח בקרה', V.dashboardView({ stats, campaigns, campaignId, days, recentNegative }));
  });

  // ---------- responses ----------
  function responseFilters(req) {
    return {
      campaign: req.query.campaign ? String(Number(req.query.campaign) || '') : '',
      sentiment: ['positive', 'negative'].includes(req.query.sentiment) ? req.query.sentiment : '',
      status: Object.hasOwn(STATUSES, req.query.status ?? '') ? req.query.status : '',
      q: String(req.query.q ?? '').trim().slice(0, 80),
    };
  }
  const toQuery = (f) => ({
    campaignId: f.campaign ? Number(f.campaign) : null,
    sentiment: f.sentiment,
    status: f.status,
    search: f.q,
  });

  admin.get('/responses', (req, res) => {
    const filters = responseFilters(req);
    const page = clampInt(req.query.page, 1, 10000, 1);
    const rows = store.listResponses(req.business.id, {
      ...toQuery(filters),
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    });
    render(
      req,
      res,
      'תגובות',
      V.responsesView({
        rows: rows.slice(0, PAGE_SIZE),
        hasMore: rows.length > PAGE_SIZE,
        page,
        filters,
        campaigns: store.campaignsFor(req.business.id),
      }),
    );
  });

  admin.get('/responses.csv', (req, res) => {
    const rows = store.listResponses(req.business.id, { ...toQuery(responseFilters(req)), limit: 100000 });
    const campaigns = Object.fromEntries(store.campaignsFor(req.business.id).map((c) => [c.id, c]));
    const header = ['id', 'date', 'campaign', 'source', 'rating', 'sentiment', 'completed', 'answers', 'comment', 'name', 'phone', 'email', 'wants_contact', 'review_clicks', 'status', 'notes'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const labels = Object.fromEntries((campaigns[r.campaign_id]?.questionsList ?? []).map((q) => [q.id, q.label]));
      const answers = Object.entries(parseJson(r.answers, {}))
        .map(([k, v]) => `${labels[k] || k}: ${[].concat(v).join('/')}`)
        .join(' | ');
      lines.push(
        [r.id, r.created_at, r.campaign_name, r.source, r.rating, r.sentiment, r.completed, answers, r.comment, r.customer_name, r.phone, r.email, r.wants_contact, parseJson(r.review_clicks, []).join('/'), r.status, r.notes]
          .map(csvEscape)
          .join(','),
      );
    }
    res.type('text/csv; charset=utf-8');
    res.attachment(`responses-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(`﻿${lines.join('\r\n')}`);
  });

  admin.get('/responses/:id', (req, res) => {
    const r = store.responseForBusiness(Number(req.params.id), req.business.id);
    if (!r) return res.status(404).send(errorPage('הדף לא נמצא'));
    render(req, res, 'תגובה', V.responseDetailView({ r, csrf: req.user.csrf, businessName: req.business.name }));
  });

  admin.post('/responses/:id', (req, res) => {
    const r = store.responseForBusiness(Number(req.params.id), req.business.id);
    if (!r) return res.status(404).send(errorPage('הדף לא נמצא'));
    const status = Object.hasOwn(STATUSES, req.body.status) ? req.body.status : r.status;
    store.updateResponseStatus(r.id, status, String(req.body.notes ?? '').slice(0, 5000));
    res.redirect(303, `/admin/responses/${r.id}?ok=1`);
  });

  // ---------- campaigns ----------
  function campaignFromForm(body, existing = {}) {
    const arr = (v) => [].concat(v ?? []);
    const labels = arr(body.q_label);
    const questions = normalizeQuestions(
      labels.map((label, i) => ({
        id: arr(body.q_id)[i],
        label,
        type: arr(body.q_type)[i],
        audience: arr(body.q_audience)[i],
        options: arr(body.q_options)[i],
        required: arr(body.q_required)[i] === '1',
      })),
    );
    const linkLabels = arr(body.link_label);
    const extra_links = arr(body.link_url)
      .map((u, i) => ({ label: String(linkLabels[i] ?? '').trim().slice(0, 40), url: safeUrl(u) }))
      .filter((l) => l.label && l.url)
      .slice(0, 8);
    const texts = {};
    for (const k of EDITABLE_TEXT_KEYS) {
      const v = String(body[`text_${k}`] ?? '').trim().slice(0, 300);
      if (v) texts[k] = v;
    }
    const rawGoogle = String(body.google_review_url ?? '').trim();
    return {
      ...existing,
      name: String(body.name ?? '').trim().slice(0, 100),
      lang: body.lang === 'en' ? 'en' : 'he',
      threshold: clampInt(body.threshold, 2, 5, 4),
      google_review_url: googleReviewUrl(rawGoogle),
      rawGoogle,
      extra_links,
      extraLinks: extra_links,
      questions,
      questionsList: questions,
      texts,
      textsObj: texts,
      active: existing.id ? body.active === '1' : true,
    };
  }

  function validateCampaign(c) {
    if (!c.name) return 'יש לתת שם לקמפיין';
    if (c.rawGoogle && !c.google_review_url) return 'קישור הגוגל / Place ID לא תקין';
    return '';
  }

  admin.get('/campaigns', (req, res) => {
    render(req, res, 'קמפיינים', V.campaignsView({ campaigns: store.campaignsFor(req.business.id), baseUrl: baseUrl(req) }));
  });

  admin.get('/campaigns/new', (req, res) => {
    const blank = {
      name: '',
      lang: 'he',
      threshold: 4,
      google_review_url: '',
      extraLinks: [],
      questionsList: normalizeQuestions(DEFAULT_QUESTIONS),
      textsObj: {},
      active: 1,
    };
    render(req, res, 'קמפיין חדש', V.campaignFormView({ campaign: blank, csrf: req.user.csrf }));
  });

  admin.post('/campaigns', (req, res) => {
    const c = campaignFromForm(req.body);
    const error = validateCampaign(c);
    if (error) {
      res.status(422);
      return render(req, res, 'קמפיין חדש', V.campaignFormView({ campaign: c, csrf: req.user.csrf, error }));
    }
    const id = store.createCampaign(req.business.id, c);
    res.redirect(303, `/admin/campaigns/${id}/share?ok=1`);
  });

  function loadCampaign(req, res) {
    const c = store.campaign(Number(req.params.id), req.business.id);
    if (!c) res.status(404).send(errorPage('הדף לא נמצא'));
    return c;
  }

  admin.get('/campaigns/:id', (req, res) => {
    const c = loadCampaign(req, res);
    if (c) render(req, res, c.name, V.campaignFormView({ campaign: c, csrf: req.user.csrf }));
  });

  admin.post('/campaigns/:id', (req, res) => {
    const existing = loadCampaign(req, res);
    if (!existing) return;
    const c = campaignFromForm(req.body, existing);
    const error = validateCampaign(c);
    if (error) {
      res.status(422);
      return render(req, res, c.name, V.campaignFormView({ campaign: c, csrf: req.user.csrf, error }));
    }
    store.updateCampaign(existing.id, c);
    res.redirect(303, `/admin/campaigns/${existing.id}?ok=1`);
  });

  admin.post('/campaigns/:id/delete', (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    store.deleteCampaign(c.id);
    res.redirect(303, '/admin/campaigns');
  });

  const qrTarget = (req, c) => {
    const src = String(req.query.src ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    return `${baseUrl(req)}/r/${c.slug}${src ? `?src=${src}` : ''}`;
  };
  const QR_OPTS = { margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } };

  admin.get('/campaigns/:id/qr.svg', async (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    res.type('image/svg+xml').send(await QRCode.toString(qrTarget(req, c), { type: 'svg', ...QR_OPTS }));
  });

  admin.get('/campaigns/:id/qr.png', async (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    res.type('image/png').send(await QRCode.toBuffer(qrTarget(req, c), { width: 1024, ...QR_OPTS }));
  });

  admin.get('/campaigns/:id/poster', async (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const qrSvg = await QRCode.toString(qrTarget(req, c), { type: 'svg', ...QR_OPTS });
    res.send(V.posterView({ campaign: c, business: req.business, qrSvg, t: textsFor(c) }));
  });

  admin.get('/campaigns/:id/share', (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const newInvite = req.query.invite ? store.inviteByToken(c.id, String(req.query.invite)) : null;
    render(
      req,
      res,
      'QR ושליחה',
      V.shareView({
        campaign: c,
        baseUrl: baseUrl(req),
        csrf: req.user.csrf,
        invites: store.invitesFor(c.id),
        newInvite,
        businessName: req.business.name,
      }),
      { flash: req.query.ok && !newInvite ? 'הקמפיין נוצר! עכשיו אפשר להדפיס QR או לשלוח ללקוחות' : '' },
    );
  });

  admin.post('/campaigns/:id/invites', (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const t = store.createInvite(c.id, {
      customer_name: String(req.body.customer_name ?? '').trim().slice(0, 80),
      phone: String(req.body.phone ?? '').trim().slice(0, 30),
    });
    res.redirect(303, `/admin/campaigns/${c.id}/share?invite=${t}`);
  });

  // ---------- business settings ----------
  admin.get('/business', (req, res) => {
    render(req, res, 'הגדרות עסק', V.businessView({ business: req.business, csrf: req.user.csrf }));
  });

  admin.post('/business', (req, res) => {
    const b = req.business;
    store.updateBusiness(b.id, {
      name: String(req.body.name ?? '').trim().slice(0, 100) || b.name,
      logo_url: safeUrl(req.body.logo_url),
      brand_color: safeColor(req.body.brand_color, b.brand_color),
      webhook_url: safeUrl(req.body.webhook_url),
    });
    res.redirect(303, '/admin/business?ok=1');
  });

  admin.post('/businesses', (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 100);
    if (!name) return res.redirect(303, '/admin/business');
    const id = store.createBusiness(req.user.id, { name });
    res.cookie(BIZ_COOKIE, String(id), { ...cookieOpts, maxAge: 365 * 864e5 });
    res.redirect(303, '/admin/campaigns/new');
  });

  return router;
}
