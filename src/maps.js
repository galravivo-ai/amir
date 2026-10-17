import { parseJson } from './db.js';
import { weekKey } from './tasks.js';

// "Climbing in Google Maps": a short plan built from what the system already
// knows, grouped by the three things Google says decide local results:
// relevance (does the profile match the search), prominence (reviews, replies,
// activity) and distance (how close the searcher is). Steps share their keys
// with the weekly tasks, so "done" in one place hides them in both.

const DAY = 864e5;
const SIDES = ['צפון-מערב', 'צפון', 'צפון-מזרח', 'מערב', 'העסק', 'מזרח', 'דרום-מערב', 'דרום', 'דרום-מזרח'];
// Items about reviews are worked through their own steps, not as "fill in the profile".
const REVIEW_ITEMS = new Set(['rating', 'reviews', 'fresh', 'replies', 'posts']);

export const FACTORS = {
  relevance: 'התאמה לחיפוש',
  prominence: 'בולטות ופעילות',
  distance: 'מרחק',
};

const num = (n) => Number(n).toLocaleString('he-IL');

export function mapsPlan(store, business, { serpOn = false, now = Date.now(), limit = 5 } = {}) {
  const id = business.id;
  const out = [];
  const add = (key, priority, factor, title, why, href, action = '') => out.push({ key, priority, factor, title, why, href, action });
  const locations = store.googleLocations(id).filter((l) => l.enabled);
  if (!locations.length) return [];

  // Relevance: what the profile check found missing, the weightiest first.
  const audits = store.latestAudits(id).filter((a) => !a.error);
  if (!audits.length && serpOn) add('health', 70, 'relevance', 'לבדוק מה חסר בפרופיל', 'בדיקה של דקה מראה מה חסר בפרופיל בגוגל ומה הכי ישפיע על המיקום.', '#health');
  const gaps = new Map();
  for (const a of audits) {
    for (const i of parseJson(a.items, [])) {
      if (REVIEW_ITEMS.has(i.key) || !['fail', 'partial'].includes(i.state)) continue;
      if (!gaps.has(i.key) || gaps.get(i.key).state === 'partial') gaps.set(i.key, i);
    }
  }
  [...gaps.values()]
    .sort((x, y) => (y.state === 'fail') - (x.state === 'fail') || y.weight - x.weight)
    .slice(0, 2)
    .forEach((i, n) => add(`profile-${i.key}`, 62 + i.weight - n, 'relevance', `להשלים בפרופיל: ${i.label}`, i.fix, '#health'));

  // Prominence: replies, a steady flow of new reviews, and posts.
  const g = store.googleStats(id, { days: 30 });
  if (g.unanswered) {
    add('reply', g.waiting.length ? 92 : 80, 'prominence', g.unanswered === 1 ? 'לענות לביקורת שמחכה' : `לענות ל-${g.unanswered} ביקורות שמחכות`,
      'גוגל רואה בעסק שעונה לביקורות עסק פעיל. ה-AI ינסח טיוטה בלחיצה.', '/admin/google/reviews?filter=unanswered');
  }
  const fresh = locations.reduce((n, l) => n + store.googleReviewCount(l.id, new Date(now - 30 * DAY).toISOString()), 0);
  const total = locations.reduce((n, l) => n + (l.total_reviews || 0), 0);
  const leader = store.competitorsFor(id).filter((c) => !c.error && c.total != null).sort((a, b) => b.total - a.total)[0];
  if (leader && leader.total > total) {
    const ahead = leader.recent30 != null && !leader.recent_capped && fresh > leader.recent30;
    const pace = leader.recent30 != null ? ` בחודש האחרון הם קיבלו ${leader.recent_capped ? 'יותר מ-' : ''}${num(leader.recent30)}, ואתם ${num(fresh)}.` : ` בחודש האחרון קיבלתם ${num(fresh)}.`;
    add('ask', ahead ? 70 : 85, 'prominence', ahead ? 'להמשיך לבקש דירוגים בקצב הזה' : 'לבקש דירוג מ-5 לקוחות השבוע',
      `ל${leader.title} יש ${num(leader.total)} ביקורות ולכם ${num(total)}.${pace} ${ahead ? 'אתם בקצב טוב יותר, וכך הפער נסגר. חשוב לא לעצור.' : 'קצב קבוע של ביקורות חדשות הוא מה שסוגר את הפער.'}`, '/admin/campaigns', 'wa');
  } else if (fresh < 4) {
    add('ask', 75, 'prominence', 'לבקש דירוג מ-5 לקוחות השבוע', `ב-30 הימים האחרונים הגיעו ${num(fresh)} ביקורות חדשות. גוגל נותנת משקל לביקורות טריות, לא רק לכמות.`, '/admin/campaigns', 'wa');
  }
  if (locations.some((l) => l.source === 'gbp')) {
    const last = store.googlePosts(id, 1)[0];
    const age = last ? (now - Date.parse(`${last.created_at.replace(' ', 'T')}Z`)) / DAY : Infinity;
    if (age > 14) add('posts', 50, 'prominence', 'לפרסם פוסט בגוגל', last ? 'הפוסט האחרון עלה לפני יותר משבועיים. עדכון, מבצע או תמונה חדשה מראים לגוגל שהעסק פעיל.' : 'עוד לא פרסמתם פוסט. עדכון, מבצע או תמונה חדשה מראים לגוגל שהעסק פעיל.', '/admin/google/posts');
  }
  if (serpOn && !store.competitorsFor(id).length) add('competitors', 35, 'prominence', 'להוסיף 2-3 מתחרים להשוואה', 'כך התוכנית תראה כמה ביקורות חסרות לכם כדי להשתוות למוביל באזור.', '/admin/competitors');

  // Distance: can't be changed, but the grid shows where the business is weak.
  const keywords = store.rankKeywords(id);
  if (!keywords.length && serpOn) add('rank', 60, 'distance', 'להגדיר חיפוש למעקב', 'כותבים מה לקוחות מחפשים ("בית קפה", "עורך דין") ורואים באיזה מקום אתם מופיעים מכל כיוון סביב העסק.', '#rank');
  for (const k of keywords) {
    const last = store.rankChecks(k.id, 1).find((c) => !c.error);
    if (!last) continue;
    const points = parseJson(last.points, []);
    const weak = points.map((p, i) => (i !== 4 && (p.rank == null || p.rank > 10) ? SIDES[i] : null)).filter(Boolean);
    if (!weak.length || weak.length === 8) continue;
    const top = points.find((p, i) => SIDES[i] === weak[0])?.top?.[0];
    add(`area-${k.id}`, 40, 'distance', `לחזק את האזור: ${weak.slice(0, 3).join(', ')}${weak.length > 3 ? ' ועוד' : ''}`,
      `בחיפוש «${k.keyword}» אתם לא בעשרת הראשונים בכיוונים האלה${top ? `, ושם מוביל ${top}` : ''}. מוודאים שהכתובת והסיכה במפה מדויקות, ומזכירים בפוסטים ובתיאור את השכונות שם.`, '#rank');
  }

  const done = new Set(store.tasksDone(id, weekKey(now)));
  return out.filter((t) => !done.has(t.key)).sort((a, b) => b.priority - a.priority).slice(0, limit);
}
