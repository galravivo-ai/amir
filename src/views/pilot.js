import { h } from '../util.js';
import { icon } from './icons.js';

const csrfField = (csrf) => `<input type="hidden" name="_csrf" value="${h(csrf)}">`;

function step(s, csrf, edit) {
  return `<li class="pl-step ${s.done ? 'done' : ''}">
    <span class="gr-state">${s.done ? icon('check', 16) : ''}</span>
    <div class="pl-body"><b>${h(s.title)}</b><span class="muted small">${h(s.how)}</span>${s.detail && !s.done ? `<span class="gr-detail">${h(s.detail)}</span>` : ''}</div>
    <div class="pl-actions">
      ${s.done ? '' : `<a class="btn btn-sm" href="${h(s.href)}">לביצוע</a>`}
      ${
        s.manual && edit
          ? `<form method="post" action="/admin/pilot/mark">${csrfField(csrf)}<input type="hidden" name="on" value="${s.done ? '0' : '1'}">
              <button class="btn-link">${s.done ? 'ביטול הסימון' : 'בוצע ✓'}</button></form>`
          : ''
      }
    </div>
  </li>`;
}

// A viewer sees the checklist; marking a step and sending the answers are a manager's.
export function pilotView({ pilot, csrf, sent = false, edit = true }) {
  const pct = Math.round((pilot.done / pilot.total) * 100);
  return `<div class="page-head"><h1>${icon('handshake', 26)} הפיילוט שלכם</h1></div>
    <p class="page-intro">תודה שאתם מנסים את GoFive. בשבועיים הקרובים: עשרה צעדים קצרים, ובסוף שלוש שאלות. מה שהמערכת רואה מסומן לבד, וההערות שלכם יעזרו לנו לשפר.</p>
    ${sent ? '<div class="flash">תודה! ההערות הגיעו אלינו, ונחזור אליכם.</div>' : ''}
    <section class="card pl-head">
      <div><span class="muted small">צעדים שבוצעו</span><b class="pl-count">${pilot.done}<small>/${pilot.total}</small></b></div>
      <span class="gr-bar pl-bar"><span style="width:${pct}%"></span></span>
      ${pilot.score != null ? `<a href="/admin/growth" class="pl-score"><span class="muted small">ציון הקידום</span><b>${pilot.score}<small>/100</small></b></a>` : ''}
    </section>
    ${pilot.weeks
      .map((w) => `<section class="card"><h2>${h(w.title)}</h2><ol class="pl-steps">${w.steps.map((s) => step(s, csrf, edit)).join('')}</ol></section>`)
      .join('')}
    <section class="card" id="feedback">
      <h2>${icon('chat', 20)} שלוש שאלות בסוף</h2>
      ${pilot.feedback && !sent ? '<p class="muted">כבר שלחתם, תודה! אפשר לשלוח שוב אם יש עוד מה להוסיף.</p>' : ''}
      ${edit ? '' : '<p class="muted">את התשובות שולח מנהל העסק.</p>'}
      ${edit ? `<form method="post" action="/admin/pilot/feedback" class="stack">
        ${csrfField(csrf)}
        <label>מה הכי עזר לכם?<textarea name="helped" rows="3" maxlength="1000" required></textarea></label>
        <label>מה היה מבלבל או לא עבד?<textarea name="confusing" rows="3" maxlength="1000"></textarea></label>
        <fieldset class="pl-pay"><legend>הייתם משלמים על זה ₪99 בחודש?</legend>
          <label class="check"><input type="radio" name="pay" value="yes" required> <span>כן</span></label>
          <label class="check"><input type="radio" name="pay" value="maybe"> <span>אולי</span></label>
          <label class="check"><input type="radio" name="pay" value="no"> <span>לא</span></label>
        </fieldset>
        <label>אם לא, מה חסר? ועוד משהו שתרצו להגיד <span class="muted small">(לא חובה)</span><textarea name="more" rows="3" maxlength="1000"></textarea></label>
        <button class="btn primary">שליחה</button>
      </form>` : ''}
    </section>`;
}
