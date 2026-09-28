// Subscription plans and their limits. Billing is not wired up yet: a system
// admin assigns the plan manually from /superadmin. `Infinity` = unlimited.
// `price` is the monthly price in ILS shown on the landing page; null shows "contact us".
export const PLANS = {
  free: {
    label: 'חינם',
    price: 0,
    campaigns: 1,
    teamMembers: 1,
    monthlyResponses: 100,
    ai: false,
    widget: false,
    emailInvites: false,
    api: false,
  },
  pro: {
    label: 'מקצועי',
    price: null,
    campaigns: 10,
    teamMembers: 5,
    monthlyResponses: 2000,
    ai: true,
    widget: true,
    emailInvites: true,
    api: true,
  },
  business: {
    label: 'עסקי',
    price: null,
    campaigns: Infinity,
    teamMembers: Infinity,
    monthlyResponses: Infinity,
    ai: true,
    widget: true,
    emailInvites: true,
    api: true,
  },
};

export function planOf(business) {
  return PLANS[business?.plan] || PLANS.free;
}

export const FEATURE_LABELS = {
  ai: 'עוזר AI',
  widget: 'ווידג\'ט ביקורות לאתר',
  emailInvites: 'בקשות ותזכורות במייל',
  api: 'שליחה אוטומטית מהקופה ומהמערכות שלכם (API)',
};

export function limitLabel(n) {
  return n === Infinity ? 'ללא הגבלה' : String(n);
}
