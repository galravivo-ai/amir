import { h } from '../util.js';

const csrfField = (csrf) => (csrf ? `<input type="hidden" name="_csrf" value="${h(csrf)}">` : '');
const errorBox = (error) => (error ? `<div class="error">${h(error)}</div>` : '');

export function loginView({ error = '', values = {}, allowSignup, notice = '', next = '' }) {
  const action = /^\/join\/[\w-]+$/.test(String(next)) ? `/login?next=${encodeURIComponent(next)}` : '/login';
  return `<div class="auth card">
    <h1>כניסה</h1>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${errorBox(error)}
    <form method="post" action="${h(action)}" class="stack">
      <label>אימייל<input name="email" type="email" required value="${h(values.email)}" dir="ltr" autocomplete="email"></label>
      <label>סיסמה<input name="password" type="password" required dir="ltr" autocomplete="current-password"></label>
      <button class="btn primary">כניסה</button>
    </form>
    <p class="muted"><a href="/forgot">שכחתי סיסמה</a>${allowSignup ? ' · אין חשבון? <a href="/register">להרשמה</a>' : ''}</p>
  </div>`;
}

export function registerView({ error = '', values = {}, invite = null }) {
  return `<div class="auth card">
    <h1>${invite ? `הצטרפות ל${h(invite.business_name)}` : 'הרשמה'}</h1>
    ${errorBox(error)}
    <form method="post" action="${invite ? `/join/${h(values.token)}` : '/register'}" class="stack">
      <label>שם<input name="name" required maxlength="80" value="${h(values.name)}" autocomplete="name"></label>
      <label>אימייל<input name="email" type="email" required value="${h(invite ? invite.email : values.email)}" dir="ltr" ${invite ? 'readonly' : ''}></label>
      <label>סיסמה<input name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"></label>
      ${invite ? '' : `<label>שם העסק<input name="business" required maxlength="100" value="${h(values.business)}"></label>`}
      <label class="check"><input type="checkbox" name="terms" value="1" required ${values.terms ? 'checked' : ''}>
        <span>קראתי ואני מסכים/ה ל<a href="/terms" target="_blank">תנאי השימוש</a> ול<a href="/privacy" target="_blank">מדיניות הפרטיות</a></span></label>
      <button class="btn primary">${invite ? 'יצירת חשבון והצטרפות' : 'יצירת חשבון'}</button>
    </form>
    ${invite ? '' : '<p class="muted">כבר רשומים? <a href="/login">לכניסה</a></p>'}
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
      <label>סיסמה חדשה<input name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"></label>
      <label>שוב, לאימות<input name="password2" type="password" required minlength="8" dir="ltr" autocomplete="new-password"></label>
      <button class="btn primary">שמירה</button>
    </form>
  </div>`;
}

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

export function accountView({ user, csrf, error = '', totpEnabled = false, backupLeft = 0 }) {
  return `<h1>החשבון שלי</h1>
  ${errorBox(error)}
  <div class="grid2">
    <form method="post" action="/account" class="card stack">
      ${csrfField(csrf)}
      <h3>פרטים</h3>
      <label>שם<input name="name" required maxlength="80" value="${h(user.name)}"></label>
      <label>אימייל<input value="${h(user.email)}" dir="ltr" disabled></label>
      <button class="btn primary">שמירה</button>
    </form>
    <form method="post" action="/account/password" class="card stack">
      ${csrfField(csrf)}
      <h3>שינוי סיסמה</h3>
      <label>סיסמה נוכחית<input name="current" type="password" required dir="ltr" autocomplete="current-password"></label>
      <label>סיסמה חדשה<input name="password" type="password" required minlength="8" dir="ltr" autocomplete="new-password"></label>
      <button class="btn primary">עדכון סיסמה</button>
      <p class="muted small">שינוי הסיסמה ינתק את כל שאר המכשירים.</p>
    </form>
  </div>
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
