// Subscription plans and their limits. Online payment is not wired up yet: a
// business asks for a plan from /admin/plan and a system admin activates it
// from /superadmin. `Infinity` = unlimited. Prices are monthly, in ILS,
// including VAT.
export const PLANS = {
  basic: {
    label: 'בסיסי',
    price: 99,
    tagline: 'לעסק עם סניף אחד',
    campaigns: 1,
    teamMembers: 2,
    monthlyResponses: 300,
    ai: false,
    widget: false,
    emailInvites: false,
    api: false,
  },
  pro: {
    label: 'מקצועי',
    price: 199,
    tagline: 'הכי משתלם לרוב העסקים',
    campaigns: 5,
    teamMembers: 5,
    monthlyResponses: 2000,
    ai: true,
    widget: true,
    emailInvites: true,
    api: true,
  },
  business: {
    label: 'עסקי',
    price: 399,
    tagline: 'לרשתות ולכמה סניפים',
    campaigns: Infinity,
    teamMembers: Infinity,
    monthlyResponses: Infinity,
    ai: true,
    widget: true,
    emailInvites: true,
    api: true,
  },
};

/** New businesses try this plan for TRIAL_DAYS, then pick a plan or pause. */
export const TRIAL_PLAN = 'pro';
export const TRIAL_DAYS = 7;
/** Yearly billing: pay for this many months, get twelve. */
export const ANNUAL_MONTHS = 10;
/** Agencies pay per client business, per month, including VAT. */
export const AGENCY_PRICE = 79;

export const CYCLES = { monthly: 'חודשי', annual: 'שנתי' };

export function planOf(business) {
  return PLANS[business?.plan] || PLANS.basic;
}

export const annualPrice = (p) => p.price * ANNUAL_MONTHS;
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
