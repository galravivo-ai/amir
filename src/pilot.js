import { parseJson } from './db.js';
import { growthPlan } from './growth.js';

// The pilot checklist: what a business trying GoFive for two weeks is asked
// to do, built around the growth plan. Each step is marked by what the system
// sees (Google connected, replies, the app's alerts, actions in the plan);
// the one it can't see, asking customers for reviews, is marked by hand. At
// the end: three short questions, sent to the operator.

export const PILOT_MARKS = ['pilot:ask'];

export function pilotSteps(store, business, user) {
  const id = business.id;
  const locations = store.googleLocations(id).filter((l) => l.enabled);
  const started = String(business.created_at || '').replace(' ', 'T');
  const replies = locations.length
    ? store.db
        .prepare("SELECT COUNT(*) AS n FROM google_reviews r JOIN google_locations l ON l.id = r.location_id WHERE l.business_id = ? AND r.reply_time != '' AND r.reply_time >= ?")
        .get(id, started).n
    : 0;
  const marks = store.growthMarks(id);
  const has = (key) => marks.some((m) => m.key === key);
  const actions = marks.filter((m) => !m.key.startsWith('dir:') && !m.key.startsWith('pilot:')).length;
  const plan = locations.length ? growthPlan(store, business) : null;
  const drafts = Object.keys(store.growthDrafts(id)).length;

  const weeks = [
    {
      title: 'שבוע 1: הקמה',
      steps: [
        { key: 'connect', title: 'לחבר את פרופיל הגוגל', how: 'חיבור עם חשבון הגוגל שמנהל את העסק, ובחירת הסניף.', href: '/admin/google', done: locations.length > 0 },
        { key: 'reviews', title: 'לבדוק שהביקורות והדירוג הופיעו', how: 'מגיעים תוך כמה דקות מהחיבור. אם משהו חסר, כתבו לנו.', href: '/admin/google/reviews', done: locations.some((l) => l.synced_at || l.total_reviews) },
        { key: 'reply', title: 'לענות ל-3 ביקורות ממסך הביקורות', how: 'עם תשובה מוכנה או טיוטה של ה-AI, ישר מהרשימה.', href: '/admin/google/reviews?filter=unanswered', done: replies >= 3, detail: replies ? `${Math.min(replies, 3)} מתוך 3` : '' },
        { key: 'app', title: 'להתקין כאפליקציה ולהפעיל התראות', how: 'בטלפון: "התקנה כאפליקציה" בתפריט, ואז "החשבון שלי" ← הפעלת התראות.', href: '/account#push', done: store.pushSubscriptionsForUser(user.id).length > 0 },
        { key: 'about', title: 'לכתוב בתוכנית הקידום מה העסק עושה', how: 'שתי דקות ב"על העסק, בשביל ה-AI". משפר כל טקסט שה-AI כותב.', href: '/admin/growth', done: Boolean(String(business.growth_services ?? '').trim()) },
        { key: 'rank', title: 'להגדיר חיפוש אחד למעקב במפות', how: 'מה לקוחות מחפשים כדי למצוא אתכם, למשל "מספרה בחולון".', href: '/admin/maps#rank', done: store.rankKeywords(id).length > 0 },
      ],
    },
    {
      title: 'שבוע 2: קידום',
      steps: [
        { key: 'ask', title: 'לבקש ביקורת מ-5 לקוחות', how: 'בוואטסאפ מהדשבורד, או עם שלט ה-QR בעסק. מסמנים כשסיימתם.', href: '/admin', manual: 'pilot:ask', done: has('pilot:ask') },
        { key: 'actions', title: 'לבצע 3 פעולות מתוכנית הקידום', how: 'מתחילים מ"הכי שווה לעשות עכשיו", ומסמנים "בוצע".', href: '/admin/growth', done: actions >= 3, detail: actions ? `${Math.min(actions, 3)} מתוך 3` : '' },
        { key: 'write', title: 'לתת ל-AI לכתוב תוכן אחד', how: 'למשל תיאור לפרופיל או שאלות נפוצות לאתר, ולפרסם אותו.', href: '/admin/growth', done: drafts > 0 },
        { key: 'ai', title: 'לבחור שאלות לבדיקת נראות ב-AI', how: 'מה לקוחות שואלים את ChatGPT, והמערכת בודקת אם ממליצים עליכם.', href: '/admin/ai-visibility', done: parseJson(business.ai_queries, []).length > 0 },
      ],
    },
  ];
  const all = weeks.flatMap((w) => w.steps);
  return {
    weeks,
    done: all.filter((s) => s.done).length,
    total: all.length,
    score: plan?.score ?? null,
    feedback: has('pilot:feedback'),
  };
}
