import { parseJson } from '../db.js';
import { formatDate, h } from '../util.js';
import { PLUS_ENGINES } from '../visibility.js';
import { icon } from './icons.js';

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function cell(row) {
  if (!row) return '<td class="vis-cell">—</td>';
  if (row.error === 'no_answer') return '<td class="vis-cell muted" title="גוגל לא הציגה תשובת AI לחיפוש הזה">אין תשובת AI</td>';
  if (row.error) return `<td class="vis-cell bad" title="${h(row.error)}">שגיאה</td>`;
  const sources = parseJson(row.sources, []);
  const label = row.cited ? '<b class="ok">✓ הוזכרתם וצוטטתם</b>' : row.mentioned ? '<b class="ok">✓ הוזכרתם</b>' : '<span class="no">✗ לא הוזכרתם</span>';
  return `<td class="vis-cell"><details><summary>${label}</summary>
    ${row.snippet ? `<blockquote>${h(row.snippet)}</blockquote>` : ''}
    ${
      sources.length
        ? `<div class="small muted">מקורות שהתשובה נשענה עליהם:</div><ul class="vis-sources">${sources
            .map((s) => `<li${s.link === row.cited_link ? ' class="mine"' : ''}><a href="${h(s.link)}" target="_blank" rel="noopener">${h(s.title || new URL(s.link).hostname)}</a></li>`)
            .join('')}</ul>`
        : ''
    }
  </details></td>`;
}

function plusCard({ offer, can }) {
  return `<section class="card vis-plus">
    <span class="badge st-in_progress">במסלול מקצועי ומעלה</span><h3>${h(offer.label)}</h3>
    <p class="muted">${h(offer.tagline)}</p>
    <ul class="vis-plus-list">${offer.features.map((f) => `<li>✓ ${h(f)}</li>`).join('')}</ul>
    ${can('owner') ? '<a class="btn accent" href="/admin/plan">לשדרוג המסלול</a>' : '<p class="muted small">בעלי העסק יכולים לשדרג את המסלול.</p>'}
  </section>`;
}

export function visibilityView({
  business, queries, data, engines, allEngines, running, aiAvailable, csrf, can,
  maxQueries = 5, plus = false, plusOffer = null, runsLeft = null, notice = '', error = '', suggested = null,
}) {
  const { runs, latest } = data;
  const last = runs.at(-1);
  const answered = latest.filter((r) => !r.error);
  const shownEngines = engines.length ? engines : Object.keys(allEngines).filter((e) => plus || !PLUS_ENGINES.includes(e));
  const byQuery = new Map();
  for (const r of latest) {
    if (!byQuery.has(r.query)) byQuery.set(r.query, {});
    byQuery.get(r.query)[r.engine] = r;
  }
  const engineScore = (e) => {
    const rows = answered.filter((r) => r.engine === e);
    return rows.length ? `${pct(rows.filter((r) => r.mentioned).length, rows.length)}%` : '—';
  };
  const editing = suggested || queries;
  const inputs = Array.from({ length: maxQueries }, (_, i) => editing[i] || '');

  const offer = !plus && plusOffer ? plusCard({ offer: plusOffer, can }) : '';
  return `<div class="page-head"><h1>${icon('search', 26)} נראות ב-AI${plus ? ' <span class="badge st-resolved">מורחבת</span>' : ''}</h1>
      ${
        can('manager') && queries.length && engines.length
          ? `<form method="post" action="/admin/ai-visibility/run"><input type="hidden" name="_csrf" value="${h(csrf)}">
              <button class="btn primary" ${running || runsLeft === 0 ? 'disabled' : ''}>${running ? 'בודק עכשיו…' : 'בדיקה עכשיו'}</button>${runsLeft != null ? `<div class="muted small">נשארו ${runsLeft} בדיקות ידניות החודש</div>` : ''}</form>`
          : ''
      }</div>
    <p class="page-intro">יותר ויותר לקוחות שואלים עוזר AI "איפה כדאי…" במקום לחפש בגוגל. כאן רואים אם התשובות ממליצות עליכם, ואם הן מצטטות את האתר או את פרופיל הגוגל שלכם. הבדיקה רצה לבד פעם בשבוע.</p>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    ${running ? '<div class="warn">הבדיקה רצה עכשיו. התוצאות יופיעו כאן בעוד כמה דקות.</div>' : ''}
    ${
      engines.length
        ? ''
        : '<div class="warn">כדי לבדוק צריך לפחות מנוע אחד: SerpApi (לגוגל) או מפתח Anthropic (ל-Claude). מנהל המערכת מגדיר אותם ב-Railway.</div>'
    }
    ${
      last
        ? `<div class="kpis kpis-3">
            <div class="kpi"><div class="kpi-label">הוזכרתם בתשובות</div><div class="kpi-value">${pct(last.mentioned, last.answered)}%</div>
              <div class="kpi-hint">${last.mentioned} מתוך ${last.answered} תשובות</div></div>
            <div class="kpi"><div class="kpi-label">צוטטתם כמקור</div><div class="kpi-value">${pct(last.cited, last.answered)}%</div>
              <div class="kpi-hint">האתר שלכם או פרופיל הגוגל</div></div>
            <div class="kpi"><div class="kpi-label">לפי מנוע</div><div class="vis-engines">${shownEngines
              .map((e) => `<span><b>${engineScore(e)}</b> ${h(allEngines[e])}</span>`)
              .join('')}</div><div class="kpi-hint">בדיקה אחרונה: ${h(formatDate(last.run_at.replace(' ', 'T') + 'Z'))}</div></div>
          </div>
          ${
            runs.length > 1
              ? `<section class="card"><h3>לאורך זמן</h3><div class="vis-trend" role="img" aria-label="אחוז האזכורים בכל בדיקה">${runs
                  .map(
                    (r) => `<div class="vis-bar" title="${h(formatDate(r.run_at.replace(' ', 'T') + 'Z'))}: ${pct(r.mentioned, r.answered)}%">
                      <span style="height:${Math.max(3, pct(r.mentioned, r.answered))}%"></span><small>${pct(r.mentioned, r.answered)}%</small></div>`,
                  )
                  .join('')}</div></section>`
              : ''
          }
          <section class="card">
            <h3>התשובות לכל שאלה</h3>
            <div class="table-wrap"><table class="table vis-table"><thead><tr><th>שאלה</th>${shownEngines.map((e) => `<th>${h(allEngines[e])}</th>`).join('')}</tr></thead>
              <tbody>${[...byQuery]
                .map(([q, cells]) => `<tr><td class="vis-q">${h(q)}</td>${shownEngines.map((e) => cell(cells[e])).join('')}</tr>`)
                .join('')}</tbody></table></div>
            <p class="muted small">לוחצים על תוצאה כדי לראות את המשפט שבו הוזכרתם ואת המקורות שהתשובה נשענה עליהם. תשובות AI משתנות מבדיקה לבדיקה, לכן כדאי להסתכל על המגמה.</p>
          </section>`
        : queries.length
          ? '<div class="card empty"><p class="muted">עוד לא בוצעה בדיקה. לחצו "בדיקה עכשיו", או חכו לבדיקה השבועית.</p></div>'
          : ''
    }
    ${offer}
    ${
      can('manager')
        ? `<section class="card stack" id="setup">
            <h3>מה לבדוק</h3>
            <form method="post" action="/admin/ai-visibility/settings" class="stack">
              <input type="hidden" name="_csrf" value="${h(csrf)}">
              <div class="stack tight-stack"><span class="label-text">השאלות שלקוחות שואלים (עד ${maxQueries})</span>
                ${inputs.map((q, i) => `<input name="queries" value="${h(q)}" maxlength="160" placeholder="${i === 0 ? 'למשל: איפה יש ארוחת בוקר טובה בדיזנגוף?' : ''}" aria-label="שאלה ${i + 1}">`).join('')}
                <span class="muted small">כתבו את השאלות בלי שם העסק, כמו שלקוח חדש היה שואל.</span>
              </div>
              <div class="grid2 tight">
                <label>שמות נוספים של העסק<input name="aliases" value="${h(business.ai_aliases)}" maxlength="300" placeholder="למשל: Jacko's Street, ג׳קוס"></label>
                <label>אתר העסק<input name="site" value="${h(business.ai_site)}" dir="ltr" placeholder="jackos.co.il"></label>
                <label>עיר או אזור<input name="city" value="${h(business.ai_city)}" maxlength="60" placeholder="תל אביב"></label>
              </div>
              <div class="row compact">
                <button class="btn primary">שמירה</button>
                ${
                  aiAvailable
                    ? `<button class="btn ai-btn" formaction="/admin/ai-visibility/suggest" formnovalidate>${icon('spark', 16)} <span>ה-AI יציע שאלות</span></button>
                       <input name="about" class="inline-about" placeholder="תחום העסק, למשל: בית קפה" maxlength="120">`
                    : ''
                }
              </div>
            </form>
            <p class="muted small">כל שאלה נבדקת בכל מנוע שפעיל אצלכם: ${shownEngines.map((e) => h(allEngines[e])).join(', ')}.</p>
          </section>`
        : ''
    }`;
}
