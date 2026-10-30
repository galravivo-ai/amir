import { formatDate, h } from '../util.js';
import { icon } from './icons.js';

const stars = (n) => `<span class="g-stars" aria-label="${n} מתוך 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;

export const GOOGLE_G = `<svg class="g-logo" width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

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
  return `<details class="card g-tech"><summary>פרטים טכניים של החיבור (רק מנהל המערכת רואה את זה)</summary><ul class="how-list">
    ${row(idOk, 'GOOGLE_CLIENT_ID', clientId)}
    ${row(secretLooksRight, 'GOOGLE_CLIENT_SECRET', `${secretLength} תווים${secretLooksRight ? '' : ', אמור להתחיל ב-GOCSPX-'}`)}
    ${row(true, 'כתובת חזרה שצריכה להופיע ב-Authorized redirect URIs', redirectUri)}
  </ul></details>`;
}

/** A branch waiting for its payment, in place of the tracking controls. */
function pendingCell(l, { csrf, can, deletable, branchCost }) {
  const price = branchCost ? `₪${branchCost.amount.toLocaleString('he-IL')} ${branchCost.annual ? 'לשנה' : 'לחודש'}` : '';
  const cancel = deletable
    ? `<form method="post" action="/admin/google/locations/${l.id}/delete"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">ביטול</button></form>`
    : `<form method="post" action="/admin/google/locations/${l.id}"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">ביטול</button></form>`;
  return `<div class="g-pending"><span class="badge st-late">ממתין לתשלום</span>
    ${
      l.pay_requested_at
        ? '<span class="muted small">קיבלנו את הבקשה. אחרי שהתשלום יאושר, הסניף ייפתח.</span>'
        : `<span class="muted small">סניף נוסף${price ? `: ${price}, כולל מע״מ (20% הנחה)` : ''}. הסניף ייפתח אחרי התשלום.</span>`
    }
    ${
      can('manager')
        ? `<div class="row compact"><form method="post" action="/admin/google/locations/${l.id}/pay"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn primary">${l.pay_requested_at ? 'לדף התשלום שוב' : 'לתשלום'}</button></form>${cancel}</div>`
        : ''
    }</div>`;
}

function locationsTable(locations, { campaigns, csrf, can, deletable, debug = false, branchCost = null }) {
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
          <div class="muted small">${l.synced_at ? `נבדק ${h(formatDate(l.synced_at))}` : l.source === 'serp' && !l.sync_error && !l.pending_pay ? '<span class="g-loading">טוען ביקורות…</span>' : ''}</div></td>
        <td data-l="מעקב">${
          l.pending_pay
            ? pendingCell(l, { csrf, can, deletable, branchCost })
            : can('manager')
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

function serpSection({ places, matches, query, csrf, can, campaigns, serpHours, branchLimit, debug, branchCost, partial = false }) {
  const full = places.length >= branchLimit;
  // Second to the full connection: folded away until asked for (or already in use).
  const open = !partial || places.length || matches || query;
  return `<details class="card stack g-partial-box" id="partial" ${open ? 'open' : ''}>
    <summary><h2>${partial ? 'אין גישה לחשבון הגוגל? מעקב לפי קישור' : 'מעקב אחרי הביקורות בגוגל'}</h2></summary>
    ${partial ? '<p class="g-partial">זה חיבור חלקי: ביקורות ודירוג בלבד. בלי צפיות ושיחות, בלי מה שחיפשו, ובלי תשובות ופוסטים מתוך המערכת.</p>' : ''}
    <p class="muted">מדביקים את הקישור לעסק בגוגל מפות, או כותבים את שם העסק והעיר. כל הביקורות נטענות, וכל ביקורת חדשה מגיעה לכאן עם התראה. הבדיקה מתבצעת לבד כל ${serpHours || 6} שעות.</p>
    ${places.length ? '<p class="muted small">אפשר להוסיף סניפים בלי הגבלה, וכל סניף נוסף ב-20% הנחה ממחיר המסלול. בחשבון בתשלום, סניף נוסף נפתח אחרי התשלום עליו.</p>' : ''}
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
    ${places.length ? locationsTable(places, { campaigns, csrf, can, deletable: true, debug, branchCost }) : ''}
    ${
      places.some((l) => !l.synced_at && !l.sync_error)
        ? '<script>setTimeout(function(){location.replace(location.pathname)},8000)</script>'
        : ''
    }
    <p class="muted small">כדי לענות לביקורת, לוחצים עליה ואז "מענה בגוגל". ה-AI יכול לנסח לכם טיוטה להעתקה.</p>
  </details>
  <script>if(location.hash==='#partial'){var p=document.getElementById('partial');if(p)p.open=true}</script>`;
}

/** After connecting: what arrives when, with what already arrived ticked. */
export function arrivalCard(arrival, { compact = false, reload = false } = {}) {
  const rows = arrival.items
    .map(
      (i) => `<li class="${i.done ? 'done' : i.error ? 'failed' : i.unavailable ? 'off' : ''}"><span class="arr-mark" aria-hidden="true">${i.done ? '✓' : i.error ? '!' : i.unavailable ? '–' : '⏳'}</span>
        <div><b>${h(i.title)}</b> <span class="arr-state">${i.done ? 'הגיע' : i.error ? 'נכשל' : i.unavailable ? 'לא בחיבור הזה' : 'בדרך'}</span><small>${h(i.when)}</small>
        ${i.error ? `<small class="danger-text">${h(String(i.error).replace(/[.\s]+$/, ''))}. אפשר לנסות שוב עם "בדיקה עכשיו" בעמוד חיבור לגוגל.</small>` : ''}
        ${i.todo ? `<a class="small" href="${h(i.href)}">${h(i.todo)} ←</a>` : i.done && i.href ? `<a class="small" href="${h(i.href)}">לצפייה ←</a>` : ''}</div></li>`,
    )
    .join('');
  const head = arrival.failed ? 'חלק מהנתונים לא הגיעו' : arrival.pending ? 'הנתונים בדרך' : 'כל הנתונים הגיעו';
  return `<section class="card arrival${compact ? ' compact' : ''}" id="arrival">
    <h3>${icon('clock', 18)} ${head}</h3>
    <p class="muted small">${arrival.pending ? `מה מגיע מגוגל אחרי החיבור, ומתי.${reload ? ' הדף מתעדכן לבד כשמשהו מגיע.' : ''}` : 'מכאן הכול מתעדכן לבד: ביקורות כל חצי שעה, מספרים כל יום, ובדיקות כל שבוע.'}</p>
    <ul class="arr-list">${rows}</ul>
    ${!reload || !arrival.items.some((i) => !i.done && !i.todo) ? '' : '<script>setTimeout(function(){var a=document.activeElement;if(!a||!/INPUT|TEXTAREA|SELECT/.test(a.tagName))location.reload()},60000)</script>'}
  </section>`;
}

export function googleConnectView({
  conn,
  gbpAvailable = true,
  serpAvailable = false,
  serpHours,
  branchLimit = Infinity,
  branchCost = null,
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
  arrival = null,
}) {
  const places = locations.filter((l) => l.source === 'serp');
  const gbpLocations = locations.filter((l) => l.source !== 'serp');
  const hasAny = locations.length > 0;
  const head = `<div class="dash-head"><div class="titles"><h1>${GOOGLE_G} חיבור לגוגל</h1>
      <p class="page-sub">${hasAny ? 'החשבון והסניפים שהמערכת עוקבת אחריהם.' : 'מחברים פעם אחת את פרופיל העסק בגוגל, ומכאן הכול מתעדכן לבד.'}</p></div>
    ${
      hasAny
        ? `<div class="g-actions">${
            can('manager')
              ? `<form method="post" action="/admin/google/sync"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn">בדיקה עכשיו</button></form>`
              : ''
          }<a class="btn primary" href="/admin/google/reviews">לביקורות</a></div>`
        : ''
    }</div>
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  ${serpMissing ? '<div class="warn">כדי לעקוב אחרי ביקורות לפי קישור, הוסיפו ב-Railway את המשתנה <code>SERPAPI_KEY</code> (רק מנהל המערכת רואה את זה).</div>' : ''}
`;

  const serpPart = serpAvailable
    ? serpSection({ places, matches, query, csrf, can, campaigns, serpHours, branchLimit, debug, branchCost, partial: gbpAvailable && !conn })
    : '';

  let gbpPart = '';
  if (gbpAvailable && !conn) {
    // The full connection runs most of the system, so it comes first.
    const perks = [
      ['star', 'כל הביקורות', 'עם התראה על כל ביקורת חדשה, ותשובה ישר מכאן'],
      ['chart', 'צפיות ושיחות', 'כמה ראו, התקשרו וביקשו הגעה, 18 חודשים אחורה'],
      ['search', 'מה חיפשו', 'המילים שאנשים חיפשו בגוגל כשמצאו אתכם'],
      ['chat', 'פוסטים ותמונות', 'מפרסמים לפרופיל בלי להיכנס לגוגל'],
    ];
    gbpPart = `<section class="g-connect">
      <div class="g-connect-main">
        <span class="g-connect-badge">${GOOGLE_G}<span>Google Business Profile</span></span>
        <h2>מחברים את פרופיל העסק בגוגל</h2>
        <p>חיבור אחד, בערך דקה, ומכאן הכול מתעדכן לבד. זה מה שמפעיל את רוב המערכת.</p>
        <p class="muted small">אחרי החיבור: ביקורות ודירוג תוך דקה, צפיות ושיחות תוך כמה דקות (18 חודשים אחורה), ובדיקת הפרופיל תוך כרבע שעה.</p>
        ${
          can('manager')
            ? `<form method="post" action="/admin/google/connect"><input type="hidden" name="_csrf" value="${h(csrf)}">
                <button class="btn big g-btn">${GOOGLE_G}<span>התחברות עם חשבון הגוגל של העסק</span></button></form>
               <ol class="g-connect-steps"><li>בוחרים את החשבון שמנהל את העסק</li><li>מאשרים גישה לפרופיל העסק</li><li>בוחרים סניף, והנתונים נטענים</li></ol>
               <p class="g-connect-safe">🔒 ההרשאה היא לניהול פרופיל העסק בלבד, בלי גישה למייל או לקבצים. <a href="/guide/connect">מדריך מצולם</a></p>`
            : '<p class="muted">רק בעלים או מנהלים יכולים לחבר את החשבון.</p>'
        }
      </div>
      <ul class="g-connect-perks">${perks.map(([ic, t, d]) => `<li><span class="g-perk-ic">${icon(ic, 20)}</span><div><b>${t}</b><small>${d}</small></div></li>`).join('')}</ul>
    </section>
    ${
      gbpLocations.length
        ? `<section class="card stack"><div class="warn">החיבור לגוגל נותק. הביקורות והנתונים של הסניפים נשמרו, אבל לא מתעדכנים ואי אפשר לענות מכאן עד שמתחברים שוב. עד אז הסניפים האלה לא נספרים בחיוב.</div>
            ${locationsTable(gbpLocations, { campaigns, csrf, can, deletable: true, branchCost })}</section>`
        : ''
    }`;
  } else if (gbpAvailable && conn) {
    // Branches the reconnected account doesn't have (a different Google account).
    const found = gbpLocations.filter((l) => !l.missing);
    const missing = gbpLocations.filter((l) => l.missing);
    gbpPart = `${conn.last_error ? `<div class="warn">הסנכרון האחרון מול החשבון נכשל: ${h(conn.last_error)}</div>` : ''}
    <section class="card stack">
      <div class="g-conn-status"><span class="g-conn-dot" aria-hidden="true"></span>
        <div><b>מחובר לגוגל</b>${conn.email ? ` <span class="muted" dir="ltr">${h(conn.email)}</span>` : ''}
        <div class="muted small">סנכרון אחרון: ${conn.last_sync_at ? h(formatDate(conn.last_sync_at)) : 'עוד לא'} · מתעדכן כל חצי שעה</div></div></div>

      <h3>הסניפים</h3>
      <p class="muted small">מסמנים אילו סניפים לעקוב אחריהם, ומשייכים כל אחד לקמפיין. אם לקמפיין עוד אין קישור לביקורת, הקישור מגוגל נכנס אליו לבד.</p>
      ${
        found.length
          ? locationsTable(found, { campaigns, csrf, can, deletable: false, branchCost })
          : '<p class="muted">לא נמצאו סניפים בחשבון הזה. ודאו שהתחברתם עם החשבון שמנהל את פרופיל העסק בגוגל.</p>'
      }
      ${
        missing.length
          ? `<div class="warn">${missing.length === 1 ? 'הסניף הזה לא נמצא' : `${missing.length} הסניפים האלה לא נמצאו`} בחשבון שחיברתם. הנתונים שלהם נשמרו, אבל לא מתעדכנים ולא נספרים בחיוב. אם הם שייכים לחשבון גוגל אחר, מתחברים איתו. אם לא צריך אותם, אפשר להסיר.</div>
            ${locationsTable(missing, { campaigns, csrf, can, deletable: true, branchCost })}`
          : ''
      }
      ${
        can('owner')
          ? `<form method="post" action="/admin/google/disconnect" onsubmit="return confirm('לנתק את החיבור לגוגל? הביקורות והנתונים שנשמרו יישארו, אבל לא יתעדכנו עד שתתחברו שוב. בגוגל לא ישתנה כלום.')">
              <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">ניתוק החשבון</button></form>`
          : ''
      }
    </section>`;
  }
  const arrivalPart = arrival?.connected ? arrivalCard(arrival, { compact: true, reload: true }) : '';
  return `${head}${arrivalPart}${gbpPart}${serpPart}${setupCheck ? googleSetupCheck(setupCheck) : ''}`;
}

/**
 * Answering a review in place. With a connected Business Profile the reply is
 * published from here; for a place followed by link it's copied, and Google
 * opens at the review to paste it.
 */
export function inlineReply(r, { csrf, ai = false, back = '', backq = '' }) {
  const name = r.reviewer || 'לקוח אנונימי';
  const box = `<textarea name="reply" rows="3" ${r.canPublish ? 'required' : ''} maxlength="4000" dir="auto" aria-label="תשובה ל${h(name)}" placeholder="כתבו תשובה, או לחצו על טיוטה ב-AI">${h(r.suggested)}</textarea>`;
  const aiBtn = ai ? `<button type="button" class="btn small-btn" onclick="gfDraft(this,${r.id})">${icon('spark', 14)} טיוטה ב-AI</button>` : '';
  const more = `<a class="small" href="/admin/google/reviews/${r.id}">לביקורת המלאה</a>`;
  if (r.canPublish) {
    return `<form method="post" action="/admin/google/reviews/${r.id}/reply" class="rq-form"><input type="hidden" name="_csrf" value="${h(csrf)}"><input type="hidden" name="back" value="${h(back)}"><input type="hidden" name="backq" value="${h(backq)}">
      ${box}
      <div class="rq-actions"><button class="btn primary small-btn">פרסום בגוגל</button>${aiBtn}${more}</div>
    </form>`;
  }
  return `<form class="rq-form" onsubmit="return false"><input type="hidden" name="_csrf" value="${h(csrf)}">
    ${box}
    <div class="rq-actions"><button type="button" class="btn primary small-btn" onclick="gfCopy(this,'${h(r.googleLink)}')">${r.googleLink ? 'העתקה ומענה בגוגל ↗' : 'העתקה'}</button>${aiBtn}${more}</div>
  </form>`;
}

/** The scripts the in-place replies use: an AI draft without reloading, and copy-then-open-Google. */
export function replyScripts({ ai = false, demo = false } = {}) {
  const draft = !ai
    ? ''
    : demo
      ? "function gfDraft(b){b.form.reply.value='תודה רבה על הביקורת! שמחנו לארח אתכם, ונשמח לראות אתכם שוב בקרוב.';b.form.reply.focus()}"
      : "function gfDraft(b,id){var f=b.form,l=b.innerHTML;b.disabled=true;b.textContent='מנסח…';fetch('/admin/google/reviews/'+id+'/draft',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'json=1&_csrf='+encodeURIComponent(f._csrf.value)}).then(function(r){return r.json()}).then(function(d){if(d.draft){f.reply.value=d.draft;f.reply.focus()}else alert(d.error||'לא הצלחנו לנסח טיוטה')}).catch(function(){alert('לא הצלחנו לנסח טיוטה, נסו שוב')}).then(function(){b.disabled=false;b.innerHTML=l})}";
  const copy = "function gfCopy(b,u){var t=b.form.reply;if(!t.value.trim()){t.focus();return}var ok=function(){b.textContent='הועתק ✓ הדביקו בגוגל'};t.select();if(navigator.clipboard)navigator.clipboard.writeText(t.value).then(ok,ok);else{document.execCommand('copy');ok()}if(u)window.open(u,'_blank','noopener')}";
  return `<script>${draft}${copy}</script>`;
}

export function googleReviewsView({ reviews, locations, filters, summary, csrf = '', manages = false, ai = false, demo = false, replied = false, replyError = '' }) {
  const opt = (v, l, cur) => `<option value="${h(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${h(l)}</option>`;
  return `<div class="dash-head"><div class="titles"><h1>${GOOGLE_G} ביקורות גוגל</h1>
      <p class="page-sub">הביקורות הציבוריות של העסק בגוגל, כפי שכל אחד רואה אותן. כאן עונים להן, עם טיוטה מוכנה בלחיצה. משוב פרטי מהסקר נמצא ב<a href="/admin/responses">משוב מהסקר</a>.</p>
      <p class="muted">${summary.total ? `דירוג ${summary.avg.toFixed(1)} ★ מתוך ${summary.total} ביקורות` : 'עוד אין נתונים מגוגל'}${summary.unanswered ? ` · <b>${summary.unanswered} ממתינות לתשובה</b>` : ''}</p></div>
    <form method="get" class="filters g-filters">
      <select name="filter" onchange="this.form.submit()" aria-label="מצב">${opt('', 'כל הביקורות', filters.filter)}${opt('unanswered', 'ממתינות לתשובה', filters.filter)}${opt('answered', 'עם תשובה', filters.filter)}${opt('negative', '3 כוכבים ומטה', filters.filter)}${opt('positive', '4-5 כוכבים', filters.filter)}</select>
      <select name="stars" onchange="this.form.submit()" aria-label="כוכבים">${opt('', 'כל הדירוגים', filters.stars)}${[5, 4, 3, 2, 1].map((n) => opt(n, `${'★'.repeat(n)} (${n})`, filters.stars)).join('')}</select>
      <select name="days" onchange="this.form.submit()" aria-label="תקופה">${opt('', 'מכל הזמנים', filters.days)}${opt('7', 'השבוע האחרון', filters.days)}${opt('30', '30 הימים האחרונים', filters.days)}${opt('90', '3 החודשים האחרונים', filters.days)}${opt('365', 'השנה האחרונה', filters.days)}</select>
      <select name="text" onchange="this.form.submit()" aria-label="טקסט">${opt('', 'עם ובלי טקסט', filters.text)}${opt('with', 'רק עם טקסט', filters.text)}${opt('without', 'רק דירוג בלי טקסט', filters.text)}</select>
      ${locations.length > 1 ? `<select name="location" onchange="this.form.submit()" aria-label="סניף">${opt('', 'כל הסניפים', filters.location)}${locations.map((l) => opt(l.id, l.title, filters.location)).join('')}</select>` : ''}
      <select name="sort" onchange="this.form.submit()" aria-label="מיון">${opt('', 'החדשות קודם', filters.sort)}${opt('old', 'הישנות קודם', filters.sort)}${opt('low', 'הנמוכות קודם', filters.sort)}${opt('high', 'הגבוהות קודם', filters.sort)}</select>
      <span class="g-search"><input type="search" name="q" value="${h(filters.q || '')}" placeholder="חיפוש בטקסט או בשם" aria-label="חיפוש בביקורות"><button class="btn">חיפוש</button></span>
      ${Object.values(filters).some(Boolean) ? '<a class="small" href="/admin/google/reviews">ניקוי הסינון</a>' : ''}
    </form></div>
  ${replied ? '<div class="flash">התשובה פורסמה בגוגל ✓</div>' : ''}
  ${replyError ? `<div class="error">${h(replyError)}</div>` : ''}
  ${Object.values(filters).some(Boolean) ? `<p class="muted small g-count">${reviews.length > 100 ? 'מוצגות 100 הביקורות הראשונות שמתאימות לסינון' : reviews.length === 1 ? 'נמצאה ביקורת אחת' : `נמצאו ${reviews.length} ביקורות`}</p>` : ''}
  ${
    reviews.length
      ? `<div class="g-list">${reviews.slice(0, 100)
          .map(
            (r) => `<article class="card g-item ${r.reply ? '' : 'pending'}" id="rv-${r.id}">
              <div class="g-head">${stars(r.rating)}<a href="/admin/google/reviews/${r.id}"><b>${h(r.reviewer || 'לקוח אנונימי')}</b></a><span class="muted small">${h(formatDate(r.create_time))}${locations.length > 1 ? ` · ${h(r.location_title)}` : ''}</span></div>
              <p class="${r.comment ? '' : 'muted'}" ${r.comment ? 'dir="auto"' : ''}>${h(r.comment || 'דירוג בלי טקסט')}</p>
              ${
                r.reply
                  ? `<div class="g-reply small"><b>התשובה שלכם:</b> <span dir="auto">${h(r.reply)}</span></div>${
                      manages
                        ? `<details class="g-edit"><summary>עדכון התשובה</summary>${inlineReply({ ...r, suggested: r.reply }, { csrf, ai, back: 'reviews', backq: new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString() })}</details>`
                        : ''
                    }`
                  : manages
                    ? inlineReply(r, { csrf, ai, back: 'reviews', backq: new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString() })
                    : '<span class="badge st-new">ממתינה לתשובה</span>'
              }
            </article>`,
          )
          .join('')}</div>${manages ? replyScripts({ ai, demo }) : ''}`
      : Object.values(filters).some(Boolean)
        ? '<div class="card empty"><p class="muted">אין ביקורות שמתאימות לסינון. <a href="/admin/google/reviews">ניקוי הסינון</a></p></div>'
        : '<div class="card empty"><p class="muted">אין ביקורות להצגה. אם רק הוספתם עסק, לחצו "בדיקה עכשיו" בהגדרות.</p></div>'
  }`;
}

export function googleReviewView({ review, draft = '', csrf, can, aiAvailable, canPublish = true, error = '', saved = false, templates = [] }) {
  const text = draft || review.reply || '';
  // Shared reply templates: picking one puts its text in the box, for editing.
  const templatePick = templates.length
    ? `<label class="g-tpl">${icon('chat', 16)}<span>תבנית:</span><select aria-label="תבנית תשובה" onchange="if(this.value){var t=document.getElementById('g-draft');t.value=this.options[this.selectedIndex].dataset.t;t.focus()}">
        <option value="">בחירת תבנית…</option>${templates.map((t, i) => `<option value="${i + 1}" data-t="${h(t.text)}">${h(t.title)}</option>`).join('')}</select>
        <a class="small" href="/admin/reply-templates">ניהול</a></label>`
    : can('manager') ? '<p class="muted small"><a href="/admin/reply-templates">תבניות תשובה</a>: נוסחים קבועים לכל הסניפים, בלחיצה.</p>' : '';
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
        ${templatePick}
        <textarea id="g-draft" name="reply" rows="5" maxlength="4000" required aria-label="נוסח התשובה">${h(text)}</textarea>
        <div class="row compact"><button class="btn primary">${review.reply ? 'עדכון התשובה בגוגל' : 'פרסום התשובה בגוגל'}</button></div>
      </form>
      ${aiForm}
    </section>`;
  } else if (can('manager')) {
    answer = `${review.reply ? `<section class="card"><b>התשובה שלכם בגוגל:</b> ${h(review.reply)}</section>` : ''}
    <section class="card stack">
      <h3>${review.reply ? 'עדכון התשובה' : 'מענה לביקורת'}</h3>
      <p class="muted small">כותבים או מבקשים טיוטה מה-AI, מעתיקים, ולוחצים "מענה בגוגל" כדי להדביק שם. אחרי הבדיקה הבאה, התשובה תופיע גם כאן.</p>
      ${templatePick}
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
    <p class="g-comment ${review.comment ? '' : 'muted'}" ${review.comment ? 'dir="auto"' : ''}>${h(review.comment || 'הלקוח דירג בלי לכתוב טקסט.')}</p>
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
