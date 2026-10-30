import { accessOf, AI_PLUS, ANNUAL_MONTHS, branchPrice, CYCLES, hasApi, INTEGRATIONS, limitLabel, payProvider, PLANS, priceFor, TRIAL_DAYS } from '../plans.js';
import { ROLES } from '../store.js';
import { DEFAULT_INVITE_TEMPLATE, DEFAULT_INVITE_TEMPLATE_EN, englishTokens, INVITE_TEMPLATE_MAX, formatDate, h, invoiceOf, inviteMessage, logoSrc } from '../util.js';
import { isEn } from '../lang.js';
import { parseJson } from '../db.js';
import { agenciesAdminBlock } from './agency.js';
import { icon } from './icons.js';
import { customOffer, pricingCards } from './pricing.js';
import { LEAD_KINDS, operatorInfo } from './site.js';
import { ACTIONS as ACTION_LABELS } from '../usage.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;
const checked = (on) => (on ? 'checked' : '');

// ---------------------------------------------------------------- business

/** The WhatsApp wording, with placeholders and a live preview. */
function inviteMessageCard(business, csrf) {
  const en = isEn();
  const current = business.invite_template || (en ? DEFAULT_INVITE_TEMPLATE_EN : DEFAULT_INVITE_TEMPLATE);
  const shown = en ? englishTokens(current) : current;
  const sample = (t) => inviteMessage({ name: en ? 'Dana' : 'דנה', businessName: business.name, link: 'https://gofive.co.il/r/…', template: t, english: en });
  return `<section class="card stack" id="invite-message">
    <h3>נוסח ההודעה בוואטסאפ</h3>
    <p class="muted small">זו ההודעה שנפתחת כששולחים ללקוח בקשת דירוג. אפשר לכתוב אותה בסגנון של העסק. המילים בסוגריים מוחלפות לבד לכל לקוח.</p>
    <div class="im-grid">
      <form method="post" action="/admin/business/invite-message" class="stack">
        ${csrfField(csrf)}
        <div class="im-chips" aria-label="הוספת שדה להודעה">
          ${[
            [en ? '{name}' : '{שם}', 'שם הלקוח'],
            [en ? '{business}' : '{עסק}', 'שם העסק'],
            [en ? '{link}' : '{קישור}', 'הקישור לסקר'],
          ]
            .map(([tok, l]) => `<button type="button" class="chip-btn" data-insert="${tok}">+ ${l}</button>`)
            .join('')}
        </div>
        <textarea name="invite_template" id="im-text" rows="5" maxlength="${INVITE_TEMPLATE_MAX}" dir="${en ? 'ltr' : 'rtl'}">${h(shown)}</textarea>
        <p class="muted small">אם השם לא ידוע, "{שם}" פשוט נעלם מההודעה. אם תשכחו את {קישור}, הוא יתווסף בסוף.</p>
        <div class="row compact">
          <button class="btn primary">שמירה</button>
          ${business.invite_template ? '<button class="btn-link" name="reset" value="1" formnovalidate>חזרה לנוסח המקורי</button>' : ''}
        </div>
      </form>
      <div class="im-preview" aria-live="polite">
        <span class="muted small">כך הלקוח יראה את ההודעה:</span>
        <div class="wa-bubble" id="im-preview">${h(sample(current))}</div>
      </div>
    </div>
    <script>
    (function () {
      var ta = document.getElementById('im-text'), out = document.getElementById('im-preview');
      var biz = ${JSON.stringify(business.name)};
      function render() {
        var t = ta.value.trim() || ${JSON.stringify(shown)};
        if (!/\{(קישור|link)\}/i.test(t)) t += ' {link}';
        out.textContent = t.replace(/[ \t]?\{(שם|name)\}/gi, function (m) { return m.replace(/\{(שם|name)\}/i, ${JSON.stringify(en ? 'Dana' : 'דנה')}); })
          .replace(/\{(עסק|business)\}/gi, biz).replace(/\{(קישור|link)\}/gi, 'https://gofive.co.il/r/…');
      }
      ta.addEventListener('input', render);
      document.querySelectorAll('[data-insert]').forEach(function (b) {
        b.addEventListener('click', function () {
          var s = ta.selectionStart, e = ta.selectionEnd, tok = b.dataset.insert;
          ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
          ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length; render();
        });
      });
    })();
    </script>
  </section>`;
}

/** Who the invoices are made out to: name, tax id, address, and where they're sent. */
function invoiceCard(business, csrf) {
  const inv = invoiceOf(business);
  const field = (name, label, value, attrs = '', hint = '') => `<label>${label}${hint ? ` <span class="muted small">${hint}</span>` : ''}<input name="${name}" value="${h(value)}" ${attrs}></label>`;
  return `<form method="post" action="/admin/business/invoice" class="card stack" id="invoice">
    ${csrfField(csrf)}
    <h3>${icon('report', 18)} פרטים לחשבונית</h3>
    <p class="muted small">כך תופק החשבונית על התשלום ל-GoFive. שדה ריק: החשבונית על שם העסק, ונשלחת למייל של בעל החשבון.</p>
    <div class="grid2">
      ${field('name', 'על שם', inv.name, `maxlength="100" placeholder="${h(business.name)}"`, '(שם העסק הרשום או שם מלא)')}
      ${field('taxId', 'ח.פ / ע.מ / ת.ז', inv.taxId, 'inputmode="numeric" maxlength="12" dir="ltr" pattern="[0-9\\- ]*"')}
      ${field('address', 'כתובת', inv.address, 'maxlength="120" autocomplete="street-address"')}
      ${field('city', 'עיר', inv.city, 'maxlength="60" autocomplete="address-level2"')}
      ${field('email', 'מייל לקבלת החשבונית', inv.email, 'type="email" maxlength="120" dir="ltr" placeholder="למשל: הנהלת החשבונות"')}
      ${field('phone', 'טלפון', inv.phone, 'type="tel" maxlength="20" dir="ltr"')}
    </div>
    <p class="muted small">הפרטים חלים על החשבונית הבאה. חשבונית שכבר הופקה לא משתנה.</p>
    <button class="btn primary">שמירה</button>
  </form>`;
}

/** What was paid to GoFive, with each invoice's number and link when there is one. */
function invoicesList(invoices) {
  return `<section class="card stack" id="invoices">
    <h3>${icon('report', 18)} החשבוניות שלכם</h3>
    ${
      invoices.length
        ? `<table class="table responsive"><thead><tr><th>תאריך</th><th>על מה</th><th>סכום</th><th>חשבונית</th></tr></thead><tbody>${invoices
            .map(
              (i) => `<tr><td data-l="תאריך" class="small">${h(formatDate(i.at).split(',')[0])}</td><td data-l="על מה">${h(i.what)}</td>
                <td data-l="סכום">${i.amount != null ? `₪${Number(i.amount).toLocaleString('he-IL')}` : '—'}</td>
                <td data-l="חשבונית">${i.url ? `<a href="${h(i.url)}" target="_blank" rel="noopener">${i.number ? `מס׳ ${h(i.number)} ` : ''}לצפייה ↗</a>` : i.number ? `מס׳ ${h(i.number)}` : '<span class="muted small">נשלחה במייל</span>'}</td></tr>`,
            )
            .join('')}</tbody></table>
          <p class="muted small">כל חשבונית נשלחת גם במייל ברגע התשלום. לא מוצאים? כתבו לנו ונשלח שוב.</p>`
        : '<p class="muted">עוד לא היו תשלומים. אחרי כל תשלום החשבונית תופיע כאן, ותישלח גם במייל.</p>'
    }
  </section>`;
}

export function businessView({ business, csrf, plan, error = '', invoices = [] }) {
  return `<h1>הגדרות עסק</h1>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <nav class="settings-more"><a href="/admin/leaderboard">${icon('trophy', 16)} דירוג עובדים</a>${hasApi(business) ? `<a href="/admin/integrations">${icon('plug', 16)} חיבורים לקופה ולמערכת תורים</a>` : ''}</nav>
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
      <label class="check"><input type="checkbox" name="alert_drops" value="1" ${checked(business.alert_drops)}> התראה כשהדירוג בגוגל, המיקום במפות או הנראות ב-AI יורדים</label>
      <label class="check"><input type="checkbox" name="weekly_report" value="1" ${checked(business.weekly_report)}> דוח שבועי במייל (ימי ראשון בבוקר)</label>
      <label class="check"><input type="checkbox" name="monthly_report" value="1" ${checked(business.monthly_report)}> דוח חודשי במייל (בתחילת כל חודש)</label>
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

  ${inviteMessageCard(business, csrf)}

  ${invoiceCard(business, csrf)}
  ${invoicesList(invoices)}

  <section class="card stack" id="logo">
    <h3>לוגו</h3>
    <div class="logo-row">
      ${logoSrc(business) ? `<img class="logo-preview" src="${h(logoSrc(business))}" alt="הלוגו הנוכחי">` : '<div class="logo-preview empty">אין לוגו</div>'}
      <form method="post" action="/admin/business/logo?_csrf=${h(csrf)}" enctype="multipart/form-data" class="stack">
        <label class="file-pick">
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif" required
            onchange="this.parentNode.querySelector('.file-name').textContent = this.files[0] ? this.files[0].name : 'לא נבחר קובץ'">
          <span class="btn">${icon('inbox', 18)} בחירת קובץ</span>
          <span class="file-name">לא נבחר קובץ</span>
        </label>
        <small class="muted">PNG, JPG, WebP או GIF, עד 1MB</small>
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

export function teamView({ members, invites, csrf, me, plan, seatsUsed, inviteLink, error, branches = [] }) {
  const roleOptions = (current) =>
    Object.entries(ROLES)
      .map(([k, v]) => `<option value="${k}" ${current === k ? 'selected' : ''}>${h(v)}</option>`)
      .join('');
  // From the second branch, a member can be limited to one branch.
  const network = branches.length >= 2;
  const branchName = (id) => branches.find((b) => b.id === id)?.title || 'סניף';
  const branchOptions = (current) =>
    `<option value="">כל הסניפים</option>${branches.map((b) => `<option value="${b.id}" ${current === b.id ? 'selected' : ''}>${h(b.title || 'סניף')}</option>`).join('')}`;
  return `<h1>צוות</h1>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${
    inviteLink
      ? `<div class="flash">ההזמנה נשלחה במייל. אפשר גם להעביר את הקישור ידנית (בתוקף 7 ימים):<br><span dir="ltr">${h(inviteLink)}</span></div>`
      : ''
  }
  <div class="grid2">
    <section class="card">
      <h3>חברי צוות (${plan.teamMembers === Infinity ? seatsUsed : `${seatsUsed} מתוך ${limitLabel(plan.teamMembers)}`})</h3>
      <table class="table">
        <thead><tr><th>שם</th><th>תפקיד</th>${network ? '<th>סניף</th>' : ''}<th></th></tr></thead>
        <tbody>${members
          .map(
            (m) => `<tr>
              <td>${h(m.name)}${m.id === me.id ? ' <span class="muted small">(את/ה)</span>' : ''}<div class="small muted" dir="ltr">${h(m.email)}</div></td>
              <td><form method="post" action="/admin/team/members/${m.id}" class="inline">
                ${csrfField(csrf)}
                <select name="role" onchange="this.form.submit()" aria-label="תפקיד">${roleOptions(m.role)}</select>
              </form></td>
              ${
                network
                  ? `<td>${
                      m.role === 'owner'
                        ? '<span class="muted small">כל הסניפים</span>'
                        : `<form method="post" action="/admin/team/members/${m.id}" class="inline">${csrfField(csrf)}<input type="hidden" name="action" value="branch">
                            <select name="location" onchange="this.form.submit()" aria-label="סניף">${branchOptions(m.location_id)}</select></form>`
                    }</td>`
                  : ''
              }
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
                (i) => `<tr><td dir="ltr">${h(i.email)}</td><td>${h(ROLES[i.role])}${i.location_id ? ` · ${h(branchName(i.location_id))}` : ''}</td>
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
        ${network ? `<label>סניף<select name="location">${branchOptions(null)}</select><span class="muted small">מנהל סניף רואה ועונה רק על הביקורות של הסניף שלו, ומקבל עליהן התראות.</span></label>` : ''}
        <button class="btn primary">שליחת הזמנה</button>
      </form>
      <dl class="dl small">
        <dt>בעלים</dt><dd>הכול, כולל הגדרות העסק, צוות ומחיקה</dd>
        <dt>מנהל</dt><dd>קמפיינים, טיפול בפניות, שליחת בקשות ו-AI</dd>
        <dt>צפייה בלבד</dt><dd>הדשבורד והתגובות, בלי לשנות דבר</dd>
        ${network ? '<dt>מנהל סניף</dt><dd>מנהל או צפייה, מוגבל לסניף אחד: רואה את הסניף שלו בלבד</dd>' : ''}
      </dl>
      ${network ? '' : '<p class="muted small">מהסניף השני אפשר להגביל משתמש לסניף אחד (מנהל סניף). <a href="/admin/network">על חשבון רשת</a></p>'}
    </section>
  </div>`;
}

// ---------------------------------------------------------------- widget

export function widgetView({ business, baseUrl, csrf, available, published, pending, canEdit }) {
  if (!available) {
    return `<h1>ווידג'ט ביקורות לאתר</h1>
      <div class="card empty"><p>הצגת המלצות של לקוחות באתר העסק אינה כלולה במסלול הנוכחי.</p>
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

// ---------------------------------------------------------------- integrations

export function integrationsView({ keys, newKey, csrf, baseUrl, available, campaign }) {
  if (!available) {
    return `<h1>חיבורים</h1>
      <div class="card empty"><p>שליחה אוטומטית מהקופה, ממערכת התורים או מהחנות היא תוספת שאנחנו מקימים יחד איתכם.</p>
      <a class="btn" href="/admin/plan">לפנייה אלינו</a></div>`;
  }
  const slug = campaign?.slug || 'my-campaign';
  const curl = `curl -X POST ${baseUrl}/api/v1/invites \\
  -H "Authorization: Bearer ${newKey || 'rk_...'}" \\
  -H "Content-Type: application/json" \\
  -d '{"campaign": "${slug}", "name": "${isEn() ? 'Dana' : 'דנה'}", "phone": "0501234567", "email": "dana@example.com", "delay_minutes": 120}'`;
  return `<h1>חיבורים</h1>
  <p class="muted">כך כל לקוח מקבל בקשת דירוג לבד, בלי שמישהו יצטרך לזכור לשלוח: הקופה, מערכת התורים, החנות באינטרנט או Make / Zapier שולחים לנו את פרטי הלקוח בסוף הביקור.</p>
  ${
    newKey
      ? `<div class="flash stack">
          <b>המפתח נוצר. העתיקו אותו עכשיו: הוא לא יוצג שוב.</b>
          <code dir="ltr" style="font-size:1rem;padding:.5em;word-break:break-all">${h(newKey)}</code>
        </div>`
      : ''
  }
  <div class="grid2">
    <section class="card stack">
      <h3>מפתחות</h3>
      ${
        keys.length
          ? `<table class="table"><thead><tr><th>שם</th><th>מתחיל ב</th><th>שימוש אחרון</th><th></th></tr></thead><tbody>${keys
              .map(
                (k) => `<tr><td>${h(k.name)}</td><td dir="ltr"><code>${h(k.prefix)}…</code></td>
                  <td class="small">${k.last_used_at ? h(formatDate(k.last_used_at)) : 'עוד לא'}</td>
                  <td><form method="post" action="/admin/integrations/keys/${k.id}/revoke" data-name="${h(k.name)}" onsubmit="return confirm('לבטל את המפתח ' + this.dataset.name + '? מערכות שמשתמשות בו יפסיקו לעבוד.')">
                    <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">ביטול</button></form></td></tr>`,
              )
              .join('')}</tbody></table>`
          : '<p class="muted">עוד אין מפתחות.</p>'
      }
      <form method="post" action="/admin/integrations/keys" class="row">
        <input type="hidden" name="_csrf" value="${h(csrf)}">
        <label>שם למפתח<input name="name" maxlength="60" placeholder="למשל: הקופה בסניף הראשי" required></label>
        <button class="btn primary">יצירת מפתח</button>
      </form>
    </section>
    <section class="card stack">
      <h3>איך מחברים</h3>
      <ol class="how-list">
        <li>יוצרים מפתח ומעבירים אותו למי שמתחזק את הקופה או את מערכת התורים (או מדביקים אותו ב-Make / Zapier).</li>
        <li>בסוף כל ביקור או קנייה המערכת שולחת לנו בקשה עם שם, טלפון או אימייל של הלקוח.</li>
        <li>יש אימייל? אנחנו שולחים לו את הבקשה לבד, אחרי ההשהיה שבחרתם, עם תזכורת אחת. יש רק טלפון? מקבלים בתשובה קישור אישי לשליחה ב-SMS.</li>
        <li>לקוח שכבר קיבל בקשה ב-30 הימים האחרונים לא יקבל עוד אחת.</li>
      </ol>
    </section>
  </div>
  <section class="card stack">
    <h3>דוגמה</h3>
    <pre class="code" dir="ltr">${h(curl)}</pre>
    <dl class="dl small">
      <dt><code>campaign</code></dt><dd>הקמפיין (ה-slug מהקישור, או המספר). אם לא נשלח: הקמפיין הפעיל הראשון.</dd>
      <dt><code>name</code>, <code>phone</code>, <code>email</code></dt><dd>פרטי הלקוח. חובה לפחות טלפון או אימייל.</dd>
      <dt><code>delay_minutes</code></dt><dd>כמה דקות לחכות לפני שליחת המייל (עד שבוע). 0 = מייד.</dd>
      <dt><code>external_id</code></dt><dd>מספר ההזמנה או התור אצלכם, לא חובה.</dd>
      <dt><code>dedup_days</code></dt><dd>כמה ימים לא לשלוח שוב לאותו לקוח (ברירת מחדל 30, 0 = תמיד לשלוח).</dd>
    </dl>
    <p class="muted small">התשובה כוללת <code>status</code> (<code>sent</code>, <code>scheduled</code>, <code>created</code> או <code>skipped</code>) ואת הקישור האישי <code>invite.link</code>. בדיקת חיבור: <code dir="ltr">GET ${h(baseUrl)}/api/v1/ping</code></p>
  </section>`;
}

// ---------------------------------------------------------------- plan

const PAYMENT_KINDS = { checkout: 'תשלום', renewal: 'חידוש', upgrade: 'שדרוג' };

const day = (sql) => (sql ? formatDate(`${String(sql).replace(' ', 'T')}Z`).split(',')[0] : '');
const money = (n) => `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

export const CANCEL_REASONS = {
  price: 'המחיר גבוה מדי',
  value: 'לא ראיתי מספיק תועלת',
  missing: 'חסר לי משהו במערכת',
  time: 'אין לי זמן להשתמש בזה',
  closed: 'העסק נסגר או נמכר',
  other: 'סיבה אחרת',
};

/**
 * "My plan": the subscription at a glance with its actions (upgrade, switch,
 * cancel or resume), then the plans, this month's usage and the payments.
 */
export function planView({
  business, plan, usage, access, request = null, csrf = '', can = () => true, requested = false,
  cardBilling = false, payments = [], notice = '', error = '', actionUsage = null, profiles = 1, trialOffer = false,
}) {
  const meter = (label, used, max) => {
    if (max === Infinity) {
      return `<div class="meter-row"><div class="meter-head"><span>${h(label)}</span><span>${used} · ללא הגבלה</span></div></div>`;
    }
    const pct = Math.min(100, (used / max) * 100);
    return `<div class="meter-row"><div class="meter-head"><span>${h(label)}</span><span>${used} / ${limitLabel(max)}</span></div>
      <div class="dist-bar"><span class="${pct >= 100 ? 'bad' : pct >= 80 ? 'mid' : 'good'}" style="width:${pct}%"></span></div></div>`;
  };
  const owner = can('owner');
  const cycleKey = business.billing_cycle === 'annual' ? 'annual' : 'monthly';
  const cycle = CYCLES[cycleKey];
  const paying = Boolean(business.card_token && business.paid_until && access?.state === 'active');
  const active = access?.state === 'active';
  // Cancelled: a card plan that won't renew, or a page-paid plan with its end date set.
  const canceled = active && ((paying && !business.auto_renew) || Boolean(!business.card_token && business.canceled_at && business.paid_until));
  const next = PLANS[business.next_plan];
  const until = day(business.paid_until);
  const perPeriod = priceFor(plan, cycleKey, profiles);
  const months = cycleKey === 'annual' ? ANNUAL_MONTHS : 1;
  const other = business.plan === 'basic' ? 'pro' : business.plan === 'pro' ? 'basic' : null;
  const changeLink = (p, c, label, cls = 'btn') => `<a class="${cls}" href="/admin/plan/change?plan=${p}&cycle=${c}">${label}</a>`;

  // ---- the subscription at a glance ----
  const facts = [
    ['מסלול', `<b>${h(plan.label)}</b>${access?.state === 'trial' ? ' <small>ניסיון</small>' : ''}`],
    ['תשלום', h(cycle)],
    ['פרופילים בגוגל', `${profiles}`],
    plan.price != null ? [cycleKey === 'annual' ? 'לשנה' : 'לחודש', `<b>${money(perPeriod)}</b> <small>${profiles > 1 ? `₪${plan.price * months} + ${profiles === 2 ? 'סניף נוסף' : `${profiles - 1} סניפים ×`} ₪${branchPrice(plan) * months}, ` : ''}כולל מע״מ</small>`] : null,
    paying ? [!business.auto_renew ? 'פעיל עד' : 'החידוש הבא', h(until)] : canceled ? ['פעיל עד', h(until)] : null,
    paying ? ['כרטיס', `<span dir="ltr">•••• ${h(business.card_last4 || '····')}</span>`] : null,
  ].filter(Boolean);
  const inv = invoiceOf(business);
  if (owner) facts.push(['חשבונית', `${h(inv.name || business.name)}${inv.taxId ? ` · <span dir="ltr">${h(inv.taxId)}</span>` : ''} <a class="small" href="/admin/business#invoice">עריכה</a>`]);
  const factsHtml = `<dl class="sub-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  let head;
  if (access?.reason === 'new') {
    // The first screen after sign-up: where they are, what comes next, then the plans below.
    const steps = [
      trialOffer
        ? [`בוחרים מסלול ומתחילים ${TRIAL_DAYS} ימים חינם`, 'שומרים כרטיס בדף המאובטח של קארדקום. <b>היום לא מחויבים</b>, יום לפני הסוף נזכיר במייל, ומבטלים בקליק.']
        : ['בוחרים מסלול', 'בלי התחייבות, מבטלים בכל רגע.'],
      ['מחברים את פרופיל העסק בגוגל', 'לחיצה אחת, עם חשבון הגוגל שמנהל את הפרופיל. זה החיבור שנותן את כל הנתונים.'],
      ['הכול נטען לבד', 'ביקורות, דירוג, צפיות ושיחות, מיקום במפות ונראות ב-AI, תוך כמה דקות.'],
    ];
    head = `<div class="sub-head welcome"><div><b>ברוכים הבאים ל-GoFive! עוד שני צעדים קצרים ומתחילים</b></div></div>
      <ol class="start-steps">${steps.map(([t, d], i) => `<li class="${i === 0 ? 'now' : ''}"><span class="n">${i + 1}</span><div><b>${t}</b><small>${d}</small>${i === 0 ? '<a class="btn primary" href="#plans">לבחירת מסלול ↓</a>' : ''}</div></li>`).join('')}</ol>`;
  } else if (access?.state === 'trial' && access.card) {
    const ends = h(day(access.endsAt));
    const stopped = !business.auto_renew;
    head = `<div class="sub-head ${stopped ? 'canceled' : 'trial'}"><div><b>${stopped ? 'הניסיון בוטל: לא תחויבו' : `ניסיון חינם במסלול ${h(plan.label)}`}</b>
      <span>${
        stopped
          ? `אפשר להמשיך להשתמש עד ${ends}. אחרי זה הסקרים מושהים, והנתונים נשמרים.`
          : `${access.daysLeft > 1 ? `נשארו ${access.daysLeft} ימים` : access.daysLeft === 1 ? 'היום האחרון' : 'הניסיון הסתיים, החיוב בתהליך'}. ב-${ends} יתחיל המנוי, והכרטיס יחויב ב-${money(perPeriod)} ${cycleKey === 'annual' ? 'לשנה' : 'לחודש'}.`
      }</span></div>
      ${stopped && owner ? `<form method="post" action="/admin/billing/auto-renew">${csrfField(csrf)}<button class="btn primary" name="on" value="1">המשך המנוי בסוף הניסיון</button></form>` : ''}
    </div>${factsHtml.replace('</dl>', `<div><dt>כרטיס</dt><dd><span dir="ltr">•••• ${h(business.card_last4 || '····')}</span></dd></div></dl>`)}
    ${owner && !stopped ? `<p class="sub-cancel"><a href="/admin/plan/cancel">ביטול הניסיון, בלי חיוב</a></p>` : ''}`;
  } else if (access?.state === 'trial') {
    head = `<div class="sub-head trial"><div><b>תקופת ניסיון במסלול ${h(plan.label)}</b>
      <span>${access.daysLeft === 1 ? 'היום האחרון' : `נשארו ${access.daysLeft} ימים`}, עד ${h(formatDate(access.endsAt).split(',')[0])}. אחרי זה הסקרים יושהו עד שתבחרו מסלול.</span></div></div>${factsHtml}`;
  } else if (access?.state === 'paused') {
    head = `<div class="sub-head paused"><div><b>${access.reason === 'trial' ? 'תקופת הניסיון הסתיימה' : 'המנוי לא פעיל'}</b>
      <span>הסקרים וההתראות מושהים. כל הנתונים שמורים, ואחרי בחירת מסלול הכול חוזר לעבוד כמו קודם.</span></div></div>${factsHtml}`;
  } else {
    const actions = [];
    if (owner && !canceled) {
      if (other === 'pro') actions.push(changeLink('pro', cycleKey, `שדרוג ל${h(PLANS.pro.label)}`, 'btn accent'));
      if (other === 'basic') actions.push(changeLink('basic', cycleKey, `מעבר ל${h(PLANS.basic.label)}`));
      if (other) actions.push(changeLink(business.plan, cycleKey === 'annual' ? 'monthly' : 'annual', cycleKey === 'annual' ? 'מעבר לתשלום חודשי' : 'מעבר לשנתי · חודשיים חינם'));
    }
    head = `<div class="sub-head ${canceled ? 'canceled' : 'active'}">
        <div><b>${canceled ? 'המנוי בוטל' : 'המנוי פעיל'}</b>
          <span>${canceled ? `המסלול נשאר פעיל עד ${h(until)}, ולא תחויבו יותר. ${business.icount_stopped_at ? 'כדי להמשיך אחרי התאריך, בוחרים מסלול ומשלמים מחדש.' : 'אפשר לחדש בכל רגע.'}` : paying ? `מתחדש אוטומטית ב-${h(until)}.` : 'החשבון פעיל.'}</span></div>
        ${canceled && owner && !business.icount_stopped_at ? `<form method="post" action="/admin/billing/auto-renew">${csrfField(csrf)}<button class="btn primary" name="on" value="1">חידוש המנוי</button></form>` : ''}
      </div>
      ${factsHtml}
      ${
        next && !canceled
          ? `<div class="sub-next">${icon('clock', 16)}<span>ב-${h(until)} תעברו ל<b>${h(next.label)}</b>${business.next_cycle && business.next_cycle !== cycleKey ? `, בתשלום ${h(CYCLES[business.next_cycle])}` : ''}.</span>
              ${owner ? `<form method="post" action="/admin/plan/keep" class="inline">${csrfField(csrf)}<button class="btn-link">ביטול השינוי</button></form>` : ''}</div>`
          : ''
      }
      ${actions.length ? `<div class="row compact sub-actions">${actions.join('')}</div>` : ''}
      ${owner && paying && !canceled ? `<p class="sub-cancel"><a href="/admin/plan/cancel">ביטול המנוי</a></p>` : ''}`;
  }

  const pending =
    request && PLANS[request.plan]
      ? `<div class="flash">${requested ? 'הבקשה נשלחה. ' : ''}${
          request.plan === 'enterprise'
            ? 'ביקשת הצעת מחיר לרשת. ניצור איתך קשר בקרוב.'
            : payProvider() === 'icount'
              ? `בחרת את מסלול <b>${h(PLANS[request.plan].label)}</b> (${h(CYCLES[request.cycle] || '')}). אם כבר שילמתם בדף של iCount, נפעיל את המסלול בקרוב ונעדכן אתכם במייל. עוד לא שילמתם? <a href="/admin/plan/change?plan=${h(request.plan)}&cycle=${h(request.cycle || 'monthly')}">לדף התשלום</a>`
              : `ביקשת את מסלול <b>${h(PLANS[request.plan].label)}</b> (${h(CYCLES[request.cycle] || '')}). ניצור איתך קשר כדי להשלים את התשלום ולהפעיל את המסלול.`
        }</div>`
      : '';
  const op = operatorInfo();
  // The plan cards lead to the confirmation page (GET), which says what happens before anything is charged.
  const action = (key) =>
    owner
      ? (active || access?.card) && key === business.plan
        ? '<span class="btn plan-cta" aria-disabled="true">המסלול שלכם</span>'
        : `<button class="btn ${key === 'pro' ? 'accent' : 'primary'} plan-cta" name="plan" value="${key}">${
            trialOffer ? `${TRIAL_DAYS} ימים חינם · ${h(PLANS[key].label)}` : paying ? (PLANS[key].price > plan.price ? `שדרוג ל${h(PLANS[key].label)}` : `מעבר ל${h(PLANS[key].label)}`) : `בחירה ב${h(PLANS[key].label)}`
          }</button>`
      : '';
  const history = payments.length
    ? `<section class="card"><h3>תשלומים וחשבוניות</h3><div class="table-wrap"><table class="table"><thead><tr><th>תאריך</th><th>מה</th><th>סכום</th><th>סטטוס</th></tr></thead><tbody>${payments
        .map(
          (p) => `<tr><td>${h(formatDate(`${String(p.paid_at || p.created_at).replace(' ', 'T')}Z`).split(',')[0])}</td>
            <td>${h(PAYMENT_KINDS[p.kind] || p.kind)} · ${h(PLANS[p.plan]?.label || p.plan)}</td><td>${money(p.amount)}</td>
            <td>${p.status === 'paid' ? '<span class="badge st-resolved">שולם</span>' : `<span class="badge st-new" title="${h(p.error || '')}">נכשל</span>`}</td></tr>`,
        )
        .join('')}</tbody></table></div><p class="muted small">החשבוניות נשלחות במייל מחברת הסליקה אחרי כל חיוב.</p></section>`
    : '';
  return `<h1>התוכנית שלי</h1>
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${pending}
  <section class="card stack sub-card">${head}</section>
  <section class="card stack" id="plans">
    <h3>${paying ? 'השוואת המסלולים' : 'המסלולים'}</h3>
    ${owner ? '' : '<p class="muted">רק בעלי העסק יכולים לבחור או לשנות מסלול.</p>'}
    <form method="get" action="/admin/plan/change">
      ${pricingCards({ action, current: active ? business.plan : '' })}
    </form>
    ${
      owner
        ? customOffer(`<form method="post" action="/admin/plan/request">
            <input type="hidden" name="_csrf" value="${h(csrf)}">
            <button class="btn accent" name="plan" value="enterprise">בקשת הצעת מחיר</button>
          </form>`)
        : ''
    }
    <p class="muted small">${
      cardBilling
        ? paying
          ? 'לפני כל שינוי תראו בדיוק מה ייכנס לתוקף ומה יחויב. שדרוג נכנס לתוקף מיד ומחויב רק על הימים שנשארו; מעבר למסלול זול יותר או לתדירות אחרת נכנס לתוקף בחידוש הבא.'
          : trialOffer
          ? `${TRIAL_DAYS} ימי ניסיון חינם. הכרטיס נשמר בדף המאובטח של קארדקום ומחויב רק בסוף הניסיון, אם לא ביטלתם. אחרי זה המנוי מתחדש לבד, ואפשר לבטל בכל רגע. חשבונית נשלחת במייל.`
          : 'התשלום בכרטיס אשראי, בדף המאובטח של קארדקום. המנוי מתחדש לבד, ואפשר לבטל בכל רגע. חשבונית נשלחת במייל.'
        : payProvider() === 'icount'
          ? 'התשלום בדף המאובטח של iCount, והחשבונית נשלחת במייל. אחרי התשלום נפעיל את המסלול ונעדכן אתכם.'
          : 'התשלום עדיין לא אונליין: אחרי הבחירה נחזור אליכם להשלמת התשלום ונפעיל את המסלול.'
    } <a href="/terms#billing">התנאים המלאים: תשלום, שינוי וביטול</a>${op.email ? ` · שאלות? <span dir="ltr">${h(op.email)}</span>` : ''}</p>
  </section>
  ${
    actionUsage && access?.reason !== 'new'
      ? `<details class="card stack sub-usage"><summary><h3>שימוש החודש</h3><span class="muted small">פעולות ידניות, מתאפס ב-1 לכל חודש</span></summary>
          ${Object.entries(ACTION_LABELS).map(([k, label]) => meter(label, actionUsage[k].used, actionUsage[k].limit)).join('')}
          <p class="muted small">מה שרץ לבד (בדיקות שבועיות, סנכרון ביקורות) לא נספר כאן.</p>
        </details>`
      : ''
  }
  ${history}`;
}

/** Before a plan change: what happens and what is charged, then confirm. */
// Monthly or annual, chosen here too: the toggle above the plan cards is easy to miss.
function cycleChoice(plan, cycle, profiles = 1) {
  const p = PLANS[plan];
  if (p.price == null) return '';
  const option = (c, label) =>
    `<a class="${c === cycle ? 'on' : ''}" href="/admin/plan/change?plan=${plan}&cycle=${c}" ${c === cycle ? 'aria-current="true"' : ''}>${label}</a>`;
  return `<div class="cycle-choice" role="group" aria-label="תדירות תשלום">
    ${option('monthly', `חודשי · ${money(priceFor(p, 'monthly', profiles))} לחודש`)}
    ${option('annual', `שנתי · ${money(priceFor(p, 'annual', profiles))} לשנה <span class="save-chip">חודשיים חינם</span>`)}
  </div>`;
}

export function planChangeView({ business, current, access, plan, cycle, quote, csrf }) {
  const p = PLANS[plan];
  const per = cycle === 'annual' ? 'לשנה' : 'לחודש';
  const trialEnd = new Date(Date.now() + (quote.days || 0) * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const lines = {
    checkout: [`תועברו לדף התשלום המאובטח של קארדקום, לתשלום של <b>${money(quote.amount)}</b> ${per} (${quote.profiles > 1 ? `${quote.profiles} פרופילים, ` : ''}כולל מע״מ).`, 'המסלול נפתח מיד אחרי התשלום, ומתחדש אוטומטית עד שמבטלים.'],
    upgrade: [`השדרוג נכנס לתוקף <b>מיד</b>.`, quote.charge ? `תחויבו עכשיו ב-<b>${money(quote.charge)}</b>: ההפרש היחסי על הימים שנשארו עד ${h(day(business.paid_until))}.` : 'אין חיוב נוסף עד החידוש הבא.', `מהחידוש הבא: <b>${money(quote.amount)}</b> ${per}, כולל מע״מ.`],
    scheduled: [`השינוי ייכנס לתוקף <b>בחידוש הבא, ב-${h(day(quote.at))}</b>. עד אז הכול נשאר כמו שהוא, בלי חיוב נוסף.`, `מהחידוש: <b>${money(quote.amount)}</b> ${per}, כולל מע״מ.`, 'אפשר לבטל את השינוי בעמוד "התוכנית שלי" עד יום החידוש.'],
    kept: ['זה המסלול הנוכחי שלכם. המנוי ימשיך להתחדש כרגיל.'],
    trial: [
      `<b>${quote.days} ימים חינם</b>, עם כל מה שיש במסלול.`,
      'תועברו לדף המאובטח של קארדקום לשמירת כרטיס. <b>היום לא מחויבים.</b>',
      `ב-${h(day(trialEnd))} יתחיל המנוי: <b>${money(quote.amount)}</b> ${per} (${quote.profiles > 1 ? `${quote.profiles} פרופילים, ` : ''}כולל מע״מ), ויתחדש עד שתבטלו. יום לפני נזכיר לכם במייל.`,
      'רוצים לבטל? בקליק בעמוד "התוכנית שלי", לפני סוף הניסיון, ולא תחויבו בכלל.',
    ],
    trial_switch: ['המסלול מתחלף מיד, ואתם עדיין בתקופת הניסיון, בלי חיוב.', `בסוף הניסיון, ב-${h(day(quote.at))}: <b>${money(quote.amount)}</b> ${per}, כולל מע״מ.`],
    request: ['נקבל את הבקשה ונחזור אליכם להשלמת התשלום ולהפעלת המסלול.'],
    icount: [
      `תועברו לדף התשלום המאובטח של iCount, לתשלום של <b>${money(quote.amount)}</b> ${per} (${quote.profiles > 1 ? `${quote.profiles} פרופילים, ` : ''}כולל מע״מ). החשבונית נשלחת במייל.`,
      'אחרי התשלום נפעיל את המסלול ונעדכן אתכם במייל, בדרך כלל תוך כמה שעות בימי עסקים. עד אז הכול ממשיך לעבוד.',
      (() => {
        const inv = invoiceOf(business);
        return `בדף של iCount ממלאים את הפרטים לחשבונית: <b>${h(inv.name || business.name)}</b>${inv.taxId ? `, <span dir="ltr">${h(inv.taxId)}</span>` : ''}${inv.email ? `, <span dir="ltr">${h(inv.email)}</span>` : ''}. <a href="/admin/business#invoice">עריכת הפרטים</a>`;
      })(),
    ],
  }[quote.kind];
  const lose = current.aiPlus && !p.aiPlus ? '<div class="warn">במסלול גוגל אין בדיקה ב-ChatGPT, Gemini, Perplexity ו-Claude, ואין תוכנית פעולה אחרי כל בדיקה. הנתונים שכבר נאספו נשמרים.</div>' : '';
  const gain = !current.aiPlus && p.aiPlus ? `<ul class="sub-gain">${['נראות ב-ChatGPT, Gemini, Perplexity ו-Claude', 'תוכנית פעולה ו"על מי ממליצים במקומכם"', `מיקום במפות: ${p.rankKeywords} חיפושים · ${p.competitors} מתחרים`].map((x) => `<li>${icon('check', 16)}${h(x)}</li>`).join('')}</ul>` : '';
  const button = { icount: 'להמשך לתשלום', trial: 'להמשך: שמירת כרטיס', trial_switch: 'אישור המעבר', checkout: 'להמשך לתשלום', upgrade: quote.charge ? `אישור ותשלום ${money(quote.charge)}` : 'אישור השדרוג', scheduled: 'אישור השינוי', kept: 'חזרה', request: 'שליחת הבקשה' }[quote.kind];
  return `<p><a href="/admin/plan">→ חזרה לתוכנית שלי</a></p>
  <h1>${quote.kind === 'trial' ? `${quote.days} ימים חינם במסלול ${h(p.label)}` : `${quote.kind === 'upgrade' ? 'שדרוג' : 'מעבר'} למסלול ${h(p.label)}`}</h1>
  <section class="card stack sub-confirm">
    <div class="sub-from-to"><span>${h(current.label)}${access?.state === 'active' ? ` · ${h(CYCLES[business.billing_cycle] || CYCLES.monthly)}` : ''}</span><b>←</b><span><b>${h(p.label)}</b> · ${h(CYCLES[cycle])}</span></div>
    ${cycleChoice(plan, cycle, quote.profiles)}
    ${gain}${lose}
    <ul class="sub-lines">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
    ${
      quote.kind === 'kept'
        ? '<a class="btn" href="/admin/plan">חזרה</a>'
        : `<form method="post" action="/admin/plan/request" class="row compact">
            <input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="plan" value="${h(plan)}"><input type="hidden" name="cycle" value="${h(cycle)}">
            <button class="btn primary">${button}</button><a class="btn" href="/admin/plan">ביטול</a>
          </form>`
    }
    <p class="muted small">המחירים כוללים מע״מ. <a href="/terms#billing">התנאים המלאים</a></p>
  </section>`;
}

/** Cancelling the subscription: what happens, an optional reason, and confirm. */
export function cancelView({ business, plan, access, csrf, quote = { refund: 0 } }) {
  const until = day(quote.until || business.paid_until);
  const annual = business.billing_cycle === 'annual';
  if (access?.card) {
    return `<p><a href="/admin/plan">→ חזרה לתוכנית שלי</a></p>
  <h1>ביטול הניסיון</h1>
  <section class="card stack sub-confirm">
    <ul class="sub-lines">
      <li><b>לא תחויבו בכלל.</b> הכרטיס לא יחויב בסוף הניסיון.</li>
      <li>אפשר להמשיך להשתמש עד <b>${h(day(access.endsAt))}</b>. אחרי זה הסקרים, ההתראות והבדיקות מושהים, <b>והנתונים נשמרים</b>.</li>
      <li>התחרטתם? אפשר להחזיר את המנוי בעמוד "התוכנית שלי" עד סוף הניסיון.</li>
    </ul>
    <form method="post" action="/admin/plan/cancel" class="stack">
      <input type="hidden" name="_csrf" value="${h(csrf)}">
      <label>מה היה חסר לכם? <span class="muted small">(לא חובה, ועוזר לנו להשתפר)</span>
        <select name="reason"><option value="">בחירה…</option>${Object.entries(CANCEL_REASONS).map(([k, v]) => `<option value="${k}">${h(v)}</option>`).join('')}</select></label>
      <label>משהו שתרצו להוסיף? <textarea name="details" rows="3" maxlength="400"></textarea></label>
      <div class="row compact"><button class="btn danger">ביטול הניסיון</button><a class="btn primary" href="/admin/plan">להמשיך בניסיון</a></div>
    </form>
  </section>`;
  }
  return `<p><a href="/admin/plan">→ חזרה לתוכנית שלי</a></p>
  <h1>ביטול המנוי</h1>
  <section class="card stack sub-confirm">
    <p>לפני שמבטלים, כדאי לדעת מה קורה:</p>
    <ul class="sub-lines">
      <li>המסלול <b>${h(plan.label)}</b> נשאר פעיל ${until ? `עד <b>${h(until)}</b>` : 'עד סוף התקופה ששולמה'}, ולא תחויבו יותר.</li>
      <li>${
        annual
          ? quote.refund
            ? `במסלול שנתי: החודש הנוכחי נחשב מנוצל, וכל חודש שנוצל מחושב לפי המחיר החודשי הרגיל (${quote.used} חודשים). <b>יוחזרו לכם ${money(quote.refund)}</b> לכרטיס, בתוך 14 יום.`
            : 'במסלול שנתי: לפי המחיר החודשי הרגיל, החודשים שכבר נוצלו מכסים את מה ששולם, ולכן אין החזר. המסלול נשאר פעיל עד סוף השנה.'
          : 'במסלול חודשי אין החזר על החודש הנוכחי, והחיוב פשוט נעצר.'
      }</li>
      <li>אחרי סוף התקופה הסקרים, ההתראות והבדיקות מושהים. <b>הנתונים נשמרים</b> ואפשר לחזור בכל רגע, בדיוק מאיפה שהפסקתם.</li>
      <li>צרכנים (לא לצורכי עסק) רשאים לבטל עסקה בתוך 14 יום לפי חוק הגנת הצרכן. <a href="/terms#cancel">פרטים בתנאי השימוש</a></li>
    </ul>
    <form method="post" action="/admin/plan/cancel" class="stack">
      <input type="hidden" name="_csrf" value="${h(csrf)}">
      <label>למה אתם מבטלים? <span class="muted small">(לא חובה, ועוזר לנו להשתפר)</span>
        <select name="reason"><option value="">בחירה…</option>${Object.entries(CANCEL_REASONS).map(([k, v]) => `<option value="${k}">${h(v)}</option>`).join('')}</select></label>
      <label>משהו שתרצו להוסיף? <textarea name="details" rows="3" maxlength="400"></textarea></label>
      <div class="row compact"><button class="btn danger">ביטול המנוי</button><a class="btn primary" href="/admin/plan">השארת המנוי</a></div>
    </form>
    ${PLANS.basic && business.plan === 'pro' ? `<p class="muted small">רוצים לשלם פחות? אפשר במקום זה <a href="/admin/plan/change?plan=basic&cycle=${business.billing_cycle || 'monthly'}">לעבור למסלול ${h(PLANS.basic.label)}</a> (₪${PLANS.basic.price} לפרופיל).</p>` : ''}
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
    form = `<p class="muted">עוזר ה-AI עוד לא הופעל במערכת. מנהל המערכת יכול להפעיל אותו, ואז יופיע כאן כפתור להפקת תובנות.</p>`;
  } else if (!planAllows) {
    form = `<p class="muted">תובנות AI אינן כלולות במסלול הנוכחי. <a href="/admin/plan">פרטים</a></p>`;
  } else if (canGenerate) {
    form = `<form method="post" action="/admin/insights" class="row">
      ${csrfField(csrf)}
      <select name="campaign" aria-label="סקרים מקמפיין"><option value="">סקרים: כל הקמפיינים</option>${campaigns
        .map((c) => `<option value="${c.id}">${h(c.name)}</option>`)
        .join('')}</select>
      <select name="days" aria-label="תקופה"><option value="7">7 ימים</option><option value="30" selected>30 ימים</option><option value="90">90 ימים</option></select>
      <button class="btn primary ai-btn">${icon('spark', 16)} <span>הפקת תובנות</span></button>
    </form>`;
  }
  return `<h1>תובנות AI</h1>
  <p class="muted">ה-AI קורא את כל מה שיש על העסק בתקופה: הביקורות בגוגל, הצפיות, השיחות ומה חיפשו בפרופיל, המיקום במפות, המתחרים, הנראות ב-AI והמשובים מהסקרים. הוא מסכם מה עובד, מה צריך לתקן ומה לעשות השבוע.</p>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <section class="card">${form}</section>
  ${
    insights.length
      ? insights
          .map(
            (i) => `<section class="card insight">
              <div class="muted small">${[
                h(formatDate(i.created_at)),
                i.campaign_name ? `סקרים: ${h(i.campaign_name)}` : '',
                `${i.days} ימים`,
                i.review_count ? `${i.review_count} ביקורות בגוגל` : '',
                i.response_count ? `${i.response_count} משובים מסקרים` : '',
                i.review_count || i.response_count ? '' : 'נתוני הפרופיל',
                i.author ? h(i.author) : '',
              ].filter(Boolean).map((x) => `<span>${x}</span>`).join(' · ')}</div>
              ${renderInsight(i.content)}
            </section>`,
          )
          .join('')
      : ''
  }`;
}

// ---------------------------------------------------------------- superadmin

const MAIL_KINDS = {
  billing_failed: 'חיוב שנכשל',
  billing_paused: 'השהיה בגלל חיוב',
  billing_ended: 'סיום מנוי',
  negative_alert: 'התראת לקוח לא מרוצה',
  sla_alert: 'פנייה באיחור',
  weekly_report: 'דוח שבועי',
  monthly_report: 'דוח חודשי',
  customer_invite: 'בקשת דירוג ללקוח',
  customer_reminder: 'תזכורת ללקוח',
  team_invite: 'הזמנה לצוות',
  password_reset: 'איפוס סיסמה',
  welcome_guide: 'מדריך התחלה',
  error_alert: 'התראת תקלה',
};

/** Where a business stands: the steps that make it a working customer, and when its owner was last in. */
const seen = (sql) => {
  if (!sql) return 'עוד לא נכנס';
  const days = Math.floor((Date.now() - Date.parse(`${sql.replace(' ', 'T')}Z`)) / 864e5);
  return days <= 0 ? 'נכנס היום' : days === 1 ? 'נכנס אתמול' : `נכנס לפני ${days} ימים`;
};
const chip = (ok, label) => `<span class="act-chip ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${label}</span>`;
const progressChips = (b) => `<div class="act-chips">${chip(b.has_google, b.has_gbp ? 'גוגל (מלא)' : b.has_google ? 'גוגל (קישור)' : 'גוגל')}${chip(b.campaigns > 0, 'קמפיין')}${chip(b.total_responses > 0, 'דירוג ראשון')}</div><div class="small muted">${seen(b.owner_seen_at)}</div>`;

/** New customers (last 14 days) who haven't connected Google yet: the ones to call. */
/** Branches added to paying accounts, waiting for their payment. */
function branchesBlock(branches, csrf) {
  if (!branches.length) return '';
  return `<section class="card stack" id="branches">
    <h3>סניפים שממתינים לתשלום</h3>
    <p class="muted small">עסק בתשלום שמוסיף סניף עובר לדף התשלום של הסניף. כשהתשלום מגיע: מעדכנים ב-iCount את הוראת הקבע לסכום הכולל, ולוחצים "הפעלה". העסק יקבל מייל שהסניף פעיל.</p>
    <table class="table responsive"><thead><tr><th>עסק</th><th>סניף</th><th>מחיר הסניף</th><th>מצב</th><th></th></tr></thead><tbody>${branches
      .map((b) => {
        const plan = PLANS[b.plan] || PLANS.basic;
        const annual = b.billing_cycle === 'annual';
        return `<tr><td data-l="עסק">${h(b.business_name)}<div class="muted small" dir="ltr">${h(b.owner_email || '')}</div></td>
          <td data-l="סניף">${h(b.title || '—')}<div class="muted small">${h(b.address || '')}</div></td>
          <td data-l="מחיר">₪${(branchPrice(plan) * (annual ? ANNUAL_MONTHS : 1)).toLocaleString('he-IL')} ${annual ? 'לשנה' : 'לחודש'}</td>
          <td data-l="מצב">${b.pay_requested_at ? `<span class="badge st-in_progress">עבר לתשלום ${h(formatDate(`${b.pay_requested_at.replace(' ', 'T')}Z`))}</span>` : '<span class="badge st-new">עוד לא עבר לתשלום</span>'}</td>
          <td><form method="post" action="/superadmin/branches/${b.id}/activate" onsubmit="return confirm('התשלום על הסניף התקבל? הסניף ייפתח והעסק יקבל מייל.')">${csrfField(csrf)}<button class="btn primary">הפעלה</button></form></td></tr>`;
      })
      .join('')}</tbody></table>
  </section>`;
}

const prettyJson = (text) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 1);
  } catch {
    return text;
  }
};

/** Payments iCount reported, and the address to give it. */
function icountBlock({ payments = [], ipnUrl = '' } = {}) {
  if (payProvider() !== 'icount') return '';
  return `<section class="card stack" id="icount">
    <h3>תשלומים מ-iCount</h3>
    ${
      ipnUrl
        ? `<p class="muted small">הכתובת להדבקה ב-iCount, תחת אוטומציות ← כתובת IPN. תשלום שהמייל והסכום שלו מתאימים בדיוק לבקשה של עסק נפתח לבד; כל השאר מגיע אליך במייל להפעלה ידנית.</p>
          <input readonly dir="ltr" value="${h(ipnUrl)}" onclick="this.select()" aria-label="כתובת IPN">`
        : '<p class="muted small">כדי שתשלומים ייפתחו לבד: מוסיפים ב-Railway משתנה <code dir="ltr">ICOUNT_IPN_SECRET</code> עם מחרוזת אקראית של 16 תווים לפחות, ואז הכתובת להדבקה ב-iCount תופיע כאן.</p>'
    }
    ${
      payments.length
        ? `<table class="table responsive"><thead><tr><th>מתי</th><th>מייל</th><th>סכום</th><th>מה נעשה</th></tr></thead><tbody>${payments
            .map(
              (p) => `<tr><td data-l="מתי">${h(formatDate(`${p.created_at.replace(' ', 'T')}Z`))}</td>
                <td data-l="מייל" dir="ltr">${h(p.email || '—')}</td>
                <td data-l="סכום">${p.amount != null ? `₪${Number(p.amount).toLocaleString('he-IL')}` : '—'}</td>
                <td data-l="מה נעשה">${p.result.startsWith('activated') ? `<span class="badge st-resolved">הופעל: ${h(p.result.replace(/^activated: /, ''))}${p.business_name ? ` · ${h(p.business_name)}` : ''}</span>` : '<span class="badge st-new">להפעלה ידנית</span>'}
                  <details class="small"><summary>מה iCount שלח</summary><pre dir="ltr" style="white-space:pre-wrap;max-width:40rem">${h(prettyJson(p.payload))}</pre></details></td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted small">עוד לא התקבלו תשלומים מ-iCount.</p>'
    }
  </section>`;
}

// Cancelled on GoFive, paid by a standing order: the admin stops it in iCount by hand.
function icountStopsBlock(businesses, csrf) {
  const todo = businesses.filter((b) => b.billing === 'active' && b.canceled_at && !b.card_token && !b.icount_stopped_at && !b.is_demo);
  if (!todo.length) return '';
  return `<section class="card stack attention" id="icount-stops">
    <h3>לבטל הוראת קבע ב-iCount (${todo.length})</h3>
    <p class="muted small">העסקים האלה ביטלו את המנוי. GoFive לא יכולה לעצור את החיוב ב-iCount: מבטלים שם את הוראת הקבע ומסמנים כאן. בלי סימון תגיע תזכורת במייל 3 ימים לפני הסוף.</p>
    <table class="table responsive"><thead><tr><th>עסק</th><th>בעלים</th><th>פעיל עד</th><th>סיבה</th><th></th></tr></thead><tbody>${todo
      .map(
        (b) => `<tr><td data-l="עסק"><b>${h(b.name)}</b></td><td data-l="בעלים" dir="ltr">${h(b.owner_email || '')}</td>
          <td data-l="פעיל עד">${h(b.paid_until ? b.paid_until.slice(0, 10).split('-').reverse().join('.') : '—')}</td><td data-l="סיבה" class="small">${h(b.cancel_reason || '—')}</td>
          <td><form method="post" action="/superadmin/businesses/${b.id}/icount-stopped" class="inline">${csrfField(csrf)}<button class="btn">בוטל ב-iCount ✓</button></form></td></tr>`,
      )
      .join('')}</tbody></table>
  </section>`;
}

function stuckBlock(businesses) {
  const fresh = businesses.filter((b) => !b.has_google && Date.now() - Date.parse(`${b.created_at.replace(' ', 'T')}Z`) < 14 * 864e5 && Date.now() - Date.parse(`${b.created_at.replace(' ', 'T')}Z`) > 864e5);
  const recent = businesses.filter((b) => Date.now() - Date.parse(`${b.created_at.replace(' ', 'T')}Z`) < 14 * 864e5);
  if (!recent.length) return '';
  const connected = recent.filter((b) => b.has_google).length;
  return `<section class="card stack" id="activation">
    <h3>לקוחות חדשים (14 יום)</h3>
    <div class="act-sum"><span><b>${recent.length}</b> נרשמו</span><span><b>${connected}</b> חיברו את גוגל</span><span><b>${recent.filter((b) => b.total_responses > 0).length}</b> קיבלו דירוג ראשון</span></div>
    ${
      fresh.length
        ? `<p class="small"><b>כדאי ליצור קשר:</b> נרשמו לפני יותר מיום ועוד לא חיברו את גוגל.</p>
          <ul class="act-list">${fresh
            .map((b) => `<li><b>${h(b.name)}</b> · ${h(b.owner_name || '')} <a dir="ltr" href="mailto:${h(b.owner_email || '')}">${h(b.owner_email || '')}</a> <span class="muted small">· ${seen(b.owner_seen_at)}</span></li>`)
            .join('')}</ul>`
        : '<p class="muted small">כל מי שנרשם ביומיים האחרונים או קודם כבר חיבר את גוגל.</p>'
    }
  </section>`;
}

export function superadminView({ businesses, users, outbox, csrf, mailEnabled, aiEnabled, aiTest = null, meId, agencies = [], leads = [], error = '', marketingCount = 0, unpaidCount = 0, passes = [], branches = [], icount = {}, baseUrl = '' }) {
  const statusBadge = (b) => {
    const a = accessOf(b);
    if (a.state === 'trial') return `<span class="badge st-in_progress">${b.pilot ? 'התנסות חינם' : a.card ? 'ניסיון עם כרטיס' : 'ניסיון'} · עוד ${a.daysLeft} ימים</span>`;
    if (a.state === 'paused') return `<span class="badge st-new">${a.reason === 'trial' ? 'הניסיון נגמר' : a.reason === 'new' ? 'ממתין לתשלום' : 'מושהה'}</span>`;
    return `<span class="badge st-resolved">פעיל · ${h(CYCLES[b.billing_cycle] || '')}</span>`;
  };
  const planSelect = (b) => {
    const req = parseJson(b.plan_request, null);
    const wanted = req && PLANS[req.plan] ? req : null;
    return `<div class="billing-cell">
      ${statusBadge(b)} <b>${h(PLANS[b.plan]?.label || b.plan)}</b>
      ${b.card_token && b.paid_until ? `<div class="small muted">כרטיס ··${h(b.card_last4 || '')} · עד ${h(b.paid_until.slice(0, 10))}${b.auto_renew ? '' : ' · בלי חידוש'}${b.pay_failures ? ` · <b class="danger-text">${b.pay_failures} חיובים נכשלו</b>` : ''}</div>` : ''}
      ${(() => { const inv = invoiceOf(b); return inv.name || inv.taxId ? `<div class="small muted">חשבונית: ${h(inv.name || b.name)}${inv.taxId ? ` · <span dir="ltr">${h(inv.taxId)}</span>` : ''}${inv.email ? ` · <span dir="ltr">${h(inv.email)}</span>` : ''}</div>` : ''; })()}
      ${!b.card_token && b.paid_until ? `<div class="small muted">שולם עד ${h(b.paid_until.slice(0, 10).split('-').reverse().join('.'))}${b.canceled_at ? ` · <b>בוטל</b>${b.icount_stopped_at ? ' · הוראת הקבע בוטלה' : ''}` : ''}</div>` : ''}
      ${wanted ? `<div class="small"><b class="req-flag">ביקש: ${h(PLANS[wanted.plan].label)} ${h(CYCLES[wanted.cycle] || '')}</b></div>` : ''}
      <form method="post" action="/superadmin/businesses/${b.id}/plan" class="row compact">
        ${csrfField(csrf)}
        <select name="plan" aria-label="מסלול">${Object.entries(PLANS)
          .map(([k, p]) => `<option value="${k}" ${(wanted?.plan || b.plan) === k ? 'selected' : ''}>${h(p.label)}</option>`)
          .join('')}</select>
        <select name="cycle" aria-label="תדירות">${Object.entries(CYCLES)
          .map(([k, l]) => `<option value="${k}" ${(wanted?.cycle || b.billing_cycle) === k ? 'selected' : ''}>${h(l)}</option>`)
          .join('')}</select>
        ${b.card_token ? '' : `<label class="small">שולם עד <span class="muted">(לא חובה)</span><input type="date" name="until" value="${h(b.paid_until ? b.paid_until.slice(0, 10) : '')}"></label>`}
        <button class="btn" name="do" value="activate">הפעלה</button>
        <button class="btn-link" name="do" value="extend">+7 ימי ניסיון</button>
        <button class="btn-link" formaction="/superadmin/businesses/${b.id}/reset-usage" title="מאפס את מגבלות הפעולות הידניות לחודש הזה">איפוס מגבלות</button>
        ${accessOf(b).state === 'paused' ? '' : '<button class="btn-link danger-text" name="do" value="pause">השהיה</button>'}
      </form>
      ${
        PLANS[b.plan]?.aiPlus
          ? ''
          : `<form method="post" action="/superadmin/businesses/${b.id}/ai-plus" class="row compact small">
              ${csrfField(csrf)}
              ${b.ai_plus ? `<b>${h(AI_PLUS.label)} פעילה במתנה</b>` : ''}
              <button class="btn-link" name="on" value="${b.ai_plus ? '0' : '1'}">${b.ai_plus ? 'כיבוי' : `${h(AI_PLUS.label)} במתנה`}</button>
            </form>`
      }
      ${
        PLANS[b.plan]?.api
          ? ''
          : `<form method="post" action="/superadmin/businesses/${b.id}/api" class="row compact small">
              ${csrfField(csrf)}
              ${b.api_on ? `<b>${h(INTEGRATIONS.label)} פעילים</b>` : ''}
              <button class="btn-link" name="on" value="${b.api_on ? '0' : '1'}">${b.api_on ? 'כיבוי' : `הפעלת ${h(INTEGRATIONS.label)}`}</button>
            </form>`
      }
    </div>`;
  };
  const requests = businesses.filter((b) => {
    const r = parseJson(b.plan_request, null);
    return r && PLANS[r.plan];
  });
  const agencySelect = (b) => `<form method="post" action="/superadmin/businesses/${b.id}/agency" class="inline">
      ${csrfField(csrf)}
      <select name="agency" onchange="this.form.submit()" aria-label="סוכנות"><option value="">—</option>${agencies
        .map((a) => `<option value="${a.id}" ${b.agency_id === a.id ? 'selected' : ''}>${h(a.name)}</option>`)
        .join('')}</select></form>`;
  return `<div class="page-head"><h1>ניהול מערכת</h1><a class="btn primary" href="/superadmin/status">מצב המערכת וצריכה</a></div>
  <p class="muted">כאן מנהלים את GoFive כולה: כל העסקים שנרשמו, המסלולים והתשלומים, בקשות למסלול, פניות מהאתר, סוכנויות ומשתמשים. העסק שלך עצמו נמצא בתפריט תחת "דשבורד ראשי".</p>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">עסקים</div><div class="kpi-value">${businesses.length}</div></div>
    <div class="kpi"><div class="kpi-label">משתמשים</div><div class="kpi-value">${users.length}</div></div>
    <div class="kpi"><div class="kpi-label">שליחת מיילים</div><div class="kpi-value small-value">${mailEnabled ? 'SMTP פעיל' : 'רישום בלבד'}</div>
      <div class="kpi-hint">${mailEnabled ? '' : 'הגדירו SMTP_URL כדי לשלוח בפועל'}</div></div>
    <div class="kpi" id="ai"><div class="kpi-label">עוזר AI</div><div class="kpi-value small-value">${aiEnabled ? 'מפתח מוגדר' : 'כבוי'}</div>
      <div class="kpi-hint">${aiEnabled ? '' : 'הגדירו ANTHROPIC_API_KEY'}</div>
      <form method="post" action="/superadmin/ai-test">${csrfField(csrf)}<button class="btn-link ai-btn">${icon('spark', 14)} <span>בדיקת חיבור ל-AI</span></button></form>
      ${aiTest ? (aiTest.ok ? `<div class="small" style="color:#15803d">✓ עובד. התשובה: ${h(aiTest.text)}</div>` : `<div class="small danger-text">✗ ${h(aiTest.error)}</div>`) : ''}</div>
  </div>
  ${
    requests.length
      ? `<div class="warn">${requests.length === 1 ? 'עסק אחד ביקש מסלול' : `${requests.length} עסקים ביקשו מסלול`}: ${requests
          .map((b) => h(b.name))
          .join(', ')}. אחרי שהתשלום הוסדר, לוחצים "הפעלה" בשורה של העסק.</div>`
      : ''
  }
  ${icountStopsBlock(businesses, csrf)}
  ${branchesBlock(branches, csrf)}
  ${icountBlock(icount)}
  ${stuckBlock(businesses)}
  <section class="card" id="businesses">
    <div class="row between"><h3>עסקים</h3>
      <form method="post" action="/superadmin/guide-all" onsubmit="return confirm('לשלוח את מדריך ההתחלה במייל לבעלים של כל העסקים?')">${csrfField(csrf)}<button class="btn">שליחת מדריך ההתחלה לכל הבעלים</button></form>
    </div>
    <table class="table responsive"><thead><tr><th>עסק</th><th>בעלים</th><th>מסלול ותשלום</th><th>התקדמות</th><th>סוכנות</th><th>צוות</th><th>דירוגים החודש</th><th>נוצר</th></tr></thead>
    <tbody>${businesses
      .map(
        (b) => `<tr><td data-l="עסק">${h(b.name)}</td><td data-l="בעלים" dir="ltr">${h(b.owner_email || '')}${b.owner_email ? `<form method="post" action="/superadmin/businesses/${b.id}/guide" class="small">${csrfField(csrf)}<button class="btn-link">שליחת מדריך</button></form>` : ''}
          <form method="post" action="/superadmin/businesses/${b.id}/reset-data" class="small" data-name="${h(b.name)}" onsubmit="var v=prompt('איפוס הנתונים של ' + this.dataset.name + ': מקומות וביקורות מגוגל, מיקום במפות, בריאות, מתחרים, בדיקות AI ותשובות לסקרים יימחקו. החשבון, ההגדרות והקמפיינים נשארים. אי אפשר לבטל. כדי לאשר, הקלידו את שם העסק:');if(v===null)return false;this.confirm.value=v;return true">${csrfField(csrf)}<input type="hidden" name="confirm"><button class="btn-link danger-text">איפוס נתונים</button></form></td>
          <td data-l="מסלול">${planSelect(b)}</td><td data-l="התקדמות">${progressChips(b)}</td><td data-l="סוכנות">${agencySelect(b)}</td><td data-l="צוות">${b.members}</td>
          <td data-l="החודש">${b.month_responses}</td><td data-l="נוצר" class="small">${h(formatDate(b.created_at))}</td></tr>`,
      )
      .join('')}</tbody></table>
  </section>
  <section class="card stack" id="passes">
    <h3>קישורי התנסות חינם</h3>
    <p class="muted small">שולחים ללקוח קישור, הוא נרשם דרכו ומקבל ימים חינם בלי כרטיס אשראי ובלי הגבלות הניסיון הרגילות. בסוף התקופה הוא מקבל מייל ובוחר מסלול. ימים נוספים ללקוח מסוים: "הארכת ניסיון" בטבלת העסקים.</p>
    <form method="post" action="/superadmin/passes" class="row compact pass-form">
      ${csrfField(csrf)}
      <label>מסלול<select name="plan">${Object.entries(PLANS).filter(([, p]) => !p.hidden).map(([k, p]) => `<option value="${k}" ${k === 'pro' ? 'selected' : ''}>${h(p.label)}</option>`).join('')}</select></label>
      <label>ימים<select name="days">${[14, 30, 60, 90].map((d) => `<option ${d === 30 ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>כמה עסקים יכולים להשתמש<input name="uses" type="number" min="1" max="100" value="1" style="width:6em"></label>
      <label>למי (הערה לעצמך)<input name="note" maxlength="100" placeholder="למשל: מספרת של דנה"></label>
      <button class="btn primary">יצירת קישור</button>
    </form>
    ${
      passes.length
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>למי</th><th>מה</th><th>שימושים</th><th>קישור</th><th></th></tr></thead><tbody>${passes
            .map((p) => {
              const link = `${baseUrl}/register?pass=${p.code}`;
              const live = !p.revoked_at && p.uses < p.max_uses;
              return `<tr class="${live ? '' : 'unranked'}"><td>${h(p.note || '—')}${p.businesses ? `<div class="small muted">${h(p.businesses)}</div>` : ''}</td>
                <td>${h(PLANS[p.plan]?.label || p.plan)} · ${p.days} ימים</td><td>${p.uses} / ${p.max_uses}</td>
                <td>${live ? `<input readonly value="${h(link)}" dir="ltr" onclick="this.select()" style="min-width:16em">` : p.revoked_at ? 'בוטל' : 'נוצל'}</td>
                <td>${live ? `<form method="post" action="/superadmin/passes/${p.id}/revoke" class="inline">${csrfField(csrf)}<button class="btn-link">ביטול</button></form>` : ''}</td></tr>`;
            })
            .join('')}</tbody></table></div>`
        : ''
    }
  </section>
  ${agenciesAdminBlock({ agencies, csrf })}
  <section class="card" id="leads">
    <h3>פניות מהאתר (הצעות מחיר)</h3>
    ${
      leads.length
        ? `<table class="table responsive"><thead><tr><th>מתי</th><th>סוג</th><th>פרטים</th><th>היקף</th><th>הודעה</th><th></th></tr></thead><tbody>${leads
            .map(
              (l) => `<tr class="${l.handled_at ? 'unranked' : ''}"><td data-l="מתי" class="small">${h(formatDate(l.created_at))}</td>
                <td data-l="סוג">${h(LEAD_KINDS[l.kind] || l.kind)}</td>
                <td data-l="פרטים"><b>${h(l.name)}</b>${l.company ? ` · ${h(l.company)}` : ''}<div class="small" dir="ltr">${h(l.phone)} ${h(l.email)}</div></td>
                <td data-l="היקף">${h(l.size || '—')}${l.marketing_consent ? '<div class="small">✓ אישר דיוור</div>' : ''}</td>
                <td data-l="הודעה" class="clip">${h(l.message || '')}</td>
                <td><form method="post" action="/superadmin/leads/${l.id}" class="inline">${csrfField(csrf)}
                  <input type="hidden" name="handled" value="${l.handled_at ? 0 : 1}">
                  <button class="btn-link">${l.handled_at ? 'טופל ✓ (ביטול)' : 'סימון כטופל'}</button></form></td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted">עוד אין פניות. הן מגיעות מהטופס "הצעת מחיר" בדף הנחיתה.</p>'
    }
  </section>
  <section class="card">
    <div class="row between"><h3>משתמשים</h3>
      <span class="small">${marketingCount} אישרו דיוור פרסומי · <a href="/superadmin/marketing.csv">ייצוא לרשימת תפוצה (CSV)</a>
        · ${unpaidCount} נרשמו ולא התחילו · <a href="/superadmin/marketing.csv?only=unpaid">רק מי שלא התחיל ואישר דיוור</a></span></div>
    <table class="table responsive"><thead><tr><th>שם</th><th>אימייל</th><th>דיוור</th><th>עסקים</th><th>אימות דו-שלבי</th><th>מנהל מערכת</th><th>נרשם</th></tr></thead>
    <tbody>${users
      .map(
        (u) => `<tr><td data-l="שם">${h(u.name)}</td><td data-l="אימייל" dir="ltr">${h(u.email)}</td><td data-l="דיוור">${u.marketing_consent ? '✓' : '—'}</td><td data-l="עסקים">${u.businesses}</td>
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
          <td data-l="נרשם" class="small">${h(formatDate(u.created_at))}${
            u.id === meId || u.is_superadmin
              ? ''
              : `<form method="post" action="/superadmin/users/${u.id}/delete" class="small" data-email="${h(u.email)}" onsubmit="return prompt('מחיקה לצמיתות של ' + this.dataset.email + ', יחד עם העסקים שבבעלותו וכל הנתונים שלהם. אי אפשר לבטל. כדי לאשר, הקלידו את המייל:') === this.dataset.email">${csrfField(csrf)}
                  <input type="hidden" name="confirm" value="${h(u.email)}"><button class="btn-link danger-text">מחיקה</button></form>`
          }</td></tr>`,
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
