import { AGENCY_PRICE, annualPrice, ANNUAL_MONTHS, FEATURE_LABELS, ils, PLANS, TRIAL_DAYS } from '../plans.js';
import { h } from '../util.js';

const FEATURED = 'pro';

const branchesLabel = (p) =>
  p.campaigns === Infinity ? 'סניפים ללא הגבלה' : p.campaigns === 1 ? 'סניף אחד' : `עד ${p.campaigns} סניפים`;

// Every plan includes everything; only the number of branches changes.
const INCLUDED = [
  'משתמשים ודירוגים ללא הגבלה',
  'QR, סקר והפניה לביקורת בגוגל',
  'טיפול בלקוחות לא מרוצים והתראות לטלפון',
  'דירוג עובדים ודוח שבועי',
  ...Object.values(FEATURE_LABELS),
];

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
        <div class="plan-branches">${h(branchesLabel(p))}</div>
        <ul>
          ${INCLUDED.map((f) => `<li>✓ ${h(f)}</li>`).join('')}
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
    <p class="pricing-note">כל המסלולים כוללים את כל הפיצ'רים, ההבדל הוא רק במספר הסניפים · המחירים כוללים מע״מ · ${TRIAL_DAYS} ימי ניסיון חינם, בלי כרטיס אשראי · בתשלום שנתי משלמים על ${ANNUAL_MONTHS} חודשים ומקבלים 12</p>
  </div>`;
}

export function agencyOffer() {
  return `<div class="agency-offer">
    <div><b>סוכנות, משווק או יועץ?</b> ${ils(AGENCY_PRICE)} לחודש לכל עסק שאתם מנהלים, כולל מע״מ. כל הפיצ'רים, מסך אחד לכל הלקוחות, והמיתוג שלכם במקום שלנו.</div>
  </div>`;
}
