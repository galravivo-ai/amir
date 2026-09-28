import { AGENCY_PRICE, annualPrice, ANNUAL_MONTHS, FEATURE_LABELS, ils, limitLabel, PLANS, TRIAL_DAYS } from '../plans.js';
import { h } from '../util.js';

const FEATURED = 'pro';

function planFeatures(p) {
  return [
    `${p.campaigns === Infinity ? 'סניפים וקמפיינים ללא הגבלה' : p.campaigns === 1 ? 'סניף אחד (קמפיין ו-QR)' : `עד ${p.campaigns} סניפים וקמפיינים`}`,
    `${p.teamMembers === Infinity ? 'משתמשים ללא הגבלה' : `עד ${p.teamMembers} משתמשים`}`,
    `${limitLabel(p.monthlyResponses)} דירוגים בחודש`,
    'סקר, הפניה לגוגל וטיפול בלקוחות לא מרוצים',
    'דירוג עובדים, התראות לטלפון ודוח שבועי',
  ];
}

/**
 * The three plans with a monthly / yearly switch (pure CSS, no script).
 * `action(key)` returns the call to action for a plan: a link on the landing
 * page, a submit button inside the plan page's form.
 */
export function pricingCards({ action, current = '', idPrefix = 'cycle' }) {
  const cards = Object.entries(PLANS)
    .map(([key, p]) => {
      const yearly = annualPrice(p);
      return `<div class="plan ${key === FEATURED ? 'featured' : ''} ${key === current ? 'current' : ''}">
        ${key === FEATURED ? '<div class="plan-tag">הכי משתלם</div>' : ''}
        <h3>${h(p.label)}</h3>
        <p class="plan-tagline">${h(p.tagline)}</p>
        <div class="plan-price">
          <span class="when-monthly"><span class="price">${ils(p.price)}</span><span class="muted"> לחודש</span></span>
          <span class="when-annual"><span class="price">${ils(yearly)}</span><span class="muted"> לשנה</span>
            <small class="save">חיסכון של ${ils(p.price * 12 - yearly)}</small></span>
        </div>
        <ul>
          ${planFeatures(p).map((f) => `<li>✓ ${h(f)}</li>`).join('')}
          ${Object.entries(FEATURE_LABELS)
            .map(([k, label]) => `<li class="${p[k] ? '' : 'off'}">${p[k] ? '✓' : '✗'} ${h(label)}</li>`)
            .join('')}
        </ul>
        ${action(key, p)}
      </div>`;
    })
    .join('');
  return `<div class="pricing">
    <div class="cycle-switch" role="radiogroup" aria-label="תדירות תשלום">
      <input type="radio" name="cycle" value="monthly" id="${idPrefix}-monthly" checked>
      <label for="${idPrefix}-monthly">חודשי</label>
      <input type="radio" name="cycle" value="annual" id="${idPrefix}-annual">
      <label for="${idPrefix}-annual">שנתי <span class="save-chip">חודשיים חינם</span></label>
    </div>
    <div class="plans">${cards}</div>
    <p class="pricing-note">כל המחירים כוללים מע״מ · ${TRIAL_DAYS} ימי ניסיון חינם, בלי כרטיס אשראי · בתשלום שנתי משלמים על ${ANNUAL_MONTHS} חודשים ומקבלים 12</p>
  </div>`;
}

export function agencyOffer() {
  return `<div class="agency-offer">
    <div><b>סוכנות, משווק או יועץ?</b> ${ils(AGENCY_PRICE)} לחודש לכל עסק שאתם מנהלים, כולל מע״מ. כל הפיצ'רים של מסלול מקצועי, מסך אחד לכל הלקוחות, והמיתוג שלכם במקום שלנו.</div>
  </div>`;
}
