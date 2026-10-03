// "Profile health": how complete and active a business's Google profile is,
// as a 0-100 score from a checklist. Each item says what to do when it fails.
// Items whose data SerpApi didn't return are shown as unknown and not scored.

const DAY = 864e5;

/**
 * profile: from serp.profileOf; activity: { recent30, unanswered, replyRate,
 * postsRecent } from our own records (null when we can't know).
 */
export function healthChecks(profile, activity = {}) {
  const items = [];
  const add = (key, label, weight, state, fix, value = '') => items.push({ key, label, weight, state, fix, value });
  const level = (v, good, ok) => (v == null ? 'unknown' : v >= good ? 'pass' : v >= ok ? 'partial' : 'fail');

  add('rating', 'דירוג ממוצע 4.5 ומעלה', 15, level(profile.rating || null, 4.5, 4.2),
    'בקשו דירוג מכל לקוח מרוצה, וטפלו מהר בלקוחות לא מרוצים לפני שהם כותבים בגוגל.', profile.rating ? `${profile.rating.toFixed(1)} ★` : '');
  add('reviews', 'לפחות 100 ביקורות', 10, level(profile.reviews ?? null, 100, 30),
    'גוגל מדרגת גבוה יותר עסקים עם הרבה ביקורות. שלטי QR ובקשות בוואטסאפ אחרי כל ביקור.', profile.reviews != null ? `${profile.reviews.toLocaleString('he-IL')} ביקורות` : '');
  add('fresh', 'ביקורות חדשות בחודש האחרון (4 ומעלה)', 15, level(activity.recent30 ?? null, 4, 1),
    'ביקורות טריות חשובות לגוגל יותר מישנות. שלחו בקשות דירוג באופן קבוע, כל שבוע.', activity.recent30 != null ? `${activity.recent30} ב-30 יום` : '');
  add('replies', 'מענה ל-80% מהביקורות', 15, level(activity.replyRate ?? null, 0.8, 0.5),
    'עסק שעונה לביקורות נראה פעיל ואכפתי, וגוגל רואה בזה סימן חיובי. ה-AI ינסח לכם טיוטה בלחיצה.',
    activity.replyRate != null ? `${Math.round(activity.replyRate * 100)}% נענו` : '');
  add('hours', 'שעות פתיחה מעודכנות', 8, profile.hours ? 'pass' : profile.hours === false ? 'fail' : 'unknown',
    'הוסיפו שעות פתיחה (וגם שעות מיוחדות לחגים). בלעדיהן גוגל מציג את העסק פחות בחיפושי "פתוח עכשיו".');
  add('phone', 'מספר טלפון', 6, profile.phone ? 'pass' : 'fail', 'הוסיפו טלפון לפרופיל, כדי שלקוחות יוכלו להתקשר ישר מגוגל.', profile.phone);
  add('website', 'קישור לאתר', 6, profile.website ? 'pass' : 'fail', 'הוסיפו קישור לאתר או לדף הזמנות. גם עמוד אינסטגרם עדיף על כלום.', profile.website);
  add('description', 'תיאור עסק מלא', 8, profile.description ? (profile.description.length >= 250 ? 'pass' : 'partial') : 'unknown',
    'כתבו תיאור של 250-750 תווים עם מה שאתם עושים, איפה ולמי. ה-AI יכול לנסח לכם אחד למטה.',
    profile.description ? `${profile.description.length} תווים` : '');
  add('categories', 'קטגוריה ראשית ועוד קטגוריות משניות', 7, profile.types?.length ? (profile.types.length >= 2 ? 'pass' : 'partial') : 'unknown',
    'הוסיפו קטגוריות משניות מדויקות (למשל "בית קפה" וגם "מסעדת ארוחת בוקר"). זה מה שקובע באילו חיפושים תופיעו.',
    profile.types?.join(', ') || '');
  add('photos', 'לפחות 20 תמונות', 5, level(profile.photos ?? null, 20, 8),
    'העלו תמונות אמיתיות ועדכניות: חזית, פנים, מנות או מוצרים, צוות. פרופיל עם הרבה תמונות מקבל יותר קליקים.',
    profile.photos ? `${profile.photos} תמונות` : '');
  add('attributes', 'מאפייני שירות (ישיבה בחוץ, משלוחים, נגישות…)', 5, profile.attributes ? 'pass' : 'unknown',
    'סמנו בפרופיל את מאפייני השירות: נגישות, ישיבה בחוץ, משלוחים, תשלום באשראי וכו׳.');
  if (activity.postsRecent != null) {
    add('posts', 'פוסט בגוגל בשבועיים האחרונים', 5, activity.postsRecent > 0 ? 'pass' : 'fail',
      'פרסמו עדכון, מבצע או אירוע. פוסטים קבועים מראים לגוגל שהעסק פעיל.');
  }

  const scored = items.filter((i) => i.state !== 'unknown');
  const max = scored.reduce((s, i) => s + i.weight, 0);
  const got = scored.reduce((s, i) => s + i.weight * (i.state === 'pass' ? 1 : i.state === 'partial' ? 0.5 : 0), 0);
  return { score: max ? Math.round((got / max) * 100) : 0, items };
}

/** What the business itself did lately, from its own records. */
export function activityOf(store, businessId, location, now = Date.now()) {
  const since = new Date(now - 30 * DAY).toISOString();
  const recent30 = store.googleReviewCount(location.id, since);
  const totals = store.db
    .prepare("SELECT COUNT(*) AS n, SUM(reply != '') AS replied FROM google_reviews WHERE location_id = ? AND create_time >= ?")
    .get(location.id, new Date(now - 180 * DAY).toISOString());
  const posts = location.source === 'gbp'
    ? store.db.prepare("SELECT COUNT(*) AS n FROM google_posts WHERE business_id = ? AND created_at >= datetime('now', '-14 days')").get(businessId).n
    : null;
  return { recent30, replyRate: totals.n ? (totals.replied || 0) / totals.n : null, postsRecent: posts };
}

export const scoreLabel = (s) => (s >= 85 ? 'מצוין' : s >= 70 ? 'טוב' : s >= 50 ? 'יש מה לשפר' : 'דורש טיפול');
