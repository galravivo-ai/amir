import express from 'express';
import { comparison } from '../competitors.js';
import { SerpError } from '../serp.js';
import * as V from '../views/competitors.js';

/** Competitors: find nearby places by link or name, and compare ratings and new reviews. */
export function competitorRoutes(ctx, { serp, competitors }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');

  const page = (req, res, extra = {}) =>
    render(
      req,
      res,
      'מתחרים',
      V.competitorsView({
        data: comparison(store, req.business.id),
        available: Boolean(serp),
        limit: req.plan.competitors,
        intervalHours: competitors?.intervalHours,
        csrf: req.user.csrf,
        can: req.can,
        notice: req.query.added ? 'המתחרה נוסף.' : req.query.removed ? 'המתחרה הוסר.' : '',
        ...extra,
      }),
    );

  router.get('/competitors', (req, res) => page(req, res));

  router.post('/competitors/find', manager, async (req, res) => {
    if (!serp) return page(req, res);
    const query = String(req.body.q ?? '').trim().slice(0, 500);
    try {
      const found = await serp.find(query);
      if (found.direct) return add(req, res, found.direct);
      page(req, res, { query, matches: found.matches, error: found.matches.length ? '' : 'לא מצאנו את העסק. נסו להוסיף את העיר, או להדביק קישור מגוגל מפות.' });
    } catch (err) {
      page(req, res, { query, error: err instanceof SerpError ? 'החיפוש בגוגל לא הצליח כרגע. נסו שוב בעוד כמה דקות.' : 'משהו השתבש, נסו שוב.' });
    }
  });

  router.post('/competitors/add', manager, (req, res) => {
    const pick = (k, max = 300) => String(req.body[k] ?? '').trim().slice(0, max);
    const p = { dataId: pick('data_id', 100), placeId: pick('place_id', 200), title: pick('title'), address: pick('address') };
    if (!/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(p.dataId)) p.dataId = '';
    if (!/^[\w-]{10,}$/.test(p.placeId)) p.placeId = '';
    if (!serp || (!p.dataId && !p.placeId)) return res.redirect(303, '/admin/competitors');
    return add(req, res, p);
  });

  async function add(req, res, p) {
    // The business's own places don't count as competitors.
    if (store.googleLocations(req.business.id).some((l) => (p.dataId && l.data_id === p.dataId) || (p.placeId && l.place_id === p.placeId))) {
      return page(req, res, { error: 'זה העסק שלכם 🙂 בחרו עסק אחר להשוואה.' });
    }
    if (store.competitorsFor(req.business.id).length >= req.plan.competitors) {
      return page(req, res, { error: `המסלול שלכם כולל עד ${req.plan.competitors} מתחרים. כדי להוסיף, הסירו מתחרה או שדרגו את המסלול.` });
    }
    const c = store.addCompetitor(req.business.id, p);
    if (!c.checked_at) await competitors.check(c);
    res.redirect(303, '/admin/competitors?added=1');
  }

  router.post('/competitors/:id/delete', manager, (req, res) => {
    store.deleteCompetitor(req.business.id, Number(req.params.id));
    res.redirect(303, '/admin/competitors?removed=1');
  });

  return router;
}
