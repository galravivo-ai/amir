import { h } from '../util.js';
import { FACTORS } from '../maps.js';
import { parseJson } from '../db.js';
import { healthSection } from './health.js';
import { rankSection } from './rankings.js';
import { icon } from './icons.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;

/** Where the business stands, in two numbers: profile score, and how often it's in the Maps top 3 around it. */
function summary(audits, keywords, checks) {
  const scores = audits.filter((a) => !a.error).map((a) => a.score);
  const score = scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null;
  let top = 0;
  let total = 0;
  for (const k of keywords) {
    const last = (checks.get(k.id) || []).find((c) => !c.error);
    for (const p of last ? parseJson(last.points, []) : []) {
      total++;
      if (p.rank != null && p.rank <= 3) top++;
    }
  }
  return `<div class="mp-sum">
    <a href="#health" class="mp-stat"><span class="muted small">בריאות הפרופיל</span><b>${score == null ? '—' : `${score}<small>/100</small>`}</b></a>
    <a href="#rank" class="mp-stat"><span class="muted small">בטופ 3 במפות</span><b>${total ? `${Math.round((top / total) * 100)}<small>%</small>` : '—'}</b>${total ? `<span class="muted small">ב-${top} מתוך ${total} אזורים שנבדקו סביב העסק</span>` : ''}</a>
  </div>`;
}

function planCard(plan, csrf) {
  if (!plan.length) {
    return `<section class="card mp-plan" id="plan"><h2>${icon('check', 22)} מה לעשות השבוע</h2>
      <p class="muted">אין כרגע משהו דחוף. ממשיכים לבקש דירוגים מלקוחות ולענות לביקורות, ובודקים שוב בשבוע הבא.</p></section>`;
  }
  return `<section class="card mp-plan" id="plan"><h2>${icon('check', 22)} מה לעשות השבוע</h2>
    <ol class="tasks">${plan
      .map(
        (t) => `<li>
          <div class="task-body"><span class="mp-factor ${t.factor}">${h(FACTORS[t.factor])}</span><b>${h(t.title)}</b><span class="muted small">${h(t.why)}</span></div>
          <div class="task-actions">
            <a class="btn small-btn" href="${t.action === 'wa' ? '/admin#send' : h(t.href)}">${t.action === 'wa' ? 'לשליחה' : 'לביצוע'}</a>
            <form method="post" action="/admin/tasks/${encodeURIComponent(t.key)}/done">${csrfField(csrf)}<input type="hidden" name="back" value="maps"><button class="btn-link" title="יוסתר עד השבוע הבא">בוצע ✓</button></form>
          </div>
        </li>`,
      )
      .join('')}</ol>
  </section>`;
}

const TIPS = `<details class="card mp-tips"><summary>${icon('spark', 18)} איך גוגל מחליטה מי מופיע ראשון במפות</summary>
  <p>גוגל מסבירה שהסדר בתוצאות המקומיות נקבע לפי שלושה דברים:</p>
  <ul>
    <li><b>התאמה לחיפוש.</b> עד כמה הפרופיל מתאים למה שחיפשו: קטגוריה ראשית מדויקת, קטגוריות משניות, שירותים, ותיאור שכתוב במילים של הלקוחות.</li>
    <li><b>בולטות.</b> כמה העסק מוכר ופעיל: מספר הביקורות והדירוג, ביקורות חדשות שממשיכות להגיע, תשובות לביקורות, תמונות ופוסטים.</li>
    <li><b>מרחק.</b> כמה העסק קרוב למי שמחפש. את זה אי אפשר לשנות, אבל אפשר לוודא שהכתובת והסיכה במפה מדויקות.</li>
  </ul>
  <p>מה לא עוזר: להוסיף לשם העסק מילות חיפוש ("בית קפה הכי טוב בתל אביב"). זה נגד הכללים של גוגל ועלול להוביל להשעיית הפרופיל.</p>
  <p class="muted small">שינויים במיקום לוקחים בדרך כלל כמה שבועות. לכן כדאי לעבוד בהתמדה, מעט כל שבוע, ולעקוב כאן אחרי המגמה.</p>
</details>`;

export function mapsView({ plan, health, rank, running, csrf, notice = '', error = '' }) {
  const hasPlace = health.locations.length > 0;
  return `<div class="page-head"><h1>${icon('pin', 26)} קידום בגוגל מפות</h1></div>
    <p class="page-intro">כאן רואים איפה העסק עומד בגוגל מפות ומה לעשות כדי לעלות: מה חסר בפרופיל, באיזה מקום אתם מופיעים סביב העסק, ותוכנית קצרה לשבוע.</p>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    ${running ? '<div class="warn">הבדיקה רצה עכשיו, זה לוקח עד דקה. הדף יתרענן לבד.</div><script>setTimeout(function(){location.replace(location.pathname+location.hash)},12000)</script>' : ''}
    ${
      hasPlace
        ? `${summary(health.audits, rank.keywords, rank.checks)}
           ${planCard(plan, csrf)}
           ${rankSection({ ...rank, csrf })}
           ${healthSection({ ...health, csrf })}
           ${TIPS}`
        : `<section class="card empty"><p>כדי להתחיל, חברו קודם את העסק ב<a href="/admin/google">חיבור לגוגל</a>.</p></section>${TIPS}`
    }`;
}
