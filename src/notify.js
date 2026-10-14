import dns from 'node:dns/promises';
import net from 'node:net';
import { safeUrl } from './util.js';

/** Loopback, private, link-local and other addresses that never belong to a public web server. */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') ||
    v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

/**
 * A business webhook must be a public HTTPS address: the server never posts to
 * itself, to the hosting network or to a cloud metadata address.
 */
export async function publicHttpsUrl(raw, { lookup = dns.lookup, allowLocal = false } = {}) {
  const url = safeUrl(raw);
  if (!url || allowLocal) return url;
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return '';
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return '';
  } catch {
    return '';
  }
  return url;
}

/**
 * Sends a JSON payload to the business webhook (Make / Zapier / n8n / custom).
 * From there it can go to WhatsApp, email, Slack, a CRM etc.
 * Fire-and-forget: a slow or failing webhook never blocks the customer.
 */
export async function sendWebhook(business, event, payload, { fetchImpl = globalThis.fetch, lookup, allowLocal = false } = {}) {
  const url = await publicHttpsUrl(business?.webhook_url, { allowLocal, ...(lookup ? { lookup } : {}) });
  if (!url) return false;
  const body = JSON.stringify({ event, business: { id: business.id, name: business.name }, ...payload });
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    // Redirects are not followed, so a public address can't bounce the call inward.
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.ok)
    .catch((err) => {
      console.warn(`[webhook] ${url} failed: ${err.message}`);
      return false;
    });
}
