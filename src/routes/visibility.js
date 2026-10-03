import express from 'express';
import { parseJson } from '../db.js';
import { ENGINES, MAX_QUERIES } from '../visibility.js';
import { safeUrl } from '../util.js';
import * as V from '../views/visibility.js';

/** AI visibility: the questions, the weekly results, and a check on demand. */
export function visibilityRoutes(ctx, { visibility }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  // Checks run in the background: a full run asks several engines several questions.
  const running = new Set();

  const page = (req, res, extra = {}) =>
    render(
      req,
      res,
      'נראות ב-AI',
      V.visibilityView({
        business: req.business,
        queries: parseJson(req.business.ai_queries, []),
        data: store.aiVisibility(req.business.id),
        engines: visibility.engines(),
        allEngines: ENGINES,
        running: running.has(req.business.id),
        aiAvailable: Boolean(ctx.ai?.suggestQueries) && req.plan.ai,
        csrf: req.user.csrf,
        can: req.can,
        notice: req.query.saved ? 'נשמר.' : req.query.started ? 'הבדיקה התחילה. היא לוקחת כמה דקות, אפשר לרענן את הדף.' : '',
        ...extra,
      }),
    );

  router.get('/ai-visibility', (req, res) => page(req, res));

  const readQueries = (body) =>
    [].concat(body.queries ?? [])
      .map((q) => String(q).replace(/\s+/g, ' ').trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, MAX_QUERIES);

  router.post('/ai-visibility/settings', manager, (req, res) => {
    const site = String(req.body.site ?? '').trim();
    store.updateBusiness(req.business.id, {
      ai_queries: JSON.stringify(readQueries(req.body)),
      ai_aliases: String(req.body.aliases ?? '').trim().slice(0, 300),
      ai_site: site ? safeUrl(/^https?:\/\//.test(site) ? site : `https://${site}`) : '',
      ai_city: String(req.body.city ?? '').trim().slice(0, 60),
    });
    res.redirect(303, '/admin/ai-visibility?saved=1');
  });

  router.post('/ai-visibility/suggest', manager, async (req, res) => {
    if (!ctx.ai?.suggestQueries || !req.plan.ai) return page(req, res, { error: 'עוזר ה-AI לא פעיל.' });
    try {
      const suggested = await ctx.ai.suggestQueries({ businessName: req.business.name, about: String(req.body.about ?? '').slice(0, 120), city: req.business.ai_city });
      page(req, res, { suggested, notice: 'אלה שאלות מוצעות. אפשר לערוך, ואז לשמור.' });
    } catch {
      page(req, res, { error: 'ה-AI לא הצליח להציע שאלות, נסו שוב.' });
    }
  });

  router.post('/ai-visibility/run', manager, (req, res) => {
    const id = req.business.id;
    if (!running.has(id) && parseJson(req.business.ai_queries, []).length && visibility.engines().length) {
      running.add(id);
      visibility
        .runBusiness(store.businessById(id))
        .catch((err) => console.warn('[visibility] run failed:', err.message))
        .finally(() => running.delete(id));
    }
    res.redirect(303, '/admin/ai-visibility?started=1');
  });

  return router;
}
