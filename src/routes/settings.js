import express from 'express';
import { branchesOf } from '../network.js';
import { usageOf } from '../usage.js';
import multer from 'multer';
import { AiError } from '../ai.js';
import { CYCLES, limitLabel, newBusiness, PLANS, profilesOf } from '../plans.js';
import { normalizeQuestions, roleAtLeast, ROLES } from '../store.js';
import { clampInt, emailList, errorPage, imageMime, isEmail, normalizeInviteTemplate, safeColor, safeUrl } from '../util.js';
import { parseJson } from '../db.js';
import * as V from '../views/settings.js';
import { BIZ_COOKIE } from './context.js';

/** Business settings, notifications, team, widget, plan and AI insights. */
export function settingsRoutes(ctx) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const owner = requireRole('owner');
  const manager = requireRole('manager');

  // ---------- business ----------
  router.get('/business', owner, (req, res) => {
    const error = req.query.err ? String(req.query.err).slice(0, 200) : '';
    render(req, res, 'הגדרות עסק', V.businessView({ business: req.business, csrf: req.user.csrf, plan: req.plan, error }));
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1, fields: 5 } });
  router.post('/business/logo', owner, (req, res, next) => {
    const fail = (msg) => res.redirect(303, `/admin/business?err=${encodeURIComponent(msg)}#logo`);
    upload.single('logo')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return fail('הקובץ גדול מדי (עד 1MB)');
      if (err) return next(err);
      // Trust the file's actual bytes, not its name or the browser's claim.
      const mime = imageMime(req.file?.buffer);
      if (!mime) return fail('הקובץ חייב להיות תמונה מסוג PNG, JPG, WebP או GIF');
      store.setLogo(req.business.id, { mime, data: req.file.buffer });
      res.redirect(303, '/admin/business?ok=1#logo');
    });
  });

  router.post('/business/logo/delete', owner, (req, res) => {
    store.removeLogo(req.business.id);
    res.redirect(303, '/admin/business?ok=1#logo');
  });

  router.post('/business', owner, (req, res) => {
    const b = req.business;
    store.updateBusiness(b.id, {
      name: String(req.body.name ?? '').trim().slice(0, 100) || b.name,
      logo_url: safeUrl(req.body.logo_url),
      brand_color: safeColor(req.body.brand_color, b.brand_color),
    });
    res.redirect(303, '/admin/business?ok=1');
  });

  router.post('/business/invite-message', owner, (req, res) => {
    const reset = req.body.reset === '1';
    store.updateBusiness(req.business.id, { invite_template: reset ? '' : normalizeInviteTemplate(req.body.invite_template) });
    res.redirect(303, '/admin/business?ok=1#invite-message');
  });

  router.post('/business/notifications', owner, (req, res) => {
    store.updateBusiness(req.business.id, {
      alert_negative: req.body.alert_negative === '1',
      alert_drops: req.body.alert_drops === '1',
      weekly_report: req.body.weekly_report === '1',
      monthly_report: req.body.monthly_report === '1',
      followup_auto: req.body.followup_auto === '1',
      alert_emails: emailList(req.body.alert_emails).join(', '),
      sla_hours: clampInt(req.body.sla_hours, 0, 720, 24),
      webhook_url: safeUrl(req.body.webhook_url),
    });
    res.redirect(303, '/admin/business?ok=1#notifications');
  });

  router.post('/businesses', (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 100);
    if (!name) return res.redirect(303, '/admin/business');
    const id = store.createBusiness(req.user.id, newBusiness(name));
    res.cookie(BIZ_COOKIE, String(id), { ...ctx.cookieOpts, maxAge: 365 * 864e5 });
    res.redirect(303, '/admin/campaigns/new');
  });

  // ---------- team ----------
  const seatsUsed = (businessId) => store.membersOf(businessId).length + store.pendingTeamInvites(businessId).length;

  router.get('/team', owner, (req, res) => {
    render(
      req,
      res,
      'צוות',
      V.teamView({
        members: store.membersOf(req.business.id),
        invites: store.pendingTeamInvites(req.business.id),
        branches: branchesOf(store, req.business.id),
        csrf: req.user.csrf,
        me: req.user,
        plan: req.plan,
        seatsUsed: seatsUsed(req.business.id),
        inviteLink: req.query.link ? `${ctx.baseUrl(req)}/join/${String(req.query.link)}` : '',
        error: req.query.err ? String(req.query.err).slice(0, 200) : '',
      }),
    );
  });

  router.post('/team/invite', owner, async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const role = Object.hasOwn(ROLES, req.body.role) ? req.body.role : 'viewer';
    const fail = (msg) => res.redirect(303, `/admin/team?err=${encodeURIComponent(msg)}`);
    if (!isEmail(email)) return fail('אימייל לא תקין');
    if (seatsUsed(req.business.id) >= req.plan.teamMembers) {
      return fail(`בתוכנית ${req.plan.label} אפשר עד ${limitLabel(req.plan.teamMembers)} משתמשים`);
    }
    if (store.membersOf(req.business.id).some((m) => m.email === email)) return fail('המשתמש כבר בצוות');
    const branch = branchesOf(store, req.business.id).find((b) => b.id === Number(req.body.location));
    const raw = store.createTeamInvite(req.business.id, { email, role, invitedBy: req.user.id, locationId: branch?.id || null });
    await ctx.notifier.teamInvite({
      business: req.business,
      inviter: req.user,
      email,
      role: ROLES[role],
      link: `${ctx.baseUrl(req)}/join/${raw}`,
    });
    // The link is also shown once, so it can be shared manually (e.g. when SMTP is not configured).
    res.redirect(303, `/admin/team?link=${raw}`);
  });

  router.post('/team/invites/:id/delete', owner, (req, res) => {
    store.deleteTeamInvite(req.business.id, Number(req.params.id));
    res.redirect(303, '/admin/team');
  });

  router.post('/team/members/:id', owner, (req, res) => {
    const userId = Number(req.params.id);
    const member = store.membersOf(req.business.id).find((m) => m.id === userId);
    if (!member) return ctx.notFound(res);
    const fail = (msg) => res.redirect(303, `/admin/team?err=${encodeURIComponent(msg)}`);
    const lastOwner = member.role === 'owner' && store.countOwners(req.business.id) <= 1;
    if (req.body.action === 'remove') {
      if (lastOwner) return fail('אי אפשר להסיר את הבעלים האחרון');
      store.removeMember(req.business.id, userId);
    } else if (req.body.action === 'branch') {
      const branch = branchesOf(store, req.business.id).find((b) => b.id === Number(req.body.location));
      store.setMemberBranch(req.business.id, userId, branch?.id || null);
    } else {
      const role = Object.hasOwn(ROLES, req.body.role) ? req.body.role : member.role;
      if (lastOwner && role !== 'owner') return fail('חייב להישאר לפחות בעלים אחד');
      store.setMemberRole(req.business.id, userId, role);
    }
    res.redirect(303, '/admin/team?ok=1');
  });

  // ---------- widget ----------
  router.get('/widget', manager, (req, res) => {
    store.ensureWidgetKey(req.business.id);
    const business = store.businessById(req.business.id);
    render(
      req,
      res,
      'ווידג\'ט לאתר',
      V.widgetView({
        business,
        baseUrl: ctx.baseUrl(req),
        csrf: req.user.csrf,
        available: req.plan.widget,
        published: store.publishedTestimonials(business.id, 50),
        pending: store
          .listResponses(business.id, { consent: true, limit: 50 })
          .filter((r) => !r.published),
        canEdit: roleAtLeast(req.role, 'owner'),
      }),
    );
  });

  router.post('/widget', owner, (req, res) => {
    store.updateBusiness(req.business.id, { widget_auto_publish: req.body.widget_auto_publish === '1' });
    res.redirect(303, '/admin/widget?ok=1');
  });

  // ---------- integrations (API keys) ----------
  router.get('/integrations', owner, (req, res) => {
    const campaigns = store.campaignsFor(req.business.id);
    render(
      req,
      res,
      'חיבורים',
      V.integrationsView({
        keys: store.apiKeysFor(req.business.id),
        newKey: req.query.key ? String(req.query.key).slice(0, 80) : '',
        csrf: req.user.csrf,
        baseUrl: ctx.baseUrl(req),
        available: req.plan.api,
        campaign: campaigns.find((c) => c.active) || campaigns[0] || null,
      }),
    );
  });

  router.post('/integrations/keys', owner, (req, res) => {
    if (!req.plan.api) return res.status(403).send(errorPage('החיבורים אינם כלולים במסלול הנוכחי'));
    const name = String(req.body.name ?? '').trim().slice(0, 60) || 'מפתח';
    const raw = store.createApiKey(req.business.id, { name, createdBy: req.user.id });
    // Shown exactly once, right after creation.
    res.redirect(303, `/admin/integrations?key=${encodeURIComponent(raw)}`);
  });

  router.post('/integrations/keys/:id/revoke', owner, (req, res) => {
    store.revokeApiKey(req.business.id, Number(req.params.id));
    res.redirect(303, '/admin/integrations?ok=1');
  });

  // ---------- plan ----------
  // With Cardcom configured the owner pays by card on Cardcom's page; without
  // it (or for a chain's quote) the owner asks and the operator activates.
  router.post('/plan/request', owner, async (req, res) => {
    const plan = Object.hasOwn(PLANS, req.body.plan) ? req.body.plan : null;
    const cycle = Object.hasOwn(CYCLES, req.body.cycle) ? req.body.cycle : 'monthly';
    if (!plan) return res.redirect(303, '/admin/plan');
    const billing = ctx.billing;
    if (billing && PLANS[plan].price != null) {
      try {
        if (billing.hasCardPlan(req.business)) {
          const r = await billing.changePlan({ business: req.business, email: req.user.email, plan, cycle });
          return res.redirect(303, `/admin/plan?change=${r.status}${r.error ? `&err=${encodeURIComponent(r.error)}` : ''}`);
        }
        return res.redirect(303, await billing.startCheckout({ business: req.business, email: req.user.email, plan, cycle, baseUrl: ctx.baseUrl(req) }));
      } catch (err) {
        console.error('[billing] checkout failed:', err.message);
        return res.redirect(303, `/admin/plan?err=${encodeURIComponent('לא הצלחנו לפתוח את דף התשלום. נסו שוב בעוד כמה דקות.')}`);
      }
    }
    store.updateBusiness(req.business.id, {
      plan_request: JSON.stringify({ plan, cycle, by: req.user.email, at: new Date().toISOString() }),
    });
    await ctx.notifier
      ?.planRequested({ business: req.business, plan: PLANS[plan], cycle: CYCLES[cycle], user: req.user, admins: ctx.adminEmails() })
      .catch((err) => console.error('[notify] planRequested failed:', err));
    res.redirect(303, '/admin/plan?requested=1');
  });

  // Cardcom sends the customer back here after the payment page.
  router.get('/billing/done', async (req, res) => {
    const payment = ctx.billing && store.paymentById(Number(req.query.p));
    if (!payment || payment.business_id !== req.business.id) return res.redirect(303, '/admin/plan');
    try {
      const after = await ctx.billing.complete(payment.id, { failed: req.query.failed === '1' });
      if (after.status === 'paid') return res.redirect(303, '/admin/plan?paid=1');
      return res.redirect(303, `/admin/plan?err=${encodeURIComponent(after.status === 'failed' ? `התשלום לא עבר${after.error ? `: ${after.error}` : ''}` : 'התשלום עוד לא אושר. אם חויבתם, הוא יופיע כאן בעוד כמה דקות.')}`);
    } catch (err) {
      console.error('[billing] completing failed:', err.message);
      return res.redirect(303, `/admin/plan?err=${encodeURIComponent('לא הצלחנו לאמת את התשלום מול חברת הסליקה. אם חויבתם, הוא יופיע כאן בעוד כמה דקות.')}`);
    }
  });

  router.post('/billing/auto-renew', owner, (req, res) => {
    if (ctx.billing) ctx.billing.setAutoRenew(req.business, req.body.on === '1');
    res.redirect(303, '/admin/plan?renew=' + (req.body.on === '1' ? 'on' : 'off'));
  });

  router.get('/plan', (req, res) => {
    render(
      req,
      res,
      'התוכנית שלי',
      V.planView({
        business: req.business,
        plan: req.plan,
        access: req.access,
        request: parseJson(req.business.plan_request, null),
        requested: req.query.requested === '1',
        csrf: req.user.csrf,
        can: req.can,
        cardBilling: Boolean(ctx.billing),
        actionUsage: usageOf(store, req.business),
        payments: store.paymentsFor(req.business.id, 12).filter((p) => p.status !== 'pending'),
        notice: req.query.paid
          ? 'התשלום עבר. המסלול פעיל, והחשבונית נשלחה למייל.'
          : { upgraded: 'המסלול שודרג.', scheduled: 'השינוי ייכנס לתוקף בחידוש הבא.', kept: 'המסלול נשאר כמו שהוא.' }[req.query.change] ||
            { on: 'החידוש האוטומטי פעיל.', off: 'החידוש האוטומטי בוטל. המסלול פעיל עד סוף התקופה ששולמה.' }[req.query.renew] ||
            '',
        error: String(req.query.err ?? '').slice(0, 300),
        profiles: profilesOf(store, req.business.id),
        usage: {
          campaigns: store.campaignsFor(req.business.id).length,
          members: store.membersOf(req.business.id).length,
          responses: store.monthlyResponseCount(req.business.id),
        },
      }),
    );
  });

  // ---------- AI insights ----------
  router.get('/insights', (req, res) => {
    render(
      req,
      res,
      'תובנות AI',
      V.insightsView({
        insights: store.insightsFor(req.business.id),
        campaigns: store.campaignsFor(req.business.id),
        csrf: req.user.csrf,
        aiConfigured: Boolean(ctx.ai),
        planAllows: req.plan.ai,
        canGenerate: req.can('manager'),
        error: req.query.err ? String(req.query.err).slice(0, 300) : '',
      }),
    );
  });

  router.post('/insights', manager, async (req, res, next) => {
    if (!ctx.ai || !req.plan.ai) return res.status(403).send(errorPage('עוזר ה-AI לא זמין בתוכנית הנוכחית'));
    const days = [7, 30, 90].includes(Number(req.body.days)) ? Number(req.body.days) : 30;
    const campaign = store.campaign(Number(req.body.campaign), req.business.id);
    const rows = store.responsesForInsights(req.business.id, { campaignId: campaign?.id, days });
    const fail = (msg) => res.redirect(303, `/admin/insights?err=${encodeURIComponent(msg)}`);
    if (rows.length < 3) return fail('צריך לפחות 3 משובים בתקופה שנבחרה כדי להפיק תובנות');
    const prepared = rows.map((r) => {
      const labels = Object.fromEntries(normalizeQuestions(parseJson(r.questions, [])).map((q) => [q.id, q.label]));
      return {
        rating: r.rating,
        comment: r.comment,
        answers: Object.entries(parseJson(r.answers, {})).map(([k, v]) => [labels[k] || k, [].concat(v).join(', ')]),
      };
    });
    const over = ctx.usage.take(req.business, 'insights');
    if (over) return fail(over);
    try {
      const content = await ctx.ai.summarize({ businessName: req.business.name, days, rows: prepared });
      store.saveInsight({
        business_id: req.business.id,
        campaign_id: campaign?.id,
        days,
        response_count: rows.length,
        content,
        created_by: req.user.id,
      });
      res.redirect(303, '/admin/insights');
    } catch (err) {
      ctx.usage.give(req.business, 'insights');
      if (!(err instanceof AiError)) return next(err);
      fail(err.message);
    }
  });

  return router;
}
