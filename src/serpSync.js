import { withBusiness } from './meter.js';
import { accessOf } from './plans.js';

/**
 * How many pages to read on a place's first sync (8 + 5 × 20 reviews), enough
 * history for the dashboard's periods; it stops early past a year back.
 */
const FIRST_SYNC_PAGES = 6;
const HISTORY_MS = 365 * 864e5;
/** Later syncs stop as soon as they reach a review we already have. */
const LATER_SYNC_PAGES = 3;

/**
 * Keeps places followed by link (through SerpApi) in step with Google:
 * pulls new reviews, updates the rating and raises alerts. Each page read is
 * one SerpApi search, so places are checked every `intervalHours`.
 */
export function createSerpSync({ store, serp, notifier, intervalHours = Number(process.env.SERPAPI_INTERVAL_HOURS) || 6 }) {
  async function syncLocationUnscoped(business, loc) {
    const firstSync = !loc.synced_at;
    let added = 0;
    try {
      let token = '';
      let place = null;
      for (let page = 0; page < (firstSync ? FIRST_SYNC_PAGES : LATER_SYNC_PAGES); page++) {
        const r = await serp.reviews({ dataId: loc.data_id, placeId: loc.place_id }, { nextPageToken: token });
        place ||= r.place;
        if (page === 0 && !r.reviews.length && r.place.total > 0) {
          // A rating with no reviews means SerpApi's answer didn't parse; keep it visible.
          throw new Error(`התקבל דירוג (${r.place.total} ביקורות) אבל בלי רשימת ביקורות. שדות: ${(r.keys || []).join(', ')}`);
        }
        let reachedKnown = false;
        for (const found of r.reviews) {
          // Several businesses may follow the same place: keep each one's copy apart.
          const review = { ...found, name: `${found.name}@${loc.id}` };
          if (!store.upsertGoogleReview(loc.id, review)) {
            reachedKnown = true;
            continue;
          }
          added++;
          if (firstSync) continue;
          const saved = store.googleReviewByName(review.name);
          if (!saved) continue;
          store.markGoogleAlerted(saved.id);
          await notifier?.googleReview({ business, review: saved }).catch((err) => console.warn('[serp] alert failed:', err.message));
        }
        token = r.next;
        const oldest = Date.parse(r.reviews.at(-1)?.createTime || '');
        if (!token || (!firstSync && reachedKnown) || (firstSync && oldest < Date.now() - HISTORY_MS)) break;
      }
      if (place) store.updateSerpPlace(loc.id, place);
      store.googleLocationStats(loc.id, place?.rating || loc.avg_rating || null, place?.total || loc.total_reviews || null);
      store.setLocationSyncError(loc.id, null);
    } catch (err) {
      store.setLocationSyncError(loc.id, err.message);
      throw err;
    }
    return added;
  }

  async function syncBusiness(business) {
    let added = 0;
    for (const loc of store.googleLocations(business.id).filter((l) => l.source === 'serp' && l.enabled)) {
      added += await syncLocation(business, loc);
    }
    return added;
  }

  /** Background job: places not checked in the last `intervalHours`. */
  async function syncAll() {
    let total = 0;
    for (const loc of store.serpLocationsDue(intervalHours)) {
      const business = store.businessById(loc.business_id);
      if (!business || accessOf(business).state === 'paused') continue;
      try {
        total += await syncLocation(business, loc);
      } catch (err) {
        console.warn(`[serp] sync failed for place ${loc.id}: ${err.message}`);
      }
    }
    return total;
  }

  // Searches and AI requests made here are counted against the business.
  const syncLocation = (business, loc) => withBusiness(business.id, () => syncLocationUnscoped(business, loc));

  return { syncLocation, syncBusiness, syncAll, intervalHours };
}
