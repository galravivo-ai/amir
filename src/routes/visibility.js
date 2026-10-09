import express from 'express';
import { parseJson } from '../db.js';
import { ENGINES, PLUS_ENGINES } from '../visibility.js';
import { AI_PLUS, hasAiPlus } from '../plans.js';
import { safeUrl } from '../util.js';
import * as V from '../views/visibility.js';

/** "דיזנגוף 120, תל אביב-יפו, ישראל" -> "תל אביב-יפו". */
export function cityOf(address) {
  const parts = String(address ?? '').split(',').map((p) => p.replace(/\d{5,7}/g, '').trim()).filter((p) => p && !/^(ישראל|israel)$/i.test(p));
  if (parts.length < 2) return '';
  return parts[parts.length - 1].replace(/\d+/g, '').trim();
}

/** Where the business is and what Google calls it: what local questions are built from. */
function localContext(store, business) {
  const loc = store.googleLocations(business.id).find((l) => l.enabled);
  const audit = store.latestAudits(business.id).find((a) => !a.error);
  const profile = audit ? parseJson(audit.profile, {}) : {};
  const address = profile.address || loc?.address || '';
  return { address, city: business.ai_city || cityOf(address), categories: (profile.types || []).slice(0, 4) };
}

/** AI visibility: the questions, the weekly results, and a check on demand. */
export function visibilityRoutes(ctx, { visibility }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  // Checks run in the background: a full run asks several engines several questions.
  // business id -> { done, total, startedAt }
  const running = new Map();

  const page = (req, res, extra = {}) =>
    render(
      req,
      res,
      'נראות ב-AI',
      V.visibilityView({
        business: req.business,
        cityGuess: req.business.ai_city ? '' : localContext(store, req.business).city,
        queries: parseJson(req.business.ai_queries, []),
        data: store.aiVisibility(req.business.id),
        plan: store.latestAiPlan(req.business.id),
        planOn: Boolean(ctx.ai?.visibilityPlan),
        engines: visibility.engines(req.business),
        allEngines: ENGINES,
        maxQueries: visibility.maxQueries(req.business),
        plus: hasAiPlus(req.business),
        // The upgrade is offered once at least one of the wider engines is set up.
        plusOffer: visibility.engines().some((e) => PLUS_ENGINES.includes(e)) ? AI_PLUS : null,
        running: running.get(req.business.id) || null,
        runsLeft: ctx.usage.left(req.business, 'visibility_run'),
        aiAvailable: Boolean(ctx.ai?.suggestQueries) && req.plan.ai,
        csrf: req.user.csrf,
        can: req.can,
        notice: req.query.saved
          ? 'נשמר.'
          : req.query.done
            ? 'הבדיקה הסתיימה. הנה התוצאות.'
            : '',
        ...extra,
      }),
    );

  router.get('/ai-visibility', (req, res) => page(req, res));

  const readQueries = (body, max) =>
    [].concat(body.queries ?? [])
      .map((q) => String(q).replace(/\s+/g, ' ').trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, max);

  router.post('/ai-visibility/settings', manager, (req, res) => {
    const site = String(req.body.site ?? '').trim();
    store.updateBusiness(req.business.id, {
      ai_queries: JSON.stringify(readQueries(req.body, visibility.maxQueries(req.business))),
      ai_aliases: String(req.body.aliases ?? '').trim().slice(0, 300),
      ai_site: site ? safeUrl(/^https?:\/\//.test(site) ? site : `https://${site}`) : '',
      ai_city: String(req.body.city ?? '').trim().slice(0, 60),
    });
    res.redirect(303, '/admin/ai-visibility?saved=1');
  });

  router.post('/ai-visibility/suggest', manager, async (req, res) => {
    if (!ctx.ai?.suggestQueries || !req.plan.ai) return page(req, res, { error: 'עוזר ה-AI לא פעיל.' });
    const over = ctx.usage.take(req.business, 'ai_draft');
    if (over) return page(req, res, { error: over });
    try {
      const local = localContext(store, req.business);
      const city = String(req.body.city ?? '').trim().slice(0, 60) || local.city;
      const suggested = await ctx.ai.suggestQueries({
        businessName: req.business.name,
        about: String(req.body.about ?? '').slice(0, 120),
        city,
        address: local.address,
        categories: local.categories,
        count: visibility.maxQueries(req.business),
      });
      page(req, res, { suggested, suggestedCity: city, notice: 'אלה שאלות מקומיות מוצעות, לפי התחום והמיקום של העסק. אפשר לערוך, ואז לשמור.' });
    } catch {
      ctx.usage.give(req.business, 'ai_draft');
      page(req, res, { error: 'ה-AI לא הצליח להציע שאלות, נסו שוב.' });
    }
  });

  // Polled by the page while a check runs.
  router.get('/ai-visibility/progress', (req, res) => {
    const r = running.get(req.business.id);
    res.json(r ? { running: true, done: r.done, total: r.total, phase: r.phase || '' } : { running: false });
  });

  router.post('/ai-visibility/run', manager, (req, res) => {
    const id = req.business.id;
    if (!running.has(id) && parseJson(req.business.ai_queries, []).length && visibility.engines(req.business).length) {
      const over = ctx.usage.take(req.business, 'visibility_run');
      if (over) return page(req, res, { error: over });
      const state = { done: 0, total: 0, startedAt: Date.now() };
      running.set(id, state);
      visibility
        .runBusiness(store.businessById(id), (done, total, phase = '') => Object.assign(state, { done, total, phase }))
        .catch((err) => console.warn('[visibility] run failed:', err.message))
        .finally(() => running.delete(id));
    }
    res.redirect(303, '/admin/ai-visibility?started=1');
  });

  return router;
}
