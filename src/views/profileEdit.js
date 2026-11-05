import { formatDate, h } from '../util.js';
import { icon } from './icons.js';

// Editing a location's Google profile from GoFive: the description, the
// categories, the opening hours, the phone and the website. The name and the
// address stay in Google for now (a change there can make Google ask to verify
// the business again).

export const DAYS = [
  ['SUNDAY', 'ראשון'],
  ['MONDAY', 'שני'],
  ['TUESDAY', 'שלישי'],
  ['WEDNESDAY', 'רביעי'],
  ['THURSDAY', 'חמישי'],
  ['FRIDAY', 'שישי'],
  ['SATURDAY', 'שבת'],
];
export const FIELD_LABELS = {
  'profile.description': 'תיאור',
  categories: 'קטגוריות',
  regularHours: 'שעות פתיחה',
  'phoneNumbers.primaryPhone': 'טלפון',
  websiteUri: 'אתר',
};
export const DESCRIPTION_MAX = 750;

const hhmm = (t) => (t ? `${String(t.hours ?? 0).padStart(2, '0')}:${String(t.minutes ?? 0).padStart(2, '0')}` : '00:00');

/** Google's periods as up to two time ranges per day: { SUNDAY: [['09:00','17:00']], ... }. */
export function hoursOf(regularHours) {
  const out = Object.fromEntries(DAYS.map(([d]) => [d, []]));
  for (const p of regularHours?.periods || []) {
    if (!out[p.openDay]) continue;
    const close = hhmm(p.closeTime);
    out[p.openDay].push([hhmm(p.openTime), close === '00:00' && p.closeDay !== p.openDay ? '24:00' : close]);
  }
  for (const d of Object.keys(out)) out[d].sort((a, b) => a[0].localeCompare(b[0]));
  return out;
}

function hoursRows(hours) {
  return DAYS.map(([d, label]) => {
    const ranges = hours[d] || [];
    const [a, b] = [ranges[0] || ['', ''], ranges[1] || ['', '']];
    const open = ranges.length > 0;
    return `<div class="pe-day${open ? '' : ' closed'}" data-day>
      <b>${label}</b>
      <label class="check pe-open"><input type="checkbox" name="open_${d}" value="1" ${open ? 'checked' : ''}><span>פתוח</span></label>
      <span class="pe-range"><input type="time" name="from_${d}" value="${h(a[0])}" aria-label="${label}: פתיחה"><span>עד</span><input type="time" name="to_${d}" value="${h(a[1] === '24:00' ? '23:59' : a[1])}" aria-label="${label}: סגירה"></span>
      <span class="pe-range pe-second${b[0] ? '' : ' empty'}"><input type="time" name="from2_${d}" value="${h(b[0])}" aria-label="${label}: פתיחה שנייה"><span>עד</span><input type="time" name="to2_${d}" value="${h(b[1] === '24:00' ? '23:59' : b[1])}" aria-label="${label}: סגירה שנייה"></span>
      <span class="pe-closed-label">סגור</span>
    </div>`;
  }).join('');
}

/** A category's Hebrew name; when Google sent none, a readable form of its id. */
const catLabel = (c) => c.displayName || String(c.name || '').replace(/^categories\/(gcid:)?/, '').replace(/_/g, ' ');
const chip = (c, removable) =>
  `<span class="pe-chip" data-cat="${h(c.name)}">${h(catLabel(c))}${removable ? `<input type="hidden" name="extra" value="${h(c.name)}|${h(catLabel(c))}"><button type="button" class="pe-x" aria-label="הסרת ${h(catLabel(c))}">×</button>` : ''}</span>`;

export function profileEditView({ loc, profile, csrf, edits = [], error = '', saved = false, aiDraft = '', aiError = '', aiAvailable = false, values = null }) {
  const p = profile || {};
  const md = p.metadata || {};
  const v = values || {
    description: p.profile?.description || '',
    primary: p.categories?.primaryCategory || null,
    extra: p.categories?.additionalCategories || [],
    phone: p.phoneNumbers?.primaryPhone || '',
    website: p.websiteUri || '',
    hours: hoursOf(p.regularHours),
  };
  const description = aiDraft || v.description;
  const addr = p.storefrontAddress ? [...(p.storefrontAddress.addressLines || []), p.storefrontAddress.locality].filter(Boolean).join(', ') : loc.address;
  return `<div class="page-head"><h1>${icon('gear', 24)} עריכת הפרופיל בגוגל</h1>
      <a class="btn" href="/admin/google">חזרה לסניפים</a></div>
    <p class="muted">${h(p.title || loc.title)}${addr ? ` · ${h(addr)}` : ''}</p>
    ${saved ? '<div class="flash">השינויים נשלחו לגוגל. גוגל בודקת כל שינוי לפני שהוא מופיע, בדרך כלל תוך כמה דקות ועד יום.</div>' : ''}
    ${error ? `<div class="error">${h(error)}</div>` : ''}
    ${md.hasPendingEdits ? '<div class="warn">יש שינויים שממתינים לאישור של גוגל. הם יופיעו בפרופיל אחרי הבדיקה.</div>' : ''}
    ${md.hasGoogleUpdated ? '<div class="warn">גוגל עדכנה בעצמה חלק מהפרטים בפרופיל. בדקו שהכול נכון לפני שאתם שומרים.</div>' : ''}
    ${aiDraft ? '<div class="flash">ה-AI כתב תיאור חדש. קראו, ערכו לפי הצורך, ולחצו "שמירה ושליחה לגוגל". עד אז שום דבר לא השתנה בגוגל.</div>' : ''}
    ${aiError ? `<div class="error">${h(aiError)}</div>` : ''}

    <form method="post" action="/admin/google/locations/${loc.id}/profile" class="pe-form" id="pe-form">
      <input type="hidden" name="_csrf" value="${h(csrf)}">

      <section class="card pe-sec">
        <div class="pe-head"><h2>תיאור העסק</h2><span class="pe-count"><b id="pe-n">${description.length}</b>/${DESCRIPTION_MAX}</span></div>
        <p class="muted small">מה העסק עושה, למי ואיפה, ומה מייחד אותו. בלי קישורים, טלפונים או מבצעים: גוגל לא מאשרת אותם בתיאור.</p>
        <textarea name="description" id="pe-desc" rows="6" maxlength="${DESCRIPTION_MAX}">${h(description)}</textarea>
        ${aiAvailable ? `<button class="btn ai-btn" formaction="/admin/google/locations/${loc.id}/profile/ai" formnovalidate>${icon('spark', 16)}<span>כתיבה עם AI</span></button>` : ''}
      </section>

      <section class="card pe-sec">
        <div class="pe-head"><h2>קטגוריות</h2></div>
        <p class="muted small">הקטגוריה הראשית היא הגורם הכי חשוב לחיפושים שבהם תופיעו. אפשר להוסיף עד 9 קטגוריות נוספות.</p>
        <label>קטגוריה ראשית</label>
        <div class="pe-cat" data-role="primary">
          <span class="pe-current" id="pe-primary">${v.primary ? chip(v.primary, false) : '<span class="muted">לא נבחרה</span>'}</span>
          <input type="hidden" name="primary" value="${h(v.primary ? `${v.primary.name}|${catLabel(v.primary)}` : '')}">
          <input type="search" class="pe-find" placeholder="חיפוש קטגוריה, למשל: מסעדה איטלקית" autocomplete="off" aria-label="חיפוש קטגוריה ראשית">
          <ul class="pe-results" hidden></ul>
        </div>
        <label>קטגוריות נוספות</label>
        <div class="pe-cat" data-role="extra">
          <span class="pe-current" id="pe-extra">${v.extra.map((c) => chip(c, true)).join('')}</span>
          <input type="search" class="pe-find" placeholder="הוספת קטגוריה" autocomplete="off" aria-label="חיפוש קטגוריה נוספת">
          <ul class="pe-results" hidden></ul>
        </div>
      </section>

      <section class="card pe-sec">
        <div class="pe-head"><h2>שעות פתיחה</h2></div>
        <p class="muted small">אפשר שני טווחים ביום (למשל צהריים וערב). פתוח 24 שעות: 00:00 עד 23:59.</p>
        <div class="pe-hours">${hoursRows(v.hours)}</div>
      </section>

      <section class="card pe-sec pe-grid2">
        <label>טלפון<input name="phone" type="tel" dir="ltr" value="${h(v.phone)}" maxlength="20" placeholder="03-1234567"></label>
        <label>אתר<input name="website" type="url" dir="ltr" value="${h(v.website)}" maxlength="300" placeholder="https://"></label>
      </section>

      <section class="card pe-sec pe-locked">
        <div class="pe-head"><h2>שם העסק וכתובת</h2></div>
        <p class="muted small">אותם עורכים כרגע ישירות בגוגל: שינוי שלהם יכול לגרום לגוגל לבקש לאמת את העסק מחדש. <a href="https://business.google.com/" target="_blank" rel="noopener">לעריכה בגוגל ←</a></p>
      </section>

      <div class="pe-actions"><button class="btn primary">שמירה ושליחה לגוגל</button><span class="muted small">רק שדות ששיניתם נשלחים.</span></div>
    </form>

    ${
      edits.length
        ? `<section class="card"><h2>שינויים אחרונים</h2><table class="table"><thead><tr><th>מתי</th><th>מי</th><th>מה</th><th>תוצאה</th></tr></thead><tbody>${edits
            .map((e) => `<tr><td>${h(formatDate(e.created_at))}</td><td>${h(e.user_name || '—')}</td><td>${JSON.parse(e.fields || '[]').map((f) => h(FIELD_LABELS[f] || f)).join(', ')}</td><td>${e.ok ? '<span class="badge st-done">נשלח לגוגל</span>' : `<span class="badge st-new" title="${h(e.error || '')}">נכשל</span>`}</td></tr>`)
            .join('')}</tbody></table></section>`
        : ''
    }
    <script>
    (function () {
      var d = document.getElementById('pe-desc'), n = document.getElementById('pe-n');
      d.addEventListener('input', function () { n.textContent = d.value.length; });
      document.querySelectorAll('[data-day]').forEach(function (row) {
        var cb = row.querySelector('input[type=checkbox]');
        cb.addEventListener('change', function () { row.classList.toggle('closed', !cb.checked); });
      });
      function chipHtml(name, label, removable) {
        var s = document.createElement('span'); s.className = 'pe-chip'; s.dataset.cat = name; s.textContent = label;
        if (removable) {
          var i = document.createElement('input'); i.type = 'hidden'; i.name = 'extra'; i.value = name + '|' + label; s.appendChild(i);
          var x = document.createElement('button'); x.type = 'button'; x.className = 'pe-x'; x.textContent = '×'; x.setAttribute('aria-label', 'הסרת ' + label); s.appendChild(x);
        }
        return s;
      }
      document.addEventListener('click', function (e) { if (e.target.classList.contains('pe-x')) e.target.parentNode.remove(); });
      document.querySelectorAll('.pe-cat').forEach(function (box) {
        var find = box.querySelector('.pe-find'), list = box.querySelector('.pe-results'), timer;
        find.addEventListener('input', function () {
          clearTimeout(timer);
          var q = find.value.trim();
          if (q.length < 2) { list.hidden = true; return; }
          timer = setTimeout(function () {
            fetch('/admin/google/categories?q=' + encodeURIComponent(q), { headers: { accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (cats) {
              list.innerHTML = '';
              (cats.error ? [] : cats).forEach(function (c) {
                var li = document.createElement('li'); var b = document.createElement('button'); b.type = 'button'; b.textContent = c.displayName;
                b.addEventListener('click', function () {
                  if (box.dataset.role === 'primary') {
                    var cur = document.getElementById('pe-primary'); cur.innerHTML = ''; cur.appendChild(chipHtml(c.name, c.displayName, false));
                    box.querySelector('input[name=primary]').value = c.name + '|' + c.displayName;
                  } else if (!document.querySelector('#pe-extra [data-cat="' + c.name + '"]') && document.querySelectorAll('#pe-extra .pe-chip').length < 9) {
                    document.getElementById('pe-extra').appendChild(chipHtml(c.name, c.displayName, true));
                  }
                  find.value = ''; list.hidden = true;
                });
                li.appendChild(b); list.appendChild(li);
              });
              if (cats.error) { var li = document.createElement('li'); li.className = 'muted'; li.textContent = cats.error; list.appendChild(li); }
              list.hidden = false;
            }).catch(function () {});
          }, 250);
        });
      });
    })();
    </script>`;
}
