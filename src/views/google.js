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

export function googleConnectView({ conn, locations, campaigns, csrf, can, notice = '', error = '' }) {
  if (!conn) {
    return `<h1>${GOOGLE_G} ביקורות גוגל</h1>
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    <section class="card g-hero">
      <div class="stack">
        <h2>כל הביקורות מגוגל, במקום אחד</h2>
        <ul class="how-list">
          <li>כל ביקורת חדשה בגוגל מגיעה לכאן, עם התראה לטלפון.</li>
          <li>ביקורת של 3 כוכבים ומטה נשלחת גם במייל, כדי שתענו מהר.</li>
          <li>עונים לביקורות מכאן, עם טיוטה שה-AI מנסח ואתם מאשרים.</li>
          <li>הדירוג בגוגל ומספר הביקורות מופיעים בלוח הבקרה.</li>
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
  }
  const campaignOptions = (cur) =>
    `<option value="">— בלי שיוך —</option>${campaigns
      .map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${h(c.name)}</option>`)
      .join('')}`;
  return `<h1>${GOOGLE_G} ביקורות גוגל</h1>
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${conn.last_error ? `<div class="warn">הסנכרון האחרון נכשל: ${h(conn.last_error)}</div>` : ''}
  <section class="card stack">
    <div class="row between">
      <div><b>מחובר</b>${conn.email ? ` · <span dir="ltr">${h(conn.email)}</span>` : ''}
        <div class="muted small">סנכרון אחרון: ${conn.last_sync_at ? h(formatDate(conn.last_sync_at)) : 'עוד לא'} · מתעדכן כל חצי שעה</div></div>
      ${
        can('manager')
          ? `<div class="row compact">
              <form method="post" action="/admin/google/sync"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn">סנכרון עכשיו</button></form>
              <a class="btn primary" href="/admin/google/reviews">לביקורות</a>
            </div>`
          : '<a class="btn primary" href="/admin/google/reviews">לביקורות</a>'
      }
    </div>
  </section>
  <section class="card stack">
    <h3>הסניפים בגוגל</h3>
    <p class="muted small">מסמנים אילו סניפים לעקוב אחריהם, ומשייכים כל אחד לקמפיין. אם לקמפיין עוד אין קישור לביקורת, הקישור מגוגל נכנס אליו לבד.</p>
    ${
      locations.length
        ? `<table class="table responsive"><thead><tr><th>סניף בגוגל</th><th>דירוג</th><th>מעקב</th><th>קמפיין</th><th></th></tr></thead><tbody>${locations
            .map(
              (l) => `<tr><td data-l="סניף"><b>${h(l.title)}</b><div class="muted small">${h(l.address)}</div></td>
                <td data-l="דירוג">${l.total_reviews ? `${Number(l.avg_rating).toFixed(1)} ★ <span class="muted small">(${l.total_reviews})</span>` : '—'}</td>
                <td colspan="3">${
                  can('manager')
                    ? `<form method="post" action="/admin/google/locations/${l.id}" class="row compact">
                        <input type="hidden" name="_csrf" value="${h(csrf)}">
                        <label class="check"><input type="checkbox" name="enabled" value="1" ${l.enabled ? 'checked' : ''}> מעקב</label>
                        <select name="campaign" aria-label="קמפיין">${campaignOptions(l.campaign_id)}</select>
                        <button class="btn">שמירה</button>
                      </form>`
                    : `${l.enabled ? 'במעקב' : '—'} ${l.campaign_name ? `· ${h(l.campaign_name)}` : ''}`
                }</td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="muted">לא נמצאו סניפים בחשבון הזה. ודאו שהתחברתם עם החשבון שמנהל את פרופיל העסק בגוגל.</p>'
    }
  </section>
  ${
    can('owner')
      ? `<form method="post" action="/admin/google/disconnect" onsubmit="return confirm('לנתק את החיבור לגוגל? הביקורות שנשמרו יימחקו מכאן, בגוגל לא ישתנה כלום.')">
          <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">ניתוק מגוגל</button></form>`
      : ''
  }`;
}

export function googleReviewsView({ reviews, locations, filters, summary }) {
  const opt = (v, l, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${h(l)}</option>`;
  return `<div class="dash-head"><div class="titles"><h1>${GOOGLE_G} ביקורות גוגל</h1>
      <p class="muted">${summary.total ? `דירוג ${summary.avg.toFixed(1)} ★ מתוך ${summary.total} ביקורות` : 'עוד אין נתונים מגוגל'}${summary.unanswered ? ` · <b>${summary.unanswered} ממתינות לתשובה</b>` : ''}</p></div>
    <form method="get" class="filters">
      <select name="filter" onchange="this.form.submit()" aria-label="סינון">${opt('', 'כל הביקורות', filters.filter)}${opt('unanswered', 'ממתינות לתשובה', filters.filter)}${opt('negative', '3 כוכבים ומטה', filters.filter)}</select>
      ${locations.length > 1 ? `<select name="location" onchange="this.form.submit()" aria-label="סניף">${opt('', 'כל הסניפים', filters.location)}${locations.map((l) => opt(l.id, l.title, filters.location)).join('')}</select>` : ''}
      <noscript><button class="btn">סינון</button></noscript>
      <a class="btn" href="/admin/google">הגדרות חיבור</a>
    </form></div>
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
      : '<div class="card empty"><p class="muted">אין ביקורות להצגה. אם רק התחברתם, לחצו "סנכרון עכשיו" בהגדרות החיבור.</p></div>'
  }`;
}

export function googleReviewView({ review, draft = '', csrf, can, aiAvailable, error = '', saved = false }) {
  const text = draft || review.reply || '';
  return `<p><a href="/admin/google/reviews">→ לכל הביקורות</a></p>
  <h1>${stars(review.rating)} ${h(review.reviewer || 'לקוח אנונימי')}</h1>
  <p class="muted">${h(review.location_title)} · ${h(formatDate(review.create_time))}</p>
  ${saved ? '<div class="flash">התשובה פורסמה בגוגל.</div>' : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <section class="card stack">
    <p class="g-comment ${review.comment ? '' : 'muted'}">${h(review.comment || 'הלקוח דירג בלי לכתוב טקסט.')}</p>
  </section>
  ${
    can('manager')
      ? `<section class="card stack">
          <h3>${review.reply ? 'התשובה שלכם (אפשר לעדכן)' : 'תשובה פומבית'}</h3>
          <p class="muted small">התשובה מופיעה בגוגל מתחת לביקורת, וכל מי שמחפש את העסק רואה אותה.</p>
          <form method="post" action="/admin/google/reviews/${review.id}/reply" class="stack">
            <input type="hidden" name="_csrf" value="${h(csrf)}">
            <textarea name="reply" rows="5" maxlength="4000" required>${h(text)}</textarea>
            <div class="row compact">
              <button class="btn primary">${review.reply ? 'עדכון התשובה בגוגל' : 'פרסום התשובה בגוגל'}</button>
            </div>
          </form>
          ${
            aiAvailable
              ? `<form method="post" action="/admin/google/reviews/${review.id}/draft"><input type="hidden" name="_csrf" value="${h(csrf)}">
                  <button class="btn">${icon('spark', 16)} טיוטה מה-AI</button></form>`
              : ''
          }
        </section>`
      : review.reply
        ? `<section class="card"><b>התשובה שלכם:</b> ${h(review.reply)}</section>`
        : ''
  }`;
}

/** Small dashboard card: the Google rating at a glance. */
export function googleDashCard(summary) {
  if (!summary || !summary.total) return '';
  return `<a class="g-dash" href="/admin/google/reviews${summary.unanswered ? '?filter=unanswered' : ''}">
    ${GOOGLE_G}<span><b>${summary.avg.toFixed(1)} ★</b> בגוגל · ${summary.total.toLocaleString('he-IL')} ביקורות</span>
    ${summary.unanswered ? `<span class="badge st-new">${summary.unanswered} ממתינות לתשובה</span>` : '<span class="muted small">הכול נענה ✓</span>'}
  </a>`;
}
