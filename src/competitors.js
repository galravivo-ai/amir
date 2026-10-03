// Competitors: nearby places a business compares itself with, read through
// SerpApi every few days (one search each). Each check keeps a daily
// snapshot, so the page can show how ratings and review counts move.

const DAY = 864e5;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function createCompetitors({ store, serp, intervalHours = Number(process.env.COMPETITOR_INTERVAL_HOURS) || 72, now = () => Date.now() }) {
  /** Reads a competitor's rating, review count and recent reviews. */
  async function check(c) {
    const t = now();
    try {
      const r = await serp.reviews({ dataId: c.data_id, placeId: c.place_id });
      const since = t - 30 * DAY;
      const recent = r.reviews.filter((x) => Date.parse(x.createTime) >= since);
      // A full first page of recent reviews means there are more than we can see.
      const capped = recent.length === r.reviews.length && Boolean(r.next);
      store.updateCompetitor(c.id, {
        title: c.title || r.place.title,
        address: c.address || r.place.address,
        rating: r.place.rating || null,
        total: r.place.total || 0,
        recent30: recent.length,
        recent_capped: capped,
        checked_at: new Date(t).toISOString().slice(0, 19).replace('T', ' '),
        error: null,
      });
      if (r.place.total) store.snapshot('competitor', c.id, { rating: r.place.rating, total: r.place.total }, isoDay(t));
      return true;
    } catch (err) {
      store.updateCompetitor(c.id, { checked_at: new Date(t).toISOString().slice(0, 19).replace('T', ' '), error: String(err.message).slice(0, 200) });
      return false;
    }
  }

  /** Checks competitors that are due, and records today's reading of the business's own places. */
  async function runDue() {
    let checked = 0;
    for (const c of store.competitorsDue(intervalHours)) if (await check(c)) checked++;
    const today = isoDay(now());
    for (const loc of store.db.prepare('SELECT id, avg_rating, total_reviews FROM google_locations WHERE enabled = 1 AND total_reviews > 0').all()) {
      store.snapshot('location', loc.id, { rating: loc.avg_rating, total: loc.total_reviews }, today);
    }
    return checked;
  }

  return { check, runDue, intervalHours };
}

/**
 * The comparison: the business's own places and its competitors, ranked by
 * rating, with new reviews in the last 30 days and the rating change.
 * Competitors' new reviews come from the snapshot a month back when there is
 * one, else from their newest reviews page (shown as "N+" when capped).
 */
export function comparison(store, businessId, now = Date.now()) {
  const monthAgo = isoDay(now - 30 * DAY);
  const sinceIso = new Date(now - 30 * DAY).toISOString();
  const trend = (kind, id, rating, total) => {
    const old = store.snapshotOnOrBefore(kind, id, monthAgo);
    return old ? { ratingChange: rating != null && old.rating != null ? rating - old.rating : null, totalChange: total != null && old.total != null ? total - old.total : null } : { ratingChange: null, totalChange: null };
  };
  const mine = store
    .googleLocations(businessId)
    .filter((l) => l.enabled && l.total_reviews > 0)
    .map((l) => ({
      mine: true,
      id: l.id,
      title: l.title,
      rating: l.avg_rating,
      total: l.total_reviews,
      recent30: store.googleReviewCount(l.id, sinceIso),
      capped: false,
      ...trend('location', l.id, l.avg_rating, l.total_reviews),
    }));
  const theirs = store.competitorsFor(businessId).map((c) => {
    const t = trend('competitor', c.id, c.rating, c.total);
    const fromSnapshots = t.totalChange != null && t.totalChange >= 0;
    return {
      mine: false,
      id: c.id,
      title: c.title || 'מתחרה',
      address: c.address,
      rating: c.rating,
      total: c.total,
      recent30: fromSnapshots ? t.totalChange : c.recent30,
      capped: fromSnapshots ? false : Boolean(c.recent_capped),
      ratingChange: t.ratingChange,
      checkedAt: c.checked_at,
      error: c.error,
      pending: !c.checked_at,
    };
  });
  const rows = [...mine, ...theirs].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.total ?? 0) - (a.total ?? 0));
  rows.forEach((r, i) => (r.rank = r.rating != null ? i + 1 : null));
  const ranked = rows.filter((r) => r.rating != null);
  const best = mine.length ? rows.find((r) => r.mine) : null;
  const mostReviews = theirs.filter((r) => r.recent30 != null).sort((a, b) => b.recent30 - a.recent30)[0] || null;
  return { rows, mine, theirs, position: best ? { rank: best.rank, of: ranked.length } : null, mostReviews };
}
