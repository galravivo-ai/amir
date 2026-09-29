import crypto from 'node:crypto';
import express from 'express';
import { AiError } from '../ai.js';
import { GoogleError } from '../google.js';
import { safeUrl } from '../util.js';
import * as V from '../views/google.js';

const STATE_COOKIE = 'gstate';

/** Google Business Profile: connect, choose locations, read and answer reviews. */
export function googleRoutes(ctx, { google, sync }) {
  const { store, render, requireRole, notFound } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  const redirectUri = (req) => `${ctx.baseUrl(req)}/admin/google/callback`;
  const humanError = (err) =>
    err instanceof GoogleError
      ? err.status === 403 || err.status === 429
        ? 'גוגל עוד לא אישרה גישה ל-API של פרופיל העסק לחשבון הזה (או שנחרגה המכסה). נסו שוב מאוחר יותר.'
        : err.status === 401 || /invalid_grant/i.test(err.message)
          ? 'ההרשאה מגוגל פגה או בוטלה. צריך להתחבר מחדש.'
          : `שגיאה מגוגל: ${err.message}`
      : 'משהו השתבש מול גוגל, נסו שוב.';

  router.use('/google', (req, res, next) => {
    if (google) return next();
    render(req, res, 'ביקורות גוגל', V.googleSetupView({ configured: false, isSuperadmin: ctx.isSuperadmin(req.user), redirectUri: redirectUri(req) }));
  });

  router.get('/google', (req, res) => {
    const notice = req.query.connected ? 'החשבון חובר. סמנו את הסניפים שתרצו לעקוב אחריהם.' : req.query.synced ? 'הסנכרון הסתיים.' : req.query.ok ? 'נשמר.' : '';
    render(
      req,
      res,
      'ביקורות גוגל',
      V.googleConnectView({
        conn: store.googleConnection(req.business.id),
        locations: store.googleLocations(req.business.id),
        campaigns: store.campaignsFor(req.business.id),
        csrf: req.user.csrf,
        can: req.can,
        notice,
        error: req.query.err ? String(req.query.err).slice(0, 300) : '',
      }),
    );
  });

  router.post('/google/connect', manager, (req, res) => {
    const nonce = crypto.randomBytes(16).toString('base64url');
    // The state ties the round trip to this browser and this business.
    res.cookie(STATE_COOKIE, `${nonce}.${req.business.id}`, { ...ctx.cookieOpts, maxAge: 10 * 60e3 });
    res.redirect(303, google.authUrl({ redirectUri: redirectUri(req), state: nonce }));
  });

  router.get('/google/callback', manager, async (req, res) => {
    const [nonce, businessId] = String(req.cookies[STATE_COOKIE] ?? '').split('.');
    res.clearCookie(STATE_COOKIE);
    const fail = (msg) => res.redirect(303, `/admin/google?err=${encodeURIComponent(msg)}`);
    if (req.query.error) return fail('החיבור בוטל בגוגל.');
    if (!nonce || nonce !== req.query.state || Number(businessId) !== req.business.id) return fail('פג תוקף החיבור, נסו שוב.');
    try {
      const t = await google.exchangeCode({ code: String(req.query.code ?? ''), redirectUri: redirectUri(req) });
      store.saveGoogleConnection(req.business.id, {
        email: t.email,
        refreshToken: google.seal(t.refreshToken),
        accessToken: google.seal(t.accessToken),
        expiresAt: t.expiresAt,
        connectedBy: req.user.id,
      });
      await sync.refreshLocations(req.business.id);
      const locations = store.googleLocations(req.business.id);
      if (locations.length === 1) await sync.syncBusiness(req.business).catch(() => {});
      res.redirect(303, '/admin/google?connected=1');
    } catch (err) {
      console.warn('[google] connect failed:', err.message);
      fail(humanError(err));
    }
  });

  router.post('/google/locations/:id', manager, (req, res) => {
    const loc = store.googleLocation(Number(req.params.id), req.business.id);
    if (!loc) return notFound(res);
    const campaign = req.body.campaign ? store.campaign(Number(req.body.campaign), req.business.id) : null;
    store.updateGoogleLocation(loc.id, { enabled: req.body.enabled === '1', campaignId: campaign?.id ?? null });
    // Fill the campaign's review link from Google when it has none yet.
    if (campaign && !campaign.google_review_url && safeUrl(loc.review_url)) store.setCampaignGoogleUrl(campaign.id, loc.review_url);
    res.redirect(303, '/admin/google?ok=1');
  });

  router.post('/google/sync', manager, async (req, res) => {
    try {
      await sync.refreshLocations(req.business.id);
      await sync.syncBusiness(req.business);
      res.redirect(303, '/admin/google?synced=1');
    } catch (err) {
      res.redirect(303, `/admin/google?err=${encodeURIComponent(humanError(err))}`);
    }
  });

  router.post('/google/disconnect', requireRole('owner'), (req, res) => {
    store.deleteGoogleConnection(req.business.id);
    res.redirect(303, '/admin/google');
  });

  router.get('/google/reviews', (req, res) => {
    const locations = store.googleLocations(req.business.id).filter((l) => l.enabled);
    const filters = {
      filter: ['unanswered', 'negative'].includes(req.query.filter) ? req.query.filter : '',
      location: locations.some((l) => l.id === Number(req.query.location)) ? Number(req.query.location) : '',
    };
    if (!store.googleConnection(req.business.id)) return res.redirect(303, '/admin/google');
    render(
      req,
      res,
      'ביקורות גוגל',
      V.googleReviewsView({
        reviews: store.googleReviews(req.business.id, { locationId: filters.location || null, filter: filters.filter }),
        locations,
        filters,
        summary: store.googleSummary(req.business.id),
      }),
    );
  });

  function loadReview(req, res) {
    const r = store.googleReview(Number(req.params.id), req.business.id);
    if (!r) notFound(res);
    return r;
  }
  const reviewPage = (req, res, review, extra = {}) =>
    render(
      req,
      res,
      'ביקורת בגוגל',
      V.googleReviewView({ review, csrf: req.user.csrf, can: req.can, aiAvailable: Boolean(ctx.ai) && req.plan.ai, ...extra }),
    );

  router.get('/google/reviews/:id', (req, res) => {
    const review = loadReview(req, res);
    if (review) reviewPage(req, res, review, { saved: req.query.saved === '1' });
  });

  router.post('/google/reviews/:id/draft', manager, async (req, res) => {
    const review = loadReview(req, res);
    if (!review) return;
    if (!ctx.ai || !req.plan.ai) return reviewPage(req, res, review, { error: 'עוזר ה-AI לא פעיל.' });
    try {
      const draft = await ctx.ai.draftGoogleReply({
        businessName: req.business.name,
        rating: review.rating,
        comment: review.comment,
        reviewer: review.reviewer,
      });
      reviewPage(req, res, review, { draft });
    } catch (err) {
      reviewPage(req, res, review, { error: err instanceof AiError ? err.message : 'ה-AI לא הצליח לנסח טיוטה, נסו שוב.' });
    }
  });

  router.post('/google/reviews/:id/reply', manager, async (req, res) => {
    const review = loadReview(req, res);
    if (!review) return;
    const text = String(req.body.reply ?? '').trim().slice(0, 4000);
    if (!text) return reviewPage(req, res, review, { error: 'התשובה ריקה.' });
    try {
      await sync.reply(req.business.id, review, text);
      res.redirect(303, `/admin/google/reviews/${review.id}?saved=1`);
    } catch (err) {
      reviewPage(req, res, review, { draft: text, error: humanError(err) });
    }
  });

  return router;
}
