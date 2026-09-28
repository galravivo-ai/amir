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
        agencies: store.allAgencies(),
        error: req.query.err ? String(req.query.err).slice(0, 200) : '',
        csrf: req.user.csrf,
        mailEnabled: ctx.mailer.enabled,
        aiEnabled: Boolean(ctx.ai),
        meId: req.user.id,
      }),
    );
  });

  const domainOk = (d) => /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);

  router.post('/agencies', (req, res) => {
    const name = String(req.body.name ?? '').trim().slice(0, 100);
    const user = store.userByEmail(String(req.body.email ?? '').trim());
    if (!name || !user) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('צריך שם ואימייל של משתמש רשום'));
    const id = store.createAgency({ name });
    store.addAgencyMember(id, user.id);
    res.redirect(303, '/superadmin?ok=1#agencies');
  });

  router.post('/agencies/:id', (req, res) => {
    const agency = store.agencyById(Number(req.params.id));
    if (!agency) return ctx.notFound(res);
    const domain = String(req.body.custom_domain ?? '').trim().toLowerCase();
    if (domain && !domainOk(domain)) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('דומיין לא תקין'));
    const taken = domain && store.agencyByDomain(domain);
    if (taken && taken.id !== agency.id) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('הדומיין כבר בשימוש'));
    store.updateAgency(agency.id, {
      custom_domain: domain || null,
      max_clients: Math.min(10000, Math.max(1, Number.parseInt(req.body.max_clients, 10) || agency.max_clients)),
      default_plan: Object.hasOwn(PLANS, req.body.default_plan) ? req.body.default_plan : agency.default_plan,
    });
    res.redirect(303, '/superadmin?ok=1#agencies');
  });

  router.post('/agencies/:id/members', (req, res) => {
    const agency = store.agencyById(Number(req.params.id));
    const user = store.userByEmail(String(req.body.email ?? '').trim());
    if (!agency || !user) return res.redirect(303, '/superadmin?err=' + encodeURIComponent('לא נמצא משתמש עם האימייל הזה'));
    store.addAgencyMember(agency.id, user.id);
    res.redirect(303, '/superadmin?ok=1#agencies');
  });

  router.post('/businesses/:id/agency', (req, res) => {
    const id = Number(req.params.id);
    const agencyId = Number(req.body.agency) || null;
    if (store.businessById(id) && (!agencyId || store.agencyById(agencyId))) store.setBusinessAgency(id, agencyId);
    res.redirect(303, '/superadmin?ok=1');
  });

  router.post('/businesses/:id/plan', (req, res) => {
    const plan = Object.hasOwn(PLANS, req.body.plan) ? req.body.plan : null;
    if (plan && store.businessById(Number(req.params.id))) store.updateBusiness(Number(req.params.id), { plan });
    res.redirect(303, '/superadmin?ok=1');
  });

  router.post('/users/:id/reset-2fa', (req, res) => {
    // For a user who lost both the phone and the backup codes.
    store.disableTotp(Number(req.params.id));
    res.redirect(303, '/superadmin?ok=1');
  });

  router.post('/users/:id/superadmin', (req, res) => {
    const id = Number(req.params.id);
    if (id !== req.user.id) store.setSuperadmin(id, req.body.on === '1');
    res.redirect(303, '/superadmin?ok=1');
  });

  return router;
}
