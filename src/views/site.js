import { PLANS, TRIAL_DAYS } from '../plans.js';
import { asset, h } from '../util.js';
import { icon, logoMark, wordmark } from './icons.js';
import { customOffer, pricingCards } from './pricing.js';
import { NETWORK_TOOLS } from './network.js';
import { CONNECT_COMPARE, CONNECT_GUIDE, FEATURE_GUIDES, GUIDE_GROUPS } from '../guide.js';

/** Who runs this installation, from env (shown in the footer, privacy and terms). */

/** Networks of branches: the tools a second profile opens, and the price per branch. */
function networkSection() {
  const rows = [
    ['סניף דיזנגוף', '4.8', 38, '100%', '1,240'],
    ['סניף רמת החייל', '4.6', 24, '92%', '860'],
    ['סניף חיפה', '4.3', 11, '64%', '410'],
  ];
  const max = 38;
  return `<section class="lp-band net-band" id="network">
  <div class="net-split">
    <div class="net-text">
      <span class="hero-pill"><b>לרשתות</b>כמה סניפים, חשבון אחד</span>
      <h2>כל הסניפים שלכם בגוגל, במסך אחד</h2>
      <p>יש לכם יותר מסניף אחד? מהפרופיל השני בגוגל, החשבון הופך לחשבון רשת. משלמים לפי מספר הפרופילים, וכל כלי הרשת כלולים בלי תוספת.</p>
      <ul class="net-lp-list">${NETWORK_TOOLS.map(([ic, t, d]) => `<li><span>${icon(ic, 18)}</span><div><b>${h(t)}</b><small>${h(d)}</small></div></li>`).join('')}</ul>
    </div>
    <div class="net-side">
      <div class="net-mock" aria-hidden="true">
        <div class="net-mock-head"><b>${icon('branches', 16)} רשת הסניפים</b><small>30 ימים</small></div>
        <div class="net-mock-stats"><span><b>4.6★</b><small>דירוג הרשת</small></span><span><b>73</b><small>ביקורות חדשות</small></span><span><b>2,510</b><small>שיחות</small></span></div>
        <div class="net-mock-rows">${rows
          .map(([n, r, c, rep, calls], i) => `<span class="${i === 2 ? 'warn' : ''}"><b>${n}</b><em>${r}★</em><i style="--w:${(c / max) * 100}%"></i><small>${c} ביקורות · מענה ${rep}</small></span>`)
          .join('')}</div>
        <div class="net-mock-alert">${icon('alert', 14)} סניף חיפה: 6 ביקורות מחכות לתשובה</div>
      </div>
    </div>
  </div>
</section>`;
}

export function operatorInfo() {
  return {
    name: process.env.OPERATOR_NAME || 'מפעיל המערכת',
    email: process.env.CONTACT_EMAIL || '',
    brand: process.env.BRAND_NAME || 'GoFive',
  };
}

/** The public address, for links that leave the site (share previews, the sitemap). */
export const publicBase = () => String(process.env.PUBLIC_URL || 'https://gofive.co.il').replace(/\/$/, '');

/** How a shared link looks on WhatsApp, Facebook, LinkedIn and X: title, text and the brand image. */
function shareMeta({ title, description, path }) {
  const base = publicBase();
  const image = `${base}/static/brand/og-image.jpg`;
  return `<meta property="og:type" content="website">
<meta property="og:site_name" content="${h(operatorInfo().brand)}">
<meta property="og:locale" content="he_IL">
<meta property="og:title" content="${h(title)}">
${description ? `<meta property="og:description" content="${h(description)}">` : ''}
${path ? `<meta property="og:url" content="${h(base + path)}"><link rel="canonical" href="${h(base + path)}">` : ''}
<meta property="og:image" content="${h(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${h(operatorInfo().brand)}: יותר לקוחות מגוגל וגם מה-AI">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h(title)}">
${description ? `<meta name="twitter:description" content="${h(description)}">` : ''}
<meta name="twitter:image" content="${h(image)}">`;
}

function sitePage({ title, description = '', body, signupOpen = true, path = '' }) {
  const op = operatorInfo();
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
${description ? `<meta name="description" content="${h(description)}">` : ''}
${shareMeta({ title, description, path })}
<link rel="stylesheet" href="${asset('style.css')}">
<link rel="icon" type="image/svg+xml" href="/static/brand/gofive-mark.svg">
<link rel="icon" type="image/png" href="/static/icons/favicon-32.png">
<link rel="manifest" href="/manifest.webmanifest">
<script src="${asset('assist.js')}"></script>
</head>
<body class="site">
<a class="skip-link" href="#main">דלג לתוכן</a>
<header class="site-head">
  <a class="brand" href="/">${logoMark(38)}${wordmark(op.brand)}</a>
  <button type="button" class="site-menu-btn" aria-label="תפריט" aria-expanded="false" aria-controls="site-nav"><span></span><span></span><span></span></button>
  <nav id="site-nav" aria-label="ניווט באתר">
    <a href="/#how">איך זה עובד</a>
    <a href="/#features">פיצ'רים</a>
    <a href="/#ai">נראות ב-AI</a>
    <a href="/#network">רשתות וסניפים</a>
    <a href="/#video">סרטון</a>
    <a href="/#screens">צילומי מסך</a>
    <a href="/#pricing">מחירים</a>
    <a href="/#faq">שאלות</a>
    <a class="nav-login" href="/login">כניסה לחשבון</a>
  </nav>
  <div class="site-cta">
    <a href="/login">כניסה לחשבון</a>
    ${signupOpen ? '<a class="btn primary" href="/register">פתיחת חשבון</a>' : ''}
  </div>
  <script>(function(){var hd=document.currentScript.parentNode,b=hd.querySelector('.site-menu-btn'),n=hd.querySelector('nav');
function t(o){hd.classList.toggle('menu-open',o);b.setAttribute('aria-expanded',String(o))}
b.addEventListener('click',function(){t(!hd.classList.contains('menu-open'))});
n.addEventListener('click',function(e){if(e.target.closest('a'))t(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&hd.classList.contains('menu-open')){t(false);b.focus()}})})();</script>
</header>
<div id="main">
${body}
</div>
<footer class="site-foot">
  <div>© ${new Date().getFullYear()} ${h(op.name)}</div>
  <nav>
    <a href="/guide">מדריכים</a>
    <a href="/terms">תנאי שימוש ותקנון</a>
    <a href="/privacy">מדיניות פרטיות</a>
    <a href="/cookies">מדיניות עוגיות</a>
    <a href="/accessibility">הצהרת נגישות</a>
    ${op.email ? `<a href="mailto:${h(op.email)}">צור קשר</a>` : ''}
  </nav>
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------- landing

const G_LOGO = '<svg class="lp-g" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/** The product, drawn in HTML: the main dashboard, with an AI score and an alert floating over it. */
function heroVisual() {
  const bars = [38, 52, 44, 61, 70, 58, 49, 66, 74, 63, 80, 72, 88, 95];
  const stat = (label, value, hint, up = true) =>
    `<span class="lp-mstat"><small>${label}</small><b>${value}</b><i class="${up ? 'up' : 'down'}">${hint}</i></span>`;
  return `<div class="lp-visual" aria-hidden="true">
    <div class="lp-browser">
      <div class="lp-browser-bar"><i></i><i></i><i></i><span>gofive.co.il/admin</span><em class="lp-linked">${G_LOGO} מחובר לגוגל מיי ביזנס ✓</em></div>
      <div class="lp-app">
        <div class="lp-app-side"><b></b><i class="on"></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="lp-app-main">
          <div class="lp-app-cover"><div><small>בוקר טוב, דנה</small><b>ביסטרו הגפן</b></div><span>30 ימים אחרונים ▾</span></div>
          <div class="lp-mstats">
            ${stat('דירוג בגוגל', '4.7★', '▲ 0.1')}
            ${stat('צפיות בפרופיל', '5,916', '▲ 12%')}
            ${stat('שיחות והגעה', '708', '▲ 8%')}
            ${stat('מיקום במפות', '2.5', '▲ 1.1')}
          </div>
          <div class="lp-mchart">
            <small>פעולות של לקוחות בפרופיל</small>
            <div class="lp-mbars">${bars.map((v) => `<i style="height:${v}%"><u style="height:${Math.round(v * 0.45)}%"></u></i>`).join('')}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="lp-float lp-float-ai">
      <span class="lp-ring" style="--p:62"><b>62</b></span>
      <span><small>נראות ב-AI</small><b>ממליצים עליכם</b><i class="up">▲ 21 נק׳ החודש</i></span>
    </div>
    <div class="lp-float lp-float-alert">
      <span class="lp-float-icon">★</span>
      <span><b>ביקורת חדשה 5★ בגוגל</b><small>"הפסטה הכי טובה בעיר"</small></span>
    </div>
  </div>`;
}

export const LEAD_KINDS = { agency: 'סוכנות / משווק', chain: 'רשת עם יותר מ-10 סניפים', other: 'אחר', callback: 'בקשה לשיחה מהאתר', support: 'פנייה לעזרה מתוך המערכת' };

function contactForm(error = '', v = {}) {
  const val = (k) => h(v[k] ?? '');
  return `<form method="post" action="/contact#contact" class="card contact-form">
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    <div class="grid2">
      <label>שם<input name="name" required maxlength="80" value="${val('name')}" autocomplete="name"></label>
      <label>טלפון<input name="phone" type="tel" maxlength="20" pattern="[0-9+\\(\\)\\s.\\-]{9,20}" title="מספר טלפון, למשל 050-1234567" inputmode="tel" value="${val('phone')}" autocomplete="tel" dir="ltr"></label>
      <label>אימייל<input name="email" type="email" maxlength="120" value="${val('email')}" autocomplete="email" dir="ltr"></label>
      <label>שם העסק או הסוכנות<input name="company" maxlength="100" value="${val('company')}" autocomplete="organization"></label>
      <label>מי אתם?<select name="kind">${Object.entries(LEAD_KINDS)
        .filter(([k]) => k !== 'callback')
        .map(([k, l]) => `<option value="${k}" ${v.kind === k ? 'selected' : ''}>${h(l)}</option>`)
        .join('')}</select></label>
      <label>כמה סניפים או לקוחות?<input name="size" maxlength="40" value="${val('size')}" placeholder="למשל: 25"></label>
    </div>
    <label>משהו נוסף? (לא חובה)<textarea name="message" rows="3" maxlength="1000">${val('message')}</textarea></label>
    <label class="check"><input type="checkbox" name="marketing" value="1" ${v.marketing ? 'checked' : ''}><span>אשמח לקבל עדכונים, טיפים והטבות מ-GoFive בהודעות ובמייל (דברי פרסומת). אפשר להסיר בכל רגע.</span></label>
    <label class="hp" aria-hidden="true">אתר<input name="website" tabindex="-1" autocomplete="off"></label>
    <button class="btn primary">שליחה</button>
    <p class="muted small">צריך טלפון או אימייל כדי שנוכל לחזור אליכם. הפרטים ישמשו למענה לפנייה, ולעדכונים רק אם סימנתם, ואין חובה חוקית למסור אותם. <a href="/privacy">מדיניות הפרטיות</a></p>
  </form>`;
}

/** The short "we'll call you" form at the end of the landing page. */
function talkForm(sent, error = '', v = {}) {
  if (sent) return '<div class="lp-talk-done">תודה! קיבלנו את הפרטים ונחזור אליכם בקרוב.</div>';
  const val = (k) => h(v[k] ?? '');
  return `<form method="post" action="/contact#talk" class="lp-talk">
    <input type="hidden" name="kind" value="callback"><input type="hidden" name="from" value="talk">
    <input name="name" required maxlength="80" placeholder="שם" aria-label="שם" value="${val('name')}" autocomplete="name">
    <input name="phone" type="tel" required maxlength="20" pattern="[0-9+\\(\\)\\s.\\-]{9,20}" title="מספר טלפון, למשל 050-1234567" inputmode="tel" placeholder="טלפון" aria-label="טלפון" value="${val('phone')}" autocomplete="tel">
    <label class="hp" aria-hidden="true">אתר<input name="website" tabindex="-1" autocomplete="off"></label>
    <button class="btn lp-cta">חזרו אליי</button>
    <label class="check lp-talk-mk"><input type="checkbox" name="marketing" value="1" ${v.marketing ? 'checked' : ''}><span>אשמח לקבל עדכונים, טיפים והטבות מ-GoFive בהודעות ובמייל (דברי פרסומת). אפשר להסיר בכל רגע.</span></label>
    ${error ? `<p class="lp-talk-error">${h(error)}</p>` : ''}
  </form>`;
}

/** The screenshots on the landing page (from public/media/guide). */
const SCREENS = [
  ['dashboard', 'דשבורד', 'כל העסק במסך אחד: דירוג, ביקורות, צפיות, שיחות ומיקום במפות.'],
  ['reviews', 'ביקורות', 'כל הביקורות מגוגל ומהסקרים במקום אחד, עם תשובה מוכנה בלחיצה.'],
  ['rank', 'מיקום במפות', 'איפה אתם מופיעים בגוגל מפות בכל שכונה, מול המתחרים.'],
  ['ai', 'נראות ב-AI', 'האם ChatGPT, Gemini וגוגל ממליצים עליכם, ומה לעשות כדי שכן.'],
  ['health', 'בריאות הפרופיל', 'ציון לפרופיל בגוגל ורשימת תיקונים לפי סדר חשיבות.'],
  ['report', 'דוח חודשי', 'דוח מסודר בכל חודש, להדפסה או לשליחה.'],
];

export function landingView({ signupOpen, trialOpen = false, contactSent = false, contactError = '', contactValues = {}, talkSent = false, talkError = '' }) {
  const faq = [
    [
      'מה זה גוגל מיי ביזנס?',
      'גוגל מיי ביזנס (היום נקרא Google Business Profile) הוא הפרופיל החינמי של העסק בגוגל: מה שמופיע בחיפוש ובגוגל מפות, עם הכתובת, השעות, התמונות, הביקורות וכפתורי ההתקשרות. GoFive מתחברת לפרופיל הזה ועוזרת לנהל ולקדם אותו.',
    ],
    [
      'צריך שיהיה לעסק פרופיל בגוגל?',
      'כן, GoFive עובדת על הפרופיל הקיים שלכם בגוגל מיי ביזנס. אם עוד אין לכם, פותחים אחד בחינם ב-business.google.com, ואנחנו נעזור לכם להשלים אותו בעזרת ציון הבריאות וההמלצות.',
    ],
    [
      'מה זה "נראות ב-AI"?',
      'יותר ויותר אנשים שואלים עוזר AI "איפה יש מסעדה טובה ליד…" במקום לחפש. GoFive שואלת את עוזרי ה-AI בכל שבוע את השאלות המקומיות שהלקוחות שלכם שואלים, מראה אם ממליצים עליכם ועל מי ממליצים במקומכם, ונותנת תוכנית פעולה כדי להופיע.',
    ],
    [
      'מאיפה מגיעים הנתונים של הצפיות והשיחות?',
      'ישירות מגוגל. מחברים פעם אחת את חשבון הגוגל שמנהל את העסק, ו-18 החודשים האחרונים נטענים לבד. ביקורות, דירוג, בריאות הפרופיל ומיקום במפות עובדים כבר מהרגע שמדביקים את הקישור לעסק.',
    ],
    [
      'מה קורה כשלקוח לא מרוצה?',
      'הוא לא מועבר לגוגל. במקום זה הוא משאיר לכם הודעה ופרטים, אתם מקבלים התראה מיד, וחוזרים אליו כדי לתקן. אחרי הטיפול נשאל אותו אם הבעיה נפתרה, ואם כן, נציע לו לשתף את החוויה בגוגל.',
    ],
    [
      'אפשר לראות את המערכת לפני שמשלמים?',
      `כן. ב<a href="#screens">צילומי המסך</a> רואים את כל המסכים של המערכת על עסק לדוגמה. ${
        trialOpen
          ? `ואפשר לנסות על העסק שלכם: ${TRIAL_DAYS} ימים חינם, ורק אם ממשיכים מחויבים בסוף. מבטלים בקליק לפני כן.`
          : 'כשמחליטים להתחיל, בוחרים מסלול, ותוך דקות רואים את הנתונים של העסק שלכם. בלי התחייבות: מבטלים בכל רגע.'
      } רוצים שנראה לכם? <a href="#talk">השאירו פרטים</a> ונחזור אליכם.`,
    ],
    [
      'יש לי כמה סניפים. כמה זה עולה?',
      'המחיר הוא לכל פרופיל בגוגל, כולל מע״מ. עסק עם שלושה סניפים משלם שלוש פעמים את מחיר המסלול, ומקבל את כל הפיצ\'רים בכל סניף: ביקורות, צפיות ושיחות, מיקום במפות ונראות ב-AI. כל הסניפים מנוהלים מחשבון אחד, וסניף שמוסיפים באמצע החודש מחויב רק מהחידוש הבא.',
    ],
    ['אפשר לבטל?', 'כן, בכל רגע. במסלול חודשי אין התחייבות, ובמסלול שנתי משלמים מראש על 10 חודשים ומקבלים 12.'],  ];
  const start = trialOpen ? `${TRIAL_DAYS} ימים חינם` : 'להתחיל עכשיו';
  const trial = signupOpen ? `<a class="btn lp-cta" href="/register">${start}</a>` : '<a class="btn lp-cta" href="/login">כניסה</a>';
  const engines = [
    ['Google', 'google'],
    ['Google Maps', 'googlemaps'],
    ['ChatGPT', 'chatgpt'],
    ['Gemini', 'gemini'],
    ['Perplexity', 'perplexity'],
    ['Claude', 'claude'],
    ['AI Overviews', 'google'],
  ];

  // The bento: each tile shows the feature itself, not just a sentence about it.
  const tile = (cls, ic, title, text, art = '') =>
    `<article class="lp-tile ${cls}"><div class="lp-tile-head"><span class="lp-tile-icon">${icon(ic, 20)}</span><h3>${h(title)}</h3></div><p>${h(text)}</p>${art}</article>`;
  const dashArt = `<div class="lp-art lp-dash-art">
    <div class="lp-dash-mini">${[['דירוג בגוגל', '4.7★', '▲ 0.1'], ['צפיות בפרופיל', '5,916', '▲ 12%'], ['שיחות והגעה', '708', '▲ 8%'], ['מיקום במפות', '2.5', '▲ 1.1']]
      .map(([l, v, d]) => `<span><small>${l}</small><b>${v}</b><i>${d}</i></span>`)
      .join('')}</div>
    <div class="lp-dash-chart">
      <div class="lp-dash-chart-head"><small>צפיות בפרופיל · 90 יום</small><em>▲ 34%</em></div>
      <svg viewBox="0 0 520 90" preserveAspectRatio="none" direction="ltr"><defs><linearGradient id="lpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f" stop-opacity=".45"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></linearGradient></defs>
        <polygon points="0,90 0.0,65.2 47.3,56.2 94.5,60.8 141.8,47.2 189.1,50.6 236.4,38.2 283.6,42.8 330.9,28.1 378.2,32.6 425.5,19.1 472.7,22.5 520.0,9.0 520,90" fill="url(#lpArea)"/><polyline points="0.0,65.2 47.3,56.2 94.5,60.8 141.8,47.2 189.1,50.6 236.4,38.2 283.6,42.8 330.9,28.1 378.2,32.6 425.5,19.1 472.7,22.5 520.0,9.0" fill="none" stroke="#ffd23f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    </div>
    <div class="lp-dash-kw"><small>מה חיפשו כשמצאו אתכם:</small>${['ביסטרו הגפן', 'מסעדה בדיזנגוף', 'פסטה טרייה', 'מסעדה רומנטית'].map((k) => `<span>${k}</span>`).join('')}</div>
  </div>`;
  const rankGrid = `<div class="lp-art lp-rank">${[3, 2, 4, 1, 1, 2, 5, 3, 7].map((n) => `<i class="r${n <= 3 ? 'g' : n <= 5 ? 'm' : 'b'}">${n}</i>`).join('')}</div>`;
  const review = `<div class="lp-art lp-review"><div class="lp-rv"><b>מיכל א.</b> <span>★★★★★</span><p>שירות מקסים, נחזור!</p></div>
    <div class="lp-rv lp-rv-reply"><small>${icon('spark', 12)} תשובה שה-AI ניסח</small><p>תודה מיכל! שמחנו לארח, מחכים לכם שוב 💜</p></div></div>`;
  const aiArt = `<div class="lp-art lp-ai-mini">${[['ChatGPT', 'yes'], ['Gemini', 'yes'], ['Perplexity', 'no'], ['Claude', 'yes']]
    .map(([n, s]) => `<span><b>${n}</b><i class="${s}">${s === 'yes' ? '✓ הוזכרתם' : '✗ לא'}</i></span>`)
    .join('')}</div>`;
  const rivals = `<div class="lp-art lp-bars">${[['אתם', 82, 'me'], ['ביסטרו 61', 64, ''], ['פסטה דה לוקה', 51, '']]
    .map(([n, v, c]) => `<span class="${c}"><b>${n}</b><i><u style="width:${v}%"></u></i></span>`)
    .join('')}</div>`;
  const health = `<div class="lp-art lp-health"><span class="lp-ring big" style="--p:84"><b>84</b></span><ul><li class="ok">שעות פתיחה</li><li class="ok">תמונות</li><li class="no">תיאור קצר מדי</li></ul></div>`;
  const alert = `<div class="lp-art lp-toast"><span>⚠</span><div><b>המיקום במפות ירד</b><small>"ביסטרו": מ-2.4 ל-3.6</small></div></div>`;
  const qr = `<div class="lp-art lp-qr"><span class="lp-qr-code">${'<i></i>'.repeat(9)}</span><span class="lp-wa">וואטסאפ ✓✓<small>נו, איך היה אצלנו?</small></span></div>`;

  return sitePage({
    title: `${operatorInfo().brand} · ניהול גוגל מיי ביזנס, ביקורות ונראות ב-AI`,
    description: 'מערכת לניהול פרופיל גוגל מיי ביזנס (Google Business Profile): ביקורות ותשובות AI, צפיות ושיחות מהפרופיל, מיקום בגוגל מפות, מתחרים, ונראות ב-ChatGPT, Gemini ו-Perplexity. תוכנית פעולה שבועית והתראות.',
    signupOpen,
    path: '/',
    body: `
<section class="lp-hero">
  <div class="lp-hero-glow" aria-hidden="true"></div>
  <div class="lp-hero-text">
    <span class="lp-pill lp-pill-g">${G_LOGO}<span>בנויה על <b class="lp-gbp">Google Business Profile</b></span></span>
    <h1>מנהלים את <em>גוגל מיי ביזנס</em> של העסק, ומקבלים יותר לקוחות מגוגל וגם מה-AI</h1>
    <p class="lp-lead">GoFive מתחברת לפרופיל העסק בגוגל ומראה בדשבורד אחד את הביקורות, הצפיות והשיחות, את המיקום במפות ואם ה-AI ממליץ עליכם. ובכל שבוע: מה לעשות כדי לעלות.</p>
    <div class="lp-actions">${trial}<a class="btn lp-ghost" href="#screens">${icon('search', 18)} איך זה נראה מבפנים</a></div>
    <a class="lp-watch" href="#video" onclick="var v=document.querySelector('#video video');if(v){setTimeout(function(){v.play()},500)}"><span class="lp-watch-play">▶</span><span><b>צפו בסרטון</b><small>GoFive ב-36 שניות</small></span></a>
    <div class="lp-checks">
      <span>${icon('check', 16)}בלי התחייבות</span>
      <span>${icon('check', 16)}בעברית מלאה</span>
      <span>${icon('check', 16)}עומד בכללי גוגל</span>
    </div>
  </div>
  ${heroVisual()}
</section>

<section class="lp-engines" aria-label="איפה אנחנו בודקים">
  <span class="lp-engines-label">מתחילים מהפרופיל בגוגל מיי ביזנס, ובודקים אתכם בכל מקום שלקוחות מחפשים</span>
  <div class="lp-engines-row">${engines.map(([name, logo]) => `<span class="lp-engine"><img src="${asset(`brands/${logo}.svg`)}" alt="" width="24" height="24" loading="lazy">${name}</span>`).join('')}</div>
</section>

<section class="lp-band lp-video-band" id="video">
  <div class="lp-video-wrap">
  <div class="lp-video-text">
    <span class="lp-kicker">GoFive ב-36 שניות</span>
    <h2>ככה עסקים נמצאים בגוגל וב-AI</h2>
    <ul>
      <li>קישור, QR ווואטסאפ שמביאים ביקורות</li>
      <li>לקוח לא מרוצה מגיע אליכם, לא לגוגל</li>
      <li>תשובות לביקורות בלחיצה</li>
      <li>נראות בגוגל וב-AI, במסך אחד</li>
    </ul>
  </div>
  <div class="lp-video">
    <video controls playsinline preload="none" poster="${asset('media/gofive-intro.jpg')}" aria-label="סרטון הכרות עם GoFive">
      <source src="${asset('media/gofive-intro.mp4')}" type="video/mp4">
    </video>
  </div>
  </div>
</section>

<section class="lp-band" id="why">
  <div class="lp-head">
    <span class="lp-kicker">למה דווקא גוגל מיי ביזנס</span>
    <h2>הפרופיל בגוגל הוא חלון הראווה של העסק</h2>
    <p>לפני שלקוח מתקשר, מגיע או מזמין, הוא רואה את הפרופיל שלכם בגוגל. שם הוא מחליט.</p>
  </div>
  <div class="lp-why">
    <article class="lp-why-card">
      <div class="lp-why-art lp-why-map" aria-hidden="true">
        <div class="lp-wsearch">${icon('search', 14)} מסעדה איטלקית לידי</div>
        <div class="lp-wpack">
          <span class="me"><i>A</i><b>ביסטרו הגפן</b><em>4.7 ★ (412)</em><u>פתוח</u></span>
          <span><i>B</i><b>פסטה דה לוקה</b><em>4.5 ★ (1.2K)</em><u>פתוח</u></span>
          <span><i>C</i><b>מסעדת הנמל</b><em>4.3 ★ (2.1K)</em><u>נסגר בקרוב</u></span>
        </div>
      </div>
      <div class="lp-why-body"><span class="lp-why-tag">${icon('pin', 15)} חיפוש ומפות</span>
        <h3>שם לקוחות מוצאים אתכם</h3>
        <p>בחיפוש "ליד" ובגוגל מפות מוצגים קודם הפרופילים. מי שלמעלה מקבל את הלקוח.</p></div>
    </article>
    <article class="lp-why-card">
      <div class="lp-why-art lp-why-reviews" aria-hidden="true">
        <div class="lp-wscore"><b>4.7</b><span>★★★★★</span><small>412 ביקורות</small></div>
        <div class="lp-wdist">${[[5, 78], [4, 14], [3, 4], [2, 2], [1, 2]].map(([n, v]) => `<span><small>${n}</small><i><u style="width:${v}%"></u></i></span>`).join('')}</div>
        <div class="lp-wreply">${icon('check', 13)} ענינו ל-96% מהביקורות</div>
      </div>
      <div class="lp-why-body"><span class="lp-why-tag">${icon('star', 15)} ביקורות</span>
        <h3>ביקורות מכריעות</h3>
        <p>דירוג, כמות ומענה לביקורות: זה מה שלקוחות בודקים, וגם מה שגוגל שוקלת.</p></div>
    </article>
    <article class="lp-why-card">
      <div class="lp-why-art lp-why-ai" aria-hidden="true">
        <div class="lp-wbubble user">איפה כדאי לאכול ליד דיזנגוף?</div>
        <div class="lp-wbubble bot">${icon('spark', 13)} אני ממליץ על <b>ביסטרו הגפן</b>: פסטה טרייה, דירוג 4.7 בגוגל ושירות מוערך.<span class="lp-wsrc">${G_LOGO} Google Maps</span></div>
      </div>
      <div class="lp-why-body"><span class="lp-why-tag">${icon('spark', 15)} עוזרי AI</span>
        <h3>גם ה-AI קורא אותו</h3>
        <p>ChatGPT וגוגל AI נשענים על פרופילים וביקורות כשהם ממליצים על עסק באזור.</p></div>
    </article>
  </div>

</section>

<section class="lp-band alt" id="features">
  <div class="lp-head">
    <span class="lp-kicker">הכול במקום אחד</span>
    <h2>כל מה שצריך כדי שהפרופיל בגוגל יעבוד בשבילכם</h2>
    <p>במקום להיכנס לגוגל מיי ביזנס כל יום ולנחש, מערכת אחת שרואה את כל התמונה ואומרת מה לעשות.</p>
  </div>
  <div class="lp-bento">
    ${tile('wide accent', 'chart', 'כל נתוני גוגל מיי ביזנס בדשבורד אחד', 'הדירוג, הביקורות, כמה ראו את הפרופיל, כמה התקשרו, ביקשו הגעה ונכנסו לאתר, ומה חיפשו כשמצאו אתכם.', dashArt)}
    ${tile('', 'star', 'ביקורות ותשובות AI', 'כל ביקורת חדשה מגיעה עם התראה, ותשובה מנוסחת שנשאר רק לאשר.', review)}
    ${tile('', 'pin', 'מיקום במפות', 'איפה אתם מופיעים בגוגל מפות מ-9 נקודות סביב העסק, כל שבוע.', rankGrid)}
    ${tile('', 'shield', 'בריאות הפרופיל', 'ציון לפרופיל הגוגל, מה חסר, ותיאור מוכן להדבקה.', health)}
    ${tile('', 'qr', 'עוד ביקורות בגוגל', 'שלט QR מעוצב ובקשת דירוג בוואטסאפ, גם אוטומטית אחרי כל ביקור.', qr)}
  </div>
  <div class="lp-more">
    <span>${icon('bell', 16)} התראה כשמשהו יורד</span>
    <span>${icon('check', 16)} 3 משימות בשבוע</span>
    <span>${icon('report', 16)} דוח חודשי</span>
    <span>${icon('chat', 16)} פוסטים עם AI</span>
    <a href="#network">${icon('branches', 16)} רשתות וסניפים</a>
  </div>
</section>

<section class="lp-band ai-band" id="ai">
  <div class="ai-split">
    <div class="ai-text">
      <span class="hero-pill"><b>חדש</b>נראות ב-AI</span>
      <h2>כשלקוח שואל את ChatGPT "איפה כדאי…", אתם בתשובה?</h2>
      <p>עוזרי AI הם גוגל החדש. הם עונים על שאלות מקומיות עם רשימה קצרה של עסקים, ומי שלא בה, לא קיים. GoFive בודקת את זה בשבילכם כל שבוע, ואומרת בדיוק מה לעשות.</p>
      <ul class="ai-list">
        <li>${icon('check', 18)}ChatGPT, Gemini, Perplexity, Claude וגוגל AI, בשאלות מקומיות</li>
        <li>${icon('check', 18)}על מי ממליצים במקומכם</li>
        <li>${icon('check', 18)}תוכנית פעולה אחרי כל בדיקה: איפה להופיע ומה להוסיף</li>
      </ul>
    </div>
    <div class="ai-mock" aria-hidden="true">
      <div class="ai-q">${icon('search', 16)} איפה יש ביסטרו טוב בדיזנגוף?</div>
      <div class="ai-score"><b>62</b><span>ציון נראות<small>ממליצים עליכם ברוב השאלות</small></span></div>
      <div class="ai-rows">
        <span><b>ChatGPT</b><i class="yes">✓ הוזכרתם</i></span>
        <span><b>Gemini</b><i class="yes">✓ הוזכרתם וצוטטתם</i></span>
        <span><b>Perplexity</b><i class="no">✗ לא הוזכרתם</i></span>
      </div>
      <div class="ai-plan"><b>${icon('spark', 14)} מה לעשות</b><p>להשלים את העמוד ב-Rest ולבקש שם ביקורות. זה המקור שה-AI מצטט הכי הרבה.</p></div>
    </div>
  </div>
</section>

<section class="lp-band" id="how">
  <div class="lp-head"><span class="lp-kicker">מתחילים בכמה דקות</span><h2>איך זה עובד</h2></div>
  <div class="lp-steps">
    <div class="lp-step">
      <div class="lp-step-top"><span class="lp-step-n">1</span><em>דקה אחת</em></div>
      <h3>מחברים את גוגל מיי ביזנס</h3>
      <p>עם חשבון הגוגל של העסק, או בהדבקת קישור לגוגל מפות.</p>
      <div class="lp-step-art" aria-hidden="true">
        <span class="lp-gbtn">${G_LOGO} התחברות עם Google</span>
        <span class="lp-or">או</span>
        <span class="lp-link-in">maps.app.goo.gl/…<b>הוספה</b></span>
      </div>
    </div>
    <div class="lp-step">
      <div class="lp-step-top"><span class="lp-step-n">2</span><em>אוטומטי, כל שבוע</em></div>
      <h3>המערכת בודקת</h3>
      <p>פרופיל, מפות, מתחרים ו-AI. הכול רץ לבד.</p>
      <div class="lp-step-art lp-checking" aria-hidden="true">
        <span class="done">${icon('check', 13)} בריאות הפרופיל: 84</span>
        <span class="done">${icon('check', 13)} מיקום במפות: 2.5</span>
        <span class="done">${icon('check', 13)} 5 מתחרים נבדקו</span>
        <span class="run"><i class="spinner"></i> נראות ב-AI: 38 מתוך 60</span>
      </div>
    </div>
    <div class="lp-step">
      <div class="lp-step-top"><span class="lp-step-n">3</span><em>10 דקות בשבוע</em></div>
      <h3>עושים את מה שחשוב</h3>
      <p>שלוש משימות בשבוע, ותשובות שה-AI כבר ניסח.</p>
      <div class="lp-step-art lp-todo" aria-hidden="true">
        <span class="ok"><i>✓</i> לענות ל-4 ביקורות</span>
        <span class="ok"><i>✓</i> להעלות 5 תמונות</span>
        <span><i></i> לפרסם פוסט על המבצע</span>
      </div>
    </div>
  </div>
</section>

<section class="lp-band" id="screens">
  <div class="lp-head"><span class="lp-kicker">מבפנים</span><h2>ככה זה נראה מבפנים</h2><p>צילומי מסך מעסק לדוגמה. אחרי ההרשמה רואים את אותם המסכים עם הנתונים שלכם.</p></div>
  <div class="lp-screens">
    <div class="lp-screens-tabs" role="tablist" aria-label="מסכים במערכת">${SCREENS.map(([key, label], i) => `<button type="button" role="tab" id="shot-tab-${key}" aria-controls="shot-${key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-shot="${key}">${h(label)}</button>`).join('')}</div>
    <figure class="lp-screens-frame">
      <span class="lp-browser-bar"><i></i><i></i><i></i><span>gofive.co.il</span></span>
      ${SCREENS.map(([key, label, cap], i) => `<div class="lp-shot" role="tabpanel" id="shot-${key}" aria-labelledby="shot-tab-${key}" data-shot="${key}"${i ? ' hidden' : ''}>
        <button type="button" class="lp-zoom" aria-label="הגדלת צילום המסך: ${h(label)}"><img src="${asset(`media/guide/${key}.jpg`)}" alt="${h(label)}" width="1120" height="730" loading="lazy"><span class="lp-zoom-hint" aria-hidden="true">⤢ הגדלה</span></button>
        <figcaption>${h(cap)}</figcaption></div>`).join('')}
    </figure>
  </div>
  <dialog class="lp-lightbox" aria-label="צילום מסך מוגדל"><button type="button" class="lp-lightbox-close" aria-label="סגירה">✕</button><div class="lp-lightbox-img"><img alt=""></div></dialog>
  <script>(function(){var tabs=[].slice.call(document.querySelectorAll('.lp-screens-tabs [role=tab]'));
function pick(b,focus){tabs.forEach(function(x){var on=x===b;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1});
document.querySelectorAll('.lp-shot').forEach(function(s){s.hidden=s.dataset.shot!==b.dataset.shot});if(focus)b.focus()}
tabs.forEach(function(b,i){b.addEventListener('click',function(){pick(b)});
b.addEventListener('keydown',function(e){var n=tabs.length,j=null;
/* right to left: the left arrow moves to the next tab */
if(e.key==='ArrowLeft')j=(i+1)%n;else if(e.key==='ArrowRight')j=(i-1+n)%n;else if(e.key==='Home')j=0;else if(e.key==='End')j=n-1;
if(j!==null){e.preventDefault();pick(tabs[j],true)}})});
var d=document.querySelector('.lp-lightbox'),di=d.querySelector('img'),last=null;
document.querySelectorAll('.lp-zoom').forEach(function(z){z.addEventListener('click',function(){var im=z.querySelector('img');di.src=im.currentSrc||im.src;di.alt=im.alt;last=z;if(d.showModal)d.showModal();else window.open(di.src)})});
d.querySelector('.lp-lightbox-close').addEventListener('click',function(){d.close()});
d.addEventListener('click',function(e){if(e.target===d)d.close()});
d.addEventListener('close',function(){if(last)last.focus()})})();</script>
</section>

<section class="lp-band alt" id="pricing">
  <div class="lp-head"><span class="lp-kicker">מחירים</span><h2>מחירים פשוטים, בלי הפתעות</h2><p>משלמים לפי מספר הפרופילים בגוגל. בלי דמי הקמה, בלי התחייבות, מבטלים בכל רגע.</p></div>
  ${pricingCards({
    idPrefix: 'lp',
    compact: true,
    action: () =>
      signupOpen
        ? `<a class="btn primary plan-cta" href="/register">${start}</a>`
        : `<a class="btn primary plan-cta" href="/login">כניסה</a>`,
  })}
  <details class="lp-agency" id="contact"${contactSent || contactError ? ' open' : ''}>
    <summary><span><b>סוכנות, או רשת עם עשרות סניפים?</b> נבנה לכם הצעת מחיר.</span><i>להשארת פרטים</i></summary>
    ${contactSent ? '<div class="flash contact-done">תודה! קיבלנו את הפרטים ונחזור אליכם בקרוב.</div>' : contactForm(contactError, contactValues)}
  </details>
</section>

${networkSection()}



<section class="lp-band" id="faq">
  <div class="lp-faq">
    <aside class="lp-faq-side">
      <span class="lp-kicker">שאלות נפוצות</span>
      <h2>כל מה שרציתם לשאול</h2>
      <p>על גוגל מיי ביזנס, על החיבור, על ה-AI ועל המחירים. לא מצאתם תשובה? <a href="#talk">השאירו פרטים</a> ונחזור אליכם.</p>
      <div class="lp-faq-card">
        <b>עדיין מתלבטים?</b>
        <span>${trialOpen ? `מתחילים ב-${TRIAL_DAYS} ימים חינם, או משאירים` : 'משאירים'} פרטים ונחזור אליכם עם הסבר קצר.</span>
        <div class="lp-faq-actions">
          <a class="btn primary" href="#talk">השארת פרטים</a>
        </div>
      </div>
    </aside>
    <div class="lp-faq-list">
      ${faq.map(([q, a], i) => `<details${i === 0 ? ' open' : ''}><summary><span>${h(q)}</span><i aria-hidden="true"></i></summary><div class="lp-faq-a">${a}</div></details>`).join('')}
    </div>
  </div>
</section>

<div class="lp-sticky" aria-hidden="false">${trial}<a class="btn lp-ghost-dark" href="#screens">צילומי מסך</a></div>

<section class="lp-final">
  <div class="lp-hero-glow" aria-hidden="true"></div>
  <h2>הפרופיל שלכם בגוגל יכול להביא הרבה יותר לקוחות</h2>
  <p>מחברים את גוגל מיי ביזנס תוך דקה ורואים את כל הנתונים. בלי התחייבות, מבטלים בכל רגע.</p>
  <div class="lp-actions center">${trial}<a class="btn lp-ghost" href="#talk">לדבר איתנו</a></div>
  <div class="lp-talk-box" id="talk">
    <b>מעדיפים לדבר עם מישהו?</b><span>השאירו שם וטלפון ונחזור אליכם עוד היום.</span>
    ${talkForm(talkSent, talkError, talkError ? contactValues : {})}
    ${talkSent ? '' : '<small>הפרטים ישמשו כדי לחזור אליכם, ולעדכונים רק אם סימנתם. <a href="/privacy">מדיניות הפרטיות</a></small>'}
  </div>
</section>`,
  });
}

// ---------------------------------------------------------------- guide

const guideImg = (file, alt, small = false) =>
  `<figure class="guide-fig${small ? ' small' : ''}"><img src="${asset(`media/guide/${file}`)}" alt="${h(alt)}" loading="lazy"></figure>`;
const compareTable = () => `<table class="guide-compare">
  <thead><tr><th></th><th>חיבור מלא</th><th>קישור בלבד</th></tr></thead>
  <tbody>${CONNECT_COMPARE.map(([what, full, link]) => `<tr><td>${h(what)}</td><td class="${full ? 'yes' : 'no'}">${full ? '✓' : '—'}</td><td class="${link ? 'yes' : 'no'}">${link ? '✓' : '—'}</td></tr>`).join('')}</tbody>
</table>`;

/** The guides: connecting comes first, then a card for each feature. */
export function guideHubView({ signupOpen }) {
  return sitePage({
    title: `מדריכים · ${operatorInfo().brand}`,
    description: 'מדריכים ל-GoFive: איך מחברים את פרופיל העסק בגוגל, ומדריך קצר לכל פיצ׳ר, עם צילומי מסך.',
    signupOpen,
    path: '/guide',
    body: `<section class="guide">
  <header class="guide-head"><h1>מדריכים</h1><p>מתחילים מהחיבור לגוגל, ואז בוחרים מדריך לכל פיצ׳ר. כל צילום מסך כאן הוא מהמערכת עצמה.</p></header>
  <a class="guide-start" href="/guide/connect">
    <span class="guide-start-tag">מתחילים כאן</span>
    <b>${h(CONNECT_GUIDE.title)}</b>
    <span>החיבור המלא לחשבון הגוגל של העסק מביא למערכת את כל הנתונים. שתי דקות, פעם אחת.</span>
    <i>למדריך החיבור ←</i>
  </a>
  <div class="guide-video">
    <video controls playsinline preload="none" poster="${asset('media/guide-connect.jpg')}" aria-label="סרטון: מחברים את העסק לגוגל">
      <source src="${asset('media/guide-connect.mp4')}" type="video/mp4">
    </video>
  </div>
  ${GUIDE_GROUPS.map(
    ([key, label]) => `<h2 class="guide-group">${h(label)}</h2>
  <div class="guide-cards">${FEATURE_GUIDES.filter((g) => g.group === key)
    .map(
      (g) => `<a class="guide-card" href="/guide/${g.slug}"><img src="${asset(`media/guide/${g.image}`)}" alt="" loading="lazy"><b>${h(g.title)}</b><span>${h(g.summary)}</span>${g.full ? '<em>דורש חיבור מלא</em>' : ''}</a>`,
    )
    .join('')}</div>`,
  ).join('')}
  ${guideHelp()}
</section>`,
  });
}

/** Connecting the business to Google, step by step. */
export function guideConnectView({ signupOpen }) {
  const c = CONNECT_GUIDE;
  return sitePage({
    title: `${c.title} · ${operatorInfo().brand}`,
    description: c.intro,
    signupOpen,
    path: '/guide/connect',
    body: `<section class="guide">
  <a class="guide-back" href="/guide">→ כל המדריכים</a>
  <header class="guide-head"><h1>${h(c.title)}</h1><p>${h(c.intro)}</p></header>
  <div class="guide-video">
    <video controls playsinline preload="none" poster="${asset('media/guide-connect.jpg')}" aria-label="סרטון: מחברים את העסק לגוגל">
      <source src="${asset('media/guide-connect.mp4')}" type="video/mp4">
    </video>
  </div>
  <div class="guide-why"><h2>למה חיבור מלא?</h2>${compareTable()}</div>
  ${c.steps
    .map(
      (x, i) => `<article class="guide-step${x.image ? '' : ' text-only'}" id="step-${i + 1}">
    <div class="guide-text">
      <span class="guide-num">${i + 1}</span>
      <h2>${h(x.title)}</h2>
      <ul>${x.points.map((p) => `<li>${h(p)}</li>`).join('')}</ul>
      ${x.link ? `<a class="btn primary" href="${h(x.link)}">${h(x.linkLabel)}</a>` : ''}
    </div>
    ${x.image ? guideImg(x.image, x.alt) : ''}
  </article>`,
    )
    .join('')}
  <div class="guide-trouble"><h2>משהו לא עובד?</h2><dl>${c.trouble.map(([q, a]) => `<dt>${h(q)}</dt><dd>${h(a)}</dd>`).join('')}</dl></div>
  <p class="guide-next">מחוברים? עכשיו <a href="/guide">בוחרים מדריך לפיצ׳ר הבא</a>.</p>
  ${guideHelp()}
</section>`,
  });
}

/** One feature: what it's for, a few steps, and its screen. */
export function guideFeatureView({ signupOpen, guide: g }) {
  const others = FEATURE_GUIDES.filter((x) => x.group === g.group && x.slug !== g.slug);
  return sitePage({
    title: `${g.title} · ${operatorInfo().brand}`,
    description: g.summary,
    signupOpen,
    path: `/guide/${g.slug}`,
    body: `<section class="guide">
  <a class="guide-back" href="/guide">→ כל המדריכים</a>
  <article class="guide-step guide-feature">
    <div class="guide-text">
      <h1>${h(g.title)}</h1>
      <p class="guide-summary">${h(g.summary)}</p>
      ${g.full ? '<p class="guide-tip">הפיצ׳ר הזה דורש <a href="/guide/connect">חיבור מלא לחשבון הגוגל של העסק</a>.</p>' : ''}
      <ol>${g.points.map((p) => `<li>${h(p)}</li>`).join('')}</ol>
      <a class="btn primary" href="${h(g.link)}">לפתוח במערכת</a>
    </div>
    ${guideImg(g.image, g.title, g.image === 'poster.jpg')}
  </article>
  ${others.length ? `<h2 class="guide-group">עוד בנושא</h2><div class="guide-cards">${others.map((x) => `<a class="guide-card" href="/guide/${x.slug}"><b>${h(x.title)}</b><span>${h(x.summary)}</span></a>`).join('')}</div>` : ''}
  ${guideHelp()}
</section>`,
  });
}

function guideHelp() {
  return `<footer class="guide-foot"><h2>צריכים עזרה?</h2>
    <p>${operatorInfo().email ? `כתבו לנו ל-<a href="mailto:${h(operatorInfo().email)}">${h(operatorInfo().email)}</a>, או ` : ''}השאירו פרטים <a href="/#talk">בדף הבית</a> ונחזור אליכם.</p></footer>`;
}

// ---------------------------------------------------------------- legal

const UPDATED = '15.10.2026';

function legalPage({ title, sections, signupOpen, intro = '', path = '' }) {
  return sitePage({
    title,
    signupOpen,
    path,
    body: `<main class="legal">
      <h1>${h(title)}</h1>
      <p class="muted">עודכן לאחרונה: ${UPDATED}</p>
      ${intro}
      <nav class="legal-toc" aria-label="תוכן העניינים"><ol>${sections
        .map(([heading, , id], i) => `<li><a href="#${id || `s${i + 1}`}">${h(heading)}</a></li>`)
        .join('')}</ol></nav>
      ${sections.map(([heading, html, id], i) => `<h2 id="${id || `s${i + 1}`}">${h(heading)}</h2>${html}`).join('')}
    </main>`,
  });
}

function contactOf(op) {
  return op.email ? `<a href="mailto:${h(op.email)}">${h(op.email)}</a>` : 'דרך טופס יצירת הקשר שבאתר';
}

export function privacyView({ signupOpen }) {
  const op = operatorInfo();
  const contact = contactOf(op);
  return legalPage({
    path: '/privacy',
    title: 'מדיניות פרטיות',
    signupOpen,
    intro: `<p>אנחנו מתייחסים לפרטיות ברצינות. כאן מוסבר איזה מידע נאסף ב-${h(op.brand)}, למה, עם מי הוא משותף ומה הזכויות שלכם.
      המדיניות נכתבה לפי חוק הגנת הפרטיות, התשמ"א-1981, התקנות שלו ותיקון 13 לחוק. היא מנוסחת בלשון רבים ופונה לכל המינים.</p>`,
    sections: [
      [
        'מי אנחנו',
        `<p>${h(op.brand)} ("השירות") הוא מערכת לאיסוף משוב וביקורות עבור עסקים, המופעלת על ידי ${h(op.name)} ("אנחנו"). אפשר לפנות אלינו בכל נושא פרטיות: ${contact}.</p>`,
      ],
      [
        'שני סוגי משתמשים',
        `<ul>
          <li><b>בעלי עסקים וצוותים</b> שפותחים חשבון ומשתמשים במערכת. לגבי המידע שלהם, אנחנו בעלי השליטה במאגר.</li>
          <li><b>לקוחות של העסקים</b> שממלאים סקר או משאירים משוב. לגבי המידע הזה העסק הוא בעל השליטה, ואנחנו מחזיקים ומעבדים אותו בשמו ולפי הנחיותיו.</li>
        </ul>`,
      ],
      [
        'מידע שנאסף מלקוחות שממלאים סקר',
        `<ul>
          <li><b>מה:</b> הדירוג, התשובות לשאלות, ההערות שכתבתם, ואם בחרתם למסור: שם, טלפון ואימייל. אם העסק הזמין אתכם בהודעה, נשמרים גם השם והטלפון או המייל שהעסק הזין.</li>
          <li><b>למה:</b> כדי שהעסק יבין איך הייתה החוויה שלכם, ישפר את השירות, ואם ביקשתם, יחזור אליכם.</li>
          <li><b>פרסום:</b> הערה שלכם תוצג באתר העסק רק אם סימנתם במפורש שאתם מסכימים, ותמיד עם השם הפרטי בלבד.</li>
          <li><b>מעבר לגוגל:</b> אם תבחרו לכתוב ביקורת, תעברו לאתר של גוגל או של פלטפורמה אחרת, ויחולו עליכם התנאים ומדיניות הפרטיות שלה.</li>
          <li><b>אין חובה:</b> אין חובה חוקית למסור את המידע. הסקר אנונימי אם לא מוסרים פרטי קשר.</li>
        </ul>`,
      ],
      [
        'מידע שנאסף מבעלי עסקים',
        `<ul>
          <li><b>פרטי חשבון:</b> שם, אימייל, סיסמה (שמורה כגיבוב מוצפן, ואיננו יכולים לקרוא אותה), ואם הופעל: סוד לאימות דו-שלבי.</li>
          <li><b>פרטי העסק:</b> שם, לוגו, צבע, קישורים לפרופילים, קמפיינים, שאלות ושמות עובדים שהוזנו לדירוג.</li>
          <li><b>חיבור לגוגל:</b> אם חיברתם את פרופיל העסק בגוגל, נשמרים כתובת המייל של החשבון המחובר, הרשאת גישה מוצפנת, רשימת הסניפים, והביקורות והתשובות שלהם.</li>
          <li><b>שימוש ותפעול:</b> יומני כניסה, מיילים שנשלחו מהמערכת והגדרות התראות.</li>
          <li><b>פניות מהאתר:</b> מה שמסרתם בטופס "הצעת מחיר" או "צור קשר".</li>
        </ul>
        <p>המידע משמש להפעלת השירות, לאבטחה, לשליחת התראות ודוחות שביקשתם, לחיוב, לתמיכה וליצירת קשר בנושא החשבון. לא נשלח לכם דיוור שיווקי בלי הסכמה.</p>
        <p><b>דיוור שיווקי:</b> בהרשמה אפשר לסמן, בנפרד מאישור התקנון, הסכמה לקבל במייל עדכונים, טיפים והטבות. הסימון אינו חובה, ואינו משפיע על השירות. נשמרים ההסכמה ומועד מתן ההסכמה. אפשר לבטל בכל עת בקישור ההסרה שבכל דיוור, בעמוד "החשבון שלי" או בפנייה אלינו. הודעות שירות (חשבוניות, אבטחה, התראות שביקשתם) נשלחות גם בלי הסכמה לדיוור.</p>`,
      ],
      [
        'המידע שמתקבל מגוגל',
        `<p>כשעסק מחבר את פרופיל העסק שלו בגוגל, אנחנו מבקשים רק הרשאה לניהול פרופיל העסק (business.manage) ואת כתובת המייל של החשבון. המידע משמש רק כדי להציג לעסק את הביקורות שלו, להתריע על ביקורות חדשות, ולפרסם תשובות ופוסטים שהעסק כתב ואישר. תמונה שמצורפת לפוסט נשמרת אצלנו בכתובת ציבורית, כדי שגוגל תוכל לטעון אותה.</p>
        <p>השימוש במידע שמתקבל מ-Google APIs והעברתו לכל מערכת אחרת יעמדו ב-<a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener" target="_blank">Google API Services User Data Policy</a>, כולל דרישות ה-Limited Use. איננו מוכרים את המידע, לא משתמשים בו לפרסום, ולא משתמשים בו לאימון מודלים של בינה מלאכותית. אפשר לנתק את החיבור בכל רגע מתוך המערכת, והמידע שהתקבל מגוגל יימחק. אפשר לבטל את ההרשאה גם ב-<a href="https://myaccount.google.com/permissions" rel="noopener" target="_blank">הגדרות חשבון הגוגל</a>.</p>`,
      ],
      [
        'עם מי המידע משותף',
        `<p>איננו מוכרים מידע אישי. המידע מועבר רק לספקים שנחוצים להפעלת השירות, בהיקף הנדרש ובכפוף להתחייבויות לשמירה על סודיות ואבטחה:</p>
        <ul>
          <li><b>Railway</b>: אחסון השרתים ומסד הנתונים.</li>
          <li><b>Cloudflare</b>: ניהול הדומיין והגנה על התעבורה.</li>
          <li><b>Resend</b>: שליחת מיילים (שרתים באירלנד).</li>
          <li><b>Google</b>: רק אם העסק חיבר את פרופיל העסק שלו, לצורך קריאת ביקורות ופרסום תשובות ופוסטים.</li>
          <li><b>Meta (WhatsApp)</b>: כשעסק שולח בקשת דירוג בוואטסאפ דרך המערכת, נשלחים ל-WhatsApp מספר הטלפון של הלקוח, שמו הפרטי אם הוזן, שם העסק והקישור לסקר, לצורך שליחת ההודעה בלבד.</li>
          <li><b>קארדקום</b>: חברת הסליקה שמעבדת את התשלום על המנוי ומפיקה את החשבונית. פרטי הכרטיס מוזנים ישירות אצלה ולא עוברים דרכנו.</li>
          <li><b>SerpApi</b>: כשעסק עוקב אחרי הביקורות שלו בגוגל לפי קישור, לצורך שליפת הביקורות הציבוריות של העסק, לבדיקת נראות העסק בתשובות ה-AI של גוגל לשאלות שהעסק הגדיר, ולקריאת הדירוג הציבורי של מתחרים שהעסק בחר להשוות אליהם. לא מועבר אליו מידע על הלקוחות שמילאו סקר.</li>
          <li><b>Anthropic</b>: ספקית עוזר ה-AI. רק כשמשתמש בעסק לוחץ על ניסוח טיוטה, או כשתיוג ההערות האוטומטי פעיל, נשלח המשוב הרלוונטי לצורך יצירת הטקסט בלבד. בבדיקת הנראות ב-AI נשלחות אליה רק השאלות שהעסק הגדיר, בלי מידע על לקוחות. לפי התנאים המסחריים שלה, Anthropic לא מאמנת מודלים על מידע שנשלח כך.</li>
          <li><b>OpenAI, Google (Gemini) ו-Perplexity</b>: בבדיקת הנראות בעוזרי AI במסלול "גוגל + AI", לבדיקה אם עוזרי ה-AI שלהן ממליצים על העסק. נשלחות אליהן רק השאלות שהעסק הגדיר והעיר שלו, בלי מידע על לקוחות.</li>
          <li><b>שירותים שהעסק עצמו חיבר</b>, כמו Webhook או אוטומציה.</li>
        </ul>
        <p>חלק מהספקים מאחסנים ומעבדים מידע מחוץ לישראל, בין היתר בארה"ב ובאיחוד האירופי, בכפוף לתקנות הגנת הפרטיות (העברת מידע למאגרי מידע שמחוץ לגבולות המדינה). נמסור מידע לרשויות רק כשהחוק מחייב.</p>`,
      ],
      [
        'עוגיות',
        '<p>האתר משתמש רק בעוגיות הכרחיות להפעלתו, בלי עוגיות פרסום או מעקב של צד שלישי. הפירוט המלא ב<a href="/cookies">מדיניות העוגיות</a>.</p>',
      ],
      [
        'אבטחת מידע',
        `<p>החיבור לשירות מוצפן (HTTPS), סיסמאות נשמרות כגיבוב, הרשאות גוגל נשמרות מוצפנות, אפשר להפעיל אימות דו-שלבי, והגישה לכל עסק מוגבלת לצוות שלו לפי תפקידים. מתבצעים גיבויים סדירים.
        אין מערכת חסינה לחלוטין. אם יקרה אירוע אבטחה חמור, נפעל לפי תקנות הגנת הפרטיות (אבטחת מידע), כולל דיווח לרשות להגנת הפרטיות ולנפגעים כשהדבר נדרש.</p>`,
      ],
      [
        'כמה זמן המידע נשמר',
        `<ul>
          <li>משובים וביקורות נשמרים כל עוד העסק משתמש בשירות, או עד שהעסק מוחק אותם.</li>
          <li>כשחשבון נסגר, המידע שלו נמחק בתוך 30 יום, למעט גיבויים שנמחקים במחזור הרגיל שלהם (עד 30 יום נוספים), ומידע שחובה לשמור לפי דין, כמו מסמכי חיוב.</li>
          <li>כשמנוי מסתיים (בוטל או לא חודש), החשבון והנתונים נשמרים עוד 12 חודשים, כדי שתוכלו לחזור בדיוק מאיפה שהפסקתם. לפני מחיקה נשלח הודעה במייל. אפשר לבקש מאיתנו מחיקה מיידית או עותק של הנתונים בכל עת.</li>
          <li>חשבון שלא הופעל (לא נבחר בו מסלול) ולא היה בו שימוש במשך 12 חודשים עשוי להימחק, אחרי הודעה במייל.</li>
          <li>סיבת ביטול שתבחרו למסור (לא חובה) נשמרת אצלנו כדי לשפר את השירות.</li>
        </ul>`,
      ],
      [
        'הזכויות שלכם',
        `<ul>
          <li><b>עיון:</b> לקבל את המידע ששמור עליכם.</li>
          <li><b>תיקון ומחיקה:</b> לבקש לתקן מידע שגוי, לא שלם או לא מעודכן, או למחוק אותו.</li>
          <li><b>הסרה מדיוור:</b> להסיר את עצמכם מכל דיוור, בקישור שבתחתית ההודעה או בפנייה אלינו.</li>
        </ul>
        <p>לקוחות של עסק יכולים לפנות לעסק עצמו או אלינו, ואנחנו נעביר את הבקשה לעסק. פונים אלינו ${contact}, ונענה בתוך 30 יום. אם אינכם מרוצים מהטיפול, אפשר לפנות ל<a href="https://www.gov.il/he/departments/the_privacy_protection_authority" rel="noopener" target="_blank">רשות להגנת הפרטיות</a>.</p>`,
      ],
      ['קטינים', '<p>השירות מיועד לעסקים ולבגירים. איננו אוספים ביודעין מידע מילדים מתחת לגיל 16.</p>'],
      ['שינויים במדיניות', '<p>אם נשנה את המדיניות באופן מהותי, נעדכן כאן, נשנה את תאריך העדכון ונודיע לבעלי החשבונות במייל.</p>'],
      ['יצירת קשר', `<p>${h(op.name)} · ${contact}</p>`],
    ],
  });
}

export function termsView({ signupOpen }) {
  const op = operatorInfo();
  const contact = contactOf(op);
  return legalPage({
    path: '/terms',
    title: 'תנאי שימוש ותקנון',
    signupOpen,
    intro: `<p>התקנון מסדיר את השימוש ב-${h(op.brand)}. הוא מנוסח בלשון רבים ופונה לכל המינים. אם משהו לא ברור, <a href="/#talk">כתבו לנו</a>.</p>`,
    sections: [
      [
        'כללי',
        `<p>התנאים חלים על כל מי שמשתמש ב-${h(op.brand)} ("השירות"), המופעל על ידי ${h(op.name)} ("אנחנו"). פתיחת חשבון או שימוש בשירות מהווים הסכמה לתקנון, ל<a href="/privacy">מדיניות הפרטיות</a> ול<a href="/cookies">מדיניות העוגיות</a>. אם אינכם מסכימים, אל תשתמשו בשירות.</p>`,
      ],
      [
        'השירות',
        '<p>השירות מאפשר לעסקים לאסוף משוב מלקוחות בעזרת QR, קישורים והודעות, לטפל בלקוחות לא מרוצים, להפנות לקוחות מרוצים לכתוב ביקורת בגוגל ובפלטפורמות אחרות, לנהל ביקורות גוגל ולקבל דוחות. היכולות המדויקות מפורטות באתר ועשויות להשתנות מעת לעת.</p>',
      ],
      [
        'החשבון',
        `<ul>
          <li>פותחים חשבון עם פרטים נכונים ומלאים. מי שפותח חשבון בשם עסק מצהיר שהוא מוסמך לפעול בשמו ושהוא בן 18 לפחות.</li>
          <li>אתם אחראים לשמור על הסיסמה ועל כל פעולה שנעשית בחשבון, כולל על ידי עובדים שהזמנתם. מומלץ להפעיל אימות דו-שלבי.</li>
          <li>אם אתם חושדים בשימוש לא מורשה, הודיעו לנו מיד.</li>
        </ul>`,
      ],
      [
        'שימוש מותר ואסור',
        `<ul>
          <li>שלחו בקשות דירוג רק ללקוחות אמיתיים שלכם, ובהתאם לחוק, כולל סעיף 30א לחוק התקשורת ("חוק הספאם") כשמדובר בהודעות שיווקיות.</li>
          <li>אסור לכתוב ביקורות מזויפות, לבקש מעובדים, מבני משפחה או ממכרים לכתוב ביקורות, או לתת הטבה או תשלום בתמורה לביקורת.</li>
          <li>אסור להשתמש בשירות כדי למנוע מלקוחות לכתוב ביקורת, לבקש מהם להסיר ביקורת, להטריד אותם או לאיים עליהם.</li>
          <li>עליכם לעמוד במדיניות של גוגל ושל כל פלטפורמה אחרת שאליה אתם מפנים. איננו אחראים להחלטות שלהן, כמו הסרת ביקורות או השעיית פרופיל.</li>
          <li>אסור לפרוץ, לסרוק, להעמיס או לנסות לעקוף את מנגנוני האבטחה של השירות, ואסור להשתמש בו לכל מטרה לא חוקית.</li>
        </ul>`,
      ],
      [
        'המידע של הלקוחות שלכם',
        `<ul>
          <li>המידע שאתם אוספים דרך השירות שייך לכם, ואתם אחראים עליו כבעלי השליטה במאגר, כולל על כך שאיסופו והשימוש בו חוקיים.</li>
          <li>אנחנו מחזיקים ומעבדים את המידע הזה בשמכם, רק לצורך מתן השירות, ושומרים עליו כמפורט ב<a href="/privacy">מדיניות הפרטיות</a>.</li>
          <li>אל תאספו דרך השירות מידע שאינו נחוץ, ובפרט לא מידע רגיש כמו מידע רפואי.</li>
        </ul>`,
      ],
      [
        'מסלולים ותשלום',
        `<ul>
          <li>המחירים מפורטים ב<a href="/#pricing">עמוד המחירים</a>, בשקלים וכוללים מע״מ. המחיר הוא <b>לכל פרופיל עסק בגוגל</b> שהחשבון עוקב אחריו. המסלולים נבדלים בבדיקת הנראות ב-ChatGPT, Gemini, Perplexity ו-Claude ובתוכנית הפעולה, הכלולות במסלול "גוגל + AI".</li>
          <li>פרופיל שנוסף באמצע תקופה מחויב מהחידוש הבא, ופרופיל שהוסר מפסיק להיות מחויב מהחידוש הבא. אין חיוב או זיכוי על החלק של התקופה הנוכחית.</li>
          <li><b>תקופת ניסיון:</b> חשבון חדש יכול להתחיל ב-${TRIAL_DAYS} ימי ניסיון חינם, פעם אחת לכל אדם. בתחילת הניסיון שומרים כרטיס אשראי בדף המאובטח של קארדקום, ו<b>לא מחויבים</b>. יום לפני סוף הניסיון נשלח מייל עם הסכום שיחויב. אם לא ביטלתם עד סוף הניסיון, המנוי במסלול שבחרתם מתחיל והכרטיס מחויב אוטומטית, ומאז המנוי מתחדש כרגיל. ביטול בזמן הניסיון נעשה בקליק בעמוד "התוכנית שלי", ואינו כרוך בחיוב כלשהו. אם החיוב הראשון לא עובר, החשבון מושהה עד לתשלום.</li>
          <li>בזמן הניסיון חלק מהמכסות מצומצמות (למשל טיוטות AI, בדיקות ידניות, חיפושים במפות והודעות וואטסאפ). המכסות המלאות של המסלול נפתחות עם תחילת המנוי.</li>
          <li>מנהל השירות רשאי להעניק תקופת ניסיון גם בדרך אחרת לעסק מסוים, לפי שיקול דעתו.</li>
          <li>התשלום בכרטיס אשראי, בדף התשלום המאובטח של חברת הסליקה קארדקום. אנחנו לא שומרים את פרטי הכרטיס: נשמר אצלנו רק אסימון (טוקן) שמאפשר לחייב את המנוי, ו-4 הספרות האחרונות.</li>
          <li>מסלול חודשי מתחדש כל חודש, ומסלול שנתי כל שנה, עד שמבטלים, והכרטיס מחויב אוטומטית ביום החידוש. בתשלום שנתי משלמים על 10 חודשים ומקבלים 12. חשבונית נשלחת במייל אחרי כל חיוב.</li>
          <li>תוספות שאינן חלק מהמסלולים, כמו חיבור לקופה ולמערכות (API), ומסלולים לרשתות גדולות ולסוכנויות, ניתנים בהצעת מחיר נפרדת.</li>
          <li>נוכל לשנות מחירים ומסלולים בהודעה של 30 יום מראש לפחות. שינוי לא יחול על תקופה ששולמה מראש.</li>
          <li>אם חיוב לא עובר, נודיע לכם במייל וננסה שוב בימים הבאים. אם שלושה ניסיונות נכשלים, החשבון מושהה עד לתשלום, והנתונים נשמרים.</li>
        </ul>`,
        'billing',
      ],
      [
        'שדרוג ומעבר בין מסלולים',
        `<ul>
          <li>משנים מסלול בעמוד "התוכנית שלי" במערכת. לפני כל שינוי מוצג בדיוק מה ייכנס לתוקף, מתי, וכמה יחויב, והשינוי מתבצע רק אחרי אישור.</li>
          <li><b>שדרוג</b> למסלול יקר יותר נכנס לתוקף מיד. מחויב רק ההפרש היחסי על הימים שנשארו עד יום החידוש, ומהחידוש הבא המחיר המלא של המסלול החדש.</li>
          <li><b>מעבר למסלול זול יותר</b> או לתדירות תשלום אחרת (חודשי או שנתי) נכנס לתוקף ביום החידוש הבא, בלי החזר על התקופה הנוכחית. עד יום החידוש אפשר לבטל את השינוי.</li>
          <li>במעבר למסלול שאינו כולל יכולת מסוימת, הנתונים שכבר נאספו נשמרים, אבל היכולת עצמה לא תפעל עד שתחזרו למסלול שכולל אותה.</li>
        </ul>`,
        'change',
      ],
      [
        'ביטול והחזרים',
        `<ul>
          <li>אפשר לבטל מנוי בכל עת, בעמוד "התוכנית שלי" במערכת (קישור "ביטול המנוי"), או בפנייה אלינו ${contact}. אחרי ביטול תישלח אליכם הודעה, והחיובים נעצרים: לא תחויבו על התקופה שאחרי הביטול.</li>
          <li>מנוי חודשי נשאר פעיל עד סוף החודש ששולם (ושנתי, כמפורט בהמשך). עד אז אפשר לחדש אותו בלחיצה, בלי לשלם שוב.</li>
          <li><b>מסלול חודשי:</b> החיוב נעצר מהחודש שאחרי הביטול. אין החזר על החודש השוטף.</li>
          <li><b>מסלול שנתי:</b> החודש שבו מבטלים נחשב מנוצל, וכל חודש שנוצל מחושב לפי המחיר החודשי הרגיל של המסלול (בלי ההנחה השנתית). ההחזר הוא מה ששולם פחות החודשים שנוצלו, והגישה נמשכת עד סוף החודש שבו ביטלתם. אם החודשים שנוצלו מכסים את כל הסכום, אין החזר והמסלול נשאר פעיל עד סוף השנה. לפני אישור הביטול מוצגים לכם הסכום שיוחזר ותאריך הסיום.
            <br><i>לדוגמה:</i> שילמתם ₪${PLANS.basic.price * 10} על שנה במסלול "${PLANS.basic.label}" (₪${PLANS.basic.price} לחודש), וביטלתם בחודש הרביעי. נוצלו 4 חודשים × ₪${PLANS.basic.price} = ₪${PLANS.basic.price * 4}, ולכן יוחזרו ₪${PLANS.basic.price * 6}, והגישה נמשכת עד סוף החודש הרביעי. ביטול בחודש ה-11: נוצלו ₪${PLANS.basic.price * 11}, יותר מהסכום ששולם, ולכן אין החזר והמסלול פעיל עד סוף השנה.</li>
          <li><b>בתקופת הניסיון:</b> ביטול לפני סוף הניסיון אינו כרוך בחיוב כלשהו.</li>
          <li><b>צרכנים:</b> מי שהתקשר בעסקה כצרכן (ולא לצורכי עסק) רשאי לבטל לפי חוק הגנת הצרכן, התשמ"א-1981, והתקנות שלו, ובכלל זה לבטל עסקה מרחוק בתוך 14 יום מההתקשרות, בכפוף לדמי ביטול בשיעור של עד 5% מהמחיר או 100 ₪, לפי הנמוך מביניהם.</li>
          <li>ההחזר יבוצע באמצעי התשלום המקורי, בתוך 14 יום.</li>
          <li>בסוף התקופה הסקרים, ההתראות והבדיקות מושהים. הנתונים נשמרים עוד 12 חודשים כדי שתוכלו לחזור, כמפורט ב<a href="/privacy">מדיניות הפרטיות</a>.</li>
        </ul>`,
        'cancel',
      ],
      [
        'עוזר ה-AI',
        '<p>טקסטים שעוזר ה-AI מנסח הם הצעות וטיוטות. הם עלולים לכלול טעויות, ובאחריותכם לקרוא ולערוך אותם לפני שליחה או פרסום. שום תשובה לא מתפרסמת בגוגל בלי שאישרתם אותה.</p>',
      ],
      [
        'זמינות ושינויים',
        '<p>אנחנו עושים מאמץ שהשירות יהיה זמין ותקין, אבל הוא ניתן כמו שהוא (AS IS), ועלולות להיות תקלות, הפסקות ועבודות תחזוקה. אנחנו רשאים לשפר ולשנות את השירות. אם נפסיק את השירות כולו, נודיע לפחות 30 יום מראש, תוכלו לייצא את הנתונים ותקבלו החזר יחסי על תקופה ששולמה מראש.</p>',
      ],
      [
        'קניין רוחני',
        `<p>השירות, העיצוב, הקוד והסימנים של ${h(op.brand)} שייכים לנו. התוכן שאתם מעלים, כמו לוגו וטקסטים, נשאר שלכם, ואתם מעניקים לנו רשות להשתמש בו רק לצורך מתן השירות.</p>`,
      ],
      [
        'הגבלת אחריות',
        '<p>ככל שהחוק מתיר, לא נהיה אחראים לנזק עקיף או תוצאתי, לאובדן הכנסות או לפגיעה במוניטין, וכן לא להחלטות של גוגל או של פלטפורמות אחרות. האחריות הכוללת שלנו מוגבלת לסכום ששילמתם עבור השירות ב-12 החודשים שלפני האירוע. אין בכך כדי לגרוע מזכויות שאי אפשר להתנות עליהן לפי דין.</p>',
      ],
      [
        'השעיה וסגירה',
        '<p>אפשר לסגור את החשבון בכל עת. נוכל להשעות או לסגור חשבון שמפר את התקנון או את החוק, ובמקרים שאינם דחופים נודיע מראש ונאפשר לתקן. לפני סגירה אפשר לייצא את הנתונים לקובץ CSV.</p>',
      ],
      ['שינויים בתקנון', '<p>נוכל לעדכן את התקנון. שינוי מהותי יפורסם כאן ויישלח במייל 14 יום לפני שייכנס לתוקף. המשך שימוש אחרי מועד זה מהווה הסכמה.</p>'],
      ['דין וסמכות שיפוט', '<p>על התקנון יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בתל אביב-יפו.</p>'],
      ['יצירת קשר', `<p>${h(op.name)} · ${contact}</p>`],
    ],
  });
}

export function cookiesView({ signupOpen }) {
  const op = operatorInfo();
  const row = (name, where, what, time) => `<tr><td><code>${name}</code></td><td>${where}</td><td>${what}</td><td>${time}</td></tr>`;
  return legalPage({
    path: '/cookies',
    title: 'מדיניות עוגיות',
    signupOpen,
    intro: `<p>עוגייה (Cookie) היא קובץ טקסט קטן שהאתר שומר בדפדפן. ${h(op.brand)} משתמש <b>רק בעוגיות הכרחיות</b> שבלעדיהן האתר לא יכול לפעול. אין אצלנו עוגיות פרסום, פיקסלים של רשתות חברתיות או כלי מעקב של צד שלישי.</p>`,
    sections: [
      [
        'העוגיות שבשימוש',
        `<div class="table-wrap"><table class="table responsive">
          <thead><tr><th>שם</th><th>איפה</th><th>למה</th><th>לכמה זמן</th></tr></thead>
          <tbody>
            ${row('sid', 'מערכת הניהול', 'שומרת שאתם מחוברים לחשבון', '30 יום')}
            ${row('biz', 'מערכת הניהול', 'זוכרת איזה עסק בחרתם, אם יש לכם כמה', 'שנה')}
            ${row('l2', 'כניסה', 'שלב הביניים באימות דו-שלבי', '5 דקות')}
            ${row('gstate', 'חיבור לגוגל', 'מאבטחת את החזרה מגוגל אל החשבון הנכון', '10 דקות')}
            ${row('vid', 'דף הסקר של העסק', 'מזהה אקראי שמונע ספירה כפולה של אותו ביקור. לא מזהה אתכם אישית', 'שנה')}
          </tbody>
        </table></div>
        <p>כל העוגיות הן של האתר עצמו (First Party), מוגנות מגישה של סקריפטים (HttpOnly) ונשלחות בחיבור מוצפן.</p>`,
      ],
      [
        'שמירה מקומית בדפדפן',
        `<p>בנוסף לעוגיות, הדפדפן שומר אצלכם (Local Storage) שני דברים שלא נשלחים אלינו: הגדרות תפריט הנגישות שבחרתם (<code>gofive-a11y</code>), וסימון שכבר ראיתם את ההודעה על העוגיות (<code>gofive-cookies-ok</code>).</p>`,
      ],
      [
        'אתרים חיצוניים',
        '<p>כשאתם עוברים מהאתר לגוגל או לפלטפורמה אחרת כדי לכתוב ביקורת, חלה עליכם מדיניות העוגיות של אותו אתר.</p>',
      ],
      [
        'איך שולטים בעוגיות',
        '<p>אפשר למחוק או לחסום עוגיות בהגדרות הדפדפן. אם תחסמו את העוגיות ההכרחיות, לא תוכלו להתחבר למערכת הניהול, אבל תוכלו עדיין למלא סקרים.</p>',
      ],
      ['יצירת קשר', `<p>שאלות על עוגיות ופרטיות: ${contactOf(op)}. פרטים נוספים ב<a href="/privacy">מדיניות הפרטיות</a>.</p>`],
    ],
  });
}

export function accessibilityView({ signupOpen }) {
  const op = operatorInfo();
  const coordinator = process.env.ACCESSIBILITY_COORDINATOR || op.name;
  const phone = process.env.CONTACT_PHONE || '';
  return legalPage({
    path: '/accessibility',
    title: 'הצהרת נגישות',
    signupOpen,
    intro: `<p>אנחנו רואים חשיבות רבה בכך שכל אחד ואחת יוכלו להשתמש ב-${h(op.brand)}, כולל אנשים עם מוגבלות. השקענו בהנגשת האתר, מערכת הניהול ודפי הסקר שהלקוחות של העסקים ממלאים, ואנחנו ממשיכים לשפר.</p>`,
    sections: [
      [
        'רמת הנגישות',
        `<p>האתר נבנה בהתאם לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ולתקן הישראלי ת"י 5568, המבוסס על הנחיות WCAG 2.0 של ארגון W3C, ברמה AA.</p>`,
      ],
      [
        'מה עשינו',
        `<ul>
          <li>האתר מותאם לקוראי מסך, עם מבנה כותרות תקין, תוויות לשדות הטפסים ותיאור לרכיבים גרפיים.</li>
          <li>אפשר לנווט בכל האתר עם המקלדת בלבד (Tab, Shift+Tab, Enter, רווח וחיצים), עם סימון ברור של הרכיב שבמיקוד.</li>
          <li>קישור "דלג לתוכן" בתחילת כל עמוד.</li>
          <li>ניגודיות צבעים מספקת בין טקסט לרקע, ומידע לא מועבר בצבע בלבד.</li>
          <li>האתר מותאם לתצוגה בטלפון, בטאבלט ובמחשב, ואפשר להגדיל את התצוגה עד 200% בלי לאבד תוכן.</li>
          <li>דפי הסקר זמינים בעברית, ערבית, אנגלית ורוסית, עם כיוון כתיבה מתאים לכל שפה.</li>
          <li>אין בו תוכן מהבהב, ואנימציות נעצרות כשהמערכת מוגדרת להפחתת תנועה.</li>
        </ul>`,
      ],
      [
        'תפריט הנגישות',
        `<p>בכל עמוד יש כפתור נגישות (סמל האדם הכחול, בפינת המסך). התפריט מאפשר:</p>
        <ul>
          <li>הגדלה והקטנה של הטקסט</li>
          <li>ניגודיות גבוהה ותצוגה בגווני אפור</li>
          <li>הדגשת קישורים</li>
          <li>גופן קריא וריווח שורות מוגדל</li>
          <li>עצירת אנימציות</li>
          <li>סמן עכבר גדול והדגשת מיקוד המקלדת</li>
        </ul>
        <p>ההגדרות נשמרות בדפדפן שלכם ונשארות גם בביקור הבא. התפריט הוא תוספת. האתר עצמו נבנה להיות נגיש גם בלעדיו.</p>`,
      ],
      [
        'דפדפנים וטכנולוגיות מסייעות',
        '<p>האתר מותאם לגרסאות העדכניות של Chrome, Safari, Firefox ו-Edge, במחשב ובטלפון, ולקוראי המסך הנפוצים (NVDA, JAWS ו-VoiceOver).</p>',
      ],
      [
        'מגבלות ידועות',
        `<ul>
          <li>תוכן שהעסקים עצמם מעלים, כמו לוגו ושאלות מותאמות, באחריותם, וייתכן שלא יהיה נגיש במלואו.</li>
          <li>דפים חיצוניים שאליהם האתר מפנה, כמו דף כתיבת ביקורת בגוגל, אינם בשליטתנו.</li>
          <li>הגרפים בלוח הבקרה מלווים במספרים ובטקסט, אבל הצגתם הגרפית אינה נגישה במלואה לקוראי מסך.</li>
        </ul>
        <p>אם נתקלתם ברכיב שאינו נגיש, נשמח שתספרו לנו ונתקן.</p>`,
      ],
      [
        'רכז הנגישות ופניות',
        `<p>נתקלתם בבעיה, או שאתם צריכים את המידע בדרך אחרת? פנו לרכז הנגישות:</p>
        <ul>
          <li><b>שם:</b> ${h(coordinator)}</li>
          ${op.email ? `<li><b>מייל:</b> <a href="mailto:${h(op.email)}">${h(op.email)}</a></li>` : ''}
          ${phone ? `<li><b>טלפון:</b> <a href="tel:${h(phone.replace(/[^\d+]/g, ''))}" dir="ltr">${h(phone)}</a></li>` : ''}
        </ul>
        <p>כדי שנוכל לטפל, תארו את הבעיה, ציינו את העמוד, ואם אפשר גם את הדפדפן ואת הטכנולוגיה המסייעת שבה השתמשתם. נחזור אליכם תוך 5 ימי עסקים.</p>`,
      ],
    ],
  });
}
