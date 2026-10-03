import express from 'express';
import { parseJson } from '../db.js';
import { ENGINES, PLUS_ENGINES } from '../visibility.js';
import { AI_PLUS, hasAiPlus } from '../plans.js';
import { safeUrl } from '../util.js';
import * as V from '../views/visibility.js';

/** AI visibility: the questions, the weekly results, and a check on demand. */
export function visibilityRoutes(ctx, { visibility }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  const owner = requireRole('owner');
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
        engines: visibility.engines(req.business),
        allEngines: ENGINES,
        maxQueries: visibility.maxQueries(req.business),
        plus: hasAiPlus(req.business),
        // The add-on is offered once at least one of its engines is set up.
        plusOffer: visibility.engines().some((e) => PLUS_ENGINES.includes(e)) ? AI_PLUS : null,
        plusRequested: Boolean(req.business.ai_plus_request),
        running: running.has(req.business.id),
        aiAvailable: Boolean(ctx.ai?.suggestQueries) && req.plan.ai,
        csrf: req.user.csrf,
        can: req.can,
        notice: req.query.saved
          ? 'נשמר.'
          : req.query.started
            ? 'הבדיקה התחילה. היא לוקחת כמה דקות, אפשר לרענן את הדף.'
            : req.query.requested
              ? `הבקשה ל${AI_PLUS.label} נשלחה. ניצור איתכם קשר להשלמת התשלום ונפעיל את התוסף.`
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
    try {
      const suggested = await ctx.ai.suggestQueries({ businessName: req.business.name, about: String(req.body.about ?? '').slice(0, 120), city: req.business.ai_city });
      page(req, res, { suggested, notice: 'אלה שאלות מוצעות. אפשר לערוך, ואז לשמור.' });
    } catch {
      page(req, res, { error: 'ה-AI לא הצליח להציע שאלות, נסו שוב.' });
    }
  });

  router.post('/ai-visibility/run', manager, (req, res) => {
    const id = req.business.id;
    if (!running.has(id) && parseJson(req.business.ai_queries, []).length && visibility.engines(req.business).length) {
      running.add(id);
      visibility
        .runBusiness(store.businessById(id))
        .catch((err) => console.warn('[visibility] run failed:', err.message))
        .finally(() => running.delete(id));
    }
    res.redirect(303, '/admin/ai-visibility?started=1');
  });

  // No online payment yet: the owner asks, a system admin turns it on after payment.
  router.post('/ai-visibility/plus', owner, async (req, res) => {
    if (!hasAiPlus(req.business)) {
      store.updateBusiness(req.business.id, { ai_plus_request: JSON.stringify({ by: req.user.email, at: new Date().toISOString() }) });
      await ctx.notifier
        ?.planRequested({ business: req.business, plan: AI_PLUS, cycle: `תוסף, ₪${AI_PLUS.price} לחודש`, user: req.user, admins: ctx.adminEmails() })
        .catch((err) => console.error('[notify] AI plus request failed:', err));
    }
    res.redirect(303, '/admin/ai-visibility?requested=1');
  });

  return router;
}
