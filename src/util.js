import crypto from 'node:crypto';

/** HTML-escape any value for safe interpolation into markup. */
export function h(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Small standalone Hebrew error page. */
export function errorPage(message) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(message)}</title>
<link rel="stylesheet" href="/static/style.css"></head>
<body class="public"><main class="card public-card"><h1>${h(message)}</h1></main></body></html>`;
}

export function token(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function slugify(text) {
  const base = String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return `${base || 'c'}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Only allow http(s) URLs to be stored / rendered as links. */
export function safeUrl(url) {
  const v = String(url ?? '').trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/**
 * Accepts either a full review URL or a Google Place ID and returns the
 * "write a review" URL that opens the review dialog directly.
 */
export function googleReviewUrl(input) {
  const v = String(input ?? '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return safeUrl(v);
  if (/^[A-Za-z0-9_-]{10,}$/.test(v)) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(v)}`;
  }
  return '';
}

export function safeColor(color, fallback = '#2563eb') {
  return /^#[0-9a-fA-F]{6}$/.test(String(color ?? '')) ? color : fallback;
}

/** Normalises an Israeli/international phone number to digits for wa.me links. */
export function waNumber(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return d;
}

export function waLink(phone, text) {
  const n = waNumber(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return n ? `https://wa.me/${n}${q}` : `https://wa.me/${q}`;
}

export function csvEscape(value) {
  const s = String(value ?? '');
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso.replace(' ', 'T')}Z`);
  return d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' });
}
