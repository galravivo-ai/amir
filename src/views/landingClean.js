import { asset, h } from '../util.js';
import { branchPrice, payProvider, PLANS, TRIAL_DAYS } from '../plans.js';
import { icon, logoMark } from './icons.js';
import { operatorInfo } from './site.js';

// A trial version of the landing page in a store-like style: the tools shown
// like products, sliders that swipe on a phone, big type and plenty of white.
// The words are the current page's. Shown at /v2 only (not indexed), to compare.

const shot = (file) => asset(`media/guide/${file}`);

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

const rail = (id, cards, cls = '') => `<div class="v2-rail-wrap ${cls}" data-rail>
    <div class="v2-rail" id="${id}" tabindex="0">${cards.join('')}</div>
    <div class="v2-rail-nav"><button type="button" class="v2-arrow" data-dir="prev" aria-label="הקודם" aria-controls="${id}">‹</button><span class="v2-dots" aria-hidden="true"></span><button type="button" class="v2-arrow" data-dir="next" aria-label="הבא" aria-controls="${id}">›</button></div>
  </div>`;

export function landingCleanView({ signupOpen = true, trialOpen = false }) {
  const op = operatorInfo();
  const start = signupOpen ? '/register' : '/login';
  const startLabel = trialOpen ? `${TRIAL_DAYS} ימים חינם` : 'להתחיל עכשיו';
  const card = payProvider() === 'cardcom';

  const shelf = TOOLS.map(([key, ic, c, name]) => `<a class="v2-tool" href="#t-${key}" style="--c:${c}"><span class="v2-tool-ic">${icon(ic, 26)}</span><span>${h(name)}</span></a>`);
  const showcase = TOOLS.map(([key, ic, c, name, line, guide, img]) => `<article class="v2-card" id="t-${key}" style="--c:${c}">
      <div class="v2-card-text"><span class="v2-card-ic">${icon(ic, 20)}</span><h3>${h(name)}</h3><p>${h(line)}</p><a href="/guide/${guide}">למדריך ›</a></div>
      <div class="v2-card-img"><img src="${shot(img)}" alt="${h(name)}" width="1120" height="730" loading="lazy"></div>
    </article>`);
  const why = [
    ['pin', '#1d7fe0', 'חיפוש ומפות', 'שם לקוחות מוצאים אתכם', 'בחיפוש "ליד" ובגוגל מפות מוצגים קודם הפרופילים. מי שלמעלה מקבל את הלקוח.'],
    ['star', '#e8a100', 'ביקורות', 'ביקורות מכריעות', 'דירוג, כמות ומענה לביקורות: זה מה שלקוחות בודקים, וגם מה שגוגל שוקלת.'],
    ['spark', '#c0398f', 'עוזרי AI', 'גם ה-AI קורא אותו', 'ChatGPT וגוגל AI נשענים על פרופילים וביקורות כשהם ממליצים על עסק באזור.'],
  ].map(([ic, c, tag, title, text]) => `<article class="v2-why" style="--c:${c}"><span class="v2-why-ic">${icon(ic, 24)}</span><small>${h(tag)}</small><h3>${h(title)}</h3><p>${h(text)}</p></article>`);
  const steps = [
    ['1', 'מחברים את גוגל מיי ביזנס', 'עם חשבון הגוגל של העסק, או בהדבקת קישור לגוגל מפות.'],
    ['2', 'המערכת בודקת', 'פרופיל, מפות, מתחרים ו-AI. הכול רץ לבד, כל שבוע.'],
    ['3', 'עושים את מה שחשוב', 'תוכנית קצרה לכל שבוע כדי לעלות במפות, ותשובות שה-AI כבר ניסח.'],
  ].map(([n, title, text]) => `<article class="v2-step"><b>${n}</b><h3>${h(title)}</h3><p>${h(text)}</p></article>`);

  const plan = (p, items, best = false) => `<article class="v2-plan${best ? ' best' : ''}">
      ${best ? '<span class="v2-badge">הכי משתלם</span>' : ''}
      <h3>${h(p.label)}</h3>
      <p class="v2-price">₪${p.price}<small> לחודש</small></p>
      <p class="v2-branch">כל סניף נוסף ₪${branchPrice(p)} לחודש</p>
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

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${h(op.brand)} · ניהול גוגל מיי ביזנס, ביקורות ונראות ב-AI</title>
<link rel="icon" type="image/svg+xml" href="/static/brand/gofive-mark.svg">
<style>
:root { --ink: #1d1d1f; --muted: #6e6e73; --soft: #f5f5f7; --line: #d2d2d7; --brand: #4b2bd6; --brand-h: #3a1fb8; --yellow: #ffd23f; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #fff; color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Assistant", "Heebo", Arial, sans-serif; line-height: 1.47; -webkit-font-smoothing: antialiased; }
a { color: var(--brand); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; display: block; }
.v2-wrap { max-width: 1180px; margin: 0 auto; padding: 0 22px; }
.v2-head { text-align: center; max-width: 760px; margin: 0 auto; }
.v2-head h2 { margin: 0; font-size: clamp(1.9rem, 4.6vw, 3.2rem); line-height: 1.1; font-weight: 700; letter-spacing: -.01em; }
.v2-head p { margin: 14px auto 0; color: var(--muted); font-size: clamp(1.02rem, 1.9vw, 1.25rem); max-width: 46ch; }

/* bar */
.v2-nav { position: sticky; top: 0; z-index: 10; background: rgba(255, 255, 255, .8); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(0, 0, 0, .08); }
.v2-nav .v2-wrap { display: flex; align-items: center; justify-content: space-between; height: 54px; gap: 18px; }
.v2-brand { display: flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 700; font-size: 1.08rem; }
.v2-brand:hover { text-decoration: none; }
.v2-menu { display: flex; gap: 26px; font-size: .84rem; }
.v2-menu a { color: var(--ink); opacity: .78; }
.v2-menu a:hover { opacity: 1; text-decoration: none; }
.v2-nav .v2-cta { font-size: .84rem; padding: 7px 16px; border-radius: 980px; background: var(--brand); color: #fff; font-weight: 600; }
.v2-nav .v2-cta:hover { background: var(--brand-h); text-decoration: none; }

/* buttons */
.v2-btns { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 26px; }
.v2-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 26px; border-radius: 980px; background: var(--brand); color: #fff; font-weight: 600; font-size: 1.02rem; border: 1.5px solid var(--brand); }
.v2-btn:hover { background: var(--brand-h); border-color: var(--brand-h); text-decoration: none; }
.v2-btn.ghost { background: transparent; color: var(--brand); }
.v2-btn.ghost:hover { background: #f1edff; }
.v2-btn.yellow { background: var(--yellow); border-color: var(--yellow); color: #1c1650; }
.v2-btn.yellow:hover { background: #ffdb5c; }

/* hero */
.v2-hero { padding: 70px 0 0; text-align: center; overflow: hidden; background: radial-gradient(900px 420px at 50% 100%, #efeaff 0%, #fff 70%); }
.v2-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 980px; background: var(--soft); font-size: .86rem; font-weight: 600; color: var(--ink); }
.v2-hero h1 { margin: 18px auto 0; max-width: 18ch; font-size: clamp(2.3rem, 6vw, 4.4rem); line-height: 1.06; font-weight: 800; letter-spacing: -.02em; }
.v2-hero h1 em { font-style: normal; color: var(--brand); }
.v2-hero .v2-lead { margin: 18px auto 0; max-width: 46ch; color: var(--muted); font-size: clamp(1.05rem, 2vw, 1.3rem); }
.v2-watch { display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; font-weight: 600; }
.v2-watch i { width: 30px; height: 30px; border-radius: 50%; background: var(--brand); color: #fff; display: grid; place-items: center; font-style: normal; font-size: .75rem; }
.v2-hero-shot { margin: 48px auto 0; max-width: 1020px; padding: 0 22px; }
.v2-device { border-radius: 20px; padding: 10px; background: linear-gradient(180deg, #2b2b2e, #18181a); box-shadow: 0 50px 90px -45px rgba(40, 20, 120, .55); }
.v2-device img { border-radius: 11px; }
.v2-device-base { height: 14px; margin: 0 -4%; background: linear-gradient(180deg, #dcdce1, #b6b6bd); border-radius: 0 0 16px 16px; }

/* the shelf: every tool, like products in a shop */
.v2-shelf { padding: 54px 0 10px; }
.v2-shelf h2 { text-align: center; margin: 0 0 22px; font-size: 1.25rem; font-weight: 700; }
.v2-tools { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 22px 14px; justify-content: safe center; scrollbar-width: none; }
.v2-tools::-webkit-scrollbar { display: none; }
.v2-tool { flex: none; width: 118px; scroll-snap-align: start; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--ink); font-size: .86rem; font-weight: 600; line-height: 1.3; }
.v2-tool:hover { text-decoration: none; color: var(--c); }
.v2-tool-ic { width: 76px; height: 76px; border-radius: 22px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fff); transition: transform .15s; }
.v2-tool:hover .v2-tool-ic { transform: translateY(-3px); }

/* sections */
.v2-sec { padding: 96px 0; }
.v2-sec.soft { background: var(--soft); }
.v2-sec.dark { background: #0d0b1f; color: #f5f5f7; }
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

/* product cards */
.v2-card { width: min(86vw, 440px); border-radius: 28px; background: #fff; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0, 0, 0, .04), 0 20px 40px -24px rgba(0, 0, 0, .25); }
.v2-card-text { padding: 30px 28px 20px; }
.v2-card-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; background: var(--c); }
.v2-card h3 { margin: 16px 0 0; font-size: 1.5rem; line-height: 1.15; font-weight: 700; }
.v2-card p { margin: 10px 0 0; color: var(--muted); min-height: 4.4em; }
.v2-card-text a { display: inline-block; margin-top: 10px; font-weight: 600; }
.v2-card-img { margin-top: auto; padding: 0 0 0 28px; background: linear-gradient(180deg, #fff 0%, color-mix(in srgb, var(--c) 10%, #fff) 100%); }
.v2-card-img img { border-radius: 14px 0 0 0; box-shadow: 0 10px 30px -12px rgba(0, 0, 0, .3); aspect-ratio: 1120 / 730; object-fit: cover; object-position: top right; }

/* why cards */
.v2-why { width: min(80vw, 360px); border-radius: 24px; padding: 30px 26px; background: #fff; border-top: 4px solid var(--c); }
.v2-why-ic { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fff); }
.v2-why small { display: block; margin-top: 16px; color: var(--c); font-weight: 700; }
.v2-why h3 { margin: 4px 0 0; font-size: 1.35rem; }
.v2-why p { margin: 8px 0 0; color: var(--muted); }
@media (min-width: 1100px) { .why-rail .v2-rail { justify-content: center; } .why-rail .v2-rail-nav { display: none; } }

/* video */
.v2-video-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 50px; align-items: center; }
.v2-video-row h2 { margin: 0; font-size: clamp(1.9rem, 4vw, 2.8rem); line-height: 1.12; }
.v2-video-row ul { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 12px; color: #c9c6dc; font-size: 1.08rem; }
.v2-video-row li { display: flex; gap: 10px; align-items: center; }
.v2-video-row li svg { color: var(--yellow); flex: none; }
.v2-video { border-radius: 22px; overflow: hidden; background: #000; aspect-ratio: 16 / 9; box-shadow: 0 40px 80px -40px rgba(0, 0, 0, .8); }
.v2-video video { width: 100%; height: 100%; object-fit: cover; display: block; }

/* steps: three columns on a computer, a timeline on a phone */
.v2-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; margin-top: 44px; counter-reset: s; }
.v2-step { position: relative; border-radius: 24px; padding: 30px 26px; background: linear-gradient(180deg, #faf9ff, #f3f1fb); border: 1px solid #ebe8f7; }
.v2-step b { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, #6d4bff, #4b2bd6); color: #fff; font-size: 1.15rem; box-shadow: 0 10px 20px -10px rgba(75, 43, 214, .8); }
.v2-step h3 { margin: 18px 0 0; font-size: 1.25rem; }
.v2-step p { margin: 8px 0 0; color: var(--muted); }
@media (max-width: 860px) {
  .v2-steps { grid-template-columns: minmax(0, 1fr); gap: 0; margin-top: 30px; }
  .v2-step { background: none; border: 0; border-radius: 0; padding: 0 64px 30px 0; }
  .v2-step b { position: absolute; top: 0; right: 0; width: 42px; height: 42px; font-size: 1.05rem; }
  .v2-step:not(:last-child)::after { content: ''; position: absolute; top: 48px; bottom: 6px; right: 20px; width: 2px; background: linear-gradient(180deg, #c9bdff, #ebe8f7); }
  .v2-step h3 { margin: 6px 0 0; font-size: 1.15rem; }
}

/* plans: the recommended one is a dark, premium card */
.v2-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 380px)); justify-content: center; gap: 22px; margin-top: 44px; }
.v2-plan { position: relative; background: #fff; border-radius: 28px; padding: 34px 30px; border: 1px solid var(--line); display: flex; flex-direction: column; }
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
.v2-foot { background: var(--soft); color: var(--muted); font-size: .8rem; padding: 22px 0 34px; border-top: 1px solid var(--line); }
.v2-foot .v2-wrap { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.v2-foot a { color: var(--muted); margin-inline-start: 18px; }

@media (max-width: 860px) {
  .v2-menu { display: none; }
  .v2-hero { padding-top: 46px; }
  .v2-sec { padding: 70px 0; }
  .v2-plans, .v2-video-row { grid-template-columns: minmax(0, 1fr); }
  .v2-device { padding: 6px; border-radius: 13px; }
  .v2-tools { justify-content: flex-start; }
  .v2-card { width: 84vw; border-radius: 24px; }
  .v2-card-text { padding: 22px 20px 16px; }
  .v2-card h3 { font-size: 1.22rem; margin-top: 12px; }
  .v2-card p { font-size: .95rem; min-height: 0; }
  .v2-card-img { padding: 0 0 0 20px; }
  .v2-plans { gap: 26px; }
  .v2-plan { padding: 28px 22px; border-radius: 24px; }
  .v2-plan.best { order: -1; }
  .v2-price { font-size: 2.4rem; }
}
@media (prefers-reduced-motion: reduce) { .v2-rail { scroll-behavior: auto; } }
</style>
</head>
<body>
<nav class="v2-nav" aria-label="ראשי">
  <div class="v2-wrap">
    <a class="v2-brand" href="/v2">${logoMark(28)}<span>${h(op.brand)}</span></a>
    <div class="v2-menu"><a href="#tools">הכלים</a><a href="#how">איך זה עובד</a><a href="#pricing">מחירים</a><a href="#faq">שאלות נפוצות</a><a href="/guide">מדריכים</a><a href="/login">כניסה</a></div>
    <a class="v2-cta" href="${start}">${h(startLabel)}</a>
  </div>
</nav>

<header class="v2-hero">
  <div class="v2-wrap">
    <span class="v2-eyebrow">${icon('star', 16)} בנויה על Google Business Profile</span>
    <h1>מנהלים את <em>גוגל מיי ביזנס</em> של העסק, ומקבלים יותר לקוחות מגוגל וגם מה-AI</h1>
    <p class="v2-lead">GoFive מתחברת לפרופיל העסק בגוגל ומראה בדשבורד אחד את הביקורות, הצפיות והשיחות, את המיקום במפות ואם ה-AI ממליץ עליכם. ובכל שבוע: מה לעשות כדי לעלות.</p>
    <div class="v2-btns"><a class="v2-btn" href="${start}">${h(startLabel)}</a><a class="v2-btn ghost" href="#tools">איך זה נראה מבפנים</a></div>
    <a class="v2-watch" href="#video"><i>▶</i>צפו בסרטון (36 שניות)</a>
  </div>
  <div class="v2-hero-shot">
    <div class="v2-device"><img src="${shot('dashboard.jpg')}" alt="הדשבורד של ${h(op.brand)}" width="1120" height="730" fetchpriority="high"></div>
    <div class="v2-device-base" aria-hidden="true"></div>
  </div>
</header>

<section class="v2-shelf" aria-label="הכלים">
  <h2>כל מה שצריך כדי שהפרופיל בגוגל יעבוד בשבילכם</h2>
  <div class="v2-tools">${shelf.join('')}</div>
</section>

<section class="v2-sec soft" id="why">
  <div class="v2-wrap v2-head"><h2>הפרופיל בגוגל הוא חלון הראווה של העסק</h2><p>לפני שלקוח מתקשר, מגיע או מזמין, הוא רואה את הפרופיל שלכם בגוגל. שם הוא מחליט.</p></div>
  ${rail('why-rail', why, 'why-rail')}
</section>

<section class="v2-sec" id="tools">
  <div class="v2-wrap v2-head"><h2>הכלים, מקרוב</h2><p>במקום להיכנס לגוגל מיי ביזנס כל יום ולנחש, מערכת אחת שרואה את כל התמונה ואומרת מה לעשות.</p></div>
  ${rail('tools-rail', showcase)}
</section>

<section class="v2-sec dark" id="video">
  <div class="v2-wrap v2-video-row">
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
  </div>
</section>

<section class="v2-sec" id="how">
  <div class="v2-wrap v2-head"><h2>איך זה עובד</h2><p>מתחילים בכמה דקות, והמערכת ממשיכה לבד.</p></div>
  <div class="v2-wrap"><div class="v2-steps">${steps.join('')}</div></div>
</section>

<section class="v2-sec soft" id="pricing">
  <div class="v2-wrap">
    <div class="v2-head"><h2>מחירים פשוטים, בלי הפתעות</h2><p>מחיר לפרופיל אחד בגוגל, ו-20% הנחה על כל סניף נוסף. בלי דמי הקמה, בלי התחייבות, מבטלים בכל רגע.</p></div>
    <div class="v2-plans">
      ${plan(PLANS.basic, ['דשבורד גוגל מיי ביזנס: ביקורות, צפיות, שיחות ומה חיפשו', 'התראה על כל ביקורת, ותשובה עם טיוטת AI בסגנון שלכם', 'קידום במפות: תוכנית שבועית ובריאות הפרופיל', `מיקום במפות: ${PLANS.basic.rankKeywords} חיפושים · ${PLANS.basic.competitors} מתחרים`, 'QR, סקרים ובקשות דירוג בוואטסאפ'])}
      ${plan(PLANS.pro, ['כל מה שבמסלול גוגל', `מיקום במפות: ${PLANS.pro.rankKeywords} חיפושים · ${PLANS.pro.competitors} מתחרים`, 'נראות ב-ChatGPT, Gemini, Perplexity ו-Claude', 'תוכנית פעולה ו"על מי ממליצים במקומכם"'], true)}
    </div>
    <p class="v2-small">המחירים כוללים מע״מ · בתשלום שנתי משלמים על 10 חודשים ומקבלים 12 · מבטלים בכל רגע, והמסלול נשאר פעיל עד סוף התקופה ששולמה · סוכנות או רשת גדולה? <a href="/#contact">נבנה הצעת מחיר</a></p>
  </div>
</section>

<section class="v2-sec soft" id="faq" style="padding-top:0">
  <div class="v2-wrap">
    <div class="v2-head"><h2>כל מה שרציתם לשאול</h2><p>על גוגל מיי ביזנס, על החיבור, על ה-AI ועל המחירים.</p></div>
    <div class="v2-faq">${faq.map(([q, a]) => `<details><summary>${h(q)}</summary><p>${h(a)}</p></details>`).join('')}</div>
  </div>
</section>

<section class="v2-final">
  <div class="v2-wrap">
    <h2>הפרופיל שלכם בגוגל יכול להביא הרבה יותר לקוחות</h2>
    <p>מחברים את גוגל מיי ביזנס תוך דקה ורואים את כל הנתונים. בלי התחייבות, מבטלים בכל רגע.</p>
    <div class="v2-btns"><a class="v2-btn yellow" href="${start}">${h(startLabel)}</a><a class="v2-btn ghost" href="/#talk">לדבר איתנו</a></div>
  </div>
</section>

<footer class="v2-foot">
  <div class="v2-wrap">
    <span>© ${new Date().getFullYear()} ${h(op.name)}</span>
    <span><a href="/guide">מדריכים</a><a href="/terms">תנאי שימוש</a><a href="/privacy">פרטיות</a><a href="/accessibility">נגישות</a><a href="/">הגרסה הנוכחית</a></span>
  </div>
</footer>
<script>
// Sliders: arrows move a screen's worth, dots follow the scroll (right to left).
document.querySelectorAll('[data-rail]').forEach(function (w) {
  var r = w.querySelector('.v2-rail'), dots = w.querySelector('.v2-dots'), cards = r.children, prev = w.querySelector('[data-dir=prev]'), next = w.querySelector('[data-dir=next]');
  for (var i = 0; i < cards.length; i++) dots.appendChild(document.createElement('i'));
  function at() { var step = cards[0].getBoundingClientRect().width + 20; return Math.round(Math.abs(r.scrollLeft) / step); }
  function sync() {
    var n = at(), max = r.scrollWidth - r.clientWidth - 2;
    [].forEach.call(dots.children, function (d, i) { d.className = i === Math.min(n, cards.length - 1) ? 'on' : ''; });
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
</body>
</html>`;
}
