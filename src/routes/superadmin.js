import express from 'express';
import { PLANS } from '../plans.js';
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
        businesses: store.allBusinesses(),
        users: store.allUsers(),
        outbox: store.recentOutbox(50),
        csrf: req.user.csrf,
        mailEnabled: ctx.mailer.enabled,
        aiEnabled: Boolean(ctx.ai),
        meId: req.user.id,
      }),
    );
  });

  router.post('/businesses/:id/plan', (req, res) => {
    const plan = Object.hasOwn(PLANS, req.body.plan) ? req.body.plan : null;
    if (plan && store.businessById(Number(req.params.id))) store.updateBusiness(Number(req.params.id), { plan });
    res.redirect(303, '/superadmin?ok=1');
  });

  router.post('/users/:id/superadmin', (req, res) => {
    const id = Number(req.params.id);
    if (id !== req.user.id) store.setSuperadmin(id, req.body.on === '1');
    res.redirect(303, '/superadmin?ok=1');
  });

  return router;
}
