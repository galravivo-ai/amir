import { activityOf, healthChecks } from './health.js';
import { accessOf, planOf } from './plans.js';

/**
 * Checks each followed Google place: reads its public profile through SerpApi
 * (one or two searches), scores it, and asks the AI for advice. Weekly, or on
 * demand from the profile page.
 */
export function createHealth({ store, serp, ai = null, everyDays = 7 }) {
  function facts(business, loc, profile, result) {
    const failed = result.items.filter((i) => i.state === 'fail' || i.state === 'partial').map((i) => `${i.label}${i.value ? ` (${i.value})` : ''}`);
    return [
      `שם: ${profile.title || loc.title || business.name}`,
      `כתובת: ${profile.address || loc.address || 'לא ידוע'}`,
      `קטגוריות: ${profile.types.join(', ') || 'לא ידוע'}`,
      `דירוג: ${profile.rating || '—'} מתוך ${profile.reviews ?? '—'} ביקורות`,
      `תיאור נוכחי: ${profile.description || '(אין)'}`,
      `ציון תקינות: ${result.score}/100`,
      `מה חסר או חלקי: ${failed.join('; ') || 'כלום'}`,
    ].join('\n');
  }

  async function checkLocation(business, loc) {
    try {
      const profile = await serp.placeDetails({ placeId: loc.place_id, dataId: loc.data_id, title: loc.title, address: loc.address });
      if (!profile) throw new Error('לא מצאנו את הפרופיל בגוגל. בדקו שהעסק מופיע בגוגל מפות.');
      const result = healthChecks(profile, activityOf(store, business.id, loc));
      let tips = '';
      if (ai?.profileTips && planOf(business).ai) {
        tips = await ai.profileTips(facts(business, loc, profile, result)).catch((err) => (console.warn('[health] tips failed:', err.message), ''));
      }
      store.saveAudit(business.id, loc.id, { score: result.score, profile, items: result.items, tips });
      return result;
    } catch (err) {
      store.saveAudit(business.id, loc.id, { error: String(err.message).slice(0, 200) });
      return null;
    }
  }

  async function checkBusiness(business) {
    const locs = store.googleLocations(business.id).filter((l) => l.enabled);
    for (const loc of locs) await checkLocation(business, loc);
    return locs.length;
  }

  async function runDue() {
    let done = 0;
    for (const loc of store.auditsDue(everyDays)) {
      const business = store.businessById(loc.business_id);
      if (!business || accessOf(business).state === 'paused') continue;
      if (await checkLocation(business, loc)) done++;
    }
    return done;
  }

  return { checkLocation, checkBusiness, runDue };
}
