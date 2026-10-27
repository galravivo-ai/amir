import express from 'express';
import { growthFacts, growthPlan, markPeriod, urgentActions, WRITERS } from '../growth.js';
import { expansions, leadGoals, routine, STAGE2_AT } from '../goals.js';
import { checkSite } from '../siteCheck.js';
import { safeUrl } from '../util.js';
import * as V from '../views/growth.js';

const WEEK = 7 * 864e5;

/**
 * The promotion plan: actions for Maps and AI answers, a score, the AI writer
 * and the website check (on demand, and again when a week has passed).
 */
export function growthRoutes(ctx, { siteCheck = checkSite } = {}) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  const running = new Set();

  const runCheck = (business) => {
    const facts = growthFacts(store, business);
    if (!facts.website || running.has(business.id)) return null;
    running.add(business.id);
    return siteCheck(facts.website, { phone: facts.phone, city: facts.city, keywords: facts.keywords })
      .then((result) => store.updateBusiness(business.id, { site_check: JSON.stringify(result), site_checked_at: new Date().toISOString() }))
      .catch((err) => console.warn('[site] check failed:', err.message))
      .finally(() => running.delete(business.id));
  };

  router.get('/growth', (req, res) => {
    const b = req.business;
    const stale = !b.site_checked_at || Date.now() - Date.parse(b.site_checked_at) > WEEK;
    if (stale && !b.is_demo) runCheck(b);
    const plan = growthPlan(store, b);
    const open = plan.score >= STAGE2_AT;
    const stage2 = {
      at: STAGE2_AT,
      open,
      ...(open && {
        goals: leadGoals(store, b),
        more: expansions(store, b, { rankLimit: req.plan.rankKeywords || 0, aiMax: ctx.visibility?.maxQueries(b) || 0 }),
        routine: routine(store, b),
      }),
    };
    render(
      req,
      res,
      'מה לעשות',
      V.growthView({
        plan,
        stage2,
        urgent: urgentActions(store, b),
        drafts: store.growthDrafts(b.id),
        csrf: req.user.csrf,
        can: req.can('manager'),
        aiOn: Boolean(ctx.ai?.growthDraft) && Boolean(req.plan.ai),
        running: running.has(b.id),
        notice: req.query.saved ? 'נשמר.' : '',
      }),
    );
  });

  router.post('/growth/mark', manager, (req, res) => {
    const key = String(req.body.key ?? '');
    const period = markPeriod(key);
    if (period == null) return res.status(400).send('Unknown action');
    store.setGrowthMark(req.business.id, key, period, req.body.on !== '0');
    res.redirect(303, `/admin/growth#${key.startsWith('dir:') ? 'a-citations' : `a-${key}`}`);
  });

  router.post('/growth/services', manager, (req, res) => {
    store.updateBusiness(req.business.id, { growth_services: String(req.body.services ?? '').trim().slice(0, 600) });
    res.redirect(303, '/admin/growth?saved=1');
  });

  router.post('/growth/site', manager, async (req, res) => {
    const url = safeUrl(/^https?:\/\//i.test(String(req.body.url ?? '').trim()) ? req.body.url : `https://${String(req.body.url ?? '').trim()}`);
    if (!url) return res.redirect(303, '/admin/growth#site');
    store.updateBusiness(req.business.id, { ai_site: url });
    const job = runCheck(store.businessById(req.business.id));
    // A quick site is checked before the page comes back; a slow one keeps going in the background.
    if (job) await Promise.race([job, new Promise((r) => setTimeout(r, 8000))]);
    res.redirect(303, '/admin/growth#site');
  });

  router.post('/growth/write', manager, async (req, res) => {
    const kind = String(req.body.kind ?? '');
    if (!WRITERS[kind]) return res.status(400).json({ error: 'סוג תוכן לא מוכר.' });
    if (!ctx.ai?.growthDraft || !req.plan.ai) return res.json({ error: 'כתיבה עם AI לא זמינה במסלול הזה.' });
    const over = ctx.usage.take(req.business, 'ai_draft');
    if (over) return res.json({ error: over });
    try {
      const text = String(await ctx.ai.growthDraft({ kind, facts: growthFacts(store, req.business) })).trim();
      store.saveGrowthDraft(req.business.id, kind, text);
      res.json({ text });
    } catch (err) {
      ctx.usage.give(req.business, 'ai_draft');
      res.json({ error: err.name === 'AiError' || err.constructor?.name === 'AiError' ? err.message : 'ה-AI לא הצליח לכתוב עכשיו, נסו שוב.' });
    }
  });

  return router;
}
