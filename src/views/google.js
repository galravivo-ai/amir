import { formatDate, h } from '../util.js';
import { icon } from './icons.js';

const stars = (n) => `<span class="g-stars" aria-label="${n} מתוך 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;

const GOOGLE_G = `<svg class="g-logo" width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

export function googleSetupView({ configured, isSuperadmin, redirectUri }) {
  return `<h1>${GOOGLE_G} ביקורות גוגל</h1>
  <section class="card stack">
    ${
      configured
        ? ''
        : isSuperadmin
          ? `<p><b>החיבור לגוגל עוד לא הוגדר בשרת.</b> צריך ליצור OAuth Client ב-Google Cloud ולהוסיף ב-Railway את <code>GOOGLE_CLIENT_ID</code> ו-<code>GOOGLE_CLIENT_SECRET</code>.</p>
             <p>כתובת החזרה (Authorized redirect URI) שצריך לרשום בגוגל:</p>
             <input class="copy" readonly dir="ltr" value="${h(redirectUri)}" onclick="this.select()" aria-label="כתובת חזרה">`
          : '<p class="muted">החיבור לגוגל יהיה זמין בקרוב.</p>'
    }
  </section>`;
}

/** For the system admin: what the server actually read from the environment. */
function googleSetupCheck({ clientId, secretLooksRight, secretLength, redirectUri }) {
  const idOk = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId);
  const row = (ok, label, value) => `<li>${ok ? '✅' : '❌'} ${label}: <code dir="ltr">${h(value)}</code></li>`;
  return `<section class="card"><h3>בדיקת הגדרות (רק מנהל המערכת רואה את זה)</h3><ul class="how-list">
    ${row(idOk, 'GOOGLE_CLIENT_ID', clientId)}
    ${row(secretLooksRight, 'GOOGLE_CLIENT_SECRET', `${secretLength} תווים${secretLooksRight ? '' : ', אמור להתחיל ב-GOCSPX-'}`)}
    ${row(true, 'כתובת חזרה שצריכה להופיע ב-Authorized redirect URIs', redirectUri)}
  </ul></section>`;
}

function locationsTable(locations, { campaigns, csrf, can, deletable, debug = false }) {
  const campaignOptions = (cur) =>
    `<option value="">— בלי שיוך —</option>${campaigns
      .map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${h(c.name)}</option>`)
      .join('')}`;
  return `<table class="table responsive"><thead><tr><th>סניף בגוגל</th><th>דירוג</th><th>מעקב וקמפיין</th></tr></thead><tbody>${locations
    .map(
      (l) => `<tr><td data-l="סניף"><b>${h(l.title || 'טוען פרטים…')}</b><div class="muted small">${h(l.address)}</div>
          ${l.sync_error ? `<div class="danger-text small">הבדיקה האחרונה נכשלה: ${h(l.sync_error)}</div>` : ''}
          ${debug && l.source === 'serp' ? `<a class="small" href="/admin/google/locations/${l.id}/debug">בדיקת SerpApi</a>` : ''}</td>
        <td data-l="דירוג">${l.total_reviews ? `${Number(l.avg_rating).toFixed(1)} ★ <span class="muted small">(${Number(l.total_reviews).toLocaleString('he-IL')})</span>` : '—'}
          <div class="muted small">${l.synced_at ? `נבדק ${h(formatDate(l.synced_at))}` : l.source === 'serp' && !l.sync_error ? '<span class="g-loading">טוען ביקורות…</span>' : ''}</div></td>
        <td data-l="מעקב">${
          can('manager')
            ? `<div class="row compact"><form method="post" action="/admin/google/locations/${l.id}" class="row compact">
                <input type="hidden" name="_csrf" value="${h(csrf)}">
                <label class="check"><input type="checkbox" name="enabled" value="1" ${l.enabled ? 'checked' : ''}> מעקב</label>
                <select name="campaign" aria-label="קמפיין">${campaignOptions(l.campaign_id)}</select>
                <button class="btn">שמירה</button>
              </form>${
                deletable
                  ? `<form method="post" action="/admin/google/locations/${l.id}/delete" onsubmit="return confirm('להפסיק לעקוב אחרי הסניף? הביקורות שנשמרו שלו יימחקו מכאן.')">
                      <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">הסרה</button></form>`
                  : ''
              }</div>`
            : `${l.enabled ? 'במעקב' : '—'} ${l.campaign_name ? `· ${h(l.campaign_name)}` : ''}`
        }</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function serpSection({ places, matches, query, csrf, can, campaigns, serpHours, branchLimit, debug }) {
  const full = places.length >= branchLimit;
  return `<section class="card stack">
    <h2>מעקב אחרי הביקורות בגוגל</h2>
    <p class="muted">מדביקים את הקישור לעסק בגוגל מפות, או כותבים את שם העסק והעיר. כל הביקורות נטענות, וכל ביקורת חדשה מגיעה לכאן עם התראה. הבדיקה מתבצעת לבד כל ${serpHours || 6} שעות.</p>
    ${
      can('manager') && !full
        ? `<form method="post" action="/admin/google/places/find" class="row compact g-find">
            <input type="hidden" name="_csrf" value="${h(csrf)}">
            <input name="q" value="${h(query)}" required maxlength="500" placeholder="https://maps.app.goo.gl/…  או  קפה לנדוור, רמת גן" aria-label="קישור לגוגל מפות או שם העסק">
            <button class="btn primary">חיפוש והוספה</button>
          </form>
          <details class="muted small"><summary>איך מוצאים את הקישור?</summary>
            <p>פותחים את העסק בגוגל מפות, לוחצים "שיתוף" ← "העתקת קישור", ומדביקים כאן.</p></details>`
        : full && can('manager')
          ? `<p class="muted small">הגעתם למספר הסניפים שבמסלול (${branchLimit}). כדי להוסיף עוד, <a href="/admin/plan">שדרגו את המסלול</a>.</p>`
          : ''
    }
    ${
      matches
        ? matches.length
          ? `<div class="g-matches"><p><b>בחרו את העסק:</b></p>${matches
              .map(
                (m) => `<form method="post" action="/admin/google/places/add" class="g-match">
                  <input type="hidden" name="_csrf" value="${h(csrf)}">
                  <input type="hidden" name="data_id" value="${h(m.dataId)}"><input type="hidden" name="place_id" value="${h(m.placeId)}">
                  <input type="hidden" name="title" value="${h(m.title)}"><input type="hidden" name="address" value="${h(m.address)}">
                  <div><b>${h(m.title)}</b><div class="muted small">${h(m.address)}</div>
                    ${m.total ? `<div class="small">${m.rating.toFixed(1)} ★ · ${m.total.toLocaleString('he-IL')} ביקורות</div>` : ''}</div>
                  <button class="btn">זה העסק</button>
                </form>`,
              )
              .join('')}</div>`
          : ''
        : ''
    }
    ${places.length ? locationsTable(places, { campaigns, csrf, can, deletable: true, debug }) : ''}
    ${
      places.some((l) => !l.synced_at && !l.sync_error)
        ? '<script>setTimeout(function(){location.replace(location.pathname)},8000)</script>'
        : ''
    }
    <p class="muted small">כדי לענות לביקורת, לוחצים עליה ואז "מענה בגוגל". ה-AI יכול לנסח לכם טיוטה להעתקה.</p>
  </section>`;
}

export function googleConnectView({
  conn,
  gbpAvailable = true,
  serpAvailable = false,
  serpHours,
  branchLimit = Infinity,
  serpMissing = false,
  locations,
  matches = null,
  query = '',
  campaigns,
  csrf,
  can,
  notice = '',
  error = '',
  setupCheck = null,
  debug = false,
}) {
  const places = locations.filter((l) => l.source === 'serp');
  const gbpLocations = locations.filter((l) => l.source !== 'serp');
  const hasAny = locations.length > 0;
  const head = `<div class="dash-head"><div class="titles"><h1>${GOOGLE_G} ביקורות גוגל</h1></div>
    ${
      hasAny
        ? `<div class="g-actions">${
            can('manager')
              ? `<form method="post" action="/admin/google/sync"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn">בדיקה עכשיו</button></form>`
              : ''
          }<a class="btn primary" href="/admin/google/reviews">לביקורות</a></div>`
        : ''
    }</div>
  ${googleTabs('settings')}
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${serpMissing ? '<div class="warn">כדי לעקוב אחרי ביקורות לפי קישור, הוסיפו ב-Railway את המשתנה <code>SERPAPI_KEY</code> (רק מנהל המערכת רואה את זה).</div>' : ''}
  ${setupCheck ? googleSetupCheck(setupCheck) : ''}`;

  const serpPart = serpAvailable ? serpSection({ places, matches, query, csrf, can, campaigns, serpHours, branchLimit, debug }) : '';

  let gbpPart = '';
  if (gbpAvailable && !conn) {
    gbpPart = `<section class="card g-hero">
      <div class="stack">
        <h2>${serpAvailable ? 'חיבור חשבון הגוגל של העסק' : 'כל הביקורות מגוגל, במקום אחד'}</h2>
        <ul class="how-list">
          ${serpAvailable ? '' : '<li>כל ביקורת חדשה בגוגל מגיעה לכאן, עם התראה לטלפון.</li><li>ביקורת של 3 כוכבים ומטה נשלחת גם במייל, כדי שתענו מהר.</li>'}
          <li>עונים לביקורות ישירות מכאן, עם טיוטה שה-AI מנסח ואתם מאשרים.</li>
          <li>הסניפים נטענים אוטומטית מהחשבון, והביקורות מתעדכנות כל חצי שעה.</li>
        </ul>
        ${
          can('manager')
            ? `<form method="post" action="/admin/google/connect"><input type="hidden" name="_csrf" value="${h(csrf)}">
                <button class="btn g-btn">${GOOGLE_G} התחברות עם חשבון גוגל של העסק</button></form>
               <p class="muted small">מתחברים עם חשבון הגוגל שמנהל את פרופיל העסק במפות. אנחנו מבקשים רק הרשאה לנהל ביקורות, לא גישה למייל או לקבצים.</p>`
            : '<p class="muted">רק מנהלים יכולים לחבר את החשבון.</p>'
        }
      </div>
    </section>`;
  } else if (gbpAvailable && conn) {
    gbpPart = `${conn.last_error ? `<div class="warn">הסנכרון האחרון מול החשבון נכשל: ${h(conn.last_error)}</div>` : ''}
    <section class="card stack">
      <h2>חשבון הגוגל של העסק</h2>
      <div><b>מחובר</b>${conn.email ? ` · <span dir="ltr">${h(conn.email)}</span>` : ''}
        <div class="muted small">סנכרון אחרון: ${conn.last_sync_at ? h(formatDate(conn.last_sync_at)) : 'עוד לא'} · מתעדכן כל חצי שעה</div></div>
      <p class="muted small">מסמנים אילו סניפים לעקוב אחריהם, ומשייכים כל אחד לקמפיין. אם לקמפיין עוד אין קישור לביקורת, הקישור מגוגל נכנס אליו לבד.</p>
      ${
        gbpLocations.length
          ? locationsTable(gbpLocations, { campaigns, csrf, can, deletable: false })
          : '<p class="muted">לא נמצאו סניפים בחשבון הזה. ודאו שהתחברתם עם החשבון שמנהל את פרופיל העסק בגוגל.</p>'
      }
      ${
        can('owner')
          ? `<form method="post" action="/admin/google/disconnect" onsubmit="return confirm('לנתק את החיבור לגוגל? הביקורות שנשמרו מהחשבון יימחקו מכאן, בגוגל לא ישתנה כלום.')">
              <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">ניתוק החשבון</button></form>`
          : ''
      }
    </section>`;
  }
  return `${head}${serpPart}${gbpPart}`;
}

export function googleReviewsView({ reviews, locations, filters, summary }) {
  const opt = (v, l, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${h(l)}</option>`;
  return `<div class="dash-head"><div class="titles"><h1>${GOOGLE_G} ביקורות גוגל</h1>
      <p class="muted">${summary.total ? `דירוג ${summary.avg.toFixed(1)} ★ מתוך ${summary.total} ביקורות` : 'עוד אין נתונים מגוגל'}${summary.unanswered ? ` · <b>${summary.unanswered} ממתינות לתשובה</b>` : ''}</p></div>
    <form method="get" class="filters">
      <select name="filter" onchange="this.form.submit()" aria-label="סינון">${opt('', 'כל הביקורות', filters.filter)}${opt('unanswered', 'ממתינות לתשובה', filters.filter)}${opt('negative', '3 כוכבים ומטה', filters.filter)}</select>
      ${locations.length > 1 ? `<select name="location" onchange="this.form.submit()" aria-label="סניף">${opt('', 'כל הסניפים', filters.location)}${locations.map((l) => opt(l.id, l.title, filters.location)).join('')}</select>` : ''}
      <noscript><button class="btn">סינון</button></noscript>
    </form></div>
  ${googleTabs('reviews')}
  ${
    reviews.length
      ? `<div class="g-list">${reviews
          .map(
            (r) => `<a class="card g-item ${r.reply ? '' : 'pending'}" href="/admin/google/reviews/${r.id}">
              <div class="g-head">${stars(r.rating)}<b>${h(r.reviewer || 'לקוח אנונימי')}</b><span class="muted small">${h(formatDate(r.create_time))}${locations.length > 1 ? ` · ${h(r.location_title)}` : ''}</span></div>
              <p class="${r.comment ? '' : 'muted'}">${h(r.comment || 'דירוג בלי טקסט')}</p>
              ${r.reply ? `<div class="g-reply small"><b>התשובה שלכם:</b> ${h(r.reply)}</div>` : '<span class="badge st-new">ממתינה לתשובה</span>'}
            </a>`,
          )
          .join('')}</div>`
      : '<div class="card empty"><p class="muted">אין ביקורות להצגה. אם רק הוספתם עסק, לחצו "בדיקה עכשיו" בהגדרות.</p></div>'
  }`;
}

export function googleReviewView({ review, draft = '', csrf, can, aiAvailable, canPublish = true, error = '', saved = false }) {
  const text = draft || review.reply || '';
  const aiForm = aiAvailable
    ? `<form method="post" action="/admin/google/reviews/${review.id}/draft"><input type="hidden" name="_csrf" value="${h(csrf)}">
        <button class="btn ai-btn">${icon('spark', 16)} <span>${draft ? 'טיוטה אחרת' : 'טיוטה מה-AI'}</span></button></form>`
    : '';
  const googleLink = review.link || (review.place_id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(review.place_id)}` : '');
  let answer = '';
  if (can('manager') && canPublish) {
    answer = `<section class="card stack">
      <h3>${review.reply ? 'התשובה שלכם (אפשר לעדכן)' : 'תשובה פומבית'}</h3>
      <p class="muted small">התשובה מופיעה בגוגל מתחת לביקורת, וכל מי שמחפש את העסק רואה אותה.</p>
      <form method="post" action="/admin/google/reviews/${review.id}/reply" class="stack">
        <input type="hidden" name="_csrf" value="${h(csrf)}">
        <textarea name="reply" rows="5" maxlength="4000" required>${h(text)}</textarea>
        <div class="row compact"><button class="btn primary">${review.reply ? 'עדכון התשובה בגוגל' : 'פרסום התשובה בגוגל'}</button></div>
      </form>
      ${aiForm}
    </section>`;
  } else if (can('manager')) {
    answer = `${review.reply ? `<section class="card"><b>התשובה שלכם בגוגל:</b> ${h(review.reply)}</section>` : ''}
    <section class="card stack">
      <h3>${review.reply ? 'עדכון התשובה' : 'מענה לביקורת'}</h3>
      <p class="muted small">כותבים או מבקשים טיוטה מה-AI, מעתיקים, ולוחצים "מענה בגוגל" כדי להדביק שם. אחרי הבדיקה הבאה, התשובה תופיע גם כאן.</p>
      <textarea id="g-draft" rows="5" maxlength="4000" aria-label="טיוטת תשובה">${h(draft)}</textarea>
      <div class="row compact">
        <button type="button" class="btn" onclick="var t=document.getElementById('g-draft');t.select();(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(function(){this.textContent='הועתק ✓'}.bind(this)).catch(function(){document.execCommand('copy')})">העתקה</button>
        ${googleLink ? `<a class="btn primary" href="${h(googleLink)}" target="_blank" rel="noopener">מענה בגוגל ↗</a>` : ''}
      </div>
      ${aiForm}
    </section>`;
  } else if (review.reply) {
    answer = `<section class="card"><b>התשובה שלכם:</b> ${h(review.reply)}</section>`;
  }
  return `<p><a href="/admin/google/reviews">→ לכל הביקורות</a></p>
  <h1>${stars(review.rating)} ${h(review.reviewer || 'לקוח אנונימי')}</h1>
  <p class="muted">${h(review.location_title)} · ${h(formatDate(review.create_time))}</p>
  ${saved ? '<div class="flash">התשובה פורסמה בגוגל.</div>' : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <section class="card stack">
    <p class="g-comment ${review.comment ? '' : 'muted'}">${h(review.comment || 'הלקוח דירג בלי לכתוב טקסט.')}</p>
  </section>
  ${answer}`;
}

/** Small dashboard card: the Google rating at a glance. */
export function googleDashCard(summary) {
  if (!summary || !summary.total) return '';
  return `<a class="g-dash" href="/admin/google/reviews${summary.unanswered ? '?filter=unanswered' : ''}">
    ${GOOGLE_G}<span><b>${summary.avg.toFixed(1)} ★</b> בגוגל · ${summary.total.toLocaleString('he-IL')} ביקורות</span>
    ${summary.unanswered ? `<span class="badge st-new">${summary.unanswered} ממתינות לתשובה</span>` : '<span class="muted small">הכול נענה ✓</span>'}
  </a>`;
}

/** Tabs shared by the Google pages. */
export function googleTabs(current) {
  const tab = (href, label, key) => `<a href="${href}" class="${key === current ? 'active' : ''}" ${key === current ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="g-tabs" aria-label="גוגל">${tab('/admin/google/reviews', 'ביקורות', 'reviews')}${tab('/admin/google', 'הגדרות חיבור', 'settings')}</nav>`;
}

export function googlePostsView({
  posts,
  locations,
  connected,
  gbpAvailable,
  aiAvailable,
  csrf,
  can,
  topics,
  ctaTypes,
  businessName,
  posted = null,
  values = {},
  error = '',
}) {
  const v = (k, d = '') => h(values[k] ?? d);
  const topic = topics[values.topic] ? values.topic : 'STANDARD';
  const chosen = new Set([].concat(values.locations ?? locations.map((l) => String(l.id))).map(String));
  const results = (p) => {
    try {
      return JSON.parse(p.results || '[]');
    } catch {
      return [];
    }
  };
  const resultLine = (r) =>
    r.ok
      ? `<li class="ok">✓ ${h(r.location)}${r.state === 'PROCESSING' ? ' · בבדיקה של גוגל' : ''}${r.url ? ` · <a href="${h(r.url)}" target="_blank" rel="noopener">לפוסט</a>` : ''}</li>`
      : `<li class="bad">✗ ${h(r.location)}: ${h(r.error)}</li>`;
  const action = (path) => `${path}?_csrf=${encodeURIComponent(csrf)}`;
  return `<h1>${GOOGLE_G} פוסטים בגוגל</h1>
  <p class="page-intro">פוסט בפרופיל העסק מופיע למי שמחפש אתכם בגוגל ובמפות. פוסט קבוע, פעם בשבוע-שבועיים, עוזר להופיע גבוה יותר.</p>
  ${posted ? `<div class="flash">הפוסט נשלח לגוגל.<ul class="post-results">${results(posted).map(resultLine).join('')}</ul></div>` : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${
    connected
      ? ''
      : `<div class="warn">${
          gbpAvailable
            ? 'כדי לפרסם ישירות מכאן צריך <a href="/admin/google">לחבר את חשבון הגוגל של העסק</a> (ממתין לאישור של גוגל).'
            : 'פרסום ישיר יהיה זמין אחרי חיבור החשבון לגוגל.'
        } בינתיים אפשר לכתוב כאן את הפוסט, גם בעזרת ה-AI, ללחוץ "העתקה" ואז "פתיחה בגוגל" ולהדביק.</div>`
  }
  ${
    can('manager')
      ? `<div class="post-grid">
    <form id="post-form" class="card stack" method="post" action="${action('/admin/google/posts')}" enctype="multipart/form-data">
      <input type="hidden" name="image_token" value="${v('image_token')}">
      <div class="seg" role="radiogroup" aria-label="סוג הפוסט">${Object.entries(topics)
        .map(([k, l]) => `<label><input type="radio" name="topic" value="${k}" ${k === topic ? 'checked' : ''}><span>${h(l)}</span></label>`)
        .join('')}</div>
      <div class="when-event stack">
        <label>כותרת<input name="title" maxlength="58" value="${v('title')}" placeholder="למשל: 1+1 על כל הקפה"></label>
        <div class="grid2 tight">
          <label>מתחיל<input type="datetime-local" name="starts_at" value="${v('starts_at')}"></label>
          <label>נגמר<input type="datetime-local" name="ends_at" value="${v('ends_at')}"></label>
        </div>
      </div>
      <div class="when-offer grid2 tight">
        <label>קוד קופון (לא חובה)<input name="coupon" maxlength="58" value="${v('coupon')}" dir="ltr"></label>
        <label>תנאים (לא חובה)<input name="terms" maxlength="500" value="${v('terms')}"></label>
      </div>
      ${
        aiAvailable
          ? `<div class="ai-row">
              <input name="idea" maxlength="500" value="${v('idea')}" placeholder="על מה הפוסט? למשל: השבוע קפה ומאפה ב-20 ש״ח עד 11:00">
              <button class="btn ai-btn" formaction="${action('/admin/google/posts/draft')}" formnovalidate>${icon('spark', 16)} <span>ה-AI ינסח</span></button>
            </div>`
          : ''
      }
      <label>הטקסט של הפוסט
        <textarea name="summary" id="post-text" rows="7" maxlength="1500" placeholder="מה חדש אצלכם?">${v('summary')}</textarea>
        <span class="muted small"><span id="post-count">0</span>/1500</span>
      </label>
      <div class="stack tight-stack"><span class="label-text">תמונה (לא חובה)</span>
        <label class="file-pick">
          <input type="file" name="photo" id="post-photo" accept="image/jpeg,image/png">
          <span class="btn">${icon('inbox', 18)} ${values.image_token ? 'החלפת תמונה' : 'בחירת תמונה'}</span>
          <span class="file-name" id="post-photo-name">${values.image_token ? 'נבחרה תמונה' : 'JPG או PNG, עד 5MB'}</span>
        </label>
      </div>
      <div class="grid2 tight">
        <label>כפתור<select name="cta_type" id="post-cta">${Object.entries(ctaTypes)
          .map(([k, l]) => `<option value="${k}" ${k === (values.cta_type ?? '') ? 'selected' : ''}>${h(l)}</option>`)
          .join('')}</select></label>
        <label class="when-url">קישור לכפתור<input name="cta_url" value="${v('cta_url')}" dir="ltr" placeholder="https://"></label>
      </div>
      ${
        connected && locations.length
          ? `<fieldset class="post-locs"><legend>לפרסם ב:</legend>${locations
              .map((l) => `<label class="check"><input type="checkbox" name="locations" value="${l.id}" ${chosen.has(String(l.id)) ? 'checked' : ''}> ${h(l.title)}</label>`)
              .join('')}</fieldset>`
          : ''
      }
      <div class="row compact">
        ${connected ? '<button class="btn primary">פרסום בגוגל</button>' : ''}
        <button type="button" class="btn" id="post-copy">העתקת הטקסט</button>
        <a class="btn" href="https://business.google.com/" target="_blank" rel="noopener">פתיחה בגוגל ↗</a>
      </div>
    </form>
    <aside class="post-preview" aria-label="תצוגה מקדימה">
      <span class="muted small">כך זה ייראה בגוגל:</span>
      <div class="gpost">
        <div class="gpost-head"><span class="gpost-avatar">${h(String(businessName).charAt(0))}</span><b>${h(businessName)}</b></div>
        <img id="pv-img" alt="" ${values.image_token ? `src="/m/${v('image_token')}"` : 'hidden'}>
        <div class="gpost-body">
          <b id="pv-title" hidden></b>
          <span id="pv-dates" class="muted small" hidden></span>
          <p id="pv-text"></p>
          <span id="pv-coupon" class="gpost-coupon" hidden></span>
          <span id="pv-cta" class="gpost-cta" hidden></span>
        </div>
      </div>
    </aside>
  </div>
  <script>
  (function () {
    var f = document.getElementById('post-form'); if (!f) return;
    var $ = function (id) { return document.getElementById(id); };
    function fmt(v) { if (!v) return ''; var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('he-IL') + ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
    function update() {
      var topic = f.querySelector('input[name=topic]:checked').value;
      f.classList.toggle('is-event', topic !== 'STANDARD');
      f.classList.toggle('is-offer', topic === 'OFFER');
      var cta = $('post-cta').value;
      f.classList.toggle('has-url', !!cta && cta !== 'CALL');
      var text = $('post-text').value;
      $('post-count').textContent = text.length;
      $('pv-text').textContent = text || 'הטקסט של הפוסט יופיע כאן';
      var title = topic !== 'STANDARD' ? f.title.value.trim() : '';
      $('pv-title').hidden = !title; $('pv-title').textContent = title;
      var dates = topic !== 'STANDARD' && f.starts_at.value ? fmt(f.starts_at.value) + (f.ends_at.value ? ' – ' + fmt(f.ends_at.value) : '') : '';
      $('pv-dates').hidden = !dates; $('pv-dates').textContent = dates;
      var coupon = topic === 'OFFER' ? f.coupon.value.trim() : '';
      $('pv-coupon').hidden = !coupon; $('pv-coupon').textContent = 'קוד: ' + coupon;
      $('pv-cta').hidden = !cta; $('pv-cta').textContent = cta ? $('post-cta').selectedOptions[0].textContent : '';
    }
    f.addEventListener('input', update); f.addEventListener('change', update); update();
    $('post-photo').addEventListener('change', function () {
      var file = this.files[0], img = $('pv-img');
      $('post-photo-name').textContent = file ? file.name : 'JPG או PNG, עד 5MB';
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { img.src = reader.result; img.hidden = false; };
      reader.readAsDataURL(file);
    });
    $('post-copy').addEventListener('click', function () {
      var t = $('post-text').value, b = this;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'הועתק ✓'; setTimeout(function () { b.textContent = 'העתקת הטקסט'; }, 2000); }).catch(function () { $('post-text').select(); document.execCommand('copy'); });
    });
  })();
  </script>`
      : ''
  }
  <section class="card stack">
    <h3>פוסטים שפורסמו</h3>
    ${
      posts.length
        ? `<div class="post-list">${posts
            .map(
              (p) => `<article class="post-item">
                <div class="row between"><span class="badge">${h(topics[p.topic] || p.topic)}</span><span class="muted small">${h(formatDate(p.created_at))}</span></div>
                ${p.title ? `<b>${h(p.title)}</b>` : ''}
                <p>${h(p.summary.length > 220 ? `${p.summary.slice(0, 220)}…` : p.summary)}</p>
                <ul class="post-results">${results(p).map(resultLine).join('')}</ul>
              </article>`,
            )
            .join('')}</div>`
        : '<p class="muted">עוד לא פורסמו פוסטים מכאן.</p>'
    }
  </section>`;
}
