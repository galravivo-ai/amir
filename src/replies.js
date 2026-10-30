import { fillTemplate, templatesFor } from './network.js';

/**
 * Reviews ready to be answered in place (dashboard, reviews list): a reply
 * suggested from the business's templates, and whether it can be published
 * from here (a connected Business Profile) or is copied to Google instead.
 */
export function withSuggestions(store, business, reviews, { connected = false, demo = false } = {}) {
  const templates = store.replyTemplates(business.id);
  return reviews.map((r) => ({
    ...r,
    canPublish: demo || (connected && r.source === 'gbp'),
    suggested: r.reply ? '' : templatesFor(templates, r.rating).map((t) => fillTemplate(t.body, r))[0] || '',
    googleLink: r.link || (r.place_id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(r.place_id)}` : ''),
  }));
}

/** The tones a business can pick for its AI replies. */
export const REPLY_TONES = {
  warm: ['חם ואישי', 'חם, אישי ולבבי, כמו בעל עסק שמכיר את הלקוחות שלו'],
  pro: ['מקצועי ומנומס', 'מקצועי, מנומס ומכובד, בלי סלנג'],
  short: ['קצר ועניני', 'קצר מאוד ועניני: משפט או שניים'],
  fun: ['קליל ומחויך', 'קליל, מחויך ובגובה העיניים, עם קורטוב הומור כשזה מתאים (לא בביקורת שלילית)'],
};

/** A business's style for AI replies: tone, emoji, a sign-off and free notes. */
export function replyStyleOf(business) {
  let s = {};
  try {
    s = JSON.parse(business?.reply_style || '{}') || {};
  } catch {
    s = {};
  }
  return {
    tone: Object.hasOwn(REPLY_TONES, s.tone) ? s.tone : '',
    emoji: Boolean(s.emoji),
    sign: String(s.sign ?? '').slice(0, 60),
    notes: String(s.notes ?? '').slice(0, 300),
  };
}
