import { accessOf, planOf } from './plans.js';

// Monthly limits on the actions a user starts by hand: AI drafts and checks
// "now". What runs on its own (weekly checks, syncs) isn't counted: its cost
// is set by the plan's quotas. Months follow Israel time.

export const ACTIONS = {
  ai_draft: 'טיוטות AI (תשובות, פוסטים, הצעות)',
  insights: 'הפקת תובנות AI',
  health_run: 'בדיקת בריאות פרופיל ידנית',
  visibility_run: 'בדיקת נראות ב-AI ידנית',
  rank_run: 'בדיקת מיקום במפות ידנית (לכל חיפוש)',
  place_search: 'חיפוש עסק בגוגל מפות (חיבור ומתחרים)',
};

/** During the trial: enough to see every feature work, small enough to keep the costs down. */
export const TRIAL_LIMITS = { ai_draft: 20, insights: 2, health_run: 1, visibility_run: 1, rank_run: 1, place_search: 10 };

export const monthKey = (now = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date(now)).slice(0, 7);

export function limitsOf(business) {
  if (accessOf(business).state === 'trial' && !business.pilot) return TRIAL_LIMITS;
  return planOf(business).limits || TRIAL_LIMITS;
}

/** Per action: { used, limit, left }. */
export function usageOf(store, business, now = Date.now()) {
  const used = store.usageFor(business.id, monthKey(now));
  const limits = limitsOf(business);
  return Object.fromEntries(
    Object.keys(ACTIONS).map((a) => {
      const limit = limits[a] ?? 0;
      return [a, { used: used[a] || 0, limit, left: Math.max(0, limit - (used[a] || 0)) }];
    }),
  );
}

export function createUsage(store) {
  return {
    /** Counts `n` of an action; returns an error message instead when the month's limit is reached. */
    take(business, action, n = 1) {
      const u = usageOf(store, business)[action];
      if (u.left < n) {
        return `הגעתם למגבלה החודשית של ${ACTIONS[action]} (${u.limit} בחודש). היא מתאפסת ב-1 לחודש. אפשר לשדרג בעמוד "התוכנית שלי".`;
      }
      store.addUsage(business.id, monthKey(), action, n);
      return null;
    },
    /** Gives back what was counted for an action that failed. */
    give(business, action, n = 1) {
      store.addUsage(business.id, monthKey(), action, -n);
    },
    left: (business, action) => usageOf(store, business)[action].left,
  };
}
