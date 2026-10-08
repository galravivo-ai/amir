import { formatDate, h } from '../util.js';
import { icon } from './icons.js';

// The profile's own numbers from Google: how many saw it, and what they did.

const SEARCH = ['BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'];
const MAPS = ['BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS'];
const MOBILE = ['BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS'];

/** The actions, in a fixed order; the first three each get their own color in the chart, the rest share "other". */
export const ACTIONS = [
  ['CALL_CLICKS', 'שיחות', 'phone', 'פנו לחייג מהפרופיל'],
  ['BUSINESS_DIRECTION_REQUESTS', 'בקשות הגעה', 'pin', 'ביקשו מסלול ניווט לעסק'],
  ['WEBSITE_CLICKS', 'כניסות לאתר', 'web', 'לחצו על הקישור לאתר'],
  ['BUSINESS_CONVERSATIONS', 'הודעות', 'chat', 'שלחו הודעה דרך הפרופיל'],
  ['BUSINESS_BOOKINGS', 'הזמנות תור', 'clock', 'הזמינו דרך גוגל'],
  ['BUSINESS_FOOD_ORDERS', 'הזמנות אוכל', 'heart', 'הזמינו אוכל דרך גוגל'],
  ['BUSINESS_FOOD_MENU_CLICKS', 'צפיות בתפריט', 'report', 'לחצו על התפריט'],
];
const SERIES = [
  ['CALL_CLICKS', 'שיחות', '#5b3df5'],
  ['BUSINESS_DIRECTION_REQUESTS', 'בקשות הגעה', '#12a594'],
  ['WEBSITE_CLICKS', 'כניסות לאתר', '#e8890c'],
  ['OTHER', 'אחר', '#d6409f'],
];

const sum = (t, keys) => keys.reduce((a, k) => a + (t[k] || 0), 0);
export const viewsOf = (t) => sum(t, [...SEARCH, ...MAPS]);
export const actionsOf = (t) => sum(t, ACTIONS.map((a) => a[0]));
const num = (n) => Math.round(n || 0).toLocaleString('he-IL');

function change(now, before) {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  if (!pct) return '<span class="pf-chg flat">ללא שינוי</span>';
  return `<span class="pf-chg ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

function tile(label, value, prev, hint = '', ic = '') {
  return `<div class="kpi pf-kpi">
    <span class="kpi-label">${ic ? icon(ic, 16) : ''}${h(label)}</span>
    <span class="kpi-value">${num(value)}</span>
    <span class="kpi-hint">${change(value, prev)}${hint ? ` <span class="muted">${h(hint)}</span>` : ''}</span>
  </div>`;
}

/** Days, or weeks when the range is long, so the bars stay readable. */
function buckets(daily, from, to) {
  const days = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.push(daily.get(d) || { date: d });
  }
  const size = days.length > 120 ? 7 : 1;
  const out = [];
  for (let i = 0; i < days.length; i += size) {
    const group = days.slice(i, i + size);
    const b = { date: group[0].date, end: group[group.length - 1].date };
    for (const d of group) for (const [k, v] of Object.entries(d)) if (k !== 'date') b[k] = (b[k] || 0) + v;
    out.push(b);
  }
  return { rows: out, weekly: size > 1 };
}

const dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** A bar chart; each bar is a stack of `series` ([key, label, color, value(row)]). */
function barChart(rows, series, { label, weekly, w = 720, hgt = 220, tipLabel = null, tickLabel = null }) {
  const padX = 8, padTop = 16, padBottom = 24;
  const totals = rows.map((r) => series.reduce((a, s) => a + s[3](r), 0));
  const max = Math.max(4, ...totals);
  const mag = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / mag) * mag;
  const plotH = hgt - padTop - padBottom;
  const step = (w - padX * 2) / rows.length;
  const bw = Math.max(2, Math.min(28, step * 0.66));
  const y = (v) => padTop + plotH - (v / top) * plotH;
  const grid = [0, 0.5, 1]
    .map((f) => `<line class="grid" x1="${padX}" x2="${w - padX}" y1="${y(top * f)}" y2="${y(top * f)}"/>
      <text class="tick" x="${w - padX}" y="${y(top * f) - 4}" text-anchor="end">${num(top * f)}</text>`)
    .join('');
  const bars = rows
    .map((r, i) => {
      const x = padX + i * step + (step - bw) / 2;
      let acc = 0;
      const vals = series.map((s) => s[3](r));
      const lastIdx = vals.reduce((li, v, k) => (v ? k : li), -1);
      const segs = series
        .map((s, k) => {
          const v = vals[k];
          if (!v) return '';
          const y0 = y(acc), y1 = y(acc + v);
          acc += v;
          const gap = k === lastIdx ? 0 : 1.5;
          const hh = Math.max(1, y0 - y1 - gap);
          return k === lastIdx
            ? `<path d="M${x},${y0} V${y1 + Math.min(3, hh)} q0,-3 3,-3 H${x + bw - 3} q3,0 3,3 V${y0} Z" fill="${s[2]}"/>`
            : `<rect x="${x}" y="${y0 - hh}" width="${bw}" height="${hh}" fill="${s[2]}"/>`;
        })
        .join('');
      const when = tipLabel ? tipLabel(r) : weekly ? `שבוע ${dm(r.date)}–${dm(r.end)}` : dm(r.date);
      const tip = [when, ...series.filter((s, k) => vals[k] || series.length === 1).map((s, k) => `${s[1]}: ${num(s[3](r))}`)].join('\n');
      return `<g class="pf-bar"><title>${h(tip)}</title><rect class="hit" x="${padX + i * step}" y="${padTop}" width="${step}" height="${plotH}"/>${segs}</g>`;
    })
    .join('');
  const ticks = [0, Math.floor(rows.length / 2), rows.length - 1]
    .map((i, k) => `<text class="tick" x="${padX + i * step + step / 2}" y="${hgt - 6}" text-anchor="${['start', 'middle', 'end'][k]}">${tickLabel ? tickLabel(rows[i]) : dm(rows[i].date)}</text>`)
    .join('');
  return `<svg viewBox="0 0 ${w} ${hgt}" class="chart pf-chart" role="img" aria-label="${h(label)}" direction="ltr">
    ${grid}<line class="axis" x1="${padX}" x2="${w - padX}" y1="${y(0)}" y2="${y(0)}"/>${bars}${ticks}
  </svg>`;
}

const legend = (series) =>
  `<div class="pf-legend">${series.map((s) => `<span><i style="background:${s[2]}"></i>${h(s[1])}</span>`).join('')}</div>`;

function splitBar(a, b, la, lb) {
  const total = a + b || 1;
  const pa = Math.round((a / total) * 100);
  return `<div class="pf-split"><div class="pf-split-bar"><span style="width:${pa}%"></span></div>
    <div class="pf-split-labels"><span><i class="a"></i>${h(la)} <b>${num(a)}</b> (${pa}%)</span><span><i class="b"></i>${h(lb)} <b>${num(b)}</b> (${100 - pa}%)</span></div></div>`;
}

const RANGES = [[7, '7 ימים'], [30, '30 יום'], [90, '3 חודשים'], [365, 'שנה']];

function filtersBar({ days, locations, locationId, from, to }) {
  return `<form class="pf-filters" method="get" action="/admin/performance">
    <div class="pf-seg">${RANGES.map(([d, l]) => `<a class="${d === days ? 'on' : ''}" href="?days=${d}${locationId ? `&loc=${locationId}` : ''}">${l}</a>`).join('')}</div>
    ${locations.length > 1 ? `<select name="loc" onchange="this.form.submit()"><option value="">כל הסניפים</option>${locations.map((l) => `<option value="${l.id}" ${l.id === locationId ? 'selected' : ''}>${h(l.title)}</option>`).join('')}</select><input type="hidden" name="days" value="${days}">` : ''}
    <span class="muted small">${dm(from)}.${from.slice(0, 4)} – ${dm(to)}.${to.slice(0, 4)} · בהשוואה לתקופה שלפני</span>
  </form>`;
}

/** Views, actions, charts and search terms: the private numbers from the Performance API. */
function metricsBlock({ totals, prev, daily, from, to, keywords, keywordMonths }) {
  const views = viewsOf(totals), actions = actionsOf(totals);
  const rate = views ? (actions / views) * 100 : 0;
  const prevRate = viewsOf(prev) ? (actionsOf(prev) / viewsOf(prev)) * 100 : 0;
  const shown = ACTIONS.filter(([k], i) => i < 3 || totals[k] || prev[k]);
  const kpis = `<div class="kpis pf-kpis">
    ${tile('צפיות בפרופיל', views, viewsOf(prev), '', 'search')}
    ${tile('פעולות של לקוחות', actions, actionsOf(prev), '', 'spark')}
    <div class="kpi pf-kpi"><span class="kpi-label">${icon('chart', 16)}אחוז המרה</span><span class="kpi-value">${rate.toFixed(1)}%</span>
      <span class="kpi-hint">${prevRate ? `<span class="muted">לפני: ${prevRate.toFixed(1)}%</span>` : '<span class="muted">פעולות מתוך צפיות</span>'}</span></div>
  </div>
  <div class="kpis pf-kpis pf-actions">${shown.map(([k, l, ic]) => tile(l, totals[k], prev[k], '', ic)).join('')}</div>`;

  const { rows, weekly } = buckets(daily, from, to);
  const actSeries = SERIES.map(([k, l, c]) => [k, l, c, k === 'OTHER' ? (r) => sum(r, ACTIONS.slice(3).map((a) => a[0])) : (r) => r[k] || 0]);
  const usedSeries = actSeries.filter((x) => rows.some((r) => x[3](r)));
  const charts = `<div class="dash-grid pf-grid">
    <section class="card"><h3>פעולות של לקוחות ${weekly ? '<small class="muted">(לפי שבוע)</small>' : ''}</h3>
      ${legend(usedSeries.length ? usedSeries : actSeries.slice(0, 3))}
      ${barChart(rows, usedSeries.length ? usedSeries : actSeries.slice(0, 1), { label: 'פעולות של לקוחות לאורך זמן', weekly })}
    </section>
    <section class="card"><h3>צפיות בפרופיל ${weekly ? '<small class="muted">(לפי שבוע)</small>' : ''}</h3>
      ${barChart(rows, [['V', 'צפיות', '#5b3df5', (r) => viewsOf(r)]], { label: 'צפיות בפרופיל לאורך זמן', weekly, w: 440, hgt: 200 })}
      <h4 class="pf-sub">איפה ראו אתכם</h4>
      ${splitBar(sum(totals, MAPS), sum(totals, SEARCH), 'מפות גוגל', 'חיפוש בגוגל')}
      <h4 class="pf-sub">מאיזה מכשיר</h4>
      ${splitBar(sum(totals, MOBILE), views - sum(totals, MOBILE), 'טלפון', 'מחשב')}
    </section>
  </div>`;

  const kw = keywords.length
    ? `<section class="card"><h3>מה חיפשו כשמצאו אתכם</h3>
      <p class="muted small">החיפושים בגוגל שבהם הפרופיל הופיע, ${keywordMonths}. גוגל לא מוסרת מספר מדויק לחיפושים קטנים, ואז מופיע "פחות מ-".</p>
      <div class="table-wrap"><table class="table pf-kw"><thead><tr><th>חיפוש</th><th>צפיות</th><th></th></tr></thead><tbody>
      ${(() => {
        const max = Math.max(1, ...keywords.map((k) => k.value || k.threshold || 0));
        return keywords
          .map((k) => {
            const v = k.value || 0;
            const label = v ? num(v) : `פחות מ-${num(k.threshold)}`;
            return `<tr><td>${h(k.keyword)}</td><td class="nowrap">${label}</td><td class="pf-kw-bar"><span style="width:${Math.max(2, ((v || k.threshold || 0) / max) * 100)}%" class="${v ? '' : 'est'}"></span></td></tr>`;
          })
          .join('');
      })()}
      </tbody></table></div></section>`
    : '';
  return kpis + charts + kw;
}

/** A tile whose change is shown in points or as a difference, not a percent. */
function diffTile(label, value, before, { ic = '', fmt = (v) => v, unit = '', better = 'up', hint = '' } = {}) {
  let chg = '';
  if (value != null && before != null) {
    const d = Math.round((value - before) * 10) / 10;
    const good = better === 'up' ? d > 0 : d < 0;
    chg = d ? `<span class="pf-chg ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}${unit}</span>` : '<span class="pf-chg flat">ללא שינוי</span>';
  }
  return `<div class="kpi pf-kpi">
    <span class="kpi-label">${ic ? icon(ic, 16) : ''}${h(label)}</span>
    <span class="kpi-value">${value == null ? '—' : `${fmt(value)}${unit}`}</span>
    <span class="kpi-hint">${chg}${hint ? ` <span class="muted">${h(hint)}</span>` : ''}</span>
  </div>`;
}

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const monthName = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/** Reputation on Google: what the public profile shows, available without the owner's login. */
function publicBlock(pub, { days }) {
  if (!pub) {
    return `<section class="card pf-empty"><h3>עוד לא עוקבים אחרי העסק בגוגל</h3>
      <p class="muted">מדביקים את הקישור לעסק בגוגל מפות בעמוד "ביקורות בגוגל", ומאותו רגע רואים כאן את הדירוג, הביקורות והמגמות.</p>
      <a class="btn primary" href="/admin/google">הוספת העסק</a></section>`;
  }
  const one = (v) => v.toFixed(1);
  const range = RANGES.find((r) => r[0] === days)?.[1] || `${days} ימים`;
  const tiles = [
    diffTile('דירוג בגוגל', pub.total ? pub.rating : null, pub.ratingBefore, { ic: 'star', fmt: one, hint: pub.ratingBefore == null ? `${num(pub.total)} ביקורות` : '' }),
    diffTile('סה״כ ביקורות', pub.total || null, pub.totalBefore, { ic: 'chat', fmt: num }),
    diffTile(`ביקורות חדשות (${range})`, pub.newReviews, pub.prevNew, { ic: 'spark', fmt: num, hint: pub.newReviews ? `ממוצע ${one(pub.avgPeriod)}★` : '' }),
    diffTile('אחוז מענה לביקורות', pub.replyRate == null ? null : Math.round(pub.replyRate), pub.prevReplyRate == null ? null : Math.round(pub.prevReplyRate), { ic: 'check', unit: '%', hint: pub.unanswered ? `${pub.unanswered} ממתינות לתשובה` : '' }),
    pub.health != null ? diffTile('בריאות הפרופיל', pub.health, pub.healthBefore, { ic: 'shield', hint: 'מתוך 100' }) : '',
    pub.rank != null ? diffTile('מיקום ממוצע במפות', Math.round(pub.rank * 10) / 10, pub.rankBefore == null ? null : Math.round(pub.rankBefore * 10) / 10, { ic: 'pin', better: 'down', hint: `${pub.rankKeywords} חיפושים` }) : '',
  ].filter(Boolean);

  // The last 12 months, empty months included.
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(Number(pub.since.slice(0, 4)), Number(pub.since.slice(5, 7)) - 1 + i, 1));
    const m = d.toISOString().slice(0, 7);
    const row = pub.months.find((x) => x.month === m) || { n: 0, neg: 0 };
    rows.push({ date: `${m}-01`, month: m, pos: row.n - (row.neg || 0), neg: row.neg || 0, avg: row.avg });
  }
  const series = [
    ['pos', 'חיוביות (4–5★)', '#5b3df5', (r) => r.pos],
    ['neg', 'שליליות (1–3★)', '#d6409f', (r) => r.neg],
  ];
  const dist = pub.distribution;
  const distTotal = dist.reduce((a, b) => a + b, 0);
  const missing = [pub.health == null && '<a href="/admin/profile">בריאות הפרופיל</a>', pub.rank == null && '<a href="/admin/rankings">מעקב מיקום במפות</a>'].filter(Boolean);
  return `<h2 class="pf-section">${icon('star', 20)} מוניטין בגוגל</h2>
    <div class="kpis pf-kpis pf-pub">${tiles.join('')}</div>
    <div class="dash-grid pf-grid">
      <section class="card"><h3>ביקורות חדשות בכל חודש</h3>
        ${legend(series)}
        ${barChart(rows, series, { label: 'ביקורות חדשות בגוגל בכל חודש', tipLabel: (r) => `${monthName(r.month)}${r.avg ? ` · ממוצע ${one(r.avg)}★` : ''}`, tickLabel: (r) => monthName(r.month) })}
      </section>
      <section class="card"><h3>הדירוגים בתקופה</h3>
        ${
          distTotal
            ? [5, 4, 3, 2, 1]
                .map((n) => `<div class="dist-row"><span class="dist-label">${n}★</span><span class="dist-bar"><span style="width:${(dist[n - 1] / distTotal) * 100}%" class="${n >= 4 ? 'good' : n === 3 ? 'mid' : 'bad'}"></span></span><span class="muted small">${dist[n - 1]}</span></div>`)
                .join('')
            : '<p class="muted">לא נכנסו ביקורות חדשות בתקופה הזו.</p>'
        }
        ${missing.length ? `<p class="muted small pf-tip">אפשר להוסיף לכאן גם ${missing.join(' ו')}.</p>` : ''}
      </section>
    </div>`;
}

/** Plausible numbers for the locked preview. */
function sampleData(from, to) {
  const daily = new Map();
  let seed = 11;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const totals = {}, prev = {};
  for (let t = Date.parse(`${from}T00:00:00Z`), i = 0; t <= Date.parse(`${to}T00:00:00Z`); t += 864e5, i++) {
    const d = new Date(t).toISOString().slice(0, 10);
    const wk = [0.8, 1, 1, 1.1, 1.3, 1.5, 0.6][new Date(t).getUTCDay()];
    const row = { date: d };
    for (const [m, base] of [['BUSINESS_IMPRESSIONS_MOBILE_MAPS', 60], ['BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 35], ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 10], ['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 15], ['CALL_CLICKS', 4], ['BUSINESS_DIRECTION_REQUESTS', 6], ['WEBSITE_CLICKS', 3], ['BUSINESS_CONVERSATIONS', 1]]) {
      row[m] = Math.round(base * wk * (0.6 + rnd() * 0.8));
      totals[m] = (totals[m] || 0) + row[m];
      prev[m] = (prev[m] || 0) + Math.round(row[m] * (0.85 + rnd() * 0.2));
    }
    daily.set(d, row);
  }
  const keywords = [['שם העסק שלכם', 640], ['התחום שלכם + העיר', 310], ['התחום שלכם ליד', 190], ['שירות מומלץ באזור', 120]].map(([keyword, value]) => ({ keyword, value, threshold: 0 }));
  return { totals, prev, daily, keywords, keywordMonths: 'בחודש האחרון' };
}

export function performanceView({
  connected, locations, locationId, days, from, to, totals, prev, daily, keywords, keywordMonths, lastSync, errors,
  pub = null, googleReady = true, canConnect = false, csrf, canRefresh, refreshing, notice = '',
}) {
  const has = daily.size > 0;
  const head = `<div class="page-head"><h1>${icon('chart', 24)} ביצועי הפרופיל בגוגל</h1>${
    connected && canRefresh
      ? `<form method="post" action="/admin/performance/refresh"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn" ${refreshing ? 'disabled' : ''}>${refreshing ? 'מעדכן…' : 'עדכון עכשיו'}</button></form>`
      : ''
  }</div>
  <p class="page-intro">כמה אנשים ראו את העסק בגוגל ומה עשו אחר כך, לצד הדירוג, הביקורות והמיקום במפות. הכול במקום אחד, ומתעדכן לבד.</p>
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}`;
  const filters = filtersBar({ days, locations: has ? locations : [], locationId, from, to });

  if (has) {
    return `${head}${filters}${metricsBlock({ totals, prev, daily, from, to, keywords, keywordMonths })}
      ${publicBlock(pub, { days })}
      <p class="muted small">עודכן לאחרונה: ${lastSync ? h(formatDate(`${lastSync.replace(' ', 'T')}Z`)) : '—'}. גוגל מעדכנת את נתוני הצפיות והפעולות באיחור של כמה ימים, ולכן הימים האחרונים עוד לא מופיעים.</p>`;
  }

  // No private numbers yet: what's already known, then a preview of what connecting adds.
  const why = connected
    ? errors.length
      ? `<p>החשבון מחובר, אבל גוגל עוד לא מוסרת את הנתונים: <span class="muted">${h(errors[0])}</span>${/quota|403|429|PERMISSION|disabled|not been used/i.test(errors[0]) ? '<br>כנראה שהגישה של GoFive ל-API של גוגל עוד ממתינה לאישור. ננסה שוב לבד, ולא צריך לעשות כלום.' : ''}</p>`
      : `<p>החשבון מחובר. הטעינה הראשונה מגוגל לוקחת עד יום.${lastSync ? '' : ' אפשר גם ללחוץ "עדכון עכשיו".'}</p>`
    : `<p>צפיות, שיחות, בקשות הגעה וכניסות לאתר גוגל מוסרת רק לבעלים של הפרופיל. מחברים פעם אחת את חשבון הגוגל שמנהל את העסק, ו-18 החודשים האחרונים נטענים לבד.</p>
       ${googleReady && canConnect ? '<a class="btn primary" href="/admin/google">חיבור לגוגל</a>' : googleReady ? '<p class="muted small">בעלי העסק או מנהל יכולים לחבר.</p>' : '<p class="muted small">החיבור לגוגל יופעל בקרוב.</p>'}`;
  const s = sampleData(from, to);
  return `${head}${filters}
    ${publicBlock(pub, { days })}
    <h2 class="pf-section">${icon('search', 20)} צפיות ופעולות של לקוחות</h2>
    <section class="pf-preview">
      <div class="pf-preview-body" aria-hidden="true" inert>${metricsBlock({ ...s, from, to })}</div>
      <div class="pf-lock"><div class="card pf-lock-card">
        <span class="pf-lock-icon">${icon('shield', 22)}</span>
        <h3>${connected ? 'הנתונים בדרך' : 'כך זה ייראה אחרי החיבור לגוגל'}</h3>
        ${why}
        <span class="badge st-closed">התצוגה מאחור היא דוגמה</span>
      </div></div>
    </section>`;
}

/** A small card for the dashboard: the last 30 days. */
export function performanceCard(totals, prev) {
  const views = viewsOf(totals);
  if (!views && !actionsOf(totals)) return '';
  const item = (label, v, p) => `<div><span class="muted small">${h(label)}</span><b>${num(v)}</b>${change(v, p)}</div>`;
  return `<section class="card pf-card"><div class="pf-card-head"><h3>${icon('chart', 18)} הפרופיל בגוגל ב-30 הימים האחרונים</h3><a href="/admin/performance">לכל הנתונים ←</a></div>
    <div class="pf-card-row">
      ${item('צפיות', views, viewsOf(prev))}
      ${item('שיחות', totals.CALL_CLICKS, prev.CALL_CLICKS)}
      ${item('בקשות הגעה', totals.BUSINESS_DIRECTION_REQUESTS, prev.BUSINESS_DIRECTION_REQUESTS)}
      ${item('כניסות לאתר', totals.WEBSITE_CLICKS, prev.WEBSITE_CLICKS)}
    </div></section>`;
}
