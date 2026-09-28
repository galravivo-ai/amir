import { h } from '../util.js';
import { icon } from './icons.js';

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

function rankTable(rows, { kind, minRatings, days }) {
  if (!rows.length) return '';
  let place = 0;
  const body = rows
    .map((r) => {
      const n = r.ranked ? ++place : null;
      const badge = n ? `<span class="rank rank-${Math.min(n, 4)}">${n}</span>` : '<span class="rank rank-none">·</span>';
      const link =
        kind === 'staff'
          ? `/admin/responses?staff=${r.id}`
          : `/admin?campaign=${r.id}&days=${days}`;
      return `<tr class="${r.ranked ? '' : 'unranked'}">
        <td data-l="מקום">${badge}</td>
        <td data-l="${kind === 'staff' ? 'עובד' : 'סניף'}"><a href="${link}"><b>${h(r.name)}</b></a>${
          r.active ? '' : ' <span class="muted small">(לא פעיל)</span>'
        }</td>
        <td data-l="דירוג ממוצע"><b>${r.responses ? r.avg_rating.toFixed(2) : '—'}</b>${r.responses ? ' <span class="star-inline">★</span>' : ''}</td>
        <td data-l="דירוגים">${r.responses}</td>
        <td data-l="מרוצים">${pct(r.positive, r.responses)}</td>
        <td data-l="הגיעו לביקורת">${r.reviewed}</td>
        <td data-l="לא מרוצים">${r.negative ? `<span class="neg">${r.negative}</span>` : '0'}</td>
      </tr>`;
    })
    .join('');
  return `<table class="table leader-table">
    <thead><tr><th>מקום</th><th>${kind === 'staff' ? 'עובד' : 'סניף / קמפיין'}</th><th>דירוג ממוצע</th><th>דירוגים</th><th>מרוצים</th><th>הגיעו לביקורת</th><th>לא מרוצים</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${rows.some((r) => !r.ranked) ? `<p class="muted small">מי שקיבל פחות מ-${minRatings} דירוגים בתקופה מופיע בסוף, בלי מקום.</p>` : ''}`;
}

function podium(rows) {
  const top = rows.filter((r) => r.ranked).slice(0, 3);
  if (!top.length) return '';
  return `<div class="podium">${top
    .map(
      (r, i) => `<div class="podium-item p${i + 1}">
        <span class="rank rank-${i + 1}">${i + 1}</span>
        <b>${h(r.name)}</b>
        <span class="podium-score">${r.avg_rating.toFixed(2)} ★</span>
        <small>${r.responses} דירוגים · ${pct(r.positive, r.responses)} מרוצים</small>
      </div>`,
    )
    .join('')}</div>`;
}

export function leaderboardView({ board, can = () => true }) {
  const { days, staff, branches, unassigned, total, minRatings } = board;
  const filter = `<form method="get" class="filters">
      <select name="days" aria-label="תקופה" onchange="this.form.submit()">${[7, 30, 90, 365]
        .map((d) => `<option value="${d}" ${d === days ? 'selected' : ''}>${d} ימים</option>`)
        .join('')}</select>
      <noscript><button class="btn">סינון</button></noscript>
      ${can('manager') ? '<a class="btn" href="/admin/staff">ניהול עובדים</a>' : ''}
    </form>`;

  const staffBlock = staff.length
    ? `${podium(staff)}${rankTable(staff, { kind: 'staff', minRatings, days })}
      ${
        unassigned
          ? `<p class="muted small">${unassigned} מתוך ${total} הדירוגים בתקופה לא משויכים לעובד. כדי לשייך יותר: קישור אישי לכל עובד, או השאלה "מי נתן לך שירות?" בהגדרות הקמפיין.</p>`
          : ''
      }`
    : `<div class="empty stack">
        <p>עוד לא הוגדרו עובדים.</p>
        <p class="muted">מוסיפים עובדים, וכל אחד מקבל קישור ו-QR אישי. אפשר גם להוסיף לסקר את השאלה "מי נתן לך שירות?".</p>
        ${can('manager') ? '<a class="btn primary" href="/admin/staff">הוספת עובדים</a>' : ''}
      </div>`;

  return `<div class="dash-head"><div class="titles"><h1>דירוג עובדים וסניפים</h1>
      <p class="muted">מי מקבל את הדירוגים הכי טובים ב-${days} הימים האחרונים</p></div>${filter}</div>
    <section class="card stack">
      <h3>${icon('team')} עובדים</h3>
      ${staffBlock}
    </section>
    <section class="card stack">
      <h3>${icon('qr')} סניפים וקמפיינים</h3>
      ${branches.length ? rankTable(branches, { kind: 'branch', minRatings, days }) : '<p class="muted">עוד אין קמפיינים.</p>'}
    </section>
    <p class="muted small">איך מדרגים: ממוצע הדירוגים, כשמי שיש לו מעט דירוגים מתקרב לממוצע של העסק. כך דירוג 5 יחיד לא עוקף עובד עם עשרות דירוגים של 4.8.</p>`;
}

export function staffView({ staff, campaigns, campaignId, baseUrl, csrf, can = () => true }) {
  const campaign = campaigns.find((c) => c.id === campaignId) || campaigns[0];
  const picker =
    campaigns.length > 1
      ? `<form method="get" class="row">
          <label>קמפיין לקישורים<select name="campaign" onchange="this.form.submit()">${campaigns
            .map((c) => `<option value="${c.id}" ${c.id === campaign.id ? 'selected' : ''}>${h(c.name)}</option>`)
            .join('')}</select></label>
          <noscript><button class="btn">הצגה</button></noscript>
        </form>`
      : '';
  const rows = staff
    .map((s) => {
      const link = campaign ? `${baseUrl}/r/${campaign.slug}?e=${encodeURIComponent(s.code)}` : '';
      const qs = `?e=${encodeURIComponent(s.code)}`;
      return `<tr class="${s.active ? '' : 'unranked'}">
        <td data-l="שם">
          ${
            can('manager')
              ? `<form method="post" action="/admin/staff/${s.id}" class="row compact">
                  <input type="hidden" name="_csrf" value="${h(csrf)}">
                  <input name="name" value="${h(s.name)}" maxlength="60" required aria-label="שם">
                  <label class="check"><input type="checkbox" name="active" value="1" ${s.active ? 'checked' : ''}> פעיל</label>
                  <button class="btn">שמירה</button>
                </form>`
              : h(s.name)
          }
        </td>
        <td data-l="קישור אישי">${
          campaign && s.active
            ? `<input class="copy" readonly dir="ltr" value="${h(link)}" onclick="this.select()" aria-label="קישור אישי">
               <div class="link-row small">
                 <a href="/admin/campaigns/${campaign.id}/qr.png${qs}" download="qr-${h(campaign.slug)}-${h(s.code)}.png">הורדת QR</a> ·
                 <a href="/admin/campaigns/${campaign.id}/poster${qs}" target="_blank">שלט להדפסה</a> ·
                 <a href="/admin/responses?staff=${s.id}">הדירוגים שלו/ה</a>
               </div>`
            : '<span class="muted">—</span>'
        }</td>
        <td>${
          can('owner')
            ? `<form method="post" action="/admin/staff/${s.id}/delete" data-name="${h(s.name)}" onsubmit="return confirm('למחוק את ' + this.dataset.name + '? הדירוגים יישארו, בלי שיוך לעובד.')">
                <input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link danger-text">מחיקה</button></form>`
            : ''
        }</td>
      </tr>`;
    })
    .join('');

  return `<p><a href="/admin/leaderboard">→ חזרה לדירוג</a></p>
    <h1>עובדים</h1>
    <p class="muted">לכל עובד יש קישור ו-QR אישי. לקוח שסורק אותו נספר אוטומטית לעובד, בלי לשאול אותו כלום. אפשר לתלות QR בעמדה, לשים על כרטיס ביקור או לשלוח בוואטסאפ.</p>
    ${
      can('manager')
        ? `<form method="post" action="/admin/staff" class="card row">
            <input type="hidden" name="_csrf" value="${h(csrf)}">
            <label>שם העובד<input name="name" maxlength="60" required placeholder="למשל: דנה"></label>
            <button class="btn primary">הוספה</button>
          </form>`
        : ''
    }
    <section class="card stack">
      ${campaigns.length ? picker : '<p class="muted">כדי ליצור קישורים אישיים צריך קודם קמפיין.</p>'}
      ${
        staff.length
          ? `<table class="table staff-table"><thead><tr><th>שם</th><th>קישור אישי</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="muted">עוד לא נוספו עובדים.</p>'
      }
    </section>`;
}
