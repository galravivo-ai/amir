import { parseJson } from './db.js';

// After connecting Google: what arrives when, and what has already arrived.
// The times follow how the system works: reviews load at connection, the
// profile's numbers right after (Google itself reports them a few days late),
// the weekly checks on the next round of the background jobs (every few
// minutes), and new reviews every half hour.

const DAY = 864e5;

export function dataArrival(store, business, { serpOn = false, aiPlus = false } = {}) {
  const id = business.id;
  const locations = store.googleLocations(business.id).filter((l) => l.enabled);
  const conn = store.googleConnection(id);
  // Places followed by their Maps link bring reviews and rating only.
  const byLinkOnly = !conn && locations.length > 0 && locations.every((l) => l.source === 'serp');
  const reviews = locations.some((l) => l.synced_at || l.total_reviews);
  const reviewsError = conn?.last_error || locations.find((l) => l.sync_error)?.sync_error || '';
  const metrics = Boolean(store.profileMetricsLastDate(id));
  const metricsError = locations.find((l) => l.source !== 'serp' && l.metrics_error)?.metrics_error || '';
  const audits = store.latestAudits(id).filter((a) => !a.error).length > 0;
  const keywords = store.rankKeywords(id);
  const ranked = keywords.some((k) => store.rankChecks(k.id, 1).some((c) => !c.error));
  const fullOnly = { when: 'מגיע רק בחיבור מלא לחשבון הגוגל שמנהל את העסק. במעקב לפי קישור מגיעים ביקורות ודירוג בלבד.', unavailable: true, href: '/admin/google', todo: 'לחיבור מלא' };
  const items = [
    { key: 'reviews', title: 'ביקורות ודירוג', when: byLinkOnly ? 'תוך כמה דקות מההוספה (שנה אחורה)' : 'תוך דקה מהחיבור', done: reviews, error: reviews ? '' : reviewsError },
    byLinkOnly
      ? { key: 'metrics', title: 'צפיות, שיחות ובקשות הגעה', done: false, ...fullOnly }
      : {
          key: 'metrics',
          title: 'צפיות, שיחות ובקשות הגעה',
          when: 'תוך כמה דקות, 18 חודשים אחורה. גוגל מוסרת את המספרים באיחור של כמה ימים, ולכן הימים האחרונים מתמלאים בהדרגה.',
          done: metrics,
          error: metrics ? '' : metricsError,
          href: '/admin/data#profile',
        },
    byLinkOnly
      ? { key: 'searches', title: 'מה חיפשו כשמצאו אתכם', done: false, ...fullOnly }
      : { key: 'searches', title: 'מה חיפשו כשמצאו אתכם', when: 'לפי חודש: החודש שעבר מופיע בתחילת החודש הבא.', done: metrics, href: '/admin/data#profile' },
  ];
  if (serpOn) {
    items.push({ key: 'health', title: 'בריאות הפרופיל ותוכנית לקידום במפות', when: 'תוך כרבע שעה, ואז בדיקה חדשה כל שבוע.', done: audits, href: '/admin/maps' });
    items.push({
      key: 'rank',
      title: 'מיקום במפות',
      when: keywords.length ? 'תוך כמה דקות מהגדרת החיפוש, ואז כל שבוע.' : 'מתחיל כשמגדירים חיפוש למעקב (למשל "בית קפה"), ואז כל שבוע.',
      done: ranked,
      href: '/admin/maps#rank',
      todo: !keywords.length && 'להגדרת חיפוש',
    });
  }
  if (aiPlus) {
    const queries = parseJson(business.ai_queries, []).length;
    items.push({
      key: 'ai',
      title: 'נראות ב-ChatGPT, Gemini ו-AI',
      when: queries ? 'תוך כרבע שעה מבחירת השאלות, ואז כל שבוע.' : 'מתחיל כשבוחרים את השאלות שלקוחות שואלים, ואז כל שבוע.',
      done: Boolean(business.ai_checked_at),
      href: '/admin/ai-visibility',
      todo: !queries && 'לבחירת שאלות',
    });
  }
  items.push({ key: 'live', title: 'ביקורות חדשות והתראות', when: byLinkOnly ? 'נבדק כמה פעמים ביום, ומגיעה התראה על כל ביקורת חדשה.' : 'נבדק כל חצי שעה, ומגיעה התראה על כל ביקורת חדשה.', done: reviews });
  const started = conn?.created_at || locations.map((l) => l.created_at).filter(Boolean).sort()[0];
  const since = started ? Date.now() - Date.parse(`${String(started).replace(' ', 'T')}Z`) : Infinity;
  return {
    items,
    pending: items.filter((i) => !i.done && !i.unavailable).length,
    failed: items.some((i) => i.error),
    // New, or still waiting for its first reviews (places followed by link have no start date of their own).
    fresh: since < 7 * DAY || !reviews,
    connected: Boolean(conn) || locations.length > 0,
    byLinkOnly,
  };
}
