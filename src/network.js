// A network: a business that follows two or more Google profiles (branches).
// Each branch is billed at the plan's price, and the account gets the tools
// to run them together: a comparison of the branches, a page per branch,
// members limited to one branch, and shared reply templates.

const VIEW_METRICS = ['BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'];
const ilDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));

/** The branches of a business: its followed Google profiles. */
export const branchesOf = (store, businessId) => store.googleLocations(businessId).filter((l) => l.enabled);

/** Network tools open from the second profile. */
export const isNetwork = (store, businessId) => branchesOf(store, businessId).length >= 2;

/**
 * One row per branch for a period: rating, new reviews (and the period before),
 * replies, the profile's own numbers from Google, health score and map rank.
 */
export function branchRows(store, businessId, { from, to = null }, now = Date.now()) {
  const end = to ?? now;
  const span = end - from;
  const iso = (ms) => new Date(ms).toISOString();
  const q = (sql) => store.db.prepare(sql);
  const reviews = q(`SELECT COUNT(*) AS n, AVG(rating) AS avg, SUM(CASE WHEN reply != '' THEN 1 ELSE 0 END) AS replied,
                       SUM(CASE WHEN rating <= 3 THEN 1 ELSE 0 END) AS low
                     FROM google_reviews WHERE location_id = ? AND create_time >= ? AND create_time < ?`);
  const unanswered = q("SELECT COUNT(*) AS n FROM google_reviews WHERE location_id = ? AND reply = ''");
  const metrics = q('SELECT metric, SUM(value) AS n FROM profile_metrics WHERE location_id = ? AND date >= ? AND date <= ? GROUP BY metric');
  const health = q('SELECT score, run_at FROM profile_audits WHERE location_id = ? AND error IS NULL ORDER BY id DESC LIMIT 1');
  const rank = q(`SELECT AVG(c.avg_rank) AS avg, COUNT(*) AS n FROM rank_keywords k
                  JOIN rank_checks c ON c.id = (SELECT MAX(id) FROM rank_checks WHERE keyword_id = k.id AND error IS NULL)
                  WHERE k.location_id = ?`);
  return branchesOf(store, businessId).map((l) => {
    const r = reviews.get(l.id, iso(from), iso(end));
    const prev = reviews.get(l.id, iso(from - span), iso(from));
    const m = Object.fromEntries(metrics.all(l.id, ilDay(from), ilDay(end - 1)).map((x) => [x.metric, x.n]));
    const hasMetrics = Object.keys(m).length > 0;
    const hs = health.get(l.id);
    const rk = rank.get(l.id);
    return {
      id: l.id,
      title: l.title || 'סניף',
      address: l.address,
      source: l.source,
      rating: l.avg_rating || null,
      total: l.total_reviews || 0,
      newReviews: r.n,
      newAvg: r.avg,
      prevReviews: prev.n,
      low: r.low || 0,
      replyRate: r.n ? Math.round(((r.replied || 0) / r.n) * 100) : null,
      unanswered: unanswered.get(l.id).n,
      views: hasMetrics ? VIEW_METRICS.reduce((s, k) => s + (m[k] || 0), 0) : null,
      calls: hasMetrics ? m.CALL_CLICKS || 0 : null,
      directions: hasMetrics ? m.BUSINESS_DIRECTION_REQUESTS || 0 : null,
      website: hasMetrics ? m.WEBSITE_CLICKS || 0 : null,
      health: hs ? hs.score : null,
      rank: rk.n && rk.avg != null ? Math.round(rk.avg * 10) / 10 : null,
    };
  });
}

/** Totals across the branches, and who leads and who needs attention. */
export function networkSummary(rows) {
  const sum = (k) => (rows.some((r) => r[k] != null) ? rows.reduce((s, r) => s + (r[k] || 0), 0) : null);
  const rated = rows.filter((r) => r.rating && r.total);
  const totalReviews = rated.reduce((s, r) => s + r.total, 0);
  const newN = rows.reduce((s, r) => s + r.newReviews, 0);
  const replied = rows.reduce((s, r) => s + (r.replyRate != null ? (r.replyRate / 100) * r.newReviews : 0), 0);
  const best = (k, dir = 1) => {
    const has = rows.filter((r) => r[k] != null);
    return has.length >= 2 ? has.reduce((a, b) => (dir * (b[k] - a[k]) > 0 ? b : a)) : null;
  };
  // Attention: branches that fall behind, worst first. Replies count when
  // several wait and the branch answers less than 70% of its new reviews.
  const attention = rows
    .map((r) => {
      const why = [
        r.unanswered >= 3 && (r.replyRate == null || r.replyRate < 70) ? `${r.unanswered} ביקורות מחכות לתשובה` : '',
        r.newAvg != null && r.newAvg < 4 && r.newReviews >= 2 ? `ממוצע ${r.newAvg.toFixed(1)}★ בתקופה` : '',
        r.health != null && r.health < 60 ? `ציון בריאות ${r.health}` : '',
      ].filter(Boolean);
      return { r, why: why.join(' · '), weight: why.length * 1000 + r.unanswered };
    })
    .filter((x) => x.why)
    .sort((a, b) => b.weight - a.weight);
  return {
    branches: rows.length,
    rating: totalReviews ? rated.reduce((s, r) => s + r.rating * r.total, 0) / totalReviews : null,
    total: totalReviews,
    newReviews: newN,
    prevReviews: rows.reduce((s, r) => s + r.prevReviews, 0),
    replyRate: newN ? Math.round((replied / newN) * 100) : null,
    unanswered: rows.reduce((s, r) => s + r.unanswered, 0),
    views: sum('views'),
    calls: sum('calls'),
    directions: sum('directions'),
    leaders: {
      rating: best('rating'),
      newReviews: best('newReviews'),
      calls: best('calls'),
      rank: best('rank', -1),
    },
    attention,
  };
}

/** Fills a reply template for one review: {שם} is the reviewer's first name, {סניף} the branch. */
export function fillTemplate(body, review) {
  const first = String(review.reviewer || '').trim().split(/\s+/)[0] || '';
  return String(body)
    .replaceAll('{שם}', first)
    .replaceAll('{סניף}', review.location_title || '')
    .replace(/\s+([,.!])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** The templates that suit a review's rating ('' = every rating; '45', '3', '12'). */
export const templatesFor = (templates, rating) => templates.filter((t) => !t.stars || t.stars.includes(String(rating)));
