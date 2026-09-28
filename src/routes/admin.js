import express from 'express';
import QRCode from 'qrcode';
import { EDITABLE_TEXT_KEYS, LANGUAGES, textsFor } from '../i18n.js';
import { AiError } from '../ai.js';
import { limitLabel } from '../plans.js';
import { normalizeQuestions, STATUSES } from '../store.js';
import { templateQuestions, TEMPLATES } from '../templates.js';
import { clampInt, csvEscape, errorPage, googleReviewUrl, isEmail, safeUrl } from '../util.js';
import { parseJson } from '../db.js';
import * as V from '../views/admin.js';
import { BIZ_COOKIE } from './context.js';

const PAGE_SIZE = 50;

/** Dashboard, responses (tickets), campaigns, QR codes and customer invites. */
export function adminRoutes(ctx) {
  const { store, render, requireRole, notFound } = ctx;
  const admin = express.Router();
  const manager = requireRole('manager');

  admin.get('/switch', (req, res) => {
    const b = req.businesses.find((x) => x.id === Number(req.query.b));
    if (b) res.cookie(BIZ_COOKIE, String(b.id), { ...ctx.cookieOpts, maxAge: 365 * 864e5 });
    res.redirect(303, '/admin');
  });

  // ---------- dashboard ----------
  admin.get('/', (req, res) => {
    const campaigns = store.campaignsFor(req.business.id);
    const campaignId = campaigns.find((c) => c.id === Number(req.query.campaign))?.id ?? null;
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const stats = store.stats(req.business.id, { campaignId, days });
    const prev = store.periodSummary(req.business.id, { campaignId, fromDays: days * 2, toDays: days });
    const waiting = store.listResponses(req.business.id, { campaignId, sentiment: 'negative', status: 'new', limit: 5 });
    const monthly = store.monthlyResponseCount(req.business.id);
    const quotaWarning =
      monthly > req.plan.monthlyResponses
        ? `החודש התקבלו ${monthly} דירוגים, מעל המכסה של ${limitLabel(req.plan.monthlyResponses)} בתוכנית ${req.plan.label}. הסקרים ממשיכים לעבוד, אבל כדאי לשדרג.`
        : '';
    render(req, res, 'לוח בקרה', V.dashboardView({ stats, prev, campaigns, campaignId, days, waiting, userName: req.user.name, quotaWarning, can: req.can }));
  });

  // ---------- responses ----------
  function responseFilters(req) {
    return {
      campaign: req.query.campaign ? String(Number(req.query.campaign) || '') : '',
      sentiment: ['positive', 'negative'].includes(req.query.sentiment) ? req.query.sentiment : '',
      status: Object.hasOwn(STATUSES, req.query.status ?? '') ? req.query.status : '',
      overdue: req.query.overdue === '1' ? '1' : '',
      consent: req.query.consent === '1' ? '1' : '',
      q: String(req.query.q ?? '').trim().slice(0, 80),
    };
  }
  const toQuery = (f) => ({
    campaignId: f.campaign ? Number(f.campaign) : null,
    sentiment: f.sentiment,
    status: f.status,
    overdue: Boolean(f.overdue),
    consent: Boolean(f.consent),
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
    const header = [
      'id', 'date', 'campaign', 'source', 'rating', 'sentiment', 'completed', 'answers', 'comment', 'name',
      'phone', 'email', 'wants_contact', 'publish_consent', 'review_clicks', 'status', 'notes', 'resolved_at',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const labels = Object.fromEntries((campaigns[r.campaign_id]?.questionsList ?? []).map((q) => [q.id, q.label]));
      const answers = Object.entries(parseJson(r.answers, {}))
        .map(([k, v]) => `${labels[k] || k}: ${[].concat(v).join('/')}`)
        .join(' | ');
      lines.push(
        [
          r.id, r.created_at, r.campaign_name, r.source, r.rating, r.sentiment, r.completed, answers, r.comment,
          r.customer_name, r.phone, r.email, r.wants_contact, r.publish_consent,
          parseJson(r.review_clicks, []).join('/'), r.status, r.notes, r.resolved_at ?? '',
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    res.type('text/csv; charset=utf-8');
    res.attachment(`responses-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(`﻿${lines.join('\r\n')}`);
  });

  function loadResponse(req, res) {
    const r = store.responseForBusiness(Number(req.params.id), req.business.id);
    if (!r) notFound(res);
    return r;
  }

  admin.get('/responses/:id', (req, res) => {
    const r = loadResponse(req, res);
    if (!r) return;
    render(
      req,
      res,
      'תגובה',
      V.responseDetailView({
        r,
        csrf: req.user.csrf,
        businessName: req.business.name,
        can: req.can,
        aiAvailable: Boolean(ctx.ai) && req.plan.ai,
        aiReason: !req.plan.ai
          ? 'ניסוח תשובה עם AI זמין בתוכנית מקצועי ומעלה.'
          : 'עוזר ה-AI עוד לא הופעל בשרת. מנהל המערכת צריך להגדיר מפתח AI.',
        widgetAvailable: req.plan.widget,
        aiError: req.query.aierr ? String(req.query.aierr).slice(0, 200) : '',
      }),
    );
  });

  admin.post('/responses/:id', manager, (req, res) => {
    const r = loadResponse(req, res);
    if (!r) return;
    const status = Object.hasOwn(STATUSES, req.body.status) ? req.body.status : r.status;
    store.updateResponseStatus(r.id, status, String(req.body.notes ?? '').slice(0, 5000));
    res.redirect(303, `/admin/responses/${r.id}?ok=1`);
  });

  admin.post('/responses/:id/delete', requireRole('owner'), (req, res) => {
    const r = loadResponse(req, res);
    if (!r) return;
    store.deleteResponse(r.id);
    res.redirect(303, '/admin/responses?ok=1');
  });

  admin.post('/responses/:id/publish', manager, (req, res) => {
    const r = loadResponse(req, res);
    if (!r) return;
    store.setPublished(r.id, req.body.published === '1');
    res.redirect(303, `/admin/responses/${r.id}?ok=1`);
  });

  admin.post('/responses/:id/draft', manager, async (req, res, next) => {
    const r = loadResponse(req, res);
    if (!r) return;
    if (!ctx.ai || !req.plan.ai) return res.status(403).send(errorPage('עוזר ה-AI לא זמין בתוכנית הנוכחית'));
    const labels = Object.fromEntries(normalizeQuestions(parseJson(r.campaign_questions, [])).map((q) => [q.id, q.label]));
    const answers = Object.entries(parseJson(r.answers, {})).map(([k, v]) => [labels[k] || k, [].concat(v).join(', ')]);
    try {
      const text = await ctx.ai.draftReply({
        businessName: req.business.name,
        rating: r.rating,
        answers,
        comment: r.comment,
        customerName: r.customer_name,
      });
      store.setAiDraft(r.id, text.slice(0, 4000));
      res.redirect(303, `/admin/responses/${r.id}#draft`);
    } catch (err) {
      if (!(err instanceof AiError)) return next(err);
      res.redirect(303, `/admin/responses/${r.id}?aierr=${encodeURIComponent(err.message)}`);
    }
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
      lang: Object.hasOwn(LANGUAGES, body.lang) ? body.lang : 'he',
      threshold: clampInt(body.threshold, 2, 5, 4),
      google_review_url: googleReviewUrl(rawGoogle),
      rawGoogle,
      extra_links,
      extraLinks: extra_links,
      questions,
      questionsList: questions,
      texts,
      textsObj: texts,
      reminder_hours: [0, 24, 48, 72, 168].includes(Number(body.reminder_hours)) ? Number(body.reminder_hours) : 48,
      ask_consent: body.ask_consent === '1',
      active: existing.id ? body.active === '1' : true,
    };
  }

  function validateCampaign(c) {
    if (!c.name) return 'יש לתת שם לקמפיין';
    if (c.rawGoogle && !c.google_review_url) return 'קישור הגוגל / Place ID לא תקין';
    return '';
  }

  const campaignLimitReached = (req) => store.campaignsFor(req.business.id).length >= req.plan.campaigns;
  const limitMessage = (req) =>
    `בתוכנית ${req.plan.label} אפשר עד ${limitLabel(req.plan.campaigns)} קמפיינים. לשדרוג פנו למנהל המערכת.`;

  admin.get('/campaigns', (req, res) => {
    render(
      req,
      res,
      'קמפיינים',
      V.campaignsView({
        campaigns: store.campaignsFor(req.business.id),
        baseUrl: ctx.baseUrl(req),
        can: req.can,
        limitReached: campaignLimitReached(req) ? limitMessage(req) : '',
      }),
    );
  });

  const blankCampaign = (template = 'general', lang = 'he') => ({
    name: '',
    lang,
    template,
    threshold: 4,
    google_review_url: '',
    extraLinks: [],
    questionsList: normalizeQuestions(templateQuestions(template, lang)),
    textsObj: {},
    reminder_hours: 48,
    ask_consent: 1,
    active: 1,
  });

  admin.get('/campaigns/new', manager, (req, res) => {
    const error = campaignLimitReached(req) ? limitMessage(req) : '';
    const template = Object.hasOwn(TEMPLATES, req.query.template ?? '') ? req.query.template : null;
    const lang = Object.hasOwn(LANGUAGES, req.query.lang ?? '') ? req.query.lang : 'he';
    if (!template) return render(req, res, 'קמפיין חדש', V.templatePickerView({ error }));
    render(req, res, 'קמפיין חדש', V.campaignFormView({ campaign: blankCampaign(template, lang), csrf: req.user.csrf, error }));
  });

  admin.post('/campaigns', manager, (req, res) => {
    const c = campaignFromForm(req.body);
    const error = campaignLimitReached(req) ? limitMessage(req) : validateCampaign(c);
    if (error) {
      res.status(422);
      return render(req, res, 'קמפיין חדש', V.campaignFormView({ campaign: c, csrf: req.user.csrf, error }));
    }
    const id = store.createCampaign(req.business.id, c);
    res.redirect(303, `/admin/campaigns/${id}/share?ok=1`);
  });

  function loadCampaign(req, res) {
    const c = store.campaign(Number(req.params.id), req.business.id);
    if (!c) notFound(res);
    return c;
  }

  admin.get('/campaigns/:id', manager, (req, res) => {
    const c = loadCampaign(req, res);
    if (c) render(req, res, c.name, V.campaignFormView({ campaign: c, csrf: req.user.csrf }));
  });

  admin.post('/campaigns/:id', manager, (req, res) => {
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

  admin.post('/campaigns/:id/delete', requireRole('owner'), (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    store.deleteCampaign(c.id);
    res.redirect(303, '/admin/campaigns');
  });

  const qrTarget = (req, c) => {
    const src = String(req.query.src ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    return `${ctx.baseUrl(req)}/r/${c.slug}${src ? `?src=${src}` : ''}`;
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
        baseUrl: ctx.baseUrl(req),
        csrf: req.user.csrf,
        invites: store.invitesFor(c.id),
        newInvite,
        businessName: req.business.name,
        can: req.can,
        emailInvites: req.plan.emailInvites,
        mailEnabled: ctx.mailer.enabled,
      }),
      { flash: req.query.ok && !newInvite ? 'הקמפיין נוצר! עכשיו אפשר להדפיס QR או לשלוח ללקוחות' : '' },
    );
  });

  admin.post('/campaigns/:id/invites', manager, async (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const useEmail = req.plan.emailInvites && isEmail(email);
    const t = store.createInvite(c.id, {
      customer_name: String(req.body.customer_name ?? '').trim().slice(0, 80),
      phone: String(req.body.phone ?? '').trim().slice(0, 30),
      email: useEmail ? email : '',
    });
    if (useEmail) {
      const invite = store.inviteByToken(c.id, t);
      if (await ctx.notifier.customerInvite({ business: req.business, campaign: c, invite })) {
        store.markInviteEmailed(invite.id);
      }
    }
    res.redirect(303, `/admin/campaigns/${c.id}/share?invite=${t}`);
  });

  return admin;
}
