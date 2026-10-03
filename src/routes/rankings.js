import express from 'express';
import { RADII } from '../rankings.js';
import * as V from '../views/rankings.js';

/** Map rank tracking: the searches to follow, their grids, and a check on demand. */
export function rankingRoutes(ctx, { rankings }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  const running = new Set();

  const page = (req, res, extra = {}) => {
    const keywords = store.rankKeywords(req.business.id);
    render(
      req,
      res,
      'מיקום במפות',
      V.rankingsView({
        keywords,
        checks: new Map(keywords.map((k) => [k.id, store.rankChecks(k.id, 2)])),
        locations: store.googleLocations(req.business.id).filter((l) => l.enabled),
        limit: req.plan.rankKeywords,
        running: running.has(req.business.id),
        available: Boolean(rankings),
        csrf: req.user.csrf,
        can: req.can,
        notice: req.query.added ? 'החיפוש נוסף. הבדיקה הראשונה רצה עכשיו.' : '',
        ...extra,
      }),
    );
  };

  const runInBackground = (businessId, job) => {
    if (running.has(businessId)) return;
    running.add(businessId);
    job()
      .catch((err) => console.warn('[rankings] run failed:', err.message))
      .finally(() => running.delete(businessId));
  };

  router.get('/rankings', (req, res) => page(req, res));

  router.post('/rankings', manager, (req, res) => {
    if (!rankings) return page(req, res);
    const keyword = String(req.body.keyword ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const loc = store.googleLocations(req.business.id).find((l) => l.enabled && l.id === Number(req.body.location));
    const radius = Object.hasOwn(RADII, String(req.body.radius)) ? Number(req.body.radius) : 1000;
    if (!keyword || !loc) return page(req, res, { error: 'כתבו חיפוש ובחרו סניף.' });
    if (store.rankKeywords(req.business.id).length >= req.plan.rankKeywords) {
      return page(req, res, { error: `המסלול שלכם כולל עד ${req.plan.rankKeywords} חיפושים במעקב.` });
    }
    const id = store.addRankKeyword(req.business.id, loc.id, keyword, radius);
    const k = store.rankKeywords(req.business.id).find((x) => x.id === id);
    runInBackground(req.business.id, () => rankings.check(k));
    res.redirect(303, '/admin/rankings?added=1');
  });

  router.post('/rankings/run', manager, (req, res) => {
    if (rankings) runInBackground(req.business.id, () => rankings.checkBusiness(req.business.id));
    res.redirect(303, '/admin/rankings');
  });

  router.post('/rankings/:id/delete', manager, (req, res) => {
    store.deleteRankKeyword(req.business.id, Number(req.params.id));
    res.redirect(303, '/admin/rankings');
  });

  return router;
}
