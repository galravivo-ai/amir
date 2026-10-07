import { PUBLIC_TEXTS } from '../i18n.js';
import { limitLabel } from '../plans.js';
import { asset, h, logoSrc, safeColor } from '../util.js';
import { icon, logoMark, wordmark } from './icons.js';
import { operatorInfo } from './site.js';

const HEAD = (title) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(title)}</title>
<link rel="stylesheet" href="${asset('style.css')}">
<link rel="icon" type="image/svg+xml" href="/static/brand/gofive-mark.svg">
<link rel="icon" type="image/png" href="/static/icons/favicon-32.png">
<script src="${asset('assist.js')}"></script>`;

const SKIP = (label = 'דלג לתוכן') => `<a class="skip-link" href="#main">${h(label)}</a>`;

const APP_HEAD = `<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#1d1650">
<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<script>
// AI buttons: while the AI works, the spark spins and the label says so.
document.addEventListener('submit',function(e){var b=e.submitter;if(!b||!b.classList.contains('ai-btn'))return;
var l=b.querySelector('span');if(l){b.dataset.label=l.textContent;l.textContent='ה-AI עובד…'}b.classList.add('ai-busy');b.setAttribute('aria-busy','true');
setTimeout(function(){b.disabled=true},0)});
window.addEventListener('pageshow',function(){document.querySelectorAll('.ai-busy').forEach(function(b){b.classList.remove('ai-busy');b.disabled=false;b.removeAttribute('aria-busy');var l=b.querySelector('span');if(l&&b.dataset.label)l.textContent=b.dataset.label})});
</script>
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(function(){});</script>`;

export function brandMark(size = 34) {
  return logoMark(size);
}

/** An agency without a logo gets a tile with its initial, never the platform mark. */
function initialMark(name, size) {
  return `<span class="brand-mark" style="width:${size}px;height:${size}px;font:700 ${Math.round(size * 0.5)}px/1 var(--font-head)">${h(String(name).trim().charAt(0) || '★')}</span>`;
}

/** Whether a nav link points at the current page (query strings must match when the link has one). */
function navLink([href, label, ic, badge], current) {
  const active = isActive(href, current);
  return `<a href="${href}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>
          ${icon(ic)}<span>${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}
        </a>`;
}

/** A titled, foldable group of menu links (or plain links, without a title). */
function navGroup(g, current) {
  const links = g.items.map((item) => navLink(item, current)).join('');
  if (!g.label) return `<div class="nav-plain">${links}</div>`;
  const hasActive = g.items.some(([href]) => isActive(href, current));
  const folded = g.folded && !hasActive;
  const badges = g.items.reduce((n, item) => n + (Number(item[3]) || 0), 0);
  const id = `nav-${g.key}`;
  return `<div class="nav-group ${folded ? 'folded' : ''} ${hasActive ? 'has-active' : ''}" data-g="${g.key}">
      <button type="button" class="nav-group-title" aria-expanded="${!folded}" aria-controls="${id}">
        <span>${g.label}</span>${badges ? `<span class="nav-badge nav-group-badge">${badges}</span>` : ''}${icon('chevron', 14)}
      </button>
      <div class="nav-links" id="${id}">${links}</div>
    </div>`;
}

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
/** Trial countdown, or the notice that surveys are paused until a plan is chosen. */
function accessBanner(access, current) {
  if (!access || access.state === 'active' || current.startsWith('/admin/plan')) return '';
  if (access.state === 'trial') {
    const left = access.daysLeft === 1 ? 'יום אחרון' : `עוד ${access.daysLeft} ימים`;
    return `<a class="trial-bar" href="/admin/plan">${icon('clock', 18)}<span><b>תקופת ניסיון: ${left}.</b> כל הפיצ'רים פתוחים.</span><span class="trial-cta">בחירת מסלול ←</span></a>`;
  }
  const why = access.reason === 'trial' ? 'תקופת הניסיון הסתיימה' : 'החשבון מושהה';
  return `<a class="trial-bar paused" href="/admin/plan">${icon('alert', 18)}<span><b>${why}.</b> הסקרים ללקוחות לא פעילים עד שתבחרו מסלול. כל הנתונים שמורים.</span><span class="trial-cta">בחירת מסלול ←</span></a>`;
}

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
  googlePending = 0,
  usage = null,
  brand: brandInfo = null,
  isAgency = false,
  access = null,
}) {
  const b0 = brandInfo || { name: operatorInfo().brand, color: '', logo: '' };
  const brand = b0.name;
  // An agency's color replaces the platform purple everywhere in the admin.
  const brandStyle = b0.color
    ? `<style>:root{--purple:${b0.color};--purple-deep:color-mix(in srgb,${b0.color} 80%,#000);--purple-soft:color-mix(in srgb,${b0.color} 10%,#fff)}</style>`
    : '';
  const whiteLabel = Boolean(brandInfo) && brand !== operatorInfo().brand;
  const mark = (size) =>
    b0.logo
      ? `<img class="brand-logo" src="${h(b0.logo)}" alt="" style="height:${size}px">`
      : whiteLabel
        ? initialMark(brand, size)
        : brandMark(size);
  if (!user || !business) {
    return `<!doctype html>
<html lang="he" dir="rtl">
<head>${HEAD(`${title} · ${brand}`)}${APP_HEAD}${brandStyle}</head>
<body class="auth-page">
${SKIP()}
<a class="auth-brand" href="/">${mark(40)}<span>${wordmark(brand)}</span></a>
<main class="auth-main" id="main">
  ${flash ? `<div class="flash">${h(flash)}</div>` : ''}
  ${body}
</main>
</body>
</html>`;
  }

  const role = business.role;
  // The menu in groups; a group can be folded, and remembers it (the active one stays open).
  const groups = [
    { items: [['/admin', 'לוח בקרה', 'home']] },
    {
      key: 'reputation',
      label: 'מוניטין וביקורות',
      items: [
        ['/admin/google/reviews', 'ביקורות בגוגל', 'star', googlePending],
        ['/admin/responses?sentiment=negative&status=new', 'לקוחות לא מרוצים', 'alert', openCount],
        ['/admin/responses', 'תגובות מסקרים', 'inbox'],
        ['/admin/campaigns', 'קמפיינים ו-QR', 'qr'],
        ['/admin/poster', 'עיצוב שלט QR', 'print'],
        role !== 'viewer' && ['/admin/widget', 'ווידג\'ט לאתר', 'web'],
      ],
    },
    {
      key: 'profile',
      label: 'פרופיל הגוגל',
      items: [
        ['/admin/performance', 'ביצועי הפרופיל', 'chart'],
        ['/admin/profile', 'בריאות הפרופיל', 'shield'],
        ['/admin/google/posts', 'פוסטים בגוגל', 'chat'],
      ],
    },
    {
      key: 'visibility',
      label: 'נראות ומתחרים',
      items: [
        ['/admin/rankings', 'מיקום במפות', 'pin'],
        ['/admin/competitors', 'מתחרים', 'rivals'],
        ['/admin/ai-visibility', 'נראות ב-AI', 'search'],
      ],
    },
    {
      key: 'growth',
      label: 'צמיחה ודוחות',
      items: [
        ['/admin/insights', 'תובנות AI', 'spark'],
        ['/admin/reports/monthly', 'דוח חודשי', 'report'],
        ['/admin/leaderboard', 'דירוג עובדים', 'trophy'],
      ],
    },
    role === 'owner' && {
      key: 'manage',
      label: 'ניהול העסק',
      folded: true,
      items: [
        ['/admin/business', 'הגדרות', 'gear'],
        ['/admin/team', 'צוות', 'team'],
        ['/admin/integrations', 'חיבורים', 'plug'],
        ['/admin/plan', 'התוכנית שלי', 'report'],
      ],
    },
    { items: [isAgency && ['/agency', 'הלקוחות שלי', 'chart'], isSuperadmin && ['/superadmin', 'ניהול מערכת', 'shield']] },
  ]
    .filter(Boolean)
    .map((g) => ({ ...g, items: g.items.filter(Boolean) }))
    .filter((g) => g.items.length);

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
      : `<${role === 'owner' ? 'a href="/account#businesses" title="שינוי שם העסק"' : 'div'} class="biz-card">
          <span class="biz-avatar">${bizLogo}</span>
          <span class="biz-meta"><b>${h(business.name)}</b>${usage ? `<small>תוכנית ${h(usage.planLabel)}</small>` : ''}</span>
        </${role === 'owner' ? 'a' : 'div'}>`;

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
<head>${HEAD(`${title} · ${brand}`)}${APP_HEAD}${brandStyle}</head>
<body class="app">
${SKIP()}
<header class="m-top">
  <button type="button" class="m-burger" aria-label="פתיחת התפריט" aria-controls="sidebar" aria-expanded="false">${icon('menu', 22)}</button>
  <a class="m-brand" href="/admin">${mark(28)}<span>${wordmark(brand)}</span></a>
  <a class="m-user" href="/account" aria-label="החשבון שלי">${icon('user', 20)}</a>
</header>
<div class="nav-scrim" hidden></div>
<aside class="sidebar" id="sidebar">
  <div class="side-head">
    <a class="side-brand" href="/admin">${mark(34)}<span>${wordmark(brand)}</span></a>
    <button type="button" class="m-close" aria-label="סגירת התפריט">${icon('close', 22)}</button>
  </div>
  ${bizBlock}
  <nav class="side-nav" aria-label="ניווט ראשי">
    ${groups.map((g) => navGroup(g, current)).join('')}
  </nav>
  <script>(function(){var s={};try{s=JSON.parse(localStorage.getItem('gf-nav')||'{}')}catch(e){}
document.querySelectorAll('.nav-group[data-g]').forEach(function(g){var k=g.getAttribute('data-g'),b=g.querySelector('.nav-group-title');
function set(c){g.classList.toggle('folded',c);b.setAttribute('aria-expanded',String(!c))}
if(!g.classList.contains('has-active')&&typeof s[k]==='boolean')set(s[k]);
b.addEventListener('click',function(){var c=!g.classList.contains('folded');set(c);s[k]=c;try{localStorage.setItem('gf-nav',JSON.stringify(s))}catch(e){}})})})();</script>
  <script>(function(){var b=document.body,o=document.querySelector('.m-burger'),sc=document.querySelector('.nav-scrim');
function t(open){b.classList.toggle('nav-open',open);o.setAttribute('aria-expanded',String(open));sc.hidden=!open;if(open)document.querySelector('.m-close').focus()}
o.addEventListener('click',function(){t(true)});sc.addEventListener('click',function(){t(false)});document.querySelector('.m-close').addEventListener('click',function(){t(false);o.focus()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&b.classList.contains('nav-open')){t(false);o.focus()}})})();</script>
  ${usageBlock}
  <form method="post" action="/logout" class="side-user">
    <input type="hidden" name="_csrf" value="${h(csrf)}">
    <a href="/account" title="החשבון שלי">${icon('user', 18)}<span>${h(user.name)}${isSuperadmin ? '<small class="role-chip">מנהל מערכת</small>' : ''}</span></a>
    <button class="icon-btn" aria-label="יציאה" title="יציאה">${icon('logout', 18)}</button>
  </form>
</aside>
<main class="app-main" id="main">
  ${accessBanner(access, current)}
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
${SKIP(ft.skipToContent)}
<main class="survey-shell" id="main">
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
        ? `${h(ft.footer_shared).replace('{business}', h(business.name))} · <a href="/privacy" target="_blank">${h(ft.privacy)}</a> · <a href="/accessibility" target="_blank">${h(ft.accessibility)}</a>`
        : ''
    }
  </footer>
</main>
</body>
</html>`;
}
