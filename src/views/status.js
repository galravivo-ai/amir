import { h } from '../util.js';
import { PLANS } from '../plans.js';

const mark = (state) => ({ ok: '✅', warn: '⚠️', off: '❌' })[state] || '❌';

/** Estimated cost per service, in dollars. AI by tokens; the others per call. */
export const PRICES = {
  serp: { perCall: Number(process.env.SERPAPI_PRICE_USD) || 0.015, label: 'SerpApi' },
  ai: { perIn: 4 / 1e6, perOut: 20 / 1e6, label: 'Claude' },
  openai: { perCall: 0.03, label: 'ChatGPT' },
  gemini: { perCall: 0.015, label: 'Gemini' },
  perplexity: { perCall: 0.01, label: 'Perplexity' },
};
const RATE = Number(process.env.USD_ILS) || 3.7;
const costOf = (row) => {
  const p = PRICES[row.service] || {};
  return (p.perCall || 0) * row.calls + (p.perIn || 0) * row.tokens_in + (p.perOut || 0) * row.tokens_out;
};
const ils = (usd) => `₪${(usd * RATE).toFixed(usd * RATE < 10 ? 2 : 0)}`;

export function statusView({ checks, serpAccount, usage, month, csrf, engineTest = null }) {
  // One row per business, a column per service.
  const byBiz = new Map();
  for (const r of usage) {
    const key = r.business_id;
    if (!byBiz.has(key)) byBiz.set(key, { name: r.business_id ? r.business_name || `#${r.business_id}` : 'מערכת (בלי עסק)', plan: r.plan, svc: {}, cost: 0 });
    const b = byBiz.get(key);
    b.svc[r.service] = r;
    b.cost += costOf(r);
  }
  const rows = [...byBiz.values()].sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const serpTotal = usage.filter((r) => r.service === 'serp').reduce((s, r) => s + r.calls, 0);
  const cell = (r, s) => {
    const x = r.svc[s];
    if (!x) return '<td class="muted">—</td>';
    return s === 'ai'
      ? `<td>${x.calls} <span class="muted small">(${Math.round((x.tokens_in + x.tokens_out) / 1000)}K טוקנים)</span></td>`
      : `<td>${x.calls.toLocaleString('he-IL')}</td>`;
  };

  return `<div class="page-head"><h1>מצב המערכת</h1><a class="btn" href="/superadmin">חזרה לניהול מערכת</a></div>
  <section class="card"><h3>חיבורים</h3>
    <div class="table-wrap"><table class="table st-table"><thead><tr><th></th><th>חיבור</th><th>מצב</th><th>מה זה נותן</th></tr></thead><tbody>${checks
      .map((c) => `<tr><td>${mark(c.state)}</td><td><b>${h(c.name)}</b></td><td>${c.detail}</td><td class="muted small">${h(c.what)}</td></tr>`)
      .join('')}</tbody></table></div>
    <div class="row compact" id="engines">
      <form method="post" action="/superadmin/engines-test"><input type="hidden" name="_csrf" value="${h(csrf)}"><button class="btn-link ai-btn"><span>בדיקת מנועי ה-AI: Claude, ChatGPT, Gemini ו-Perplexity</span></button></form>
    </div>
    ${
      engineTest
        ? `<ul class="engine-test">${engineTest
            .map((r) => `<li>${r.ok ? '✅' : '❌'} <b>${h(r.label)}</b> ${r.ok ? `<span class="muted">ענה: "${h(r.text)}"${r.sources ? ` · ${r.sources} מקורות` : ''}</span>` : `<span class="danger-text">${h(r.error)}</span>`}</li>`)
            .join('')}</ul>`
        : ''
    }
  </section>

  ${
    serpAccount
      ? `<section class="card"><h3>SerpApi החודש</h3>
          ${
            serpAccount.error
              ? `<p class="danger-text">לא הצלחנו לקרוא את החשבון: ${h(serpAccount.error)}</p>`
              : `<div class="kpis kpis-3">
                  <div class="kpi"><div class="kpi-label">מנוי</div><div class="kpi-value small-value">${h(serpAccount.plan || '—')}</div><div class="kpi-hint">${serpAccount.perMonth.toLocaleString('he-IL')} חיפושים בחודש</div></div>
                  <div class="kpi"><div class="kpi-label">נוצלו החודש</div><div class="kpi-value">${serpAccount.used.toLocaleString('he-IL')}</div>
                    <div class="dist-bar"><span class="${serpAccount.used / Math.max(1, serpAccount.perMonth) > 0.9 ? 'bad' : serpAccount.used / Math.max(1, serpAccount.perMonth) > 0.7 ? 'mid' : 'good'}" style="width:${Math.min(100, (serpAccount.used / Math.max(1, serpAccount.perMonth)) * 100)}%"></span></div></div>
                  <div class="kpi"><div class="kpi-label">נשארו</div><div class="kpi-value">${serpAccount.left.toLocaleString('he-IL')}</div><div class="kpi-hint">${
                    serpAccount.left < serpAccount.perMonth * 0.1 ? '<b class="danger-text">כמעט נגמר: כדאי לשדרג את המנוי</b>' : ''
                  }</div></div>
                </div>`
          }
        </section>`
      : ''
  }

  <section class="card"><h3>צריכה לפי עסק · ${h(month)}</h3>
    <p class="muted small">נמדד בפועל מתחילת החודש. העלות היא הערכה: SerpApi לפי ${PRICES.serp.perCall * 100} סנט לחיפוש, Claude לפי טוקנים, לפי ${RATE} ₪ לדולר. סה"כ חיפושי SerpApi שנמדדו: ${serpTotal.toLocaleString('he-IL')}.</p>
    ${
      rows.length
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>עסק</th><th>מסלול</th><th>SerpApi</th><th>Claude</th><th>ChatGPT</th><th>Gemini</th><th>Perplexity</th><th>עלות משוערת</th></tr></thead><tbody>${rows
            .map(
              (r) => `<tr><td><b>${h(r.name)}</b></td><td>${h(PLANS[r.plan]?.label || '—')}</td>${['serp', 'ai', 'openai', 'gemini', 'perplexity'].map((s) => cell(r, s)).join('')}
                <td><b>${ils(r.cost)}</b>${PLANS[r.plan]?.price ? ` <span class="muted small">מתוך ₪${PLANS[r.plan].price}</span>` : ''}</td></tr>`,
            )
            .join('')}</tbody><tfoot><tr><td colspan="7"><b>סה"כ</b></td><td><b>${ils(total)}</b></td></tr></tfoot></table></div>`
        : '<p class="muted">עוד לא נמדדה צריכה החודש.</p>'
    }
  </section>`;
}
