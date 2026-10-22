import { parseJson } from './db.js';

// After connecting Google: what arrives when, and what has already arrived.
// The times follow how the system works: reviews load at connection, the
// profile's numbers right after (Google itself reports them a few days late),
// the weekly checks on the next round of the background jobs (every few
// minutes), and new reviews every half hour.

const DAY = 864e5;

export function dataArrival(store, business, { serpOn = false, aiPlus = false } = {}) {
  const id = business.id;
  const locations = store.googleLocations(id).filter((l) => l.enabled);
  const conn = store.googleConnection(id);
  const reviews = locations.some((l) => l.synced_at || l.total_reviews);
  const metrics = Boolean(store.profileMetricsLastDate(id));
  const audits = store.latestAudits(id).filter((a) => !a.error).length > 0;
  const keywords = store.rankKeywords(id);
  const ranked = keywords.some((k) => store.rankChecks(k.id, 1).some((c) => !c.error));
  const items = [
    { key: 'reviews', title: 'ביקורות ודירוג', when: 'תוך דקה מהחיבור', done: reviews },
    {
      key: 'metrics',
      title: 'צפיות, שיחות ובקשות הגעה',
      when: 'תוך כמה דקות, 18 חודשים אחורה. גוגל מוסרת את המספרים באיחור של כמה ימים, ולכן הימים האחרונים מתמלאים בהדרגה.',
      done: metrics,
      href: '/admin/data#profile',
    },
    { key: 'searches', title: 'מה חיפשו כשמצאו אתכם', when: 'לפי חודש: החודש שעבר מופיע בתחילת החודש הבא.', done: metrics, href: '/admin/data#profile' },
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
  items.push({ key: 'live', title: 'ביקורות חדשות והתראות', when: 'נבדק כל חצי שעה, ומגיעה התראה על כל ביקורת חדשה.', done: reviews });
  const since = conn?.created_at ? Date.now() - Date.parse(`${conn.created_at.replace(' ', 'T')}Z`) : Infinity;
  return { items, pending: items.filter((i) => !i.done).length, fresh: since < 7 * DAY, connected: Boolean(conn) };
}
