import express from 'express';
import { monthKey } from '../usage.js';
import { lastBackupAge } from '../backup.js';
import { statusView } from '../views/status.js';
import { CYCLES, PLANS, TRIAL_DAYS } from '../plans.js';
import * as V from '../views/settings.js';

/** System-wide administration: businesses, plans, users and the email outbox. */
export function superadminRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();
  router.use(ctx.requireSuperadmin);

  router.get('/', (req, res) => {
    render(
      req,
      res,
      'ניהול מערכת',
      V.superadminView({
        leads: store.recentLeads(),
        businesses: store.allBusinesses(),
        users: store.allUsers(),
        outbox: store.recentOutbox(50),
        agencies: store.allAgencies(),
        error: req.query.err ? String(req.query.err).slice(0, 200) : '',
        csrf: req.user.csrf,
        mailEnabled: ctx.mailer.enabled,
        aiEnabled: Boolean(ctx.ai),
        aiTest: req.query.ai === 'ok' ? { ok: true, text: String(req.query.t ?? '').slice(0, 80) } : req.query.ai === 'err' ? { ok: false, error: String(req.query.t ?? '').slice(0, 300) } : null,
        meId: req.user.id,
      }),
    );
  });

  const domainOk = (d) => /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);

  router.post('/agencies', (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 100);
    const user = store.userByEmail(String(req.body.email ?? '').trim());
    if (!name || !user) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('צריך שם ואימייל של משתמש רשום'));
    const id = store.createAgency({ name });
    store.addAgencyMember(id, user.id);
    res.redirect(303, '/superadmin?ok=1#agencies');
  });

  router.post('/agencies/:id', (req, res) => {
    const agency = store.agencyById(Number(req.params.id));
    if (!agency) return ctx.notFound(res);
    const domain = String(req.body.custom_domain ?? '').trim().toLowerCase();
    if (domain && !domainOk(domain)) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('דומיין לא תקין'));
    const taken = domain && store.agencyByDomain(domain);
    if (taken && taken.id !== agency.id) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('הדומיין כבר בשימוש'));
    store.updateAgency(agency.id, {
      custom_domain: domain || null,
      max_clients: Math.min(10000, Math.max(1, Number.parseInt(req.body.max_clients, 10) || agency.max_clients)),
      default_plan: Object.hasOwn(PLANS, req.body.default_plan) ? req.body.default_plan : agency.default_plan,
    });
    res.redirect(303, '/superadmin?ok=1#agencies');
  });

  router.post('/agencies/:id/members', (req, res) => {
    const agency = store.agencyById(Number(req.params.id));
    const user = store.userByEmail(String(req.body.email ?? '').trim());
    if (!agency || !user) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('לא נמצא משתמש עם האימייל הזה'));
    store.addAgencyMember(agency.id, user.id);
    res.redirect(303, '/superadmin?ok=1#agencies');
  });

  router.post('/businesses/:id/agency', (req, res) => {
    const id = Number(req.params.id);
    const agencyId = Number(req.body.agency) || null;
    if (store.businessById(id) && (!agencyId || store.agencyById(agencyId))) store.setBusinessAgency(id, agencyId);
    res.redirect(303, '/superadmin?ok=1');
  });

  // Billing is manual until online payment is added: activate after payment,
  // extend a trial, or pause an account (surveys stop, data stays).
  router.post('/businesses/:id/plan', (req, res) => {
    const business = store.businessById(Number(req.params.id));
    if (!business) return res.redirect(303, '/superadmin');
    const plan = Object.hasOwn(PLANS, req.body.plan) ? req.body.plan : business.plan;
    const cycle = Object.hasOwn(CYCLES, req.body.cycle) ? req.body.cycle : business.billing_cycle;
    if (req.body.do === 'extend') {
      const from = Math.max(Date.now(), Date.parse(`${String(business.trial_ends_at ?? '').replace(' ', 'T')}Z`) || 0);
      store.updateBusiness(business.id, {
        billing: 'trial',
        trial_ends_at: new Date(from + TRIAL_DAYS * 864e5).toISOString().slice(0, 19).replace('T', ' '),
        trial_notice: null,
      });
    } else if (req.body.do === 'pause') {
      store.updateBusiness(business.id, { billing: 'paused' });
    } else {
      store.updateBusiness(business.id, { plan, billing_cycle: cycle, billing: 'active', plan_request: null, trial_notice: null });
    }
    res.redirect(303, '/superadmin?ok=1#businesses');
  });

  // Wider AI visibility for one business whose plan doesn't include it (a gift or a deal).
  router.post('/businesses/:id/ai-plus', (req, res) => {
    const business = store.businessById(Number(req.params.id));
    if (business) store.updateBusiness(business.id, { ai_plus: req.body.on === '1' });
    res.redirect(303, '/superadmin?ok=1#businesses');
  });

  // One small request to Anthropic, showing the exact answer or error.
  router.post('/ai-test', async (req, res) => {
    if (!ctx.ai?.ping) return res.redirect(303, '/superadmin?ai=err&t=' + encodeURIComponent('ANTHROPIC_API_KEY לא מוגדר בשרת (או שהשרת לא הופעל מחדש אחרי ההוספה).'));
    const r = await ctx.ai.ping();
    res.redirect(303, `/superadmin?ai=${r.ok ? 'ok' : 'err'}&t=${encodeURIComponent(r.ok ? r.text : r.error)}#ai`);
  });

  // Which connections are set up, the SerpApi account, and what each business costs.
  router.get('/status', async (req, res) => {
    const env = process.env;
    const set = (k) => Boolean(String(env[k] ?? '').trim());
    const engines = ctx.visibility?.engines() || [];
    const backupHours = lastBackupAge() / 3600e3;
    const publicUrl = String(env.PUBLIC_URL || '');
    const checks = [
      { name: 'כתובת האתר (PUBLIC_URL)', state: publicUrl.startsWith('https://') ? 'ok' : 'warn', detail: publicUrl ? `<span dir="ltr">${publicUrl}</span>` : 'לא מוגדרת', what: 'קישורים במיילים, בתשלום ובוואטסאפ' },
      { name: 'מיילים', state: ctx.mailer.enabled ? 'ok' : 'off', detail: ctx.mailer.enabled ? 'פעיל' : 'רק נרשמים ביומן', what: 'התראות, דוחות, בקשות דירוג במייל' },
      { name: 'עוזר AI (Anthropic)', state: ctx.ai ? 'ok' : 'off', detail: ctx.ai ? 'מפתח מוגדר' : 'ANTHROPIC_API_KEY חסר', what: 'טיוטות, תובנות, תיוג, המלצות לפרופיל, סיכום חודשי' },
      { name: 'SerpApi', state: ctx.serp ? 'ok' : 'off', detail: ctx.serp ? 'מפתח מוגדר' : 'SERPAPI_KEY חסר', what: 'ביקורות לפי קישור, מתחרים, בריאות פרופיל, מיקום במפות, נראות בגוגל' },
      { name: 'התחברות עם גוגל (OAuth)', state: ctx.google ? 'warn' : 'off', detail: ctx.google ? 'מוגדר. מענה ופוסטים מחכים לאישור ה-API מגוגל' : 'לא מוגדר', what: 'מענה לביקורות ופרסום פוסטים ישירות מהמערכת' },
      { name: 'ChatGPT · Gemini · Perplexity', state: ['chatgpt', 'gemini', 'perplexity'].every((e) => engines.includes(e)) ? 'ok' : engines.some((e) => ['chatgpt', 'gemini', 'perplexity'].includes(e)) ? 'warn' : 'off',
        detail: ['chatgpt', 'gemini', 'perplexity'].map((e) => `${engines.includes(e) ? '✓' : '✗'} ${e}`).join(' · '), what: 'נראות ב-AI מורחבת (מקצועי ומעלה)' },
      { name: 'תשלום בכרטיס (Cardcom)', state: ctx.billing ? 'ok' : 'off', detail: ctx.billing ? 'מסוף מוגדר' : 'CARDCOM_TERMINAL חסר: בחירת מסלול שולחת בקשה ידנית', what: 'תשלום אונליין וחידוש אוטומטי' },
      { name: 'וואטסאפ אוטומטי (Meta)', state: ctx.whatsapp ? (set('WHATSAPP_APP_SECRET') ? 'ok' : 'warn') : 'off', detail: ctx.whatsapp ? (set('WHATSAPP_APP_SECRET') ? 'פעיל' : 'פעיל, בלי WHATSAPP_APP_SECRET לא יגיעו סטטוסי מסירה') : 'לא מוגדר: שליחה פותחת את הוואטסאפ של המשתמש', what: 'בקשות דירוג אוטומטיות בוואטסאפ' },
      { name: 'פרטי קשר', state: set('CONTACT_EMAIL') && set('CONTACT_PHONE') ? 'ok' : 'warn', detail: [set('CONTACT_EMAIL') ? '✓ מייל' : '✗ CONTACT_EMAIL', set('CONTACT_PHONE') ? '✓ טלפון' : '✗ CONTACT_PHONE'].join(' · '), what: 'מופיעים בתקנון, בפרטיות ובהצהרת הנגישות (חובה)' },
      { name: 'גיבוי יומי', state: backupHours < 26 ? 'ok' : 'warn', detail: Number.isFinite(backupHours) ? `האחרון לפני ${Math.round(backupHours)} שעות` : 'עוד לא נוצר', what: 'גיבוי של מסד הנתונים (נשמר על השרת)' },
    ];
    let serpAccount = null;
    if (ctx.serp?.account) {
      try {
        serpAccount = await ctx.serp.account();
      } catch (err) {
        serpAccount = { error: err.message };
      }
    }
    const month = monthKey();
    render(req, res, 'מצב המערכת', statusView({ checks, serpAccount, usage: store.apiUsage(month), month, csrf: req.user.csrf }));
  });

  // A fresh month of manual actions for one business (a mistake, or a good customer).
  router.post('/businesses/:id/reset-usage', (req, res) => {
    const business = store.businessById(Number(req.params.id));
    if (business) store.resetUsage(business.id, monthKey());
    res.redirect(303, '/superadmin?ok=1#businesses');
  });

  router.post('/leads/:id', (req, res) => {
    store.markLeadHandled(Number(req.params.id), req.body.handled === '1');
    res.redirect(303, '/superadmin#leads');
  });

  router.post('/users/:id/reset-2fa', (req, res) => {
    // For a user who lost both the phone and the backup codes.
    store.disableTotp(Number(req.params.id));
    res.redirect(303, '/superadmin?ok=1');
  });

  router.post('/users/:id/superadmin', (req, res) => {
    const id = Number(req.params.id);
    if (id !== req.user.id) store.setSuperadmin(id, req.body.on === '1');
    res.redirect(303, '/superadmin?ok=1');
  });

  return router;
}
