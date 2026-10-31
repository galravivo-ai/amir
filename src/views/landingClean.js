import { asset, h } from '../util.js';
import { ANNUAL_MONTHS, branchPrice, payProvider, PLANS, TRIAL_DAYS } from '../plans.js';
import { icon } from './icons.js';
import { contactForm, networkSection, operatorInfo, sitePage, talkForm } from './site.js';
import { featureGuide } from '../guide.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The landing page (Hebrew): the tools shown like products in a store, sliders
// that swipe on a phone, big type and plenty of white, inside the site's own
// header and footer. English (/en) and /v1 keep the earlier page.

const shot = (file) => asset(`media/guide/${file}`);
// The phone-sized screens (390×700 at 2x), one per tool that has one.
const PHONE = new Set(['dashboard', 'reviews', 'growth', 'rank', 'ai', 'qr', 'competitors', 'report', 'network']);
const phoneShot = (key) => asset(`media/guide-m/${key}.jpg`);

// The tools, as the shop's shelf: [key, icon, color, name, line, guide, screenshot].
const TOOLS = [
  ['dashboard', 'chart', '#6d4bff', 'דשבורד גוגל מיי ביזנס', 'הדירוג, הביקורות, כמה ראו את הפרופיל, כמה התקשרו, ביקשו הגעה ונכנסו לאתר, ומה חיפשו כשמצאו אתכם.', 'dashboard', 'dashboard.jpg'],
  ['reviews', 'star', '#e8a100', 'ביקורות ותשובות AI', 'כל ביקורת חדשה מגיעה עם התראה, ותשובה מנוסחת בסגנון שלכם שנשאר רק לאשר.', 'reviews', 'reviews.jpg'],
  ['growth', 'pin', '#1d7fe0', 'קידום בגוגל מפות', 'תוכנית קצרה לכל שבוע, מהנתונים שלכם: מה להשלים בפרופיל, כמה ביקורות חסרות מול המוביל באזור, ובאיזה כיוון אתם חלשים.', 'growth', 'growth.jpg'],
  ['rank', 'search', '#12a150', 'מיקום בגוגל מפות', 'איפה אתם מופיעים בגוגל מפות בכל שכונה, מול המתחרים. בדיקה שבועית מ-9 נקודות מראה אם עליתם.', 'rankings', 'rank.jpg'],
  ['ai', 'spark', '#c0398f', 'נראות ב-AI', 'האם ChatGPT, Gemini וגוגל ממליצים עליכם בשאלות מקומיות, על מי ממליצים במקומכם, ומה לעשות כדי שכן.', 'ai', 'ai.jpg'],
  ['qr', 'qr', '#e5533d', 'עוד ביקורות בגוגל', 'שלט QR מעוצב ובקשת דירוג בוואטסאפ, גם אוטומטית אחרי כל ביקור. לקוח לא מרוצה מגיע אליכם, לא לגוגל.', 'qr', 'poster.jpg'],
  ['competitors', 'rivals', '#0f9e9e', 'השוואה למתחרים', 'הדירוג, כמות הביקורות והקצב של המתחרים באזור, מול שלכם.', 'competitors', 'competitors.jpg'],
  ['posts', 'chat', '#6d4bff', 'פוסטים עם AI', 'מרעיון קצר לפוסט מוכן לפרופיל בגוגל, עם תמונה, בלי להיכנס לגוגל.', 'posts', 'posts.jpg'],
  ['report', 'report', '#e8a100', 'דוח חודשי', 'כל החודש בעמוד אחד, להדפסה או לשליחה. מגיע גם במייל בתחילת כל חודש.', 'report', 'report.jpg'],
  ['network', 'branches', '#1d7fe0', 'רשתות וסניפים', 'כל הסניפים במסך אחד: השוואה, מנהל לכל סניף, תבניות תשובה משותפות ודוח מאוחד.', 'network', 'network.jpg'],
];

const G_MARK = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/** A half-circle gauge, as on the dashboard. */
const gauge = (score) => {
  const len = Math.PI * 80;
  return `<svg class="lx-gauge-svg" viewBox="0 0 200 112" aria-hidden="true"><defs><linearGradient id="lxg" x1="0" x2="1"><stop offset="0" stop-color="#8b6dff"/><stop offset="1" stop-color="#5b3df5"/></linearGradient></defs><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#ece8fb" stroke-width="18" stroke-linecap="round"/><path class="lx-arc" d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#lxg)" stroke-width="18" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - score / 100)}" style="--len:${len}"/><g class="lx-needle" style="--deg:${-90 + (score / 100) * 180}deg"><path d="M100 36 L106 100 L94 100 Z" fill="#17123a"/></g><circle cx="100" cy="100" r="9" fill="#17123a"/></svg>`;
};
const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';

// One short line under each tool's name on the shelf.
const SUBS = { dashboard: 'צפיות, שיחות ומה חיפשו', reviews: 'התראה ותשובה בלחיצה', growth: 'תוכנית לכל שבוע', rank: 'איפה אתם בכל שכונה', ai: 'ChatGPT, Gemini וגוגל', qr: 'QR ווואטסאפ', competitors: 'דירוג, ביקורות וקצב', posts: 'מרעיון לפוסט מוכן', report: 'להדפסה ובמייל', network: 'כל הסניפים במסך אחד' };

// The small label above each tool's name.
const TAGS = { dashboard: 'נתונים', reviews: 'ביקורות', growth: 'קידום', rank: 'מפות', ai: 'AI', qr: 'איסוף ביקורות', competitors: 'מתחרים', posts: 'תוכן', report: 'דוחות', network: 'רשתות' };

const rail = (id, cards, cls = '') => `<div class="v2-rail-wrap ${cls}" data-rail>
    <div class="v2-rail" id="${id}" tabindex="0">${cards.join('')}</div>
    <div class="v2-rail-nav"><button type="button" class="v2-arrow" data-dir="prev" aria-label="הקודם" aria-controls="${id}">‹</button><span class="v2-dots" aria-hidden="true"></span><span class="v2-count" aria-live="polite"></span><button type="button" class="v2-arrow" data-dir="next" aria-label="הבא" aria-controls="${id}">›</button></div>
  </div>`;

export function landingCleanView({ signupOpen = true, trialOpen = false, contactSent = false, contactError = '', contactValues = {}, talkSent = false, talkError = '' }) {
  const op = operatorInfo();
  const start = signupOpen ? '/register' : '/login';
  const startLabel = trialOpen ? `${TRIAL_DAYS} ימים חינם` : 'להתחיל עכשיו';
  const card = payProvider() === 'cardcom';

  // The close-ups: one tab per tool; the chosen tool shows its screen, a line and its guide's points.
  const tabs = TOOLS.map(([key, ic, c, name], i) => `<button type="button" role="tab" class="v2-tab" id="tab-${key}" aria-controls="t-${key}" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}" style="--c:${c}">${icon(ic, 16)}<span>${h(name)}</span></button>`);
  const panels = TOOLS.map(([key, ic, c, name, line, guide, img], i) => {
    const points = (featureGuide(guide)?.points || []).slice(0, 3);
    return `<div class="v2-panel" role="tabpanel" id="t-${key}" aria-labelledby="tab-${key}" style="--c:${c}"${i ? ' hidden' : ''}>
      <div class="v2-panel-stage${PHONE.has(key) ? '' : ' wide'}"><button type="button" class="v2-frame" data-zoom aria-label="הגדלת המסך: ${h(name)}"><span class="v2-frame-bar"><i></i><i></i><i></i><em>gofive.co.il</em></span><picture>${PHONE.has(key) ? `<source media="(max-width: 860px)" srcset="${phoneShot(key)}" width="780" height="1400">` : ''}<img src="${shot(img)}" alt="${h(name)}" width="1120" height="730" loading="${i ? 'lazy' : 'eager'}"></picture><span class="v2-zoom">⤢</span></button></div>
      <div class="v2-panel-text">
        <h3>${h(name)}</h3>
        <p>${h(line)}</p>
        ${points.length ? `<ul>${points.map((x) => `<li>${icon('check', 16)}<span>${h(x)}</span></li>`).join('')}</ul>` : ''}
        <a class="v2-more" href="/guide/${guide}">המדריך המלא ›</a>
      </div>
    </div>`;
  });
  // Why: each point shows a small piece of the real thing, not just an icon.
  const why = [
    ['חיפוש ומפות', 'שם לקוחות מוצאים אתכם', 'בחיפוש "ליד" ובגוגל מפות מוצגים קודם הפרופילים. מי שלמעלה מקבל את הלקוח.', `<div class="w-search">${icon('search', 14)} מסעדה איטלקית לידי</div>
      <ul class="w-pack"><li class="me"><i>1</i><b>ביסטרו הגפן</b><em>4.7 ★ (412)</em></li><li><i>2</i><b>פסטה דה לוקה</b><em>4.5 ★ (1.2K)</em></li><li><i>3</i><b>מסעדת הנמל</b><em>4.3 ★ (2.1K)</em></li></ul>`],
    ['ביקורות', 'ביקורות מכריעות', 'דירוג, כמות ומענה לביקורות: זה מה שלקוחות בודקים, וגם מה שגוגל שוקלת.', `<div class="w-score"><b>4.7</b><span>★★★★★</span><small>412 ביקורות</small></div>
      <div class="w-dist">${[[5, 78], [4, 14], [3, 4], [2, 2], [1, 2]].map(([n, v]) => `<span><small>${n}</small><i><u style="width:${v}%"></u></i></span>`).join('')}</div>`],
    ['עוזרי AI', 'גם ה-AI קורא אותו', 'ChatGPT וגוגל AI נשענים על פרופילים וביקורות כשהם ממליצים על עסק באזור.', `<div class="w-q">איפה כדאי לאכול ליד דיזנגוף?</div>
      <div class="w-a">${icon('spark', 13)} אני ממליץ על <b>ביסטרו הגפן</b>: פסטה טרייה, דירוג 4.7 בגוגל ושירות מוערך.</div>`],
  ].map(([, title, text, art], i) => `<article class="lx-why lx-why-${i + 1}"><div class="lx-why-art" aria-hidden="true">${art}</div><div class="lx-why-text"><h3>${h(title)}</h3><p>${h(text)}</p></div></article>`);
  // How it works: three steps, each with a small screen that plays when it scrolls into view.
  const stepArt = [
    `<div class="s-connect"><span class="s-gbtn s-off">${G_MARK} התחברות עם Google</span><span class="s-gbtn s-on">${icon('check', 16)} מחובר לגוגל מיי ביזנס</span></div><div class="s-sub"><span class="s-off">או הדבקת קישור לגוגל מפות</span><span class="s-on">905 ביקורות · 18 חודשי נתונים נטענו</span></div>`,
    `<ul class="s-checks">${[['בריאות הפרופיל', '84'], ['מיקום במפות', '2.5'], ['5 מתחרים', '✓'], ['נראות ב-AI', '62']].map(([l, v], i) => `<li style="--d:${0.5 + i * 0.55}s"><i class="s-spin"></i><b class="s-done">${icon('check', 12)}</b><span>${l}</span><em>${v}</em></li>`).join('')}</ul>`,
    `<ul class="s-todo">${['לענות ל-4 ביקורות', 'להשלים את תיאור העסק', 'לבקש דירוג מ-5 לקוחות'].map((l, i) => `<li style="--d:${0.6 + i * 0.6}s"><i>${icon('check', 12)}</i><span>${l}</span></li>`).join('')}</ul><div class="s-score"><span>ציון קידום</span><b><span class="s-off">48</span><span class="s-on">61 ▲</span></b></div>`,
  ];
  const steps = [
    ['plug', 'דקה אחת', 'מחברים את גוגל מיי ביזנס', 'עם חשבון הגוגל של העסק, או בהדבקת קישור לגוגל מפות.'],
    ['search', 'אוטומטי, כל שבוע', 'המערכת בודקת', 'פרופיל, מפות, מתחרים ו-AI. הכול רץ לבד, כל שבוע.'],
    ['check', '10 דקות בשבוע', 'עושים את מה שחשוב', 'תוכנית קצרה לכל שבוע כדי לעלות במפות, ותשובות שה-AI כבר ניסח.'],
  ].map(([ic, when, title, text], i) => `<article class="v2-step"><div class="v2-step-top"><span class="v2-step-ic">${icon(ic, 20)}</span><span class="v2-step-n">שלב ${i + 1} · ${h(when)}</span></div><h3>${h(title)}</h3><p>${h(text)}</p><div class="v2-step-art" aria-hidden="true">${stepArt[i]}</div></article>`);

  const plan = (p, items, best = false) => `<article class="v2-plan${best ? ' best' : ''}">
      ${best ? '<span class="v2-badge">הכי משתלם</span>' : ''}
      <h3>${h(p.label)}</h3>
      <p class="v2-price" data-cycle="monthly">₪${p.price}<small> לחודש</small></p>
      <p class="v2-price" data-cycle="annual" hidden>₪${(p.price * ANNUAL_MONTHS).toLocaleString('en-US')}<small> לשנה</small></p>
      <p class="v2-branch" data-cycle="monthly">כל סניף נוסף ₪${branchPrice(p)} לחודש</p>
      <p class="v2-branch" data-cycle="annual" hidden>חודשיים מתנה · כל סניף נוסף ₪${(branchPrice(p) * ANNUAL_MONTHS).toLocaleString('en-US')} לשנה</p>
      <ul>${items.map((x) => `<li>${icon('check', 16)}${h(x)}</li>`).join('')}</ul>
      <a class="v2-btn${best ? '' : ' ghost'}" href="${start}">${h(startLabel)}</a>
    </article>`;

  const faq = [
    ['מה זה גוגל מיי ביזנס?', 'גוגל מיי ביזנס (היום נקרא Google Business Profile) הוא הפרופיל החינמי של העסק בגוגל: מה שמופיע בחיפוש ובגוגל מפות, עם הכתובת, השעות, התמונות, הביקורות וכפתורי ההתקשרות. GoFive מתחברת לפרופיל הזה ועוזרת לנהל ולקדם אותו.'],
    ['צריך שיהיה לעסק פרופיל בגוגל?', 'כן, GoFive עובדת על הפרופיל הקיים שלכם בגוגל מיי ביזנס. אם עוד אין לכם, פותחים אחד בחינם ב-business.google.com, ואנחנו נעזור לכם להשלים אותו בעזרת ציון הבריאות וההמלצות.'],
    ['מה זה "נראות ב-AI"?', 'יותר ויותר אנשים שואלים עוזר AI "איפה יש מסעדה טובה ליד…" במקום לחפש. GoFive שואלת את עוזרי ה-AI בכל שבוע את השאלות המקומיות שהלקוחות שלכם שואלים, מראה אם ממליצים עליכם ועל מי ממליצים במקומכם, ונותנת תוכנית פעולה כדי להופיע.'],
    ['איך GoFive עוזרת לעלות בגוגל מפות?', 'גוגל מדרגת עסקים במפות לפי כמה הפרופיל מתאים לחיפוש, כמה העסק בולט ופעיל, וכמה הוא קרוב למי שמחפש. GoFive בודקת את כל אלה כל שבוע, ובעמוד "קידום בגוגל מפות" מחכה לכם רשימה אחת מהנתונים שלכם: מה להשלים, מה לעשות השבוע, ובאיזה כיוון אתם חלשים.'],
    ['מאיפה מגיעים הנתונים של הצפיות והשיחות?', 'ישירות מגוגל. מחברים פעם אחת את חשבון הגוגל שמנהל את העסק, ו-18 החודשים האחרונים נטענים לבד.'],
    ['מה קורה כשלקוח לא מרוצה?', 'הוא לא מועבר לגוגל. במקום זה הוא משאיר לכם הודעה ופרטים, אתם מקבלים התראה מיד, וחוזרים אליו כדי לתקן.'],
    ['אפשר לראות את המערכת לפני שמשלמים?', trialOpen ? (card ? `כן: ${TRIAL_DAYS} ימים חינם על העסק שלכם, ורק אם ממשיכים מחויבים בסוף. מבטלים בקליק לפני כן.` : `כן: ${TRIAL_DAYS} ימים חינם על העסק שלכם, בלי כרטיס אשראי ובלי התחייבות.`) : 'כן, בצילומי המסך כאן רואים את כל המסכים על עסק לדוגמה. ואפשר להשאיר פרטים ונראה לכם.'],
    ['יש לי כמה סניפים. כמה זה עולה?', `הסניף הראשון במחיר המסלול, וכל סניף נוסף ב-20% הנחה: ₪${branchPrice(PLANS.basic)} לחודש במסלול "${PLANS.basic.label}" ו-₪${branchPrice(PLANS.pro)} במסלול "${PLANS.pro.label}", כולל מע״מ. כל הסניפים מנוהלים מחשבון אחד.`],
    ['אפשר לבטל?', 'כן, בכל רגע, מעמוד "התוכנית שלי". המסלול נשאר פעיל עד סוף התקופה ששולמה, ואחרי זה לא תחויבו יותר.'],
  ];

  return sitePage({
    title: `${op.brand} · ניהול גוגל מיי ביזנס, ביקורות ונראות ב-AI`,
    description: 'מערכת לניהול פרופיל גוגל מיי ביזנס (Google Business Profile): ביקורות ותשובות AI, צפיות ושיחות מהפרופיל, קידום ומיקום בגוגל מפות, מתחרים, ונראות ב-ChatGPT, Gemini ו-Perplexity. תוכנית שבועית לעלות במפות, והתראות.',
    signupOpen,
    path: '/',
    bodyClass: 'site v2-page',
    head: `<style>
:root { --ink: #17123a; --muted: #5b5680; --soft: #f6f4ff; --line: #e6e2f5; --brand: #5b3df5; --brand-h: #4527e0; --yellow: #ffd23f; --night: #1c1650; --font: 'Assistant', 'Rubik', 'Segoe UI', Arial, sans-serif; --font-head: 'Rubik', 'Assistant', 'Segoe UI', sans-serif; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body.v2-page { margin: 0; background: #fff; color: var(--ink); font-family: var(--font); line-height: 1.47; -webkit-font-smoothing: antialiased; }
:where(.v2-main) a { color: var(--brand); text-decoration: none; }
:where(.v2-main) a:hover { text-decoration: underline; }
:where(.v2-main) img { max-width: 100%; height: auto; display: block; }
:where(.v2-main) :is(h1, h2, h3), .v2-price, .v2-step b { font-family: var(--font-head); }
.v2-main :is(h1, h2, h3) { color: inherit; }
.v2-wrap { max-width: 1180px; margin: 0 auto; padding: 0 22px; }
.v2-head { text-align: center; max-width: 760px; margin: 0 auto; }
.v2-head h2 { margin: 0; font-size: clamp(1.9rem, 4.6vw, 3.2rem); line-height: 1.1; font-weight: 700; letter-spacing: -.01em; }
.v2-head p { margin: 14px auto 0; color: var(--muted); font-size: clamp(1.02rem, 1.9vw, 1.25rem); max-width: 46ch; }


/* buttons */
.v2-btns { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 26px; }
.v2-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 26px; border-radius: 980px; background: var(--brand); color: #fff; font-weight: 600; font-size: 1.02rem; border: 1.5px solid var(--brand); }
.v2-btn:hover { background: var(--brand-h); border-color: var(--brand-h); text-decoration: none; }
.v2-btn.ghost { background: transparent; color: var(--brand); }
.v2-btn.ghost:hover { background: #f1edff; }
.v2-btn.yellow { background: var(--yellow); border-color: var(--yellow); color: #1c1650; }
.v2-btn.yellow:hover { background: #ffdb5c; }
.v2-btn.ghost.light { color: #fff; border-color: rgba(255, 255, 255, .45); }
.v2-btn.ghost.light:hover { background: rgba(255, 255, 255, .1); }

/* hero */
/* the phone in front of the laptop, and two notes floating beside them */

/* the shelf: a night panel with every tool as a small card */
@media (max-width: 860px) {
}

/* sections */
.v2-sec { padding: 96px 0; }
.v2-sec.soft { background: var(--soft); }
.v2-sec.dark { background: linear-gradient(160deg, #120d33, #1c1650 60%, #241b6b); color: #f5f5f7; }
.v2-sec.dark .v2-head p { color: #a1a1a6; }

/* sliders: swipe on a phone, arrows and dots on a computer */
.v2-rail-wrap { margin-top: 40px; }
.v2-rail { display: flex; gap: 20px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 0 22px; padding: 6px 22px 20px; scrollbar-width: none; scroll-behavior: smooth; }
.v2-rail::-webkit-scrollbar { display: none; }
.v2-rail > * { scroll-snap-align: start; flex: none; }
.v2-rail-nav { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 6px; }
.v2-arrow { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--line); background: #fff; color: var(--ink); font-size: 1.4rem; line-height: 1; cursor: pointer; }
.v2-arrow:hover { background: #dcdce1; }
.v2-arrow:disabled { opacity: .35; cursor: default; }
.v2-sec.dark .v2-arrow { background: #2a2740; color: #fff; }
.v2-dots { display: flex; gap: 7px; }
.v2-dots i { width: 7px; height: 7px; border-radius: 50%; background: #c7c7cc; transition: width .2s, background .2s; }
.v2-dots i.on { width: 22px; border-radius: 4px; background: var(--ink); }
.v2-sec.dark .v2-dots i.on { background: #fff; }
@media (min-width: 1240px) { .v2-rail { padding-inline: max(22px, calc((100vw - 1180px) / 2)); scroll-padding: 0 max(22px, calc((100vw - 1180px) / 2)); } }

/* close-ups: tabs, then the chosen tool's screen on a colored stage, with its points */
.v2-card-tag { display: inline-flex; align-items: center; gap: 6px; font-size: .78rem; font-weight: 700; letter-spacing: .02em; color: var(--c); }
.v2-tabs { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 36px; }
.v2-tab { display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink); font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer; transition: background .2s, color .2s, border-color .2s; }
.v2-tab svg { color: var(--c); }
.v2-tab:hover { border-color: color-mix(in srgb, var(--c) 45%, var(--line)); }
.v2-tab[aria-selected="true"] { background: var(--night); border-color: var(--night); color: #fff; }
.v2-tab[aria-selected="true"] svg { color: var(--yellow); }
.v2-panels { margin-top: 28px; }
.v2-panel { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 44px; align-items: center; animation: v2-in .35s ease; }
.v2-panel[hidden] { display: none; }
@keyframes v2-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.v2-panel-stage { border-radius: 26px; padding: 34px 34px 0; overflow: hidden; background: radial-gradient(420px 260px at 85% 0%, color-mix(in srgb, var(--c) 30%, transparent), transparent 70%), linear-gradient(160deg, color-mix(in srgb, var(--c) 14%, #fff), color-mix(in srgb, var(--c) 6%, #fff)); border: 1px solid color-mix(in srgb, var(--c) 18%, var(--line)); }
.v2-frame { position: relative; display: block; width: 100%; padding: 0; border: 0; background: #fff; border-radius: 12px 12px 0 0; overflow: hidden; cursor: zoom-in; box-shadow: 0 30px 60px -30px rgba(23, 18, 58, .55); font: inherit; }
.v2-frame-bar { display: flex; align-items: center; gap: 5px; padding: 8px 12px; background: #f3f1fa; border-bottom: 1px solid var(--line); direction: ltr; }
.v2-frame-bar i { width: 8px; height: 8px; border-radius: 50%; background: #d6d1e8; }
.v2-frame-bar em { margin-inline-start: 8px; font-style: normal; font-size: .72rem; color: var(--muted); }
.v2-frame img { width: 100%; aspect-ratio: 1120 / 690; object-fit: cover; object-position: top right; }
.v2-panel-text h3 { margin: 8px 0 0; font-size: clamp(1.5rem, 3vw, 2.1rem); line-height: 1.15; }
.v2-panel-text > p { margin: 12px 0 0; color: var(--muted); font-size: 1.05rem; }
.v2-panel-text ul { list-style: none; margin: 20px 0 0; padding: 0; display: grid; gap: 12px; }
.v2-panel-text li { display: flex; gap: 10px; align-items: flex-start; font-size: .95rem; line-height: 1.5; }
.v2-panel-text li svg { flex: none; margin-top: 3px; padding: 3px; box-sizing: content-box; border-radius: 50%; color: #fff; background: var(--c); }
.v2-more { display: inline-block; margin-top: 22px; font-weight: 700; }
/* desktop: one card, the words on the right and the screen on the left */
@media (min-width: 861px) {
  .v2-tabs { width: fit-content; max-width: 100%; margin: 36px auto 0; padding: 6px; gap: 4px; border-radius: 26px; background: var(--soft); border: 1px solid var(--line); }
  .v2-tab { border-color: transparent; background: transparent; padding: 9px 14px; font-size: .86rem; }
  .v2-tab:hover { background: #fff; border-color: transparent; }
  .v2-tab[aria-selected="true"] { background: var(--night); box-shadow: 0 8px 18px -10px rgba(28, 22, 80, .7); }
  .v2-panels { margin-top: 30px; border-radius: 34px; padding: 44px; background: radial-gradient(700px 380px at 0% 100%, color-mix(in srgb, var(--brand) 9%, transparent), transparent 70%), #fff; border: 1px solid var(--line); box-shadow: 0 50px 90px -60px rgba(40, 20, 120, .45); }
  .v2-panel { grid-template-columns: minmax(0, .85fr) minmax(0, 1.6fr); gap: 48px; }
  .v2-panel-text { order: -1; }
  .v2-card-tag { padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--c) 12%, #fff); }
  .v2-panel-text h3 { margin-top: 16px; font-size: clamp(1.9rem, 2.8vw, 2.5rem); letter-spacing: -.01em; }
  .v2-panel-text > p { font-size: 1.1rem; line-height: 1.6; }
  .v2-panel-text ul { margin-top: 26px; gap: 10px; }
  .v2-panel-text li { padding: 12px 14px; border-radius: 14px; background: color-mix(in srgb, var(--c) 5%, #fff); border: 1px solid color-mix(in srgb, var(--c) 14%, var(--line)); font-size: .93rem; }
  .v2-more { display: inline-flex; align-items: center; gap: 6px; margin-top: 26px; padding: 11px 20px; border-radius: 999px; background: var(--night); color: #fff !important; font-size: .95rem; }
  .v2-more:hover { background: var(--brand); text-decoration: none !important; }
  .v2-panel-stage { padding: 40px 40px 0; border-radius: 28px; }
  .v2-frame { border-radius: 14px 14px 0 0; box-shadow: 0 40px 70px -34px rgba(23, 18, 58, .6); transition: transform .4s ease; }
  .v2-frame:hover { transform: translateY(-4px); }
  .v2-frame picture, .v2-frame img { display: block; }
  .v2-zoom { position: absolute; bottom: 14px; left: 14px; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: rgba(28, 22, 80, .85); color: #fff; font-size: 1rem; opacity: 0; transform: scale(.9); transition: opacity .25s, transform .25s; }
  .v2-frame:hover .v2-zoom, .v2-frame:focus-visible .v2-zoom { opacity: 1; transform: none; }
}
@media (max-width: 860px) {
  .v2-tabs { flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; margin: 26px -22px 0; padding: 2px 22px 6px; scrollbar-width: none; scroll-snap-type: x proximity; }
  .v2-tabs::-webkit-scrollbar { display: none; }
  .v2-tab { flex: none; scroll-snap-align: start; }
  .v2-panels { margin-top: 18px; }
  .v2-panel { grid-template-columns: minmax(0, 1fr); gap: 22px; }
  /* a phone: a whole phone, tilted a touch, beside the tool's name; the points stay for computers */
  .v2-panel { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .v2-panel-stage { position: relative; padding: 22px 0; border-radius: 22px; display: flex; justify-content: center; overflow: hidden; }
  .v2-panel-stage::after { content: ''; position: absolute; bottom: 14px; left: 50%; width: 160px; height: 18px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(closest-side, rgba(23, 18, 58, .28), transparent); }
  .v2-panel-stage.wide { padding: 18px 0 0 18px; display: block; }
  .v2-panel-stage.wide::after { display: none; }
  .v2-frame { position: relative; z-index: 1; width: min(48vw, 196px); padding: 7px; border: 0; border-radius: 34px; background: linear-gradient(145deg, #2d2752, #120e2c); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .14), 0 24px 40px -18px rgba(23, 18, 58, .7); transform: rotate(-2deg); }
  .v2-frame::before { content: ''; position: absolute; z-index: 2; top: 13px; left: 50%; width: 58px; height: 16px; transform: translateX(-50%); border-radius: 10px; background: #0b0920; }
  .v2-frame::after { content: ''; position: absolute; top: 74px; right: -3px; width: 3px; height: 40px; border-radius: 0 3px 3px 0; background: #2d2752; }
  .v2-frame .v2-frame-bar { display: none; }
  .v2-frame picture { display: block; padding-top: 26px; border-radius: 27px; overflow: hidden; background: #f6f4ff; }
  .v2-frame img { display: block; aspect-ratio: 390 / 640; height: auto; object-fit: cover; object-position: top center; }
  .v2-panel-stage.wide .v2-frame picture { padding: 0; border-radius: 0; background: none; }
  .v2-panel-stage.wide .v2-frame { width: 100%; padding: 0; border-radius: 12px 0 0 0; background: #fff; box-shadow: 0 20px 40px -24px rgba(23, 18, 58, .5); transform: none; }
  .v2-panel-stage.wide .v2-frame::before, .v2-panel-stage.wide .v2-frame::after { display: none; }
  .v2-panel-stage.wide .v2-frame .v2-frame-bar { display: flex; }
  .v2-panel-stage.wide .v2-frame img { width: 170%; max-width: none; aspect-ratio: auto; height: 220px; object-position: top right; border-radius: 0; }
  .v2-zoom { display: none; }
  .v2-panel-text { text-align: center; }
  .v2-panel-text h3 { font-size: 1.35rem; margin-top: 4px; }
  .v2-panel-text > p { font-size: .98rem; margin-top: 6px; }
  .v2-panel-text ul { display: none; }
  #tools { padding-top: 54px; padding-bottom: 46px; }
  #tools .v2-head p { display: none; }
  #tools .v2-tabs { margin-top: 18px; }
  .v2-more { margin-top: 10px; }
}

/* why: a small piece of the real thing above each point */
.v2-why { width: min(82vw, 360px); border-radius: 20px; background: #fff; border: 1px solid var(--line); overflow: hidden; display: flex; flex-direction: column; }
.v2-why-art { height: 176px; padding: 18px; background: #faf9ff; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; justify-content: center; gap: 8px; font-size: .84rem; }
.v2-why-text { padding: 20px 22px 24px; }
.v2-why small { display: block; color: var(--brand); font-weight: 700; font-size: .78rem; letter-spacing: .02em; }
.v2-why h3 { margin: 4px 0 0; font-size: 1.25rem; }
.v2-why p { margin: 8px 0 0; color: var(--muted); font-size: .96rem; }
.w-search { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: #fff; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); }
.w-pack { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.w-pack li { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 8px; padding: 6px 10px; background: #fff; border: 1px solid var(--line); border-radius: 10px; }
.w-pack li.me { border-color: #b9a8ff; box-shadow: 0 0 0 3px #efeaff; }
.w-pack i { width: 20px; height: 20px; border-radius: 50%; background: #ea4335; color: #fff; font-style: normal; font-size: .7rem; display: grid; place-items: center; }
.w-pack em { font-style: normal; color: var(--muted); font-size: .76rem; }
.w-score { display: flex; align-items: baseline; gap: 8px; }
.w-score b { font-family: var(--font-head); font-size: 2rem; line-height: 1; }
.w-score span { color: #e8a100; letter-spacing: 1px; }
.w-score small { color: var(--muted); }
.w-dist { display: grid; gap: 4px; }
.w-dist span { display: grid; grid-template-columns: 12px 1fr; gap: 8px; align-items: center; }
.w-dist small { color: var(--muted); font-size: .72rem; }
.w-dist i { height: 6px; border-radius: 4px; background: #ece9f6; overflow: hidden; }
.w-dist u { display: block; height: 100%; background: #e8a100; border-radius: 4px; }
.w-q { align-self: flex-start; max-width: 85%; padding: 8px 12px; border-radius: 14px 14px 14px 4px; background: var(--brand); color: #fff; }
.w-a { align-self: flex-end; max-width: 92%; padding: 9px 12px; border-radius: 14px 14px 4px 14px; background: #fff; border: 1px solid var(--line); line-height: 1.45; }
.w-a svg { color: #c0398f; vertical-align: -2px; }
@media (min-width: 1100px) { .why-rail .v2-rail { justify-content: center; } .why-rail .v2-rail-nav { display: none; } }

/* video */
.v2-video-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 50px; align-items: center; }
.v2-video-row h2 { margin: 0; font-size: clamp(1.9rem, 4vw, 2.8rem); line-height: 1.12; }
.v2-video-row ul { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 12px; color: #c9c6dc; font-size: 1.08rem; }
.v2-video-row li { display: flex; gap: 10px; align-items: center; }
.v2-video-row li svg { color: var(--yellow); flex: none; }
.v2-video { border-radius: 22px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; box-shadow: 0 40px 80px -40px rgba(0, 0, 0, .8); }
.v2-video video { width: 100%; height: 100%; object-fit: cover; display: block; }

/* how it works: three steps; each small screen plays once it scrolls into view */
.v2-steps { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 44px; }
.v2-steps::before { content: ''; position: absolute; top: 31px; right: 8%; left: 8%; height: 2px; background: var(--line); }
.v2-steps::after { content: ''; position: absolute; top: 31px; right: 8%; width: 0; height: 2px; background: var(--brand); transition: width 2.4s ease .2s; }
.v2-steps.in::after { width: 84%; }
.v2-step { position: relative; display: flex; flex-direction: column; }
.v2-step-top { display: flex; align-items: center; gap: 12px; }
.v2-step-ic { position: relative; z-index: 1; width: 62px; height: 62px; border-radius: 18px; display: grid; place-items: center; background: #fff; border: 1px solid var(--line); color: var(--brand); box-shadow: 0 8px 18px -12px rgba(23, 18, 58, .4); transition: background .4s, color .4s, border-color .4s; }
.v2-steps.in .v2-step:nth-child(1) .v2-step-ic { transition-delay: .2s; }
.v2-steps.in .v2-step:nth-child(2) .v2-step-ic { transition-delay: 1.2s; }
.v2-steps.in .v2-step:nth-child(3) .v2-step-ic { transition-delay: 2.4s; }
.v2-steps.in .v2-step-ic { background: var(--brand); border-color: var(--brand); color: #fff; }
.v2-step-n { position: relative; z-index: 1; padding: 3px 10px; border-radius: 999px; background: #fff; border: 1px solid var(--line); font-size: .78rem; font-weight: 700; color: var(--muted); }
.v2-step h3 { margin: 18px 0 0; font-size: 1.22rem; }
.v2-step p { margin: 6px 0 0; color: var(--muted); font-size: .96rem; }
.v2-step-art { margin-top: 18px; padding: 16px; min-height: 150px; border-radius: 16px; background: #faf9ff; border: 1px solid var(--line); font-size: .86rem; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
/* swaps: s-off shows first, s-on after the step's delay */
.v2-step .s-on { display: none; }
.s-connect { position: relative; }
.s-gbtn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; border-radius: 10px; background: #fff; border: 1px solid var(--line); font-weight: 700; }
.s-gbtn.s-on { background: #ecfdf3; border-color: #abefc6; color: #067647; }
.s-sub { text-align: center; color: var(--muted); font-size: .8rem; }
.s-checks, .s-todo { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
.s-checks li { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 8px; padding: 7px 10px; background: #fff; border: 1px solid var(--line); border-radius: 10px; }
.s-checks em { font-style: normal; font-weight: 700; color: var(--ink); opacity: 0; }
.s-spin { grid-row: 1; grid-column: 1; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #d9d3ff; border-top-color: var(--brand); animation: s-rot .8s linear infinite; }
.s-done { grid-row: 1; grid-column: 1; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: #12a150; color: #fff; opacity: 0; transform: scale(.4); }
.s-checks li span { grid-column: 2; }
.s-todo li { display: flex; align-items: center; gap: 9px; padding: 8px 10px; background: #fff; border: 1px solid var(--line); border-radius: 10px; }
.s-todo i { width: 18px; height: 18px; border-radius: 6px; border: 2px solid #cfc8ee; display: grid; place-items: center; color: transparent; flex: none; }
.s-score { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: .8rem; }
.s-score b { font-family: var(--font-head); color: var(--brand); font-size: 1.1rem; }
@keyframes s-rot { to { transform: rotate(360deg); } }
@keyframes s-pop { to { opacity: 1; transform: none; } }
@keyframes s-hide { to { opacity: 0; visibility: hidden; } }
@keyframes s-show { to { opacity: 1; } }
@keyframes s-tick { to { background: var(--brand); border-color: var(--brand); color: #fff; } }
@keyframes s-strike { to { color: var(--muted); text-decoration: line-through; } }
.v2-steps.in .s-checks li .s-spin { animation: s-rot .8s linear infinite, s-hide .01s forwards var(--d); }
.v2-steps.in .s-checks li .s-done { animation: s-pop .3s forwards var(--d); }
.v2-steps.in .s-checks li em { animation: s-show .3s forwards var(--d); }
.v2-steps.in .s-todo li i { animation: s-tick .25s forwards var(--d); }
.v2-steps.in .s-todo li span { animation: s-strike .25s forwards var(--d); }
.v2-steps.done .s-off { display: none; }
.v2-steps.done .s-on { display: inline-flex; }
.v2-steps.done .s-sub .s-on, .v2-steps.done .s-score .s-on { display: inline; }
@media (max-width: 860px) {
  .v2-steps { grid-template-columns: minmax(0, 1fr); gap: 34px; margin-top: 30px; }
  .v2-steps::before { top: 30px; bottom: 30px; right: 30px; left: auto; width: 2px; height: auto; }
  .v2-steps::after { top: 30px; right: 30px; width: 2px; height: 0; transition: height 2.4s ease .2s; }
  .v2-steps.in::after { width: 2px; height: calc(100% - 60px); }
  .v2-step { padding-right: 78px; }
  .v2-step-top { position: absolute; top: 0; right: 0; }
  .v2-step-n { display: none; }
  .v2-step h3 { margin-top: 2px; }
  .v2-step-ic { width: 60px; height: 60px; }
}
@media (prefers-reduced-motion: reduce) { .v2-steps::after { transition: none; } .s-spin { display: none; } .s-done, .s-checks em { opacity: 1; transform: none; } }

/* plans: the recommended one is a dark, premium card */
.v2-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 380px)); justify-content: center; gap: 22px; margin-top: 44px; }
.v2-plan { position: relative; background: #fff; border-radius: 22px; padding: 34px 30px; border: 1px solid var(--line); display: flex; flex-direction: column; }
.v2-plan.best { border: 0; color: #fff; background: radial-gradient(420px 260px at 85% 0%, rgba(124, 92, 255, .55), transparent 70%), linear-gradient(165deg, #1b1546 0%, #0e0b26 100%); box-shadow: 0 34px 60px -32px rgba(30, 15, 110, .8); }
.v2-plan.best .v2-branch, .v2-plan.best .v2-price small { color: #b9b3e0; }
.v2-plan.best li svg { color: var(--yellow); }
.v2-plan.best .v2-btn { background: var(--yellow); border-color: var(--yellow); color: #1c1650; }
.v2-plan.best .v2-btn:hover { background: #ffdb5c; }
.v2-plan li { border-top: 1px solid rgba(127, 127, 160, .16); padding-top: 10px; }
.v2-plan li:first-child { border-top: 0; padding-top: 0; }
.v2-badge { position: absolute; top: 22px; inset-inline-end: 24px; background: var(--yellow); color: #1c1650; font-size: .8rem; font-weight: 700; padding: 4px 12px; border-radius: 980px; }
.v2-plan h3 { margin: 0; font-size: 1.45rem; }
.v2-price { margin: 10px 0 0; font-size: 2.8rem; font-weight: 800; letter-spacing: -.02em; }
.v2-price small { font-size: 1rem; font-weight: 400; color: var(--muted); letter-spacing: 0; }
.v2-branch { margin: 2px 0 0; color: var(--muted); font-size: .92rem; }
.v2-plan ul { list-style: none; padding: 0; margin: 20px 0 24px; display: grid; gap: 10px; }
.v2-plan li { display: flex; gap: 8px; align-items: flex-start; font-size: .96rem; }
.v2-plan li svg { color: var(--brand); flex: none; margin-top: 3px; }
.v2-plan .v2-btn { margin-top: auto; }
.v2-small { text-align: center; color: var(--muted); font-size: .9rem; margin: 26px auto 0; max-width: 70ch; }

/* questions */
.v2-faq { max-width: 820px; margin: 36px auto 0; }
.v2-faq details { background: #fff; border-radius: 18px; padding: 18px 22px; margin-bottom: 10px; }
.v2-faq summary { cursor: pointer; font-size: 1.08rem; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.v2-faq summary::-webkit-details-marker { display: none; }
.v2-faq summary::after { content: "+"; flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #f1edff; color: var(--brand); font-size: 1.2rem; }
.v2-faq details[open] summary::after { content: "–"; }
.v2-faq p { color: var(--muted); margin: 12px 0 0; }

.v2-final { padding: 100px 0; text-align: center; background: linear-gradient(160deg, #1c1650, #2c1f86); color: #fff; }
.v2-final h2 { margin: 0 auto; max-width: 20ch; font-size: clamp(1.9rem, 4.6vw, 3rem); line-height: 1.12; }
.v2-final p { color: #cfc9f2; margin: 14px 0 0; }
.v2-final .v2-btn.ghost { color: #fff; border-color: rgba(255, 255, 255, .5); }
.v2-final .v2-btn.ghost:hover { background: rgba(255, 255, 255, .1); }

@media (max-width: 860px) {
  .v2-menu { display: none; }
  .v2-sec { padding: 70px 0; }
  .v2-plans, .v2-video-row { grid-template-columns: minmax(0, 1fr); }
  /* the video section: centered on a phone */
  .v2-video-row { text-align: center; gap: 30px; }
  .v2-video-row ul { justify-items: center; }
  .v2-video-row li { justify-content: center; }
  /* on a phone: the phone screen, big enough to read, with the notes around it */
  .v2-card { width: 84vw; border-radius: 24px; }
  .v2-card-img { padding: 16px 0 0 16px; }
  /* a phone shows the top of the screen at a readable size, with tap-to-open for the whole */
  .v2-card-img img { width: 175%; max-width: none; aspect-ratio: auto; height: 230px; object-fit: cover; object-position: top right; border-radius: 10px 0 0 0; }
  .v2-rail-wrap.many .v2-dots { display: none; }
  .v2-rail-wrap.many .v2-count { display: inline-block; }
  .v2-card-text { padding: 16px 18px 20px; }
  .v2-card h3 { font-size: 1.18rem; }
  .v2-plans { gap: 26px; }
  .v2-plan { padding: 28px 22px; border-radius: 24px; }
  .v2-plan.best { order: -1; }
  .v2-price { font-size: 2.4rem; }
}
@media (prefers-reduced-motion: reduce) { .v2-rail { scroll-behavior: auto; } }

/* the site's own forms and the branches section, inside this page */
.v2-cycle { display: flex; justify-content: center; margin: 26px 0 0; }
.v2-cycle-in { display: inline-flex; padding: 4px; border-radius: 980px; background: #fff; border: 1px solid var(--line); }
.v2-cycle button { border: 0; background: none; font: inherit; font-weight: 700; font-size: .95rem; padding: 8px 20px; border-radius: 980px; color: var(--muted); cursor: pointer; }
.v2-cycle button[aria-pressed="true"] { background: var(--night); color: #fff; }
.v2-cycle button em { font-style: normal; color: #12955c; font-size: .8rem; margin-inline-start: 4px; }
.v2-cycle button[aria-pressed="true"] em { color: var(--yellow); }
.v2-agency { max-width: 760px; margin: 30px auto 0; }
.v2-netlink { max-width: 760px; margin: 26px auto 0; }
.v2-main .lp-talk-box { max-width: 640px; margin: 34px auto 0; text-align: center; }
.v2-final .lp-talk-box { color: #fff; }
.v2-final .lp-talk-box small, .v2-final .lp-talk-box small a { color: #cfc9f2; }

/* ============================================================ the bento world, on the landing page */
:root { --ease-out: cubic-bezier(.23, 1, .32, 1); --page: #f5f3fb; --card-sh: 0 1px 2px rgba(23, 18, 58, .05), 0 22px 50px -34px rgba(40, 20, 120, .45); }
body.v2-page { background: var(--page); }
::selection { background: rgba(91, 61, 245, .18); color: #17123a; }
.v2-main :focus-visible { outline: 3px solid rgba(91, 61, 245, .45); outline-offset: 3px; border-radius: 12px; }
.v2-main { caret-color: var(--brand); }
.v2-sec { padding: 88px 0; }
.v2-sec.soft { background: transparent; }
.v2-head h2 { font-weight: 600; letter-spacing: -.02em; color: #17123a; }
.lx-anchor { position: relative; top: -80px; }

/* buttons: pills that answer the press */
.lx-btns { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.lx-btn, .v2-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 26px; border-radius: 999px; font-weight: 700; font-size: 1.02rem; border: 1.5px solid transparent; transition: transform 160ms var(--ease-out), background-color 200ms ease, box-shadow 200ms ease; }
.lx-btn:active, .v2-btn:active, .lx-pill:active { transform: scale(.97); }
.lx-btn.night { background: #17123a; color: #fff !important; box-shadow: 0 14px 28px -14px rgba(23, 18, 58, .75); }
.lx-btn.night:hover { background: #2a2170; text-decoration: none; }
.lx-btn.ghost { background: #fff; color: #17123a !important; border-color: #e4e0f2; }
.lx-btn.ghost:hover { border-color: #c9bfff; text-decoration: none; }

/* hero: the words, and the dashboard itself built as a bento beside them */
.lx-hero { position: relative; padding: 72px 0 40px; background: radial-gradient(800px 520px at 8% 10%, rgba(139, 109, 255, .16), transparent 62%), radial-gradient(700px 420px at 95% 0%, rgba(255, 210, 63, .14), transparent 60%); overflow: hidden; }
.lx-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 56px; align-items: center; }
.lx-hero h1 { margin: 0; font-size: clamp(2.3rem, 4.6vw, 4rem); line-height: 1.05; font-weight: 600; letter-spacing: -.03em; color: #17123a; max-width: 15ch; }
.lx-hero h1 em { font-style: normal; color: var(--brand); }
.lx-lead { margin: 22px 0 0; max-width: 46ch; font-size: clamp(1.05rem, 1.6vw, 1.22rem); line-height: 1.6; color: #4d4870; }
.lx-trust { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; margin-top: 26px; font-size: .9rem; color: #6b6787; font-weight: 600; }
.lx-trust span, .lx-trust a { display: inline-flex; align-items: center; gap: 8px; }
.lx-trust a { color: #17123a; }
.lx-trust a svg { width: 26px; height: 26px; padding: 7px; border-radius: 50%; background: #ffd23f; color: #17123a; box-sizing: border-box; }

.lx-bento { position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
.lx-tile { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border-radius: 22px; background: #fff; box-shadow: var(--card-sh); color: #17123a; animation: lx-in 900ms var(--ease-out) both; animation-delay: calc(var(--i) * 70ms + 120ms); }
.lx-tile small { color: #6b6787; font-size: .8rem; font-weight: 600; }
.lx-tile b { font-family: 'Rubik', 'Assistant', sans-serif; font-weight: 600; font-size: 2.1rem; line-height: 1; letter-spacing: -.03em; }
.lx-tile b span { font-size: .55em; color: #f5b400; margin-inline-start: 3px; }
.lx-tile em { align-self: flex-start; font-style: normal; font-size: .74rem; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: #f0eef7; color: #6b6787; }
.lx-tile em.up { background: #dcf6e8; color: #0f8a52; }
.lx-k { grid-column: span 3; }
.lx-accent { grid-column: span 2; grid-row: span 2; justify-content: space-between; color: #1c1650; background: radial-gradient(220px 180px at 0% 0%, rgba(255, 255, 255, .6), transparent 70%), linear-gradient(160deg, #ffd96a, #ffbd1a); box-shadow: 0 26px 46px -26px rgba(214, 150, 0, .8); }
.lx-accent small { color: #6a4c00; }
.lx-accent b { font-size: 4rem; margin-top: auto; }
.lx-pill { align-self: flex-start; white-space: nowrap; padding: 8px 14px; border-radius: 999px; background: #fff; font-weight: 700; font-size: .84rem; box-shadow: 0 8px 16px -10px rgba(120, 80, 0, .6); transition: transform 160ms var(--ease-out); }
.lx-gauge, .lx-mapt { grid-column: span 4; }
.lx-gauge-row, .lx-map-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.lx-gauge-row b { font-size: 2.8rem; }
.lx-gauge-svg { width: 150px; height: auto; }
.lx-arc { animation: lx-arc 1400ms var(--ease-out) both 500ms; }
.lx-needle { transform-origin: 100px 100px; transform: rotate(var(--deg)); animation: lx-needle 1400ms var(--ease-out) both 500ms; }
.lx-grid { display: grid; grid-template-columns: repeat(3, 26px); gap: 5px; }
.lx-grid i { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: .72rem; font-weight: 800; color: #fff; background: #16a36a; }
.lx-grid i.m { background: #f5a524; }
.lx-grid i.me { box-shadow: 0 0 0 3px #fff, 0 0 0 5px rgba(91, 61, 245, .4); }
.lx-map-row span { display: flex; flex-direction: column; align-items: flex-end; color: #6b6787; font-size: .82rem; font-weight: 600; }
.lx-map-row span b small { font-size: .5em; color: #6b6787; }
.lx-ai { grid-column: span 6; flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.lx-ai ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.lx-ai li { padding: 6px 12px; border-radius: 999px; font-size: .8rem; font-weight: 700; background: #dcf6e8; color: #0f8a52; }
.lx-ai li::before { content: '✓ '; }
.lx-ai li.n { background: #f2f0f8; color: #8a85a6; }
.lx-ai li.n::before { content: '— '; }
.lx-sample { grid-column: span 6; margin: 2px 0 0; text-align: center; font-size: .76rem; color: #8a85a6; }
@keyframes lx-in { from { opacity: 0; transform: translateY(14px) scale(.98); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes lx-arc { from { stroke-dashoffset: var(--len); } }
@keyframes lx-needle { from { transform: rotate(-90deg); } }

/* why: one large tile and two beside it */
.lx-whys { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); grid-template-rows: auto auto; gap: 14px; margin-top: 44px; }
.lx-why { display: flex; flex-direction: column; border-radius: 26px; background: #fff; box-shadow: var(--card-sh); overflow: hidden; }
.lx-why-1 { grid-row: span 2; }
.lx-why-art { flex: 1; min-height: 170px; padding: 22px; display: flex; flex-direction: column; justify-content: center; gap: 10px; background: linear-gradient(160deg, #f7f5ff, #fbfaff); }
.lx-why-1 .lx-why-art { padding: 30px; justify-content: space-between; min-height: 340px; background:
  linear-gradient(118deg, transparent 47%, rgba(255, 255, 255, .95) 47% 49.5%, transparent 49.5%),
  linear-gradient(28deg, transparent 63%, rgba(255, 255, 255, .95) 63% 65%, transparent 65%),
  linear-gradient(0deg, transparent 34%, rgba(255, 255, 255, .9) 34% 36%, transparent 36%),
  linear-gradient(90deg, transparent 22%, rgba(255, 255, 255, .9) 22% 23.5%, transparent 23.5%),
  radial-gradient(180px 120px at 18% 30%, #d4f0de, transparent 70%),
  radial-gradient(220px 140px at 88% 90%, #dbe8fb, transparent 70%),
  #edeef4; }
.lx-why-1 .w-search { box-shadow: var(--card-sh); border: 0; }
.lx-why-1 .w-pack { padding: 10px; border-radius: 20px; background: #fff; box-shadow: 0 30px 50px -30px rgba(23, 18, 58, .45); }
.lx-why-text { padding: 22px 24px 26px; }
.lx-why h3 { margin: 0; font-size: 1.35rem; font-weight: 600; letter-spacing: -.01em; }
.lx-why-1 h3 { font-size: 1.7rem; }
.lx-why p { margin: 8px 0 0; color: #5b5680; line-height: 1.6; max-width: 52ch; }

/* tools close-ups and the rest, in the same skin */
.v2-tab { transition: background-color 200ms ease, color 200ms ease, transform 160ms var(--ease-out); }
.v2-tab:active { transform: scale(.97); }
.v2-panels { box-shadow: var(--card-sh) !important; border: 0 !important; }
.lx-video-sec { padding-top: 0; }
.lx-night { border-radius: 34px; padding: 56px; color: #f5f5f7; background: radial-gradient(700px 400px at 0% 0%, rgba(139, 109, 255, .35), transparent 65%), linear-gradient(160deg, #120d33, #1c1650 60%, #241b6b); box-shadow: 0 40px 80px -50px rgba(23, 18, 58, .9); }
.lx-night h2 { color: #fff; }
.v2-step-art { background: #fff; border: 0; box-shadow: var(--card-sh); }
.v2-step-ic { border: 0; box-shadow: var(--card-sh); }
.v2-plan { border: 0; border-radius: 28px; box-shadow: var(--card-sh); }
.v2-plan:not(.best) { border-top: 0; }
.v2-faq details { box-shadow: var(--card-sh); transition: box-shadow 200ms ease; }
.v2-main .net-band { background: transparent; border: 0; }
.v2-main .net-split { padding: 48px; border-radius: 34px; background: #fff; box-shadow: var(--card-sh); }
.v2-main .net-mock { border: 0; box-shadow: var(--card-sh); background: #faf9ff; }
.v2-main .lp-agency, .v2-main .pricing-network { border-radius: 22px; }
.v2-final { padding: 0 0 96px; background: transparent; }
.lx-final-card { text-align: center; padding: 80px 56px; }
.lx-final-card p { color: #cfc9f2; }
.v2-final .v2-btn.yellow { background: #ffd23f; border-color: #ffd23f; color: #1c1650; }
.v2-final .v2-btn.ghost { color: #fff; border-color: rgba(255, 255, 255, .4); background: transparent; }

@media (hover: hover) and (pointer: fine) {
  .lx-tile { transition: transform 300ms var(--ease-out), box-shadow 300ms ease; }
  .lx-tile:hover { transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .lx-tile, .lx-arc, .lx-needle { animation: none; }
  .lx-tile { animation: lx-fade 300ms ease both; }
}
@keyframes lx-fade { from { opacity: 0; } }

@media (max-width: 980px) {
  .lx-hero { padding: 44px 0 24px; }
  .lx-hero-grid { grid-template-columns: minmax(0, 1fr); gap: 36px; }
  .lx-hero-text { text-align: center; }
  .lx-hero h1 { margin-inline: auto; }
  .lx-lead { margin-inline: auto; }
  .lx-btns, .lx-trust { justify-content: center; }
  .lx-whys { grid-template-columns: minmax(0, 1fr); }
  .lx-why-1 { grid-row: auto; }
}
@media (max-width: 760px) {
  .v2-sec { padding: 64px 0; }
  .v2-panels { background: #fff; border-radius: 26px; padding: 12px 12px 22px; }
  .lx-hero h1 { font-size: clamp(2rem, 9vw, 2.6rem); }
  .lx-btns { flex-direction: column; align-items: stretch; }
  .lx-bento { gap: 10px; }
  .lx-tile { padding: 14px; border-radius: 18px; }
  .lx-tile b { font-size: 1.7rem; }
  .lx-accent b { font-size: 3rem; }
  .lx-accent { grid-column: span 6; grid-row: auto; display: grid; grid-template-columns: 1fr auto; grid-template-areas: "s n" "p n"; align-items: center; row-gap: 10px; }
  .lx-accent small { grid-area: s; }
  .lx-accent .lx-pill { grid-area: p; justify-self: start; }
  .lx-accent b { grid-area: n; margin: 0; }
  .lx-gauge, .lx-mapt { grid-column: span 6; }
  .lx-gauge-svg { width: 120px; }
  .lx-gauge-row b { font-size: 2.2rem; }
  .lx-grid { grid-template-columns: repeat(3, 22px); }
  .lx-grid i { width: 22px; height: 22px; font-size: .64rem; }
  .lx-night { padding: 32px 20px; border-radius: 26px; }
  .lx-final-card { padding: 48px 20px; }
  .v2-main .net-split { padding: 24px 18px; border-radius: 26px; }
}
</style>`,
    body: `<div class="v2-main">

<header class="lx-hero">
  <div class="v2-wrap lx-hero-grid">
    <div class="lx-hero-text">
      <h1>מנהלים את <em>גוגל מיי ביזנס</em> של העסק, ומקבלים יותר לקוחות מגוגל וגם מה-AI</h1>
      <p class="lx-lead">GoFive מתחברת לפרופיל העסק בגוגל ומראה בדשבורד אחד את הביקורות, הצפיות והשיחות, את המיקום במפות ואם ה-AI ממליץ עליכם. ובכל שבוע: מה לעשות כדי לעלות.</p>
      <div class="lx-btns"><a class="lx-btn night" href="${start}">${h(startLabel)}</a><a class="lx-btn ghost" href="#tools">איך זה נראה מבפנים</a></div>
      <div class="lx-trust"><span>${G_MARK}בנויה על Google Business Profile</span><a href="#video">${PLAY}צפו בסרטון · 36 שניות</a></div>
    </div>
    <div class="lx-bento" role="img" aria-label="הדשבורד של ${h(op.brand)} על עסק לדוגמה: דירוג 4.6, 56 ביקורות שמחכות לתשובה, ציון קידום 44 ומיקום במפות">
      <div class="lx-tile lx-k" style="--i:0"><small>דירוג בגוגל</small><b>4.6<span>★</span></b><em>905 ביקורות</em></div>
      <div class="lx-tile lx-k" style="--i:1"><small>פניות מגוגל</small><b>1,439</b><em class="up" dir="ltr">+12%</em></div>
      <div class="lx-tile lx-accent" style="--i:2"><small>מחכים לתשובה</small><b>56</b><span class="lx-pill">לענות עכשיו</span></div>
      <div class="lx-tile lx-gauge" style="--i:3"><small>ציון קידום</small><div class="lx-gauge-row"><b>44</b>${gauge(44)}</div></div>
      <div class="lx-tile lx-mapt" style="--i:4"><small>מיקום בגוגל מפות</small><div class="lx-map-row"><div class="lx-grid">${[3, 3, 1, 4, 2, 1, 3, 3, 1].map((r, i) => `<i class="${r <= 3 ? 'g' : 'm'}${i === 4 ? ' me' : ''}">${r}</i>`).join('')}</div><span><b>8<small>/9</small></b>בטופ 3</span></div></div>
      <div class="lx-tile lx-ai" style="--i:5"><small>נראות ב-AI</small><ul>${[['ChatGPT', 1], ['Gemini', 1], ['Perplexity', 0], ['Claude', 1]].map(([n, y]) => `<li class="${y ? 'y' : 'n'}">${n}</li>`).join('')}</ul></div>
      <p class="lx-sample">ביסטרו הגפן · עסק לדוגמה</p>
    </div>
  </div>
</header>


<section class="v2-sec soft" id="why">
  <div class="v2-wrap v2-head"><h2>הפרופיל בגוגל הוא חלון הראווה של העסק</h2><p>לפני שלקוח מתקשר, מגיע או מזמין, הוא רואה את הפרופיל שלכם בגוגל. שם הוא מחליט.</p></div>
  <div class="v2-wrap"><div class="lx-whys">${why.join('')}</div></div>
</section>

<div id="features" class="lx-anchor"></div>
<section class="v2-sec" id="tools">
  <div class="v2-wrap v2-head"><h2>הכלים, מקרוב</h2><p>במקום להיכנס לגוגל מיי ביזנס כל יום ולנחש, מערכת אחת שרואה את כל התמונה ואומרת מה לעשות.</p></div>
  <div class="v2-wrap" id="screens">
    <div class="v2-tabs" role="tablist" aria-label="הכלים">${tabs.join('')}</div>
    <div class="v2-panels">${panels.join('')}</div>
  </div>
</section>

<section class="v2-sec lx-video-sec" id="video">
  <div class="v2-wrap"><div class="lx-night v2-video-row">
    <div>
      <h2>ככה עסקים נמצאים בגוגל וב-AI</h2>
      <ul>
        <li>${icon('check', 18)}קישור, QR ווואטסאפ שמביאים ביקורות</li>
        <li>${icon('check', 18)}לקוח לא מרוצה מגיע אליכם, לא לגוגל</li>
        <li>${icon('check', 18)}תשובות לביקורות בלחיצה</li>
        <li>${icon('check', 18)}נראות בגוגל וב-AI, במסך אחד</li>
      </ul>
    </div>
    <div class="v2-video"><video controls playsinline preload="none" poster="${asset('media/gofive-intro.jpg')}" aria-label="סרטון הכרות עם ${h(op.brand)}"><source src="${asset('media/gofive-intro.mp4')}" type="video/mp4"></video></div>
  </div></div>
</section>

<section class="v2-sec" id="how">
  <div class="v2-wrap v2-head"><h2>איך זה עובד</h2><p>מתחילים בכמה דקות, והמערכת ממשיכה לבד.</p></div>
  <div class="v2-wrap"><div class="v2-steps">${steps.join('')}</div></div>
</section>

<section class="v2-sec soft" id="pricing">
  <div class="v2-wrap">
    <div class="v2-head"><h2>מחירים פשוטים, בלי הפתעות</h2><p>מחיר לפרופיל אחד בגוגל, ו-20% הנחה על כל סניף נוסף. בלי דמי הקמה, בלי התחייבות, מבטלים בכל רגע.</p></div>
    <div class="v2-cycle" role="group" aria-label="תקופת תשלום"><div class="v2-cycle-in"><button type="button" data-set="monthly" aria-pressed="true">חודשי</button><button type="button" data-set="annual" aria-pressed="false">שנתי<em>חודשיים מתנה</em></button></div></div>
    <div class="v2-plans">
      ${plan(PLANS.basic, ['דשבורד גוגל מיי ביזנס: ביקורות, צפיות, שיחות ומה חיפשו', 'התראה על כל ביקורת, ותשובה עם טיוטת AI בסגנון שלכם', 'קידום במפות: תוכנית שבועית ובריאות הפרופיל', `מיקום במפות: ${PLANS.basic.rankKeywords} חיפושים · ${PLANS.basic.competitors} מתחרים`, 'QR, סקרים ובקשות דירוג בוואטסאפ'])}
      ${plan(PLANS.pro, ['כל מה שבמסלול גוגל', `מיקום במפות: ${PLANS.pro.rankKeywords} חיפושים · ${PLANS.pro.competitors} מתחרים`, 'נראות ב-ChatGPT, Gemini, Perplexity ו-Claude', 'תוכנית פעולה ו"על מי ממליצים במקומכם"'], true)}
    </div>
    <a class="pricing-network v2-netlink" href="#network"><span class="pn-ic">◆</span><span><b>כמה סניפים? 20% הנחה על כל סניף נוסף</b><small>וכל כלי הרשת כלולים: השוואה בין הסניפים, מנהל לכל סניף, תבניות תשובה משותפות, דוח חודשי מאוחד וחשבונית אחת.</small></span></a>
    <p class="v2-small">המחירים כוללים מע״מ · בתשלום שנתי משלמים על 10 חודשים ומקבלים 12 · מבטלים בכל רגע, והמסלול נשאר פעיל עד סוף התקופה ששולמה · סוכנות או רשת גדולה? <a href="#contact">נבנה הצעת מחיר</a></p>
    <details class="lp-agency v2-agency" id="contact"${contactSent || contactError ? ' open' : ''}>
      <summary><span><b>סוכנות, או רשת עם עשרות סניפים?</b> נבנה לכם הצעת מחיר.</span><i>להשארת פרטים</i></summary>
      ${contactSent ? '<div class="flash contact-done">תודה! קיבלנו את הפרטים ונחזור אליכם בקרוב.</div>' : contactForm(contactError, contactValues)}
    </details>
  </div>
</section>

${networkSection()}

<section class="v2-sec soft" id="faq" style="padding-top:0">
  <div class="v2-wrap">
    <div class="v2-head"><h2>כל מה שרציתם לשאול</h2><p>על גוגל מיי ביזנס, על החיבור, על ה-AI ועל המחירים.</p></div>
    <div class="v2-faq">${faq.map(([q, a]) => `<details><summary>${h(q)}</summary><p>${h(a)}</p></details>`).join('')}</div>
  </div>
</section>

<section class="v2-final">
  <div class="v2-wrap"><div class="lx-night lx-final-card">
    <h2>הפרופיל שלכם בגוגל יכול להביא הרבה יותר לקוחות</h2>
    <p>מחברים את גוגל מיי ביזנס תוך דקה ורואים את כל הנתונים. בלי התחייבות, מבטלים בכל רגע.</p>
    <div class="v2-btns"><a class="v2-btn yellow" href="${start}">${h(startLabel)}</a><a class="v2-btn ghost" href="#talk">לדבר איתנו</a></div>
    <div class="lp-talk-box" id="talk">
      <b>מעדיפים לדבר עם מישהו?</b><span>השאירו שם וטלפון ונחזור אליכם עוד היום.</span>
      ${talkForm(talkSent, talkError, talkError ? contactValues : {})}
      ${talkSent ? '' : '<small>הפרטים ישמשו כדי לחזור אליכם, ולעדכונים רק אם סימנתם. <a href="/privacy">מדיניות הפרטיות</a></small>'}
    </div>
  </div></div>
</section>

<script>
// Close-ups: tabs (and the shelf's links) choose the tool shown.
(function () {
  var tabs = [].slice.call(document.querySelectorAll('.v2-tab'));
  if (!tabs.length) return;
  function pick(t, focus) {
    tabs.forEach(function (x) { var on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
    if (focus) t.focus();
    t.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(t); });
    t.addEventListener('keydown', function (e) { var n = tabs.length, j = null; if (e.key === 'ArrowLeft') j = (i + 1) % n; else if (e.key === 'ArrowRight') j = (i - 1 + n) % n; if (j !== null) { e.preventDefault(); pick(tabs[j], true); } });
  });
  document.querySelectorAll('.v2-tool').forEach(function (a) {
    a.addEventListener('click', function (e) { var t = document.getElementById('tab-' + a.getAttribute('href').slice(3)); if (!t) return; e.preventDefault(); pick(t); document.getElementById('tools').scrollIntoView({ behavior: 'smooth' }); });
  });
})();
// A screenshot opens whole, in a light box.
(function () {
  var box = document.createElement('dialog'); box.className = 'v2-box';
  box.innerHTML = '<button type="button" aria-label="סגירה">✕</button><img alt="">';
  document.body.appendChild(box);
  var bi = box.querySelector('img');
  box.querySelector('button').onclick = function () { box.close(); };
  box.addEventListener('click', function (e) { if (e.target === box) box.close(); });
  document.querySelectorAll('[data-zoom]').forEach(function (z) {
    z.addEventListener('click', function () { var im = z.querySelector('img'); bi.src = im.currentSrc || im.src; bi.alt = im.alt; if (box.showModal) box.showModal(); else window.open(bi.src); });
  });
})();
// Prices: monthly or annual.
(function () {
  var bs = document.querySelectorAll('.v2-cycle button');
  bs.forEach(function (b) { b.addEventListener('click', function () {
    var c = b.getAttribute('data-set');
    bs.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    document.querySelectorAll('#pricing [data-cycle]').forEach(function (el) { el.hidden = el.getAttribute('data-cycle') !== c; });
  }); });
})();
// How it works: plays once when it scrolls into view.
(function () {
  var st = document.querySelector('.v2-steps');
  if (!st) return;
  var play = function () { st.classList.add('in'); setTimeout(function () { st.classList.add('done'); }, 1600); };
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { st.classList.add('in', 'done'); return; }
  var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { play(); io.disconnect(); } }, { threshold: 0.3 });
  io.observe(st);
})();
// Sliders: arrows move a screen's worth, dots follow the scroll (right to left).
document.querySelectorAll('[data-rail]').forEach(function (w) {
  var r = w.querySelector('.v2-rail'), dots = w.querySelector('.v2-dots'), cards = r.children, prev = w.querySelector('[data-dir=prev]'), next = w.querySelector('[data-dir=next]');
  for (var i = 0; i < cards.length; i++) dots.appendChild(document.createElement('i'));
  var count = w.querySelector('.v2-count');
  if (cards.length > 5) w.classList.add('many');
  function at() { var step = cards[0].getBoundingClientRect().width + 20; return Math.round(Math.abs(r.scrollLeft) / step); }
  function sync() {
    var n = at(), max = r.scrollWidth - r.clientWidth - 2;
    [].forEach.call(dots.children, function (d, i) { d.className = i === Math.min(n, cards.length - 1) ? 'on' : ''; });
    count.textContent = Math.min(n, cards.length - 1) + 1 + ' / ' + cards.length;
    prev.disabled = Math.abs(r.scrollLeft) < 2; next.disabled = Math.abs(r.scrollLeft) >= max;
  }
  function go(dir) { r.scrollBy({ left: (dir === 'next' ? -1 : 1) * r.clientWidth * 0.85 }); }
  prev.addEventListener('click', function () { go('prev'); });
  next.addEventListener('click', function () { go('next'); });
  r.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
  window.addEventListener('resize', sync);
  sync();
});
</script>
</div>`,
  });
}
