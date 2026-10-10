import { h } from '../util.js';
import { icon } from './icons.js';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('he-IL'));
const fmt1 = (n) => (n == null ? '—' : n.toFixed(1));
const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

export const NETWORK_RANGES = { '7d': '7 ימים', '30d': '30 ימים', this_month: 'החודש', last_month: 'החודש הקודם', '90d': '3 חודשים', '365d': 'שנה' };

const rangeForm = (period, action) => `<form method="get" action="${action}" class="filters">
    <select name="range" aria-label="טווח זמנים" onchange="this.form.submit()">${Object.entries(NETWORK_RANGES)
      .map(([k, l]) => `<option value="${k}" ${k === period.key ? 'selected' : ''}>${h(l)}</option>`)
      .join('')}</select><noscript><button class="btn">הצגה</button></noscript></form>`;

const stat = (ic, label, value, hint = '', trend = '', href = '') => {
  const body = `<span class="st-label">${icon(ic, 16)}${h(label)}</span><span class="st-value">${value}</span><span class="st-hint ${trend}">${hint}</span>`;
  return href ? `<a class="stat" href="${href}">${body}</a>` : `<div class="stat">${body}</div>`;
};
const change = (now, before) => {
  if (!before) return ['', ''];
  const c = Math.round(((now - before) / before) * 100);
  return c ? [`${c > 0 ? '▲' : '▼'} ${Math.abs(c)}% מהתקופה הקודמת`, c > 0 ? 'up' : 'down'] : ['כמו בתקופה הקודמת', ''];
};

/** The network's tools, shown on the network page and as a teaser before the second branch. */
export const NETWORK_TOOLS = [
  ['chart', 'השוואה בין הסניפים', 'דירוג, ביקורות, מענה, צפיות, שיחות ומיקום במפות, סניף מול סניף.'],
  ['team', 'מנהל לכל סניף', 'מנהל סניף רואה ועונה רק על הביקורות של הסניף שלו, ומקבל עליהן התראות.'],
  ['chat', 'תבניות תשובה משותפות', 'אותו טון בכל הסניפים. התבנית משלימה לבד את שם הלקוח ושם הסניף.'],
  ['report', 'דוח חודשי מאוחד', 'כל הסניפים בדוח אחד, עם טבלת השוואה. נשלח במייל בתחילת כל חודש.'],
  ['card', 'חשבון אחד, חשבונית אחת', 'כל הסניפים בחיוב אחד, לפי מספר הפרופילים.'],
];

function toolsCard(links) {
  const hrefs = links ? ['#compare', '/admin/team', '/admin/reply-templates', '/admin/reports/monthly', '/admin/plan'] : [];
  return `<section class="card net-tools"><h3>${icon('spark', 18)} כלי הרשת שלכם</h3><div class="net-tools-grid">${NETWORK_TOOLS.map(
    ([ic, t, d], i) =>
      `${links ? `<a class="net-tool" href="${hrefs[i]}">` : '<div class="net-tool">'}<span class="net-tool-ic">${icon(ic, 20)}</span><span><b>${h(t)}</b><small>${h(d)}</small></span>${links ? '</a>' : '</div>'}`,
  ).join('')}</div></section>`;
}

/** Before the second branch: what a network account gets. */
export function networkIntroView({ branches, plan, canAdd }) {
  return `<div class="page-head"><h1>רשת הסניפים</h1></div>
  <section class="card net-hero">
    <div><span class="lp-kicker">${icon('chart', 14)} חשבון רשת</span>
      <h2>יש לכם יותר מסניף אחד? מנהלים את כולם מכאן</h2>
      <p>מהפרופיל השני בגוגל, החשבון הופך לחשבון רשת, בלי תוספת מעבר למחיר המסלול לכל פרופיל (${h(plan.label)}: ₪${plan.price} לפרופיל לחודש, כולל מע״מ).</p>
      <p class="muted small">${branches ? 'כרגע יש בחשבון פרופיל אחד.' : 'עוד לא הוספתם פרופיל גוגל.'}</p>
      ${canAdd ? `<a class="btn primary" href="/admin/google">${icon('plus', 16)} הוספת סניף</a>` : ''}
    </div>
  </section>
  ${toolsCard(false)}`;
}

function leaderChips(s) {
  const L = s.leaders;
  const chip = (ic, label, row, value) => (row ? `<a class="net-chip" href="/admin/network/${row.id}">${icon(ic, 15)}<span>${h(label)}</span><b>${h(row.title)}</b><em>${value}</em></a>` : '');
  const chips = [
    chip('star', 'הדירוג הגבוה', L.rating, L.rating && `${fmt1(L.rating.rating)}★`),
    chip('inbox', 'הכי הרבה ביקורות', L.newReviews, L.newReviews && `${L.newReviews.newReviews} חדשות`),
    chip('phone', 'הכי הרבה שיחות', L.calls, L.calls && fmt(L.calls.calls)),
    chip('pin', 'הכי גבוה במפות', L.rank, L.rank && `מקום ${fmt1(L.rank.rank)}`),
  ].join('');
  return chips ? `<div class="net-chips">${chips}</div>` : '';
}

const SORTS = {
  rating: ['דירוג', (r) => r.rating ?? -1],
  new: ['ביקורות חדשות', (r) => r.newReviews],
  reply: ['מענה', (r) => r.replyRate ?? -1],
  waiting: ['מחכות', (r) => r.unanswered],
  views: ['צפיות', (r) => r.views ?? -1],
  calls: ['שיחות', (r) => r.calls ?? -1],
  health: ['בריאות', (r) => r.health ?? -1],
  rank: ['מיקום', (r) => (r.rank == null ? -99 : -r.rank)],
};

/** The network page: totals, leaders, what needs attention and the comparison table. */
export function networkView({ rows, summary: s, period, sort }) {
  const [hint, trend] = change(s.newReviews, s.prevReviews);
  const sorted = SORTS[sort] ? [...rows].sort((a, b) => SORTS[sort][1](b) - SORTS[sort][1](a)) : rows;
  const maxNew = Math.max(1, ...rows.map((r) => r.newReviews));
  const th = (key, label) =>
    `<th><a href="?range=${h(period.key)}&sort=${key}#compare" class="${sort === key ? 'on' : ''}">${h(label)}${sort === key ? ' ▾' : ''}</a></th>`;
  const cell = (v, cls = '') => `<td class="${cls}">${v}</td>`;
  const table = `<div class="table-wrap net-table-wrap"><table class="table net-table">
    <thead><tr><th>סניף</th>${th('rating', 'דירוג')}${th('new', 'ביקורות חדשות')}${th('reply', 'מענה')}${th('waiting', 'מחכות')}${th('views', 'צפיות')}${th('calls', 'שיחות')}<th>הגעה</th>${th('health', 'בריאות')}${th('rank', 'מיקום')}</tr></thead>
    <tbody>${sorted
      .map(
        (r) => `<tr>
          <th scope="row"><a href="/admin/network/${r.id}"><b>${h(r.title)}</b></a>${r.address ? `<small>${h(r.address)}</small>` : ''}</th>
          ${cell(r.rating ? `<b>${fmt1(r.rating)}</b> <span class="muted small">(${fmt(r.total)})</span>` : '—')}
          ${cell(`<span class="net-bar"><span style="width:${(r.newReviews / maxNew) * 100}%"></span></span><b>${r.newReviews}</b>${r.newAvg != null ? ` <span class="muted small">${fmt1(r.newAvg)}★</span>` : ''}`, 'net-new')}
          ${cell(r.replyRate == null ? '—' : `${r.replyRate}%`, r.replyRate != null && r.replyRate < 70 ? 'warn-t' : '')}
          ${cell(r.unanswered ? `<a href="/admin/google/reviews?location=${r.id}&filter=unanswered" class="badge st-new">${r.unanswered}</a>` : '<span class="good-t">✓</span>')}
          ${cell(fmt(r.views))}${cell(fmt(r.calls))}${cell(fmt(r.directions))}
          ${cell(r.health == null ? '—' : `<span class="net-score ${r.health >= 80 ? 'good' : r.health >= 60 ? 'mid' : 'bad'}">${r.health}</span>`)}
          ${cell(r.rank == null ? '—' : fmt1(r.rank))}
        </tr>`,
      )
      .join('')}</tbody></table></div>
    <p class="muted small">צפיות, שיחות ובקשות הגעה מגיעות מגוגל לסניפים שמחוברים דרך חשבון הגוגל של העסק. מיקום: המיקום הממוצע בבדיקת המפות האחרונה (נמוך יותר זה טוב יותר).</p>`;

  return `<div class="page-head"><div><h1>רשת הסניפים</h1><p class="muted">${s.branches} סניפים · ${h(period.label)}</p></div>${rangeForm(period, '/admin/network')}</div>
  <div class="stats">
    ${stat('star', 'דירוג הרשת', s.rating ? `${fmt1(s.rating)}<small>★</small>` : '—', `${fmt(s.total)} ביקורות בגוגל`)}
    ${stat('inbox', 'ביקורות חדשות', fmt(s.newReviews), hint, trend)}
    ${stat('chat', 'אחוז מענה', s.replyRate == null ? '—' : `${s.replyRate}%`, 'מהביקורות החדשות', s.replyRate != null && s.replyRate < 70 ? 'warn-t' : '')}
    ${stat('alert', 'מחכות לתשובה', fmt(s.unanswered), s.unanswered ? 'לכל הביקורות' : 'הכול נענה ✓', s.unanswered ? 'warn-t' : 'up', '/admin/google/reviews?filter=unanswered')}
    ${stat('eye', 'צפיות בפרופילים', fmt(s.views), s.views == null ? 'אחרי חיבור לגוגל' : 'בחיפוש ובמפות', s.views == null ? 'muted' : '')}
    ${stat('phone', 'שיחות', fmt(s.calls), s.directions != null ? `${fmt(s.directions)} בקשות הגעה` : 'אחרי חיבור לגוגל', s.calls == null ? 'muted' : '')}
  </div>
  ${leaderChips(s)}
  ${
    s.attention.length
      ? `<section class="card net-attention"><h3>${icon('alert', 18)} כדאי לשים לב</h3><ul>${s.attention
          .map((a) => `<li><a href="/admin/network/${a.r.id}"><b>${h(a.r.title)}</b></a> · ${h(a.why)}</li>`)
          .join('')}</ul></section>`
      : ''
  }
  <section class="card" id="compare"><div class="card-head"><h3>${icon('chart', 18)} השוואה בין הסניפים</h3><span class="muted small">לחיצה על כותרת ממיינת</span></div>${table}</section>
  ${toolsCard(true)}`;
}

/** One branch: its numbers next to the network's, and its latest reviews. */
export function branchView({ row: r, network, reviews, period, scoped, canReply }) {
  const [hint, trend] = change(r.newReviews, r.prevReviews);
  const vsNet = (v, avg, unit = '', lowerIsBetter = false) => {
    if (v == null || avg == null || network.branches < 2) return '';
    const better = lowerIsBetter ? v < avg : v > avg;
    return Math.abs(v - avg) < 0.05 ? 'כמו ממוצע הרשת' : `${better ? '▲' : '▼'} ממוצע הרשת ${typeof avg === 'number' && !Number.isInteger(avg) ? avg.toFixed(1) : avg}${unit}`;
  };
  const avg = (k) => {
    const v = network.rows.map((x) => x[k]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return `${scoped ? '' : '<p><a href="/admin/network">→ לכל הסניפים</a></p>'}
  <div class="page-head"><div><h1>${h(r.title)}</h1>${r.address ? `<p class="muted">${h(r.address)}</p>` : ''}</div>${rangeForm(period, `/admin/network/${r.id}`)}</div>
  <div class="stats">
    ${stat('star', 'דירוג בגוגל', r.rating ? `${fmt1(r.rating)}<small>★</small>` : '—', vsNet(r.rating, avg('rating'), '★') || `${fmt(r.total)} ביקורות`)}
    ${stat('inbox', 'ביקורות חדשות', fmt(r.newReviews), hint, trend)}
    ${stat('chat', 'אחוז מענה', r.replyRate == null ? '—' : `${r.replyRate}%`, vsNet(r.replyRate, avg('replyRate') != null ? Math.round(avg('replyRate')) : null, '%'))}
    ${stat('alert', 'מחכות לתשובה', fmt(r.unanswered), r.unanswered ? 'לתשובה ←' : 'הכול נענה ✓', r.unanswered ? 'warn-t' : 'up', `/admin/google/reviews?location=${r.id}&filter=unanswered`)}
    ${stat('eye', 'צפיות', fmt(r.views), r.views == null ? 'אחרי חיבור לגוגל' : `${fmt(r.directions)} בקשות הגעה`, r.views == null ? 'muted' : '')}
    ${stat('phone', 'שיחות', fmt(r.calls), r.website != null ? `${fmt(r.website)} כניסות לאתר` : '', '')}
  </div>
  <div class="dash-main">
    <div class="dash-col">
      <section class="card"><div class="card-head"><h3>${icon('star', 18)} ביקורות אחרונות</h3><a href="/admin/google/reviews?location=${r.id}">לכל הביקורות של הסניף ←</a></div>
        ${
          reviews.length
            ? `<ul class="net-reviews">${reviews
                .map(
                  (v) => `<li><a href="/admin/google/reviews/${v.id}"><span class="net-stars ${v.rating <= 3 ? 'low' : ''}">${stars(v.rating)}</span>
                    <b>${h(v.reviewer || 'לקוח')}</b>${v.reply ? '<span class="good-t small">נענתה ✓</span>' : `<span class="badge st-new">${canReply ? 'לתשובה' : 'ממתינה'}</span>`}
                    <small>${h(String(v.comment || 'דירוג בלי טקסט').slice(0, 160))}</small></a></li>`,
                )
                .join('')}</ul>`
            : '<p class="muted">עוד אין ביקורות לסניף.</p>'
        }
      </section>
    </div>
    <div class="dash-col">
      <section class="card"><h3>${icon('shield', 18)} מצב הפרופיל</h3>
        <dl class="net-dl">
          <dt>ציון בריאות</dt><dd>${r.health == null ? '<span class="muted">עוד לא נבדק</span>' : `<span class="net-score ${r.health >= 80 ? 'good' : r.health >= 60 ? 'mid' : 'bad'}">${r.health}</span>`}</dd>
          <dt>מיקום ממוצע במפות</dt><dd>${r.rank == null ? '<span class="muted">אין חיפושים במעקב</span>' : `${fmt1(r.rank)} ${vsNet(r.rank, avg('rank'), '', true) ? `<span class="muted small">${vsNet(r.rank, avg('rank'), '', true)}</span>` : ''}`}</dd>
          <dt>ביקורות 3★ ומטה בתקופה</dt><dd>${r.low}</dd>
        </dl>
        ${scoped ? '' : `<div class="row compact"><a class="btn btn-sm" href="/admin/profile">בריאות הפרופיל</a><a class="btn btn-sm" href="/admin/rankings">מיקום במפות</a></div>`}
      </section>
    </div>
  </div>`;
}

const STAR_SETS = { '': 'כל הדירוגים', 45: '4–5 כוכבים', 3: '3 כוכבים', 12: '1–2 כוכבים' };

/** Shared reply templates: one tone for every branch. */
export function templatesView({ templates, csrf, canEdit }) {
  const starsSelect = (v = '') =>
    `<select name="stars" aria-label="לאיזה דירוג">${Object.entries(STAR_SETS).map(([k, l]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
  const form = (t = null) => `<form method="post" action="/admin/reply-templates${t ? `/${t.id}` : ''}" class="stack net-tpl-form">
      <input type="hidden" name="_csrf" value="${h(csrf)}">
      <div class="row compact"><input name="title" value="${h(t?.title || '')}" required maxlength="80" placeholder="שם התבנית, למשל: תודה על ביקורת חיובית" aria-label="שם התבנית">${starsSelect(t?.stars)}</div>
      <textarea name="body" rows="3" required maxlength="2000" aria-label="נוסח התשובה" placeholder="תודה רבה {שם}! שמחים שנהניתם אצלנו ב{סניף}, מחכים לראות אתכם שוב.">${h(t?.body || '')}</textarea>
      <div class="row compact"><button class="btn ${t ? '' : 'primary'}">${t ? 'שמירה' : 'הוספת תבנית'}</button>${
        t ? `<button class="btn-link danger-text" name="action" value="delete" onclick="return confirm('למחוק את התבנית?')">מחיקה</button>` : ''
      }</div>
    </form>`;
  return `<div class="page-head"><div><h1>תבניות תשובה</h1><p class="muted">נוסחים קבועים לתשובות בגוגל, משותפים לכל הסניפים ולכל הצוות. בתשובה לביקורת בוחרים תבנית, והיא נכנסת לתיבה לעריכה.</p></div></div>
  <section class="card net-tpl-help"><p>${icon('spark', 16)} אפשר לשלב <code>{שם}</code> (השם הפרטי של הלקוח) ו-<code>{סניף}</code> (שם הסניף), והם יושלמו לבד. כדאי לערוך מעט כל תשובה לפני הפרסום: גוגל והלקוחות אוהבים תשובות אישיות.</p></section>
  ${
    templates.length
      ? templates
          .map((t) =>
            canEdit
              ? `<section class="card">${form(t)}</section>`
              : `<section class="card"><h3>${h(t.title)} <span class="muted small">${h(STAR_SETS[t.stars] || '')}</span></h3><p>${h(t.body)}</p></section>`,
          )
          .join('')
      : `<section class="card empty"><p class="muted">עוד אין תבניות.</p>${
          canEdit
            ? `<form method="post" action="/admin/reply-templates/starter"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn">${icon('spark', 16)} הוספת 3 תבניות מוכנות לעריכה</button></form>`
            : ''
        }</section>`
  }
  ${canEdit ? `<section class="card"><h3>תבנית חדשה</h3>${form()}</section>` : ''}`;
}

/** The menu for a member limited to one branch. */
export const branchNav = (branchId) => [
  ['/admin/network/' + branchId, 'הסניף שלי', 'home'],
  ['/admin/google/reviews', 'ביקורות בגוגל', 'star'],
  ['/admin/reply-templates', 'תבניות תשובה', 'chat'],
];
