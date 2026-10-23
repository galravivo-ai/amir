import { mapsTop3 } from './rankings.js';
import { parseJson } from './db.js';
import { viewsOf } from './views/performance.js';

// What the AI insights read about a business over a period: not only the
// survey feedback, but its Google reviews and the profile itself (views,
// calls, searches), where it stands in Maps, its competitors and AI answers.
// The numbers go in as plain facts; the AI is told not to invent any.

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const fmt = (n) => Number(n || 0).toLocaleString('he-IL');

export function businessFacts(store, business, { days = 30, now = Date.now() } = {}) {
  const id = business.id;
  const from = now - days * 864e5;
  const facts = [];

  // Google reviews: the rating, and what came in during the period.
  const reviews = store.googleReviews(id, { days, limit: 200 }).map((r) => ({ rating: r.rating, text: r.comment || '', replied: Boolean(r.reply) }));
  const g = store.googleSummary(id);
  if (g.total) facts.push(`דירוג בגוגל: ${g.avg.toFixed(1)} מתוך ${fmt(g.total)} ביקורות.`);
  if (reviews.length) {
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const low = reviews.filter((r) => r.rating <= 3).length;
    facts.push(`ביקורות חדשות בגוגל בתקופה: ${reviews.length}, ממוצע ${avg.toFixed(1)}, מתוכן ${low} של 3 כוכבים ומטה. ענו ל-${reviews.filter((r) => r.replied).length} מהן.`);
  } else if (g.total) {
    facts.push('לא הגיעו ביקורות חדשות בגוגל בתקופה.');
  }

  // The profile's own numbers, against the period before.
  if (store.profileMetricsLastDate(id)) {
    const t = store.profileMetricTotals(id, day(from), day(now));
    const p = store.profileMetricTotals(id, day(from - days * 864e5), day(from - 864e5));
    const line = (label, now0, before) => `${label}: ${fmt(now0)}${before ? ` (בתקופה הקודמת ${fmt(before)})` : ''}`;
    facts.push(
      `הפרופיל בגוגל בתקופה: ${[
        line('צפיות', viewsOf(t), viewsOf(p)),
        line('שיחות', t.CALL_CLICKS, p.CALL_CLICKS),
        line('בקשות הגעה', t.BUSINESS_DIRECTION_REQUESTS, p.BUSINESS_DIRECTION_REQUESTS),
        line('כניסות לאתר', t.WEBSITE_CLICKS, p.WEBSITE_CLICKS),
      ].join(' · ')}. גוגל מוסרת את המספרים באיחור של כמה ימים.`,
    );
    const d = new Date(now);
    const months = [1, 2].map((i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
    const words = store.profileKeywords(id, months, null, 8).filter((k) => k.value);
    if (words.length) facts.push(`מה חיפשו כשמצאו את העסק (חודשיים אחרונים): ${words.map((k) => `${k.keyword} (${fmt(k.value)})`).join(', ')}.`);
  }

  // Maps: how often in the top 3 around the business, and what the profile check found missing.
  const maps = mapsTop3(store, id);
  if (maps) {
    const searches = store.rankKeywords(id).map((k) => k.keyword);
    facts.push(`במפות: בשלושת הראשונים ב-${maps.top} מתוך ${maps.total} נקודות שנבדקו סביב העסק, בחיפושים: ${searches.join(', ')}.`);
  }
  const audits = store.latestAudits(id).filter((a) => !a.error);
  if (audits.length) {
    const missing = [...new Set(audits.flatMap((a) => parseJson(a.items, []).filter((i) => i.state === 'fail').map((i) => i.label)))].slice(0, 5);
    facts.push(`בריאות הפרופיל: ${Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length)}/100${missing.length ? `. חסר: ${missing.join(', ')}` : ''}.`);
  }

  // Competitors the business follows.
  const rivals = store.competitorsFor(id).filter((c) => !c.error && c.total != null).sort((a, b) => b.total - a.total).slice(0, 4);
  if (rivals.length) {
    facts.push(`מתחרים: ${rivals.map((c) => `${c.title} (${c.rating ?? '—'}★, ${fmt(c.total)} ביקורות${c.recent30 != null ? `, ${fmt(c.recent30)} בחודש האחרון` : ''})`).join('; ')}.`);
  }

  // AI answers: in how many the business was mentioned on the last check.
  const ai = store.aiVisibility(id);
  const lastRun = ai.runs.at(-1);
  if (lastRun?.answered) facts.push(`נראות ב-AI (ChatGPT, Gemini ועוד), בבדיקה האחרונה: העסק הוזכר ב-${lastRun.mentioned || 0} מתוך ${lastRun.answered} תשובות.`);

  return { facts, reviews };
}
