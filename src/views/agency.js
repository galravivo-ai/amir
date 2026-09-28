import { PLANS } from '../plans.js';
import { formatDate, h, safeColor } from '../util.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;

export function agencyView({ agency, agencies, clients, members, csrf, error = '', inviteLink = '', canAdd }) {
  const switcher =
    agencies.length > 1
      ? `<form method="get" action="/agency" class="filters">
          <select name="a" onchange="this.form.submit()" aria-label="סוכנות">${agencies
            .map((a) => `<option value="${a.id}" ${a.id === agency.id ? 'selected' : ''}>${h(a.name)}</option>`)
            .join('')}</select>
        </form>`
      : '';
  const totals = clients.reduce(
    (t, c) => ({ responses: t.responses + c.month_responses, open: t.open + c.open_issues, overdue: t.overdue + c.overdue }),
    { responses: 0, open: 0, overdue: 0 },
  );
  return `<div class="page-head"><div><h1>${h(agency.name)}</h1><p class="muted" style="margin:0">כל העסקים שאתם מנהלים, במקום אחד</p></div>${switcher}</div>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${inviteLink ? `<div class="flash">הלקוח נוצר ונשלחה הזמנה לבעלים. אפשר להעביר גם ידנית: <span dir="ltr">${h(inviteLink)}</span></div>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">לקוחות</div><div class="kpi-value">${clients.length}</div><div class="kpi-hint">מתוך ${agency.max_clients} בחבילה</div></div>
    <div class="kpi"><div class="kpi-label">דירוגים החודש</div><div class="kpi-value">${totals.responses.toLocaleString('he-IL')}</div></div>
    <div class="kpi"><div class="kpi-label">פניות פתוחות</div><div class="kpi-value">${totals.open}</div>
      <div class="kpi-hint ${totals.overdue ? 'down' : 'up'}">${totals.overdue ? `${totals.overdue} באיחור` : 'אין פניות באיחור'}</div></div>
  </div>
  <section class="card">
    <div class="card-head"><h3>לקוחות</h3></div>
    ${
      clients.length
        ? `<table class="table responsive"><thead><tr><th>עסק</th><th>דירוג (30 יום)</th><th>דירוגים החודש</th><th>פניות פתוחות</th><th>תוכנית</th><th></th></tr></thead><tbody>${clients
            .map(
              (c) => `<tr class="${c.overdue ? 'late' : ''}">
                <td data-l="עסק"><b>${h(c.name)}</b><div class="small muted">מאז ${h(formatDate(c.created_at).split(',')[0])}</div></td>
                <td data-l="דירוג">${c.avg_rating ? `<span class="stars-sm">★</span> ${c.avg_rating.toFixed(1)}` : '—'}</td>
                <td data-l="החודש">${c.month_responses}</td>
                <td data-l="פתוחות">${c.open_issues}${c.overdue ? ` <span class="badge st-late">${c.overdue} באיחור</span>` : ''}</td>
                <td data-l="תוכנית">${h(PLANS[c.plan]?.label || c.plan)}</td>
                <td><form method="post" action="/agency/${agency.id}/enter/${c.id}">${csrfField(csrf)}<button class="btn">כניסה ←</button></form></td>
              </tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted">עוד אין לקוחות. פתחו את הראשון בטופס למטה.</p>'
    }
  </section>
  <div class="grid2">
    <section class="card stack">
      <h3>לקוח חדש</h3>
      ${
        canAdd
          ? `<form method="post" action="/agency/${agency.id}/clients" class="stack">
              ${csrfField(csrf)}
              <label>שם העסק<input name="name" required maxlength="100"></label>
              <label>אימייל של בעל העסק (לא חובה)<input name="owner_email" type="email" dir="ltr" placeholder="נשלח לו קישור הצטרפות"></label>
              <button class="btn primary">פתיחת לקוח</button>
            </form>`
          : `<p class="muted">הגעתם למספר הלקוחות בחבילה (${agency.max_clients}). להגדלה פנו למנהל המערכת.</p>`
      }
    </section>
    <form method="post" action="/agency/${agency.id}/branding" class="card stack">
      ${csrfField(csrf)}
      <h3>המיתוג שלכם</h3>
      <p class="muted small">הלקוחות שלכם רואים את השם והצבע האלה במערכת, במקום המיתוג שלנו.</p>
      <label>שם המוצר<input name="brand_name" required maxlength="60" value="${h(agency.brand_name)}"></label>
      <label>צבע ראשי<input name="brand_color" type="color" value="${h(safeColor(agency.brand_color))}"></label>
      <label>קישור ללוגו (לא חובה)<input name="logo_url" dir="ltr" value="${h(agency.logo_url)}" placeholder="https://..."></label>
      ${agency.custom_domain ? `<p class="small">הדומיין שלכם: <b dir="ltr">${h(agency.custom_domain)}</b></p>` : '<p class="muted small">רוצים דומיין משלכם (למשל reviews.agency.co.il)? פנו למנהל המערכת. תצטרכו להוסיף אצל ספק הדומיין רשומת CNAME אחת.</p>'}
      <button class="btn">שמירה</button>
    </form>
  </div>
  <section class="card">
    <h3>אנשי הצוות בסוכנות</h3>
    <p class="small">${members.map((m) => `${h(m.name)} <span class="muted" dir="ltr">${h(m.email)}</span>`).join(' · ')}</p>
  </section>`;
}

function publicHost() {
  try {
    return new URL(process.env.PUBLIC_URL).host;
  } catch {
    return 'הדומיין הראשי';
  }
}

export function agenciesAdminBlock({ agencies, csrf, mainHost = publicHost() }) {
  const planOptions = (cur) =>
    Object.entries(PLANS).map(([k, p]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${h(p.label)}</option>`).join('');
  return `<section class="card stack" id="agencies">
    <h3>סוכנויות</h3>
    ${
      agencies.length
        ? `<table class="table responsive"><thead><tr><th>סוכנות</th><th>לקוחות</th><th>דומיין</th><th>הגדרות</th></tr></thead><tbody>${agencies
            .map(
              (a) => `<tr><td data-l="סוכנות"><b>${h(a.name)}</b><div class="small muted">${a.members} אנשי צוות</div></td>
                <td data-l="לקוחות">${a.clients} / ${a.max_clients}</td>
                <td data-l="דומיין" dir="ltr">${h(a.custom_domain || '—')}</td>
                <td data-l="הגדרות">
                  <form method="post" action="/superadmin/agencies/${a.id}" class="row">
                    ${csrfField(csrf)}
                    <input name="custom_domain" dir="ltr" value="${h(a.custom_domain || '')}" placeholder="reviews.agency.co.il" aria-label="דומיין">
                    <input name="max_clients" type="number" min="1" max="10000" value="${a.max_clients}" aria-label="מספר לקוחות" style="max-width:6rem">
                    <select name="default_plan" aria-label="תוכנית ללקוחות חדשים">${planOptions(a.default_plan)}</select>
                    <button class="btn">שמירה</button>
                  </form>
                  <form method="post" action="/superadmin/agencies/${a.id}/members" class="row">
                    ${csrfField(csrf)}
                    <input name="email" type="email" dir="ltr" placeholder="אימייל של משתמש קיים" aria-label="איש צוות" required>
                    <button class="btn">הוספת איש צוות</button>
                  </form>
                </td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted">עוד אין סוכנויות.</p>'
    }
    <p class="muted small">דומיין לסוכנות: הסוכנות מוסיפה אצל ספק הדומיין רשומת CNAME שמצביעה ל-<b dir="ltr">${h(mainHost)}</b>, ואתם רושמים את הדומיין כאן. בשרת משלכם תעודת ה-HTTPS יוצאת לבד בכניסה הראשונה. ב-Railway צריך להוסיף את הדומיין גם ב-Settings → Networking.</p>
    <form method="post" action="/superadmin/agencies" class="row">
      ${csrfField(csrf)}
      <label>שם הסוכנות<input name="name" required maxlength="100"></label>
      <label>אימייל של מנהל הסוכנות (משתמש קיים)<input name="email" type="email" dir="ltr" required></label>
      <button class="btn primary">יצירת סוכנות</button>
    </form>
  </section>`;
}
