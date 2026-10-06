// Subscription plans and their limits. Online payment is not wired up yet: a
// business asks for a plan from /admin/plan and a system admin activates it
// from /superadmin. `Infinity` = unlimited. Prices are monthly, in ILS,
// including VAT. Plans differ in the number of branches (campaigns), and from
// "pro" up AI visibility also covers ChatGPT, Gemini and Perplexity (aiPlus).
const ALL_FEATURES = {
  teamMembers: Infinity,
  monthlyResponses: Infinity,
  ai: true,
  widget: true,
  emailInvites: true,
  api: true,
};

export const PLANS = {
  basic: {
    label: 'בסיסי',
    price: 99,
    tagline: 'לעסק עם נקודה אחת',
    campaigns: 1,
    ...ALL_FEATURES,
    aiPlus: false,
    waMonthly: 100,
    competitors: 3,
    rankKeywords: 1,
    limits: { ai_draft: 50, insights: 4, health_run: 2, visibility_run: 2, rank_run: 2 },
  },
  pro: {
    label: 'מקצועי',
    price: 159,
    tagline: 'לעסק שגדל',
    campaigns: 3,
    ...ALL_FEATURES,
    aiPlus: true,
    waMonthly: 300,
    competitors: 5,
    rankKeywords: 3,
    limits: { ai_draft: 200, insights: 10, health_run: 5, visibility_run: 4, rank_run: 4 },
  },
  business: {
    label: 'עסקי',
    price: 399,
    tagline: 'לרשתות וזכיינים',
    campaigns: 10,
    ...ALL_FEATURES,
    aiPlus: true,
    waMonthly: 1000,
    competitors: 10,
    rankKeywords: 6,
    limits: { ai_draft: 500, insights: 30, health_run: 10, visibility_run: 10, rank_run: 10 },
  },
  // Not on the price list: chains above 10 branches get a personal quote and
  // a system admin assigns this plan.
  enterprise: {
    label: 'רשת',
    price: null,
    hidden: true,
    tagline: 'יותר מ-10 סניפים, בהצעת מחיר',
    campaigns: Infinity,
    ...ALL_FEATURES,
    aiPlus: true,
    waMonthly: 3000,
    competitors: 20,
    rankKeywords: 15,
    limits: { ai_draft: 2000, insights: 100, health_run: 30, visibility_run: 30, rank_run: 30 },
  },
};

/**
 * Wider AI visibility: ChatGPT, Gemini and Perplexity too, with more questions.
 * Included from "pro" up; a system admin may also turn it on for one business.
 */
export const AI_PLUS = {
  label: 'נראות ב-AI מורחבת',
  tagline: 'בודקים אם ממליצים עליכם גם ב-ChatGPT, ב-Gemini וב-Perplexity',
  features: ['בדיקה שבועית ב-ChatGPT, Gemini ו-Perplexity, בנוסף לגוגל ול-Claude', 'עד 10 שאלות במקום 5', 'השוואה בין כל המנועים לאורך זמן'],
};
export const hasAiPlus = (business) => Boolean(planOf(business).aiPlus || business?.ai_plus);

/** Plans shown on the price list. */
export const PUBLIC_PLANS = Object.fromEntries(Object.entries(PLANS).filter(([, p]) => !p.hidden));

/** New businesses try this plan for TRIAL_DAYS, then pick a plan or pause. */
export const TRIAL_PLAN = 'pro';
export const TRIAL_DAYS = 7;
/** Yearly billing: pay for this many months, get twelve. */
export const ANNUAL_MONTHS = 10;

export const CYCLES = { monthly: 'חודשי', annual: 'שנתי' };

export function planOf(business) {
  return PLANS[business?.plan] || PLANS.basic;
}

export const annualPrice = (p) => (p.price == null ? null : p.price * ANNUAL_MONTHS);
export const ils = (n) => `₪${Number(n).toLocaleString('he-IL')}`;

/**
 * Where a business stands: 'active' (paid or managed), 'trial' (with days
 * left) or 'paused' (trial over or stopped by an admin; surveys are off).
 */
export function accessOf(business, now = Date.now()) {
  if (!business || business.billing === 'active' || !business.billing) return { state: 'active' };
  if (business.billing === 'paused') return { state: 'paused', reason: 'stopped' };
  const ends = business.trial_ends_at ? Date.parse(`${business.trial_ends_at.replace(' ', 'T')}Z`) : 0;
  const msLeft = ends - now;
  if (msLeft <= 0) return { state: 'paused', reason: 'trial' };
  return { state: 'trial', daysLeft: Math.ceil(msLeft / 864e5), endsAt: business.trial_ends_at };
}

export const FEATURE_LABELS = {
  emailInvites: 'בקשות ותזכורות ללקוחות במייל',
  ai: 'עוזר AI: תשובות ללקוחות, סיכומים ותיוג',
  widget: 'ווידג\'ט המלצות לאתר',
  api: 'שליחה אוטומטית מהקופה ומהמערכות שלכם (API)',
};

export function limitLabel(n) {
  return n === Infinity ? 'ללא הגבלה' : String(n);
}
