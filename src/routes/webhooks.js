import crypto from 'node:crypto';
import express from 'express';
import { matchPayment, readPayment, secretMatches } from '../icount.js';
import { CYCLES, PLANS } from '../plans.js';

/**
 * Calls from payment and messaging providers. They carry no session, so they
 * trust nothing they're sent: Cardcom's payment is re-read from Cardcom, and
 * WhatsApp's updates must carry Meta's signature.
 */
/** A body as text: JSON, a form, or multipart fields; else kept as it is. */
function parseBody(text, type = '') {
  const t = text.trim();
  if (!t) return {};
  if (/^[[{]/.test(t)) {
    try {
      const v = JSON.parse(t);
      return v && typeof v === 'object' ? v : { body: t };
    } catch {
      /* not JSON */
    }
  }
  if (/multipart\/form-data/i.test(type)) {
    const out = {};
    for (const m of t.matchAll(/name="([^"]+)"\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n--/g)) out[m[1]] = m[2];
    return Object.keys(out).length ? out : { body: t.slice(0, 5000) };
  }
  if (t.startsWith('<')) {
    const out = {};
    for (const m of t.matchAll(/<([\w:-]+)[^>]*>([^<]*)<\/\1>/g)) out[m[1]] = m[2].trim();
    return Object.keys(out).length ? out : { body: t.slice(0, 5000) };
  }
  if (/^[^=&\s]+=/.test(t)) return Object.fromEntries(new URLSearchParams(t));
  return { body: t.slice(0, 5000) };
}

export function webhookRoutes(store, { billing = null, notifier = null, adminEmails = () => [] } = {}) {
  const router = express.Router();

  // iCount's IPN: called after each payment on an iCount payment page. The
  // secret in the address is the proof; see src/icount.js for what opens on its own.
  // Whatever format the call comes in (form, JSON, multipart, plain text) is
  // read, and kept as it came, so a format we didn't expect can still be seen.
  router.all('/billing/icount/ipn/:secret', express.text({ type: () => true, limit: '100kb' }), async (req, res) => {
    if (!secretMatches(req.params.secret)) return res.sendStatus(404);
    const body = typeof req.body === 'string' ? parseBody(req.body, req.get('content-type')) : req.body && typeof req.body === 'object' ? req.body : {};
    const payload = { ...req.query, ...body };
    const { emails, amounts } = readPayment(payload);
    // A call with nothing in it: iCount checking the address when it's saved.
    if (!Object.keys(payload).length) return res.send('OK');
    const raw = JSON.stringify(payload);
    const kept = JSON.stringify({ ...payload, _method: req.method, _type: req.get('content-type') || '' });
    const id = store.recordIcountPayment({ digest: crypto.createHash('sha256').update(raw).digest('hex'), payload: kept.slice(0, 20000), email: emails[0], amount: amounts[0] });
    if (!id) return res.send('OK'); // the same call again
    const match = matchPayment(store, { emails, amounts });
    let what = '';
    if (match?.kind === 'plan') {
      store.updateBusiness(match.business.id, { plan: match.plan, billing_cycle: match.cycle, billing: 'active', plan_request: null, trial_notice: null, auto_renew: true, canceled_at: null, paid_until: null });
      what = `מסלול ${PLANS[match.plan].label}, ${CYCLES[match.cycle]}`;
    } else if (match?.kind === 'branch' && store.activateBranch(match.branch.id)) {
      what = `סניף ${match.branch.title || match.branch.address || ''}`.trim();
      const loc = store.db.prepare('SELECT * FROM google_locations WHERE id = ?').get(match.branch.id);
      await notifier?.branchActivated({ business: store.businessById(match.business.id), location: loc }).catch((err) => console.error('[notify] branchActivated failed:', err));
    }
    if (what && match.by === 'amount') what += ' (זוהה לפי הסכום, לא לפי המייל)';
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
