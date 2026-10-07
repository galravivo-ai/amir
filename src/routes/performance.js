import express from 'express';
import * as V from '../views/performance.js';

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const shift = (iso, n) => day(Date.parse(`${iso}T00:00:00Z`) + n * 864e5);
const monthLabel = (m) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The range ends on the last day Google has filled in (it lags a few days). */
export function performanceRange(store, businessId, days) {
  const to = store.profileMetricsLastDate(businessId) || day(Date.now() - 864e5);
  const from = shift(to, -(days - 1));
  return { from, to, prevFrom: shift(from, -days), prevTo: shift(from, -1) };
}

/** Views, calls, directions and clicks of the business's Google profile. */
export function performanceRoutes(ctx, { sync }) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const running = new Set();

  router.get('/performance', (req, res) => {
    const b = req.business;
    const days = [7, 30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const locations = store.googleLocations(b.id).filter((l) => l.source === 'gbp' && l.enabled);
    const locationId = locations.find((l) => l.id === Number(req.query.loc))?.id ?? null;
    const r = performanceRange(store, b.id, days);
    // Search terms come by month: the full months inside the range (at least the last one).
    const months = [];
    for (let m = r.to.slice(0, 7); m >= r.from.slice(0, 7) && months.length < 12; m = shift(`${m}-01`, -1).slice(0, 7)) months.push(m);
    const kwMonths = months.length > 1 ? months.slice(1) : months;
    render(
      req,
      res,
      'ביצועי הפרופיל',
      V.performanceView({
        connected: Boolean(store.googleConnection(b.id)) && locations.length > 0,
        locations,
        locationId,
        days,
        from: r.from,
        to: r.to,
        totals: store.profileMetricTotals(b.id, r.from, r.to, locationId),
        prev: store.profileMetricTotals(b.id, r.prevFrom, r.prevTo, locationId),
        daily: store.profileMetricDaily(b.id, r.from, r.to, locationId),
        keywords: store.profileKeywords(b.id, kwMonths, locationId),
        keywordMonths: kwMonths.length > 1 ? `${monthLabel(kwMonths[kwMonths.length - 1])} עד ${monthLabel(kwMonths[0])}` : `ב${monthLabel(kwMonths[0])}`,
        lastSync: locations.map((l) => l.metrics_at).filter(Boolean).sort().pop() || null,
        errors: locations.map((l) => l.metrics_error).filter(Boolean),
        csrf: req.user.csrf,
        canRefresh: Boolean(sync) && req.can('manager'),
        refreshing: running.has(b.id),
        notice: req.query.started ? 'העדכון התחיל. הנתונים יופיעו כאן תוך דקה.' : '',
      }),
    );
  });

  router.post('/performance/refresh', requireRole('manager'), (req, res) => {
    const id = req.business.id;
    if (sync && !running.has(id)) {
      running.add(id);
      sync
        .syncMetrics(store.businessById(id))
        .catch((err) => console.warn('[google] metrics refresh failed:', err.message))
        .finally(() => running.delete(id));
    }
    res.redirect(303, '/admin/performance?started=1');
  });

  return router;
}
