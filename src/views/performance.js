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
function barChart(rows, series, { label, weekly, w = 720, hgt = 220 }) {
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
      const when = weekly ? `שבוע ${dm(r.date)}–${dm(r.end)}` : dm(r.date);
      const tip = [when, ...series.filter((s, k) => vals[k] || series.length === 1).map((s, k) => `${s[1]}: ${num(s[3](r))}`)].join('\n');
      return `<g class="pf-bar"><title>${h(tip)}</title><rect class="hit" x="${padX + i * step}" y="${padTop}" width="${step}" height="${plotH}"/>${segs}</g>`;
    })
    .join('');
  const ticks = [0, Math.floor(rows.length / 2), rows.length - 1]
    .map((i, k) => `<text class="tick" x="${padX + i * step + step / 2}" y="${hgt - 6}" text-anchor="${['start', 'middle', 'end'][k]}">${dm(rows[i].date)}</text>`)
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

export function performanceView({ connected, locations, locationId, days, from, to, totals, prev, daily, keywords, keywordMonths, lastSync, errors, csrf, canRefresh, refreshing, notice = '' }) {
  const head = `<div class="page-head"><h1>${icon('chart', 24)} ביצועי הפרופיל בגוגל</h1>${
    connected && canRefresh
      ? `<form method="post" action="/admin/performance/refresh"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn" ${refreshing ? 'disabled' : ''}>${refreshing ? 'מעדכן…' : 'עדכון עכשיו'}</button></form>`
      : ''
  }</div>
  <p class="page-intro">כמה אנשים ראו את העסק בחיפוש ובמפות של גוגל, ומה עשו אחר כך: התקשרו, ביקשו הגעה, נכנסו לאתר או שלחו הודעה. הנתונים מגיעים ישירות מגוגל ומתעדכנים פעם ביום.</p>
  ${notice ? `<div class="flash">${h(notice)}</div>` : ''}`;

  if (!connected) {
    return `${head}<section class="card pf-empty">
      <h3>צריך לחבר את פרופיל העסק בגוגל</h3>
      <p>את נתוני הצפיות, השיחות, בקשות ההגעה והכניסות לאתר גוגל מוסרת רק לבעלים של הפרופיל. מחברים פעם אחת את חשבון הגוגל שמנהל את העסק, והנתונים של 18 החודשים האחרונים נטענים אוטומטית.</p>
      <a class="btn primary" href="/admin/google">חיבור לגוגל</a>
    </section>`;
  }

  const has = daily.size > 0;
  const errBox = errors.length
    ? `<div class="warn">גוגל עוד לא מסרה נתונים: ${h(errors[0])}${/quota|403|PERMISSION|disabled|not been used/i.test(errors[0]) ? '<br><span class="small">ייתכן שהגישה של המערכת ל-API של גוגל עוד לא אושרה. ננסה שוב אוטומטית.</span>' : ''}</div>`
    : '';
  if (!has) {
    return `${head}${errBox}<section class="card pf-empty"><h3>הנתונים בדרך</h3><p class="muted">החשבון מחובר. הטעינה הראשונה של הנתונים מגוגל לוקחת עד יום.${lastSync ? '' : ' אפשר גם ללחוץ "עדכון עכשיו".'}</p></section>`;
  }

  const filters = `<form class="pf-filters" method="get" action="/admin/performance">
    <div class="pf-seg">${RANGES.map(([d, l]) => `<a class="${d === days ? 'on' : ''}" href="?days=${d}${locationId ? `&loc=${locationId}` : ''}">${l}</a>`).join('')}</div>
    ${locations.length > 1 ? `<select name="loc" onchange="this.form.submit()"><option value="">כל הסניפים</option>${locations.map((l) => `<option value="${l.id}" ${l.id === locationId ? 'selected' : ''}>${h(l.title)}</option>`).join('')}</select><input type="hidden" name="days" value="${days}">` : ''}
    <span class="muted small">${dm(from)}.${from.slice(0, 4)} – ${dm(to)}.${to.slice(0, 4)} · בהשוואה לתקופה שלפני</span>
  </form>`;

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
  <div class="kpis pf-kpis pf-actions">${shown.map(([k, l, ic, hint]) => tile(l, totals[k], prev[k], '', ic)).join('')}</div>`;

  const { rows, weekly } = buckets(daily, from, to);
  const actSeries = SERIES.map(([k, l, c]) => [k, l, c, k === 'OTHER' ? (r) => sum(r, ACTIONS.slice(3).map((a) => a[0])) : (r) => r[k] || 0]);
  const usedSeries = actSeries.filter((s) => rows.some((r) => s[3](r)));
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

  return `${head}${errBox}${filters}${kpis}${charts}${kw}
    <p class="muted small">עודכן לאחרונה: ${lastSync ? h(formatDate(`${lastSync.replace(' ', 'T')}Z`)) : '—'}. גוגל מעדכנת את הנתונים באיחור של כמה ימים, ולכן הימים האחרונים עוד לא מופיעים.</p>`;
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
