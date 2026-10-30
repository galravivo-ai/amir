import { h, safeNext } from '../util.js';
import { PLANS, TRIAL_DAYS } from '../plans.js';

/** Before signing up: how the start works and what is charged when. */
const startTerms = (trialOpen) =>
  trialOpen === 'free'
    ? `<div class="start-terms"><b>${TRIAL_DAYS} ימים חינם, בלי כרטיס אשראי</b>
        <ul><li>נרשמים ומתחילים מיד, עם כל האפשרויות.</li>
        <li>בסוף הניסיון בוחרים מסלול: ₪${PLANS.basic.price} או ₪${PLANS.pro.price} לחודש (כולל מע״מ), ו-20% הנחה על כל סניף נוסף.</li>
        <li>לא בחרתם? הסקרים פשוט נעצרים, בלי שום חיוב, והנתונים נשמרים.</li></ul>
        <a href="/terms#billing" target="_blank">התנאים המלאים</a></div>`
    : trialOpen
    ? `<div class="start-terms"><b>${TRIAL_DAYS} ימים חינם, ואז ממשיכים רק אם מתאים</b>
        <ul><li>אחרי ההרשמה בוחרים מסלול ושומרים כרטיס בדף המאובטח של קארדקום. <b>היום לא מחויבים.</b></li>
        <li>בסוף הניסיון מתחיל המנוי: ₪${PLANS.basic.price} או ₪${PLANS.pro.price} לחודש (כולל מע״מ, 20% הנחה על כל סניף נוסף), ומתחדש כל חודש.</li>
        <li>יום לפני הסוף נשלח מייל עם הסכום והתאריך. מבטלים בקליק לפני כן, ולא מחויבים בכלל.</li></ul>
        <a href="/terms#billing" target="_blank">התנאים המלאים</a></div>`
    : `<div class="start-terms"><b>מה קורה אחרי ההרשמה?</b>
        <ul><li>בוחרים מסלול: ₪${PLANS.basic.price} או ₪${PLANS.pro.price} לחודש (כולל מע״מ), ו-20% הנחה על כל סניף נוסף. בלי התחייבות.</li>
        <li>מחברים את פרופיל העסק בגוגל, והנתונים נטענים לבד.</li></ul>
        <a href="/terms#billing" target="_blank">התנאים המלאים</a></div>`;
import { GOOGLE_G } from './google.js';
import { isEn } from '../lang.js';

/** A password field with a show/hide button. */
let pwCount = 0;
const pwField = (label, { name = 'password', autocomplete = 'current-password', min = 0, hint = '' } = {}) => {
  const id = `pw-${++pwCount}`;
  return `<div class="pw-field"><label for="${id}">${label}</label>
    <div class="pw-wrap"><input id="${id}" name="${name}" type="password" required ${min ? `minlength="${min}"` : ''} dir="ltr" autocomplete="${autocomplete}"${hint ? ` aria-describedby="${id}-hint"` : ''}>
      <button type="button" class="pw-toggle" aria-pressed="false" aria-controls="${id}" onclick="var i=document.getElementById(this.getAttribute('aria-controls')),s=i.type==='password';i.type=s?'text':'password';this.setAttribute('aria-pressed',String(s));this.textContent=s?'הסתרה':'הצגה'">הצגה</button></div>
    ${hint ? `<small id="${id}-hint" class="muted">${hint}</small>` : ''}</div>`;
};
/** A new password: the rule shown before typing, and a show/hide button. */
const newPassword = (label) => pwField(label, { autocomplete: 'new-password', min: 8, hint: 'לפחות 8 תווים' });

/** "Continue with Google", then a divider before the email form. */
const googleButton = (href, label, inApp = false) => `${inApp ? `<p class="auth-inapp">${'הדף נפתח בתוך אפליקציה, וגוגל לא מאפשרת להתחבר מכאן. כדי להיכנס עם Google, פותחים את הדף בדפדפן: בתפריט (⋯ או ⋮) בוחרים "פתיחה בדפדפן". אפשר גם להיכנס כאן עם מייל וסיסמה.'}</p>` : ''}<a class="btn big g-btn auth-google" href="${h(href)}">${GOOGLE_G}<span>${label}</span></a>
  <div class="auth-or"><span>או עם מייל וסיסמה</span></div>`;
const termsBoxes = (values) => `<label class="check"><input type="checkbox" name="terms" value="1" required ${values.terms ? 'checked' : ''}>
        <span>קראתי ואני מסכים/ה ל<a href="/terms" target="_blank">תנאי השימוש והתקנון</a> ול<a href="/privacy" target="_blank">מדיניות הפרטיות</a></span></label>
      <label class="check"><input type="checkbox" name="marketing" value="1" ${values.marketing ? 'checked' : ''}>
        <span>אשמח לקבל במייל עדכונים, טיפים והטבות מ-GoFive (דברי פרסומת). אפשר להסיר בכל רגע.</span></label>`;

const csrfField = (csrf) => (csrf ? `<input type="hidden" name="_csrf" value="${h(csrf)}">` : '');
const errorBox = (error) => (error ? `<div class="error">${h(error)}</div>` : '');

export function loginView({ error = '', values = {}, allowSignup, notice = '', next = '', google = false, inApp = false }) {
  const back = safeNext(next);
  const action = back ? `/login?next=${encodeURIComponent(back)}` : '/login';
  return `<div class="auth card">
    <h1>כניסה</h1>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${errorBox(error)}
    ${google ? googleButton(`/auth/google${back ? `?next=${encodeURIComponent(back)}` : ''}`, 'כניסה עם Google', inApp) : ''}
    <form method="post" action="${h(action)}" class="stack">
      <label>אימייל<input name="email" type="email" required value="${h(values.email)}" dir="ltr" autocomplete="email"></label>
      ${pwField('סיסמה')}
      <button class="btn primary">כניסה</button>
    </form>
    <p class="muted"><a href="/forgot">שכחתי סיסמה</a>${allowSignup ? ' · אין חשבון? <a href="/register">להרשמה</a>' : ''}</p>
  </div>`;
}

export function registerView({ error = '', values = {}, invite = null, pass = null, passGone = false, google = false, trialOpen = false, inApp = false }) {
  return `<div class="auth card">
    <h1>${invite ? `הצטרפות ל${h(invite.business_name)}` : 'הרשמה'}</h1>
    ${pass ? `<div class="flash">הוזמנתם ל-<b>${pass.days} ימים חינם</b> במסלול <b>${h(PLANS[pass.plan].label)}</b>, עם כל האפשרויות ובלי כרטיס אשראי.</div>` : ''}
    ${passGone ? '<div class="warn">הקישור להתנסות חינם כבר נוצל או בוטל. אפשר להירשם כרגיל.</div>' : ''}
    ${invite || pass ? '' : startTerms(trialOpen)}
    ${errorBox(error)}
    ${google && !invite ? googleButton(`/auth/google${values.pass ? `?pass=${encodeURIComponent(values.pass)}` : ''}`, 'הרשמה מהירה עם Google', inApp) : ''}
    <form method="post" action="${invite ? `/join/${h(values.token)}` : '/register'}" class="stack">
      ${
        invite
          ? ''
          : `<label>שם העסק או החברה<input name="business" required maxlength="100" value="${h(values.business)}" autocomplete="organization" placeholder="למשל: מסעדת הגפן">
              <small class="muted">כך העסק ייקרא בדשבורד, בסקר ללקוחות ובדוחות.</small></label>`
      }
      <label>השם שלך<input name="name" required maxlength="80" value="${h(values.name)}" autocomplete="name"></label>
      <label>אימייל<input name="email" type="email" required value="${h(invite ? invite.email : values.email)}" dir="ltr" autocomplete="email" ${invite ? 'readonly' : ''}></label>
      ${newPassword('סיסמה')}
      ${values.pass ? `<input type="hidden" name="pass" value="${h(values.pass)}">` : ''}
      ${termsBoxes(values)}
      <button class="btn primary">${invite ? 'יצירת חשבון והצטרפות' : 'יצירת חשבון'}</button>
    </form>
    ${invite ? '' : '<p class="muted">כבר רשומים? <a href="/login">לכניסה</a></p>'}
  </div>`;
}

/** After "Sign up with Google": the business name and the terms, and that's it. */
export function googleSignupView({ who, values = {}, pass = null, error = '', trialOpen = false }) {
  return `<div class="auth card">
    <h1>עוד צעד אחד</h1>
    <p class="auth-who">${GOOGLE_G}<span>נרשמים עם <b dir="ltr">${h(who.email)}</b></span></p>
    ${pass ? `<div class="flash">הוזמנתם ל-<b>${pass.days} ימים חינם</b> במסלול <b>${h(PLANS[pass.plan].label)}</b>, בלי כרטיס אשראי.</div>` : startTerms(trialOpen)}
    ${errorBox(error)}
    <form method="post" action="/register/google" class="stack">
      <label>שם העסק או החברה<input name="business" required maxlength="100" value="${h(values.business)}" autocomplete="organization" placeholder="למשל: מסעדת הגפן" autofocus>
        <small class="muted">כך העסק ייקרא בדשבורד, בסקר ללקוחות ובדוחות.</small></label>
      <label>השם שלך<input name="name" required maxlength="80" value="${h(values.name)}" autocomplete="name"></label>
      ${termsBoxes(values)}
      <button class="btn primary">יצירת חשבון</button>
    </form>
    <p class="muted small"><a href="/register">חזרה</a></p>
  </div>`;
}

export function joinView({ invite, user, csrf, token }) {
  const mismatch = user.email !== invite.email;
  return `<div class="auth card stack">
    <h1>הזמנה ל${h(invite.business_name)}</h1>
    ${
      mismatch
        ? `<div class="error">ההזמנה נשלחה ל-<span dir="ltr">${h(invite.email)}</span> אבל נכנסת בתור <span dir="ltr">${h(user.email)}</span>.
           צאו מהחשבון ופתחו שוב את הקישור.</div>`
        : `<p>הצטרפות לצוות של <b>${h(invite.business_name)}</b>.</p>
           <form method="post" action="/join/${h(token)}">${csrfField(csrf)}<button class="btn primary">הצטרפות</button></form>`
    }
  </div>`;
}

export function forgotView({ sent = false, error = '' }) {
  return `<div class="auth card">
    <h1>שכחתי סיסמה</h1>
    ${
      sent
        ? '<div class="flash">אם האימייל רשום במערכת, נשלח אליו קישור לאיפוס. הקישור בתוקף לשעה.</div>'
        : `${errorBox(error)}
          <form method="post" action="/forgot" class="stack">
            <label>אימייל<input name="email" type="email" required dir="ltr"></label>
            <button class="btn primary">שליחת קישור לאיפוס</button>
          </form>`
    }
    <p class="muted"><a href="/login">חזרה לכניסה</a></p>
  </div>`;
}

export function resetView({ token, error = '' }) {
  return `<div class="auth card">
    <h1>סיסמה חדשה</h1>
    ${errorBox(error)}
    <form method="post" action="/reset/${h(token)}" class="stack">
      ${newPassword('סיסמה חדשה')}
      ${pwField('שוב, לאימות', { name: 'password2', autocomplete: 'new-password', min: 8 })}
      <button class="btn primary">שמירה</button>
    </form>
  </div>`;
}

// Client side of push registration (runs on the account page only).
const PUSH_SCRIPT = `(function () {
  var status = document.getElementById('push-status');
  var on = document.getElementById('push-on'), off = document.getElementById('push-off'), test = document.getElementById('push-test');
  var csrf = document.getElementById('push-csrf').value;
  function say(t) { status.textContent = t; }
  function post(url, data) {
    var body = new URLSearchParams(Object.assign({ _csrf: csrf }, data || {}));
    return fetch(url, { method: 'POST', body: body, credentials: 'same-origin' }).then(function (r) { return r.json(); });
  }
  function toKey(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    say('הדפדפן הזה לא תומך בהתראות. באייפון צריך קודם להוסיף את האתר למסך הבית.');
    return;
  }
  function refresh() {
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      on.hidden = !!sub; off.hidden = !sub; test.hidden = !sub;
      say(sub ? 'ההתראות פעילות במכשיר הזה.' : Notification.permission === 'denied' ? 'ההתראות חסומות בהגדרות הדפדפן עבור האתר הזה.' : 'ההתראות כבויות במכשיר הזה.');
    });
  }
  navigator.serviceWorker.register('/sw.js').then(refresh);
  on.addEventListener('click', function () {
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { say('לא התקבל אישור להתראות.'); return; }
      return fetch('/push/key', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (k) {
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(k.key) });
        });
      }).then(function (sub) {
        return post('/push/subscribe', { endpoint: sub.endpoint, p256dh: b64(sub.getKey('p256dh')), auth: b64(sub.getKey('auth')) });
      }).then(refresh);
    }).catch(function () { say('לא הצלחנו להפעיל התראות. נסו לרענן את הדף.'); });
  });
  off.addEventListener('click', function () {
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      return post('/push/unsubscribe', { endpoint: sub.endpoint }).then(function () { return sub.unsubscribe(); });
    }).then(refresh);
  });
  test.addEventListener('click', function () {
    post('/push/test').then(function (r) { say(r.sent ? 'נשלחה התראת בדיקה.' : 'לא נמצא מכשיר רשום. נסו לכבות ולהפעיל מחדש.'); });
  });
})();`;

export function twoFactorLoginView({ error = '' }) {
  return `<div class="auth card">
    <h1>אימות דו-שלבי</h1>
    <p class="muted">הקלידו את הקוד בן 6 הספרות מאפליקציית האימות בטלפון.</p>
    ${errorBox(error)}
    <form method="post" action="/login/2fa" class="stack">
      <label>קוד אימות<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="12" dir="ltr" autofocus
        style="font-size:1.6rem;letter-spacing:.3em;text-align:center"></label>
      <button class="btn primary">כניסה</button>
    </form>
    <p class="muted small">אין גישה לטלפון? אפשר להקליד במקום זה אחד מקודי הגיבוי שקיבלתם בהפעלה.</p>
    <p class="muted"><a href="/login">חזרה</a></p>
  </div>`;
}

export function twoFactorSetupView({ csrf, qrDataUrl, secret, error = '' }) {
  return `<h1>הפעלת אימות דו-שלבי</h1>
  ${errorBox(error)}
  <div class="grid2">
    <section class="card stack">
      <h3>1. סורקים עם אפליקציית אימות</h3>
      <p class="muted small">Google Authenticator, Microsoft Authenticator, 1Password וכדומה.</p>
      <img src="${h(qrDataUrl)}" alt="קוד לסריקה באפליקציית האימות" width="220" height="220" style="align-self:center;border-radius:12px;border:1px solid var(--line)">
      <p class="muted small">לא מצליחים לסרוק? מקלידים ידנית את המפתח:</p>
      <code dir="ltr" style="font-size:1rem;padding:.5em;text-align:center;word-break:break-all">${h(secret.replace(/(.{4})/g, '$1 ').trim())}</code>
    </section>
    <form method="post" action="/account/2fa/enable" class="card stack">
      ${csrfField(csrf)}
      <h3>2. מקלידים את הקוד שמופיע באפליקציה</h3>
      <label>קוד בן 6 ספרות<input name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="6" dir="ltr"
        style="font-size:1.6rem;letter-spacing:.3em;text-align:center"></label>
      <button class="btn primary">הפעלה</button>
      <a href="/account" class="small">ביטול</a>
    </form>
  </div>`;
}

export function backupCodesView({ codes }) {
  return `<h1>אימות דו-שלבי הופעל</h1>
  <section class="card stack">
    <h3>קודי גיבוי</h3>
    <p>שמרו את הקודים האלה במקום בטוח (למשל מנהל סיסמאות). כל קוד עובד פעם אחת, אם הטלפון לא זמין. <b>הם לא יוצגו שוב.</b></p>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;max-width:360px" dir="ltr">
      ${codes.map((c) => `<code style="font-size:1.05rem;padding:.4em;text-align:center">${h(c)}</code>`).join('')}
    </div>
    <a class="btn primary" href="/account" style="align-self:flex-start">שמרתי, אפשר להמשיך</a>
  </section>`;
}

export function accountView({ user, csrf, error = '', totpEnabled = false, backupLeft = 0, businesses = [], saved = false, marketing = false }) {
  const owned = businesses.filter((b) => b.role === 'owner');
  return `<h1>החשבון שלי</h1>
  ${saved ? '<div class="flash">נשמר.</div>' : ''}
  ${errorBox(error)}
  <div class="grid2">
    <form method="post" action="/account" class="card stack">
      ${csrfField(csrf)}
      <h3>פרטים</h3>
      <label>השם שלך<input name="name" required maxlength="80" value="${h(user.name)}"></label>
      <label>אימייל<input value="${h(user.email)}" dir="ltr" disabled></label>
      <button class="btn primary">שמירה</button>
    </form>
    <form method="post" action="/account/password" class="card stack">
      ${csrfField(csrf)}
      <h3>שינוי סיסמה</h3>
      ${pwField('סיסמה נוכחית', { name: 'current' })}
      ${newPassword('סיסמה חדשה')}
      <button class="btn primary">עדכון סיסמה</button>
      <p class="muted small">שינוי הסיסמה ינתק את כל שאר המכשירים.</p>
    </form>
  </div>
  ${
    owned.length
      ? `<section class="card stack" id="businesses">
          <h3>${owned.length > 1 ? 'שמות העסקים' : 'שם העסק'}</h3>
          <p class="muted small">השם שמופיע בתפריט, בסקר ללקוחות, בהודעות ובדוחות.</p>
          ${owned
            .map(
              (b) => `<form method="post" action="/account/business/${b.id}/name" class="row compact">
                ${csrfField(csrf)}
                <label class="sr-only" for="biz-name-${b.id}">שם העסק</label>
                <input id="biz-name-${b.id}" name="name" required maxlength="100" value="${h(b.name)}">
                <button class="btn">שמירה</button>
              </form>`,
            )
            .join('')}
        </section>`
      : ''
  }
  <form method="post" action="/account/lang" class="card stack" id="lang">
    ${csrfField(csrf)}
    <h3>שפה · Language</h3>
    <div class="row compact">
      <label class="check"><input type="radio" name="lang" value="he" ${isEn() ? '' : 'checked'}><span lang="he">עברית</span></label>
      <label class="check"><input type="radio" name="lang" value="en" ${isEn() ? 'checked' : ''}><span lang="en">English</span></label>
    </div>
    <button class="btn">שמירה</button>
  </form>
  <form method="post" action="/account/marketing" class="card stack" id="marketing">
    ${csrfField(csrf)}
    <h3>עדכונים במייל</h3>
    <label class="check"><input type="checkbox" name="marketing" value="1" ${marketing ? 'checked' : ''}>
      <span>אשמח לקבל במייל עדכונים, טיפים והטבות (דברי פרסומת)</span></label>
    <p class="muted small">הודעות שירות (חשבונית, אבטחה, התראות על ביקורות) נשלחות בכל מקרה.</p>
    <button class="btn">שמירה</button>
  </form>
  <section class="card stack" id="push">
    <h3>התראות לטלפון ולמחשב</h3>
    <p class="muted">התראה קופצת על כל לקוח לא מרוצה, על פנייה שמחכה יותר מדי זמן, ועל לקוח שענה שהטיפול לא עזר.</p>
    <p class="muted small">באייפון: קודם פותחים את האתר ב-Safari, לוחצים "שיתוף" ואז "הוספה למסך הבית", ומפעילים את ההתראות מתוך האפליקציה שנוספה.</p>
    <p id="push-status" class="small" role="status"></p>
    <div class="actions">
      <button type="button" class="btn" data-install hidden>התקנה כאפליקציה</button>
      <button type="button" class="btn primary" id="push-on" hidden>הפעלת התראות במכשיר הזה</button>
      <button type="button" class="btn" id="push-test" hidden>שליחת התראת בדיקה</button>
      <button type="button" class="btn danger" id="push-off" hidden>כיבוי במכשיר הזה</button>
    </div>
    <input type="hidden" id="push-csrf" value="${h(csrf)}">
  </section>
  <script>${PUSH_SCRIPT}</script>
  <section class="card stack" id="2fa">
    <h3>אימות דו-שלבי ${totpEnabled ? '<span class="badge st-ok">פעיל</span>' : '<span class="badge st-closed">כבוי</span>'}</h3>
    <p class="muted">מעבר לסיסמה, בכל כניסה צריך גם קוד מאפליקציה בטלפון. מגן על החשבון גם אם הסיסמה דלפה.</p>
    ${
      totpEnabled
        ? `<p class="small">נשארו ${backupLeft} קודי גיבוי.</p>
          <form method="post" action="/account/2fa/disable" class="row">
            ${csrfField(csrf)}
            <label>סיסמה<input name="password" type="password" required dir="ltr" autocomplete="current-password"></label>
            <label>קוד מהאפליקציה<input name="code" inputmode="numeric" required maxlength="12" dir="ltr"></label>
            <button class="btn danger">כיבוי</button>
          </form>`
        : `<form method="post" action="/account/2fa/setup">${csrfField(csrf)}<button class="btn primary">הפעלת אימות דו-שלבי</button></form>`
    }
  </section>`;
}
