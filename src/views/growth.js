import { h } from '../util.js';
import { CADENCE, DIRECTORIES, growthScoreLabel, localSchema, TRACKS, WRITERS } from '../growth.js';
import { icon } from './icons.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;
const TRACK_ICONS = { profile: 'pin', site: 'web', web: 'branches', ai: 'spark' };
const STATE = { done: ['בוצע', 'done'], partial: ['חלקית', 'partial'], todo: ['לביצוע', 'todo'] };

function scoreRing(score) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return `<svg class="gr-ring" viewBox="0 0 120 120" role="img" aria-label="ציון קידום ${score} מתוך 100">
    <circle cx="60" cy="60" r="${r}" class="gr-ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="gr-ring-fg" stroke-dasharray="${((score / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="66" text-anchor="middle">${score}</text>
  </svg>`;
}

function hero(plan) {
  return `<section class="card gr-hero">
    <div class="gr-hero-score">${scoreRing(plan.score)}<div><span class="muted small">ציון הקידום</span><b>${h(growthScoreLabel(plan.score))}</b><span class="muted small">עולה עם כל פעולה שמבצעים</span></div></div>
    <div class="gr-tracks">${Object.entries(TRACKS)
      .map(
        ([k, label]) => `<a class="gr-track" href="#t-${k}">${icon(TRACK_ICONS[k], 16)}<span>${h(label)}</span>
          <span class="gr-bar"><span style="width:${plan.tracks[k].score}%"></span></span><b>${plan.tracks[k].score}</b></a>`,
      )
      .join('')}</div>
    ${
      plan.next.length
        ? `<div class="gr-next"><h3>${icon('check', 18)} הכי שווה לעשות עכשיו</h3><ol>${plan.next
            .map((i) => `<li><a href="#a-${h(i.key)}">${h(i.title)}</a>${i.cadence !== 'once' ? ` <span class="gr-chip">${h(CADENCE[i.cadence])}</span>` : ''}</li>`)
            .join('')}</ol></div>`
        : '<p class="flash">כל הפעולות בוצעו. ממשיכים בשגרה: פוסט ותמונות כל שבוע, תוכן וקישור כל חודש.</p>'
    }
  </section>`;
}

function servicesCard(facts, csrf, can) {
  return `<details class="card gr-services"${facts.services ? '' : ' open'}>
    <summary><b>${icon('gear', 18)} על העסק, בשביל ה-AI</b><span class="muted small">${facts.services ? 'עריכה' : 'שתי דקות, ומשפר כל טקסט שה-AI כותב'}</span></summary>
    <form method="post" action="/admin/growth/services" class="stack">
      ${csrfField(csrf)}
      <label>השירותים העיקריים, ומה מייחד אתכם
        <textarea name="services" rows="3" maxlength="600" placeholder="למשל: תספורות גברים וילדים, עיצוב זקן. 12 שנה בשכונה, בלי תור מראש בבקרים, חניה חינם." ${can ? '' : 'disabled'}>${h(facts.services)}</textarea></label>
      ${can ? '<button class="btn">שמירה</button>' : ''}
    </form>
  </details>`;
}

function siteCard(plan, csrf, can, running) {
  const s = plan.site;
  const site = plan.facts.website;
  const chip = (ok, yes, no) => `<span class="gr-check ${ok ? 'ok' : ok === null ? 'na' : 'no'}"><i aria-hidden="true">${ok ? '✓' : ok === null ? '—' : '✗'}</i> <span>${h(ok === false ? no : yes)}</span></span>`;
  return `<div class="gr-site" id="site">
    <h3>${icon('web', 18)} בדיקת האתר</h3>
    ${
      site
        ? `<p class="muted small">האתר: <a href="${h(site)}" target="_blank" rel="noopener" dir="ltr">${h(site.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>${plan.siteCheckedAt ? ` · נבדק <span dir="ltr">${h(String(plan.siteCheckedAt).slice(0, 10))}</span>` : ''}. בודקים פעם בשבוע, ואפשר גם עכשיו.</p>`
        : '<p class="muted">עוד לא ידוע מה האתר של העסק. הוסיפו אותו כדי שהמערכת תבדוק מה חסר בו.</p>'
    }
    ${running ? '<div class="warn">בודקים את האתר עכשיו…</div><script>setTimeout(function(){location.replace(location.pathname+"#site")},6000)</script>' : ''}
    ${s?.error ? `<div class="error">${h(s.error)}</div>` : ''}
    ${
      s && !s.error
        ? `<div class="gr-checks">
            ${chip(Boolean(s.title), 'כותרת לדף', 'אין כותרת לדף')}
            ${chip(Boolean(s.description), 'תיאור לגוגל', 'אין תיאור לגוגל')}
            ${chip(s.viewport, 'מותאם לטלפון', 'לא מותאם לטלפון')}
            ${chip(s.https, 'מאובטח (https)', 'לא מאובטח')}
            ${chip(s.cityInHead, 'העיר בכותרת', 'העיר לא בכותרת')}
            ${chip(s.phoneOnPage, 'הטלפון בדף', 'הטלפון לא בדף')}
            ${chip(s.mapLink, 'קישור למפה', 'אין קישור למפה')}
            ${chip(s.localSchema, 'סימון עסק מקומי', 'אין סימון עסק מקומי')}
            ${chip(s.faqSchema, 'סימון FAQ', 'אין סימון FAQ')}
          </div>
          ${s.title ? `<p class="small"><span class="muted">כותרת הדף:</span> <span dir="auto">${h(s.title)}</span></p>` : ''}`
        : ''
    }
    ${
      can
        ? `<form method="post" action="/admin/growth/site" class="row compact gr-site-form">
            ${csrfField(csrf)}
            <input name="url" type="url" dir="ltr" placeholder="https://www.example.co.il" value="${h(site)}" aria-label="כתובת האתר" required>
            <button class="btn primary">${site ? 'בדיקה עכשיו' : 'שמירה ובדיקה'}</button>
          </form>`
        : ''
    }
  </div>`;
}

function writer(item, drafts, aiOn, can) {
  if (!item.write) return '';
  const d = drafts[item.write];
  const label = WRITERS[item.write];
  return `<div class="gr-write" data-kind="${h(item.write)}">
    ${aiOn && can ? `<button type="button" class="btn ai-btn gr-write-btn" data-write="${h(item.write)}">${icon('spark', 16)}<span class="gr-wl">${d ? 'לכתוב שוב' : 'לכתוב עם AI'}</span><span>${h(label)}</span></button>` : ''}
    <div class="gr-out"${d ? '' : ' hidden'}>
      <textarea class="gr-text" rows="10" dir="auto" aria-label="${h(label)}">${h(d?.text || '')}</textarea>
      <div class="row compact"><button type="button" class="btn btn-sm" data-copy>העתקה</button><span class="muted small">טיוטה: קראו, תקנו מה שצריך, והוסיפו מהניסיון שלכם.</span></div>
    </div>
  </div>`;
}

function extras(item, plan, csrf, can) {
  if (item.directories) {
    const f = plan.facts;
    return `<div class="gr-nap"><span class="muted small">הפרטים, זהים בכל מקום:</span>
        <div class="gr-nap-box">${[f.name, f.address, f.phone, f.website].filter(Boolean).map((l) => `<div dir="auto">${h(l)}</div>`).join('')}</div></div>
      <ul class="gr-dirs">${DIRECTORIES.map(
        ([k, label, url]) => `<li><form method="post" action="/admin/growth/mark">${csrfField(csrf)}<input type="hidden" name="key" value="dir:${k}"><input type="hidden" name="on" value="${plan.marks.has(k) ? '0' : '1'}">
          <button class="gr-dir ${plan.marks.has(k) ? 'on' : ''}" ${can ? '' : 'disabled'} aria-pressed="${plan.marks.has(k)}"><i aria-hidden="true">${plan.marks.has(k) ? '✓' : '○'}</i> <span>${h(label)}</span></button></form>
          <a href="${h(url)}" target="_blank" rel="noopener" class="small">לאתר</a></li>`,
      ).join('')}</ul>`;
  }
  if (item.schema) {
    return `<div class="gr-code"><textarea class="gr-text" rows="9" dir="ltr" readonly aria-label="קוד לאתר">${h(localSchema(plan.facts))}</textarea>
      <div class="row compact"><button type="button" class="btn btn-sm" data-copy>העתקת הקוד</button></div></div>`;
  }
  if (item.sources) {
    return plan.sources.length
      ? `<div class="gr-sources"><span class="muted small">האתרים שה-AI הסתמך עליהם בבדיקה האחרונה שלכם:</span><ul>${plan.sources
          .map((s) => `<li><a href="https://${h(s)}" target="_blank" rel="noopener" dir="ltr">${h(s)}</a></li>`)
          .join('')}</ul></div>`
      : '<p class="muted small">אחרי בדיקת נראות ב-AI יופיעו כאן האתרים שה-AI מסתמך עליהם בתחום שלכם.</p>';
  }
  return '';
}

function detailLine(detail) {
  if (!detail.length) return '';
  return `<span class="gr-detail">${detail
    .map((d) => (typeof d === 'string' ? `<span>${h(d)}</span>` : `<span>חסר:</span> ${d.miss.map((m) => `<span>${h(m)}</span>`).join(', ')}`))
    .join(' · ')}</span>`;
}

function actionItem(item, plan, drafts, { csrf, can, aiOn }) {
  const [stateLabel, cls] = STATE[item.state];
  const markable = !item.auto || item.state !== 'done' || item.byHand;
  return `<details class="gr-item ${cls}" id="a-${h(item.key)}">
    <summary>
      <span class="gr-state" title="${h(stateLabel)}">${item.state === 'done' ? icon('check', 16) : ''}</span>
      <span class="gr-title"><b>${h(item.title)}</b>
        <span class="gr-chips">${item.cadence !== 'once' ? `<span class="gr-chip">${h(CADENCE[item.cadence])}</span>` : ''}${item.ai && item.track !== 'ai' ? '<span class="gr-chip ai">משפיע גם על AI</span>' : ''}${item.auto ? '<span class="gr-chip auto">נבדק אוטומטית</span>' : ''}</span>
        ${detailLine(item.detail)}
      </span>
    </summary>
    <div class="gr-body">
      <p>${h(item.why)}</p>
      <ol class="gr-how">${item.how.map((s) => `<li>${h(s)}</li>`).join('')}</ol>
      ${extras(item, plan, csrf, can)}
      ${writer(item, drafts, aiOn, can)}
      <div class="row compact gr-actions">
        ${item.href ? `<a class="btn btn-sm" href="${h(item.href)}">${h(item.hrefLabel || 'לביצוע')}</a>` : ''}
        ${item.link ? `<a class="btn btn-sm" href="${h(item.link[0])}" target="_blank" rel="noopener">${h(item.link[1])}</a>` : ''}
        ${
          can && markable
            ? `<form method="post" action="/admin/growth/mark">${csrfField(csrf)}<input type="hidden" name="key" value="${h(item.key)}"><input type="hidden" name="on" value="${item.byHand ? '0' : '1'}">
                <button class="btn btn-sm ${item.byHand ? '' : 'primary'}">${item.byHand ? 'ביטול הסימון' : item.cadence === 'week' ? 'בוצע השבוע ✓' : item.cadence === 'month' ? 'בוצע החודש ✓' : 'בוצע ✓'}</button></form>`
            : ''
        }
      </div>
    </div>
  </details>`;
}

const SCRIPT = `<script>(function(){var csrf=document.getElementById('gr-csrf').value;
document.addEventListener('click',function(e){var c=e.target.closest('[data-copy]');
if(c){var t=c.closest('.gr-out,.gr-code').querySelector('textarea');t.select();(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).catch(function(){document.execCommand('copy')});var l=c.textContent;c.textContent='הועתק ✓';setTimeout(function(){c.textContent=l},1500);return}
var b=e.target.closest('[data-write]');if(!b||b.disabled)return;var box=b.closest('.gr-write'),out=box.querySelector('.gr-out'),ta=out.querySelector('textarea'),s=b.querySelector('.gr-wl'),label=s.textContent;
b.disabled=true;b.classList.add('ai-busy');s.textContent='ה-AI כותב… (עד דקה)';
fetch('/admin/growth/write',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf,kind:b.getAttribute('data-write')})})
.then(function(r){return r.json()}).then(function(j){if(j.error){alert(j.error);return}ta.value=j.text;out.hidden=false;fit(ta)})
.catch(function(){alert('לא הצלחנו לכתוב עכשיו, נסו שוב.')}).finally(function(){b.disabled=false;b.classList.remove('ai-busy');s.textContent=label})});
function fit(t){t.style.height='';t.style.height=Math.min(t.scrollHeight+4,520)+'px'}
document.querySelectorAll('.gr-item').forEach(function(d){d.addEventListener('toggle',function(){if(d.open)d.querySelectorAll('.gr-out:not([hidden]) textarea').forEach(fit)})});
var id=location.hash.slice(1),d=id&&document.getElementById(id);if(d&&d.tagName==='DETAILS')d.open=true;document.querySelectorAll('details[open] .gr-out:not([hidden]) textarea').forEach(fit)})();</script>`;

const fmtGoal = (v, unit) => (v == null ? '—' : `${Number(v).toLocaleString('he-IL')}${unit === '%' ? '%' : ''}`);

/** Stage 2: goals against the area, ways to grow, and the weekly routine. */
function stage2Card(stage2) {
  if (!stage2) return '';
  if (!stage2.open) {
    return `<section class="card gr-stage2 locked"><h2>${icon('trophy', 20)} שלב 2: להוביל באזור</h2>
      <p class="muted">נפתח כשציון הקידום מגיע ל-${stage2.at}. שם מקבלים יעדים מול המתחרים: כמה פעמים אתם בטופ 3 במפות, כמה ביקורות חסרות למוביל, וכמה ה-AI ממליץ עליכם.</p></section>`;
  }
  const { goals, more, routine } = stage2;
  return `<section class="card gr-stage2" id="stage2">
    <h2>${icon('trophy', 20)} שלב 2: להוביל באזור</h2>
    <p class="muted">הבסיס במקום. מעכשיו מודדים מול האזור: יעדים שמתעדכנים מהבדיקות השבועיות.</p>
    ${
      goals.length
        ? `<div class="gl-goals">${goals
            .map((g) => {
              const delta = g.before != null ? g.now - g.before : null;
              return `<a class="gl-goal" href="${h(g.href)}">
                <span class="gl-title"><b>${h(g.title)}</b>${g.sub ? `<span class="muted small" dir="auto">${h(g.sub)}</span>` : ''}${delta ? `<span class="gl-delta ${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${fmtGoal(Math.abs(delta), g.unit)} <span>מלפני חודש</span></span>` : ''}</span>
                <span class="gl-nums"><b>${fmtGoal(g.now, g.unit)}</b><span class="muted">מתוך יעד של</span> <span>${fmtGoal(g.target, g.unit)}</span>${g.unit && g.unit !== '%' ? ` <span class="muted">${h(g.unit)}</span>` : ''}</span>
                <span class="gr-bar gl-bar"><span style="width:${Math.round(g.progress * 100)}%"></span></span>
                <span class="muted small">${h(g.how)}</span>
              </a>`;
            })
            .join('')}</div>`
        : '<p class="muted small">היעדים מופיעים אחרי בדיקת מיקום במפות, הוספת מתחרים ובדיקת נראות ב-AI.</p>'
    }
    <div class="gl-row">
      <div class="gl-routine"><h3>${icon('clock', 18)} השגרה השבועית</h3>
        <ul>${routine.items.map((i) => `<li class="${i.done ? 'done' : ''}"><a href="${h(i.href)}"><span class="gr-state">${i.done ? icon('check', 14) : ''}</span><span>${h(i.title)}</span></a></li>`).join('')}</ul>
        <p class="gl-streak">${routine.streak ? `<b>${routine.streak}</b> <span>${routine.streak === 1 ? 'שבוע ברצף' : 'שבועות ברצף'}</span>` : '<span class="muted small">פוסט ותמונות השבוע מתחילים רצף.</span>'}</p>
      </div>
      <div class="gl-more"><h3>${icon('plus', 18)} לגדול לעוד חיפושים</h3>
        <ul>${more.map((m) => `<li><a href="${h(m.href)}"><b>${h(m.title)}</b>${m.detail ? ` <span class="gr-chip">${h(m.detail)}</span>` : ''}<span class="muted small">${h(m.why)}</span></a></li>`).join('')}</ul>
      </div>
    </div>
  </section>`;
}

function urgentCard(urgent) {
  if (!urgent.length) return '';
  return `<section class="card gr-urgent"><h2>${icon('alert', 20)} דחוף עכשיו</h2>
    <ol class="todo-list">${urgent
      .map(
        (t) => `<li class="urgent"><a href="${h(t.href)}"><span class="todo-text"><b>${h(t.title)}</b><span class="muted small">${h(t.why)}</span></span><span class="todo-go">${icon('chevron', 16)}</span></a></li>`,
      )
      .join('')}</ol></section>`;
}

export function growthView({ plan, urgent = [], stage2 = null, drafts, csrf, can, aiOn, running = false, notice = '', error = '' }) {
  return `<div class="page-head"><h1>${icon('check', 26)} קידום בגוגל מפות</h1></div>
    <p class="page-intro">כל מה שמקדם את העסק בגוגל מפות ובתשובות של ChatGPT ו-Gemini, ברשימה אחת: קודם מה שדחוף, ואחריו תוכנית הקידום. מה שהמערכת יכולה לבדוק, היא מסמנת לבד, וה-AI כותב בשבילכם את התוכן.</p>
    ${notice ? `<div class="flash">${h(notice)}</div>` : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    <input type="hidden" id="gr-csrf" value="${h(csrf)}">
    ${urgentCard(urgent)}
    ${hero(plan)}
    ${stage2?.open ? stage2Card(stage2) : ''}
    ${servicesCard(plan.facts, csrf, can)}
    ${Object.entries(TRACKS)
      .map(
        ([k, label]) => `<section class="card gr-track-card" id="t-${k}">
          <h2>${icon(TRACK_ICONS[k], 20)} ${h(label)} <span class="gr-track-score">${plan.tracks[k].score}<small>/100</small></span></h2>
          ${k === 'site' ? siteCard(plan, csrf, can, running) : ''}
          <div class="gr-list">${plan.tracks[k].items.map((i) => actionItem(i, plan, drafts, { csrf, can, aiOn })).join('')}</div>
        </section>`,
      )
      .join('')}
    ${stage2 && !stage2.open ? stage2Card(stage2) : ''}
    ${SCRIPT}`;
}
