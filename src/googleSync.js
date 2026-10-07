import { GoogleError } from './google.js';

/**
 * Keeps each connected business in step with Google: refreshes access
 * tokens, pulls new reviews of the chosen locations and raises alerts.
 */
export function createGoogleSync({ store, google, notifier }) {
  async function tokenFor(businessId) {
    const conn = store.googleConnection(businessId);
    if (!conn) throw new GoogleError('העסק לא מחובר לגוגל');
    if (conn.access_token && conn.expires_at > Date.now() + 60e3) return google.open(conn.access_token);
    const t = await google.refresh(google.open(conn.refresh_token));
    store.updateGoogleToken(businessId, google.seal(t.accessToken), t.expiresAt);
    return t.accessToken;
  }

  async function refreshLocations(businessId) {
    const token = await tokenFor(businessId);
    const locations = await google.listLocations(token);
    store.upsertGoogleLocations(businessId, locations);
    return locations.length;
  }

  /** Pulls the latest reviews; alerts only for reviews that appear after the first sync. */
  async function syncBusiness(business) {
    let added = 0;
    try {
      const token = await tokenFor(business.id);
      for (const loc of store.googleLocations(business.id).filter((l) => l.source === 'gbp' && l.enabled)) {
        const firstSync = !loc.synced_at;
        const page = await google.listReviews(token, loc.name);
        store.googleLocationStats(loc.id, page.averageRating, page.totalReviewCount);
        for (const r of page.reviews) {
          if (!store.upsertGoogleReview(loc.id, r)) continue;
          added++;
          const saved = store.googleReviews(business.id, { locationId: loc.id, limit: 500 }).find((x) => x.name === r.name);
          if (!saved) continue;
          store.markGoogleAlerted(saved.id);
          if (!firstSync) {
            await notifier?.googleReview({ business, review: saved }).catch((err) => console.warn('[google] alert failed:', err.message));
          }
        }
      }
      store.googleSyncResult(business.id, null);
    } catch (err) {
      store.googleSyncResult(business.id, err.message);
      throw err;
    }
    return added;
  }

  /** Publishes one post to each chosen location; one location failing doesn't stop the rest. */
  async function publishPost(businessId, locations, body) {
    const token = await tokenFor(businessId);
    const results = [];
    for (const loc of locations) {
      try {
        const p = await google.createPost(token, loc.name, body);
        results.push({ location: loc.title, ok: true, state: p.state || '', url: p.searchUrl || '' });
      } catch (err) {
        results.push({ location: loc.title, ok: false, error: err.message, status: err.status || 0 });
      }
    }
    return results;
  }

  async function reply(businessId, review, text) {
    const token = await tokenFor(businessId);
    await google.reply(token, review.name, text);
    store.setGoogleReply(review.id, text);
  }

  /** Background job: every connected business, at most every 30 minutes. */
  async function syncAll({ minMinutes = 30 } = {}) {
    let total = 0;
    for (const conn of store.googleConnections()) {
      if (conn.last_sync_at && Date.parse(`${conn.last_sync_at.replace(' ', 'T')}Z`) > Date.now() - minMinutes * 60e3) continue;
      const business = store.businessById(conn.business_id);
      if (!business) continue;
      try {
        total += await syncBusiness(business);
      } catch (err) {
        console.warn(`[google] sync failed for business ${business.id}: ${err.message}`);
      }
    }
    return total;
  }

  /**
   * Pulls the profile's numbers: the first time 18 months back, then the last
   * three weeks again (Google fills in the latest days late). Search terms
   * for the last three full months, and the current one.
   */
  async function syncMetrics(business, { today = new Date() } = {}) {
    const token = await tokenFor(business.id);
    const day = (d) => d.toISOString().slice(0, 10);
    const back = (n) => new Date(today.getTime() - n * 864e5);
    let ok = 0;
    for (const loc of store.googleLocations(business.id).filter((l) => l.source === 'gbp' && l.enabled)) {
      try {
        const rows = await google.dailyMetrics(token, loc.name, { from: day(back(loc.metrics_at ? 21 : 540)), to: day(back(1)) });
        store.saveProfileMetrics(loc.id, rows);
        for (let i = 0; i <= 3; i++) {
          const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
          const month = d.toISOString().slice(0, 7);
          try {
            store.saveProfileKeywords(loc.id, month, await google.searchKeywords(token, loc.name, month));
          } catch (err) {
            // A month with no data yet is fine; the daily numbers still count.
            if (err.status !== 400 && err.status !== 404) throw err;
          }
        }
        store.setMetricsResult(loc.id, null);
        ok++;
      } catch (err) {
        store.setMetricsResult(loc.id, err.message);
        console.warn(`[google] metrics failed for location ${loc.id}: ${err.message}`);
      }
    }
    return ok;
  }

  /** Background job: once a day per connected business (a failed pull is retried after a few hours). */
  const lastTry = new Map();
  async function syncAllMetrics() {
    let n = 0;
    for (const conn of store.googleConnections()) {
      const business = store.businessById(conn.business_id);
      if (!business || business.billing === 'paused') continue;
      const locs = store.googleLocations(business.id).filter((l) => l.source === 'gbp' && l.enabled);
      const fresh = locs.length && locs.every((l) => l.metrics_at && Date.parse(`${l.metrics_at.replace(' ', 'T')}Z`) > Date.now() - 20 * 3600e3);
      if (!locs.length || fresh || (lastTry.get(business.id) || 0) > Date.now() - 4 * 3600e3) continue;
      lastTry.set(business.id, Date.now());
      try {
        n += await syncMetrics(business);
      } catch (err) {
        console.warn(`[google] metrics failed for business ${business.id}: ${err.message}`);
      }
    }
    return n;
  }

  return { syncMetrics, syncAllMetrics, tokenFor, refreshLocations, syncBusiness, reply, publishPost, syncAll };
}
