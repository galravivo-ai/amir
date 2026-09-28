import express from 'express';
import { safeUrl } from '../util.js';

/** Device registration for push notifications (logged-in users only). */
export function pushRoutes(ctx, pusher) {
  const router = express.Router();

  router.get('/push/key', ctx.requireAuth, (req, res) => res.json({ key: pusher.publicKey }));

  router.post('/push/subscribe', ctx.requireAuth, (req, res) => {
    const endpoint = safeUrl(req.body.endpoint);
    const p256dh = String(req.body.p256dh ?? '');
    const auth = String(req.body.auth ?? '');
    if (!endpoint.startsWith('https://') || !/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) {
      return res.status(422).json({ ok: false });
    }
    store(ctx).savePushSubscription(req.user.id, {
      endpoint,
      p256dh,
      auth,
      userAgent: String(req.get('user-agent') ?? '').slice(0, 200),
    });
    res.json({ ok: true });
  });

  router.post('/push/unsubscribe', ctx.requireAuth, (req, res) => {
    const endpoint = safeUrl(req.body.endpoint);
    const mine = store(ctx).pushSubscriptionsForUser(req.user.id).some((s) => s.endpoint === endpoint);
    if (mine) store(ctx).deletePushSubscription(endpoint);
    res.json({ ok: true });
  });

  router.post('/push/test', ctx.requireAuth, async (req, res) => {
    const sent = await pusher.sendToUser(req.user.id, {
      title: 'התראת בדיקה',
      body: 'מעולה, ההתראות עובדות במכשיר הזה.',
      url: '/account',
    });
    res.json({ ok: true, sent });
  });

  return router;
}

const store = (ctx) => ctx.store;
