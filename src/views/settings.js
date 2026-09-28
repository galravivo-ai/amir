import { FEATURE_LABELS, limitLabel, PLANS } from '../plans.js';
import { ROLES } from '../store.js';
import { formatDate, h, logoSrc } from '../util.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;
const checked = (on) => (on ? 'checked' : '');

// ---------------------------------------------------------------- business

export function businessView({ business, csrf, plan, error = '' }) {
  return `<h1>הגדרות עסק</h1>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <div class="grid2">
    <form method="post" action="/admin/business" class="stack card">
      ${csrfField(csrf)}
      <h3>מיתוג</h3>
      <label>שם העסק<input name="name" required maxlength="100" value="${h(business.name)}"></label>
      <label>צבע מותג<input name="brand_color" type="color" value="${h(business.brand_color)}"></label>
      ${
        business.logo_version
          ? ''
          : `<label>קישור ללוגו שכבר נמצא באינטרנט (או העלאת קובץ למטה)<input name="logo_url" dir="ltr" value="${h(business.logo_url)}" placeholder="https://..."></label>`
      }
      <button class="btn primary">שמירה</button>
    </form>

    <form method="post" action="/admin/business/notifications" class="stack card" id="notifications">
      ${csrfField(csrf)}
      <h3>התראות וזמני טיפול</h3>
      <label class="check"><input type="checkbox" name="alert_negative" value="1" ${checked(business.alert_negative)}> מייל מיידי על כל לקוח לא מרוצה</label>
      <label class="check"><input type="checkbox" name="weekly_report" value="1" ${checked(business.weekly_report)}> דוח שבועי במייל (ימי ראשון בבוקר)</label>
      <label class="check"><input type="checkbox" name="followup_auto" value="1" ${checked(business.followup_auto)}> כשפנייה מסומנת "טופל", לשלוח ללקוח במייל שאלה אם הטיפול עזר</label>
      <label>למי לשלוח
        <input name="alert_emails" dir="ltr" value="${h(business.alert_emails)}" placeholder="ריק = כל הבעלים והמנהלים בצוות">
      </label>
      <label>פנייה נחשבת "באיחור" אחרי
        <select name="sla_hours">${[
          [0, 'ללא מעקב'],
          [2, 'שעתיים'],
          [4, '4 שעות'],
          [12, '12 שעות'],
          [24, '24 שעות'],
          [48, '48 שעות'],
          [72, '72 שעות'],
        ]
          .map(([v, l]) => `<option value="${v}" ${business.sla_hours === v ? 'selected' : ''}>${l}</option>`)
          .join('')}</select>
      </label>
      <p class="muted small">פנייה באיחור מסומנת באדום, ונשלחת עליה תזכורת במייל פעם אחת.</p>
      <label>Webhook (Make / Zapier / n8n)
        <input name="webhook_url" dir="ltr" value="${h(business.webhook_url)}" placeholder="https://hook.make.com/...">
      </label>
      <p class="muted small">בכל משוב שהושלם נשלחת בקשת POST עם JSON (אירוע <code>feedback.negative</code> או <code>feedback.positive</code>).</p>
      <button class="btn primary">שמירה</button>
    </form>
  </div>

  <section class="card stack" id="logo">
    <h3>לוגו</h3>
    <div class="logo-row">
      ${logoSrc(business) ? `<img class="logo-preview" src="${h(logoSrc(business))}" alt="הלוגו הנוכחי">` : '<div class="logo-preview empty">אין לוגו</div>'}
      <form method="post" action="/admin/business/logo?_csrf=${h(csrf)}" enctype="multipart/form-data" class="stack">
        <label>העלאת קובץ (PNG, JPG, WebP או GIF, עד 1MB)
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif" required>
        </label>
        <div class="actions">
          <button class="btn primary">העלאה</button>
        </div>
      </form>
      ${
        business.logo_version
          ? `<form method="post" action="/admin/business/logo/delete">${csrfField(csrf)}<button class="btn danger">הסרת הלוגו</button></form>`
          : ''
      }
    </div>
    <p class="muted small">הלוגו מופיע בראש הסקר ללקוחות ובשלט ה-QR להדפסה. מומלץ תמונה רחבה על רקע שקוף או לבן.</p>
  </section>

  <div class="grid2">
    <section class="card stack">
      <h3>התוכנית: ${h(plan.label)}</h3>
      <p class="muted small">פרטי השימוש והמגבלות בעמוד <a href="/admin/plan">התוכנית שלי</a>.</p>
    </section>
    <section class="card stack">
      <h3>עסק נוסף</h3>
      <p class="muted small">מנהלים כמה עסקים או לקוחות? כל עסק עם מיתוג, צוות, קמפיינים ונתונים נפרדים.</p>
      <form method="post" action="/admin/businesses" class="row">
        ${csrfField(csrf)}
        <input name="name" required maxlength="100" placeholder="שם העסק החדש">
        <button class="btn">הוספה</button>
      </form>
    </section>
  </div>`;
}

// ---------------------------------------------------------------- team

export function teamView({ members, invites, csrf, me, plan, seatsUsed, inviteLink, error }) {
  const roleOptions = (current) =>
    Object.entries(ROLES)
      .map(([k, v]) => `<option value="${k}" ${current === k ? 'selected' : ''}>${h(v)}</option>`)
      .join('');
  return `<h1>צוות</h1>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${
    inviteLink
      ? `<div class="flash">ההזמנה נשלחה במייל. אפשר גם להעביר את הקישור ידנית (בתוקף 7 ימים):<br><span dir="ltr">${h(inviteLink)}</span></div>`
      : ''
  }
  <div class="grid2">
    <section class="card">
      <h3>חברי צוות (${seatsUsed} מתוך ${limitLabel(plan.teamMembers)})</h3>
      <table class="table">
        <thead><tr><th>שם</th><th>תפקיד</th><th></th></tr></thead>
        <tbody>${members
          .map(
            (m) => `<tr>
              <td>${h(m.name)}${m.id === me.id ? ' <span class="muted small">(את/ה)</span>' : ''}<div class="small muted" dir="ltr">${h(m.email)}</div></td>
              <td><form method="post" action="/admin/team/members/${m.id}" class="inline">
                ${csrfField(csrf)}
                <select name="role" onchange="this.form.submit()" aria-label="תפקיד">${roleOptions(m.role)}</select>
              </form></td>
              <td><form method="post" action="/admin/team/members/${m.id}" data-name="${h(m.name)}" onsubmit="return confirm('להסיר את ' + this.dataset.name + ' מהצוות?')">
                ${csrfField(csrf)}<input type="hidden" name="action" value="remove">
                <button class="btn-link danger-text">הסרה</button>
              </form></td>
            </tr>`,
          )
          .join('')}</tbody>
      </table>
      ${
        invites.length
          ? `<h4>הזמנות ממתינות</h4><table class="table"><tbody>${invites
              .map(
                (i) => `<tr><td dir="ltr">${h(i.email)}</td><td>${h(ROLES[i.role])}</td>
                  <td><form method="post" action="/admin/team/invites/${i.id}/delete">${csrfField(csrf)}<button class="btn-link">ביטול</button></form></td></tr>`,
              )
              .join('')}</tbody></table>`
          : ''
      }
    </section>
    <section class="card stack">
      <h3>הזמנת משתמש</h3>
      <form method="post" action="/admin/team/invite" class="stack">
        ${csrfField(csrf)}
        <label>אימייל<input name="email" type="email" required dir="ltr"></label>
        <label>תפקיד<select name="role">${roleOptions('manager')}</select></label>
        <button class="btn primary">שליחת הזמנה</button>
      </form>
      <dl class="dl small">
        <dt>בעלים</dt><dd>הכול, כולל הגדרות העסק, צוות ומחיקה</dd>
        <dt>מנהל</dt><dd>קמפיינים, טיפול בפניות, שליחת בקשות ו-AI</dd>
        <dt>צפייה בלבד</dt><dd>לוח בקרה ותגובות, בלי לשנות דבר</dd>
      </dl>
    </section>
  </div>`;
}

// ---------------------------------------------------------------- widget

export function widgetView({ business, baseUrl, csrf, available, published, pending, canEdit }) {
  if (!available) {
    return `<h1>ווידג'ט ביקורות לאתר</h1>
      <div class="card empty"><p>הצגת המלצות של לקוחות באתר העסק זמינה בתוכנית מקצועי ומעלה.</p>
      <a class="btn" href="/admin/plan">פרטים על התוכניות</a></div>`;
  }
  const snippet = `<div id="reviews-widget"></div>\n<script src="${baseUrl}/widget/${business.widget_key}.js" async></script>`;
  const row = (r, action) => `<tr>
      <td><span class="stars-sm">${'★'.repeat(r.rating)}</span></td>
      <td class="clip">${h(r.comment)}<div class="small muted">${h(r.customer_name || 'לקוח')} · ${h(formatDate(r.created_at))}</div></td>
      <td>${
        action
          ? `<form method="post" action="/admin/responses/${r.id}/publish">${csrfField(csrf)}
              <input type="hidden" name="published" value="${action === 'publish' ? 1 : 0}">
              <button class="btn ${action === 'publish' ? 'primary' : ''}">${action === 'publish' ? 'פרסום' : 'הסרה'}</button></form>`
          : ''
      }</td></tr>`;
  return `<h1>ווידג'ט ביקורות לאתר</h1>
  <p class="muted">המלצות של לקוחות מרוצים שאישרו פרסום, מוצגות באתר שלכם. אתם מחליטים מה עולה.</p>
  <div class="grid2">
    <section class="card stack">
      <h3>קוד להטמעה</h3>
      <p class="muted small">מדביקים באתר (וורדפרס, Wix, כל אתר) במקום שבו רוצים שההמלצות יופיעו:</p>
      <textarea readonly rows="3" dir="ltr" onclick="this.select()">${h(snippet)}</textarea>
      <a class="btn" href="/widget/${h(business.widget_key)}" target="_blank" rel="noopener">תצוגה מקדימה</a>
      ${
        canEdit
          ? `<form method="post" action="/admin/widget" class="stack">${csrfField(csrf)}
              <label class="check"><input type="checkbox" name="widget_auto_publish" value="1" ${checked(business.widget_auto_publish)}>
                לפרסם אוטומטית כל המלצה חדשה שהלקוח אישר לפרסם</label>
              <button class="btn">שמירה</button></form>`
          : ''
      }
    </section>
    <section class="card">
      <h3>ממתינות לאישור (${pending.length})</h3>
      ${pending.length ? `<table class="table"><tbody>${pending.map((r) => row(r, 'publish')).join('')}</tbody></table>` : '<p class="muted">אין המלצות חדשות.</p>'}
    </section>
  </div>
  <section class="card">
    <h3>מפורסמות באתר (${published.length})</h3>
    ${published.length ? `<table class="table"><tbody>${published.map((r) => row(r, 'unpublish')).join('')}</tbody></table>` : '<p class="muted">עדיין לא פורסמו המלצות.</p>'}
  </section>`;
}

// ---------------------------------------------------------------- plan

export function planView({ business, plan, usage }) {
  const meter = (label, used, max) => {
    const pct = max === Infinity ? 0 : Math.min(100, (used / max) * 100);
    return `<div class="meter-row"><div class="meter-head"><span>${h(label)}</span><span>${used} / ${limitLabel(max)}</span></div>
      <div class="dist-bar"><span class="${pct >= 100 ? 'bad' : pct >= 80 ? 'mid' : 'good'}" style="width:${pct}%"></span></div></div>`;
  };
  return `<h1>התוכנית שלי</h1>
  <section class="card stack">
    <h3>${h(business.name)}: תוכנית ${h(plan.label)}</h3>
    ${meter('קמפיינים', usage.campaigns, plan.campaigns)}
    ${meter('משתמשים בצוות', usage.members, plan.teamMembers)}
    ${meter('דירוגים החודש', usage.responses, plan.monthlyResponses)}
  </section>
  <section class="card">
    <h3>השוואת תוכניות</h3>
    <table class="table">
      <thead><tr><th></th>${Object.entries(PLANS)
        .map(([k, p]) => `<th>${h(p.label)}${k === business.plan ? ' ✓' : ''}</th>`)
        .join('')}</tr></thead>
      <tbody>
        <tr><td>קמפיינים</td>${Object.values(PLANS).map((p) => `<td>${limitLabel(p.campaigns)}</td>`).join('')}</tr>
        <tr><td>משתמשים</td>${Object.values(PLANS).map((p) => `<td>${limitLabel(p.teamMembers)}</td>`).join('')}</tr>
        <tr><td>דירוגים בחודש</td>${Object.values(PLANS).map((p) => `<td>${limitLabel(p.monthlyResponses)}</td>`).join('')}</tr>
        ${Object.entries(FEATURE_LABELS)
          .map(([k, label]) => `<tr><td>${h(label)}</td>${Object.values(PLANS).map((p) => `<td>${p[k] ? '✓' : '—'}</td>`).join('')}</tr>`)
          .join('')}
      </tbody>
    </table>
    <p class="muted small">לשינוי תוכנית פנו למנהל המערכת. תשלום אונליין יתווסף בהמשך.</p>
  </section>`;
}

// ---------------------------------------------------------------- AI insights

/** Renders the model's markdown-ish output (## headings, - bullets) safely. */
export function renderInsight(text) {
  const out = [];
  let list = false;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
    if (list && !bullet) {
      out.push('</ul>');
      list = false;
    }
    if (!line) continue;
    const inline = (s) => h(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (line.startsWith('#')) out.push(`<h4>${inline(line.replace(/^#+\s*/, ''))}</h4>`);
    else if (bullet) {
      if (!list) {
        out.push('<ul>');
        list = true;
      }
      out.push(`<li>${inline(line.replace(/^([-*•]|\d+[.)])\s+/, ''))}</li>`);
    } else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

export function insightsView({ insights, campaigns, csrf, aiConfigured, planAllows, canGenerate, error }) {
  let form = '';
  if (!aiConfigured) {
    form = `<p class="muted">עוזר ה-AI לא מוגדר בשרת. כדי להפעיל אותו צריך להגדיר את משתנה הסביבה <code>ANTHROPIC_API_KEY</code>.</p>`;
  } else if (!planAllows) {
    form = `<p class="muted">תובנות AI זמינות בתוכנית מקצועי ומעלה. <a href="/admin/plan">פרטים</a></p>`;
  } else if (canGenerate) {
    form = `<form method="post" action="/admin/insights" class="row" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='מנתח... (עד דקה)'">
      ${csrfField(csrf)}
      <select name="campaign" aria-label="קמפיין"><option value="">כל הקמפיינים</option>${campaigns
        .map((c) => `<option value="${c.id}">${h(c.name)}</option>`)
        .join('')}</select>
      <select name="days" aria-label="תקופה"><option value="7">7 ימים</option><option value="30" selected>30 ימים</option><option value="90">90 ימים</option></select>
      <button class="btn primary">הפקת תובנות</button>
    </form>`;
  }
  return `<h1>תובנות AI</h1>
  <p class="muted">ה-AI קורא את המשובים של הלקוחות (עד 300 האחרונים בתקופה) ומסכם מה עובד, מה צריך לתקן ומה לעשות השבוע.</p>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <section class="card">${form}</section>
  ${
    insights.length
      ? insights
          .map(
            (i) => `<section class="card insight">
              <div class="muted small">${h(formatDate(i.created_at))} · ${h(i.campaign_name || 'כל הקמפיינים')} · ${i.days} ימים · ${i.response_count} משובים${i.author ? ` · ${h(i.author)}` : ''}</div>
              ${renderInsight(i.content)}
            </section>`,
          )
          .join('')
      : ''
  }`;
}

// ---------------------------------------------------------------- superadmin

const MAIL_KINDS = {
  negative_alert: 'התראת לקוח לא מרוצה',
  sla_alert: 'פנייה באיחור',
  weekly_report: 'דוח שבועי',
  customer_invite: 'בקשת דירוג ללקוח',
  customer_reminder: 'תזכורת ללקוח',
  team_invite: 'הזמנה לצוות',
  password_reset: 'איפוס סיסמה',
};

export function superadminView({ businesses, users, outbox, csrf, mailEnabled, aiEnabled, meId }) {
  const planSelect = (b) => `<form method="post" action="/superadmin/businesses/${b.id}/plan" class="inline">
      ${csrfField(csrf)}
      <select name="plan" onchange="this.form.submit()" aria-label="תוכנית">${Object.entries(PLANS)
        .map(([k, p]) => `<option value="${k}" ${b.plan === k ? 'selected' : ''}>${h(p.label)}</option>`)
        .join('')}</select></form>`;
  return `<h1>ניהול מערכת</h1>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">עסקים</div><div class="kpi-value">${businesses.length}</div></div>
    <div class="kpi"><div class="kpi-label">משתמשים</div><div class="kpi-value">${users.length}</div></div>
    <div class="kpi"><div class="kpi-label">שליחת מיילים</div><div class="kpi-value small-value">${mailEnabled ? 'SMTP פעיל' : 'רישום בלבד'}</div>
      <div class="kpi-hint">${mailEnabled ? '' : 'הגדירו SMTP_URL כדי לשלוח בפועל'}</div></div>
    <div class="kpi"><div class="kpi-label">עוזר AI</div><div class="kpi-value small-value">${aiEnabled ? 'פעיל' : 'כבוי'}</div>
      <div class="kpi-hint">${aiEnabled ? '' : 'הגדירו ANTHROPIC_API_KEY'}</div></div>
  </div>
  <section class="card">
    <h3>עסקים</h3>
    <table class="table responsive"><thead><tr><th>עסק</th><th>בעלים</th><th>תוכנית</th><th>קמפיינים</th><th>צוות</th><th>דירוגים החודש</th><th>נוצר</th></tr></thead>
    <tbody>${businesses
      .map(
        (b) => `<tr><td data-l="עסק">${h(b.name)}</td><td data-l="בעלים" dir="ltr">${h(b.owner_email || '')}</td>
          <td data-l="תוכנית">${planSelect(b)}</td><td data-l="קמפיינים">${b.campaigns}</td><td data-l="צוות">${b.members}</td>
          <td data-l="החודש">${b.month_responses}</td><td data-l="נוצר" class="small">${h(formatDate(b.created_at))}</td></tr>`,
      )
      .join('')}</tbody></table>
  </section>
  <section class="card">
    <h3>משתמשים</h3>
    <table class="table responsive"><thead><tr><th>שם</th><th>אימייל</th><th>עסקים</th><th>אימות דו-שלבי</th><th>מנהל מערכת</th><th>נרשם</th></tr></thead>
    <tbody>${users
      .map(
        (u) => `<tr><td data-l="שם">${h(u.name)}</td><td data-l="אימייל" dir="ltr">${h(u.email)}</td><td data-l="עסקים">${u.businesses}</td>
          <td data-l="אימות">${
            u.totp_enabled
              ? `<form method="post" action="/superadmin/users/${u.id}/reset-2fa" class="inline" data-name="${h(u.name)}" onsubmit="return confirm('לכבות אימות דו-שלבי ל' + this.dataset.name + '? עשו זאת רק אחרי שווידאתם את זהותו.')">${csrfField(csrf)}<button class="btn-link">✓ (איפוס)</button></form>`
              : '—'
          }</td>
          <td data-l="מנהל">${
            u.id === meId
              ? '✓'
              : `<form method="post" action="/superadmin/users/${u.id}/superadmin" class="inline">${csrfField(csrf)}
            <input type="hidden" name="on" value="${u.is_superadmin ? 0 : 1}">
            <button class="btn-link">${u.is_superadmin ? '✓ (הסרה)' : 'מינוי'}</button></form>`
          }</td>
          <td data-l="נרשם" class="small">${h(formatDate(u.created_at))}</td></tr>`,
      )
      .join('')}</tbody></table>
  </section>
  <section class="card">
    <h3>דואר יוצא (50 אחרונים)</h3>
    ${
      outbox.length
        ? `<table class="table responsive"><thead><tr><th>זמן</th><th>סוג</th><th>נמען</th><th>נושא</th><th>סטטוס</th></tr></thead><tbody>${outbox
            .map(
              (m) => `<tr><td data-l="זמן" class="small">${h(formatDate(m.created_at))}</td><td data-l="סוג">${h(MAIL_KINDS[m.kind] || m.kind)}</td>
                <td data-l="נמען" dir="ltr">${h(m.to_addr)}</td><td data-l="נושא">${h(m.subject)}</td>
                <td data-l="סטטוס"><span class="badge ${m.status === 'failed' ? 'st-new' : m.status === 'sent' ? 'st-ok' : 'st-closed'}" title="${h(m.error)}">${h(
                  { sent: 'נשלח', logged: 'נרשם', failed: 'נכשל' }[m.status] || m.status,
                )}</span></td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted">עדיין לא נשלחו מיילים.</p>'
    }
  </section>`;
}
