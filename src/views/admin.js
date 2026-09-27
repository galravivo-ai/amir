import { EDITABLE_TEXT_KEYS, PUBLIC_TEXTS } from '../i18n.js';
import { AUDIENCES, QUESTION_TYPES, STATUSES } from '../store.js';
import { formatDate, h, safeColor, waLink } from '../util.js';
import { parseJson } from '../db.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;
const pct = (x) => `${Math.round(x * 100)}%`;
const stars = (n) => `<span class="stars-sm">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

// ---------------------------------------------------------------- dashboard

function kpi(label, value, hint = '') {
  return `<div class="kpi"><div class="kpi-label">${h(label)}</div><div class="kpi-value">${value}</div>${
    hint ? `<div class="kpi-hint">${h(hint)}</div>` : ''
  }</div>`;
}

function dailyChart(daily) {
  const w = 720;
  const hgt = 180;
  const pad = 24;
  const max = Math.max(1, ...daily.map((d) => Math.max(d.scans, d.responses)));
  const step = (w - pad * 2) / daily.length;
  const bw = Math.max(2, step * 0.38);
  const y = (v) => hgt - pad - (v / max) * (hgt - pad * 2);
  const bars = daily
    .map((d, i) => {
      const x = pad + i * step;
      return `<g><title>${h(d.date)}: ${d.scans} סריקות, ${d.responses} תגובות, ${d.negative} שליליות</title>
        <rect x="${x}" y="${y(d.scans)}" width="${bw}" height="${hgt - pad - y(d.scans)}" class="bar-scans"/>
        <rect x="${x + bw}" y="${y(d.responses)}" width="${bw}" height="${hgt - pad - y(d.responses)}" class="bar-resp"/>
        <rect x="${x + bw}" y="${y(d.negative)}" width="${bw}" height="${hgt - pad - y(d.negative)}" class="bar-neg"/>
      </g>`;
    })
    .join('');
  const first = daily[0]?.date.slice(5) ?? '';
  const last = daily.at(-1)?.date.slice(5) ?? '';
  return `<svg viewBox="0 0 ${w} ${hgt}" class="chart" role="img" aria-label="מגמה יומית" direction="ltr">
    <line x1="${pad}" y1="${hgt - pad}" x2="${w - pad}" y2="${hgt - pad}" class="axis"/>
    <text x="${pad}" y="${hgt - 6}" class="tick">${first}</text>
    <text x="${w - pad}" y="${hgt - 6}" class="tick" text-anchor="end">${last}</text>
    <text x="${pad}" y="14" class="tick">${max}</text>
    ${bars}
  </svg>
  <div class="legend"><span class="sw scans"></span>סריקות <span class="sw resp"></span>תגובות <span class="sw neg"></span>לא מרוצים</div>`;
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

export function dashboardView({ stats, campaigns, campaignId, days, recentNegative, quotaWarning = '', can = () => true }) {
  const filter = `<form method="get" class="filters">
      <select name="campaign"><option value="">כל הקמפיינים</option>${campaigns
        .map((c) => `<option value="${c.id}" ${c.id === campaignId ? 'selected' : ''}>${h(c.name)}</option>`)
        .join('')}</select>
      <select name="days">${[7, 30, 90, 365]
        .map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>${d} ימים</option>`)
        .join('')}</select>
      <button class="btn">סינון</button>
    </form>`;

  if (!campaigns.length) {
    return `<h1>ברוכים הבאים!</h1>
      <div class="card empty">
        <p>השלב הראשון: ליצור קמפיין (למשל "סניף ראשי" או "קופה"). כל קמפיין מקבל QR וקישור משלו.</p>
        ${can('manager') ? '<a class="btn primary" href="/admin/campaigns/new">יצירת קמפיין ראשון</a>' : '<p class="muted">מנהל העסק עוד לא יצר קמפיין.</p>'}
      </div>`;
  }

  const resolve =
    stats.avgResolveHours == null
      ? '—'
      : stats.avgResolveHours < 1
        ? `${Math.max(1, Math.round(stats.avgResolveHours * 60))} דק׳`
        : stats.avgResolveHours < 48
          ? `${stats.avgResolveHours.toFixed(1)} שע׳`
          : `${(stats.avgResolveHours / 24).toFixed(1)} ימים`;
  return `<div class="page-head"><h1>לוח בקרה</h1>${filter}</div>
    ${quotaWarning ? `<div class="warn">${h(quotaWarning)}</div>` : ''}
    ${
      stats.overdue
        ? `<a class="alert-bar" href="/admin/responses?overdue=1">⚠ ${stats.overdue} פניות של לקוחות לא מרוצים ממתינות מעבר לזמן הטיפול שהוגדר. לטיפול ←</a>`
        : ''
    }
    <div class="kpis">
      ${kpi('סריקות / כניסות', stats.scans, `${stats.uniqueVisitors} מבקרים ייחודיים`)}
      ${kpi('דירוגים', stats.responses, `${pct(stats.responseRate)} מהכניסות`)}
      ${kpi('דירוג ממוצע', stats.avgRating ? stats.avgRating.toFixed(2) : '—', `${stats.positive} מרוצים · ${stats.negative} לא מרוצים`)}
      ${kpi('קליקים לביקורת', stats.reviewClicks, `${pct(stats.reviewConversion)} מהמדרגים`)}
      ${kpi('NPS', stats.nps ?? '—', stats.npsCount ? `${stats.npsCount} עונים` : 'אין נתונים')}
      ${kpi('פניות פתוחות', `<a href="/admin/responses?sentiment=negative&status=new">${stats.openIssues}</a>`, stats.overdue ? `${stats.overdue} באיחור` : 'לקוחות לא מרוצים שממתינים')}
      ${kpi('זמן טיפול ממוצע', resolve, 'מקבלת הפנייה ועד שטופלה')}
    </div>
    <div class="grid2">
      <section class="card"><h3>מגמה יומית</h3>${dailyChart(stats.daily)}</section>
      <section class="card"><h3>התפלגות דירוגים</h3>${distribution(stats.distribution)}</section>
    </div>
    <div class="grid2">
      <section class="card"><h3>מה הלקוחות אומרים</h3>${optionBreakdown(stats.optionCounts)}</section>
      <section class="card"><h3>מקורות סריקה</h3>
        ${
          stats.sources.length
            ? `<table class="table"><thead><tr><th>מקור</th><th>סריקות</th></tr></thead><tbody>${stats.sources
                .map((s) => `<tr><td>${h(s.source || 'ללא מקור')}</td><td>${s.scans}</td></tr>`)
                .join('')}</tbody></table>`
            : '<p class="muted">אין עדיין סריקות. אפשר להוסיף <code>?src=table-4</code> לקישור כדי לדעת מאיפה הגיעו.</p>'
        }
      </section>
    </div>
    <section class="card">
      <h3>לקוחות לא מרוצים אחרונים</h3>
      ${responsesTable(recentNegative)}
    </section>`;
}

// ---------------------------------------------------------------- responses

function statusBadge(status) {
  return `<span class="badge st-${h(status)}">${h(STATUSES[status] || status)}</span>`;
}

export function responsesTable(rows) {
  if (!rows.length) return '<p class="muted">אין תגובות להצגה.</p>';
  return `<table class="table responsive">
    <thead><tr><th>תאריך</th><th>קמפיין</th><th>דירוג</th><th>הערה</th><th>לקוח</th><th>ביקורת</th><th>סטטוס</th></tr></thead>
    <tbody>${rows
      .map((r) => {
        const clicks = parseJson(r.review_clicks, []);
        return `<tr class="${r.sentiment}${r.overdue ? ' late' : ''}">
          <td data-l="תאריך"><a href="/admin/responses/${r.id}">${h(formatDate(r.created_at))}</a></td>
          <td data-l="קמפיין">${h(r.campaign_name)}${r.source ? `<div class="muted small">${h(r.source)}</div>` : ''}</td>
          <td data-l="דירוג">${stars(r.rating)}</td>
          <td data-l="הערה" class="clip">${h(r.comment) || (r.completed ? '' : '<span class="muted small">לא השלים סקר</span>')}</td>
          <td data-l="לקוח">${h(r.customer_name)} ${r.phone ? `<div class="small" dir="ltr">${h(r.phone)}</div>` : ''}</td>
          <td data-l="ביקורת">${clicks.length ? h(clicks.join(', ')) : '—'}</td>
          <td data-l="סטטוס">${
            r.sentiment === 'negative'
              ? `${statusBadge(r.status)}${r.overdue ? ' <span class="badge st-late">באיחור</span>' : ''}`
              : `<span class="badge st-ok">מרוצה</span>${r.published ? ' <span class="badge st-pub">באתר</span>' : ''}`
          }</td>
        </tr>`;
      })
      .join('')}</tbody></table>`;
}

export function responsesView({ rows, campaigns, filters, page, hasMore }) {
  const opt = (value, label, current) =>
    `<option value="${h(value)}" ${String(current ?? '') === String(value) ? 'selected' : ''}>${h(label)}</option>`;
  const qs = (p) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    params.set('page', p);
    return params.toString();
  };
  const exportParams = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return `<div class="page-head"><h1>תגובות</h1>
      <a class="btn" href="/admin/responses.csv?${h(exportParams)}">ייצוא CSV</a></div>
    <form method="get" class="filters">
      <select name="campaign">${opt('', 'כל הקמפיינים', filters.campaign)}${campaigns
        .map((c) => opt(c.id, c.name, filters.campaign))
        .join('')}</select>
      <select name="sentiment">${opt('', 'כל הדירוגים', filters.sentiment)}${opt(
        'positive',
        'מרוצים',
        filters.sentiment,
      )}${opt('negative', 'לא מרוצים', filters.sentiment)}</select>
      <select name="status">${opt('', 'כל הסטטוסים', filters.status)}${Object.entries(STATUSES)
        .map(([k, v]) => opt(k, v, filters.status))
        .join('')}</select>
      <label class="check"><input type="checkbox" name="overdue" value="1" ${filters.overdue ? 'checked' : ''}> באיחור בלבד</label>
      <label class="check"><input type="checkbox" name="consent" value="1" ${filters.consent ? 'checked' : ''}> אישרו פרסום</label>
      <input name="q" placeholder="חיפוש בשם / טלפון / הערה" value="${h(filters.q)}">
      <button class="btn">סינון</button>
    </form>
    <div class="card">${responsesTable(rows)}</div>
    <div class="pager">
      ${page > 1 ? `<a class="btn" href="?${h(qs(page - 1))}">הקודם</a>` : ''}
      ${hasMore ? `<a class="btn" href="?${h(qs(page + 1))}">הבא</a>` : ''}
    </div>`;
}

export function responseDetailView({ r, csrf, businessName, can = () => true, aiAvailable = false, widgetAvailable = false, aiError = '' }) {
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
          <dt>השלים סקר</dt><dd>${r.completed ? 'כן' : 'לא (רק דירג)'}</dd>
          <dt>לחץ על ביקורת</dt><dd>${clicks.length ? h(clicks.join(', ')) : 'לא'}</dd>
          ${Object.entries(answers)
            .map(([k, v]) => `<dt>${h(labelOf[k] || k)}</dt><dd>${h([].concat(v).join(', '))}</dd>`)
            .join('')}
          <dt>הערה</dt><dd class="pre">${h(r.comment) || '—'}</dd>
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
      </section>
    </div>
    ${r.sentiment === 'negative' && can('manager') ? draftSection({ r, csrf, aiAvailable, aiError }) : ''}
    ${r.publish_consent && widgetAvailable ? publishSection({ r, csrf, canEdit: can('manager') }) : ''}`;
}

function draftSection({ r, csrf, aiAvailable, aiError }) {
  const button = aiAvailable
    ? `<form method="post" action="/admin/responses/${r.id}/draft" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='כותב...'">
        ${csrfField(csrf)}<button class="btn">${r.ai_draft ? 'ניסוח מחדש' : '✨ ניסוח תשובה עם AI'}</button></form>`
    : '<p class="muted small">ניסוח תשובה עם AI זמין בתוכנית מקצועי ומעלה, כשמפתח ה-AI מוגדר בשרת.</p>';
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

export function campaignsView({ campaigns, baseUrl, can = () => true, limitReached = '' }) {
  const newButton = can('manager') && !limitReached ? '<a class="btn primary" href="/admin/campaigns/new">+ קמפיין חדש</a>' : '';
  return `<div class="page-head"><h1>קמפיינים ו-QR</h1>${newButton}</div>
    ${limitReached && can('manager') ? `<div class="warn">${h(limitReached)}</div>` : ''}
    <p class="muted">כל קמפיין = קישור + QR משלו, עם שאלות, סף שביעות רצון ויעדי ביקורת. מתאים לסניפים, עמדות, עובדים או ערוצים שונים.</p>
    ${
      campaigns.length
        ? `<div class="cards">${campaigns
            .map((c) => {
              const url = `${baseUrl}/r/${c.slug}`;
              return `<div class="card camp">
                <img class="qr-thumb" src="/admin/campaigns/${c.id}/qr.svg" alt="QR">
                <div>
                  <h3>${h(c.name)} ${c.active ? '' : '<span class="badge st-closed">מושבת</span>'}</h3>
                  <div class="small" dir="ltr"><a href="${h(url)}" target="_blank" rel="noopener">${h(url)}</a></div>
                  <div class="small muted">סף מרוצים: ${c.threshold}★ ומעלה · ${c.questionsList.length} שאלות · ${c.google_review_url ? 'גוגל מחובר' : '<b>חסר קישור גוגל</b>'}</div>
                  <div class="actions">
                    ${can('manager') ? `<a class="btn" href="/admin/campaigns/${c.id}">עריכה</a>` : ''}
                    <a class="btn" href="/admin/campaigns/${c.id}/share">QR, שלטים ושליחה</a>
                    <a class="btn" href="/admin?campaign=${c.id}">נתונים</a>
                  </div>
                </div>
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
          <option value="he" ${c.lang === 'he' ? 'selected' : ''}>עברית</option>
          <option value="en" ${c.lang === 'en' ? 'selected' : ''}>English</option>
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

export function shareView({ campaign, baseUrl, csrf, invites, newInvite, businessName, can = () => true, emailInvites = false, mailEnabled = false }) {
  const url = `${baseUrl}/r/${campaign.slug}`;
  const inviteUrl = (t) => `${url}?i=${t}`;
  const inviteMsg = (inv) =>
    `היי ${inv.customer_name || ''}! תודה שבחרת ב${businessName}. נשמח לשמוע איך היה (פחות מדקה): ${inviteUrl(inv.token)}`;
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
        <a class="btn" href="/admin/campaigns/${campaign.id}/poster" target="_blank">שלט להדפסה</a>
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
        <button class="btn primary">יצירת קישור</button>
        ${emailInvites && !mailEnabled ? '<p class="muted small">שימו לב: שליחת מיילים עוד לא הוגדרה בשרת, ההודעות נשמרות ביומן בלבד.</p>' : ''}
      </form>`
          : ''
      }
      ${
        newInvite
          ? `<div class="flash">${newInvite.email_sent_at ? `נשלח מייל ל-<span dir="ltr">${h(newInvite.email)}</span>. ` : ''}נוצר קישור: <span dir="ltr">${h(inviteUrl(newInvite.token))}</span>
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
                  ${inv.email_sent_at ? `<div class="small muted">✉ נשלח במייל${inv.reminder_sent_at ? ' + תזכורת' : ''}</div>` : ''}</td>
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

export function posterView({ campaign, business, qrSvg, t }) {
  return `<!doctype html><html lang="${h(campaign.lang)}" dir="${h(t.dir)}"><head><meta charset="utf-8">
  <title>${h(business.name)} · QR</title><link rel="stylesheet" href="/static/style.css">
  <style>:root{--brand:${safeColor(business.brand_color)}}</style></head>
  <body class="poster"><div class="poster-inner">
    ${business.logo_url ? `<img class="logo" src="${h(business.logo_url)}" alt="">` : ''}
    <h1>${h(t.title)}</h1>
    <p>${h(t.subtitle)}</p>
    <div class="poster-qr">${qrSvg}</div>
    <div class="poster-stars">★★★★★</div>
    <p class="poster-biz">${h(business.name)}</p>
    <button class="btn primary noprint" onclick="print()">הדפסה</button>
  </div></body></html>`;
}
