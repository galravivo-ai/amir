import { parseJson } from './db.js';
import { weekKey } from './tasks.js';

// Stage 2 of the growth plan, "lead your area": once the plan's actions are
// mostly done (a score of 85), the business gets goals measured against its
// area instead of a checklist: its share of the Maps top 3, the review gap to
// the leader, and how often AI answers mention it. Each goal comes with where
// it stood a month ago, so progress shows. Then ways to grow into more
// searches, and the weekly routine that keeps it all up.

export const STAGE2_AT = 85;
const DAY = 864e5;
const sqlTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/** The share of grid points in the Maps top 3, from each search's latest check before `at`. */
function top3At(store, businessId, at) {
  let top = 0;
  let total = 0;
  for (const k of store.rankKeywords(businessId)) {
    const last = store.db
      .prepare('SELECT points FROM rank_checks WHERE keyword_id = ? AND error IS NULL AND run_at <= ? ORDER BY run_at DESC LIMIT 1')
      .get(k.id, sqlTime(at));
    for (const p of last ? parseJson(last.points, []) : []) {
      total++;
      if (p.rank != null && p.rank <= 3) top++;
    }
  }
  return total ? Math.round((top / total) * 100) : null;
}

/** How often the business was mentioned, in the latest AI check before `at`. */
function aiAt(store, businessId, at) {
  const r = store.db
    .prepare(
      `SELECT SUM(error IS NULL) AS answered, SUM(mentioned) AS mentioned FROM ai_checks
       WHERE business_id = ? AND run_at = (SELECT MAX(run_at) FROM ai_checks WHERE business_id = ? AND run_at <= ?)`,
    )
    .get(businessId, businessId, sqlTime(at));
  return r?.answered ? Math.round(((r.mentioned || 0) / r.answered) * 100) : null;
}

const nextTarget = (now, steps) => steps.find((s) => now < s) ?? 100;

export function leadGoals(store, business, { now = Date.now() } = {}) {
  const id = business.id;
  const monthAgo = now - 30 * DAY;
  const goals = [];

  const maps = top3At(store, id, now);
  if (maps != null) {
    const target = nextTarget(maps, [50, 70, 85]);
    goals.push({ key: 'maps', title: 'בטופ 3 במפות סביב העסק', now: maps, before: top3At(store, id, monthAgo), target, unit: '%', progress: Math.min(1, maps / target), how: 'ביקורות חדשות, פוסטים ותמונות מחזקים את כל האזורים. באזורים החלשים עוזרים אזכורים מקומיים ופוסטים על השכונה.', href: '/admin/maps#rank' });
  }

  const locations = store.googleLocations(id).filter((l) => l.enabled);
  const total = locations.reduce((n, l) => n + (l.total_reviews || 0), 0);
  const leader = store.competitorsFor(id).filter((c) => !c.error && c.total != null).sort((a, b) => b.total - a.total)[0];
  if (locations.length && leader) {
    const fresh = locations.reduce((n, l) => n + store.googleReviewCount(l.id, new Date(monthAgo).toISOString()), 0);
    if (leader.total > total) {
      goals.push({ key: 'reviews', title: 'להשיג את המוביל באזור בכמות הביקורות', sub: leader.title, now: total, before: total - fresh, target: leader.total, unit: '', progress: total / leader.total, how: `חסרות ${(leader.total - total).toLocaleString('he-IL')} ביקורות. בקשה מכל לקוח מרוצה, שלט QR בעסק והודעת וואטסאפ אחרי כל שירות.`, href: '/admin/campaigns' });
    } else {
      const pace = leader.recent30 ?? null;
      goals.push({ key: 'reviews', title: 'לשמור על ההובלה בביקורות', sub: leader.title, now: fresh, before: null, target: Math.max(4, pace ?? 4), unit: 'בחודש', progress: Math.min(1, fresh / Math.max(4, pace ?? 4)), how: 'אתם מובילים באזור. כדי לשמור על הפער, צריך לפחות את קצב הביקורות החדשות של המתחרה הבא בתור.', href: '/admin/campaigns' });
    }
  }

  const ai = aiAt(store, id, now);
  if (ai != null) {
    const target = nextTarget(ai, [30, 50, 80]);
    goals.push({ key: 'ai', title: 'מוזכרים בתשובות של ChatGPT ו-Gemini', now: ai, before: aiAt(store, id, monthAgo), target, unit: '%', progress: Math.min(1, ai / target), how: 'אזכורים באתרים שה-AI סומך עליהם, תוכן באתר שעונה ישר על השאלות, וביקורות בכמה פלטפורמות.', href: '/admin/ai-visibility' });
  }
  return goals;
}

/** Ways to grow into more searches, when there's room in the plan. */
export function expansions(store, business, { rankLimit = 0, aiMax = 0 } = {}) {
  const out = [];
  const keywords = store.rankKeywords(business.id).length;
  if (keywords < rankLimit) out.push({ key: 'rank', title: 'להוסיף חיפוש למעקב במפות', why: 'שירות נוסף או שכונה נוספת שאתם רוצים להופיע בהם. מה שנמדד, משתפר.', href: '/admin/maps#rank', detail: `${keywords} מתוך ${rankLimit}` });
  const queries = parseJson(business.ai_queries, []).length;
  if (queries < aiMax) out.push({ key: 'ai', title: 'להוסיף שאלות לבדיקת ה-AI', why: 'עוד שאלות שלקוחות שואלים: לפי שירות, לפי שכונה או לפי צורך ("פתוח בשבת", "מתאים לילדים").', href: '/admin/ai-visibility#setup', detail: `${queries} מתוך ${aiMax}` });
  out.push({ key: 'faq', title: 'שאלות נפוצות לשירות נוסף', why: 'כל שירות עם עמוד שאלות ותשובות משלו נותן לגוגל ול-AI עוד תשובה לצטט.', href: '/admin/growth#a-site-faq' });
  return out;
}

/**
 * The weekly routine: a post and photos every week, and no review left
 * unanswered. The streak counts the weeks in a row it was kept, up to the
 * last one (this week counts once it's done).
 */
export function routine(store, business, { now = Date.now() } = {}) {
  const id = business.id;
  const marks = store.growthMarks(id);
  const marked = (key, week) => marks.some((m) => m.key === key && m.period === week);
  const gbp = store.googleLocations(id).some((l) => l.enabled && l.source === 'gbp');
  const posted = (week) =>
    marked('posts', week) ||
    (gbp && store.db.prepare('SELECT COUNT(*) AS n FROM google_posts WHERE business_id = ? AND created_at >= ? AND created_at < ?').get(id, `${week} 00:00:00`, `${weekKey(Date.parse(`${week}T12:00:00Z`) + 7 * DAY)} 00:00:00`).n > 0);
  const kept = (week) => posted(week) && marked('photos', week);
  const week = weekKey(now);
  const unanswered = store.googleSummary(id).unanswered;
  const items = [
    { key: 'posts', title: 'פוסט בגוגל', done: posted(week), href: '/admin/google/posts' },
    { key: 'photos', title: 'תמונות חדשות', done: marked('photos', week), href: '/admin/growth#a-photos' },
    { key: 'replies', title: 'מענה לכל הביקורות', done: unanswered === 0, href: '/admin/google/reviews?filter=unanswered' },
  ];
  let streak = 0;
  let w = kept(week) ? week : weekKey(Date.parse(`${week}T12:00:00Z`) - 7 * DAY);
  for (let i = 0; i < 52 && kept(w); i++) {
    streak++;
    w = weekKey(Date.parse(`${w}T12:00:00Z`) - 7 * DAY);
  }
  return { items, streak, done: items.filter((i) => i.done).length };
}
