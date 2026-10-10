import { accessOf, AI_PLUS, CYCLES, FEATURE_LABELS, limitLabel, PLANS } from '../plans.js';
import { ROLES } from '../store.js';
import { DEFAULT_INVITE_TEMPLATE, INVITE_TEMPLATE_MAX, formatDate, h, inviteMessage, logoSrc } from '../util.js';
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
  const current = business.invite_template || DEFAULT_INVITE_TEMPLATE;
  const sample = (t) => inviteMessage({ name: 'דנה', businessName: business.name, link: 'https://gofive.co.il/r/…', template: t });
  return `<section class="card stack" id="invite-message">
    <h3>נוסח ההודעה בוואטסאפ</h3>
    <p class="muted small">זו ההודעה שנפתחת כששולחים ללקוח בקשת דירוג. אפשר לכתוב אותה בסגנון של העסק. המילים בסוגריים מוחלפות לבד לכל לקוח.</p>
    <div class="im-grid">
      <form method="post" action="/admin/business/invite-message" class="stack">
        ${csrfField(csrf)}
        <div class="im-chips" aria-label="הוספת שדה להודעה">
          ${[
            ['{שם}', 'שם הלקוח'],
            ['{עסק}', 'שם העסק'],
            ['{קישור}', 'הקישור לסקר'],
          ]
            .map(([tok, l]) => `<button type="button" class="chip-btn" data-insert="${tok}">+ ${l}</button>`)
            .join('')}
        </div>
        <textarea name="invite_template" id="im-text" rows="5" maxlength="${INVITE_TEMPLATE_MAX}" dir="rtl">${h(current)}</textarea>
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
        var t = ta.value.trim() || ${JSON.stringify(DEFAULT_INVITE_TEMPLATE)};
        if (t.indexOf('{קישור}') < 0) t += ' {קישור}';
        out.textContent = t.replace(/[ \t]?\{שם\}/g, function (m) { return m.replace('{שם}', 'דנה'); })
          .replace(/\{עסק\}/g, biz).replace(/\{קישור\}/g, 'https://gofive.co.il/r/…');
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
      <h3>חברי צוות (${plan.teamMembers === Infinity ? seatsUsed : `${seatsUsed} מתוך ${limitLabel(plan.teamMembers)}`})</h3>
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
        <dt>צפייה בלבד</dt><dd>הדשבורד והתגובות, בלי לשנות דבר</dd>
      </dl>
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
      <div class="card empty"><p>שליחה אוטומטית מהקופה, ממערכת התורים או מהחנות אינה כלולה במסלול הנוכחי.</p>
      <a class="btn" href="/admin/plan">פרטים על התוכניות</a></div>`;
  }
  const slug = campaign?.slug || 'my-campaign';
  const curl = `curl -X POST ${baseUrl}/api/v1/invites \\
  -H "Authorization: Bearer ${newKey || 'rk_...'}" \\
  -H "Content-Type: application/json" \\
  -d '{"campaign": "${slug}", "name": "דנה", "phone": "0501234567", "email": "dana@example.com", "delay_minutes": 120}'`;
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

export function planView({
  business, plan, usage, access, request = null, csrf = '', can = () => true, requested = false,
  cardBilling = false, payments = [], notice = '', error = '', actionUsage = null, profiles = 1,
}) {
  const meter = (label, used, max) => {
    if (max === Infinity) {
      return `<div class="meter-row"><div class="meter-head"><span>${h(label)}</span><span>${used} · ללא הגבלה</span></div></div>`;
    }
    const pct = Math.min(100, (used / max) * 100);
    return `<div class="meter-row"><div class="meter-head"><span>${h(label)}</span><span>${used} / ${limitLabel(max)}</span></div>
      <div class="dist-bar"><span class="${pct >= 100 ? 'bad' : pct >= 80 ? 'mid' : 'good'}" style="width:${pct}%"></span></div></div>`;
  };
  const cycle = CYCLES[business.billing_cycle] || CYCLES.monthly;
  let status;
  if (access?.state === 'trial') {
    status = `<div class="plan-status trial"><b>תקופת ניסיון במסלול ${h(plan.label)}</b>
      <span>${access.daysLeft === 1 ? 'היום האחרון' : `נשארו ${access.daysLeft} ימים`}, עד ${h(formatDate(access.endsAt).split(',')[0])}. אחרי זה הסקרים יושהו עד שתבחרו מסלול.</span></div>`;
  } else if (access?.state === 'paused') {
    status = `<div class="plan-status paused"><b>${access.reason === 'trial' ? 'תקופת הניסיון הסתיימה' : 'החשבון מושהה'}</b>
      <span>הסקרים ללקוחות לא פעילים. כל הנתונים שמורים, ואחרי בחירת מסלול הכול חוזר לעבוד כמו קודם.</span></div>`;
  } else if (business.card_token && business.paid_until) {
    const until = h(formatDate(`${business.paid_until.replace(' ', 'T')}Z`).split(',')[0]);
    const next = PLANS[business.next_plan];
    status = `<div class="plan-status active"><b>מסלול ${h(plan.label)} · ${h(cycle)}</b>
      <span>${
        business.auto_renew
          ? `החידוש הבא ב-${until}${next ? `, למסלול ${h(next.label)} (${h(CYCLES[business.next_cycle] || cycle)})` : ''}, בכרטיס שמסתיים ב-${h(business.card_last4 || '····')}.`
          : `פעיל עד ${until}, בלי חידוש אוטומטי.`
      }</span>
      ${
        can('owner')
          ? `<form method="post" action="/admin/billing/auto-renew" class="inline">${csrfField(csrf)}
              <button class="btn-link ${business.auto_renew ? 'danger-text' : ''}" name="on" value="${business.auto_renew ? '0' : '1'}"
                ${business.auto_renew ? `onclick="return confirm('לבטל את החידוש האוטומטי? המסלול יישאר פעיל עד ${until}.')"` : ''}>${
                  business.auto_renew ? 'ביטול החידוש האוטומטי' : 'חידוש אוטומטי מחדש'
                }</button></form>`
          : ''
      }</div>`;
  } else {
    status = `<div class="plan-status active"><b>מסלול ${h(plan.label)} · ${h(cycle)}</b><span>החשבון פעיל.</span></div>`;
  }
  const paying = Boolean(business.card_token && access?.state === 'active');
  const pending =
    request && PLANS[request.plan]
      ? `<div class="flash">${requested ? 'הבקשה נשלחה. ' : ''}${
          request.plan === 'enterprise'
            ? 'ביקשת הצעת מחיר לרשת. ניצור איתך קשר בקרוב.'
            : `ביקשת את מסלול <b>${h(PLANS[request.plan].label)}</b> (${h(CYCLES[request.cycle] || '')}). ניצור איתך קשר כדי להשלים את התשלום ולהפעיל את המסלול.`
        }</div>`
      : '';
  const op = operatorInfo();
  const action = (key) =>
    can('owner')
      ? `<button class="btn ${key === 'pro' ? 'accent' : 'primary'} plan-cta" name="plan" value="${key}">${
          access?.state === 'active' && key === business.plan
            ? 'להחליף תדירות תשלום'
            : cardBilling && !paying
              ? `תשלום ומעבר ל${h(PLANS[key].label)}`
              : `בחירה ב${h(PLANS[key].label)}`
        }</button>`
      : '';
  const history = payments.length
    ? `<section class="card"><h3>תשלומים</h3><div class="table-wrap"><table class="table"><thead><tr><th>תאריך</th><th>מה</th><th>סכום</th><th>סטטוס</th></tr></thead><tbody>${payments
        .map(
          (p) => `<tr><td>${h(formatDate(`${String(p.paid_at || p.created_at).replace(' ', 'T')}Z`).split(',')[0])}</td>
            <td>${h(PAYMENT_KINDS[p.kind] || p.kind)} · ${h(PLANS[p.plan]?.label || p.plan)}</td><td>₪${h(String(p.amount))}</td>
            <td>${p.status === 'paid' ? '<span class="badge st-resolved">שולם</span>' : `<span class="badge st-new" title="${h(p.error || '')}">נכשל</span>`}</td></tr>`,
        )
        .join('')}</tbody></table></div><p class="muted small">החשבוניות נשלחות במייל מחברת הסליקה.</p></section>`
    : '';
  return `<h1>התוכנית שלי</h1>
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${pending}
  <section class="card stack">
    ${status}
    <div class="plan-profiles">
      <span><b>${profiles}</b> ${profiles === 1 ? 'פרופיל גוגל' : 'פרופילי גוגל'} בחשבון</span>
      ${plan.price != null ? `<span>החיוב: ${profiles > 1 ? `${profiles} × ₪${plan.price} = ` : ''}<b>₪${(plan.price * profiles).toLocaleString('he-IL')}</b> לחודש, כולל מע״מ</span>` : ''}
      <span class="muted small">כל פרופיל גוגל שמחוברים אליו נספר בנפרד. קמפיינים, משתמשים ודירוגים: ללא הגבלה.</span>
    </div>
  </section>
  ${
    actionUsage
      ? `<section class="card stack"><h3>שימוש החודש</h3>
          <p class="muted small">פעולות שמפעילים בלחיצה. מה שרץ לבד (בדיקות שבועיות, סנכרון ביקורות) לא נספר כאן. מתאפס ב-1 לכל חודש.</p>
          ${Object.entries(ACTION_LABELS).map(([k, label]) => meter(label, actionUsage[k].used, actionUsage[k].limit)).join('')}
        </section>`
      : ''
  }
  <section class="card stack">
    <h3>המסלולים</h3>
    ${can('owner') ? '' : '<p class="muted">רק בעלי העסק יכולים לבחור מסלול.</p>'}
    <form method="post" action="/admin/plan/request">
      <input type="hidden" name="_csrf" value="${h(csrf)}">
      ${pricingCards({ action, current: access?.state === 'active' ? business.plan : '' })}
    </form>
    ${
      can('owner')
        ? customOffer(`<form method="post" action="/admin/plan/request">
            <input type="hidden" name="_csrf" value="${h(csrf)}">
            <button class="btn accent" name="plan" value="enterprise">בקשת הצעת מחיר</button>
          </form>`)
        : ''
    }
    <p class="muted small">${
      cardBilling
        ? paying
          ? 'שדרוג נכנס לתוקף מיד, ומחויב רק על הימים שנשארו עד החידוש. מעבר למסלול זול יותר או לתדירות אחרת נכנס לתוקף בחידוש הבא.'
          : 'התשלום בכרטיס אשראי, בדף המאובטח של קארדקום. המנוי מתחדש לבד, ואפשר לבטל בכל רגע. חשבונית נשלחת במייל.'
        : 'התשלום עדיין לא אונליין: אחרי הבחירה נחזור אליכם להשלמת התשלום ונפעיל את המסלול.'
    }${op.email ? ` שאלות? <span dir="ltr">${h(op.email)}</span>` : ''}</p>
  </section>
  ${history}`;
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
    form = `<p class="muted">עוזר ה-AI עוד לא הופעל במערכת. מנהל המערכת יכול להפעיל אותו, ואז יופיע כאן כפתור לסיכום המשובים.</p>`;
  } else if (!planAllows) {
    form = `<p class="muted">תובנות AI אינן כלולות במסלול הנוכחי. <a href="/admin/plan">פרטים</a></p>`;
  } else if (canGenerate) {
    form = `<form method="post" action="/admin/insights" class="row">
      ${csrfField(csrf)}
      <select name="campaign" aria-label="קמפיין"><option value="">כל הקמפיינים</option>${campaigns
        .map((c) => `<option value="${c.id}">${h(c.name)}</option>`)
        .join('')}</select>
      <select name="days" aria-label="תקופה"><option value="7">7 ימים</option><option value="30" selected>30 ימים</option><option value="90">90 ימים</option></select>
      <button class="btn primary ai-btn">${icon('spark', 16)} <span>הפקת תובנות</span></button>
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
};

export function superadminView({ businesses, users, outbox, csrf, mailEnabled, aiEnabled, aiTest = null, meId, agencies = [], leads = [], error = '' }) {
  const statusBadge = (b) => {
    const a = accessOf(b);
    if (a.state === 'trial') return `<span class="badge st-in_progress">ניסיון · עוד ${a.daysLeft} ימים</span>`;
    if (a.state === 'paused') return `<span class="badge st-new">${a.reason === 'trial' ? 'הניסיון נגמר' : 'מושהה'}</span>`;
    return `<span class="badge st-resolved">פעיל · ${h(CYCLES[b.billing_cycle] || '')}</span>`;
  };
  const planSelect = (b) => {
    const req = parseJson(b.plan_request, null);
    const wanted = req && PLANS[req.plan] ? req : null;
    return `<div class="billing-cell">
      ${statusBadge(b)} <b>${h(PLANS[b.plan]?.label || b.plan)}</b>
      ${b.card_token && b.paid_until ? `<div class="small muted">כרטיס ··${h(b.card_last4 || '')} · עד ${h(b.paid_until.slice(0, 10))}${b.auto_renew ? '' : ' · בלי חידוש'}${b.pay_failures ? ` · <b class="danger-text">${b.pay_failures} חיובים נכשלו</b>` : ''}</div>` : ''}
      ${wanted ? `<div class="small"><b class="req-flag">ביקש: ${h(PLANS[wanted.plan].label)} ${h(CYCLES[wanted.cycle] || '')}</b></div>` : ''}
      <form method="post" action="/superadmin/businesses/${b.id}/plan" class="row compact">
        ${csrfField(csrf)}
        <select name="plan" aria-label="מסלול">${Object.entries(PLANS)
          .map(([k, p]) => `<option value="${k}" ${(wanted?.plan || b.plan) === k ? 'selected' : ''}>${h(p.label)}</option>`)
          .join('')}</select>
        <select name="cycle" aria-label="תדירות">${Object.entries(CYCLES)
          .map(([k, l]) => `<option value="${k}" ${(wanted?.cycle || b.billing_cycle) === k ? 'selected' : ''}>${h(l)}</option>`)
          .join('')}</select>
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
  <section class="card" id="businesses">
    <h3>עסקים</h3>
    <table class="table responsive"><thead><tr><th>עסק</th><th>בעלים</th><th>מסלול ותשלום</th><th>סוכנות</th><th>קמפיינים</th><th>צוות</th><th>דירוגים החודש</th><th>נוצר</th></tr></thead>
    <tbody>${businesses
      .map(
        (b) => `<tr><td data-l="עסק">${h(b.name)}</td><td data-l="בעלים" dir="ltr">${h(b.owner_email || '')}</td>
          <td data-l="מסלול">${planSelect(b)}</td><td data-l="סוכנות">${agencySelect(b)}</td><td data-l="קמפיינים">${b.campaigns}</td><td data-l="צוות">${b.members}</td>
          <td data-l="החודש">${b.month_responses}</td><td data-l="נוצר" class="small">${h(formatDate(b.created_at))}</td></tr>`,
      )
      .join('')}</tbody></table>
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
                <td data-l="היקף">${h(l.size || '—')}</td>
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
