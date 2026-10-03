import { formatDate, h } from '../util.js';
import { parseJson } from '../db.js';
import { NOT_FOUND, RADII } from '../rankings.js';
import { icon } from './icons.js';

const tone = (rank) => (rank == null ? 'none' : rank <= 3 ? 'top' : rank <= 10 ? 'good' : 'low');
const avgLabel = (v) => (v == null ? '—' : v >= NOT_FOUND - 0.05 ? 'לא נמצא' : v.toFixed(1));

function grid(points) {
  const sides = ['צפון-מערב', 'צפון', 'צפון-מזרח', 'מערב', 'העסק', 'מזרח', 'דרום-מערב', 'דרום', 'דרום-מזרח'];
  return `<div class="rk-grid" role="table" aria-label="המיקום בתוצאות מכל נקודה">${points
    .map(
      (p, i) => `<div class="rk-cell ${tone(p.rank)} ${i === 4 ? 'center' : ''}" title="${h(sides[i])}${p.top?.length ? ` · למעלה: ${h(p.top.join(', '))}` : ''}">
        <b>${p.rank ?? '20+'}</b><small>${h(sides[i])}</small></div>`,
    )
    .join('')}</div>`;
}

export function rankingsView({ keywords, checks, locations, limit, running, available, csrf, can, error = '', notice = '' }) {
  const cards = keywords
    .map((k) => {
      const [last, prev] = (checks.get(k.id) || []).filter((c) => !c.error);
      const failed = (checks.get(k.id) || [])[0]?.error;
      const points = last ? parseJson(last.points, []) : [];
      const leaders = last ? parseJson(last.leaders, []) : [];
      const change = last && prev && last.avg_rank != null && prev.avg_rank != null ? prev.avg_rank - last.avg_rank : null;
      return `<section class="card rk-card">
        <div class="rk-head"><div><h3>«${h(k.keyword)}»</h3>
          <div class="muted small">${h(k.location_title)} · רדיוס ${h(RADII[k.radius_m] || `${k.radius_m} מ׳`)}${last ? ` · נבדק ${h(formatDate(`${last.run_at.replace(' ', 'T')}Z`))}` : ''}</div></div>
          ${
            can('manager')
              ? `<form method="post" action="/admin/rankings/${k.id}/delete" onsubmit="return confirm('להפסיק לעקוב אחרי החיפוש הזה?')">
                  <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">הסרה</button></form>`
              : ''
          }</div>
        ${
          last
            ? `<div class="rk-body">
                ${grid(points)}
                <div class="rk-facts">
                  <div><span class="muted small">מיקום ממוצע</span><b class="rk-avg">${avgLabel(last.avg_rank)}</b>${
                    change && Math.abs(change) >= 0.1
                      ? `<span class="cmp-change ${change > 0 ? 'up' : 'down'}">${change > 0 ? '▲ עלה' : '▼ ירד'} ${Math.abs(change).toFixed(1)} מקומות</span>`
                      : ''
                  }</div>
                  <div><span class="muted small">מופיעים ב-20 הראשונים</span><b>${last.found} מתוך 9</b> <span class="muted small">נקודות</span></div>
                  ${
                    leaders.length
                      ? `<div><span class="muted small">מי מופיע הכי הרבה בשלושת הראשונים</span><ul class="rk-leaders">${leaders
                          .map((l) => `<li>${h(l.title)} <span class="muted small">(${l.n} מתוך 9)</span></li>`)
                          .join('')}</ul></div>`
                      : ''
                  }
                </div>
              </div>`
            : failed
              ? `<p class="danger-text">הבדיקה האחרונה נכשלה: ${h(failed)}</p>`
              : '<p class="muted">עוד לא נבדק. התוצאות יופיעו אחרי הבדיקה.</p>'
        }
      </section>`;
    })
    .join('');

  const form =
    can('manager') && available && locations.length
      ? keywords.length >= limit
        ? `<p class="muted small">המסלול שלכם כולל עד ${limit} חיפושים במעקב. אפשר להסיר אחד, או <a href="/admin/plan">לשדרג</a>.</p>`
        : `<section class="card stack"><h3>מעקב אחרי חיפוש</h3>
            <p class="muted small">כתבו מה לקוחות מחפשים כשהם צריכים עסק כמו שלכם, בלי שם העסק. למשל: "בית קפה", "ארוחת בוקר", "מספרה לגברים". עד ${limit} חיפושים.</p>
            <form method="post" action="/admin/rankings" class="row compact">
              <input type="hidden" name="_csrf" value="${h(csrf)}">
              <input name="keyword" required maxlength="80" placeholder="בית קפה" aria-label="החיפוש">
              ${
                locations.length > 1
                  ? `<select name="location" aria-label="סניף">${locations.map((l) => `<option value="${l.id}">${h(l.title)}</option>`).join('')}</select>`
                  : `<input type="hidden" name="location" value="${locations[0].id}">`
              }
              <select name="radius" aria-label="רדיוס">${Object.entries(RADII)
                .map(([v, l]) => `<option value="${v}" ${v === '1000' ? 'selected' : ''}>${h(l)}</option>`)
                .join('')}</select>
              <button class="btn primary">הוספה ובדיקה</button>
            </form></section>`
      : '';

  return `<div class="page-head"><h1>${icon('pin', 26)} מיקום במפות</h1>
      ${
        can('manager') && available && keywords.length
          ? `<form method="post" action="/admin/rankings/run"><input type="hidden" name="_csrf" value="${h(csrf)}">
              <button class="btn primary" ${running ? 'disabled' : ''}>${running ? 'בודק עכשיו…' : 'בדיקה עכשיו'}</button></form>`
          : ''
      }</div>
    <p class="page-intro">כשמישהו ליד העסק מחפש בגוגל מפות "בית קפה", באיזה מקום אתם מופיעים? בודקים מ-9 נקודות סביב העסק, כי התוצאות משתנות לפי איפה המחפש עומד. ירוק זה שלושת הראשונים, המקומות שרוב האנשים לוחצים עליהם.</p>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    ${running ? '<div class="warn">הבדיקה רצה עכשיו, זה לוקח עד דקה. הדף יתרענן לבד.</div><script>setTimeout(function(){location.replace(location.pathname)},12000)</script>' : ''}
    ${available ? '' : '<div class="warn">המעקב עובד דרך SerpApi. מנהל המערכת מגדיר אותו ב-Railway (SERPAPI_KEY).</div>'}
    ${available && !locations.length ? '<section class="card empty"><p>כדי לעקוב, הוסיפו קודם את העסק ב<a href="/admin/google">עמוד הביקורות בגוגל</a>.</p></section>' : ''}
    ${cards}
    ${form}
    <p class="muted small">כל חיפוש נבדק לבד פעם בשבוע. כל בדיקה היא 9 חיפושים בגוגל מפות.</p>`;
}
