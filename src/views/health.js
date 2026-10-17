import { formatDate, h } from '../util.js';
import { parseJson } from '../db.js';
import { scoreLabel } from '../health.js';
import { renderInsight } from './settings.js';
import { icon } from './icons.js';

const MARK = { pass: ['✓', 'ok'], partial: ['!', 'mid'], fail: ['✗', 'bad'], unknown: ['?', 'unk'] };

function ring(score) {
  const tone = score >= 85 ? 'good' : score >= 70 ? 'okay' : score >= 50 ? 'mid' : 'bad';
  return `<div class="hl-ring ${tone}" style="--p:${score}" role="img" aria-label="ציון ${score} מתוך 100"><b>${score}</b><small>מתוך 100</small></div>`;
}

/** The AI's advice, with the suggested description in a box to copy. */
function tipsBlock(tips, id) {
  const parts = String(tips).split(/^##\s*/m).filter((p) => p.trim());
  return parts
    .map((part) => {
      const [title, ...rest] = part.split('\n');
      const body = rest.join('\n').trim();
      if (/תיאור|description/i.test(title)) {
        return `<div class="hl-desc"><h4>${h(title.trim())}</h4>
          <textarea id="desc-${id}" rows="5" readonly>${h(body)}</textarea>
          <button type="button" class="btn" onclick="var t=document.getElementById('desc-${id}');navigator.clipboard.writeText(t.value).then(function(){event.target.textContent='הועתק ✓'})">העתקה</button>
          <span class="muted small">מדביקים בפרופיל העסק בגוגל ← עריכת פרופיל ← תיאור.</span></div>`;
      }
      return renderInsight(`## ${title}\n${body}`);
    })
    .join('');
}

/** The profile check: a score and checklist per place, inside the maps page. */
export function healthSection({ audits, locations, running, csrf, can, available, runsLeft = null }) {
  const byLoc = new Map(audits.map((a) => [a.location_id, a]));
  const cards = locations
    .map((loc) => {
      const a = byLoc.get(loc.id);
      if (!a) return `<section class="card"><h3>${h(loc.title)}</h3><p class="muted">עוד לא נבדק. לחצו "בדיקת פרופיל".</p></section>`;
      if (a.error) return `<section class="card"><h3>${h(loc.title)}</h3><p class="danger-text">הבדיקה האחרונה נכשלה: ${h(a.error)}</p></section>`;
      const items = parseJson(a.items, []);
      const todo = items.filter((i) => i.state === 'fail' || i.state === 'partial');
      const change = a.prev_score != null ? a.score - a.prev_score : null;
      return `<section class="card hl-card">
        <div class="hl-top">
          ${ring(a.score)}
          <div><h3>${h(loc.title)}</h3><div class="hl-label">${scoreLabel(a.score)}${
            change ? ` <span class="cmp-change ${change > 0 ? 'up' : 'down'}">${change > 0 ? '▲' : '▼'} ${Math.abs(change)} מהחודש שעבר</span>` : ''
          }</div>
            <div class="muted small">נבדק ${h(formatDate(`${a.run_at.replace(' ', 'T')}Z`))} · ${todo.length ? `${todo.length} דברים לשפר` : 'הכול תקין'}</div></div>
        </div>
        <ul class="hl-list">${items
          .map((i) => {
            const [m, cls] = MARK[i.state] || MARK.unknown;
            return `<li class="${cls}"><span class="hl-mark" aria-hidden="true">${m}</span><div><b>${h(i.label)}</b>${i.value ? ` <span class="muted small">${h(i.value)}</span>` : ''}
              ${i.state === 'fail' || i.state === 'partial' ? `<div class="small">${h(i.fix)}</div>` : i.state === 'unknown' ? '<div class="small muted">גוגל לא החזירה את המידע הזה, אז הוא לא נספר בציון.</div>' : ''}</div></li>`;
          })
          .join('')}</ul>
        ${a.tips ? `<div class="hl-tips"><h4>${icon('spark', 18)} המלצות ה-AI</h4>${tipsBlock(a.tips, a.id)}</div>` : ''}
      </section>`;
    })
    .join('');

  return `<section class="mp-sec" id="health">
    <div class="mp-sec-head"><div><h2>${icon('shield', 22)} בריאות הפרופיל</h2>
      <p class="muted small">מה חסר בפרופיל בגוגל ומה לתקן קודם. נבדק לבד פעם בשבוע.</p></div>
      ${
        can('manager') && available && locations.length
          ? `<form method="post" action="/admin/profile/run"><input type="hidden" name="_csrf" value="${h(csrf)}">
              <button class="btn ai-btn" ${running || runsLeft === 0 ? 'disabled' : ''}>${icon('spark', 16)} <span>${running ? 'בודק עכשיו…' : 'בדיקת פרופיל'}</span></button>${runsLeft != null ? `<div class="muted small">נשארו ${runsLeft} בדיקות ידניות החודש</div>` : ''}</form>`
          : ''
      }</div>
    ${available ? '' : '<div class="warn">הבדיקה עובדת דרך SerpApi. מנהל המערכת מגדיר אותו ב-Railway (SERPAPI_KEY).</div>'}
    ${cards}
  </section>`;
}
