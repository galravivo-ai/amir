import express from 'express';
import * as V from '../views/leaderboard.js';

/** Staff management and the staff / branch leaderboard. */
export function leaderboardRoutes(ctx) {
  const { store, render, requireRole, notFound } = ctx;
  const router = express.Router();
  const manager = requireRole('manager');

  router.get('/leaderboard', (req, res) => {
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    render(req, res, 'דירוג עובדים וסניפים', V.leaderboardView({ board: store.leaderboard(req.business.id, { days }), can: req.can }));
  });

  router.get('/staff', (req, res) => {
    render(
      req,
      res,
      'עובדים',
      V.staffView({
        staff: store.staffFor(req.business.id),
        campaigns: store.campaignsFor(req.business.id),
        campaignId: Number(req.query.campaign) || null,
        baseUrl: ctx.baseUrl(req),
        csrf: req.user.csrf,
        can: req.can,
      }),
    );
  });

  const cleanName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);

  router.post('/staff', manager, (req, res) => {
    const name = cleanName(req.body.name);
    if (name && store.staffFor(req.business.id).length < 500) store.createStaff(req.business.id, name);
    res.redirect(303, '/admin/staff');
  });

  function loadStaff(req, res) {
    const s = store.staffMember(Number(req.params.id), req.business.id);
    if (!s) notFound(res);
    return s;
  }

  router.post('/staff/:id', manager, (req, res) => {
    const s = loadStaff(req, res);
    if (!s) return;
    store.updateStaff(s.id, { name: cleanName(req.body.name) || s.name, active: req.body.active === '1' });
    res.redirect(303, '/admin/staff');
  });

  router.post('/staff/:id/delete', requireRole('owner'), (req, res) => {
    const s = loadStaff(req, res);
    if (!s) return;
    store.deleteStaff(s.id);
    res.redirect(303, '/admin/staff');
  });

  return router;
}
