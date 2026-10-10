// Subscription plans and their limits. `Infinity` = unlimited. Prices are
// monthly, in ILS, including VAT, and per Google profile: a business with
// three profiles pays three times its plan. Two plans on the price list:
// "Google" (everything about the Google Business Profile, AI visibility in
// Google's own answers) and "Google + AI" (also Claude, ChatGPT, Gemini and
// Perplexity, with an action plan after each check).
const ALL_FEATURES = {
  teamMembers: Infinity,
  monthlyResponses: Infinity,
  campaigns: Infinity,
  ai: true,
  widget: true,
  emailInvites: true,
};

export const PLANS = {
  basic: {
    label: 'גוגל',
    price: 99,
    tagline: 'כל מה שצריך לנהל את גוגל מיי ביזנס',
    ...ALL_FEATURES,
    api: false,
    aiPlus: false,
    waMonthly: 100,
    competitors: 5,
    rankKeywords: 2,
    limits: { ai_draft: 50, insights: 4, health_run: 2, visibility_run: 2, rank_run: 2 },
  },
  pro: {
    label: 'גוגל + AI',
    price: 169,
    tagline: 'גוגל מיי ביזנס, וגם ההמלצות של עוזרי ה-AI',
    ...ALL_FEATURES,
    api: false,
    aiPlus: true,
    waMonthly: 300,
    competitors: 10,
    rankKeywords: 4,
    limits: { ai_draft: 200, insights: 10, health_run: 5, visibility_run: 4, rank_run: 4 },
  },
  // Off the price list since the per-profile prices; kept for businesses already on it.
  business: {
    label: 'עסקי',
    price: 399,
    hidden: true,
    tagline: 'המסלול הקודם לרשתות',
    ...ALL_FEATURES,
    api: true,
    aiPlus: true,
    waMonthly: 1000,
    competitors: 10,
    rankKeywords: 6,
    limits: { ai_draft: 500, insights: 30, health_run: 10, visibility_run: 10, rank_run: 10 },
  },
  // Large chains and agencies get a personal quote; a system admin assigns this plan.
  enterprise: {
    label: 'רשת',
    price: null,
    hidden: true,
    tagline: 'רשתות גדולות וסוכנויות, בהצעת מחיר',
    ...ALL_FEATURES,
    api: true,
    aiPlus: true,
    waMonthly: 3000,
    competitors: 20,
    rankKeywords: 15,
    limits: { ai_draft: 2000, insights: 100, health_run: 30, visibility_run: 30, rank_run: 30 },
  },
};

/** How many Google profiles a business pays for: its followed places, at least one. */
export const profilesOf = (store, businessId) =>
  Math.max(1, store.db.prepare('SELECT COUNT(*) AS n FROM google_locations WHERE business_id = ? AND enabled = 1').get(businessId).n);

/**
 * AI visibility beyond Google's answers: Claude, ChatGPT, Gemini and Perplexity,
 * more questions and the action plan. In "Google + AI"; a system admin may also turn it on for one business.
 */
export const AI_PLUS = {
  label: 'נראות בעוזרי AI',
  tagline: 'בודקים אם ממליצים עליכם גם ב-ChatGPT, Gemini, Perplexity ו-Claude',
  features: ['בדיקה שבועית ב-ChatGPT, Gemini, Perplexity ו-Claude, בנוסף לגוגל', 'תוכנית פעולה ו"על מי ממליצים במקומכם" אחרי כל בדיקה', 'עד 10 שאלות במקום 5'],
};
export const hasAiPlus = (business) => Boolean(planOf(business).aiPlus || business?.ai_plus);

/**
 * Integrations (the public API: a POS, booking system or store sends us the
 * customer after a visit). Off the price list for now: a paid add-on a system
 * admin turns on per business. The hidden chain plans include it.
 */
export const INTEGRATIONS = {
  label: 'חיבורים לקופה ולמערכות',
  tagline: 'שליחה אוטומטית של בקשת דירוג מהקופה, ממערכת התורים או מהחנות',
};
export const hasApi = (business) => Boolean(planOf(business).api || business?.api_on);

/** Plans shown on the price list. */
export const PUBLIC_PLANS = Object.fromEntries(Object.entries(PLANS).filter(([, p]) => !p.hidden));

/**
 * A trial runs on this plan for TRIAL_DAYS. New accounts don't get one: they
 * pick a plan and pay before starting (the demo is there to look around).
 * A system admin can still give a business a trial, and SIGNUP_TRIAL_DAYS
 * turns one on for every new account.
 */
export const TRIAL_PLAN = 'pro';
export const TRIAL_DAYS = 7;
export const signupTrialDays = () => Math.max(0, Math.min(60, Number(process.env.SIGNUP_TRIAL_DAYS) || 0));
/** How a new account starts: on a trial when there is one, otherwise waiting for its first payment. */
export const newBusiness = (name) => {
  const days = signupTrialDays();
  return days ? { name, plan: TRIAL_PLAN, trialDays: days } : { name, plan: TRIAL_PLAN, billing: 'unpaid' };
};
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
  if (business.billing === 'unpaid') return { state: 'paused', reason: 'new' };
  const ends = business.trial_ends_at ? Date.parse(`${business.trial_ends_at.replace(' ', 'T')}Z`) : 0;
  const msLeft = ends - now;
  if (msLeft <= 0) return { state: 'paused', reason: 'trial' };
  return { state: 'trial', daysLeft: Math.ceil(msLeft / 864e5), endsAt: business.trial_ends_at };
}

export const FEATURE_LABELS = {
  emailInvites: 'בקשות ותזכורות ללקוחות במייל',
  ai: 'עוזר AI: תשובות ללקוחות, סיכומים ותיוג',
  widget: 'ווידג\'ט המלצות לאתר',
};

export function limitLabel(n) {
  return n === Infinity ? 'ללא הגבלה' : String(n);
}
