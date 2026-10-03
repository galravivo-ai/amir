import express from 'express';
import * as V from '../views/health.js';

/** Google profile health: the latest check per place, and a check on demand. */
export function healthRoutes(ctx, { health }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const running = new Set();

  router.get('/profile', (req, res) => {
    render(
      req,
      res,
      'בריאות פרופיל הגוגל',
      V.healthView({
        audits: store.latestAudits(req.business.id),
        locations: store.googleLocations(req.business.id).filter((l) => l.enabled),
        running: running.has(req.business.id),
        csrf: req.user.csrf,
        can: req.can,
        available: Boolean(health),
        aiOn: Boolean(ctx.ai) && req.plan.ai,
        notice: req.query.started ? 'הבדיקה התחילה.' : '',
      }),
    );
  });

  router.post('/profile/run', requireRole('manager'), (req, res) => {
    const id = req.business.id;
    if (health && !running.has(id)) {
      running.add(id);
      health
        .checkBusiness(store.businessById(id))
        .catch((err) => console.warn('[health] run failed:', err.message))
        .finally(() => running.delete(id));
    }
    res.redirect(303, '/admin/profile?started=1');
  });

  return router;
}
