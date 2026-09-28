import { PUBLIC_TEXTS } from '../i18n.js';
import { limitLabel } from '../plans.js';
import { h, logoSrc, safeColor } from '../util.js';
import { icon, starMark } from './icons.js';
import { operatorInfo } from './site.js';

const HEAD = (title) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<link rel="stylesheet" href="/static/style.css">`;

export function brandMark(size = 34) {
  return `<span class="brand-mark" style="width:${size}px;height:${size}px">${starMark(Math.round(size * 0.56))}</span>`;
}

/** Whether a nav link points at the current page (query strings must match when the link has one). */
function isActive(href, current) {
  const [path, query] = href.split('?');
  const [curPath, curQuery = ''] = String(current || '').split('?');
  if (query) return curPath === path && curQuery.includes(query);
  if (path === '/admin') return curPath === '/admin';
  return curPath === path || curPath.startsWith(`${path}/`);
}

/**
 * Admin shell. With a business: dark sidebar on the right (RTL) and the page
 * beside it. Without one (login, register, reset): a centered single column.
 */
export function adminPage({
  title,
  user,
  business,
  businesses = [],
  body,
  flash = '',
  csrf = '',
  isSuperadmin = false,
  current = '',
  openCount = 0,
  usage = null,
}) {
  const brand = operatorInfo().brand;
  if (!user || !business) {
    return `<!doctype html>
<html lang="he" dir="rtl">
<head>${HEAD(`${title} · ${brand}`)}</head>
<body class="auth-page">
<a class="auth-brand" href="/">${brandMark(40)}<span>${h(brand)}</span></a>
<main class="auth-main">
  ${flash ? `<div class="flash">${h(flash)}</div>` : ''}
  ${body}
</main>
</body>
</html>`;
  }

  const role = business.role;
  const links = [
    ['/admin', 'לוח בקרה', 'home'],
    ['/admin/responses', 'תגובות', 'inbox'],
    ['/admin/responses?sentiment=negative&status=new', 'פניות פתוחות', 'alert', openCount],
    ['/admin/campaigns', 'קמפיינים ו-QR', 'qr'],
    ['/admin/insights', 'תובנות AI', 'spark'],
    role !== 'viewer' && ['/admin/widget', 'ווידג\'ט לאתר', 'web'],
    role === 'owner' && ['/admin/team', 'צוות', 'team'],
    role === 'owner' && ['/admin/business', 'הגדרות', 'gear'],
    isSuperadmin && ['/superadmin', 'ניהול מערכת', 'shield'],
  ].filter(Boolean);

  const bizInitial = h(String(business.name).trim().charAt(0) || '·');
  const bizLogo = logoSrc(business)
    ? `<img src="${h(logoSrc(business))}" alt="">`
    : `<span>${bizInitial}</span>`;
  const bizBlock =
    businesses.length > 1
      ? `<form method="get" action="/admin/switch" class="biz-card">
          <span class="biz-avatar">${bizLogo}</span>
          <label class="sr-only" for="biz-switch">מעבר בין עסקים</label>
          <select id="biz-switch" name="b" onchange="this.form.submit()">
            ${businesses
              .map((b) => `<option value="${b.id}" ${b.id === business.id ? 'selected' : ''}>${h(b.name)}</option>`)
              .join('')}
          </select>
        </form>`
      : `<div class="biz-card">
          <span class="biz-avatar">${bizLogo}</span>
          <span class="biz-meta"><b>${h(business.name)}</b>${usage ? `<small>תוכנית ${h(usage.planLabel)}</small>` : ''}</span>
        </div>`;

  const usageBlock =
    usage && usage.limit !== Infinity
      ? `<a class="usage" href="/admin/plan">
          <span>דירוגים החודש</span>
          <span class="usage-bar"><span style="width:${Math.min(100, (usage.used / usage.limit) * 100).toFixed(1)}%"></span></span>
          <small>${usage.used.toLocaleString('he-IL')} מתוך ${limitLabel(usage.limit)}</small>
        </a>`
      : '';

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>${HEAD(`${title} · ${brand}`)}</head>
<body class="app">
<aside class="sidebar">
  <a class="side-brand" href="/admin">${brandMark(34)}<span>${h(brand)}</span></a>
  ${bizBlock}
  <nav class="side-nav" aria-label="ניווט ראשי">
    ${links
      .map(([href, label, ic, badge]) => {
        const active = isActive(href, current);
        return `<a href="${href}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
          ${icon(ic)}<span>${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}
        </a>`;
      })
      .join('')}
  </nav>
  ${usageBlock}
  <form method="post" action="/logout" class="side-user">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <a href="/account" title="החשבון שלי">${icon('user', 18)}<span>${h(user.name)}</span></a>
    <button class="icon-btn" aria-label="יציאה" title="יציאה">${icon('logout', 18)}</button>
  </form>
</aside>
<main class="app-main">
  ${flash ? `<div class="flash">${h(flash)}</div>` : ''}
  ${body}
</main>
</body>
</html>`;
}

/**
 * Customer-facing shell, branded per business: a colored header with the
 * business logo and the page heading, then the page content.
 */
export function publicPage({ title, heading = '', sub = '', lang = 'he', dir = 'rtl', business, body, above = '' }) {
  const color = safeColor(business?.brand_color, '#4b2bd6');
  const initial = h(String(business?.name ?? '').trim().charAt(0) || '★');
  const ft = PUBLIC_TEXTS[lang] || PUBLIC_TEXTS.he;
  return `<!doctype html>
<html lang="${h(lang)}" dir="${h(dir)}">
<head>${HEAD(title)}
<meta name="robots" content="noindex">
<meta name="theme-color" content="${color}">
<style>:root{--brand:${color}}</style>
</head>
<body class="public">
<main class="survey-shell">
  <header class="survey-head">
    ${
      business
        ? `<div class="survey-biz">
            ${
              logoSrc(business)
                ? `<span class="survey-logo"><img src="${h(logoSrc(business))}" alt=""></span>`
                : `<span class="survey-initial">${initial}</span>`
            }
            <span>${h(business.name)}</span>
          </div>`
        : ''
    }
    ${above}
    ${heading ? `<h1>${h(heading)}</h1>` : ''}
    ${sub ? `<p>${h(sub)}</p>` : ''}
  </header>
  <div class="survey-body">
    ${body}
  </div>
  <footer class="public-foot">
    ${
      business
        ? `${h(ft.footer_shared).replace('{business}', h(business.name))} · <a href="/privacy" target="_blank">${h(ft.privacy)}</a>`
        : ''
    }
  </footer>
</main>
</body>
</html>`;
}
