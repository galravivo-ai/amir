import { h } from '../util.js';
import { icon } from './icons.js';
import { arrivalCard } from './google.js';
import { dashboardParts, dataSection, FOLD_SCRIPT } from './admin.js';
import { viewsOf } from './performance.js';

// The dashboard in a "bento" style: big numbers on top, then cards of different
// sizes, each one a picture of the thing (a gauge, the Maps grid, the week),
// one card in full color for what needs doing now. Same data as the classic one.

const n = (v) => Number(v || 0).toLocaleString('he-IL');

/** A half-circle gauge for the promotion score (0-100). */
function gauge(score) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const r = 80;
  const len = Math.PI * r;
  return `<svg class="d2-gauge" viewBox="0 0 200 112" aria-hidden="true">
    <defs><linearGradient id="d2g" x1="0" x2="1"><stop offset="0" stop-color="#8b6dff"/><stop offset="1" stop-color="#5b3df5"/></linearGradient></defs>
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#ece8fb" stroke-width="18" stroke-linecap="round"/>
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#d2g)" stroke-width="18" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - s / 100)}" class="d2-gauge-arc"/>
    <g transform="rotate(${-90 + (s / 100) * 180} 100 100)"><path d="M100 34 L106 100 L94 100 Z" fill="#17123a"/></g>
    <circle cx="100" cy="100" r="9" fill="#17123a"/>
  </svg>`;
}

/** Bars of the period: the busiest one marked with its number. */
function bars(daily) {
  // Long periods: weeks, so the chart stays readable.
  let pts = daily.map((d) => ({ label: d.date, v: d.responses }));
  if (pts.length > 35) {
    const weeks = [];
    for (let i = 0; i < pts.length; i += 7) weeks.push({ label: pts[i].label, v: pts.slice(i, i + 7).reduce((s, p) => s + p.v, 0) });
    pts = weeks;
  }
  pts = pts.slice(-31);
  const max = Math.max(1, ...pts.map((p) => p.v));
  const top = pts.reduce((b, p, i) => (p.v > pts[b].v ? i : b), 0);
  return `<div class="d2-bars">${pts
    .map((p, i) => `<span class="${i === top && p.v ? 'top' : ''}" title="${h(p.label)}: ${p.v}"><i style="height:${Math.max(4, (p.v / max) * 100)}%">${i === top && p.v ? `<em>${n(p.v)}</em>` : ''}</i></span>`)
    .join('')}</div>`;
}

/** The week, Sunday to Saturday, today marked; the plan's items under it. */
function week(items) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay());
  const names = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const days = names.map((nm, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return `<span class="${d.toDateString() === today.toDateString() ? 'on' : d < today ? 'past' : ''}"><small>${nm}</small><b>${d.getDate()}</b></span>`;
  });
  const list = items.slice(0, 3);
  return `<div class="d2-days">${days.join('')}</div>
    ${
      list.length
        ? `<ul class="d2-plan">${list
            .map((t) => `<li class="${t.urgent ? 'urgent' : ''}"><a href="${h(t.href)}"><i></i><span><b>${h(t.title)}</b><small>${t.urgent ? 'דחוף' : t.cadence === 'week' ? 'כל שבוע' : t.cadence === 'month' ? 'כל חודש' : 'פעם אחת'}</small></span>${icon('chevron', 14)}</a></li>`)
            .join('')}</ul>`
        : '<p class="d2-empty">אין משהו פתוח השבוע. כל הכבוד!</p>'
    }`;
}

/** The 3×3 Maps grid of the first tracked search. */
function mapGrid(grid) {
  if (!grid) return `<a class="d2-empty-cta" href="/admin/maps#rank">${icon('pin', 22)}<span>מתחילים מעקב אחרי חיפוש, ורואים כאן איפה אתם מופיעים סביב העסק</span></a>`;
  const cells = grid.points.slice(0, 9).map((p, i) => {
    const r = p.rank;
    const tone = r == null ? 'none' : r <= 3 ? 'good' : r <= 10 ? 'mid' : 'bad';
    return `<span class="${tone}${i === 4 ? ' me' : ''}">${r == null ? '20+' : r}</span>`;
  });
  return `<div class="d2-map"><div class="d2-grid">${cells.join('')}</div>
    <div class="d2-map-side"><b>${grid.top}<small>/${grid.points.length}</small></b><span>נקודות בטופ 3</span><em>"${h(grid.keyword)}"</em></div></div>`;
}

/** The business against its competitors, best rated first. */
function board(me, competitors) {
  const rows = [me, ...competitors.filter((c) => c.rating != null)].filter((r) => r.rating != null).sort((a, b) => b.rating - a.rating || (b.total || 0) - (a.total || 0)).slice(0, 5);
  if (rows.length < 2) return `<a class="d2-empty-cta" href="/admin/competitors">${icon('chart', 22)}<span>מוסיפים מתחרים, ורואים כאן איפה אתם עומדים מולם</span></a>`;
  return `<ol class="d2-board">${rows
    .map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="d2-av">${h(String(r.title || '?').trim().charAt(0))}</span><span class="d2-who"><b>${h(r.title)}${r.me ? ' <small>(אתם)</small>' : ''}</b><small>${n(r.total)} ביקורות</small></span><em>${Number(r.rating).toFixed(1)}★</em><i>${i + 1}</i></li>`)
    .join('')}</ol>`;
}

function stars(dist) {
  const total = dist.reduce((a, b) => a + b, 0) || 1;
  return `<div class="d2-stars">${[4, 3, 2, 1, 0]
    .map((i) => `<span><b>${i + 1}★</b><i><u style="width:${(dist[i] / total) * 100}%" class="s${i + 1}"></u></i><small>${n(dist[i])}</small></span>`)
    .join('')}</div>`;
}

export function dashboardV2View(args) {
  const { quotaWarning = '', arrival = null, todo = null, pilot = null, grid = null, competitors = [], business } = args;
  const P = dashboardParts(args);
  const chip = (text, trend) => (text ? `<span class="d2-chip ${trend || ''}">${h(String(text).replace(' מהתקופה הקודמת', ''))}</span>` : '');
  const views = viewsOf(P.t);
  const prevViews = viewsOf(P.pt);
  const kpi = (label, value, extra, href = '') => {
    const body = `<small>${h(label)}</small><b>${value}</b>${extra}`;
    return href ? `<a class="d2-kpi" href="${href}">${body}</a>` : `<div class="d2-kpi">${body}</div>`;
  };
  const reviewsTotal = P.pub?.total || P.g.total;
  const ratingChip = P.ratingDiff ? chip(`${P.ratingDiff > 0 ? '+' : '−'}${Math.abs(P.ratingDiff).toFixed(1)}`, P.ratingDiff > 0 ? 'up' : 'down') : reviewsTotal ? chip(`${n(reviewsTotal)} ביקורות`) : '';
  const kpis = `<div class="d2-kpis">
    ${kpi('דירוג בגוגל', P.rating != null ? `${P.rating.toFixed(1)}<span>★</span>` : '—', ratingChip, '/admin/google/reviews')}
    ${kpi('ביקורות חדשות', n(P.total), chip(P.countHint, P.countTrend), '/admin/google/reviews')}
    ${kpi('פניות מגוגל', P.hasMetrics ? n(P.actions) : '—', P.hasMetrics ? chip(...P.pctChange(P.actions, P.prevActions)) : '<span class="d2-chip">אחרי חיבור</span>', '#data')}
    ${kpi('צפיות בפרופיל', P.hasMetrics ? n(views) : '—', P.hasMetrics ? chip(...P.pctChange(views, prevViews)) : '', '#data')}
  </div>`;

  const me = { me: true, title: business?.name || 'העסק שלכם', rating: P.rating, total: P.pub?.total || P.g.total };
  const score = todo?.score;
  const items = todo?.items || [];

  const toHandleHref = P.toHandle ? (P.g.unanswered ? '/admin/google/reviews?filter=unanswered' : P.handleLink) : '/admin/google/reviews';
  const head = `<header class="d2-head">
      <div class="d2-hello"><small>${h(P.cover.match(/cover-greet">([^<]*)</)?.[1] || '')}</small><h1>${h(business?.name || 'דשבורד')}</h1><span>תמונת המצב ${h(args.period.label)}</span></div>
      <div class="d2-tools">${P.filter}${args.can?.('manager') && args.connect?.connected ? `<a class="d2-round" href="/admin/google" title="חיבור לגוגל וסניפים" aria-label="חיבור לגוגל וסניפים">${icon('gear', 18)}</a>` : ''}</div>
    </header>`;

  return `<div class="d2">
    ${head}
    ${args.sendError ? '<div class="error">מספר הטלפון לא נראה תקין. נסו שוב עם מספר מלא, למשל 050-1234567.</div>' : ''}
    ${args.waResult?.ok ? '<div class="flash">ההודעה נשלחה ללקוח בוואטסאפ.</div>' : ''}
    ${args.waResult && !args.waResult.ok ? `<div class="error">ההודעה לא נשלחה: ${h(args.waResult.error || 'שגיאה')}</div>` : ''}
    ${quotaWarning ? `<div class="warn">${h(quotaWarning)}</div>` : ''}
    ${P.connectCard}
    ${P.checklist}
    ${P.stats.overdue ? `<a class="alert-bar" href="/admin/responses?overdue=1">${icon('alert')}<span>${P.stats.overdue === 1 ? 'לקוח לא מרוצה אחד מחכה' : `${P.stats.overdue} לקוחות לא מרוצים מחכים`} יותר מזמן הטיפול שהגדרתם</span>לטיפול ←</a>` : ''}
    ${kpis}
    ${pilot ? `<a class="pl-strip" href="/admin/pilot">${icon('handshake', 20)}<span><b>הפיילוט שלכם</b> <span>${pilot.done}/${pilot.total}</span> <span>צעדים</span></span><span class="gr-strip-go">להמשך ←</span></a>` : ''}

    <div class="d2-bento">
      <section class="d2-card d2-score">
        <div class="d2-card-h"><h3>ציון קידום</h3><a class="d2-round" href="/admin/growth" aria-label="לעמוד הקידום">${icon('chevron', 16)}</a></div>
        <div class="d2-score-body">
          <div class="d2-score-num"><small>מתוך 100</small><b>${score ?? '—'}</b>${score != null ? `<span class="d2-chip ${score >= 70 ? 'up' : score >= 40 ? '' : 'down'}">${score >= 70 ? 'מצוין' : score >= 40 ? 'בדרך' : 'יש מה לשפר'}</span>` : ''}</div>
          ${gauge(score ?? 0)}
        </div>
        <div class="d2-goals">${(todo?.goals || []).slice(0, 3).map((g) => `<a href="/admin/growth#stage2"><span>${h(g.title)}</span><i><u style="width:${Math.round(g.progress * 100)}%"></u></i></a>`).join('')}</div>
      </section>

      <a class="d2-card d2-accent" href="${toHandleHref}">
        <div class="d2-card-h"><h3>${P.toHandle ? 'מחכים לתשובה' : 'הכול טופל'}</h3><span class="d2-round light">${icon('chevron', 16)}</span></div>
        <span class="d2-accent-btn">${P.toHandle ? 'לענות עכשיו' : 'לכל הביקורות'}</span>
        <div class="d2-accent-num"><b>${P.toHandle ? n(P.toHandle) : '✓'}</b><small>${P.toHandle ? [P.g.unanswered ? `${n(P.g.unanswered)} בגוגל` : '', P.stats.openIssues ? `${n(P.stats.openIssues)} מסקרים` : ''].filter(Boolean).join(' · ') : 'אין ביקורות שמחכות'}</small></div>
      </a>

      <section class="d2-card d2-maps">
        <div class="d2-card-h"><h3>מיקום בגוגל מפות</h3><a class="d2-round" href="/admin/maps#rank" aria-label="למיקום במפות">${icon('chevron', 16)}</a></div>
        ${mapGrid(grid)}
      </section>

      <section class="d2-card d2-chart">
        <div class="d2-card-h"><h3>ביקורות ודירוגים</h3><span class="d2-pill">${h(args.period.label)}</span></div>
        ${P.total ? bars(P.daily) : '<p class="d2-empty">אין עדיין ביקורות בתקופה הזו.</p>'}
      </section>

      <section class="d2-card d2-week" id="todo">
        <div class="d2-card-h"><h3>מה לעשות עכשיו</h3><a class="d2-round" href="/admin/growth" aria-label="לכל הפעולות">${icon('chevron', 16)}</a></div>
        ${week(items)}
      </section>

      <section class="d2-card d2-dist">
        <div class="d2-card-h"><h3>התפלגות כוכבים</h3></div>
        ${stars(P.dist)}
      </section>

      <section class="d2-card d2-rivals">
        <div class="d2-card-h"><h3>אתם מול המתחרים</h3><a class="d2-round" href="/admin/competitors" aria-label="למתחרים">${icon('chevron', 16)}</a></div>
        ${board(me, competitors)}
      </section>
    </div>

    ${arrival?.connected && (arrival.failed || (arrival.fresh && arrival.pending)) ? `<section class="d2-card">${arrivalCard(arrival, { compact: true })}</section>` : ''}
    ${dataSection(args, P)}
    ${FOLD_SCRIPT}
    <p class="d2-switch"><a href="/admin?classic=1">לתצוגה הקודמת</a></p>
  </div>`;
}
