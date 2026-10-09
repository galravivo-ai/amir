import { parseJson } from '../db.js';
import { formatDate, h } from '../util.js';
import { PLUS_ENGINES, siteHost as siteHostOf } from '../visibility.js';
import { icon } from './icons.js';
import { renderInsight } from './settings.js';

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function cell(row) {
  if (!row) return '<td class="vis-cell">—</td>';
  if (row.error === 'no_answer') return '<td class="vis-cell" title="גוגל לא הציגה תשובת AI לחיפוש הזה"><span class="vis-chip none">אין תשובת AI</span></td>';
  if (row.error) return `<td class="vis-cell" title="${h(row.error)}"><span class="vis-chip err">שגיאה</span></td>`;
  const sources = parseJson(row.sources, []);
  const label = row.cited ? '<span class="vis-chip yes">✓ הוזכרתם וצוטטתם</span>' : row.mentioned ? '<span class="vis-chip yes">✓ הוזכרתם</span>' : '<span class="vis-chip no">✗ לא הוזכרתם</span>';
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

const when = (runAt) => formatDate(`${runAt.replace(' ', 'T')}Z`);
const hostOf = (link) => {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The score ring: how often the answers mention the business. */
function hero(last, prev) {
  const score = pct(last.mentioned, last.answered);
  const before = prev ? pct(prev.mentioned, prev.answered) : null;
  const diff = before == null ? null : score - before;
  const tone = score >= 60 ? 'good' : score >= 35 ? 'okay' : score >= 15 ? 'mid' : 'bad';
  const label = score >= 60 ? 'ה-AI ממליץ עליכם ברוב השאלות' : score >= 35 ? 'מופיעים בחלק מהתשובות' : score >= 15 ? 'מופיעים לפעמים' : 'כמעט לא מופיעים בתשובות';
  return `<section class="card vis-hero">
    <div class="hl-ring ${tone}" style="--p:${score}" role="img" aria-label="ציון נראות ${score} מתוך 100"><b>${score}</b><small>מתוך 100</small></div>
    <div class="vis-hero-text">
      <span class="muted small">ציון הנראות ב-AI</span>
      <h2>${label}</h2>
      <p class="muted">הוזכרתם ב-${last.mentioned} מתוך ${last.answered} תשובות${last.cited ? `, ובכ-${pct(last.cited, last.answered)}% מהן גם צוטטתם כמקור` : ''}.
        ${diff ? `<span class="pf-chg ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} נקודות מהבדיקה הקודמת</span>` : diff === 0 ? '<span class="pf-chg flat">ללא שינוי מהבדיקה הקודמת</span>' : ''}</p>
      <span class="muted small">בדיקה אחרונה: ${h(when(last.run_at))}</span>
    </div>
  </section>`;
}

function kpis(last, latest, byQuery) {
  const questions = [...byQuery.values()];
  const anyHit = questions.filter((cells) => Object.values(cells).some((r) => !r.error && r.mentioned)).length;
  const noAnswer = latest.filter((r) => r.error === 'no_answer').length;
  return `<div class="kpis vis-kpis">
    <div class="kpi"><span class="kpi-label">הוזכרתם</span><span class="kpi-value">${pct(last.mentioned, last.answered)}%</span><span class="kpi-hint muted">מהתשובות</span></div>
    <div class="kpi"><span class="kpi-label">צוטטתם כמקור</span><span class="kpi-value">${pct(last.cited, last.answered)}%</span><span class="kpi-hint muted">האתר או פרופיל הגוגל</span></div>
    <div class="kpi"><span class="kpi-label">שאלות שבהן הופעתם</span><span class="kpi-value">${anyHit}/${questions.length}</span><span class="kpi-hint muted">לפחות במנוע אחד</span></div>
    <div class="kpi"><span class="kpi-label">תשובות שנבדקו</span><span class="kpi-value">${last.answered}</span><span class="kpi-hint muted">${noAnswer ? `ועוד ${noAnswer} בלי תשובת AI` : `${questions.length} שאלות`}</span></div>
  </div>`;
}

/** One card per engine: how often it mentions the business. */
function engineCards(latest, shownEngines, allEngines) {
  return `<div class="vis-eng-grid">${shownEngines
    .map((e) => {
      const rows = latest.filter((r) => r.engine === e && !r.error);
      if (!rows.length) {
        const err = latest.find((r) => r.engine === e);
        return `<div class="vis-eng"><b>${h(allEngines[e])}</b><span class="vis-eng-pct muted">—</span><span class="muted small">${err?.error === 'no_answer' ? 'לא הציג תשובת AI' : err ? 'שגיאה בבדיקה' : 'לא נבדק'}</span></div>`;
      }
      const m = rows.filter((r) => r.mentioned).length;
      const c = rows.filter((r) => r.cited).length;
      const p = pct(m, rows.length);
      return `<div class="vis-eng"><b>${h(allEngines[e])}</b>
        <span class="vis-eng-pct">${p}%</span>
        <span class="vis-eng-bar"><span style="width:${Math.max(2, p)}%"></span></span>
        <span class="muted small">${m} מתוך ${rows.length} תשובות${c ? ` · צוטטתם ${c}` : ''}</span></div>`;
    })
    .join('')}</div>`;
}

/** Mentioned and cited, as a share of the answers, run after run. */
function trend(runs) {
  const w = 720, hgt = 220, padX = 34, padTop = 14, padBottom = 26;
  const pts = runs.map((r) => ({ at: r.run_at, m: pct(r.mentioned, r.answered), c: pct(r.cited, r.answered) }));
  const step = pts.length > 1 ? (w - padX * 2) / (pts.length - 1) : 0;
  const x = (i) => (pts.length > 1 ? padX + i * step : w / 2);
  const y = (v) => padTop + (hgt - padTop - padBottom) * (1 - v / 100);
  const grid = [0, 50, 100]
    .map((v) => `<line class="grid" x1="${padX}" x2="${w - 8}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${padX - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`)
    .join('');
  const line = (key, color) =>
    `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => `${x(i)},${y(p[key])}`).join(' ')}"/>` +
    pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[key])}" r="4.5" fill="${color}" stroke="#fff" stroke-width="2"/>`).join('');
  const hits = pts
    .map((p, i) => `<g class="vis-hit"><title>${h(when(p.at))}
הוזכרתם: ${p.m}%
צוטטתם: ${p.c}%</title><rect x="${x(i) - Math.max(10, step / 2)}" y="${padTop}" width="${Math.max(20, step)}" height="${hgt - padTop - padBottom}"/></g>`)
    .join('');
  const dm = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  const ticks = pts.length > 1
    ? [0, pts.length - 1].map((i, k) => `<text class="tick" x="${x(i)}" y="${hgt - 6}" text-anchor="${k ? 'end' : 'start'}">${dm(pts[i].at)}</text>`).join('')
    : `<text class="tick" x="${w / 2}" y="${hgt - 6}" text-anchor="middle">${dm(pts[0].at)}</text>`;
  return `<section class="card"><h3>המגמה לאורך זמן</h3>
    <div class="pf-legend"><span><i style="background:#5b3df5"></i>הוזכרתם</span><span><i style="background:#12a594"></i>צוטטתם כמקור</span></div>
    <svg viewBox="0 0 ${w} ${hgt}" class="chart vis-chart" role="img" aria-label="אחוז האזכורים והציטוטים בכל בדיקה" direction="ltr">
      ${grid}${line('c', '#12a594')}${line('m', '#5b3df5')}${hits}${ticks}
    </svg>
    ${pts.length < 2 ? '<p class="muted small">המגמה תתמלא אחרי עוד כמה בדיקות שבועיות.</p>' : ''}
  </section>`;
}

/** The sites the answers lean on: where it pays to be listed. */
function sourcesCard(latest, business) {
  const mine = siteHostOf(business.ai_site);
  const count = new Map();
  for (const r of latest) {
    if (r.error) continue;
    const hosts = new Set(parseJson(r.sources, []).map((s) => hostOf(s.link)).filter(Boolean));
    for (const host of hosts) count.set(host, (count.get(host) || 0) + 1);
  }
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) return '';
  const max = top[0][1];
  return `<section class="card"><h3>על אילו אתרים ה-AI סומך</h3>
    <p class="muted small">המקורות שהופיעו הכי הרבה בתשובות. כדאי שהעסק יופיע ויקבל ביקורות באתרים האלה.</p>
    <ul class="vis-src-list">${top
      .map(([host, n]) => {
        const isMine = mine && (host === mine || host.endsWith(`.${mine}`));
        return `<li class="${isMine ? 'mine' : ''}"><span class="vis-src-host"><bdi>${h(host)}</bdi>${isMine ? ' <span class="badge st-resolved">האתר שלכם</span>' : ''}</span>
          <span class="vis-src-bar"><span style="width:${(n / max) * 100}%"></span></span><span class="vis-src-n">${n}</span></li>`;
      })
      .join('')}</ul></section>`;
}

/** The AI's plan from the latest check. */
function planCard(plan, last, planOn) {
  if (!plan) {
    return planOn
      ? `<section class="card vis-plan"><h3>${icon('spark', 18)} איך להופיע ב-AI</h3><p class="muted">אחרי הבדיקה הבאה, ה-AI יכין כאן תוכנית פעולה: על מי ממליצים במקומכם, באילו אתרים כדאי להופיע ומה להוסיף לאתר ולפרופיל.</p></section>`
      : '';
  }
  const stale = plan.run_at !== last.run_at;
  return `<section class="card vis-plan"><h3>${icon('spark', 18)} איך להופיע ב-AI</h3>
    ${renderInsight(plan.plan)}
    <p class="muted small">לפי הבדיקה מ-${h(when(plan.run_at))}${stale ? ' (התוכנית לבדיקה האחרונה לא הוכנה)' : ''}. כדאי לבצע פעולה או שתיים בשבוע ולראות את המגמה.</p>
  </section>`;
}

/** The businesses the answers recommend instead, most mentioned first. */
function rivalsCard(latest, allEngines) {
  const count = new Map();
  for (const r of latest) {
    for (const name of parseJson(r.recommended, [])) {
      const key = name.replace(/\s+/g, ' ').trim();
      const k = key.toLowerCase();
      if (!count.has(k)) count.set(k, { name: key, n: 0, engines: new Set() });
      const c = count.get(k);
      c.n++;
      c.engines.add(allEngines[r.engine] || r.engine);
    }
  }
  const top = [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  if (!top.length) return '';
  const answered = latest.filter((r) => !r.error).length || 1;
  const max = top[0].n;
  return `<section class="card"><h3>${icon('rivals', 18)} על מי ממליצים במקומכם</h3>
    <p class="muted small">העסקים שהתשובות המליצו עליהם הכי הרבה בבדיקה האחרונה.</p>
    <ul class="vis-src-list vis-rivals">${top
      .map((c) => `<li><span class="vis-src-host" title="${h([...c.engines].join(', '))}">${h(c.name)}</span>
        <span class="vis-src-bar"><span style="width:${(c.n / max) * 100}%"></span></span><span class="vis-src-n">${Math.round((c.n / answered) * 100)}%</span></li>`)
      .join('')}</ul>
    <p class="muted small">האחוז: בכמה מהתשובות העסק הומלץ.</p>
  </section>`;
}

function matrix(byQuery, shownEngines, allEngines) {
  return `<section class="card">
    <h3>התשובות לכל שאלה</h3>
    <div class="table-wrap"><table class="table vis-table"><thead><tr><th>שאלה</th>${shownEngines.map((e) => `<th>${h(allEngines[e])}</th>`).join('')}</tr></thead>
      <tbody>${[...byQuery]
        .map(([q, cells]) => `<tr><td class="vis-q">${h(q)}</td>${shownEngines.map((e) => cell(cells[e])).join('')}</tr>`)
        .join('')}</tbody></table></div>
    <p class="muted small">לוחצים על תוצאה כדי לראות את המשפט שבו הוזכרתם ואת המקורות שהתשובה נשענה עליהם. תשובות AI משתנות מבדיקה לבדיקה, לכן כדאי להסתכל על המגמה.</p>
  </section>`;
}

function dashboard({ runs, latest, shownEngines, allEngines, byQuery, business, plan, planOn }) {
  const last = runs.at(-1);
  return `<div class="vis-top">${hero(last, runs.at(-2))}<section class="card vis-eng-card"><h3>לפי מנוע</h3>${engineCards(latest, shownEngines, allEngines)}</section></div>
    ${kpis(last, latest, byQuery)}
    <div class="dash-grid vis-grid">${planCard(plan, last, planOn)}${rivalsCard(latest, allEngines)}</div>
    <div class="dash-grid vis-grid">${trend(runs)}${sourcesCard(latest, business)}</div>
    ${matrix(byQuery, shownEngines, allEngines)}`;
}

/** While a check runs: a live progress bar; the page reloads by itself when it ends. */
function progressCard(r) {
  const p = r.total ? Math.round((r.done / r.total) * 100) : 0;
  return `<section class="card vis-progress" id="vis-progress" role="status" aria-live="polite">
    <div class="vis-progress-head"><span class="spinner" aria-hidden="true"></span>
      <div><b>הבדיקה רצה עכשיו</b><span class="muted small" id="vis-progress-text">${r.total ? `${r.done} מתוך ${r.total} תשובות` : 'מתחילים…'} · בדרך כלל לוקח 1–3 דקות. אפשר להישאר כאן או לחזור אחר כך, הדף יתעדכן לבד.</span></div></div>
    <div class="vis-progress-bar"><span id="vis-progress-bar" style="width:${p}%"></span></div>
  </section>
  <script>(function(){var t=document.getElementById('vis-progress-text'),b=document.getElementById('vis-progress-bar');
  function tick(){fetch('/admin/ai-visibility/progress',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(d){
    if(!d.running){location.replace('/admin/ai-visibility?done=1');return}
    if(d.phase==='plan'){b.style.width='100%';t.textContent='כל התשובות התקבלו. ה-AI מכין תוכנית פעולה ובודק על מי ממליצים במקומכם…'}else if(d.total){b.style.width=Math.round(d.done/d.total*100)+'%';t.textContent=d.done+' מתוך '+d.total+' תשובות · בדרך כלל לוקח 1–3 דקות. אפשר להישאר כאן או לחזור אחר כך, הדף יתעדכן לבד.'}
    setTimeout(tick,3000)}).catch(function(){setTimeout(tick,6000)})}
  setTimeout(tick,2000)})();</script>`;
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
  cityGuess = '', suggestedCity = '', plan = null, planOn = false,
}) {
  const { runs, latest } = data;
  const last = runs.at(-1);
  const shownEngines = engines.length ? engines : Object.keys(allEngines).filter((e) => plus || !PLUS_ENGINES.includes(e));
  const byQuery = new Map();
  for (const r of latest) {
    if (!byQuery.has(r.query)) byQuery.set(r.query, {});
    byQuery.get(r.query)[r.engine] = r;
  }
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
    ${running ? progressCard(running) : ''}
    ${
      engines.length
        ? ''
        : '<div class="warn">כדי לבדוק צריך לפחות מנוע אחד: SerpApi (לגוגל) או מפתח Anthropic (ל-Claude). מנהל המערכת מגדיר אותם ב-Railway.</div>'
    }
    ${
      last
        ? dashboard({ runs, latest, shownEngines, allEngines, byQuery, business, plan, planOn })
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
                ${inputs.map((q, i) => `<input name="queries" value="${h(q)}" maxlength="160" placeholder="${i === 0 ? 'למשל: איפה יש ארוחת בוקר טובה בדיזנגוף?' : i === 1 ? 'למשל: בית קפה עם חניה ליד כיכר המדינה' : ''}" aria-label="שאלה ${i + 1}">`).join('')}
                <span class="muted small">שאלות מקומיות עובדות הכי טוב: התחום + העיר, השכונה או הרחוב, כמו שלקוח בסביבה היה שואל ("איפה יש... ב...", "... קרוב ל..."). בלי שם העסק. אלה החיפושים שבהם ה-AI מציג עסקים מגוגל מפות.</span>
              </div>
              <div class="grid2 tight">
                <label>שמות נוספים של העסק<input name="aliases" value="${h(business.ai_aliases)}" maxlength="300" placeholder="למשל: Jacko's Street, ג׳קוס"></label>
                <label>אתר העסק<input name="site" value="${h(business.ai_site)}" dir="ltr" placeholder="jackos.co.il"></label>
                <label>עיר, שכונה או אזור<input name="city" value="${h(suggestedCity || business.ai_city || cityGuess)}" maxlength="60" placeholder="למשל: תל אביב, הצפון הישן"></label>
              </div>
              <div class="row compact">
                <button class="btn primary">שמירה</button>
                ${
                  aiAvailable
                    ? `<button class="btn ai-btn" formaction="/admin/ai-visibility/suggest" formnovalidate>${icon('spark', 16)} <span>ה-AI יציע שאלות</span></button>
                       <input name="about" class="inline-about" placeholder="תחום ושירותים, למשל: מסעדת שף, אירועים פרטיים" maxlength="120">`
                    : ''
                }
              </div>
            </form>
            <p class="muted small">כל שאלה נבדקת בכל מנוע שפעיל אצלכם: ${shownEngines.map((e) => h(allEngines[e])).join(', ')}.</p>
          </section>`
        : ''
    }`;
}
