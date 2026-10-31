import { h } from '../util.js';
import { parseJson } from '../db.js';
import { healthSection } from './health.js';
import { rankSection } from './rankings.js';
import { icon } from './icons.js';



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

export function mapsView({ health, rank, running, csrf, notice = '', error = '' }) {
  const hasPlace = health.locations.length > 0;
  return `<div class="page-head"><h1>${icon('pin', 26)} מיקום ובריאות במפות</h1></div>
    <p class="page-intro">כאן רואים איפה העסק עומד בגוגל מפות: באיזה מקום אתם מופיעים סביב העסק, ומה חסר בפרופיל.</p>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    ${running ? '<div class="warn">הבדיקה רצה עכשיו, זה לוקח עד דקה. הדף יתרענן לבד.</div><script>setTimeout(function(){location.replace(location.pathname+location.hash)},12000)</script>' : ''}
    ${
      hasPlace
        ? `${summary(health.audits, rank.keywords, rank.checks)}
           <a class="card mp-todo" href="/admin/growth#t-profile">${icon('check', 20)}<span><b>מה לעשות כדי לעלות במפות?</b><span class="muted small">כל הפעולות, עם מה שכבר בוצע ומה הבא בתור, נמצאות בלשונית "תוכנית פעולה".</span></span><span class="todo-go">${icon('chevron', 16)}</span></a>
           ${rankSection({ ...rank, csrf })}
           ${healthSection({ ...health, csrf })}
           ${TIPS}`
        : `<section class="card empty"><p>כדי להתחיל, חברו קודם את העסק ב<a href="/admin/google">חיבור לגוגל</a>.</p></section>${TIPS}`
    }`;
}
