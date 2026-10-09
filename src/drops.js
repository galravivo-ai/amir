// Alerts when something that matters goes down: the Google rating, the place
// on the map, or how often AI answers recommend the business. Each drop is
// reported once, in one email with everything that dropped.

const DAY = 864e5;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/** What went down since the last comparison: [{ kind, ref, title, detail, href }]. */
export function findDrops(store, business, { now = Date.now() } = {}) {
  const out = [];

  // Rating: today against a week ago, per followed place.
  for (const loc of store.googleLocations(business.id).filter((l) => l.enabled)) {
    const today = store.snapshotOnOrBefore('location', loc.id, isoDay(now));
    const before = store.snapshotOnOrBefore('location', loc.id, isoDay(now - 7 * DAY));
    if (!today?.rating || !before?.rating || before.day === today.day) continue;
    const diff = Math.round((today.rating - before.rating) * 10) / 10;
    if (diff <= -0.1) {
      out.push({
        kind: 'rating',
        ref: `${loc.id}:${today.rating.toFixed(1)}:${today.day.slice(0, 7)}`,
        title: `הדירוג בגוגל ירד ל-${today.rating.toFixed(1)}`,
        detail: `${loc.title}: מ-${before.rating.toFixed(1)} לפני שבוע. כדאי לבדוק את הביקורות האחרונות ולענות עליהן.`,
        href: '/admin/google/reviews',
      });
    }
  }

  // Map rank: the last check against the one before, per search.
  for (const k of store.rankKeywords(business.id)) {
    const [last, prev] = store.rankChecks(k.id, 2).filter((c) => !c.error);
    if (!last || !prev) continue;
    const worse = last.avg_rank != null && prev.avg_rank != null && last.avg_rank - prev.avg_rank >= 1;
    const lost = last.found < prev.found && prev.found - last.found >= 2;
    if (worse || lost) {
      out.push({
        kind: 'rank',
        ref: `${k.id}:${last.id}`,
        title: `ירידה במפות בחיפוש "${k.keyword}"`,
        detail: worse
          ? `המיקום הממוצע ירד מ-${prev.avg_rank.toFixed(1)} ל-${last.avg_rank.toFixed(1)}.`
          : `העסק מופיע עכשיו ב-${last.found} נקודות מתוך 9, לעומת ${prev.found} בבדיקה הקודמת.`,
        href: '/admin/rankings',
      });
    }
  }

  // AI visibility: the last check against the one before.
  const { runs } = store.aiVisibility(business.id);
  const [prev, last] = runs.slice(-2);
  if (prev && last && last.answered >= 3 && prev.answered >= 3) {
    const a = pct(last.mentioned, last.answered);
    const b = pct(prev.mentioned, prev.answered);
    if (b - a >= 10) {
      out.push({
        kind: 'ai',
        ref: last.run_at,
        title: `ציון הנראות ב-AI ירד ל-${a}`,
        detail: `מ-${b} בבדיקה הקודמת. בעמוד הנראות יש תוכנית פעולה ורשימה של מי ממליצים במקומכם.`,
        href: '/admin/ai-visibility',
      });
    }
  }
  return out;
}

/** Daily: one alert per business with every new drop. */
export async function sendDropAlerts({ store, notifier, now = Date.now() }) {
  let sent = 0;
  for (const business of store.dropAlertBusinesses()) {
    const fresh = findDrops(store, business, { now }).filter((d) => store.markDropAlert(business.id, d.kind, d.ref));
    if (!fresh.length) continue;
    await notifier?.dropsAlert?.({ business, drops: fresh }).catch((err) => console.warn('[drops] alert failed:', err.message));
    sent++;
  }
  return sent;
}
