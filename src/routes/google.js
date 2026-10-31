import crypto from 'node:crypto';
import express from 'express';
import { dataArrival } from '../arrival.js';
import { REPLY_TONES, replyStyleOf, withSuggestions } from '../replies.js';
import multer from 'multer';
import { fillTemplate, templatesFor } from '../network.js';
import { CTA_TYPES, googlePostBody, POST_TOPICS, readPost } from '../posts.js';
import { AiError } from '../ai.js';
import { GoogleError } from '../google.js';
import { SerpError, writeReviewUrl } from '../serp.js';
import { h, imageMime, safeUrl } from '../util.js';
import * as V from '../views/google.js';
import { waSendBlock } from '../views/admin.js';
import { whatsAppLeft } from '../whatsapp.js';
import { amountFor } from '../billing.js';
import { ANNUAL_MONTHS, branchPayUrl, branchPrice, payProvider, PLANS, profilesOf } from '../plans.js';

const STATE_COOKIE = 'gstate';

/** Google Business Profile: connect, choose locations, read and answer reviews. */
const REVIEWS_SHOWN = 100;

export function googleRoutes(ctx, { google, sync, serp = null, serpSync = null }) {
  const { store, render, requireRole, notFound } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  const redirectUri = (req) => `${ctx.baseUrl(req)}/admin/google/callback`;
  const humanError = (err) =>
    err instanceof SerpError
      ? err.quota
        ? err.message
        : err.status === 401 || /api key/i.test(err.message)
        ? 'שירות שליפת הביקורות לא מוגדר נכון (מפתח SerpApi). פנו למנהל המערכת.'
        : /run out|limit|credits/i.test(err.message)
          ? 'נגמרה מכסת הבדיקות של שירות הביקורות לחודש הזה. פנו למנהל המערכת.'
          : `שגיאה בשליפת הביקורות: ${err.message}`
      : err instanceof GoogleError
      ? err.status === 403 || err.status === 429
        ? 'גוגל עוד לא אישרה גישה ל-API של פרופיל העסק לחשבון הזה (או שנחרגה המכסה). נסו שוב מאוחר יותר.'
        : err.status === 401 || /invalid_grant/i.test(err.message)
          ? 'ההרשאה מגוגל פגה או בוטלה. צריך להתחבר מחדש.'
          : `שגיאה מגוגל: ${err.message}`
      : 'משהו השתבש מול גוגל, נסו שוב.';

  router.use('/google', (req, res, next) => {
    if (google || serp) return next();
    render(req, res, 'ביקורות גוגל', V.googleSetupView({ configured: false, isSuperadmin: ctx.isSuperadmin(req.user), redirectUri: redirectUri(req) }));
  });

  /**
   * A paying account pays for a new branch before it opens (iCount and manual
   * payments; Cardcom charges it with the next renewal). Trials, free-access
   * links, the demo and the system admin's own businesses add branches freely.
   */
  function branchNeedsPayment(req) {
    const b = req.business;
    if (b.billing !== 'active' || b.is_demo || b.pilot || payProvider() === 'cardcom' || PLANS[b.plan]?.price == null) return false;
    if (ctx.isSuperadmin(store.userById(b.user_id))) return false;
    return store.googleLocations(b.id).some((l) => l.enabled);
  }
  // What one more branch costs this business, per its billing period.
  const branchCost = (b) => {
    const annual = b.billing_cycle === 'annual';
    return { amount: branchPrice(PLANS[b.plan] || PLANS.basic) * (annual ? ANNUAL_MONTHS : 1), annual };
  };

  router.get('/google', connectPage);
  function connectPage(req, res) {
    const notice = req.query.pending
      ? 'הסניף נוסף וממתין לתשלום. אחרי התשלום נפעיל אותו, בדרך כלל תוך כמה שעות בימי עסקים.'
      : req.query.pay === 'requested'
      ? 'קיבלנו את הבקשה. נחזור אליכם להשלמת התשלום, ומיד אחריו הסניף ייפתח.'
      : req.query.started
      ? 'הניסיון התחיל! עכשיו הצעד הכי חשוב: לחבר את פרופיל העסק בגוגל, עם החשבון שמנהל אותו.'
      : req.query.connected
      ? 'החשבון חובר. סמנו את הסניפים שתרצו לעקוב אחריהם.'
      : req.query.added
        ? 'העסק נוסף. הביקורות נטענות עכשיו ברקע, זה לוקח עד דקה.'
        : req.query.synced
          ? 'הסנכרון הסתיים.'
          : req.query.ok
            ? 'נשמר.'
            : res.locals.notice || '';
    render(
      req,
      res,
      'ביקורות גוגל',
      V.googleConnectView({
        conn: google ? store.googleConnection(req.business.id) : null,
        gbpAvailable: Boolean(google),
        serpAvailable: Boolean(serp),
        serpHours: serpSync?.intervalHours,
        branchLimit: req.plan.campaigns,
        branchCost: branchCost(req.business),
        locations: store.googleLocations(req.business.id),
        matches: res.locals.matches || null,
        query: res.locals.query || '',
        campaigns: store.campaignsFor(req.business.id),
        csrf: req.user.csrf,
        can: req.can,
        notice,
        error: res.locals.error || (req.query.err ? String(req.query.err).slice(0, 300) : ''),
        setupCheck: ctx.isSuperadmin(req.user) && google ? { ...google.setupCheck(), redirectUri: redirectUri(req) } : null,
        serpMissing: !serp && ctx.isSuperadmin(req.user),
        debug: ctx.isSuperadmin(req.user),
        arrival: dataArrival(store, req.business, { serpOn: Boolean(serp), aiPlus: Boolean(req.plan.aiPlus) }),
      }),
    );
  }

  router.post('/google/connect', manager, (req, res) => {
    if (!google) return notFound(res);
    const nonce = crypto.randomBytes(16).toString('base64url');
    // The state ties the round trip to this browser and this business.
    res.cookie(STATE_COOKIE, `${nonce}.${req.business.id}`, { ...ctx.cookieOpts, maxAge: 10 * 60e3 });
    res.redirect(303, google.authUrl({ redirectUri: redirectUri(req), state: nonce, loginHint: req.user.email }));
  });

  router.get('/google/callback', manager, async (req, res) => {
    if (!google) return notFound(res);
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
      if (locations.length === 1) {
        await sync.syncBusiness(req.business).catch(() => {});
        // The profile's numbers (18 months on the first pull) load in the background.
        sync.syncMetrics(store.businessById(req.business.id)).catch((err) => console.warn('[google] metrics failed:', err.message));
      }
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
    const wanted = req.body.enabled === '1';
    // Turning on one more branch of a paying account: it waits for its payment.
    if (wanted && !loc.enabled && (loc.pending_pay || branchNeedsPayment(req))) {
      store.updateGoogleLocation(loc.id, { enabled: false, campaignId: campaign?.id ?? null });
      store.setLocationPending(loc.id, true);
      return res.redirect(303, `/admin/google?pending=${loc.id}`);
    }
    if (!wanted && loc.pending_pay) store.setLocationPending(loc.id, false);
    store.updateGoogleLocation(loc.id, { enabled: wanted, campaignId: campaign?.id ?? null });
    // A branch just turned on: its reviews and numbers load now, not at the next half-hourly sync.
    if (wanted && !loc.enabled && loc.source !== 'serp' && sync) {
      const business = store.businessById(req.business.id);
      sync
        .syncBusiness(business)
        .then(() => sync.syncMetrics(store.businessById(business.id)))
        .catch((err) => console.warn('[google] first load failed:', err.message));
    }
    // Fill the campaign's review link from Google when it has none yet.
    if (campaign && !campaign.google_review_url && safeUrl(loc.review_url)) store.setCampaignGoogleUrl(campaign.id, loc.review_url);
    res.redirect(303, '/admin/google?ok=1');
  });

  // ---- places followed by their Google Maps link (SerpApi) ----
  router.post('/google/places/find', manager, async (req, res) => {
    if (!serp) return notFound(res);
    const query = String(req.body.q ?? '').trim().slice(0, 500);
    res.locals.query = query;
    if (!query) {
      res.locals.error = 'הדביקו קישור לעסק בגוגל מפות, או כתבו את שם העסק והעיר.';
      return connectPage(req, res);
    }
    const over = ctx.usage.take(req.business, 'place_search');
    if (over) {
      res.locals.error = over;
      return connectPage(req, res);
    }
    try {
      const found = await serp.find(query);
      if (found.direct) return addPlace(req, res, found.direct);
      res.locals.matches = found.matches;
      if (!found.matches.length)
        res.locals.error = found.unreadLink
          ? 'לא הצלחנו לקרוא את הקישור הזה. כתבו במקומו את שם העסק והעיר (למשל: ג׳קו סטריט דיזנגוף תל אביב) ובחרו מהרשימה.'
          : 'לא מצאנו את העסק. נסו להוסיף את העיר, או להדביק את הקישור מגוגל מפות.';
    } catch (err) {
      console.warn('[serp] find failed:', err.message);
      res.locals.error = humanError(err);
    }
    connectPage(req, res);
  });

  router.post('/google/places/add', manager, (req, res) => {
    if (!serp) return notFound(res);
    const pick = (k, max = 300) => String(req.body[k] ?? '').trim().slice(0, max);
    const p = { dataId: pick('data_id', 100), placeId: pick('place_id', 200), title: pick('title'), address: pick('address') };
    if (!/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(p.dataId)) p.dataId = '';
    if (!/^[\w-]{10,}$/.test(p.placeId)) p.placeId = '';
    if (!p.dataId && !p.placeId) return res.redirect(303, '/admin/google');
    return addPlace(req, res, p);
  });

  async function addPlace(req, res, p) {
    const already = store.googleLocations(req.business.id).some((l) => l.name === `serp:${p.dataId || p.placeId}`);
    if (!already && store.serpLocationCount(req.business.id) >= req.plan.campaigns) {
      res.locals.error = `המסלול שלכם כולל עד ${req.plan.campaigns} סניפים. כדי להוסיף עוד, שדרגו את המסלול או הסירו סניף.`;
      return connectPage(req, res);
    }
    const pay = !already && branchNeedsPayment(req);
    const loc = store.addSerpLocation(req.business.id, { ...p, reviewUrl: writeReviewUrl(p.placeId) });
    if (pay) {
      store.setLocationPending(loc.id, true);
      return res.redirect(303, `/admin/google?pending=${loc.id}`);
    }
    // The first load reads up to a year of reviews (several searches), so it
    // runs in the background; the page shows it loading and refreshes.
    const business = req.business;
    serpSync.syncLocation(business, loc).catch((err) => {
      console.warn('[serp] first sync failed:', err.message);
      store.setLocationSyncError(loc.id, humanError(err));
    });
    res.redirect(303, '/admin/google?added=1');
  }

  // A branch waiting for its payment: the operator hears, and the customer goes to pay.
  router.post('/google/locations/:id/pay', manager, async (req, res) => {
    const loc = store.googleLocation(Number(req.params.id), req.business.id);
    if (!loc?.pending_pay) return res.redirect(303, '/admin/google');
    const b = req.business;
    const cycle = b.billing_cycle === 'annual' ? 'annual' : 'monthly';
    store.markBranchPayRequested(loc.id);
    await ctx.notifier
      ?.branchRequested({
        business: b,
        location: loc,
        user: req.user,
        cycle,
        amount: branchCost(b).amount,
        total: amountFor(b.plan, cycle, profilesOf(store, b.id) + 1),
        admins: ctx.adminEmails(),
      })
      .catch((err) => console.error('[notify] branchRequested failed:', err));
    res.redirect(303, branchPayUrl(b.plan, cycle) || '/admin/google?pay=requested');
  });

  // ---- posts to the Google Business Profile ----
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 } });
  const withPhoto = (req, res, next) =>
    upload.single('photo')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        req.photoError = 'התמונה גדולה מדי (עד 5MB).';
        req.body ||= {};
        return next();
      }
      next(err);
    });
  const postLocations = (businessId) => store.googleLocations(businessId).filter((l) => l.source === 'gbp' && l.enabled && !l.missing);
  const postsPage = (req, res, extra = {}) =>
    render(
      req,
      res,
      'פוסטים בגוגל',
      V.googlePostsView({
        posts: store.googlePosts(req.business.id),
        locations: postLocations(req.business.id),
        connected: Boolean(google && store.googleConnection(req.business.id)),
        gbpAvailable: Boolean(google),
        aiAvailable: Boolean(ctx.ai?.draftPost) && req.plan.ai,
        csrf: req.user.csrf,
        can: req.can,
        topics: POST_TOPICS,
        ctaTypes: CTA_TYPES,
        businessName: req.business.name,
        posted: req.query.posted ? store.googlePosts(req.business.id).find((p) => p.id === Number(req.query.posted)) : null,
        ...extra,
      }),
    );

  router.get('/google/posts', (req, res) => postsPage(req, res));

  /** Keeps a chosen photo across the AI-draft round trip. */
  function photoToken(req) {
    if (req.file) {
      const mime = imageMime(req.file.buffer);
      if (!mime || !['image/jpeg', 'image/png'].includes(mime)) {
        req.photoError = 'גוגל מקבלת רק תמונות JPG או PNG.';
        return '';
      }
      return store.savePostImage(req.business.id, { mime, data: req.file.buffer });
    }
    const t = String(req.body.image_token ?? '').replace(/[^\w-]/g, '');
    return t && store.postImage(t) ? t : '';
  }

  router.post('/google/posts/draft', manager, withPhoto, async (req, res) => {
    const imageToken = photoToken(req);
    const values = { ...req.body, image_token: imageToken };
    if (!ctx.ai?.draftPost || !req.plan.ai) return postsPage(req, res, { values, error: 'עוזר ה-AI לא פעיל.' });
    const idea = String(req.body.idea ?? '').trim().slice(0, 500) || String(req.body.summary ?? '').trim().slice(0, 1500);
    if (!idea) return postsPage(req, res, { values, error: 'כתבו בכמה מילים על מה הפוסט, וה-AI ינסח.' });
    const over = ctx.usage.take(req.business, 'ai_draft');
    if (over) return postsPage(req, res, { values, error: over });
    try {
      const { post } = readPost(req.body);
      const summary = await ctx.ai.draftPost({
        businessName: req.business.name,
        idea,
        topic: POST_TOPICS[post.topic],
        title: post.title,
        cta: post.ctaType ? CTA_TYPES[post.ctaType] : '',
      });
      postsPage(req, res, { values: { ...values, summary }, error: req.photoError || '' });
    } catch (err) {
      ctx.usage.give(req.business, 'ai_draft');
      postsPage(req, res, { values, error: err instanceof AiError ? err.message : 'ה-AI לא הצליח לנסח, נסו שוב.' });
    }
  });

  router.post('/google/posts', manager, withPhoto, async (req, res) => {
    const imageToken = photoToken(req);
    const values = { ...req.body, image_token: imageToken };
    const { post, errors } = readPost(req.body);
    if (req.photoError) errors.push(req.photoError);
    const ids = [].concat(req.body.locations ?? []).map(Number);
    const chosen = postLocations(req.business.id).filter((l) => ids.includes(l.id));
    if (!google || !store.googleConnection(req.business.id)) errors.push('כדי לפרסם ישירות מכאן צריך לחבר את חשבון הגוגל של העסק.');
    else if (!chosen.length) errors.push('בחרו לפחות סניף אחד לפרסום.');
    if (errors.length) return postsPage(req, res, { values, error: errors.join(' ') });

    const imageUrl = imageToken ? `${ctx.baseUrl(req)}/m/${imageToken}` : '';
    let results;
    try {
      results = await sync.publishPost(req.business.id, chosen, googlePostBody(post, { imageUrl }));
    } catch (err) {
      return postsPage(req, res, { values, error: humanError(err) });
    }
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) {
      const err = new GoogleError(failed[0].error, failed[0].status);
      return postsPage(req, res, { values, error: humanError(err) });
    }
    const id = store.createGooglePost(req.business.id, { ...post, imageToken, results, createdBy: req.user.id });
    res.redirect(303, `/admin/google/posts?posted=${id}`);
  });

  // System admin only: what SerpApi actually returns for a place, to diagnose parsing.
  router.get('/google/locations/:id/debug', async (req, res) => {
    const loc = store.googleLocation(Number(req.params.id), req.business.id);
    if (!serp || !loc || loc.source !== 'serp' || !ctx.isSuperadmin(req.user)) return notFound(res);
    let out;
    try {
      const raw = await serp.rawReviews({ dataId: loc.data_id, placeId: loc.place_id });
      delete raw.search_metadata;
      if (raw.search_parameters) delete raw.search_parameters.api_key;
      out = { keys: Object.keys(raw), reviewsCount: Array.isArray(raw.reviews) ? raw.reviews.length : null, raw };
    } catch (err) {
      out = { error: err.message };
    }
    const json = JSON.stringify({ location: { id: loc.id, data_id: loc.data_id, place_id: loc.place_id, sync_error: loc.sync_error }, ...out }, null, 2);
    render(req, res, 'בדיקת SerpApi', `<h1>בדיקת SerpApi</h1><p class="muted">התשובה הגולמית (בלי המפתח). צלמו או העתיקו את החלק העליון.</p>
      <textarea readonly dir="ltr" rows="30" style="width:100%;font:12px monospace" onclick="this.select()">${h(json.slice(0, 20000))}</textarea>`);
  });

  router.post('/google/locations/:id/delete', manager, (req, res) => {
    const loc = store.googleLocation(Number(req.params.id), req.business.id);
    // A place followed by link, or a branch of a Google account that is no longer connected.
    if (!loc || (loc.source !== 'serp' && !loc.missing && store.googleConnection(req.business.id))) return notFound(res);
    store.deleteGoogleLocation(loc.id, req.business.id);
    res.redirect(303, '/admin/google?ok=1');
  });

  router.post('/google/sync', manager, async (req, res) => {
    try {
      if (serpSync) await serpSync.syncBusiness(req.business);
      if (!google || !store.googleConnection(req.business.id)) return res.redirect(303, '/admin/google?synced=1');
      await sync.refreshLocations(req.business.id);
      await sync.syncBusiness(req.business);
      res.redirect(303, '/admin/google?synced=1');
    } catch (err) {
      res.redirect(303, `/admin/google?err=${encodeURIComponent(humanError(err))}`);
    }
  });

  router.post('/google/disconnect', requireRole('owner'), async (req, res) => {
    const conn = store.googleConnection(req.business.id);
    store.deleteGoogleConnection(req.business.id);
    // The same Google account may still serve another business here; revoking
    // would cut that one off too, so the permission is withdrawn with the last one.
    if (conn && google.revoke && !store.googleConnectionsByEmail(conn.email).length) {
      await google.revoke(google.open(conn.refresh_token)).catch((err) => console.warn('[google] revoke failed:', err.message));
    }
    res.redirect(303, '/admin/google');
  });

  // The rating of one branch, for a member limited to it.
  const branchSummary = (businessId, locationId, locations) => {
    const l = locations.find((x) => x.id === locationId) || {};
    const unanswered = store.googleReviews(businessId, { locationId, filter: 'unanswered', limit: 1000 }).length;
    return l.total_reviews ? { total: l.total_reviews, avg: l.avg_rating, unanswered } : { total: 0, avg: 0, unanswered };
  };

  router.get('/google/reviews', (req, res) => {
    const locations = store.googleLocations(req.business.id).filter((l) => l.enabled && (!req.branchId || l.id === req.branchId));
    const wanted = req.branchId || Number(req.query.location);
    const pick = (v, allowed) => (allowed.includes(String(v ?? '')) ? String(v) : '');
    const filters = {
      filter: pick(req.query.filter, ['unanswered', 'answered', 'negative', 'positive']),
      stars: pick(req.query.stars, ['1', '2', '3', '4', '5']),
      text: pick(req.query.text, ['with', 'without']),
      days: pick(req.query.days, ['7', '30', '90', '365']),
      sort: pick(req.query.sort, ['old', 'low', 'high']),
      q: String(req.query.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      location: locations.some((l) => l.id === wanted) ? wanted : '',
    };
    if (!store.googleLocations(req.business.id).length) return res.redirect(303, '/admin/google');
    render(
      req,
      res,
      'ביקורות גוגל',
      V.googleReviewsView({
        reviews: withSuggestions(store, req.business, store.googleReviews(req.business.id, { ...filters, locationId: filters.location || null, stars: Number(filters.stars), days: Number(filters.days), limit: REVIEWS_SHOWN + 1 }), {
          connected: Boolean(google && store.googleConnection(req.business.id)),
          demo: Boolean(req.business.is_demo),
        }),
        csrf: req.user.csrf,
        manages: req.can('manager') || Boolean(req.business.is_demo),
        ai: Boolean(req.business.is_demo) || (Boolean(ctx.ai) && req.plan.ai),
        demo: Boolean(req.business.is_demo),
        replied: req.query.replied === '1',
        replyError: String(req.query.replyErr ?? '').slice(0, 300),
        style: replyStyleOf(req.business),
        tones: REPLY_TONES,
        wa:
          req.can('manager') && !req.business.is_demo
            ? waSendBlock({
                business: req.business,
                campaigns: store.campaignsFor(req.business.id),
                csrf: req.user.csrf,
                waAuto: ctx.whatsapp ? { left: whatsAppLeft(store, req.business), quota: req.plan.waMonthly } : null,
                result: req.query.wa === 'sent' ? { ok: true } : req.query.wa === 'err' ? { ok: false, error: String(req.query.msg ?? '').slice(0, 300) } : null,
                bad: req.query.send === 'bad',
              })
            : null,
        styleSaved: req.query.style === 'saved',
        locations,
        filters,
        summary: req.branchId ? branchSummary(req.business.id, req.branchId, locations) : store.googleSummary(req.business.id),
      }),
    );
  });

  function loadReview(req, res) {
    const r = store.googleReview(Number(req.params.id), req.business.id);
    if (!r || (req.branchId && r.location_id !== req.branchId)) {
      notFound(res);
      return null;
    }
    return r;
  }
  const reviewPage = (req, res, review, extra = {}) =>
    render(
      req,
      res,
      'ביקורת בגוגל',
      V.googleReviewView({
        review,
        csrf: req.user.csrf,
        can: req.can,
        aiAvailable: Boolean(ctx.ai) && req.plan.ai,
        // Replies go through Google only for a connected Business Profile.
        canPublish: review.source === 'gbp' && Boolean(google && store.googleConnection(req.business.id)),
        templates: templatesFor(store.replyTemplates(req.business.id), review.rating).map((t) => ({ title: t.title, text: fillTemplate(t.body, review) })),
        ...extra,
      }),
    );

  router.get('/google/reviews/:id', (req, res) => {
    const review = loadReview(req, res);
    if (review) reviewPage(req, res, review, { saved: req.query.saved === '1' });
  });

  // From the review's page, or from the dashboard (json=1), which puts the draft in place without reloading.
  // How the AI writes replies (Google reviews and private feedback alike).
  router.post('/google/reply-style', manager, (req, res) => {
    const style = replyStyleOf({ reply_style: JSON.stringify({ tone: req.body.tone, emoji: req.body.emoji === '1', sign: String(req.body.sign ?? '').trim(), notes: String(req.body.notes ?? '').trim() }) });
    store.updateBusiness(req.business.id, { reply_style: JSON.stringify(style) });
    res.redirect(303, '/admin/google/reviews?style=saved');
  });

  router.post('/google/reviews/:id/draft', manager, async (req, res) => {
    const review = loadReview(req, res);
    if (!review) return;
    const json = req.body.json === '1';
    const answer = (extra) => (json ? res.status(extra.error ? 400 : 200).json(extra) : reviewPage(req, res, review, extra));
    if (!ctx.ai || !req.plan.ai) return answer({ error: 'עוזר ה-AI לא פעיל.' });
    const over = ctx.usage.take(req.business, 'ai_draft');
    if (over) return answer({ error: over });
    try {
      const draft = await ctx.ai.draftGoogleReply({
        businessName: req.business.name,
        rating: review.rating,
        comment: review.comment,
        reviewer: review.reviewer,
        style: replyStyleOf(req.business),
      });
      answer({ draft });
    } catch (err) {
      ctx.usage.give(req.business, 'ai_draft');
      answer({ error: err instanceof AiError ? err.message : 'ה-AI לא הצליח לנסח טיוטה, נסו שוב.' });
    }
  });

  router.post('/google/reviews/:id/reply', manager, async (req, res) => {
    const review = loadReview(req, res);
    if (!review) return;
    if (review.source !== 'gbp' || !google) return notFound(res);
    const text = String(req.body.reply ?? '').trim().slice(0, 4000);
    // Answered from the reviews list: back there, with the same filters.
    const q = new URLSearchParams(String(req.body.backq ?? ''));
    const keep = new URLSearchParams([...q].filter(([k]) => ['filter', 'stars', 'text', 'days', 'sort', 'q', 'location'].includes(k)));
    const backTo = req.body.back === 'reviews' ? (p) => `/admin/google/reviews?${keep.toString() ? `${keep}&` : ''}${p}` : null;
    if (!text) return backTo ? res.redirect(303, backTo(`replyErr=${encodeURIComponent('התשובה ריקה.')}`)) : reviewPage(req, res, review, { error: 'התשובה ריקה.' });
    try {
      await sync.reply(req.business.id, review, text);
      res.redirect(303, backTo ? backTo('replied=1') : `/admin/google/reviews/${review.id}?saved=1`);
    } catch (err) {
      if (backTo) return res.redirect(303, backTo(`replyErr=${encodeURIComponent(humanError(err))}`));
      reviewPage(req, res, review, { draft: text, error: humanError(err) });
    }
  });

  return router;
}
