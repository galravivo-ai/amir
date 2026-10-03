import { safeUrl } from './util.js';

// Posts on a Google Business Profile ("updates", offers and events), shaped
// the way the v4 localPosts API expects them.

export const POST_TOPICS = {
  STANDARD: 'עדכון',
  OFFER: 'מבצע',
  EVENT: 'אירוע',
};

/** The button under the post; "CALL" dials the number on the profile, so it takes no link. */
export const CTA_TYPES = {
  '': 'בלי כפתור',
  LEARN_MORE: 'מידע נוסף',
  BOOK: 'הזמנת מקום',
  ORDER: 'הזמנה אונליין',
  SHOP: 'לקנייה',
  SIGN_UP: 'הרשמה',
  CALL: 'התקשרו אלינו',
};

export const SUMMARY_MAX = 1500;
const clip = (v, max) => String(v ?? '').trim().slice(0, max);
const localDateTime = (v) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v ?? '')) ? String(v) : '');

/** Checks what the form sent; returns the post and the problems in Hebrew. */
export function readPost(body) {
  const topic = POST_TOPICS[body.topic] ? body.topic : 'STANDARD';
  const ctaType = CTA_TYPES[body.cta_type] !== undefined ? String(body.cta_type ?? '') : '';
  const post = {
    topic,
    summary: clip(body.summary, SUMMARY_MAX),
    title: topic === 'STANDARD' ? '' : clip(body.title, 58),
    startsAt: topic === 'STANDARD' ? '' : localDateTime(body.starts_at),
    endsAt: topic === 'STANDARD' ? '' : localDateTime(body.ends_at),
    coupon: topic === 'OFFER' ? clip(body.coupon, 58) : '',
    terms: topic === 'OFFER' ? clip(body.terms, 500) : '',
    ctaType,
    ctaUrl: ctaType && ctaType !== 'CALL' ? safeUrl(body.cta_url) : '',
  };
  const errors = [];
  if (!post.summary && topic === 'STANDARD') errors.push('כתבו את הטקסט של הפוסט.');
  if (topic !== 'STANDARD') {
    if (!post.title) errors.push(`ל${POST_TOPICS[topic]} צריך כותרת.`);
    if (!post.startsAt || !post.endsAt) errors.push(`ל${POST_TOPICS[topic]} צריך תאריך התחלה ותאריך סיום.`);
    else if (post.endsAt <= post.startsAt) errors.push('תאריך הסיום צריך להיות אחרי תאריך ההתחלה.');
  }
  if (ctaType && ctaType !== 'CALL' && !post.ctaUrl) errors.push('לכפתור צריך קישור שמתחיל ב-https://');
  return { post, errors };
}

function dateParts(v) {
  const [d, t] = v.split('T');
  const [year, month, day] = d.split('-').map(Number);
  const [hours, minutes] = t.split(':').map(Number);
  return { date: { year, month, day }, time: { hours, minutes, seconds: 0, nanos: 0 } };
}

/** The request body for accounts/A/locations/L/localPosts. */
export function googlePostBody(post, { imageUrl = '', languageCode = 'he' } = {}) {
  const body = { languageCode, topicType: post.topic };
  if (post.summary) body.summary = post.summary;
  if (post.ctaType) body.callToAction = post.ctaType === 'CALL' ? { actionType: 'CALL' } : { actionType: post.ctaType, url: post.ctaUrl };
  if (imageUrl) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }];
  if (post.topic !== 'STANDARD') {
    const s = dateParts(post.startsAt);
    const e = dateParts(post.endsAt);
    // Offers keep their title and dates in `event` too.
    body.event = { title: post.title, schedule: { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time } };
  }
  if (post.topic === 'OFFER' && (post.coupon || post.terms)) {
    body.offer = {};
    if (post.coupon) body.offer.couponCode = post.coupon;
    if (post.terms) body.offer.termsConditions = post.terms;
  }
  return body;
}
