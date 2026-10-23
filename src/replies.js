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
