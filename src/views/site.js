import { FEATURE_LABELS, limitLabel, PLANS } from '../plans.js';
import { h } from '../util.js';
import { icon, starMark } from './icons.js';

/** Who runs this installation, from env (shown in the footer, privacy and terms). */
export function operatorInfo() {
  return {
    name: process.env.OPERATOR_NAME || 'מפעיל המערכת',
    email: process.env.CONTACT_EMAIL || '',
    brand: process.env.BRAND_NAME || 'ביקורות',
  };
}

function sitePage({ title, description = '', body, signupOpen = true }) {
  const op = operatorInfo();
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
${description ? `<meta name="description" content="${h(description)}">` : ''}
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" type="image/png" href="/static/icons/favicon-32.png">
<link rel="manifest" href="/manifest.webmanifest">
</head>
<body class="site">
<header class="site-head">
  <a class="brand" href="/"><span class="brand-mark" style="width:36px;height:36px">${starMark(20)}</span>${h(op.brand)}</a>
  <nav>
    <a href="/#how">איך זה עובד</a>
    <a href="/#features">פיצ'רים</a>
    <a href="/#pricing">מחירים</a>
    <a href="/#faq">שאלות</a>
  </nav>
  <div class="site-cta">
    <a href="/login">כניסה לחשבון</a>
    ${signupOpen ? '<a class="btn primary" href="/register">הרשמה חינם</a>' : ''}
  </div>
</header>
${body}
<footer class="site-foot">
  <div>© ${new Date().getFullYear()} ${h(op.name)}</div>
  <nav>
    <a href="/privacy">מדיניות פרטיות</a>
    <a href="/terms">תנאי שימוש</a>
    ${op.email ? `<a href="mailto:${h(op.email)}">צור קשר</a>` : ''}
  </nav>
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------- landing

function heroVisual() {
  const bars = [60, 78, 52, 96, 110, 84, 70, 66, 100, 120, 94, 88, 104, 124];
  const max = Math.max(...bars);
  return `<div class="hero-visual" aria-hidden="true">
    <div class="mock-dash">
      <div class="mock-side"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="mock-main">
        <b>לוח בקרה</b>
        <div class="mock-kpis">
          <span>דירוג ממוצע<strong>4.6</strong></span>
          <span>דירוגים<strong>312</strong></span>
          <span>לגוגל<strong>148</strong></span>
        </div>
        <div class="mock-bars">${bars.map((v) => `<i style="height:${Math.round((v / max) * 100)}%"></i>`).join('')}</div>
        <div class="mock-rows">
          <span><span>אבי · ★★</span><span class="badge st-late">באיחור</span></span>
          <span><span>מיכל · ★</span><span class="badge st-new">חדש</span></span>
        </div>
      </div>
    </div>
    <div class="mock-phone"><div>
      <div class="top">נו, איך היה?</div>
      <div class="nums"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
    </div></div>
  </div>`;
}

export function landingView({ signupOpen }) {
  const features = [
    ['qr', 'QR וקישור אישי', 'שלט להדפסה לכל שולחן או קופה, או קישור אישי ללקוח בוואטסאפ, SMS או מייל, עם תזכורת אוטומטית.'],
    ['chart', 'יותר ביקורות בגוגל', 'לקוחות מרוצים מקבלים כפתור גדול לכתיבת ביקורת בגוגל, ברגע שהחוויה עוד טרייה.'],
    ['bell', 'תופסים לקוח כועס בזמן', 'לקוח לא מרוצה משאיר פרטים, ואתם מקבלים התראה מיידית כדי לחזור אליו לפני שהוא כותב ביקורת.'],
    ['clock', 'מעקב טיפול', 'כל פנייה עם סטטוס, הערות וזמן טיפול. פנייה שנתקעה מסומנת באדום ושולחת תזכורת.'],
    ['spark', 'עוזר AI', 'מנסח תשובה אישית ללקוח לא מרוצה, ומסכם לכם מה עובד ומה צריך לתקן.'],
    ['home', 'לוח בקרה', 'דירוג ממוצע, NPS, קליקים לביקורת, מגמות, ומאיזה שולחן או עובד מגיעים הדירוגים.'],
    ['chat', 'המלצות באתר שלכם', 'לקוחות מרוצים מאשרים פרסום, ואתם מציגים את ההמלצות באתר בשתי שורות קוד.'],
    ['team', 'צוות וסניפים', 'כמה סניפים ועסקים בחשבון אחד, עם הרשאות לכל עובד.'],
  ];
  const plans = Object.entries(PLANS);
  const price = (p) =>
    p.price == null
      ? '<span class="price-contact">צרו קשר</span>'
      : p.price === 0
        ? '<span class="price">חינם</span>'
        : `<span class="price">₪${p.price}</span><span class="muted"> / חודש</span>`;
  const faq = [
    [
      'זה מותר לפי הכללים של גוגל?',
      'כן. גוגל אוסרת להסתיר את האפשרות לכתוב ביקורת מלקוחות לא מרוצים ("Review gating"). אצלנו כל לקוח יכול לכתוב ביקורת בגוגל. ההבדל הוא שללקוח לא מרוצה אנחנו מציעים קודם ערוץ ישיר אליכם, כדי שתוכלו לתקן.',
    ],
    ['הלקוח צריך להוריד אפליקציה?', 'לא. סורקים QR או לוחצים על קישור, והסקר נפתח בדפדפן. זה לוקח פחות מדקה.'],
    ['כמה זמן לוקח להתחיל?', 'כמה דקות: נרשמים, מדביקים את הקישור לביקורות בגוגל, ומדפיסים את שלט ה-QR.'],
    ['אפשר לשנות את השאלות?', 'כן. בוחרים שאלות, סוגי תשובות, ולמי כל שאלה מוצגת: לכולם, רק למרוצים או רק ללא מרוצים.'],
    ['מה עם פרטיות הלקוחות שלי?', 'המידע שייך לכם, לא מוצג לאף אחד אחר ולא נמכר. פרטים מלאים ב<a href="/privacy">מדיניות הפרטיות</a>.'],
  ];
  const cta = signupOpen ? '<a class="btn accent big-inline" href="/register">להתחיל בחינם</a>' : '<a class="btn accent big-inline" href="/login">כניסה</a>';
  return sitePage({
    title: `${operatorInfo().brand} · יותר ביקורות טובות, פחות לקוחות כועסים`,
    description: 'מערכת לאיסוף משוב מלקוחות, הגדלת ביקורות בגוגל וטיפול בלקוחות לא מרוצים. QR, סקר קצר, התראות ו-AI.',
    signupOpen,
    body: `
<section class="hero">
  <div class="hero-text">
    <span class="hero-pill"><b>חדש</b>עוזר AI שמנסח תשובות ללקוחות</span>
    <h1>מערכת לניהול ביקורות ושביעות רצון, <em>לעסקים בישראל</em></h1>
    <p class="lead">QR לכל סניף, סקר קצר ללקוח, הפניה של מרוצים לגוגל, וטיפול מסודר בכל לקוח שלא היה מרוצה. הכול במקום אחד, בעברית.</p>
    <div class="actions">${cta}<a class="btn big-inline" href="#how">איך זה עובד</a></div>
    <div class="checks">
      <span>${icon('check', 18)}בלי כרטיס אשראי</span>
      <span>${icon('check', 18)}בעברית מלאה</span>
      <span>${icon('check', 18)}עומד בכללי גוגל</span>
    </div>
  </div>
  ${heroVisual()}
</section>

<section class="band" id="how">
  <h2>איך זה עובד</h2>
  <div class="steps">
    <div class="step"><div class="step-n">1</div><h3>הלקוח סורק</h3><p>QR על השולחן, בקופה או על הקבלה. או קישור אישי שנשלח אחרי הקנייה.</p></div>
    <div class="step"><div class="step-n">2</div><h3>מדרג ועונה</h3><p>דירוג בכוכבים ושאלה או שתיים שמותאמות לדירוג שנתן.</p></div>
    <div class="step"><div class="step-n">3</div><h3>המסך הנכון</h3><p>מרוצה? כפתור לביקורת בגוגל. לא מרוצה? טופס שמגיע אליכם עם התראה מיידית.</p></div>
  </div>
</section>

<section class="band alt" id="features">
  <h2>כל מה שצריך כדי לנהל את המוניטין</h2>
  <div class="features">
    ${features.map(([ic, t, d]) => `<div class="feature"><div class="f-icon">${icon(ic, 22)}</div><h3>${h(t)}</h3><p>${h(d)}</p></div>`).join('')}
  </div>
</section>

<section class="band" id="pricing">
  <h2>מחירים</h2>
  <div class="plans">
    ${plans
      .map(
        ([key, p]) => `<div class="plan ${key === 'pro' ? 'featured' : ''}">
          ${key === 'pro' ? '<div class="plan-tag">הכי פופולרי</div>' : ''}
          <h3>${h(p.label)}</h3>
          <div class="plan-price">${price(p)}</div>
          <ul>
            <li>${limitLabel(p.campaigns)} ${p.campaigns === 1 ? 'קמפיין (סניף / QR)' : 'קמפיינים'}</li>
            <li>${limitLabel(p.teamMembers)} ${p.teamMembers === 1 ? 'משתמש' : 'משתמשים'}</li>
            <li>${limitLabel(p.monthlyResponses)} דירוגים בחודש</li>
            ${Object.entries(FEATURE_LABELS)
              .map(([k, label]) => `<li class="${p[k] ? '' : 'off'}">${p[k] ? '✓' : '✗'} ${h(label)}</li>`)
              .join('')}
          </ul>
        </div>`,
      )
      .join('')}
  </div>
</section>

<section class="band alt" id="faq">
  <h2>שאלות נפוצות</h2>
  <div class="faq">
    ${faq.map(([q, a]) => `<details><summary>${h(q)}</summary><p>${a}</p></details>`).join('')}
  </div>
</section>

<section class="band final">
  <h2>מתחילים לאסוף ביקורות עוד היום</h2>
  ${cta}
</section>`,
  });
}

// ---------------------------------------------------------------- legal

const UPDATED = '27.9.2026';

function legalPage({ title, sections, signupOpen }) {
  return sitePage({
    title,
    signupOpen,
    body: `<main class="legal">
      <h1>${h(title)}</h1>
      <p class="muted">עודכן לאחרונה: ${UPDATED}</p>
      ${sections.map(([heading, html]) => `<h2>${h(heading)}</h2>${html}`).join('')}
    </main>`,
  });
}

export function privacyView({ signupOpen }) {
  const op = operatorInfo();
  const contact = op.email ? `<a href="mailto:${h(op.email)}">${h(op.email)}</a>` : 'דרך פרטי הקשר שבאתר';
  return legalPage({
    title: 'מדיניות פרטיות',
    signupOpen,
    sections: [
      [
        'כללי',
        `<p>${h(op.brand)} ("השירות") מופעל על ידי ${h(op.name)} ("אנחנו"). השירות מאפשר לעסקים ("העסק") לאסוף משוב מהלקוחות שלהם.
        מדיניות זו מסבירה איזה מידע נאסף, למה, ומה הזכויות שלכם, בהתאם לחוק הגנת הפרטיות, התשמ"א-1981 ולתקנות שלו.</p>`,
      ],
      [
        'אם מילאתם סקר של עסק',
        `<p>המידע שמסרתם נאסף עבור העסק שביקשו מכם לדרג, והוא האחראי העיקרי עליו. אנחנו מעבדים אותו בשמו ולפי הנחיותיו.</p>
        <ul>
          <li><b>מה נאסף:</b> הדירוג, התשובות לשאלות, ההערות שכתבתם, ואם בחרתם למסור: שם, טלפון ואימייל.</li>
          <li><b>למה:</b> כדי שהעסק ישפר את השירות, ואם ביקשתם, כדי שיחזור אליכם.</li>
          <li><b>פרסום:</b> הערה שלכם תוצג באתר העסק רק אם סימנתם שאתם מסכימים לכך, ותמיד עם השם הפרטי בלבד.</li>
          <li><b>עוגייה:</b> אנחנו שומרים בדפדפן מזהה אקראי (vid) כדי לספור ביקורים ולא לספור אתכם פעמיים. הוא לא מזהה אתכם אישית.</li>
          <li><b>קישור לגוגל או לאתרים אחרים:</b> אם תלחצו על כתיבת ביקורת, תעברו לאתר של גוגל או של הפלטפורמה שבחרתם, ויחולו עליכם התנאים שלהם.</li>
        </ul>
        <p>למסירת הפרטים אין חובה חוקית. בקשות לעיון, תיקון או מחיקה אפשר להפנות לעסק עצמו או אלינו.</p>`,
      ],
      [
        'אם אתם בעלי עסק שמשתמש בשירות',
        `<ul>
          <li><b>מה נאסף:</b> שם, אימייל, סיסמה (שמורה מוצפנת ואיננו יכולים לקרוא אותה), פרטי העסק, והגדרות החשבון.</li>
          <li><b>עוגיות:</b> עוגיית התחברות (sid) ועוגייה שזוכרת איזה עסק בחרתם (biz). הן נחוצות כדי שהשירות יעבוד.</li>
          <li><b>שימוש:</b> לתפעול השירות, אבטחה, שליחת התראות ודוחות שביקשתם, ויצירת קשר בנושא החשבון.</li>
        </ul>`,
      ],
      [
        'עם מי המידע משותף',
        `<p>איננו מוכרים מידע ולא משתמשים בו לפרסום. המידע מועבר רק לספקים שנחוצים להפעלת השירות:</p>
        <ul>
          <li>ספק האחסון שעליו רץ השירות.</li>
          <li>ספק שליחת הדואר, לצורך התראות, הזמנות ותזכורות.</li>
          <li>Anthropic, ספקית עוזר ה-AI, רק כשהעסק מפעיל ניסוח תשובה או סיכום תובנות. במקרה כזה נשלחים המשוב ושם הלקוח, לצורך יצירת הטקסט בלבד.</li>
          <li>שירותי אוטומציה שהעסק עצמו חיבר (Webhook).</li>
        </ul>
        <p>ייתכן שחלק מהספקים שומרים מידע מחוץ לישראל. נמסור מידע לרשויות רק כשהחוק מחייב.</p>`,
      ],
      [
        'אבטחת מידע',
        `<p>החיבור לשירות מוצפן, סיסמאות נשמרות מוצפנות, הגישה לכל עסק מוגבלת לצוות שלו לפי הרשאות, ומתבצעים גיבויים.
        אין מערכת חסינה לחלוטין, ואם יקרה אירוע אבטחה משמעותי נפעל ונדווח כנדרש בחוק.</p>`,
      ],
      [
        'כמה זמן המידע נשמר',
        '<p>משובים נשמרים כל עוד העסק משתמש בשירות, או עד שהעסק מוחק אותם. כשחשבון עסק נסגר, המידע שלו נמחק תוך זמן סביר, למעט גיבויים שנמחקים במחזור הרגיל שלהם.</p>',
      ],
      [
        'הזכויות שלכם',
        `<p>יש לכם זכות לעיין במידע עליכם, לבקש לתקן אותו או למחוק אותו. אפשר לפנות אלינו ${contact}, ונענה בתוך 30 יום.</p>`,
      ],
      ['שינויים במדיניות', '<p>אם נשנה את המדיניות באופן מהותי, נעדכן כאן ונשנה את תאריך העדכון.</p>'],
      ['יצירת קשר', `<p>${h(op.name)} · ${contact}</p>`],
    ],
  });
}

export function termsView({ signupOpen }) {
  const op = operatorInfo();
  const contact = op.email ? `<a href="mailto:${h(op.email)}">${h(op.email)}</a>` : 'דרך פרטי הקשר שבאתר';
  return legalPage({
    title: 'תנאי שימוש',
    signupOpen,
    sections: [
      [
        'כללי',
        `<p>התנאים חלים על כל מי שפותח חשבון ב${h(op.brand)} ("השירות"), המופעל על ידי ${h(op.name)}. ההרשמה מהווה הסכמה לתנאים ול<a href="/privacy">מדיניות הפרטיות</a>.</p>`,
      ],
      [
        'החשבון',
        `<ul>
          <li>אתם אחראים לשמור על הסיסמה ועל כל פעולה שנעשית בחשבון, כולל על ידי עובדים שהזמנתם.</li>
          <li>הפרטים שמסרתם צריכים להיות נכונים, ואתם מוסמכים לפעול בשם העסק.</li>
        </ul>`,
      ],
      [
        'האחריות שלכם כלפי הלקוחות שלכם',
        `<ul>
          <li>אתם האחראים על המידע שאתם אוספים מהלקוחות שלכם דרך השירות, ועל השימוש בו.</li>
          <li>שלחו בקשות דירוג (בוואטסאפ, SMS או מייל) רק ללקוחות אמיתיים שלכם, בהתאם לחוק, כולל הוראות חוק התקשורת בנוגע להודעות שיווקיות.</li>
          <li>אל תשתמשו בשירות כדי לאסוף מידע שאינו נחוץ, או מידע רגיש.</li>
        </ul>`,
      ],
      [
        'ביקורות ופלטפורמות חיצוניות',
        `<ul>
          <li>אסור לכתוב ביקורות מזויפות, לבקש מעובדים או ממכרים לכתוב ביקורות, או לתת הטבה או תשלום בתמורה לביקורת.</li>
          <li>אסור להשתמש בשירות כדי למנוע מלקוחות לכתוב ביקורת, לבקש מהם להסיר ביקורת, או לאיים עליהם.</li>
          <li>עליכם לעמוד במדיניות של גוגל ושל כל פלטפורמה אחרת שאליה אתם מפנים. איננו אחראים להחלטות שלהן, כמו הסרת ביקורות או השעיית פרופיל.</li>
        </ul>`,
      ],
      [
        'תוכניות ותשלום',
        '<p>לכל תוכנית יש מגבלות ופיצ\'רים כפי שמפורט בעמוד המחירים. נוכל לעדכן מחירים ותוכניות בהודעה מראש. תוכנית בתשלום מתחדשת עד שתבטלו אותה, וביטול נכנס לתוקף בסוף תקופת החיוב.</p>',
      ],
      [
        'זמינות ושינויים בשירות',
        '<p>אנחנו עושים מאמץ שהשירות יהיה זמין ותקין, אבל הוא ניתן כמו שהוא (AS IS), ועלולות להיות תקלות והפסקות. אנחנו רשאים לשפר, לשנות או להפסיק חלקים מהשירות. טקסטים שיוצר עוזר ה-AI הם טיוטות, ובאחריותכם לקרוא ולערוך אותם לפני שליחה.</p>',
      ],
      [
        'הגבלת אחריות',
        '<p>ככל שהחוק מתיר, לא נהיה אחראים לנזק עקיף או תוצאתי, לאובדן הכנסות או לאובדן מוניטין, והאחריות הכוללת שלנו מוגבלת לסכום ששילמתם עבור השירות ב-12 החודשים שלפני האירוע.</p>',
      ],
      [
        'סיום',
        '<p>אפשר לסגור את החשבון בכל עת. נוכל להשעות או לסגור חשבון שמפר את התנאים, ובמקרים שאינם דחופים נודיע מראש. אפשר לייצא את הנתונים לקובץ CSV לפני הסגירה.</p>',
      ],
      ['דין וסמכות שיפוט', '<p>על התנאים יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.</p>'],
      ['יצירת קשר', `<p>${h(op.name)} · ${contact}</p>`],
    ],
  });
}
