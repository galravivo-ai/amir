import { h, safeColor } from '../util.js';

/** Admin shell: RTL Hebrew layout with top navigation. */
export function adminPage({ title, user, business, businesses = [], body, flash = '', csrf = '', isSuperadmin = false }) {
  const bizSwitcher =
    businesses.length > 1
      ? `<form method="get" action="/admin/switch" class="switcher">
          <select name="b" onchange="this.form.submit()" aria-label="מעבר עסק">
            ${businesses
              .map((b) => `<option value="${b.id}" ${business && b.id === business.id ? 'selected' : ''}>${h(b.name)}</option>`)
              .join('')}
          </select>
        </form>`
      : '';
  const role = business?.role;
  const links = business
    ? [
        ['/admin', 'לוח בקרה'],
        ['/admin/responses', 'תגובות'],
        ['/admin/responses?sentiment=negative&status=new', 'פניות פתוחות'],
        ['/admin/campaigns', 'קמפיינים ו-QR'],
        ['/admin/insights', 'תובנות AI'],
        role !== 'viewer' && ['/admin/widget', 'ווידג\'ט'],
        role === 'owner' && ['/admin/team', 'צוות'],
        role === 'owner' && ['/admin/business', 'הגדרות'],
        isSuperadmin && ['/superadmin', 'ניהול מערכת'],
      ].filter(Boolean)
    : [];
  const nav = links.length
    ? `<nav class="mainnav">${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav>`
    : '';
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)} · ביקורות</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body class="admin">
<header class="topbar">
  <a class="brand" href="/admin">★ ביקורות</a>
  ${bizSwitcher}
  ${nav}
  ${
    user
      ? `<form method="post" action="/logout" class="logout">
          <input type="hidden" name="_csrf" value="${h(csrf)}">
          <a class="muted" href="/account">${h(user.name)}</a>
          <button class="btn-link">יציאה</button>
        </form>`
      : ''
  }
</header>
<main class="container">
  ${flash ? `<div class="flash">${h(flash)}</div>` : ''}
  ${body}
</main>
</body>
</html>`;
}

/** Public customer-facing shell, branded per business. */
export function publicPage({ title, lang = 'he', dir = 'rtl', business, body }) {
  const color = safeColor(business?.brand_color);
  return `<!doctype html>
<html lang="${h(lang)}" dir="${h(dir)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${h(title)}</title>
<link rel="stylesheet" href="/static/style.css">
<style>:root{--brand:${color}}</style>
</head>
<body class="public">
<main class="card public-card">
  ${
    business
      ? `<div class="biz-head">
          ${business.logo_url ? `<img class="logo" src="${h(business.logo_url)}" alt="">` : ''}
          <div class="biz-name">${h(business.name)}</div>
        </div>`
      : ''
  }
  ${body}
</main>
</body>
</html>`;
}
