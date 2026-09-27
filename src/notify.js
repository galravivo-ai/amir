import { safeUrl } from './util.js';

/**
 * Sends a JSON payload to the business webhook (Make / Zapier / n8n / custom).
 * From there it can go to WhatsApp, email, Slack, a CRM etc.
 * Fire-and-forget: a slow or failing webhook never blocks the customer.
 */
export function sendWebhook(business, event, payload, { fetchImpl = globalThis.fetch } = {}) {
  const url = safeUrl(business?.webhook_url);
  if (!url) return Promise.resolve(false);
  const body = JSON.stringify({ event, business: { id: business.id, name: business.name }, ...payload });
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.ok)
    .catch((err) => {
      console.warn(`[webhook] ${url} failed: ${err.message}`);
      return false;
    });
}
