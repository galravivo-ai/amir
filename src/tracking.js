// Where sign-ups come from, and the ad pixels on the marketing site.
//
// A visit that arrives with UTM parameters or an ad click id (gclid, fbclid)
// leaves a first-party cookie with that source; a lead or a sign-up made later
// keeps it, so the system admin can compare campaigns. The Meta pixel and the
// Google tag load only when their ids are set, only on the marketing site and
// the sign-up and login pages (never on surveys, widgets or agency domains),
// and report three conversions: a lead, a sign-up and a first payment.

export const SOURCE_COOKIE = 'src';
const CONV_COOKIE = 'conv';
const KEYS = { utm_source: 's', utm_medium: 'm', utm_campaign: 'c', utm_content: 'ct', utm_term: 't' };

const clip = (v, max = 80) => String(v ?? '').replace(/[^\p{L}\p{N} ._\-+/:|]/gu, '').trim().slice(0, max);

/** Remembers the latest ad source of a visit, for 30 days. */
export function captureSource({ secure = false } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const q = req.query || {};
    const src = {};
    for (const [k, short] of Object.entries(KEYS)) if (q[k]) src[short] = clip(q[k]);
    if (q.gclid) src.click = 'google';
    else if (q.fbclid) src.click = 'meta';
    if (!Object.keys(src).length) return next();
    if (!src.s && src.click) src.s = src.click;
    src.at = new Date().toISOString().slice(0, 10);
    res.cookie(SOURCE_COOKIE, JSON.stringify(src), { httpOnly: true, sameSite: 'lax', secure, maxAge: 30 * 864e5 });
    next();
  };
}

/** The visit's source as stored JSON, or null. */
export function sourceOf(req) {
  try {
    const raw = JSON.parse(req.cookies?.[SOURCE_COOKIE] || 'null');
    if (!raw || typeof raw !== 'object') return null;
    const src = {};
    for (const k of ['s', 'm', 'c', 'ct', 't', 'click', 'at']) if (raw[k]) src[k] = clip(raw[k]);
    return src.s ? JSON.stringify(src) : null;
  } catch {
    return null;
  }
}

/** "source / campaign" for a stored source, or "ישיר" when there is none. */
export function sourceLabel(json) {
  try {
    const s = JSON.parse(json || 'null');
    if (!s?.s) return 'ישיר / לא ידוע';
    return s.c ? `${s.s} / ${s.c}` : s.s;
  } catch {
    return 'ישיר / לא ידוע';
  }
}

function config(env = process.env) {
  const meta = String(env.META_PIXEL_ID ?? '').trim();
  const google = String(env.GOOGLE_TAG_ID ?? '').trim();
  const label = (v) => (/^AW-\d+\/[\w-]+$/.test(String(v ?? '').trim()) ? String(v).trim() : '');
  return {
    meta: /^\d{8,20}$/.test(meta) ? meta : '',
    google: /^(AW|G|GT)-[A-Z0-9]+$/i.test(google) ? google : '',
    adsSignup: label(env.GOOGLE_ADS_SIGNUP_LABEL),
    adsPurchase: label(env.GOOGLE_ADS_PURCHASE_LABEL),
    adsLead: label(env.GOOGLE_ADS_LEAD_LABEL),
  };
}

/** True when at least one pixel is set up. */
export const pixelsOn = (env = process.env) => {
  const c = config(env);
  return Boolean(c.meta || c.google);
};

/** Extra Content-Security-Policy sources the pixels need (empty when off). */
export function pixelCsp(env = process.env) {
  const c = config(env);
  return {
    script: [c.meta && 'https://connect.facebook.net', c.google && 'https://www.googletagmanager.com'].filter(Boolean),
    connect: [
      c.meta && 'https://www.facebook.com',
      c.google && 'https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com https://googleads.g.doubleclick.net',
    ].filter(Boolean),
    frame: [c.google && 'https://td.doubleclick.net https://www.googletagmanager.com'].filter(Boolean),
  };
}

const num = (v) => Math.max(0, Math.round(Number(v) || 0));

/**
 * The pixel scripts for a page's <head>, with the conversions that happened:
 * events = [{ name: 'lead' | 'signup' | 'purchase', value? }]. Empty when off.
 */
export function pixelTags(events = [], env = process.env) {
  const c = config(env);
  if (!c.meta && !c.google) return '';
  const out = [];
  if (c.meta) {
    const meta = { lead: "fbq('track','Lead')", signup: "fbq('track','CompleteRegistration')", purchase: (v) => `fbq('track','Purchase',{value:${num(v)},currency:'ILS'})` };
    out.push(`<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${c.meta}');fbq('track','PageView');${events
      .map((e) => (e.name === 'purchase' ? meta.purchase(e.value) : meta[e.name]))
      .filter(Boolean)
      .map((s) => `${s};`)
      .join('')}</script>`);
  }
  if (c.google) {
    const label = { lead: c.adsLead, signup: c.adsSignup, purchase: c.adsPurchase };
    const ga = { lead: 'generate_lead', signup: 'sign_up', purchase: 'purchase' };
    const calls = events
      .filter((e) => ga[e.name])
      .flatMap((e) => {
        const value = e.name === 'purchase' ? `,value:${num(e.value)},currency:'ILS'` : '';
        return [`gtag('event','${ga[e.name]}',{${value.slice(1)}})`, label[e.name] && `gtag('event','conversion',{send_to:'${label[e.name]}'${value}})`];
      })
      .filter(Boolean)
      .map((s) => `${s};`)
      .join('');
    out.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${c.google}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${c.google}');${calls}</script>`);
  }
  return out.join('\n');
}

/** Marks a conversion to report on the next page the person sees (a redirect follows). */
export function flagConversion(res, name, value = 0, { secure = false } = {}) {
  if (!pixelsOn()) return;
  res.cookie(CONV_COOKIE, `${name}:${num(value)}`, { httpOnly: true, sameSite: 'lax', secure, maxAge: 10 * 60e3 });
}

/** Takes the pending conversion, if any: the pixel tags to put in the page, once. */
export function takeConversion(req, res) {
  const raw = String(req.cookies?.[CONV_COOKIE] ?? '');
  if (!raw) return '';
  res.clearCookie(CONV_COOKIE);
  const [name, value] = raw.split(':');
  if (!['signup', 'purchase'].includes(name)) return '';
  return pixelTags([{ name, value }]);
}
