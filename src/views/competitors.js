import { h } from '../util.js';
import { icon } from './icons.js';

const change = (v, digits = 1) =>
  v == null || Math.abs(v) < 0.05
    ? ''
    : `<span class="cmp-change ${v > 0 ? 'up' : 'down'}" title="שינוי ב-30 הימים האחרונים">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(digits)}</span>`;

const recentLabel = (r) => (r.recent30 == null ? '—' : `${r.recent30}${r.capped ? '+' : ''}`);

export function competitorsView({ data, available, limit, intervalHours = 72, csrf, can, notice = '', error = '', query = '', matches = null }) {
  const { rows, mine, theirs, position, mostReviews } = data;
  const myRecent = mine.reduce((s, r) => s + (r.recent30 || 0), 0);
  const maxRecent = Math.max(1, ...rows.map((r) => r.recent30 || 0));
  const full = theirs.length >= limit;

  const kpis =
    mine.length && theirs.length
      ? `<div class="kpis kpis-3">
          <div class="kpi"><div class="kpi-label">המקום שלכם בדירוג</div><div class="kpi-value">${position?.rank ? `${position.rank} <small>מתוך ${position.of}</small>` : '—'}</div>
            <div class="kpi-hint">לפי הדירוג הממוצע בגוגל</div></div>
          <div class="kpi"><div class="kpi-label">ביקורות חדשות אצלכם</div><div class="kpi-value">${myRecent}</div>
            <div class="kpi-hint">ב-30 הימים האחרונים</div></div>
          <div class="kpi"><div class="kpi-label">הכי הרבה ביקורות חדשות</div><div class="kpi-value kpi-name">${mostReviews ? h(mostReviews.title) : '—'}</div>
            <div class="kpi-hint">${mostReviews ? `${recentLabel(mostReviews)} ב-30 הימים האחרונים` : ''}</div></div>
        </div>`
      : '';

  const table = rows.length
    ? `<section class="card"><h3>ההשוואה</h3>
        <div class="table-wrap"><table class="table cmp-table"><thead><tr><th>#</th><th>עסק</th><th>דירוג</th><th>ביקורות</th><th>חדשות ב-30 יום</th><th></th></tr></thead><tbody>${rows
          .map(
            (r) => `<tr class="${r.mine ? 'mine' : ''}">
              <td class="cmp-rank">${r.rank ?? '—'}</td>
              <td><b>${h(r.title)}</b>${r.mine ? ' <span class="badge st-resolved">אתם</span>' : ''}
                ${r.error ? `<div class="small danger-text" title="${h(r.error)}">הבדיקה האחרונה נכשלה</div>` : r.pending ? '<div class="small muted">ממתין לבדיקה</div>' : ''}</td>
              <td class="cmp-rating">${r.rating != null ? `<b>${r.rating.toFixed(1)}</b> <span class="cover-star">★</span> ${change(r.ratingChange)}` : '—'}</td>
              <td>${r.total != null ? r.total.toLocaleString('he-IL') : '—'}</td>
              <td class="cmp-recent"><span class="cmp-bar"><span style="width:${Math.round(((r.recent30 || 0) / maxRecent) * 100)}%"></span></span><b>${recentLabel(r)}</b></td>
              <td>${
                !r.mine && can('manager')
                  ? `<form method="post" action="/admin/competitors/${r.id}/delete" onsubmit="return confirm('להסיר את ${h(r.title).replace(/'/g, '')} מההשוואה?')">
                      <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">הסרה</button></form>`
                  : ''
              }</td></tr>`,
          )
          .join('')}</tbody></table></div>
        <p class="muted small">המתחרים נבדקים לבד כל ${Math.round(intervalHours / 24) || 1} ימים. "+" ליד מספר אומר שיש לפחות כמה ביקורות. המספר המדויק יופיע אחרי חודש של מעקב.</p>
      </section>`
    : '';

  const addForm = can('manager')
    ? `<section class="card stack">
        <h3>${theirs.length ? 'הוספת מתחרה' : 'עם מי להשוות?'}</h3>
        ${
          full
            ? `<p class="muted small">הגעתם למספר המתחרים שבמסלול (${limit}). אפשר להסיר מתחרה, או <a href="/admin/plan">לשדרג את המסלול</a>.</p>`
            : `<p class="muted small">מדביקים קישור לעסק מגוגל מפות, או כותבים את השם והעיר. עד ${limit} מתחרים.</p>
              <form method="post" action="/admin/competitors/find" class="row compact g-find">
                <input type="hidden" name="_csrf" value="${h(csrf)}">
                <input name="q" value="${h(query)}" required maxlength="500" placeholder="https://maps.app.goo.gl/…  או  קפה לנדוור, דיזנגוף" aria-label="קישור לגוגל מפות או שם העסק">
                <button class="btn primary">חיפוש</button>
              </form>`
        }
        ${
          matches?.length
            ? `<div class="g-matches"><p><b>בחרו את העסק:</b></p>${matches
                .map(
                  (m) => `<form method="post" action="/admin/competitors/add" class="g-match">
                    <input type="hidden" name="_csrf" value="${h(csrf)}">
                    <input type="hidden" name="data_id" value="${h(m.dataId)}"><input type="hidden" name="place_id" value="${h(m.placeId)}">
                    <input type="hidden" name="title" value="${h(m.title)}"><input type="hidden" name="address" value="${h(m.address)}">
                    <div><b>${h(m.title)}</b><div class="muted small">${h(m.address)}</div>
                      ${m.total ? `<div class="small">${m.rating.toFixed(1)} ★ · ${m.total.toLocaleString('he-IL')} ביקורות</div>` : ''}</div>
                    <button class="btn">הוספה להשוואה</button>
                  </form>`,
                )
                .join('')}</div>`
            : ''
        }
      </section>`
    : '';

  return `<div class="page-head"><h1>${icon('rivals', 26)} מתחרים</h1></div>
    <p class="page-intro">איך אתם עומדים מול העסקים באזור: מי מדורג גבוה יותר, ומי מקבל יותר ביקורות חדשות. ככה רואים אם צריך להגביר את בקשות הדירוג.</p>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    ${available ? '' : '<div class="warn">ההשוואה למתחרים עובדת דרך SerpApi. מנהל המערכת מגדיר אותו ב-Railway (SERPAPI_KEY).</div>'}
    ${!mine.length && available ? '<div class="warn">כדי לראות את העסק שלכם בהשוואה, הוסיפו אותו קודם ב<a href="/admin/google">עמוד הביקורות</a>.</div>' : ''}
    ${kpis}
    ${table}
    ${available ? addForm : ''}`;
}

/** A compact version for the monthly report. */
export function competitorsBrief(data) {
  if (!data.theirs.length || !data.rows.length) return '';
  return `<table class="r-table"><thead><tr><th>#</th><th>עסק</th><th>דירוג</th><th>ביקורות</th><th>חדשות ב-30 יום</th></tr></thead><tbody>${data.rows
    .map(
      (r) => `<tr class="${r.mine ? 'mine' : ''}"><td>${r.rank ?? '—'}</td><td>${h(r.title)}${r.mine ? ' (אתם)' : ''}</td>
        <td>${r.rating != null ? `${r.rating.toFixed(1)} ★` : '—'}</td><td>${r.total != null ? r.total.toLocaleString('he-IL') : '—'}</td><td>${recentLabel(r)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}
