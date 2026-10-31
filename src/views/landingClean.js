import { asset, h } from '../util.js';
import { branchPrice, PLANS, TRIAL_DAYS } from '../plans.js';
import { logoMark } from './icons.js';
import { operatorInfo } from './site.js';

// A trial version of the landing page in a quiet, product-first style: big type,
// lots of white, one large screenshot per section, few words. Shown at /v2 only
// (not indexed), next to the current page, to compare.

const shot = (file) => asset(`media/guide/${file}`);

const section = ({ id, tone = '', kicker, title, text, link, image, alt, narrow = false }) => `
<section class="v2-sec ${tone}" id="${id}">
  <div class="v2-wrap v2-center">
    ${kicker ? `<p class="v2-kicker">${h(kicker)}</p>` : ''}
    <h2>${title}</h2>
    <p class="v2-lead">${h(text)}</p>
    ${link ? `<p class="v2-links"><a href="${h(link[1])}">${h(link[0])} ›</a></p>` : ''}
    <figure class="v2-shot${narrow ? ' narrow' : ''}"><img src="${shot(image)}" alt="${h(alt)}" width="1120" height="730" loading="lazy"></figure>
  </div>
</section>`;

export function landingCleanView({ signupOpen = true, trialOpen = false }) {
  const op = operatorInfo();
  const start = signupOpen ? '/register' : '/login';
  const startLabel = trialOpen ? `${TRIAL_DAYS} ימים חינם` : 'להתחיל';
  const plan = (p, note) => `<div class="v2-plan">
      <h3>${h(p.label)}</h3>
      <p class="v2-price">₪${p.price}<small> לחודש</small></p>
      <p class="v2-note">${h(note)}</p>
      <p class="v2-branch">כל סניף נוסף ₪${branchPrice(p)}</p>
      <a class="v2-btn" href="${start}">${h(startLabel)}</a>
    </div>`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${h(op.brand)} · גוגל מיי ביזנס, בשליטה מלאה</title>
<link rel="icon" type="image/svg+xml" href="/static/brand/gofive-mark.svg">
<style>
:root { --ink: #1d1d1f; --muted: #6e6e73; --soft: #f5f5f7; --line: #d2d2d7; --blue: #4b2bd6; --blue-h: #3a1fb8; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #fff; color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Assistant", "Heebo", Arial, sans-serif; line-height: 1.47; -webkit-font-smoothing: antialiased; }
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; display: block; }
.v2-wrap { max-width: 1080px; margin: 0 auto; padding: 0 22px; }
.v2-center { text-align: center; }

/* the bar: thin, translucent, quiet */
.v2-nav { position: sticky; top: 0; z-index: 10; background: rgba(255, 255, 255, .78); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid rgba(0, 0, 0, .08); }
.v2-nav .v2-wrap { display: flex; align-items: center; justify-content: space-between; height: 52px; gap: 18px; }
.v2-brand { display: flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 600; font-size: 1.05rem; }
.v2-brand:hover { text-decoration: none; }
.v2-menu { display: flex; gap: 26px; font-size: .82rem; }
.v2-menu a { color: var(--ink); opacity: .8; }
.v2-menu a:hover { opacity: 1; text-decoration: none; }
.v2-nav .v2-cta { font-size: .8rem; padding: 6px 14px; border-radius: 980px; background: var(--blue); color: #fff; }
.v2-nav .v2-cta:hover { background: var(--blue-h); text-decoration: none; }

/* the hero: one line, one sentence, two links, the product */
.v2-hero { padding: 72px 0 0; text-align: center; overflow: hidden; }
.v2-hero h1 { margin: 0; font-size: clamp(2.6rem, 7vw, 5rem); line-height: 1.05; font-weight: 700; letter-spacing: -.015em; }
.v2-hero .v2-lead { font-size: clamp(1.2rem, 2.4vw, 1.6rem); color: var(--ink); margin: 14px auto 0; max-width: 34ch; font-weight: 400; }
.v2-links { margin: 20px 0 0; display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; font-size: 1.12rem; }
.v2-hero-shot { margin: 54px auto 0; max-width: 1000px; padding: 0 22px; }
.v2-device { border-radius: 18px; padding: 10px; background: linear-gradient(180deg, #2b2b2e, #1a1a1c); box-shadow: 0 40px 80px -40px rgba(0, 0, 0, .45); }
.v2-device img { border-radius: 10px; }
.v2-device-base { height: 14px; margin: 0 -4%; background: linear-gradient(180deg, #d9d9de, #b8b8bf); border-radius: 0 0 16px 16px; }

/* sections: centered headline, one line, one big image; white and soft gray in turn */
.v2-sec { padding: 110px 0 0; overflow: hidden; }
.v2-sec.soft { background: var(--soft); }
.v2-kicker { margin: 0 0 8px; color: var(--blue); font-weight: 600; font-size: 1.05rem; }
.v2-sec h2 { margin: 0; font-size: clamp(2rem, 5vw, 3.5rem); line-height: 1.08; font-weight: 700; letter-spacing: -.01em; }
.v2-sec .v2-lead { margin: 16px auto 0; max-width: 40ch; color: var(--muted); font-size: clamp(1.05rem, 2vw, 1.3rem); }
.v2-shot { margin: 50px auto 0; max-width: 960px; }
.v2-shot.narrow { max-width: 360px; padding-bottom: 90px; }
.v2-shot.narrow img { border-radius: 22px !important; }
.v2-shot img { border-radius: 18px 18px 0 0; box-shadow: 0 -2px 0 rgba(0, 0, 0, .03), 0 30px 60px -30px rgba(0, 0, 0, .25); }

/* a pair of tiles */
.v2-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px 0 0; }
.v2-tile { background: var(--soft); border-radius: 28px; padding: 46px 34px 0; text-align: center; overflow: hidden; display: flex; flex-direction: column; }
.v2-tile h3 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.2rem); line-height: 1.12; font-weight: 700; }
.v2-tile p { margin: 10px auto 0; color: var(--muted); max-width: 30ch; }
.v2-tile img { margin-top: 30px; border-radius: 14px 14px 0 0; }
.v2-tile.dark { background: #000; color: #f5f5f7; }
.v2-tile.dark p { color: #a1a1a6; }

/* numbers: three facts, big */
.v2-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; padding: 90px 0; text-align: center; }
.v2-facts b { display: block; font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight: 700; letter-spacing: -.01em; }
.v2-facts span { color: var(--muted); }

/* plans */
.v2-plans { display: grid; grid-template-columns: repeat(2, minmax(0, 340px)); justify-content: center; gap: 22px; margin: 50px 0 0; }
.v2-plan { background: #fff; border-radius: 22px; padding: 34px 28px; text-align: center; border: 1px solid var(--line); }
.v2-plan h3 { margin: 0; font-size: 1.5rem; }
.v2-price { margin: 12px 0 0; font-size: 2.6rem; font-weight: 700; }
.v2-price small { font-size: 1rem; font-weight: 400; color: var(--muted); }
.v2-note { color: var(--muted); min-height: 3em; }
.v2-branch { font-size: .9rem; color: var(--muted); }
.v2-btn { display: inline-block; margin-top: 12px; padding: 11px 24px; border-radius: 980px; background: var(--blue); color: #fff; font-size: 1.02rem; }
.v2-btn:hover { background: var(--blue-h); text-decoration: none; }
.v2-small { color: var(--muted); font-size: .86rem; margin: 26px auto 0; max-width: 60ch; }

/* questions */
.v2-faq { max-width: 760px; margin: 40px auto 0; text-align: start; }
.v2-faq details { border-bottom: 1px solid var(--line); padding: 20px 0; }
.v2-faq summary { cursor: pointer; font-size: 1.15rem; font-weight: 600; list-style: none; display: flex; justify-content: space-between; gap: 16px; }
.v2-faq summary::-webkit-details-marker { display: none; }
.v2-faq summary::after { content: "+"; color: var(--blue); font-weight: 400; font-size: 1.4rem; line-height: 1; }
.v2-faq details[open] summary::after { content: "–"; }
.v2-faq p { color: var(--muted); margin: 12px 0 0; }

.v2-final { padding: 110px 0; text-align: center; }
.v2-final h2 { margin: 0; font-size: clamp(2rem, 5vw, 3.2rem); font-weight: 700; }
.v2-foot { background: var(--soft); color: var(--muted); font-size: .78rem; padding: 22px 0 34px; border-top: 1px solid var(--line); }
.v2-foot .v2-wrap { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.v2-foot a { color: var(--muted); margin-inline-start: 18px; }

@media (max-width: 760px) {
  .v2-menu { display: none; }
  .v2-hero { padding-top: 48px; }
  .v2-sec { padding-top: 76px; }
  .v2-tiles, .v2-plans, .v2-facts { grid-template-columns: minmax(0, 1fr); }
  .v2-tile { border-radius: 22px; padding: 36px 22px 0; }
  .v2-device { padding: 6px; border-radius: 12px; }
}
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>
</head>
<body>
<nav class="v2-nav" aria-label="ראשי">
  <div class="v2-wrap">
    <a class="v2-brand" href="/v2">${logoMark(26)}<span>${h(op.brand)}</span></a>
    <div class="v2-menu"><a href="#reviews">ביקורות</a><a href="#maps">מפות</a><a href="#ai">AI</a><a href="#pricing">מחירים</a><a href="/guide">מדריכים</a><a href="/login">כניסה</a></div>
    <a class="v2-cta" href="${start}">${h(startLabel)}</a>
  </div>
</nav>

<header class="v2-hero">
  <div class="v2-wrap">
    <h1>גוגל מיי ביזנס.<br>בשליטה מלאה.</h1>
    <p class="v2-lead">ביקורות, מפות ו-AI במקום אחד. ובכל שבוע, מה לעשות כדי לעלות.</p>
    <p class="v2-links"><a href="${start}">${h(startLabel)} ›</a><a href="#reviews">איך זה עובד ›</a></p>
  </div>
  <div class="v2-hero-shot">
    <div class="v2-device"><img src="${shot('dashboard.jpg')}" alt="הדשבורד של ${h(op.brand)}" width="1120" height="730" fetchpriority="high"></div>
    <div class="v2-device-base" aria-hidden="true"></div>
  </div>
</header>

${section({ id: 'reviews', kicker: 'ביקורות', title: 'כל ביקורת.<br>תשובה אחת בלחיצה.', text: 'התראה על כל ביקורת חדשה, וטיוטה של ה-AI בסגנון שלכם. נשאר רק לאשר.', link: ['עוד על ביקורות', '/guide/reviews'], image: 'reviews.jpg', alt: 'רשימת הביקורות בגוגל עם תשובות' })}

${section({ id: 'maps', tone: 'soft', kicker: 'קידום בגוגל מפות', title: 'יודעים מה לעשות.<br>רואים שעליתם.', text: 'תוכנית קצרה לכל שבוע, מהנתונים של העסק. בדיקה שבועית מראה איפה אתם במפות, בכל שכונה.', link: ['עוד על הקידום', '/guide/growth'], image: 'growth.jpg', alt: 'תוכנית הפעולה וציון הקידום' })}

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-tiles">
      <article class="v2-tile"><h3>מיקום במפות.</h3><p>איפה אתם מופיעים סביב העסק, מול המתחרים.</p><img src="${shot('rank.jpg')}" alt="מיקום בגוגל מפות סביב העסק" width="1120" height="730" loading="lazy"></article>
      <article class="v2-tile dark" id="ai"><h3>גם ב-AI.</h3><p>האם ChatGPT, Gemini וגוגל ממליצים עליכם, ומה לעשות כדי שכן.</p><img src="${shot('ai.jpg')}" alt="נראות בתשובות של עוזרי AI" width="1120" height="730" loading="lazy"></article>
    </div>
  </div>
</section>

${section({ id: 'more', kicker: 'עוד ביקורות', title: 'לבקש ביקורת.<br>בשתי לחיצות.', text: 'קישור אישי בוואטסאפ ושלט QR לשולחן. לקוח לא מרוצה מגיע קודם אליכם, לא לגוגל.', link: ['עוד על איסוף ביקורות', '/guide/qr'], image: 'poster.jpg', alt: 'שלט QR מעוצב לבקשת ביקורת', narrow: true })}

<section class="v2-sec soft" id="pricing">
  <div class="v2-wrap v2-center">
    <h2>פשוט.<br>בלי התחייבות.</h2>
    <p class="v2-lead">מחיר לפרופיל אחד בגוגל, וכל סניף נוסף ב-20% הנחה. כולל מע״מ.</p>
    <div class="v2-plans">
      ${plan(PLANS.basic, 'כל מה שצריך לגוגל מיי ביזנס ולגוגל מפות.')}
      ${plan(PLANS.pro, 'הכול, ובנוסף נראות ב-ChatGPT, Gemini, Perplexity ו-Claude.')}
    </div>
    <p class="v2-small">${trialOpen ? `${TRIAL_DAYS} ימים חינם להתחלה. ` : ''}מבטלים בכל רגע, והמסלול נשאר פעיל עד סוף התקופה ששולמה.</p>
    <div class="v2-facts" aria-label="בקצרה">
      <div><b>דקה</b><span>לחבר את הפרופיל בגוגל</span></div>
      <div><b>כל שבוע</b><span>בדיקה של מפות, פרופיל ו-AI</span></div>
      <div><b>עברית</b><span>מערכת, מיילים וטיוטות</span></div>
    </div>
  </div>
</section>

<section class="v2-sec" id="faq">
  <div class="v2-wrap v2-center">
    <h2>שאלות.</h2>
    <div class="v2-faq">
      <details><summary>צריך שיהיה לעסק פרופיל בגוגל?</summary><p>כן. אם עוד אין, פותחים בחינם ב-business.google.com, וציון הבריאות עוזר להשלים אותו.</p></details>
      <details><summary>מאיפה מגיעים הנתונים?</summary><p>ישירות מגוגל. מחברים פעם אחת את החשבון שמנהל את העסק, ו-18 החודשים האחרונים נטענים לבד.</p></details>
      <details><summary>מה קורה כשלקוח לא מרוצה?</summary><p>הוא משאיר לכם הודעה במקום ביקורת, ואתם מקבלים התראה מיד וחוזרים אליו.</p></details>
      <details><summary>יש לי כמה סניפים.</summary><p>כל סניף נוסף ב-20% הנחה, וכל הסניפים מנוהלים מחשבון אחד.</p></details>
      <details><summary>אפשר לבטל?</summary><p>כן, בכל רגע. המסלול נשאר פעיל עד סוף התקופה ששולמה.</p></details>
    </div>
  </div>
</section>

<section class="v2-final">
  <div class="v2-wrap">
    <h2>מתחילים היום.</h2>
    <p class="v2-links"><a href="${start}">${h(startLabel)} ›</a><a href="/#talk">לדבר איתנו ›</a></p>
  </div>
</section>

<footer class="v2-foot">
  <div class="v2-wrap">
    <span>© ${new Date().getFullYear()} ${h(op.name)}</span>
    <span><a href="/guide">מדריכים</a><a href="/terms">תנאי שימוש</a><a href="/privacy">פרטיות</a><a href="/accessibility">נגישות</a><a href="/">הגרסה הנוכחית</a></span>
  </div>
</footer>
</body>
</html>`;
}
