import crypto from 'node:crypto';
import express from 'express';
import { matchPayment, readPayment, secretMatches } from '../icount.js';
import { CYCLES, PLANS } from '../plans.js';

/**
 * Calls from payment and messaging providers. They carry no session, so they
 * trust nothing they're sent: Cardcom's payment is re-read from Cardcom, and
 * WhatsApp's updates must carry Meta's signature.
 */
export function webhookRoutes(store, { billing = null, notifier = null, adminEmails = () => [] } = {}) {
  const router = express.Router();

  // iCount's IPN: called after each payment on an iCount payment page. The
  // secret in the address is the proof; see src/icount.js for what opens on its own.
  router.all('/billing/icount/ipn/:secret', express.json({ limit: '100kb' }), async (req, res) => {
    if (!secretMatches(req.params.secret)) return res.sendStatus(404);
    const payload = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    const raw = JSON.stringify(payload);
    const { emails, amounts } = readPayment(payload);
    const id = store.recordIcountPayment({ digest: crypto.createHash('sha256').update(raw).digest('hex'), payload: raw.slice(0, 20000), email: emails[0], amount: amounts[0] });
    if (!id) return res.send('OK'); // the same call again
    const match = matchPayment(store, { emails, amounts });
    let what = '';
    if (match?.kind === 'plan') {
      store.updateBusiness(match.business.id, { plan: match.plan, billing_cycle: match.cycle, billing: 'active', plan_request: null, trial_notice: null });
      what = `מסלול ${PLANS[match.plan].label}, ${CYCLES[match.cycle]}`;
    } else if (match?.kind === 'branch' && store.activateBranch(match.branch.id)) {
      what = `סניף ${match.branch.title || match.branch.address || ''}`.trim();
      const loc = store.db.prepare('SELECT * FROM google_locations WHERE id = ?').get(match.branch.id);
      await notifier?.branchActivated({ business: store.businessById(match.business.id), location: loc }).catch((err) => console.error('[notify] branchActivated failed:', err));
    }
    store.setIcountResult(id, what ? `activated: ${what}` : 'manual', match?.business.id ?? null);
    await notifier
      ?.icountPayment({ admins: adminEmails(), done: Boolean(what), business: match && store.businessById(match.business.id), what, email: emails[0], amount: amounts[0] ?? null })
      .catch((err) => console.error('[notify] icountPayment failed:', err));
    res.send('OK');
  });

  router.post('/billing/cardcom/webhook', express.json({ limit: '100kb' }), async (req, res) => {
    const id = Number(req.query.p);
    if (billing && id) {
      try {
        await billing.complete(id);
      } catch (err) {
        console.error('[billing] webhook failed:', err.message);
        return res.status(500).send('retry');
      }
    }
    res.send('OK');
  });

  // Meta checks the address once when the webhook is set up.
  router.get('/whatsapp/webhook', (req, res) => {
    const verify = process.env.WHATSAPP_VERIFY_TOKEN;
    if (verify && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verify) {
      return res.type('text').send(String(req.query['hub.challenge'] ?? ''));
    }
    res.sendStatus(403);
  });

  router.post(
    '/whatsapp/webhook',
    express.json({ limit: '1mb', verify: (req, _res, buf) => (req.rawBody = buf) }),
    (req, res) => {
      const secret = process.env.WHATSAPP_APP_SECRET;
      const sent = String(req.get('x-hub-signature-256') ?? '');
      const expected = secret && req.rawBody ? `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}` : '';
      if (!expected || sent.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
        return res.sendStatus(401);
      }
      for (const entry of req.body?.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const s of change.value?.statuses ?? []) {
            if (!s.id || !['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue;
            const error = s.status === 'failed' ? String(s.errors?.[0]?.title || s.errors?.[0]?.message || 'failed').slice(0, 200) : null;
            store.updateWhatsAppStatus(s.id, s.status, error);
          }
        }
      }
      res.sendStatus(200);
    },
  );

  return router;
}
