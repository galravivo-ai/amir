import express from 'express';
import { resolvePeriod } from '../period.js';
import { designToSave, posterDesign } from '../poster.js';
import QRCode from 'qrcode';
import { EDITABLE_TEXT_KEYS, LANGUAGES, textsFor } from '../i18n.js';
import { AiError, TOPICS } from '../ai.js';
import { limitLabel } from '../plans.js';
import { normalizeQuestions, STATUSES } from '../store.js';
import { templateQuestions, TEMPLATES } from '../templates.js';
import { clampInt, csvEscape, errorPage, googleReviewUrl, inviteMessage, isEmail, normalizeInviteTemplate, safeUrl, waLink, waNumber } from '../util.js';
import { parseJson } from '../db.js';
import { sendWhatsAppInvite, whatsAppLeft } from '../whatsapp.js';
import { weekKey, weeklyTasks } from '../tasks.js';
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
  admin.post('/onboarding/dismiss', manager, (req, res) => {
    store.setOnboardingFlag(req.business.id, 'dismissed');
    res.redirect(303, '/admin');
  });

  admin.post('/tasks/:key/done', (req, res) => {
    store.markTaskDone(req.business.id, weekKey(), String(req.params.key).slice(0, 60));
    res.redirect(303, '/admin#tasks');
  });

  admin.get('/', (req, res) => {
    const campaigns = store.campaignsFor(req.business.id);
    const onboarding = store.onboarding(req.business);
    const campaignId = campaigns.find((c) => c.id === Number(req.query.campaign))?.id ?? null;
    const period = resolvePeriod(req.query);
    const range = { campaignId, from: period.from, to: period.to };
    const stats = store.stats(req.business.id, range);
    const span = (period.to ?? Date.now()) - period.from;
    const prev = store.periodSummary(req.business.id, { campaignId, from: period.from - span, to: period.from });
    const topics = store.topicCounts(req.business.id, range);
    const waiting = store.listResponses(req.business.id, { campaignId, sentiment: 'negative', status: 'new', limit: 5 });
    const monthly = store.monthlyResponseCount(req.business.id);
    const quotaWarning =
      monthly > req.plan.monthlyResponses
        ? `החודש התקבלו ${monthly} דירוגים, מעל המכסה של ${limitLabel(req.plan.monthlyResponses)} בתוכנית ${req.plan.label}. הסקרים ממשיכים לעבוד, אבל כדאי לשדרג.`
        : '';
    const google = store.googleStats(req.business.id, range);
    render(
      req,
      res,
      'לוח בקרה',
      V.dashboardView({
        stats,
        prev,
        campaigns,
        campaignId,
        period,
        business: req.business,
        waiting,
        topics,
        google,
        userName: req.user.name,
        quotaWarning,
        can: req.can,
        onboarding,
        csrf: req.user.csrf,
        sendError: req.query.send === 'bad',
        tasks: req.can('manager') ? weeklyTasks(store, req.business, { serpOn: Boolean(ctx.serp), aiOn: Boolean(ctx.ai) && req.plan.ai }) : [],
        waAuto: ctx.whatsapp ? { left: whatsAppLeft(store, req.business), quota: req.plan.waMonthly } : null,
        waResult: req.query.wa === 'sent' ? { ok: true } : req.query.wa === 'err' ? { ok: false, error: String(req.query.msg ?? '').slice(0, 300) } : null,
      }),
    );
  });

  // ---------- responses ----------
  function responseFilters(req) {
    return {
      campaign: req.query.campaign ? String(Number(req.query.campaign) || '') : '',
      sentiment: ['positive', 'negative'].includes(req.query.sentiment) ? req.query.sentiment : '',
      status: Object.hasOwn(STATUSES, req.query.status ?? '') ? req.query.status : '',
      overdue: req.query.overdue === '1' ? '1' : '',
      consent: req.query.consent === '1' ? '1' : '',
      tag: TOPICS.includes(req.query.tag) ? req.query.tag : '',
      staff: req.query.staff ? String(Number(req.query.staff) || '') : '',
      q: String(req.query.q ?? '').trim().slice(0, 80),
    };
  }
  const toQuery = (f) => ({
    campaignId: f.campaign ? Number(f.campaign) : null,
    sentiment: f.sentiment,
    status: f.status,
    overdue: Boolean(f.overdue),
    consent: Boolean(f.consent),
    tag: f.tag,
    staffId: f.staff ? Number(f.staff) : null,
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
      filters.sentiment === 'negative' && filters.status === 'new' ? 'לקוחות לא מרוצים' : 'תגובות מסקרים',
      V.responsesView({
        rows: rows.slice(0, PAGE_SIZE),
        hasMore: rows.length > PAGE_SIZE,
        page,
        filters,
        campaigns: store.campaignsFor(req.business.id),
        staff: store.staffFor(req.business.id),
      }),
    );
  });

  admin.get('/responses.csv', (req, res) => {
    const rows = store.listResponses(req.business.id, { ...toQuery(responseFilters(req)), limit: 100000 });
    const campaigns = Object.fromEntries(store.campaignsFor(req.business.id).map((c) => [c.id, c]));
    const header = [
      'id', 'date', 'campaign', 'source', 'staff', 'rating', 'sentiment', 'completed', 'answers', 'comment', 'name',
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
          r.id, r.created_at, r.campaign_name, r.source, r.staff_name ?? '', r.rating, r.sentiment, r.completed, answers, r.comment,
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
        followupUrl: r.followup_token ? `${ctx.baseUrl(req)}/c/${r.followup_token}` : '',
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

  admin.post('/responses/:id', manager, async (req, res) => {
    const r = loadResponse(req, res);
    if (!r) return;
    const status = Object.hasOwn(STATUSES, req.body.status) ? req.body.status : r.status;
    store.updateResponseStatus(r.id, status, String(req.body.notes ?? '').slice(0, 5000));
    // Closing a complaint: ask the customer whether it helped (once).
    if (status === 'resolved' && r.sentiment === 'negative' && r.recovered === null) {
      const t = store.ensureFollowupToken(r.id);
      if (r.email && !r.followup_sent_at && req.business.followup_auto) {
        const sent = await ctx.notifier.followUp({ business: req.business, response: r, link: `${ctx.baseUrl(req)}/c/${t}` });
        if (sent) store.markFollowupSent(r.id);
      }
    }
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
    const over = ctx.usage.take(req.business, 'ai_draft');
    if (over) return res.redirect(303, `/admin/responses/${r.id}?aierr=${encodeURIComponent(over)}`);
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
      ctx.usage.give(req.business, 'ai_draft');
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
      ask_staff: body.ask_staff === '1',
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
    `במסלול ${req.plan.label} אפשר עד ${limitLabel(req.plan.campaigns)} ${req.plan.campaigns === 1 ? 'סניף (קמפיין)' : 'סניפים (קמפיינים)'}. למסלול עם יותר סניפים: "התוכנית שלי" בתפריט.`;

  admin.get('/campaigns', (req, res) => {
    render(
      req,
      res,
      'קמפיינים',
      V.campaignsView({
        campaigns: store.campaignsFor(req.business.id),
        summaries: Object.fromEntries(
          store.campaignsFor(req.business.id).map((c) => [c.id, store.periodSummary(req.business.id, { campaignId: c.id, fromDays: 30 })]),
        ),
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
    const params = new URLSearchParams();
    const src = String(req.query.src ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    if (src) params.set('src', src);
    // An employee's personal QR: ratings through it count for that employee.
    const staff = store.staffByCode(req.business.id, req.query.e);
    if (staff) params.set('e', staff.code);
    const qs = params.toString();
    return `${ctx.baseUrl(req)}/r/${c.slug}${qs ? `?${qs}` : ''}`;
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

  // The poster designer: size, look, colors and texts, with a live preview,
  // print / PDF and PNG download. The design is saved per campaign.
  admin.get('/campaigns/:id/poster', async (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const qrSvg = await QRCode.toString(qrTarget(req, c), { type: 'svg', ...QR_OPTS });
    store.setOnboardingFlag(req.business.id, 'poster');
    const staff = store.staffByCode(req.business.id, req.query.e);
    const t = textsFor(c);
    res.send(
      V.posterView({
        campaign: c,
        business: req.business,
        qrSvg,
        t,
        staff,
        design: posterDesign(c.poster_design, { business: req.business, t, staff }),
        csrf: req.user.csrf,
        canEdit: req.can('manager'),
        src: String(req.query.src ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40),
        saved: req.query.saved === '1',
      }),
    );
  });

  admin.post('/campaigns/:id/poster', manager, (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const staff = store.staffByCode(req.business.id, req.body.e);
    store.setPosterDesign(c.id, designToSave(req.body, { business: req.business, t: textsFor(c), staff }));
    const back = new URLSearchParams({ saved: '1' });
    for (const k of ['e', 'src']) if (req.body[k]) back.set(k, String(req.body[k]).slice(0, 40));
    res.redirect(303, `/admin/campaigns/${c.id}/poster?${back}`);
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
        inviteTemplate: req.business.invite_template,
        can: req.can,
        emailInvites: req.plan.emailInvites,
        mailEnabled: ctx.mailer.enabled,
        waAuto: Boolean(ctx.whatsapp),
      }),
      { flash: req.query.ok && !newInvite ? 'הקמפיין נוצר! עכשיו אפשר להדפיס QR או לשלוח ללקוחות' : '' },
    );
  });

  admin.post('/campaigns/:id/invites', manager, async (req, res) => {
    const c = loadCampaign(req, res);
    if (!c) return;
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const useEmail = req.plan.emailInvites && isEmail(email);
    const phone = String(req.body.phone ?? '').trim().slice(0, 30);
    const t = store.createInvite(c.id, {
      customer_name: String(req.body.customer_name ?? '').trim().slice(0, 80),
      phone,
      email: useEmail ? email : '',
    });
    if (ctx.whatsapp && req.body.wa === '1' && waNumber(phone).length >= 11) {
      await sendWhatsAppInvite({ store, whatsapp: ctx.whatsapp, business: req.business, campaign: c, invite: store.inviteByToken(c.id, t), baseUrl: ctx.baseUrl(req) });
    }
    if (useEmail) {
      const invite = store.inviteByToken(c.id, t);
      if (await ctx.notifier.customerInvite({ business: req.business, campaign: c, invite })) {
        store.markInviteEmailed(invite.id);
      }
    }
    res.redirect(303, `/admin/campaigns/${c.id}/share?invite=${t}`);
  });

  // The menu's "QR poster": the first active campaign's designer.
  admin.get('/poster', (req, res) => {
    const campaigns = store.campaignsFor(req.business.id);
    const c = campaigns.find((x) => x.active) || campaigns[0];
    res.redirect(303, c ? `/admin/campaigns/${c.id}/poster` : '/admin/campaigns/new');
  });

  // Quick send from anywhere: a personal survey link, opened straight in WhatsApp
  // with the message ready, so sending takes two taps.
  admin.post('/send', manager, async (req, res) => {
    const campaigns = store.campaignsFor(req.business.id);
    const c = campaigns.find((x) => x.id === Number(req.body.campaign)) || campaigns[0];
    const phone = String(req.body.phone ?? '').trim().slice(0, 30);
    if (!c || waNumber(phone).length < 9) return res.redirect(303, '/admin?send=bad');
    const name = String(req.body.customer_name ?? '').trim().slice(0, 80);
    const t = store.createInvite(c.id, { customer_name: name, phone });
    // Sent for them from the platform's WhatsApp number, without opening WhatsApp.
    if (req.body.via === 'auto' && ctx.whatsapp) {
      const r = await sendWhatsAppInvite({ store, whatsapp: ctx.whatsapp, business: req.business, campaign: c, invite: store.inviteByToken(c.id, t), baseUrl: ctx.baseUrl(req) });
      return res.redirect(303, r.ok ? '/admin?wa=sent' : `/admin?wa=err&msg=${encodeURIComponent(r.error)}`);
    }
    const link = `${ctx.baseUrl(req)}/r/${c.slug}?i=${t}`;
    // The text edited in the send window for this customer, else the business's wording.
    const template = normalizeInviteTemplate(req.body.message) || req.business.invite_template;
    res.redirect(303, waLink(phone, inviteMessage({ name, businessName: req.business.name, link, template })));
  });

  return admin;
}
