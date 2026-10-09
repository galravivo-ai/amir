import { annualPrice, ANNUAL_MONTHS, FEATURE_LABELS, ils, PUBLIC_PLANS, TRIAL_DAYS } from '../plans.js';
import { h } from '../util.js';

const FEATURED = 'pro';
// Automatic WhatsApp sending is listed only once the platform's number is set up.
const waOn = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

const branchesLabel = (p) =>
  p.campaigns === Infinity ? 'סניפים ללא הגבלה' : p.campaigns === 1 ? 'סניף אחד' : `עד ${p.campaigns} סניפים`;

// Every plan includes these; the branches and the AI engines change.
const INCLUDED = [
  'משתמשים ודירוגים ללא הגבלה',
  'QR, סקר והפניה לביקורת בגוגל',
  'טיפול בלקוחות לא מרוצים והתראות לטלפון',
  'ציון בריאות לפרופיל הגוגל ומשימות שבועיות',
  'השוואה למתחרים ודוח חודשי',
  'דירוג עובדים ודוח שבועי',
  ...Object.values(FEATURE_LABELS),
];

/**
 * The three plans with a monthly / yearly switch (pure CSS, no script).
 * `action(key)` returns the call to action for a plan: a link on the landing
 * page, a submit button inside the plan page's form.
 */
export function pricingCards({ action, current = '', idPrefix = 'cycle', compact = false }) {
  const cards = Object.entries(PUBLIC_PLANS)
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
          ${compact ? '<li>✓ כל מה שכלול בכל המסלולים</li>' : INCLUDED.map((f) => `<li>✓ ${h(f)}</li>`).join('')}
          ${waOn() ? `<li>✓ עד ${p.waMonthly.toLocaleString('he-IL')} בקשות דירוג בוואטסאפ בחודש, נשלחות אוטומטית</li>` : ''}
          <li class="${p.aiPlus ? 'plan-plus' : ''}">✓ ${p.aiPlus ? 'נראות ב-AI גם ב-ChatGPT, Gemini ו-Perplexity' : 'נראות ב-AI בגוגל וב-Claude'}</li>
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
    ${compact ? `<div class="pricing-all"><b>כלול בכל המסלולים</b><div>${INCLUDED.map((f) => `<span>✓ ${h(f)}</span>`).join('')}</div></div>` : ''}
    <p class="pricing-note">ההבדל בין המסלולים: מספר הסניפים, ומהמסלול המקצועי גם בדיקת נראות ב-ChatGPT, Gemini ו-Perplexity · המחירים כוללים מע״מ · ${TRIAL_DAYS} ימי ניסיון חינם, בלי כרטיס אשראי · בתשלום שנתי משלמים על ${ANNUAL_MONTHS} חודשים ומקבלים 12</p>
  </div>`;
}

/** Agencies and large chains get a personal quote; `cta` is the button. */
export function customOffer(cta) {
  return `<div class="custom-offer">
    <div class="custom-items">
      <div><b>סוכנות, משווק או יועץ?</b><span>מנהלים את כל העסקים של הלקוחות ממסך אחד, עם המיתוג שלכם במקום שלנו.</span></div>
      <div><b>רשת עם יותר מ-10 סניפים?</b><span>כל הסניפים בחשבון אחד, עם השוואה ודירוג בין הסניפים.</span></div>
    </div>
    <div class="custom-cta"><span>מחיר בהצעה אישית</span>${cta}</div>
  </div>`;
}
