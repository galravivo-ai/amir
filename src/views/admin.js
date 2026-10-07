import { EDITABLE_TEXT_KEYS, LANGUAGES, PUBLIC_TEXTS } from '../i18n.js';
import { AUDIENCES, QUESTION_TYPES, STATUSES } from '../store.js';
import { asset, DEFAULT_INVITE_TEMPLATE, formatDate, h, inviteMessage, logoSrc, safeColor, waLink } from '../util.js';
import { parseJson } from '../db.js';
import { icon } from './icons.js';
import { performanceCard } from './performance.js';
import { TEMPLATES } from '../templates.js';
import { TOPICS } from '../ai.js';
import { PRESETS } from '../period.js';
import { inkOn, POSTER_SIZES, POSTER_STYLES } from '../poster.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;
const pct = (x) => `${Math.round(x * 100)}%`;
const stars = (n) => `<span class="stars-sm">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

// ---------------------------------------------------------------- dashboard

function kpi(label, value, hint = '', trend = '') {
  return `<div class="kpi"><div class="kpi-label">${h(label)}</div><div class="kpi-value">${value}</div>${
    hint ? `<div class="kpi-hint ${trend}">${h(hint)}</div>` : ''
  }</div>`;
}

/** Stacked daily bars: satisfied (purple) under unsatisfied (orange). */
function dailyChart(daily) {
  const w = 720;
  const hgt = 220;
  const padX = 8;
  const padTop = 16;
  const padBottom = 26;
  const max = Math.max(4, ...daily.map((d) => d.responses));
  const top = Math.ceil(max / 4) * 4;
  const plotH = hgt - padTop - padBottom;
  const step = (w - padX * 2) / daily.length;
  const bw = Math.max(3, step * 0.62);
  const y = (v) => padTop + plotH - (v / top) * plotH;
  const grid = [0, 0.5, 1]
    .map((f) => `<line class="grid" x1="${padX}" x2="${w - padX}" y1="${y(top * f)}" y2="${y(top * f)}"/>
      <text class="tick" x="${w - padX}" y="${y(top * f) - 4}" text-anchor="end">${Math.round(top * f)}</text>`)
    .join('');
  const bars = daily
    .map((d, i) => {
      const x = padX + i * step + (step - bw) / 2;
      const pos = d.responses - d.negative;
      const r = Math.min(4, bw / 2);
      const parts = [`${pos} מרוצים`, `${d.negative} לא מרוצים`];
      if (d.google) parts.push(`מתוכם ${d.google} בגוגל`);
      if (d.scans) parts.push(`${d.scans} סריקות`);
      return `<g><title>${h(d.date)}: ${parts.join(', ')}</title>
        ${pos ? `<rect class="bar-pos" x="${x}" y="${y(pos)}" width="${bw}" height="${y(0) - y(pos)}" rx="${r}"/>` : ''}
        ${d.negative ? `<rect class="bar-neg" x="${x}" y="${y(d.responses)}" width="${bw}" height="${Math.max(1, y(pos) - y(d.responses) - (pos ? 2 : 0))}" rx="${r}"/>` : ''}
      </g>`;
    })
    .join('');
  const label = (d) => d.date.slice(8, 10) + '.' + d.date.slice(5, 7);
  const ticks = [0, Math.floor(daily.length / 2), daily.length - 1]
    .map((i, k) => `<text class="tick" x="${padX + i * step + step / 2}" y="${hgt - 6}" text-anchor="${['start', 'middle', 'end'][k]}">${label(daily[i])}</text>`)
    .join('');
  return `<svg viewBox="0 0 ${w} ${hgt}" class="chart" role="img" aria-label="דירוגים לפי יום" direction="ltr">
    ${grid}
    <line class="axis" x1="${padX}" x2="${w - padX}" y1="${y(0)}" y2="${y(0)}"/>
    ${bars}${ticks}
  </svg>`;
}

function distribution(dist) {
  const total = dist.reduce((a, b) => a + b, 0) || 1;
  return [5, 4, 3, 2, 1]
    .map(
      (n) => `<div class="dist-row"><span class="dist-label">${n}★</span>
        <span class="dist-bar"><span style="width:${(dist[n - 1] / total) * 100}%" class="${n >= 4 ? 'good' : n === 3 ? 'mid' : 'bad'}"></span></span>
        <span class="dist-n">${dist[n - 1]}</span></div>`,
    )
    .join('');
}

function optionBreakdown(optionCounts) {
  const entries = Object.entries(optionCounts);
  if (!entries.length) return '<p class="muted">אין עדיין נתונים.</p>';
  return entries
    .map(([label, counts]) => {
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const max = sorted[0]?.[1] || 1;
      return `<h4>${h(label)}</h4>${sorted
        .map(
          ([o, n]) => `<div class="dist-row"><span class="dist-label wide">${h(o)}</span>
            <span class="dist-bar"><span style="width:${(n / max) * 100}%"></span></span><span class="dist-n">${n}</span></div>`,
        )
        .join('')}`;
    })
    .join('');
}

function onboardingCard(o, csrf) {
  const pctDone = Math.round((o.done / o.total) * 100);
  const next = o.steps.find((s) => !s.done && !s.optional) || o.steps.find((s) => !s.done);
  return `<section class="card onboarding ob-compact">
    <div class="ob-row">
      <div class="ob-ring" style="--p:${pctDone}" role="img" aria-label="${o.done} מתוך ${o.total} צעדים"><span>${o.done}/${o.total}</span></div>
      <div class="ob-main">
        <b>צעדים ראשונים</b>
        ${next ? `<span class="muted small">הצעד הבא: ${h(next.label)}</span>` : '<span class="muted small">כמעט סיימתם</span>'}
      </div>
      ${next ? `<a class="btn accent" href="${h(next.href)}">להתחיל</a>` : ''}
      <form method="post" action="/admin/onboarding/dismiss">
        <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link small">הסתרה</button>
      </form>
    </div>
    <details class="ob-details"><summary class="small">כל הצעדים</summary>
      <ol class="ob-steps">
        ${o.steps
          .map(
            (s) => `<li class="${s.done ? 'done' : ''}">
              <span class="ob-check">${s.done ? icon('check', 14) : ''}</span>
              ${s.done ? `<span>${h(s.label)}</span>` : `<a href="${h(s.href)}">${h(s.label)}</a>`}
              ${s.optional ? '<span class="muted small">(לא חובה)</span>' : ''}
            </li>`,
          )
          .join('')}
      </ol>
    </details>
  </section>`;
}


function greeting(name) {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hour12: false }));
  const part = hour >= 5 && hour < 12 ? 'בוקר טוב' : hour < 17 && hour >= 12 ? 'צהריים טובים' : hour >= 17 && hour < 22 ? 'ערב טוב' : 'לילה טוב';
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

const platformLabel = (p) => (p === 'google' ? 'גוגל' : p);

// Comparing against a handful of ratings is noise ("+1200%"), so trends need a real base.
const MIN_TREND_BASE = 5;

function trendPct(now, before) {
  if (before < MIN_TREND_BASE) return ['', ''];
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return ['ללא שינוי מהתקופה הקודמת', ''];
  return [`${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% מהתקופה הקודמת`, change > 0 ? 'up' : 'down'];
}

function trendDiff(now, before, baseCount) {
  if (!before || !now || baseCount < MIN_TREND_BASE) return ['', ''];
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return ['ללא שינוי מהתקופה הקודמת', ''];
  return [`${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(1)} מהתקופה הקודמת`, diff > 0 ? 'up' : 'down'];
}

const G_MARK = `<svg class="src-g" width="14" height="14" viewBox="0 0 48 48" aria-label="גוגל" role="img"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

const WA_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.5 4 3.5 1.5.6 2.1.7 2.8.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z"/></svg>';

/** Send a customer a personal survey link on WhatsApp, from the dashboard. */
function sendDialog(campaigns, csrf, template, waAuto = null) {
  return `<dialog id="wa-send" class="wa-dialog" aria-labelledby="wa-send-title">
    <form method="post" action="/admin/send" target="_blank" class="stack"
      onsubmit="var f=this;setTimeout(function(){f.reset();f.closest('dialog').close();var t=document.getElementById('wa-sent');t.hidden=false;setTimeout(function(){t.hidden=true},5000)},300)">
      <div class="wa-head"><h3 id="wa-send-title">${WA_ICON} שליחת בקשת דירוג בוואטסאפ</h3>
        <button type="button" class="icon-btn" aria-label="סגירה" onclick="this.closest('dialog').close()">✕</button></div>
      <p class="muted small">${
        waAuto
          ? `כותבים את הטלפון של הלקוח, וההודעה עם קישור אישי לסקר נשלחת אליו בוואטסאפ ישר מהמערכת. נשארו ${waAuto.left} מתוך ${waAuto.quota} הודעות החודש.`
          : 'כותבים את הטלפון של הלקוח, ונפתח וואטסאפ עם הודעה מוכנה וקישור אישי לסקר. נשאר רק ללחוץ "שליחה".'
      }</p>
      ${csrfField(csrf)}
      <label>טלפון של הלקוח<input name="phone" type="tel" inputmode="tel" required minlength="9" maxlength="20" placeholder="050-1234567" dir="ltr" autocomplete="off"></label>
      <label>שם הלקוח (לא חובה)<input name="customer_name" maxlength="80" autocomplete="off"></label>
      ${
        campaigns.length > 1
          ? `<label>קמפיין<select name="campaign">${campaigns.map((c) => `<option value="${c.id}">${h(c.name)}</option>`).join('')}</select></label>`
          : `<input type="hidden" name="campaign" value="${campaigns[0].id}">`
      }
      <details class="wa-msg"><summary>עריכת ההודעה</summary>
        <textarea name="message" rows="4" maxlength="600">${h(template)}</textarea>
        <p class="muted small">{שם}, {עסק} ו-{קישור} יוחלפו לבד. לשינוי קבוע של הנוסח: <a href="/admin/business#invite-message">הגדרות</a>.${
          waAuto ? ' הנוסח הזה הוא לשליחה מהטלפון שלכם. בשליחה האוטומטית נשלח הנוסח הקבוע שאושר בוואטסאפ.' : ''
        }</p>
      </details>
      ${
        waAuto
          ? `<div class="row compact">
              <button class="btn wa" name="via" value="auto" formtarget="_self" ${waAuto.left ? '' : 'disabled'}>${WA_ICON} ${waAuto.left ? 'שליחה אוטומטית' : 'המכסה החודשית נוצלה'}</button>
              <button class="btn" name="via" value="manual">פתיחה בוואטסאפ שלי</button></div>`
          : `<button class="btn wa">${WA_ICON} פתיחה בוואטסאפ</button>`
      }
    </form>
  </dialog>
  <div id="wa-sent" class="toast" role="status" hidden>וואטסאפ נפתח בחלון חדש. אפשר לשלוח ללקוח הבא.</div>`;
}

/** This week's three things to do, each with a link and a "done" button. */
function tasksCard(tasks, csrf) {
  if (!tasks.length) return '';
  return `<section class="card tasks-card" id="tasks">
    <h3>${icon('check', 20)} המשימות השבוע</h3>
    <ol class="tasks">${tasks
      .map(
        (t) => `<li>
          <div class="task-body"><b>${h(t.title)}</b><span class="muted small">${h(t.why)}</span></div>
          <div class="task-actions">
            ${
              t.action === 'wa'
                ? `<button type="button" class="btn small-btn" onclick="var d=document.getElementById('wa-send');if(d)d.showModal();else location.href='/admin/campaigns'">לשליחה</button>`
                : `<a class="btn small-btn" href="${h(t.href)}">לביצוע</a>`
            }
            <form method="post" action="/admin/tasks/${encodeURIComponent(t.key)}/done">${csrfField(csrf)}<button class="btn-link" title="יוסתר עד השבוע הבא">בוצע ✓</button></form>
          </div>
        </li>`,
      )
      .join('')}</ol>
  </section>`;
}

/** One row in a mixed list of survey answers and Google reviews. */
function feedRow(item) {
  const name = item.name || 'לקוח/ה';
  return `<a href="${item.href}">
    <span class="w-avatar">${h(name.trim().charAt(0))}</span>
    <span class="w-body">
      <span class="w-name">${h(name)} ${stars(item.rating)} <span class="src-tag">${item.google ? `${G_MARK} גוגל` : 'סקר'}</span></span>
      <span class="w-text">${h(item.text) || '<span class="muted">בלי טקסט</span>'}</span>
      <span class="w-when muted small">${h(formatDate(item.when))}</span>
    </span>
    ${item.pill || ''}
  </a>`;
}

const fromResponse = (r) => ({
  name: r.customer_name,
  rating: r.rating,
  text: r.comment,
  when: r.created_at,
  sortKey: new Date(`${String(r.created_at).replace(' ', 'T')}Z`).getTime() || 0,
  href: `/admin/responses/${r.id}`,
  pill: r.sentiment === 'negative' ? (r.overdue ? '<span class="badge st-late">באיחור</span>' : statusBadge(r.status)) : '',
});
const fromReview = (g) => ({
  name: g.reviewer || 'לקוח אנונימי',
  rating: g.rating,
  text: g.comment,
  when: g.create_time,
  sortKey: Date.parse(g.create_time) || 0,
  google: true,
  href: `/admin/google/reviews/${g.id}`,
  pill: g.reply ? '' : '<span class="badge st-new">ממתינה לתשובה</span>',
});

function feed(items, empty) {
  if (!items.length) return `<p class="muted">${empty}</p>`;
  return `<div class="waiting">${items.map(feedRow).join('')}</div>`;
}

export function dashboardView({
  profile = null,
  stats,
  prev,
  campaigns,
  campaignId,
  period,
  business = null,
  waiting,
  topics = [],
  google = null,
  userName,
  quotaWarning = '',
  can = () => true,
  onboarding = null,
  csrf = '',
  sendError = false,
  waAuto = null,
  waResult = null,
  tasks = [],
}) {
  const g = google || { total: 0, count: 0, daily: new Map(), distribution: [0, 0, 0, 0, 0], waiting: [], unanswered: 0 };
  const hasGoogle = g.total > 0 || g.count > 0;
  const checklist =
    onboarding && !onboarding.complete && !onboarding.dismissed && can('manager') ? onboardingCard(onboarding, csrf) : '';
  const presetOptions = Object.entries(PRESETS)
    .map(([k, l]) => `<option value="${k}" ${k === period.key ? 'selected' : ''}>${h(l)}</option>`)
    .join('');
  const filter = `<form method="get" class="filters cover-filters">
      ${
        campaigns.length
          ? `<select name="campaign" aria-label="קמפיין" onchange="this.form.submit()"><option value="">כל הקמפיינים</option>${campaigns
              .map((c) => `<option value="${c.id}" ${c.id === campaignId ? 'selected' : ''}>${h(c.name)}</option>`)
              .join('')}</select>`
          : ''
      }
      <select name="range" aria-label="טווח זמנים" onchange="if(this.value==='custom'){var c=this.form.querySelector('.range-custom');c.hidden=false;c.querySelector('input').focus()}else{this.form.submit()}">${presetOptions}</select>
      <span class="range-custom" ${period.key === 'custom' ? '' : 'hidden'}>
        <label>מ-<input type="date" name="from" value="${h(period.fromDay)}" max="${h(period.todayDay)}" dir="ltr"></label>
        <label>עד<input type="date" name="to" value="${h(period.toDay)}" max="${h(period.todayDay)}" dir="ltr"></label>
        <button class="btn primary">הצגה</button>
      </span>
      <noscript><button class="btn">סינון</button></noscript>
    </form>`;
  // The executive cover: the business's own logo and color, the period and the filters.
  const brand = safeColor(business?.brand_color, '#4b2bd6');
  const logo = logoSrc(business);
  const g0 = google || {};
  const cover = `<header class="dash-cover" style="--cover:${brand}">
      <div class="cover-top">
        <div class="cover-text">
          <span class="cover-greet">${h(greeting(userName))}</span>
          <h1>${h(business?.name || 'לוח בקרה')}</h1>
          <span class="cover-sub">מה הלקוחות אמרו ${h(period.label)}</span>
        </div>
        <span class="cover-logo">${
          logo ? `<img src="${h(logo)}" alt="${h(business?.name || '')}">` : `<span>${h(String(business?.name || '★').trim().charAt(0))}</span>`
        }</span>
      </div>
      <div class="cover-bar">
        ${g0.total ? `<a class="cover-google" href="/admin/google/reviews" title="הדירוג בגוגל"><b>${g0.avg.toFixed(1)}</b><span class="cover-star">★</span><span>${g0.total.toLocaleString('he-IL')} ביקורות בגוגל</span></a>` : ''}
        ${filter}
        ${can('manager') && campaigns.length ? `<button type="button" class="btn cover-wa" onclick="document.getElementById('wa-send').showModal()">${WA_ICON} שליחה בוואטסאפ</button>` : ''}
        ${can('manager') ? '<a class="btn cover-btn" href="/admin/campaigns/new">+ קמפיין חדש</a>' : ''}
      </div>
    </header>
    ${can('manager') && campaigns.length ? sendDialog(campaigns, csrf, business?.invite_template || DEFAULT_INVITE_TEMPLATE, waAuto) : ''}
    ${sendError ? '<div class="error">מספר הטלפון לא נראה תקין. נסו שוב עם מספר מלא, למשל 050-1234567.</div>' : ''}
    ${waResult?.ok ? '<div class="flash">ההודעה נשלחה ללקוח בוואטסאפ.</div>' : ''}
    ${waResult && !waResult.ok ? `<div class="error">ההודעה לא נשלחה: ${h(waResult.error || 'שגיאה')}</div>` : ''}`;

  if (!campaigns.length && !hasGoogle) {
    return `${cover}
      ${checklist || (profile ? '' : `<div class="card empty"><p class="muted">מנהל העסק עוד לא יצר קמפיין.</p></div>`)}
      ${profile ? performanceCard(profile.totals, profile.prev) : ''}`;
  }

  // ---- everything customers said, surveys and Google together ----
  const total = stats.responses + g.count;
  const prevTotal = prev.responses + g.prevCount;
  const sumRatings = stats.avgRating * stats.responses + g.avgPeriod * g.count;
  const avgAll = total ? sumRatings / total : 0;
  const prevAvg = prevTotal ? (prev.avgRating * prev.responses + g.prevAvg * g.prevCount) / prevTotal : 0;
  const [countHint, countTrend] = trendPct(total, prevTotal);
  const [avgHint, avgTrend] = trendDiff(avgAll, prevAvg, prevTotal);
  const sources = [g.count ? `${g.count} בגוגל` : '', stats.responses ? `${stats.responses} בסקרים` : ''].filter(Boolean).join(' · ');
  const daily = stats.daily.map((d) => {
    const gd = g.daily.get(d.date) || { n: 0, neg: 0 };
    return { ...d, responses: d.responses + gd.n, negative: d.negative + gd.neg, google: gd.n };
  });
  const dist = [0, 1, 2, 3, 4].map((i) => stats.distribution[i] + g.distribution[i]);
  const toHandle = stats.openIssues + g.unanswered;

  const waitingItems = [...waiting.map(fromResponse), ...g.waiting.map(fromReview)].sort((a, b) => b.sortKey - a.sortKey).slice(0, 4);

  const handleLink = g.unanswered && !stats.openIssues ? '/admin/google/reviews?filter=unanswered' : '/admin/responses?sentiment=negative&status=new';

  const resolve =
    stats.avgResolveHours == null
      ? '—'
      : stats.avgResolveHours < 1
        ? `${Math.max(1, Math.round(stats.avgResolveHours * 60))} דק׳`
        : stats.avgResolveHours < 48
          ? `${stats.avgResolveHours.toFixed(1)} שע׳`
          : `${(stats.avgResolveHours / 24).toFixed(1)} ימים`;

  const surveySection = campaigns.length
    ? `<h2 class="dash-section">סקרים ו-QR</h2>
    <div class="kpis">
      ${kpi('סריקות וכניסות', stats.scans.toLocaleString('he-IL'), `${stats.uniqueVisitors.toLocaleString('he-IL')} מבקרים ייחודיים`)}
      ${kpi('מילאו סקר', stats.responses.toLocaleString('he-IL'), `${pct(stats.responseRate)} מהסריקות`)}
      ${kpi('הופנו לביקורת בגוגל', stats.reviewClicks.toLocaleString('he-IL'), `${pct(stats.reviewConversion)} מהמדרגים`)}
      ${kpi('לקוחות לא מרוצים שמחכים', `<a href="/admin/responses?sentiment=negative&status=new">${stats.openIssues}</a>`, stats.overdue ? `${stats.overdue} מחכים יותר מדי זמן` : 'אף אחד לא מחכה יותר מדי', stats.overdue ? 'down' : 'up')}
    </div>
    <div class="grid2">
      <section class="card">
        <h3>מדדים נוספים</h3>
        <dl class="dl">
          <dt>דירוג ממוצע בסקרים</dt><dd>${stats.avgRating ? `${stats.avgRating.toFixed(1)} ★` : '—'}</dd>
          <dt>NPS</dt><dd>${stats.nps ?? '—'}${stats.npsCount ? ` <span class="muted small">(${stats.npsCount} עונים)</span>` : ''}</dd>
          <dt>זמן טיפול ממוצע</dt><dd>${resolve}</dd>
          <dt>לקוחות כועסים שהוחזרו</dt><dd>${
            stats.recoveredAnswered
              ? `${Math.round((stats.recoveredYes / stats.recoveredAnswered) * 100)}% <span class="muted small">(${stats.recoveredYes} מתוך ${stats.recoveredAnswered} שענו)</span>`
              : '<span class="muted">עוד אין תשובות</span>'
          }</dd>
        </dl>
      </section>
      <section class="card"><h3>מקורות סריקה</h3>
        ${
          stats.sources.length
            ? `<table class="table"><thead><tr><th>מקור</th><th>סריקות</th></tr></thead><tbody>${stats.sources
                .map((s) => `<tr><td>${h(s.source || 'ללא מקור')}</td><td>${s.scans}</td></tr>`)
                .join('')}</tbody></table>`
            : '<p class="muted">אין עדיין סריקות. אפשר ליצור QR נפרד לכל שולחן או קופה בעמוד השליחה של הקמפיין.</p>'
        }
      </section>
    </div>
    ${Object.keys(stats.optionCounts).length ? `<section class="card"><h3>מה הלקוחות סימנו בשאלות</h3>${optionBreakdown(stats.optionCounts)}</section>` : ''}`
    : '';

  return `${cover}
    ${quotaWarning ? `<div class="warn">${h(quotaWarning)}</div>` : ''}
    ${checklist}
    ${tasksCard(tasks, csrf)}
    ${profile ? performanceCard(profile.totals, profile.prev) : ''}
    ${
      stats.overdue
        ? `<a class="alert-bar" href="/admin/responses?overdue=1">${icon('alert')}<span>${
            stats.overdue === 1 ? 'לקוח לא מרוצה אחד מחכה' : `${stats.overdue} לקוחות לא מרוצים מחכים`
          } יותר מזמן הטיפול שהגדרתם</span>לטיפול ←</a>`
        : ''
    }
    <div class="kpis kpis-3">
      ${kpi('ביקורות ודירוגים', total.toLocaleString('he-IL'), countHint || sources || 'אין בתקופה הזו', countTrend)}
      ${kpi('דירוג ממוצע בתקופה', avgAll ? `${avgAll.toFixed(1)} <span class="kpi-star">★</span>` : '—', avgHint || `${stats.positive + g.positive} מרוצים · ${stats.negative + g.negative} לא מרוצים`, avgTrend)}
      ${kpi('מחכים לתשובה', `<a href="${handleLink}">${toHandle.toLocaleString('he-IL')}</a>`, [g.unanswered ? `${g.unanswered} בגוגל` : '', stats.openIssues ? `${stats.openIssues} לקוחות לא מרוצים מסקרים` : ''].filter(Boolean).join(' · ') || 'הכול נענה ✓', toHandle ? '' : 'up')}
    </div>
    <div class="dash-grid">
      <div class="dash-col">
      <section class="card">
        <div class="card-head"><h3>ביקורות ודירוגים לפי יום</h3>
          <div class="legend"><span><i class="sw pos"></i>מרוצים (4-5★)</span><span><i class="sw neg"></i>לא מרוצים</span></div>
        </div>
        ${dailyChart(daily)}
        <p class="muted small chart-note">גוגל וסקרים יחד. מעבר עם העכבר על עמודה מראה את הפירוט.</p>
      </section>
      <section class="card"><h3>התפלגות כוכבים</h3>${distribution(dist)}
        <p class="muted small">${sources ? `${sources} ${h(period.label)}` : 'אין בתקופה הזו'}</p></section>
      </div>
      <div class="dash-col">
      <section class="card">
        <div class="card-head"><h3>מחכים לטיפול</h3><a href="${handleLink}" class="small">הכול</a></div>
        ${feed(waitingItems, 'אין ביקורות שליליות או לקוחות לא מרוצים שמחכים. כל הכבוד!')}
      </section>
      ${topicsCard(topics) || `<section class="card"><h3>מה הלקוחות אומרים</h3><p class="muted">כשעוזר ה-AI פעיל, הוא מסווג כל ביקורת והערה לנושאים (שירות, המתנה, מחיר...) ותראו כאן מה חוזר הכי הרבה.</p></section>`}
      </div>
    </div>
    ${surveySection}`;
}

// ---------------------------------------------------------------- responses

function tagChips(tags) {
  const list = parseJson(tags, []);
  if (!list.length) return '';
  return `<div class="tags">${list
    .map((t) => `<a class="tag" href="/admin/responses?tag=${encodeURIComponent(t)}">${h(t)}</a>`)
    .join('')}</div>`;
}

function topicsCard(topics) {
  if (!topics?.length) return '';
  const max = Math.max(...topics.map((t) => t.total));
  return `<section class="card">
    <div class="card-head"><h3>נושאים חוזרים</h3>
      <div class="legend"><span><i class="sw pos"></i>מרוצים</span><span><i class="sw neg"></i>לא מרוצים</span></div>
    </div>
    ${topics
      .map(
        (t) => `<a class="dist-row topic-row" href="/admin/responses?tag=${encodeURIComponent(t.topic)}">
          <span class="dist-label wide">${h(t.topic)}</span>
          <span class="dist-bar stacked"><span class="good" style="width:${(t.positive / max) * 100}%"></span><span class="bad" style="width:${(t.negative / max) * 100}%"></span></span>
          <span class="dist-n">${t.total}</span>
        </a>`,
      )
      .join('')}
    <p class="muted small">מתויג אוטומטית על ידי ה-AI לפי מה שהלקוחות כתבו.</p>
  </section>`;
}

function statusBadge(status) {
  return `<span class="badge st-${h(status)}">${h(STATUSES[status] || status)}</span>`;
}

export function responsesTable(rows) {
  if (!rows.length) return '<p class="muted">לא נמצאו תגובות שמתאימות לסינון.</p>';
  return `<table class="table responsive">
    <thead><tr><th>תאריך</th><th>קמפיין</th><th>דירוג</th><th>הערה</th><th>לקוח</th><th>ביקורת</th><th>סטטוס</th></tr></thead>
    <tbody>${rows
      .map((r) => {
        const clicks = parseJson(r.review_clicks, []);
        return `<tr class="${r.sentiment}${r.overdue ? ' late' : ''}">
          <td data-l="תאריך"><a href="/admin/responses/${r.id}">${h(formatDate(r.created_at))}</a></td>
          <td data-l="קמפיין">${h(r.campaign_name)}${r.source ? `<div class="muted small">${h(r.source)}</div>` : ''}${
            r.staff_name ? `<div class="muted small">${icon('user', 12)} ${h(r.staff_name)}</div>` : ''
          }</td>
          <td data-l="דירוג">${stars(r.rating)}</td>
          <td data-l="הערה" class="clip">${h(r.comment) || (r.completed ? '' : '<span class="muted small">לא השלים סקר</span>')}${tagChips(r.tags)}</td>
          <td data-l="לקוח">${h(r.customer_name)} ${r.phone ? `<div class="small" dir="ltr">${h(r.phone)}</div>` : ''}</td>
          <td data-l="ביקורת">${clicks.length ? h(clicks.map(platformLabel).join(', ')) : '—'}</td>
          <td data-l="סטטוס">${
            r.sentiment === 'negative'
              ? `${statusBadge(r.status)}${r.overdue ? ' <span class="badge st-late">באיחור</span>' : ''}`
              : `<span class="badge st-ok">מרוצה</span>${r.published ? ' <span class="badge st-pub">באתר</span>' : ''}`
          }</td>
        </tr>`;
      })
      .join('')}</tbody></table>`;
}

export function responsesView({ rows, campaigns, filters, page, hasMore, staff = [] }) {
  const opt = (value, label, current) =>
    `<option value="${h(value)}" ${String(current ?? '') === String(value) ? 'selected' : ''}>${h(label)}</option>`;
  const qs = (p) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    params.set('page', p);
    return params.toString();
  };
  const exportParams = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const unhappyView = filters.sentiment === 'negative' && filters.status === 'new';
  const filtered = Object.entries(filters).some(([k, v]) => v && !(unhappyView && (k === 'sentiment' || k === 'status')));
  const empty = !rows.length && page === 1 && !filtered;
  const advancedOn = Boolean(filters.status && !unhappyView) || filters.staff || filters.tag || filters.overdue || filters.consent;
  const intro = unhappyView
    ? 'לקוחות שדירגו נמוך בסקר ועוד לא טיפלתם בהם. פותחים את הלקוח, חוזרים אליו בטלפון או בוואטסאפ, ומסמנים "טופל". ככה לקוח כועס הופך ללקוח שחוזר, לפני שהוא כותב ביקורת רעה בגוגל.'
    : 'כל סקר שלקוח מילא דרך ה-QR או הקישור שלכם: הדירוג, התשובות וההערה. ביקורות מגוגל נמצאות בעמוד "ביקורות".';
  const emptyState = unhappyView
    ? '<div class="card empty"><p><b>אין לקוחות לא מרוצים שמחכים.</b></p><p class="muted">כשלקוח ידרג נמוך בסקר, הוא יופיע כאן ותקבלו התראה.</p></div>'
    : `<div class="card empty"><p><b>עוד אף לקוח לא מילא סקר.</b></p>
        <p class="muted">מדפיסים את שלט ה-QR ומניחים אותו בקופה או על השולחנות, או שולחים ללקוחות את הקישור לסקר.</p>
        <a class="btn primary" href="/admin/campaigns">לקמפיינים ו-QR</a></div>`;
  return `<div class="page-head"><h1>${unhappyView ? 'לקוחות לא מרוצים' : 'תגובות מסקרים'}</h1>
      ${rows.length ? `<a class="btn" href="/admin/responses.csv?${h(exportParams)}">ייצוא CSV</a>` : ''}</div>
    <p class="page-intro">${intro}</p>
    ${
      empty
        ? emptyState
        : `<form method="get" class="filters">
      ${unhappyView ? '<input type="hidden" name="sentiment" value="negative"><input type="hidden" name="status" value="new">' : ''}
      <input name="q" placeholder="חיפוש בשם, טלפון או הערה" value="${h(filters.q)}">
      ${
        campaigns.length > 1
          ? `<select name="campaign" aria-label="קמפיין" onchange="this.form.submit()">${opt('', 'כל הקמפיינים', filters.campaign)}${campaigns
              .map((c) => opt(c.id, c.name, filters.campaign))
              .join('')}</select>`
          : ''
      }
      ${
        unhappyView
          ? ''
          : `<select name="sentiment" aria-label="דירוג" onchange="this.form.submit()">${opt('', 'כל הדירוגים', filters.sentiment)}${opt('positive', 'מרוצים', filters.sentiment)}${opt('negative', 'לא מרוצים', filters.sentiment)}</select>`
      }
      <button class="btn">חיפוש</button>
      <details class="more-filters" ${advancedOn ? 'open' : ''}><summary>עוד סינונים</summary>
        <div class="filters">
          ${
            unhappyView
              ? ''
              : `<select name="status" aria-label="סטטוס">${opt('', 'כל הסטטוסים', filters.status)}${Object.entries(STATUSES)
                  .map(([k, v]) => opt(k, v, filters.status))
                  .join('')}</select>`
          }
          ${
            staff.length
              ? `<select name="staff" aria-label="עובד">${opt('', 'כל העובדים', filters.staff)}${staff
                  .map((s) => opt(s.id, s.name, filters.staff))
                  .join('')}</select>`
              : ''
          }
          <select name="tag" aria-label="נושא">${opt('', 'כל הנושאים', filters.tag)}${TOPICS.map((t) => opt(t, t, filters.tag)).join('')}</select>
          <label class="check"><input type="checkbox" name="overdue" value="1" ${filters.overdue ? 'checked' : ''}> רק מי שמחכה יותר מדי</label>
          <label class="check"><input type="checkbox" name="consent" value="1" ${filters.consent ? 'checked' : ''}> אישרו לפרסם את ההערה</label>
        </div>
      </details>
    </form>
    <div class="card">${responsesTable(rows)}</div>`
    }
    <div class="pager">
      ${page > 1 ? `<a class="btn" href="?${h(qs(page - 1))}">הקודם</a>` : ''}
      ${hasMore ? `<a class="btn" href="?${h(qs(page + 1))}">הבא</a>` : ''}
    </div>`;
}

export function responseDetailView({ r, csrf, businessName, followupUrl = '', can = () => true, aiAvailable = false, aiReason = '', widgetAvailable = false, aiError = '' }) {
  const questions = parseJson(r.campaign_questions, []);
  const answers = parseJson(r.answers, {});
  const labelOf = Object.fromEntries(questions.map((q) => [q.id, q.label]));
  const clicks = parseJson(r.review_clicks, []);
  const waText = `היי ${r.customer_name || ''}, כאן ${businessName}. קיבלנו את המשוב שלך ורצינו לחזור אליך.`;
  return `<p><a href="/admin/responses">→ חזרה לתגובות</a></p>
    <div class="page-head"><h1>${stars(r.rating)} ${r.sentiment === 'negative' ? 'לקוח לא מרוצה' : 'לקוח מרוצה'}</h1>
      ${r.sentiment === 'negative' ? statusBadge(r.status) : ''}</div>
    <div class="grid2">
      <section class="card">
        <h3>פרטים</h3>
        <dl class="dl">
          <dt>תאריך</dt><dd>${h(formatDate(r.created_at))}</dd>
          <dt>קמפיין</dt><dd>${h(r.campaign_name)}</dd>
          <dt>מקור</dt><dd>${h(r.source || '—')}</dd>
          <dt>עובד</dt><dd>${h(r.staff_name || '—')}</dd>
          <dt>השלים סקר</dt><dd>${r.completed ? 'כן' : 'לא (רק דירג)'}</dd>
          <dt>לחץ על ביקורת</dt><dd>${clicks.length ? h(clicks.map(platformLabel).join(', ')) : 'לא'}</dd>
          ${Object.entries(answers)
            .map(([k, v]) => `<dt>${h(labelOf[k] || k)}</dt><dd>${h([].concat(v).join(', '))}</dd>`)
            .join('')}
          <dt>הערה</dt><dd class="pre">${h(r.comment) || '—'}${tagChips(r.tags)}</dd>
        </dl>
      </section>
      <section class="card">
        <h3>לקוח</h3>
        <dl class="dl">
          <dt>שם</dt><dd>${h(r.customer_name || '—')}</dd>
          <dt>טלפון</dt><dd dir="ltr">${h(r.phone || '—')}</dd>
          <dt>אימייל</dt><dd dir="ltr">${h(r.email || '—')}</dd>
          <dt>ביקש שיחזרו</dt><dd>${r.wants_contact ? 'כן' : 'לא'}</dd>
        </dl>
        <div class="actions">
          ${r.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${h(waLink(r.phone, waText))}">וואטסאפ ללקוח</a>
          <a class="btn" href="tel:${h(r.phone)}">חיוג</a>` : ''}
          ${r.email ? `<a class="btn" href="mailto:${h(r.email)}">אימייל</a>` : ''}
        </div>
        ${
          can('manager')
            ? `<h3>טיפול</h3>
        <form method="post" action="/admin/responses/${r.id}" class="stack">
          ${csrfField(csrf)}
          <label>סטטוס<select name="status">${Object.entries(STATUSES)
            .map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${h(v)}</option>`)
            .join('')}</select></label>
          <label>הערות פנימיות<textarea name="notes" rows="4" maxlength="5000">${h(r.notes)}</textarea></label>
          <button class="btn primary">שמירה</button>
        </form>`
            : r.notes
              ? `<h3>הערות פנימיות</h3><p class="pre">${h(r.notes)}</p>`
              : ''
        }
        ${r.resolved_at ? `<p class="muted small">טופל ב-${h(formatDate(r.resolved_at))}</p>` : ''}
        ${followupBlock(r, followupUrl, businessName)}
      </section>
    </div>
    ${r.sentiment === 'negative' && can('manager') ? draftSection({ r, csrf, aiAvailable, aiReason, aiError }) : ''}
    ${r.publish_consent && widgetAvailable ? publishSection({ r, csrf, canEdit: can('manager') }) : ''}
    ${
      can('owner')
        ? `<form method="post" action="/admin/responses/${r.id}/delete" class="danger-zone"
            onsubmit="return confirm('למחוק את התגובה וכל פרטי הלקוח שבה? אי אפשר לבטל.')">
            ${csrfField(csrf)}<button class="btn danger">מחיקת התגובה ופרטי הלקוח</button>
            <p class="muted small">למשל כשלקוח מבקש למחוק את המידע עליו.</p></form>`
        : ''
    }`;
}

function followupBlock(r, followupUrl, businessName) {
  if (r.sentiment !== 'negative') return '';
  if (r.recovered === 1) return '<p><span class="badge st-ok">הלקוח אישר שהטיפול עזר</span></p>';
  if (r.recovered === 0) return '<p><span class="badge st-late">הלקוח ענה שהטיפול לא עזר</span></p>';
  if (!followupUrl) return '';
  const text = `היי ${r.customer_name || ''}, כאן ${businessName}. רצינו לוודא שהטיפול בפנייה שלך עזר: ${followupUrl}`;
  return `<div class="followup-box">
    <b>שאלת המשך ללקוח</b>
    <span class="small muted">${r.followup_sent_at ? `נשלחה במייל ב-${h(formatDate(r.followup_sent_at))}. עוד לא התקבלה תשובה.` : 'עוד לא נשלחה. אפשר לשלוח בוואטסאפ:'}</span>
    ${r.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${h(waLink(r.phone, text))}">שליחה בוואטסאפ</a>` : ''}
  </div>`;
}

function draftSection({ r, csrf, aiAvailable, aiReason, aiError }) {
  const button = aiAvailable
    ? `<form method="post" action="/admin/responses/${r.id}/draft" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='כותב...'">
        ${csrfField(csrf)}<button class="btn ai-btn">${icon('spark', 16)} <span>${r.ai_draft ? 'ניסוח מחדש' : 'ניסוח תשובה עם AI'}</span></button></form>`
    : `<p class="muted small">${h(aiReason)}</p>`;
  return `<section class="card stack" id="draft">
    <h3>תשובה ללקוח</h3>
    ${aiError ? `<div class="error">${h(aiError)}</div>` : ''}
    ${
      r.ai_draft
        ? `<textarea id="draft-text" rows="6">${h(r.ai_draft)}</textarea>
           <p class="muted small">זו טיוטה. קראו, ערכו ורק אז שלחו.</p>
           <div class="actions">
             <button type="button" class="btn" onclick="navigator.clipboard.writeText(document.getElementById('draft-text').value);this.textContent='הועתק ✓'">העתקה</button>
             ${r.phone ? `<button type="button" class="btn wa" data-href="${h(waLink(r.phone, ''))}" onclick="window.open(this.dataset.href+'?text='+encodeURIComponent(document.getElementById('draft-text').value),'_blank','noopener')">שליחה בוואטסאפ</button>` : ''}
             ${r.email ? `<button type="button" class="btn" data-email="${h(r.email)}" onclick="location.href='mailto:'+encodeURIComponent(this.dataset.email)+'?body='+encodeURIComponent(document.getElementById('draft-text').value)">שליחה במייל</button>` : ''}
           </div>`
        : ''
    }
    ${button}
  </section>`;
}

function publishSection({ r, csrf, canEdit }) {
  return `<section class="card stack">
    <h3>המלצה לאתר</h3>
    <p class="muted small">הלקוח אישר לפרסם את ההערה שלו באתר העסק (עם שם פרטי בלבד).</p>
    ${
      canEdit
        ? `<form method="post" action="/admin/responses/${r.id}/publish">${csrfField(csrf)}
            <input type="hidden" name="published" value="${r.published ? 0 : 1}">
            <button class="btn ${r.published ? '' : 'primary'}">${r.published ? 'הסרה מהאתר' : 'פרסום בווידג\'ט'}</button></form>`
        : `<p>${r.published ? 'מפורסם באתר' : 'לא מפורסם'}</p>`
    }
  </section>`;
}

// ---------------------------------------------------------------- campaigns

export function campaignsView({ campaigns, baseUrl, can = () => true, limitReached = '', summaries = {} }) {
  const newButton = can('manager') && !limitReached ? '<a class="btn primary" href="/admin/campaigns/new">+ קמפיין חדש</a>' : '';
  return `<div class="page-head"><h1>קמפיינים ו-QR</h1>${newButton}</div>
    ${limitReached && can('manager') ? `<div class="warn">${h(limitReached)}</div>` : ''}
    <p class="muted">כל קמפיין = קישור + QR משלו, עם שאלות, סף שביעות רצון ויעדי ביקורת. מתאים לסניפים, עמדות, עובדים או ערוצים שונים.</p>
    ${
      campaigns.length
        ? `<div class="cards">${campaigns
            .map((c) => {
              const url = `${baseUrl}/r/${c.slug}`;
              const s = summaries[c.id];
              const mini = s
                ? `<div class="camp-stats" aria-label="30 הימים האחרונים">
                    <span><b>${s.responses}</b>דירוגים</span>
                    <span><b>${s.responses ? s.avgRating.toFixed(1) : '—'}</b>ממוצע</span>
                    <span><b>${s.reviewed}</b>לגוגל</span>
                  </div>`
                : '';
              return `<div class="card camp">
                <img class="qr-thumb" src="/admin/campaigns/${c.id}/qr.svg" alt="QR">
                <div>
                  <h3>${h(c.name)} ${c.active ? '' : '<span class="badge st-closed">מושבת</span>'}</h3>
                  <div class="small" dir="ltr"><a href="${h(url)}" target="_blank" rel="noopener">${h(url)}</a></div>
                  <div class="small muted">סף מרוצים: ${c.threshold}★ ומעלה · ${c.questionsList.length} שאלות · ${c.google_review_url ? 'גוגל מחובר' : '<b>חסר קישור גוגל</b>'}</div>
                  <div class="actions">
                    ${can('manager') ? `<a class="btn" href="/admin/campaigns/${c.id}">עריכה</a>` : ''}
                    <a class="btn accent" href="/admin/campaigns/${c.id}/poster">עיצוב שלט QR</a>
                    <a class="btn" href="/admin/campaigns/${c.id}/share">קישור ושליחה ללקוחות</a>
                    <a class="btn" href="/admin?campaign=${c.id}">נתונים</a>
                  </div>
                </div>
                ${mini}
              </div>`;
            })
            .join('')}</div>`
        : '<div class="card empty"><p>עדיין אין קמפיינים.</p></div>'
    }`;
}

function questionRow(q, i) {
  const opt = (map, cur) =>
    Object.entries(map)
      .map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${h(v)}</option>`)
      .join('');
  return `<div class="qrow">
    <input type="hidden" name="q_id" value="${h(q.id)}">
    <input name="q_label" placeholder="נוסח השאלה" value="${h(q.label)}" aria-label="שאלה ${i + 1}">
    <select name="q_type" aria-label="סוג">${opt(QUESTION_TYPES, q.type)}</select>
    <select name="q_audience" aria-label="למי">${opt(AUDIENCES, q.audience)}</select>
    <input name="q_options" placeholder="אפשרויות, מופרדות בפסיק" value="${h(q.options.join(', '))}">
    <select name="q_required" aria-label="חובה"><option value="0">רשות</option><option value="1" ${q.required ? 'selected' : ''}>חובה</option></select>
    <button type="button" class="btn-link remove" onclick="this.closest('.qrow').remove()">הסרה</button>
  </div>`;
}

export function templatePickerView({ error = '' }) {
  return `<p><a href="/admin/campaigns">→ חזרה לקמפיינים</a></p>
  <h1>קמפיין חדש</h1>
  <p class="muted">בחרו את סוג העסק ואת שפת הסקר, ונכין לכם שאלות מתאימות. הכול ניתן לשינוי אחר כך.</p>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <form method="get" action="/admin/campaigns/new" class="stack">
    <fieldset class="card template-grid">
      <legend class="sr-only">סוג העסק</legend>
      ${Object.entries(TEMPLATES)
        .map(
          ([key, t], i) => `<label class="template-card">
            <input type="radio" name="template" value="${key}" ${i === 0 ? 'checked' : ''}>
            <span class="t-icon">${icon(t.icon, 24)}</span>
            <b>${h(t.label)}</b>
            <small>${h(t.description)}</small>
          </label>`,
        )
        .join('')}
    </fieldset>
    <div class="row">
      <label>שפת הסקר<select name="lang">${Object.entries(LANGUAGES)
        .map(([k, v]) => `<option value="${k}">${h(v)}</option>`)
        .join('')}</select></label>
      <button class="btn accent big-inline">המשך ←</button>
    </div>
  </form>`;
}

export function campaignFormView({ campaign, csrf, error = '' }) {
  const isNew = !campaign.id;
  const c = campaign;
  const texts = c.textsObj || {};
  const defaults = PUBLIC_TEXTS[c.lang] || PUBLIC_TEXTS.he;
  const links = [...(c.extraLinks || []), { label: '', url: '' }, { label: '', url: '' }];
  const TEXT_LABELS = {
    title: 'כותרת מסך הדירוג',
    subtitle: 'תת כותרת',
    q_positive: 'כותרת שאלות (מרוצים)',
    q_negative: 'כותרת שאלות (לא מרוצים)',
    thanks_positive_title: 'תודה (מרוצים) כותרת',
    thanks_positive_body: 'תודה (מרוצים) טקסט',
    thanks_negative_title: 'תודה (לא מרוצים) כותרת',
    thanks_negative_body: 'תודה (לא מרוצים) טקסט',
  };
  return `<p><a href="/admin/campaigns">→ חזרה לקמפיינים</a></p>
  <h1>${isNew ? 'קמפיין חדש' : `עריכת קמפיין: ${h(c.name)}`}</h1>
  ${error ? `<div class="error">${h(error)}</div>` : ''}
  <form method="post" action="${isNew ? '/admin/campaigns' : `/admin/campaigns/${c.id}`}" class="stack campaign-form">
    ${csrfField(csrf)}
    <section class="card stack">
      <h3>בסיס</h3>
      <label>שם הקמפיין<input name="name" required maxlength="100" value="${h(c.name)}" placeholder="למשל: סניף תל אביב"></label>
      <div class="row">
        <label>שפת הסקר<select name="lang">
          ${Object.entries(LANGUAGES)
            .map(([k, v]) => `<option value="${k}" ${c.lang === k ? 'selected' : ''}>${h(v)}</option>`)
            .join('')}
        </select></label>
        <label>לקוח נחשב "מרוצה" מדירוג<select name="threshold">${[2, 3, 4, 5]
          .map((n) => `<option value="${n}" ${c.threshold === n ? 'selected' : ''}>${n}★ ומעלה</option>`)
          .join('')}</select></label>
        ${isNew ? '' : `<label class="check"><input type="checkbox" name="active" value="1" ${c.active ? 'checked' : ''}> פעיל</label>`}
      </div>
      <div class="row">
        <label>תזכורת במייל למי שלא דירג<select name="reminder_hours">${[
          [0, 'בלי תזכורת'],
          [24, 'אחרי יום'],
          [48, 'אחרי יומיים'],
          [72, 'אחרי 3 ימים'],
          [168, 'אחרי שבוע'],
        ]
          .map(([v, l]) => `<option value="${v}" ${Number(c.reminder_hours ?? 48) === v ? 'selected' : ''}>${l}</option>`)
          .join('')}</select></label>
        <label class="check"><input type="checkbox" name="ask_consent" value="1" ${c.ask_consent ?? 1 ? 'checked' : ''}>
          לבקש מלקוחות מרוצים אישור לפרסם את ההערה באתר</label>
        <label class="check"><input type="checkbox" name="ask_staff" value="1" ${c.ask_staff ? 'checked' : ''}>
          לשאול את הלקוח מי נתן לו שירות (לדירוג העובדים). לא נשאל כשהלקוח הגיע מקישור אישי של עובד</label>
      </div>
    </section>

    <section class="card stack">
      <h3>יעדי ביקורת</h3>
      <label>קישור לביקורת בגוגל או Place ID
        <input name="google_review_url" dir="ltr" value="${h(c.google_review_url)}" placeholder="https://g.page/r/.../review  או  ChIJ...">
      </label>
      <p class="muted small">את ה-Place ID אפשר למצוא ב-Google Place ID Finder, או להעתיק את הקישור "בקשת ביקורות" מ-Google Business Profile.</p>
      <h4>פלטפורמות נוספות (Facebook, Easy, TripAdvisor, Wolt...)</h4>
      ${links
        .map(
          (l) => `<div class="row">
            <input name="link_label" placeholder="שם" value="${h(l.label)}">
            <input name="link_url" dir="ltr" placeholder="https://..." value="${h(l.url)}">
          </div>`,
        )
        .join('')}
    </section>

    <section class="card stack">
      <h3>שאלות המשך</h3>
      <p class="muted small">השאלות מוצגות אחרי הדירוג. אפשר לכוון כל שאלה לכולם, רק למרוצים או רק ללא מרוצים. ללא מרוצים יוצג גם טופס פרטי קשר.</p>
      <div id="questions">${c.questionsList.map(questionRow).join('')}</div>
      <template id="qtpl">${questionRow({ id: '', label: '', type: 'multi', audience: 'all', options: [], required: false }, 99)}</template>
      <button type="button" class="btn" onclick="document.getElementById('questions').append(document.getElementById('qtpl').content.cloneNode(true))">+ הוספת שאלה</button>
    </section>

    <section class="card stack">
      <h3>טקסטים ללקוח</h3>
      <p class="muted small">השאירו ריק כדי להשתמש בברירת המחדל.</p>
      ${EDITABLE_TEXT_KEYS.map(
        (k) => `<label>${h(TEXT_LABELS[k])}<input name="text_${k}" maxlength="300" value="${h(texts[k] || '')}" placeholder="${h(defaults[k])}"></label>`,
      ).join('')}
    </section>

    <div class="actions">
      <button class="btn primary big">${isNew ? 'יצירה' : 'שמירה'}</button>
    </div>
  </form>
  ${
    isNew
      ? ''
      : `<form method="post" action="/admin/campaigns/${c.id}/delete" onsubmit="return confirm('למחוק את הקמפיין וכל התגובות שלו?')" class="danger-zone">
          ${csrfField(csrf)}<button class="btn danger">מחיקת קמפיין</button></form>`
  }`;
}

export function shareView({ campaign, baseUrl, csrf, invites, newInvite, businessName, inviteTemplate = '', can = () => true, emailInvites = false, mailEnabled = false, waAuto = false }) {
  const waState = (inv) =>
    inv.wa_status
      ? `<div class="small ${inv.wa_status === 'failed' ? 'danger-text' : 'muted'}" ${inv.wa_error ? `title="${h(inv.wa_error === 'quota' ? 'המכסה החודשית נוצלה' : inv.wa_error)}"` : ''}>💬 ${
          { sent: 'נשלח בוואטסאפ', delivered: 'נמסר בוואטסאפ', read: 'נקרא בוואטסאפ', failed: 'לא נשלח בוואטסאפ' }[inv.wa_status] || ''
        }</div>`
      : inv.wa_send_at
        ? `<div class="small muted">💬 יישלח בוואטסאפ ב-${h(formatDate(inv.wa_send_at))}</div>`
        : '';
  const url = `${baseUrl}/r/${campaign.slug}`;
  const inviteUrl = (t) => `${url}?i=${t}`;
  const inviteMsg = (inv) => inviteMessage({ name: inv.customer_name, businessName, link: inviteUrl(inv.token), template: inviteTemplate });
  return `<p><a href="/admin/campaigns">→ חזרה לקמפיינים</a></p>
  <h1>QR ושליחה: ${h(campaign.name)}</h1>
  <div class="grid2">
    <section class="card stack">
      <h3>קוד QR</h3>
      <img class="qr-big" src="/admin/campaigns/${campaign.id}/qr.svg" alt="QR">
      <div class="small" dir="ltr">${h(url)}</div>
      <div class="actions">
        <a class="btn" href="/admin/campaigns/${campaign.id}/qr.png" download="qr-${h(campaign.slug)}.png">הורדת PNG</a>
        <a class="btn" href="/admin/campaigns/${campaign.id}/qr.svg" download="qr-${h(campaign.slug)}.svg">הורדת SVG</a>
        <a class="btn accent" href="/admin/campaigns/${campaign.id}/poster">עיצוב והדפסת שלט QR</a>
      </div>
      <h4>QR לפי מקור</h4>
      <p class="muted small">צרו QR נפרד לכל שולחן / קופה / עובד וראו בלוח הבקרה מאיפה מגיעים הדירוגים.</p>
      <form method="get" action="/admin/campaigns/${campaign.id}/poster" target="_blank" class="row">
        <input name="src" placeholder="למשל: table-4 או dana" pattern="[A-Za-z0-9_\\-]{1,40}" required dir="ltr">
        <button class="btn">שלט עם מקור</button>
      </form>
    </section>
    <section class="card stack">
      <h3>שליחת בקשה אישית ללקוח</h3>
      <p class="muted small">קישור אישי עם שם הלקוח. ניתן לשלוח בוואטסאפ או SMS ולעקוב אם נפתח ומולא.${
        emailInvites ? ' אם ממלאים אימייל, הבקשה נשלחת אוטומטית במייל, ועם תזכורת למי שלא ענה.' : ''
      }</p>
      ${
        can('manager')
          ? `<form method="post" action="/admin/campaigns/${campaign.id}/invites" class="stack">
        ${csrfField(csrf)}
        <div class="row">
          <input name="customer_name" placeholder="שם הלקוח" maxlength="80">
          <input name="phone" placeholder="טלפון" maxlength="30" dir="ltr">
          ${emailInvites ? '<input name="email" type="email" placeholder="אימייל (לא חובה)" maxlength="120" dir="ltr">' : ''}
        </div>
        ${waAuto ? '<label class="check"><input type="checkbox" name="wa" value="1" checked> לשלוח ללקוח בוואטסאפ אוטומטית</label>' : ''}
        <button class="btn primary">יצירת קישור</button>
        ${emailInvites && !mailEnabled ? '<p class="muted small">שימו לב: שליחת מיילים עוד לא הוגדרה בשרת, ההודעות נשמרות ביומן בלבד.</p>' : ''}
      </form>`
          : ''
      }
      ${
        newInvite
          ? `<div class="flash">${newInvite.wa_status === 'sent' ? 'נשלח בוואטסאפ. ' : newInvite.wa_status === 'failed' ? `<b>לא נשלח בוואטסאפ${newInvite.wa_error === 'quota' ? ' (המכסה החודשית נוצלה)' : ''}.</b> ` : ''}${newInvite.email_sent_at ? `נשלח מייל ל-<span dir="ltr">${h(newInvite.email)}</span>. ` : ''}נוצר קישור: <span dir="ltr">${h(inviteUrl(newInvite.token))}</span>
              <div class="actions"><a class="btn wa" target="_blank" rel="noopener" href="${h(
                waLink(newInvite.phone, inviteMsg(newInvite)),
              )}">שליחה בוואטסאפ</a>
              <a class="btn" href="sms:${h(newInvite.phone)}?body=${encodeURIComponent(inviteMsg(newInvite))}">SMS</a></div></div>`
          : ''
      }
      ${
        invites.length
          ? `<table class="table"><thead><tr><th>לקוח</th><th>נשלח</th><th>נפתח</th><th>דירג</th><th></th></tr></thead><tbody>${invites
              .map(
                (inv) => `<tr><td>${h(inv.customer_name)}<div class="small" dir="ltr">${h(inv.phone)} ${h(inv.email)}</div>
                  ${inv.email_sent_at ? `<div class="small muted">✉ נשלח במייל${inv.reminder_sent_at ? ' + תזכורת' : ''}</div>` : inv.send_at ? `<div class="small muted">✉ יישלח ב-${h(formatDate(inv.send_at))}</div>` : ''}
                  ${waState(inv)}
                  ${inv.origin === 'api' ? '<span class="badge st-pub">אוטומטי</span>' : ''}</td>
                  <td class="small">${h(formatDate(inv.created_at))}</td>
                  <td>${inv.opened_at ? '✓' : '—'}</td><td>${inv.responded_at ? '✓' : '—'}</td>
                  <td><a class="btn-link" target="_blank" rel="noopener" href="${h(waLink(inv.phone, inviteMsg(inv)))}">שליחה שוב</a></td></tr>`,
              )
              .join('')}</tbody></table>`
          : ''
      }
    </section>
  </div>`;
}

/** The poster sheet itself; the designer's script updates it live. */
function posterSheet({ business, qrSvg, t, design: d }) {
  const logo = logoSrc(business);
  const mark = logo
    ? `<img class="ps-logo" src="${h(logo)}" alt="">`
    : `<span class="ps-initial">${h(String(business.name).trim().charAt(0) || '★')}</span>`;
  const steps = [t.poster_step1, t.poster_step2, t.poster_step3];
  return `<article id="sheet" class="poster-sheet style-${h(d.style)} size-${h(d.size)}" dir="${h(t.dir)}"
      style="--c:${h(d.color)};--on-c:${inkOn(d.color)};--a:${h(d.accent)};--on-a:${inkOn(d.accent)}">
    <header class="ps-head">
      <span data-show="showLogo" ${d.showLogo ? '' : 'hidden'}>${mark}</span>
      <span class="ps-biz" data-show="showName" ${d.showName ? '' : 'hidden'}>${h(business.name)}</span>
    </header>
    <div class="ps-body">
      <h1 data-text="title">${h(d.title)}</h1>
      <p class="ps-sub" data-text="subtitle">${h(d.subtitle)}</p>
      <div class="ps-qr-wrap">
        <span class="ps-badge" data-text="badge">${h(d.badge)}</span>
        <div class="ps-qr">${qrSvg}</div>
      </div>
      <ol class="ps-steps" data-show="showSteps" ${d.showSteps ? '' : 'hidden'}>${steps.map((x, i) => `<li><span>${i + 1}</span>${h(x)}</li>`).join('')}</ol>
      <div class="ps-stars" data-show="showStars" ${d.showStars ? '' : 'hidden'} aria-hidden="true">★★★★★</div>
      <p class="ps-footer" data-text="footer" ${d.footer ? '' : 'hidden'}>${h(d.footer)}</p>
    </div>
  </article>`;
}

export function posterView({ campaign, business, qrSvg, t, staff = null, design, csrf = '', canEdit = true, src = '', saved = false }) {
  const d = design;
  const sizes = Object.fromEntries(Object.entries(POSTER_SIZES).map(([k, v]) => [k, { w: v.w, h: v.h }]));
  const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${h(typeof v === 'string' ? v : v.label)}</option>`).join('');
  const check = (name, label) => `<label class="check"><input type="checkbox" name="${name}" value="1" ${d[name] ? 'checked' : ''}> ${label}</label>`;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>עיצוב שלט · ${h(business.name)}</title><link rel="stylesheet" href="${asset('style.css')}">
  <style id="page-size">@page { size: ${sizes[d.size].w}mm ${sizes[d.size].h}mm; margin: 0 }</style>
  <script src="${asset('vendor/html-to-image.js')}" defer></script>
  </head>
  <body class="poster-app">
    <header class="pd-top noprint">
      <a href="/admin/campaigns/${campaign.id}/share" class="pd-back">→ חזרה</a>
      <h1>עיצוב שלט QR <span class="muted">· ${h(campaign.name)}${staff ? ` · ${h(staff.name)}` : ''}</span></h1>
      <div class="pd-actions">
        <button type="button" class="btn" id="pd-png">הורדה כתמונה (PNG)</button>
        <button type="button" class="btn accent" onclick="print()">הדפסה / שמירה כ-PDF</button>
      </div>
    </header>
    ${saved ? '<div class="flash noprint pd-flash">העיצוב נשמר.</div>' : ''}
    <div class="pd-main">
      <form id="pd-form" class="pd-panel noprint" method="post" action="/admin/campaigns/${campaign.id}/poster">
        <input type="hidden" name="_csrf" value="${h(csrf)}">
        ${staff ? `<input type="hidden" name="e" value="${h(staff.code)}">` : ''}
        ${src ? `<input type="hidden" name="src" value="${h(src)}">` : ''}
        <fieldset><legend>גודל ותבנית</legend>
          <label>גודל<select name="size">${opt(POSTER_SIZES, d.size)}</select></label>
          <div class="pd-styles" role="radiogroup" aria-label="תבנית">${Object.entries(POSTER_STYLES)
            .map(([k, l]) => `<label class="pd-style s-${k}"><input type="radio" name="style" value="${k}" ${k === d.style ? 'checked' : ''}><span class="pd-swatch"></span>${h(l)}</label>`)
            .join('')}</div>
        </fieldset>
        <fieldset><legend>צבעים</legend>
          <div class="pd-colors">
            <label>צבע ראשי<input type="color" name="color" value="${h(d.color)}"></label>
            <label>צבע הדגשה<input type="color" name="accent" value="${h(d.accent)}"></label>
          </div>
        </fieldset>
        <fieldset><legend>טקסטים</legend>
          <label>כותרת<input name="title" value="${h(d.title)}" maxlength="80"></label>
          <label>שורה מתחת לכותרת<input name="subtitle" value="${h(d.subtitle)}" maxlength="120"></label>
          <label>תווית מעל הקוד<input name="badge" value="${h(d.badge)}" maxlength="30"></label>
          <label>שורה בתחתית (לא חובה)<input name="footer" value="${h(d.footer)}" maxlength="80" placeholder="למשל: תודה שבחרתם בנו"></label>
        </fieldset>
        <fieldset><legend>מה מופיע בשלט</legend>
          <div class="pd-checks">${check('showLogo', 'לוגו')}${check('showName', 'שם העסק')}${check('showSteps', '3 שלבים')}${check('showStars', 'כוכבים')}</div>
        </fieldset>
        ${canEdit ? '<button class="btn primary pd-save">שמירת העיצוב</button>' : ''}
        <p class="muted small">הקוד מוביל לסקר של הקמפיין "${h(campaign.name)}". אפשר להדפיס כמה שלטים ולשמור כל אחד כ-PDF או כתמונה לשליחה לבית דפוס.</p>
      </form>
      <div class="pd-stage">${posterSheet({ business, qrSvg, t, design: d })}</div>
    </div>
    <script>
    (function () {
      var SIZES = ${JSON.stringify(sizes)};
      var form = document.getElementById('pd-form');
      var sheet = document.getElementById('sheet');
      function ink(hex) {
        var n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.45 ? '#17123a' : '#ffffff';
      }
      function apply() {
        var f = form.elements;
        var style = form.querySelector('input[name=style]:checked').value;
        sheet.className = 'poster-sheet style-' + style + ' size-' + f.size.value;
        sheet.style.setProperty('--c', f.color.value); sheet.style.setProperty('--on-c', ink(f.color.value));
        sheet.style.setProperty('--a', f.accent.value); sheet.style.setProperty('--on-a', ink(f.accent.value));
        sheet.querySelectorAll('[data-text]').forEach(function (el) {
          var v = f[el.dataset.text].value.trim();
          el.textContent = v || f[el.dataset.text].defaultValue;
          if (el.dataset.text === 'footer') el.hidden = !v;
        });
        sheet.querySelectorAll('[data-show]').forEach(function (el) { el.hidden = !f[el.dataset.show].checked; });
        var s = SIZES[f.size.value];
        document.getElementById('page-size').textContent = '@page { size: ' + s.w + 'mm ' + s.h + 'mm; margin: 0 }';
      }
      form.addEventListener('input', apply);
      form.addEventListener('change', apply);
      document.getElementById('pd-png').addEventListener('click', function () {
        var btn = this, s = SIZES[form.elements.size.value];
        if (!window.htmlToImage) return;
        btn.disabled = true; btn.textContent = 'מכין תמונה…';
        // 300 DPI at the printed width, good enough for a print shop.
        var ratio = (s.w / 25.4 * 300) / sheet.offsetWidth;
        window.htmlToImage.toBlob(sheet, { pixelRatio: ratio, style: { borderRadius: '0', boxShadow: 'none', margin: '0' } }).then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a'); a.href = url; a.download = 'qr-sign-' + form.elements.size.value + '.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        }).catch(function () { alert('לא הצלחנו ליצור תמונה. אפשר להשתמש בהדפסה ושמירה כ-PDF.'); })
          .then(function () { btn.disabled = false; btn.textContent = 'הורדה כתמונה (PNG)'; });
      });
    })();
    </script>
  </body></html>`;
}
