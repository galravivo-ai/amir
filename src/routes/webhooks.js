import crypto from 'node:crypto';
import express from 'express';

/**
 * Calls from payment and messaging providers. They carry no session, so they
 * trust nothing they're sent: Cardcom's payment is re-read from Cardcom, and
 * WhatsApp's updates must carry Meta's signature.
 */
export function webhookRoutes(store, { billing = null } = {}) {
  const router = express.Router();

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
