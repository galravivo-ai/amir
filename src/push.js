import webpushLib from 'web-push';

/**
 * Browser push notifications (Web Push with VAPID). Keys come from env or are
 * generated once and kept in the database, so subscriptions survive restarts.
 * `webpush` can be injected for tests.
 */
export function createPusher(store, { webpush = webpushLib, subject } = {}) {
  let publicKey = process.env.VAPID_PUBLIC_KEY || store.setting('vapid_public');
  let privateKey = process.env.VAPID_PRIVATE_KEY || store.setting('vapid_private');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    ({ publicKey, privateKey } = keys);
    store.setSetting('vapid_public', publicKey);
    store.setSetting('vapid_private', privateKey);
  }
  const contact =
    subject ||
    (process.env.CONTACT_EMAIL ? `mailto:${process.env.CONTACT_EMAIL}` : process.env.PUBLIC_URL || 'mailto:admin@localhost');
  webpush.setVapidDetails(contact, publicKey, privateKey);

  async function sendTo(subs, payload) {
    let sent = 0;
    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
          sent++;
        } catch (err) {
          // The device unsubscribed or the subscription expired: forget it.
          if (err.statusCode === 404 || err.statusCode === 410) store.deletePushSubscription(s.endpoint);
          else console.warn(`[push] ${err.statusCode || ''} ${err.message}`);
        }
      }),
    );
    return sent;
  }

  return {
    publicKey,
    sendToBusiness: (businessId, payload, locationId = null) => sendTo(store.pushSubscriptionsForBusiness(businessId, locationId), payload),
    sendToUser: (userId, payload) => sendTo(store.pushSubscriptionsForUser(userId), payload),
  };
}
