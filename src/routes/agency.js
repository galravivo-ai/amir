import express from 'express';
import { ROLES } from '../store.js';
import { errorPage, isEmail, safeColor, safeUrl } from '../util.js';
import * as V from '../views/agency.js';
import { BIZ_COOKIE } from './context.js';

/** Agency panel: an agency's staff manage many client businesses. */
export function agencyRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();

  function loadAgency(req, res, id) {
    const agencies = store.agenciesForUser(req.user.id);
    const agency = id ? agencies.find((a) => a.id === Number(id)) : agencies[0];
    if (!agency) {
      res.status(404).send(errorPage('הדף לא נמצא'));
      return null;
    }
    return { agency, agencies };
  }

  const page = (req, res, found, extra = {}) =>
    render(
      req,
      res,
      found.agency.name,
      V.agencyView({
        ...found,
        clients: store.agencyClients(found.agency.id),
        members: store.agencyMembers(found.agency.id),
        csrf: req.user.csrf,
        canAdd: store.agencyClients(found.agency.id).length < found.agency.max_clients,
        ...extra,
      }),
    );

  router.get('/', (req, res) => {
    const found = loadAgency(req, res, req.query.a);
    if (!found) return;
    page(req, res, found, {
      inviteLink: req.query.link ? `${ctx.baseUrl(req)}/join/${String(req.query.link)}` : '',
      error: req.query.err ? String(req.query.err).slice(0, 200) : '',
    });
  });

  router.post('/:id/clients', async (req, res) => {
    const found = loadAgency(req, res, req.params.id);
    if (!found) return;
    const { agency } = found;
    const fail = (msg) => res.redirect(303, `/agency?a=${agency.id}&err=${encodeURIComponent(msg)}`);
    if (store.agencyClients(agency.id).length >= agency.max_clients) return fail('הגעתם למספר הלקוחות בחבילה');
    const name = String(req.body.name ?? '').trim().slice(0, 100);
    if (!name) return fail('יש לתת שם לעסק');
    const email = String(req.body.owner_email ?? '').trim().toLowerCase();
    if (email && !isEmail(email)) return fail('אימייל לא תקין');

    const businessId = store.createBusiness(req.user.id, { name, plan: agency.default_plan });
    store.setBusinessAgency(businessId, agency.id);
    let link = '';
    if (email) {
      const business = store.businessById(businessId);
      const raw = store.createTeamInvite(businessId, { email, role: 'owner', invitedBy: req.user.id });
      link = raw;
      await ctx.notifier.teamInvite({
        business,
        inviter: req.user,
        email,
        role: ROLES.owner,
        link: `${ctx.baseUrl(req)}/join/${raw}`,
      });
    }
    res.redirect(303, `/agency?a=${agency.id}${link ? `&link=${link}` : ''}`);
  });

  router.post('/:id/enter/:businessId', (req, res) => {
    const found = loadAgency(req, res, req.params.id);
    if (!found) return;
    const business = store.businessById(Number(req.params.businessId));
    if (!business || business.agency_id !== found.agency.id) return res.status(404).send(errorPage('הדף לא נמצא'));
    // Agency staff act as owners of their clients' accounts.
    if (!store.business(business.id, req.user.id)) store.addMember(business.id, req.user.id, 'owner');
    res.cookie(BIZ_COOKIE, String(business.id), { ...ctx.cookieOpts, maxAge: 365 * 864e5 });
    res.redirect(303, '/admin');
  });

  router.post('/:id/branding', (req, res) => {
    const found = loadAgency(req, res, req.params.id);
    if (!found) return;
    const a = found.agency;
    store.updateAgency(a.id, {
      brand_name: String(req.body.brand_name ?? '').trim().slice(0, 60) || a.brand_name,
      brand_color: safeColor(req.body.brand_color, a.brand_color),
      logo_url: safeUrl(req.body.logo_url),
    });
    res.redirect(303, `/agency?a=${a.id}&ok=1`);
  });

  return router;
}

