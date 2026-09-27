import express from 'express';
import { textsFor } from '../i18n.js';
import { sendWebhook } from '../notify.js';
import { parseJson } from '../db.js';
import { errorPage, safeUrl, token } from '../util.js';
import { messageView, questionsView, ratingView, thanksView } from '../views/public.js';

const VISITOR_COOKIE = 'vid';

function visitorId(req, res) {
  let vid = req.cookies[VISITOR_COOKIE];
  if (!vid || !/^[\w-]{10,40}$/.test(vid)) {
    vid = token(12);
    res.cookie(VISITOR_COOKIE, vid, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 864e5 });
  }
  return vid;
}

/** Tiny in-memory limiter so the public endpoints can't be flooded from one IP. */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return next();
    }
    entry.count++;
    if (entry.count > max) return res.status(429).send(errorPage('יותר מדי בקשות, נסו שוב בעוד כמה דקות'));
    next();
  };
}

function questionsFor(campaign, sentiment) {
  return campaign.questionsList.filter((q) => q.audience === 'all' || q.audience === sentiment);
}

export function publicRoutes(store, { publicLimit = { windowMs: 10 * 60e3, max: 30 } } = {}) {
  const router = express.Router();
  const limit = rateLimiter(publicLimit);

  function loadCampaign(slug) {
    const campaign = store.campaignBySlug(slug);
    if (!campaign) return null;
    return { campaign, business: store.businessById(campaign.business_id), t: textsFor(campaign) };
  }

  function loadResponse(tok) {
    const response = store.responseByToken(tok);
    if (!response) return null;
    const campaign = store.campaignById(response.campaign_id);
    return { response, campaign, business: store.businessById(campaign.business_id), t: textsFor(campaign) };
  }

  // Step 1: QR scan / link open -> rating screen
  router.get('/r/:slug', (req, res) => {
    const ctx = loadCampaign(req.params.slug);
    if (!ctx) return res.status(404).send(messageView({ message: 'הקישור לא נמצא' }));
    const { campaign, business, t } = ctx;
    if (!campaign.active) return res.send(messageView({ t, business, campaign, message: t.inactive }));

    const vid = visitorId(req, res);
    const src = String(req.query.src ?? '').slice(0, 60);
    const invite = req.query.i ? store.inviteByToken(campaign.id, String(req.query.i)) : null;
    if (invite) store.markInviteOpened(invite.id);
    store.logEvent(campaign.id, 'scan', { source: invite ? 'invite' : src, visitorId: vid });
    res.send(ratingView({ campaign, business, t, src, invite }));
  });

  router.post('/r/:slug/rate', limit, (req, res) => {
    const ctx = loadCampaign(req.params.slug);
    if (!ctx || !ctx.campaign.active) return res.redirect(303, `/r/${encodeURIComponent(req.params.slug)}`);
    const { campaign } = ctx;
    const rating = Number.parseInt(req.body.rating, 10);
    if (!(rating >= 1 && rating <= 5)) return res.redirect(303, `/r/${campaign.slug}`);

    const vid = visitorId(req, res);
    const invite = req.body.i ? store.inviteByToken(campaign.id, String(req.body.i)) : null;
    const source = invite ? 'invite' : String(req.body.src ?? '').slice(0, 60);
    const sentiment = rating >= campaign.threshold ? 'positive' : 'negative';
    const tok = store.createResponse({
      campaign_id: campaign.id,
      visitor_id: vid,
      invite_id: invite?.id,
      source,
      rating,
      sentiment,
    });
    store.logEvent(campaign.id, 'rate', { source, visitorId: vid, meta: String(rating) });
    if (invite) store.markInviteResponded(invite.id);
    res.redirect(303, `/f/${tok}`);
  });

  // Step 2: follow-up questions (tailored to the rating)
  router.get('/f/:token', (req, res) => {
    const ctx = loadResponse(req.params.token);
    if (!ctx) return res.status(404).send(messageView({ message: 'הקישור לא נמצא' }));
    if (ctx.response.completed) return res.redirect(303, `/t/${ctx.response.token}`);
    const invite = ctx.response.invite_id
      ? store.db.prepare('SELECT customer_name, phone FROM invites WHERE id = ?').get(ctx.response.invite_id)
      : null;
    res.send(
      questionsView({
        ...ctx,
        questions: questionsFor(ctx.campaign, ctx.response.sentiment),
        prefill: invite || {},
      }),
    );
  });

  router.post('/f/:token', limit, (req, res) => {
    const ctx = loadResponse(req.params.token);
    if (!ctx) return res.status(404).send(messageView({ message: 'הקישור לא נמצא' }));
    const { response, campaign, business } = ctx;
    if (response.completed) return res.redirect(303, `/t/${response.token}`);

    const questions = questionsFor(campaign, response.sentiment);
    const answers = {};
    const errors = {};
    for (const q of questions) {
      let v = req.body[`q_${q.id}`];
      if (q.type === 'multi') {
        v = [].concat(v ?? []).map(String).filter((o) => q.options.includes(o));
      } else if (q.type === 'choice') {
        v = q.options.includes(String(v)) ? String(v) : '';
      } else if (q.type === 'nps') {
        const n = Number.parseInt(v, 10);
        v = n >= 0 && n <= 10 ? n : '';
      } else {
        v = String(v ?? '').trim().slice(0, 2000);
      }
      const empty = v === '' || (Array.isArray(v) && v.length === 0);
      if (q.required && empty) errors[q.id] = true;
      if (!empty) answers[q.id] = v;
    }
    if (Object.keys(errors).length) {
      return res.status(422).send(questionsView({ ...ctx, questions, values: req.body, errors }));
    }

    const data = {
      answers,
      comment: String(req.body.comment ?? '').trim().slice(0, 3000),
      customer_name: String(req.body.customer_name ?? '').trim().slice(0, 100),
      phone: String(req.body.phone ?? '').trim().slice(0, 30),
      email: String(req.body.email ?? '').trim().slice(0, 120),
      wants_contact: req.body.wants_contact === '1',
    };
    store.completeResponse(response.id, data);
    store.logEvent(campaign.id, 'complete', { source: response.source, visitorId: response.visitor_id });

    sendWebhook(business, response.sentiment === 'negative' ? 'feedback.negative' : 'feedback.positive', {
      campaign: { id: campaign.id, name: campaign.name },
      response: {
        id: response.id,
        rating: response.rating,
        sentiment: response.sentiment,
        source: response.source,
        question_labels: Object.fromEntries(questions.map((q) => [q.id, q.label])),
        ...data,
        admin_url: `${req.protocol}://${req.get('host')}/admin/responses/${response.id}`,
      },
    });
    res.redirect(303, `/t/${response.token}`);
  });

  // Step 3: thank-you + review links
  router.get('/t/:token', (req, res) => {
    const ctx = loadResponse(req.params.token);
    if (!ctx) return res.status(404).send(messageView({ message: 'הקישור לא נמצא' }));
    res.send(thanksView(ctx));
  });

  // Tracked outbound click to a review platform
  router.get('/go/:token/:platform', (req, res) => {
    const ctx = loadResponse(req.params.token);
    if (!ctx) return res.status(404).send(messageView({ message: 'הקישור לא נמצא' }));
    const { response, campaign } = ctx;
    const key = req.params.platform;
    let url = '';
    if (key === 'google') url = campaign.google_review_url;
    else if (/^\d+$/.test(key)) url = campaign.extraLinks[Number(key)]?.url;
    url = safeUrl(url);
    if (!url) return res.redirect(303, `/t/${response.token}`);
    const platform = key === 'google' ? 'google' : campaign.extraLinks[Number(key)].label;
    const clicks = parseJson(response.review_clicks, []);
    if (!clicks.includes(platform)) {
      store.addReviewClick(response.id, platform);
      store.logEvent(campaign.id, 'review_click', {
        source: response.source,
        visitorId: response.visitor_id,
        meta: platform,
      });
    }
    res.redirect(302, url);
  });

  return router;
}
