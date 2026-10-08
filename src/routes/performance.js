import express from 'express';

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const shift = (iso, n) => day(Date.parse(`${iso}T00:00:00Z`) + n * 864e5);
const monthLabel = (m) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * What the public profile already shows, without the owner's Google login:
 * rating and reviews (followed by link or by connection), replies, profile
 * health and map rank.
 */
export function publicProfile(store, business, { from, to, prevFrom }) {
  const locations = store.googleLocations(business.id).filter((l) => l.enabled);
  if (!locations.length) return null;
  const end = `${shift(to, 1)}T00:00:00Z`;
  const stats = store.googleStats(business.id, { from: Date.parse(`${from}T00:00:00Z`), to: Date.parse(end) });
  // Rating and total at the start of the range, from the daily snapshots.
  let total0 = 0, weighted0 = 0, known = 0;
  for (const l of locations) {
    const snap = store.snapshotOnOrBefore('location', l.id, from);
    if (snap?.total) {
      total0 += snap.total;
      weighted0 += (snap.rating || 0) * snap.total;
      known++;
    }
  }
  const replies = store.replyRate(business.id, `${from}T00:00:00Z`, end);
  const prevReplies = store.replyRate(business.id, `${prevFrom}T00:00:00Z`, `${from}T00:00:00Z`);
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1)).toISOString().slice(0, 7);
  const audits = store.latestAudits(business.id).filter((a) => !a.error);
  const ranks = store.rankKeywords(business.id).map((k) => store.rankChecks(k.id, 2).filter((c) => !c.error));
  const rankNow = avg(ranks.map((c) => c[0]?.avg_rank).filter((v) => v != null));
  const rankBefore = avg(ranks.map((c) => c[1]?.avg_rank).filter((v) => v != null));
  return {
    rating: stats.avg,
    total: stats.total,
    ratingBefore: known === locations.length && total0 ? weighted0 / total0 : null,
    totalBefore: known === locations.length && total0 ? total0 : null,
    newReviews: stats.count,
    prevNew: stats.prevCount,
    avgPeriod: stats.avgPeriod,
    distribution: stats.distribution,
    unanswered: stats.unanswered,
    replyRate: replies.n ? (replies.replied / replies.n) * 100 : null,
    prevReplyRate: prevReplies.n ? (prevReplies.replied / prevReplies.n) * 100 : null,
    months: store.reviewMonths(business.id, since),
    since,
    health: audits.length ? Math.round(avg(audits.map((a) => a.score))) : null,
    healthBefore: audits.some((a) => a.prev_score != null) ? Math.round(avg(audits.filter((a) => a.prev_score != null).map((a) => a.prev_score))) : null,
    rank: rankNow,
    rankBefore,
    rankKeywords: ranks.filter((c) => c.length).length,
  };
}

const ilDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));

/**
 * Everything the dashboard's Google section shows for a period: the private
 * numbers (which end on the last day Google filled in) and the public ones.
 */
export function googleOverview(ctx, req, period, { refreshing = false } = {}) {
  const { store } = ctx;
  const b = req.business;
  const locations = store.googleLocations(b.id).filter((l) => l.source === 'gbp' && l.enabled);
  const last = store.profileMetricsLastDate(b.id);
  const from = ilDay(period.from);
  const wanted = ilDay(period.to ? period.to - 1 : Date.now());
  let to = last && last < wanted ? last : wanted;
  if (to < from) to = from;
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;
  const r = { from, to, prevFrom: shift(from, -days), prevTo: shift(from, -1) };
  // Search terms come by month: the full months inside the range (at least the last one).
  const months = [];
  for (let m = to.slice(0, 7); m >= from.slice(0, 7) && months.length < 12; m = shift(`${m}-01`, -1).slice(0, 7)) months.push(m);
  const kwMonths = months.length > 1 ? months.slice(1) : months;
  return {
    connected: Boolean(store.googleConnection(b.id)) && locations.length > 0,
    metrics: {
      from: r.from,
      to: r.to,
      totals: store.profileMetricTotals(b.id, r.from, r.to),
      prev: store.profileMetricTotals(b.id, r.prevFrom, r.prevTo),
      daily: store.profileMetricDaily(b.id, r.from, r.to),
      keywords: store.profileKeywords(b.id, kwMonths),
      keywordMonths: kwMonths.length > 1 ? `${monthLabel(kwMonths[kwMonths.length - 1])} עד ${monthLabel(kwMonths[0])}` : `ב${monthLabel(kwMonths[0])}`,
    },
    pub: publicProfile(store, b, r),
    lastSync: locations.map((l) => l.metrics_at).filter(Boolean).sort().pop() || null,
    errors: locations.map((l) => l.metrics_error).filter(Boolean),
    googleReady: Boolean(ctx.google),
    canConnect: req.can('manager'),
    canRefresh: Boolean(ctx.googleSync) && req.can('manager'),
    refreshing,
    csrf: req.user.csrf,
  };
}

/** The profile's numbers live on the main dashboard; this keeps the old address and the refresh. */
export function performanceRoutes(ctx, { sync }) {
  const { store, requireRole } = ctx;
  const router = express.Router();

  router.get('/performance', (req, res) => res.redirect(301, '/admin#google'));

  router.post('/performance/refresh', requireRole('manager'), (req, res) => {
    const id = req.business.id;
    if (sync && !ctx.metricsRunning.has(id)) {
      ctx.metricsRunning.add(id);
      sync
        .syncMetrics(store.businessById(id))
        .catch((err) => console.warn('[google] metrics refresh failed:', err.message))
        .finally(() => ctx.metricsRunning.delete(id));
    }
    res.redirect(303, '/admin?refreshed=1#google');
  });

  return router;
}
