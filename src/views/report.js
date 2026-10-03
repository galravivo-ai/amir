import { h, logoSrc } from '../util.js';
import { renderInsight } from './settings.js';
import { competitorsBrief } from './competitors.js';
import { icon } from './icons.js';

const fmt1 = (v) => (v ? v.toFixed(1) : '—');
function delta(now, before, { digits = 0, unit = '' } = {}) {
  if (before == null || (!now && !before)) return '';
  const d = now - before;
  if (Math.abs(d) < (digits ? 0.05 : 0.5)) return '<span class="r-delta">כמו בחודש הקודם</span>';
  return `<span class="r-delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(digits)}${unit} מהחודש הקודם</span>`;
}

function weeksChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.google + w.surveys));
  return `<div class="r-weeks" role="img" aria-label="ביקורות ודירוגים בכל שבוע">${weeks
    .map((w, i) => {
      const gh = Math.round((w.google / max) * 100);
      const sh = Math.round((w.surveys / max) * 100);
      return `<div class="r-week"><div class="r-stack">
          <span class="r-s" style="height:${sh}%" title="סקר: ${w.surveys}"></span><span class="r-g" style="height:${gh}%" title="גוגל: ${w.google}"></span>
        </div><b>${w.google + w.surveys}</b><small>שבוע ${i + 1}</small></div>`;
    })
    .join('')}</div>
    <div class="r-legend"><span><i class="r-g"></i> ביקורות בגוגל</span><span><i class="r-s"></i> דירוגים בסקר</span></div>`;
}

function distribution(dist) {
  const total = dist.reduce((a, b) => a + b, 0);
  if (!total) return '';
  return `<div class="r-dist">${[5, 4, 3, 2, 1]
    .map((s) => {
      const n = dist[s - 1];
      return `<div class="r-dist-row"><span>${s}★</span><span class="r-dist-bar"><span class="${s >= 4 ? 'good' : s === 3 ? 'mid' : 'bad'}" style="width:${(n / total) * 100}%"></span></span><span>${n}</span></div>`;
    })
    .join('')}</div>`;
}

const quote = (q) =>
  `<blockquote class="r-quote"><p>${h(String(q.text).slice(0, 320))}${String(q.text).length > 320 ? '…' : ''}</p>
    <footer>${'★'.repeat(q.rating)} · ${h(q.name || 'לקוח/ה')} · ${q.source === 'google' ? 'גוגל' : 'סקר'}</footer></blockquote>`;

export function monthlyReportView({ business, range, months, report: r, summary = '', aiNote = '' }) {
  const g = r.google;
  const s = r.surveys;
  const logo = logoSrc(business);
  const tools = `<div class="report-tools noprint">
      <form method="get" action="/admin/reports/monthly" class="row compact">
        <label class="sr-only" for="r-month">חודש</label>
        <select id="r-month" name="month" onchange="this.form.submit()">${months
          .map((m) => `<option value="${m.key}" ${m.key === range.month ? 'selected' : ''}>${h(m.label)}</option>`)
          .join('')}</select>
      </form>
      <button type="button" class="btn primary" onclick="window.print()">${icon('print', 18)} הורדה כ-PDF / הדפסה</button>
    </div>
    <p class="muted small noprint">בחלון ההדפסה בוחרים "שמירה כ-PDF". הדוח נשלח גם במייל בתחילת כל חודש (אפשר לכבות ב<a href="/admin/business">הגדרות</a>).</p>`;

  if (r.empty) {
    return `${tools}<section class="card empty"><p class="muted">אין עדיין נתונים ל${h(range.label)}. אחרי שיגיעו ביקורות או דירוגים, הם יופיעו כאן.</p></section>`;
  }

  return `${tools}
  <article class="report-sheet">
    <header class="r-head">
      <div><div class="r-kicker">דוח חודשי</div><h1>${h(business.name)}</h1><div class="r-month">${h(range.label)}${range.partial ? ' · עד היום' : ''}</div></div>
      ${logo ? `<img class="r-logo" src="${h(logo)}" alt="">` : ''}
    </header>

    ${summary ? `<section class="r-summary"><h2>בשורה התחתונה</h2>${renderInsight(summary)}</section>` : aiNote ? `<p class="muted small noprint">${h(aiNote)}</p>` : ''}

    <section class="r-kpis">
      <div class="r-kpi"><span>הדירוג בגוגל</span><b>${fmt1(g.avg)} <small>★</small></b><em>${g.total.toLocaleString('he-IL')} ביקורות בסך הכול</em></div>
      <div class="r-kpi"><span>ביקורות חדשות בגוגל</span><b>${g.count}</b><em>${g.count ? `ממוצע ${fmt1(g.avgPeriod)} ★` : ''} ${delta(g.count, r.googlePrev.count)}</em></div>
      <div class="r-kpi"><span>דירוגים בסקר</span><b>${s.responses}</b><em>${s.responses ? `ממוצע ${fmt1(s.avgRating)} ★` : ''} ${delta(s.responses, r.surveysPrev.responses)}</em></div>
      <div class="r-kpi"><span>לקוחות לא מרוצים</span><b>${s.negative}</b><em>${
        s.avgResolveHours != null ? `טופלו בממוצע תוך ${Math.max(1, Math.round(s.avgResolveHours))} שעות` : s.negative ? 'עוד לא טופלו' : 'אף אחד, כל הכבוד'
      }</em></div>
    </section>

    <section class="r-grid">
      <div class="r-box"><h3>שבוע אחרי שבוע</h3>${weeksChart(r.weeks)}</div>
      <div class="r-box"><h3>הביקורות החדשות בגוגל</h3>${distribution(g.distribution) || '<p class="muted">לא היו ביקורות חדשות החודש.</p>'}
        ${s.reviewClicks ? `<p class="small">${s.reviewClicks} לקוחות מרוצים מהסקר עברו לכתוב ביקורת בגוגל.</p>` : ''}</div>
    </section>

    ${
      r.topics.length
        ? `<section class="r-box"><h3>על מה דיברו הלקוחות</h3><div class="r-topics">${r.topics
            .map(
              (t) => `<div class="r-topic"><b>${h(t.topic)}</b><span class="r-topic-bar"><span class="good" style="width:${(t.positive / t.total) * 100}%"></span><span class="bad" style="width:${(t.negative / t.total) * 100}%"></span></span>
                <small>${t.positive} לטובה · ${t.negative} לרעה</small></div>`,
            )
            .join('')}</div></section>`
        : ''
    }

    ${
      r.quotes.good.length || r.quotes.bad.length
        ? `<section class="r-grid">
            ${r.quotes.good.length ? `<div class="r-box"><h3>מה אהבו</h3>${r.quotes.good.map(quote).join('')}</div>` : ''}
            ${r.quotes.bad.length ? `<div class="r-box"><h3>מה צריך לשפר</h3>${r.quotes.bad.map(quote).join('')}</div>` : ''}
          </section>`
        : ''
    }

    ${
      r.competitors.theirs.length && r.competitors.rows.length
        ? `<section class="r-box"><h3>מול המתחרים${r.competitors.position?.rank ? ` · מקום ${r.competitors.position.rank} מתוך ${r.competitors.position.of}` : ''}</h3>${competitorsBrief(r.competitors)}</section>`
        : ''
    }

    ${
      r.visibility
        ? `<section class="r-box r-vis"><h3>נראות ב-AI</h3><p>העסק הוזכר ב-<b>${r.visibility.mentioned}%</b> מתשובות עוזרי ה-AI שנבדקו, וצוטט כמקור ב-<b>${r.visibility.cited}%</b>.</p></section>`
        : ''
    }

    <footer class="r-foot">הדוח הופק אוטומטית מנתוני הביקורות והסקרים של העסק.</footer>
  </article>`;
}
