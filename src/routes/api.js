import express from 'express';
import { accessOf, planOf } from '../plans.js';
import { isEmail, sqlTime } from '../util.js';
import { rateLimiter } from './public.js';

/**
 * Public API (v1) for systems that know when a customer finished a visit:
 * a POS, booking system, online store, or Make / Zapier. Authenticated with a
 * per-business key: `Authorization: Bearer rk_...`.
 */
export function apiRoutes(store, { notifier, baseUrl = (req) => `${req.protocol}://${req.get('host')}`, apiLimit } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: '20kb' }));
  router.use(rateLimiter(apiLimit || { windowMs: 60e3, max: 120 }));

  const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

  router.use((req, res, next) => {
    const header = String(req.get('authorization') ?? '');
    const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.get('x-api-key') ?? '');
    const found = raw ? store.businessByApiKey(raw) : null;
    if (!found) return fail(res, 401, 'unauthorized', 'Missing or invalid API key');
    if (!planOf(found.business).api) return fail(res, 403, 'plan', 'The API is not included in this plan');
    if (accessOf(found.business).state === 'paused') return fail(res, 402, 'paused', 'The account is paused until a plan is chosen');
    req.business = found.business;
    next();
  });

  router.get('/ping', (req, res) => res.json({ ok: true, business: { id: req.business.id, name: req.business.name } }));

  router.get('/campaigns', (req, res) => {
    res.json({
      campaigns: store.campaignsFor(req.business.id).map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        active: Boolean(c.active),
        url: `${baseUrl(req)}/r/${c.slug}`,
      })),
    });
  });

  router.post('/invites', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const campaigns = store.campaignsFor(req.business.id);
    const wanted = body.campaign ?? body.campaign_id;
    const campaign =
      wanted === undefined || wanted === ''
        ? campaigns.find((c) => c.active)
        : campaigns.find((c) => String(c.id) === String(wanted) || c.slug === String(wanted));
    if (!campaign) return fail(res, 404, 'campaign_not_found', 'No such (active) campaign');
    if (!campaign.active) return fail(res, 409, 'campaign_inactive', 'The campaign is not active');

    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 120);
    const phone = String(body.phone ?? '').trim().slice(0, 30);
    if (email && !isEmail(email)) return fail(res, 422, 'invalid_email', 'email is not valid');
    if (!email && !phone) return fail(res, 422, 'missing_contact', 'Send at least email or phone');
    const delay = Math.min(10080, Math.max(0, Number.parseInt(body.delay_minutes ?? 0, 10) || 0));
    const dedupDays = Math.min(365, Math.max(0, Number.parseInt(body.dedup_days ?? 30, 10) || 0));

    // Don't ask the same customer again and again.
    const recent = dedupDays ? store.recentInviteFor(campaign.id, { email, phone, days: dedupDays }) : null;
    if (recent) {
      return res.status(200).json({
        status: 'skipped',
        reason: 'recent_request',
        invite: { id: recent.id, link: `${baseUrl(req)}/r/${campaign.slug}?i=${recent.token}` },
      });
    }

    const canEmail = Boolean(email) && planOf(req.business).emailInvites && body.send_email !== false;
    const t = store.createApiInvite(campaign.id, {
      customer_name: String(body.name ?? body.customer_name ?? '').trim().slice(0, 80),
      phone,
      email,
      send_at: canEmail ? sqlTime(delay * 60e3) : null,
      external_id: String(body.external_id ?? '').slice(0, 80),
    });
    const invite = store.inviteByToken(campaign.id, t);
    let status = canEmail ? 'scheduled' : 'created';
    if (canEmail && delay === 0) {
      store.markInviteSendAttempted(invite.id);
      if (await notifier.customerInvite({ business: req.business, campaign, invite })) {
        store.markInviteEmailed(invite.id);
        status = 'sent';
      }
    }
    res.status(201).json({
      status,
      invite: {
        id: invite.id,
        link: `${baseUrl(req)}/r/${campaign.slug}?i=${t}`,
        send_at: canEmail ? invite.send_at : null,
        campaign: campaign.slug,
      },
    });
  });

  router.use((req, res) => fail(res, 404, 'not_found', 'Unknown endpoint'));
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'invalid_json', 'Body must be JSON');
    console.error(err);
    fail(res, 500, 'server_error', 'Something went wrong');
  });
  return router;
}
