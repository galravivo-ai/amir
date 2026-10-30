import express from 'express';
import { RADII } from '../rankings.js';
import * as V from '../views/maps.js';

/**
 * "Climbing in Google Maps": one page with the week's plan, rank tracking and
 * the profile check. The old addresses (/profile, /rankings) lead here.
 */
export function mapsRoutes(ctx, { health, rankings, serp }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');
  const running = { health: new Set(), rank: new Set() };

  const page = (req, res, { error = '', notice = '' } = {}) => {
    const id = req.business.id;
    const locations = store.googleLocations(id).filter((l) => l.enabled);
    const keywords = store.rankKeywords(id);
    const busy = running.health.has(id) || running.rank.has(id);
    render(
      req,
      res,
      'קידום בגוגל מפות',
      V.mapsView({
        health: {
          audits: store.latestAudits(id),
          locations,
          running: running.health.has(id),
          runsLeft: ctx.usage.left(req.business, 'health_run'),
          available: Boolean(health),
          can: req.can,
        },
        rank: {
          keywords,
          checks: new Map(keywords.map((k) => [k.id, store.rankChecks(k.id, 2)])),
          locations,
          limit: req.plan.rankKeywords,
          running: running.rank.has(id),
          runsLeft: ctx.usage.left(req.business, 'rank_run'),
          available: Boolean(rankings),
          can: req.can,
        },
        running: busy,
        csrf: req.user.csrf,
        error: error || String(req.query.err ?? '').slice(0, 300),
        notice: notice || (req.query.added ? 'החיפוש נוסף. הבדיקה הראשונה רצה עכשיו.' : req.query.started ? 'הבדיקה התחילה.' : ''),
      }),
    );
  };

  const runInBackground = (kind, businessId, job) => {
    if (running[kind].has(businessId)) return;
    running[kind].add(businessId);
    job()
      .catch((err) => console.warn(`[${kind}] run failed:`, err.message))
      .finally(() => running[kind].delete(businessId));
  };

  router.get('/maps', (req, res) => page(req, res));

  // Old addresses, kept for links in emails and bookmarks.
  const legacy = (hash) => (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, `/admin/maps${qs}#${hash}`);
  };
  router.get('/profile', legacy('health'));
  router.get('/rankings', legacy('rank'));

  router.post('/profile/run', manager, (req, res) => {
    const id = req.business.id;
    if (health && !running.health.has(id)) {
      const over = ctx.usage.take(req.business, 'health_run');
      if (over) return res.redirect(303, `/admin/maps?err=${encodeURIComponent(over)}#health`);
      runInBackground('health', id, () => health.checkBusiness(store.businessById(id)));
    }
    res.redirect(303, '/admin/maps?started=1#health');
  });

  router.post('/rankings', manager, (req, res) => {
    if (!rankings) return page(req, res);
    const keyword = String(req.body.keyword ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const loc = store.googleLocations(req.business.id).find((l) => l.enabled && l.id === Number(req.body.location));
    const radius = Object.hasOwn(RADII, String(req.body.radius)) ? Number(req.body.radius) : 1000;
    if (!keyword || !loc) return page(req, res, { error: 'כתבו חיפוש ובחרו סניף.' });
    if (store.rankKeywords(req.business.id).length >= req.plan.rankKeywords) {
      return page(req, res, { error: `המסלול שלכם כולל עד ${req.plan.rankKeywords} חיפושים במעקב.` });
    }
    // The first check of a new search counts too, so adding and removing can't bypass the limit.
    const over = ctx.usage.take(req.business, 'rank_run');
    if (over) return page(req, res, { error: over });
    const id = store.addRankKeyword(req.business.id, loc.id, keyword, radius);
    const k = store.rankKeywords(req.business.id).find((x) => x.id === id);
    runInBackground('rank', req.business.id, () => rankings.check(k));
    res.redirect(303, '/admin/maps?added=1#rank');
  });

  router.post('/rankings/run', manager, (req, res) => {
    const count = store.rankKeywords(req.business.id).length;
    if (rankings && count && !running.rank.has(req.business.id)) {
      const over = ctx.usage.take(req.business, 'rank_run', count);
      if (over) return page(req, res, { error: over });
      runInBackground('rank', req.business.id, () => rankings.checkBusiness(req.business.id));
    }
    res.redirect(303, '/admin/maps#rank');
  });

  router.post('/rankings/:id/delete', manager, (req, res) => {
    store.deleteRankKeyword(req.business.id, Number(req.params.id));
    res.redirect(303, '/admin/maps#rank');
  });

  return router;
}
