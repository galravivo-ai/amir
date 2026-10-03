import { parseJson } from './db.js';

// "This week's tasks": up to three concrete things to do now, picked from what
// the system already knows. A task disappears when its cause is gone, or when
// it is marked done (until next week).

const DAY = 864e5;

/** The week's key in Israel time: the date of its Sunday. */
export function weekKey(now = Date.now()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(now))
    .split('-')
    .map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}

export function weeklyTasks(store, business, { serpOn = false, aiOn = false, now = Date.now(), limit = 3 } = {}) {
  const id = business.id;
  const out = [];
  const add = (key, priority, title, why, href, action = '') => out.push({ key, priority, title, why, href, action });
  const locations = store.googleLocations(id).filter((l) => l.enabled);
  const campaigns = store.campaignsFor(id);

  const unhappy = store.openIssuesCount(id);
  if (unhappy) add('unhappy', 100, unhappy === 1 ? 'לחזור ללקוח לא מרוצה' : `לחזור ל-${unhappy} לקוחות לא מרוצים`, 'שיחה מהירה הופכת לקוח כועס לממליץ, ומונעת ביקורת שלילית בגוגל.', '/admin/responses?sentiment=negative&status=new');

  if (!locations.length && serpOn) add('connect', 95, 'לחבר את העסק בגוגל', 'בלי זה אי אפשר לראות ביקורות, לבדוק את הפרופיל ולהשוות למתחרים.', '/admin/google');

  if (locations.length) {
    const g = store.googleStats(id, { days: 30 });
    if (g.unanswered) {
      const low = g.waiting.length;
      add('reply', low ? 92 : 80, g.unanswered === 1 ? 'לענות לביקורת שמחכה בגוגל' : `לענות ל-${g.unanswered} ביקורות שמחכות בגוגל`,
        low ? 'יש ביניהן ביקורות של 3 כוכבים ומטה. תשובה עניינית מראה ללקוחות הבאים שאכפת לכם.' : 'עסק שעונה לביקורות נראה פעיל, וגוגל רואה בזה סימן טוב. ה-AI ינסח טיוטה.',
        '/admin/google/reviews?filter=unanswered');
    }
    const fresh = locations.reduce((n, l) => n + store.googleReviewCount(l.id, new Date(now - 30 * DAY).toISOString()), 0);
    if (fresh < 4 && campaigns.length) add('ask', 75, 'לבקש דירוג מ-5 לקוחות השבוע', `ב-30 הימים האחרונים הגיעו ${fresh} ביקורות חדשות בגוגל. ביקורות טריות מעלות את העסק בתוצאות.`, '/admin', 'wa');

    const audits = store.latestAudits(id).filter((a) => !a.error);
    if (!audits.length && serpOn) add('health', 60, 'לבדוק את בריאות פרופיל הגוגל', 'בדיקה של דקה מראה מה חסר בפרופיל ומה הכי ישפיע על המיקום שלכם בגוגל.', '/admin/profile');
    for (const a of audits) {
      const worst = parseJson(a.items, [])
        .filter((i) => i.state === 'fail' && !['rating', 'reviews', 'fresh', 'replies'].includes(i.key))
        .sort((x, y) => y.weight - x.weight)[0];
      if (worst) add(`profile-${worst.key}`, 55 + worst.weight, `לשפר בפרופיל: ${worst.label}`, worst.fix, '/admin/profile');
    }

    if (serpOn && !store.competitorsFor(id).length) add('competitors', 35, 'להוסיף 2-3 מתחרים להשוואה', 'כדי לדעת אם אתם מקבלים מספיק ביקורות לעומת העסקים באזור.', '/admin/competitors');
    if ((serpOn || aiOn) && parseJson(business.ai_queries, []).length === 0) add('ai-visibility', 30, 'לבדוק אם ChatGPT וגוגל ממליצים עליכם', 'יותר ויותר לקוחות שואלים עוזר AI "איפה כדאי…". בודקים פעם אחת ומקבלים מעקב שבועי.', '/admin/ai-visibility');
  }

  if (!campaigns.length) add('campaign', 90, 'ליצור קמפיין ושלט QR', 'זה הכלי הראשי לאסוף דירוגים מלקוחות בעסק.', '/admin/campaigns/new');

  const done = new Set(store.tasksDone(id, weekKey(now)));
  return out.filter((t) => !done.has(t.key)).sort((a, b) => b.priority - a.priority).slice(0, limit);
}
