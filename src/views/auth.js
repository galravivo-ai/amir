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

export function accountView({ user, csrf, error = '' }) {
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
  </div>`;
}
