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


/** The dashboard's Google card: what customers did on the profile, or a short preview until the numbers arrive. */
export function profileCard({ connected, metrics, lastSync, errors, googleReady, canConnect, canRefresh, refreshing, csrf, refreshed = false }) {
  const has = metrics.daily.size > 0;
  const refresh = connected && canRefresh
    ? `<form method="post" action="/admin/performance/refresh"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link small" ${refreshing ? 'disabled' : ''}>${refreshing ? 'מעדכן…' : 'עדכון מגוגל'}</button></form>`
    : '';
  const actSeries = SERIES.map(([k, l, c]) => [k, l, c, k === 'OTHER' ? (r) => sum(r, ACTIONS.slice(3).map((a) => a[0])) : (r) => r[k] || 0]);
  const chartOf = (m) => {
    const { rows, weekly } = buckets(m.daily, m.from, m.to);
    const used = actSeries.filter((x) => rows.some((r) => x[3](r)));
    return { weekly, html: `${legend(used.length ? used : actSeries.slice(0, 3))}${barChart(rows, used.length ? used : actSeries.slice(0, 1), { label: 'פעולות של לקוחות בפרופיל לאורך זמן', weekly, hgt: 200 })}` };
  };

  if (has) {
    const t = metrics.totals;
    const views = viewsOf(t);
    const chart = chartOf(metrics);
    const kw = metrics.keywords.slice(0, 5);
    return `<section class="card pf-dash" id="google">
      <div class="card-head"><h3>${icon('chart', 18)} פעולות של לקוחות בפרופיל בגוגל ${chart.weekly ? '<small class="muted">(לפי שבוע)</small>' : ''}</h3>${refresh}</div>
      ${refreshed ? '<div class="flash">העדכון מגוגל התחיל. הנתונים יופיעו תוך דקה.</div>' : ''}
      ${chart.html}
      <div class="pf-dash-foot">
        <div><h4 class="pf-sub">איפה ראו אתכם</h4>${splitBar(sum(t, MAPS), sum(t, SEARCH), 'מפות', 'חיפוש')}
          <h4 class="pf-sub">מאיזה מכשיר</h4>${splitBar(sum(t, MOBILE), views - sum(t, MOBILE), 'טלפון', 'מחשב')}</div>
        ${
          kw.length
            ? `<div><h4 class="pf-sub">מה חיפשו כשמצאו אתכם</h4><ol class="pf-kw-list">${kw
                .map((k) => `<li><span>${h(k.keyword)}</span><b>${k.value ? num(k.value) : `&lt;${num(k.threshold)}`}</b></li>`)
                .join('')}</ol></div>`
            : ''
        }
      </div>
      <p class="muted small">עודכן מגוגל ${lastSync ? h(formatDate(`${lastSync.replace(' ', 'T')}Z`)) : '—'}. גוגל מוסרת את הנתונים באיחור של כמה ימים.</p>
    </section>`;
  }

  const why = connected
    ? errors.length && /quota|403|429|PERMISSION|disabled|not been used/i.test(errors[0])
      ? 'החשבון מחובר. הגישה של GoFive לנתונים האלה עוד ממתינה לאישור של גוגל, והם ייטענו לבד ברגע שיאושר.'
      : 'החשבון מחובר. הטעינה הראשונה מגוגל לוקחת עד יום.'
    : 'צפיות, שיחות, בקשות הגעה וכניסות לאתר מגיעים ישירות מגוגל, אחרי חיבור חד-פעמי של חשבון הגוגל שמנהל את העסק.';
  const sample = sampleData(metrics.from, metrics.to);
  return `<section class="card pf-dash pf-dash-locked" id="google">
    <div class="card-head"><h3>${icon('chart', 18)} פעולות של לקוחות בפרופיל בגוגל</h3>${refresh}</div>
    <div class="pf-mini-preview" aria-hidden="true" inert>${chartOf({ ...sample, from: metrics.from, to: metrics.to }).html}</div>
    <div class="pf-mini-lock">
      <p>${why}</p>
      ${!connected && googleReady && canConnect ? '<a class="btn primary" href="/admin/google">חיבור לגוגל</a>' : ''}
      <span class="muted small">הגרף מאחור הוא דוגמה</span>
    </div>
  </section>`;
}
