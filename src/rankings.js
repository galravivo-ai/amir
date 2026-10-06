import { withBusiness } from './meter.js';
import { accessOf } from './plans.js';

// Map rank tracking: for a search like "בית קפה", where does the business show
// in Google Maps when people search from around it? A 3×3 grid of points, the
// place in the middle, one SerpApi search per point.

export const RADII = { 500: '500 מטר', 1000: 'קילומטר', 2000: '2 ק"מ', 5000: '5 ק"מ' };
const zoomFor = (radius) => (radius <= 500 ? 16 : radius <= 1000 ? 15 : radius <= 2000 ? 14 : 13);
export const NOT_FOUND = 21;

/** Nine points: north-west to south-east, the center fifth. */
export function gridPoints(lat, lng, radius) {
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const out = [];
  for (const row of [1, 0, -1]) for (const col of [-1, 0, 1]) out.push({ lat: +(lat + row * dLat).toFixed(6), lng: +(lng + col * dLng).toFixed(6) });
  return out;
}

export function createRankings({ store, serp, everyDays = 7 }) {
  /** Where the place is, from its profile (asked once, then kept). */
  async function coordsOf(k) {
    if (k.lat && k.lng) return { lat: k.lat, lng: k.lng };
    const p = await serp.placeDetails({ placeId: k.place_id, dataId: k.data_id, title: k.location_title, address: k.address || '' });
    if (!p?.lat || !p?.lng) throw new Error('לא הצלחנו למצוא את מיקום העסק על המפה.');
    store.setLocationCoords(k.location_id, p.lat, p.lng);
    return { lat: p.lat, lng: p.lng };
  }

  async function checkUnscoped(k) {
    try {
      const center = await coordsOf(k);
      const points = [];
      const seen = new Map();
      for (const pt of gridPoints(center.lat, center.lng, k.radius_m)) {
        const results = await serp.mapResults(k.keyword, { ...pt, zoom: zoomFor(k.radius_m) });
        const mine = results.find((r) => (k.data_id && r.dataId === k.data_id) || (k.place_id && r.placeId === k.place_id));
        points.push({ ...pt, rank: mine ? mine.position : null, top: results.slice(0, 3).map((r) => r.title) });
        // Who shows up most across the grid: the real competition for this search.
        for (const r of results.slice(0, 3)) {
          if ((k.data_id && r.dataId === k.data_id) || (k.place_id && r.placeId === k.place_id)) continue;
          seen.set(r.title, (seen.get(r.title) || 0) + 1);
        }
      }
      const found = points.filter((p) => p.rank != null).length;
      const avgRank = points.reduce((s, p) => s + Math.min(p.rank ?? NOT_FOUND, NOT_FOUND), 0) / points.length;
      const leaders = [...seen].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title, n]) => ({ title, n }));
      store.saveRankCheck(k.id, { avgRank: +avgRank.toFixed(1), found, points, leaders });
      return true;
    } catch (err) {
      store.saveRankCheck(k.id, { error: String(err.message).slice(0, 200) });
      return false;
    }
  }

  async function checkBusiness(businessId) {
    let n = 0;
    for (const k of store.rankKeywords(businessId)) if (await check(k)) n++;
    return n;
  }

  async function runDue() {
    let n = 0;
    for (const k of store.rankKeywordsDue(everyDays)) {
      if (accessOf(store.businessById(k.business_id)).state === 'paused') continue;
      if (await check(k)) n++;
    }
    return n;
  }

  // Searches and AI requests made here are counted against the business.
  const check = (k) => withBusiness(k.business_id, () => checkUnscoped(k));

  return { check, checkBusiness, runDue };
}
