import { comparison } from './competitors.js';
import { branchesOf, branchRows } from './network.js';
import { midnight } from './period.js';

// The monthly report: one calendar month (Israel time) of Google reviews,
// survey answers, topics, quotes, AI visibility and competitors, compared
// with the month before.

export const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const pad = (n) => String(n).padStart(2, '0');
const israelToday = (now) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));

/** "YYYY-MM" of the month before the current one (Israel time). */
export function lastMonth(now = Date.now()) {
  const [y, m] = israelToday(now).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** The month's bounds in ms, and the month before. Null for a bad or future month. */
export function monthRange(month, now = Date.now()) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  if (m < 0 || m > 11) return null;
  const from = midnight(y, m, 1);
  if (from > now) return null;
  const end = midnight(y, m + 1, 1);
  return {
    month: `${y}-${pad(m + 1)}`,
    label: `${HEBREW_MONTHS[m]} ${y}`,
    from,
    to: end,
    partial: end > now,
    prevFrom: midnight(y, m - 1, 1),
    prevTo: from,
  };
}

/** The last 12 months, newest first, for the picker. */
export function recentMonths(now = Date.now(), count = 12) {
  const [y, m] = israelToday(now).split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    return { key, label: `${HEBREW_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });
}

/** Everything the report shows. */
export function buildReport(store, business, range, now = Date.now()) {
  const { from, to, prevFrom, prevTo } = range;
  const id = business.id;
  const until = Math.min(to, now);
  const google = store.googleStats(id, { from, to: until });
  const googlePrev = store.googleStats(id, { from: prevFrom, to: prevTo });
  const surveys = store.stats(id, { from, to: until });
  const surveysPrev = store.periodSummary(id, { from: prevFrom, to: prevTo });
  const topics = store.topicCounts(id, { from, to: until });
  const quotes = store.highlights(id, { from, to: until });

  // Reviews and ratings per week of the month.
  const weeks = [];
  for (let start = from; start < to; start += 7 * 864e5) {
    const end = Math.min(start + 7 * 864e5, to);
    let googleN = 0;
    let surveyN = 0;
    for (const [d, v] of google.daily) {
      const t = Date.parse(`${d}T12:00:00Z`);
      if (t >= start && t < end) googleN += v.n;
    }
    for (const v of surveys.daily) {
      const t = Date.parse(`${v.date}T12:00:00Z`);
      if (t >= start && t < end) surveyN += v.responses;
    }
    weeks.push({ from: start, google: googleN, surveys: surveyN });
  }

  const vis = store.aiVisibility(id).runs.filter((r) => Date.parse(`${r.run_at.replace(' ', 'T')}Z`) < to).at(-1) || null;
  const competitors = comparison(store, id, until);
  // A network: one table with every branch.
  const branches = branchesOf(store, id).length >= 2 ? branchRows(store, id, { from, to: until }, now) : [];

  return {
    google,
    googlePrev: { count: googlePrev.count, avg: googlePrev.avgPeriod },
    surveys,
    surveysPrev,
    topics: topics.slice(0, 6),
    quotes,
    weeks,
    visibility: vis && vis.answered ? { mentioned: Math.round((vis.mentioned / vis.answered) * 100), cited: Math.round((vis.cited / vis.answered) * 100), answered: vis.answered } : null,
    competitors,
    branches,
    empty: google.count === 0 && surveys.responses === 0 && google.total === 0,
  };
}

/** The facts handed to the AI for the "bottom line" (numbers and short quotes). */
export function reportFacts(business, range, r) {
  const lines = [
    `עסק: ${business.name}. חודש: ${range.label}.`,
    `ביקורות חדשות בגוגל: ${r.google.count} (בחודש הקודם ${r.googlePrev.count}), ממוצע החודש ${r.google.avgPeriod ? r.google.avgPeriod.toFixed(1) : '—'}. דירוג כולל בגוגל: ${r.google.avg ? r.google.avg.toFixed(1) : '—'} מתוך ${r.google.total} ביקורות.`,
    `דירוגים בסקר: ${r.surveys.responses} (בחודש הקודם ${r.surveysPrev.responses}), ממוצע ${r.surveys.avgRating ? r.surveys.avgRating.toFixed(1) : '—'}, לא מרוצים: ${r.surveys.negative}, טופלו בממוצע תוך ${r.surveys.avgResolveHours != null ? Math.round(r.surveys.avgResolveHours) + ' שעות' : '—'}.`,
    r.topics.length ? `נושאים: ${r.topics.map((t) => `${t.topic} (${t.positive} חיובי, ${t.negative} שלילי)`).join(', ')}.` : '',
    r.quotes.good.length ? `ציטוטים חיוביים: ${r.quotes.good.map((q) => `"${String(q.text).slice(0, 200)}"`).join(' | ')}` : '',
    r.quotes.bad.length ? `ציטוטים שליליים: ${r.quotes.bad.map((q) => `"${String(q.text).slice(0, 200)}"`).join(' | ')}` : '',
    r.competitors.position ? `מקום בדירוג מול המתחרים: ${r.competitors.position.rank} מתוך ${r.competitors.position.of}.` : '',
    r.visibility ? `הוזכר ב-${r.visibility.mentioned}% מתשובות ה-AI שנבדקו.` : '',
    r.branches?.length
      ? `סניפים: ${r.branches.map((b) => `${b.title}: דירוג ${b.rating ? b.rating.toFixed(1) : '—'}, ${b.newReviews} ביקורות חדשות, ${b.unanswered} ממתינות לתשובה${b.calls != null ? `, ${b.calls} שיחות` : ''}`).join('; ')}.`
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}
