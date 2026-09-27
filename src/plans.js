// Subscription plans and their limits. Billing is not wired up yet: a system
// admin assigns the plan manually from /superadmin. `Infinity` = unlimited.
export const PLANS = {
  free: {
    label: 'חינם',
    campaigns: 1,
    teamMembers: 1,
    monthlyResponses: 100,
    ai: false,
    widget: false,
    emailInvites: false,
  },
  pro: {
    label: 'מקצועי',
    campaigns: 10,
    teamMembers: 5,
    monthlyResponses: 2000,
    ai: true,
    widget: true,
    emailInvites: true,
  },
  business: {
    label: 'עסקי',
    campaigns: Infinity,
    teamMembers: Infinity,
    monthlyResponses: Infinity,
    ai: true,
    widget: true,
    emailInvites: true,
  },
};

export function planOf(business) {
  return PLANS[business?.plan] || PLANS.free;
}

export const FEATURE_LABELS = {
  ai: 'עוזר AI',
  widget: 'ווידג\'ט ביקורות לאתר',
  emailInvites: 'בקשות ותזכורות במייל',
};

export function limitLabel(n) {
  return n === Infinity ? 'ללא הגבלה' : String(n);
}
