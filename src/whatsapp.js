// Rating requests sent straight from the platform's WhatsApp Business number,
// through Meta's WhatsApp Cloud API. Messages a business starts must use a
// template Meta approved, so the wording is the template's; the business name,
// the customer's name and the personal link fill its three variables.

import { planOf } from './plans.js';
import { waNumber } from './util.js';

export class WhatsAppError extends Error {}

const clean = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');

/** Returns null when WhatsApp isn't configured. */
export function createWhatsApp({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const accessToken = clean(env.WHATSAPP_TOKEN);
  const phoneId = clean(env.WHATSAPP_PHONE_NUMBER_ID);
  if (!accessToken || !phoneId) return null;
  const template = clean(env.WHATSAPP_TEMPLATE) || 'review_request';
  const language = clean(env.WHATSAPP_TEMPLATE_LANG) || 'he';
  const version = clean(env.WHATSAPP_API_VERSION) || 'v23.0';

  return {
    /** Sends the rating request; returns Meta's message id. */
    async sendInvite({ phone, name, businessName, link }) {
      const to = waNumber(phone);
      if (to.length < 11) throw new WhatsAppError('מספר הטלפון לא תקין');
      // A template variable can't be empty or hold line breaks.
      const text = (v, fallback) => String(v || fallback).replace(/\s+/g, ' ').trim().slice(0, 200);
      const res = await fetchImpl(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: text(name, 'לקוח יקר') },
                  { type: 'text', text: text(businessName, 'העסק') },
                  { type: 'text', text: link },
                ],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(30e3),
      });
      let json = {};
      try {
        json = JSON.parse(await res.text());
      } catch {
        /* not JSON */
      }
      const id = json.messages?.[0]?.id;
      if (!res.ok || !id) throw new WhatsAppError(String(json.error?.error_data?.details || json.error?.message || `HTTP ${res.status}`).slice(0, 200));
      return id;
    },
  };
}

/** How many WhatsApp requests the business may still send this month. */
export function whatsAppLeft(store, business) {
  const quota = planOf(business).waMonthly ?? 0;
  return Math.max(0, quota - store.whatsAppSentThisMonth(business.id));
}

/**
 * Sends one invite by WhatsApp and records the outcome on it.
 * Returns { ok } or { ok: false, error }.
 */
export async function sendWhatsAppInvite({ store, whatsapp, business, campaign, invite, baseUrl }) {
  if (!whatsapp) return { ok: false, error: 'השליחה האוטומטית בוואטסאפ לא מוגדרת' };
  if (whatsAppLeft(store, business) <= 0) {
    store.setInviteWhatsApp(invite.id, { wa_status: 'failed', wa_error: 'quota', wa_send_at: null });
    return { ok: false, error: `נגמרה מכסת ההודעות בוואטסאפ לחודש הזה (${planOf(business).waMonthly}). אפשר לשלוח מהטלפון, או לשדרג מסלול.` };
  }
  try {
    const id = await whatsapp.sendInvite({
      phone: invite.phone,
      name: invite.customer_name,
      businessName: business.name,
      link: `${baseUrl}/r/${campaign.slug}?i=${invite.token}`,
    });
    store.setInviteWhatsApp(invite.id, { wa_message_id: id, wa_status: 'sent', wa_error: null, wa_send_at: null, wa_sent_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    return { ok: true };
  } catch (err) {
    store.setInviteWhatsApp(invite.id, { wa_status: 'failed', wa_error: String(err.message).slice(0, 200), wa_send_at: null });
    return { ok: false, error: err.message };
  }
}
