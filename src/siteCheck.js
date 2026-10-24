import dns from 'node:dns/promises';
import net from 'node:net';
import { isPrivateAddress } from './notify.js';
import { safeUrl } from './util.js';

// The website check in the promotion plan: opens the business's home page the
// way a search engine would, and reads what matters for local search and for
// AI answers: the title and description, a "local business" and an FAQ
// markup (schema.org), the phone, a link to the map. Only public addresses
// are opened, redirects are checked one by one, and the page is cut at 2MB.

const MAX = 2 * 1024 * 1024;
const LOCAL_TYPES =
  /LocalBusiness|Restaurant|Cafe|CafeOrCoffeeShop|Bakery|BarOrPub|FoodEstablishment|Store|Shop|Salon|BeautySalon|HairSalon|NailSalon|DaySpa|HealthAndBeautyBusiness|Dentist|Physician|MedicalClinic|MedicalBusiness|Optician|Pharmacy|LegalService|Attorney|Notary|AccountingService|FinancialService|RealEstateAgent|HomeAndConstructionBusiness|Plumber|Electrician|Locksmith|HVACBusiness|GeneralContractor|AutomotiveBusiness|AutoRepair|AutoDealer|LodgingBusiness|Hotel|SportsActivityLocation|ExerciseGym|ChildCare|EducationalOrganization|ProfessionalService|AnimalShelter|VeterinaryCare|TravelAgency|EntertainmentBusiness/;

async function publicUrl(raw, lookup) {
  const url = safeUrl(raw);
  if (!url) return '';
  const u = new URL(url);
  if (u.username || u.password) return '';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /\.(localhost|internal|local)$/.test(host)) return '';
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return '';
  } catch {
    return '';
  }
  return url;
}

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const metaOf = (html, name) =>
  (html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i'))?.[0].match(/content=["']([^"']*)["']/i)?.[1] || '').trim();

/** Every @type in the page's JSON-LD and microdata. */
function schemaTypes(html) {
  const types = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const t = v['@type'];
    [].concat(t || []).forEach((x) => types.add(String(x)));
    Object.values(v).forEach(walk);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      // a broken block: ignored, like search engines do
    }
  }
  for (const m of html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) types.add(m[1]);
  return [...types];
}

const digits = (s) => String(s ?? '').replace(/\D/g, '');

/** Reads a fetched page; separate from the fetch so it can be tested on its own. */
export function readSite(html, { url = '', phone = '', city = '', keywords = [] } = {}) {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 200);
  const description = (metaOf(html, 'description') || metaOf(html, 'og:description')).slice(0, 300);
  const h1 = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').slice(0, 200);
  const text = strip(html);
  const types = schemaTypes(html);
  const head = `${title} ${h1} ${description}`;
  // A phone is found by its last 8 digits, whatever the format (03-1234567, +972 3 123 4567).
  const tail = digits(phone).slice(-8);
  const pageDigits = digits(text) + digits(html.match(/href=["']tel:[^"']+/gi)?.join('') || '');
  return {
    url,
    https: url.startsWith('https:'),
    title,
    description,
    h1,
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    localSchema: types.some((t) => LOCAL_TYPES.test(t)),
    faqSchema: types.includes('FAQPage'),
    types: types.slice(0, 12),
    phoneOnPage: tail.length === 8 ? pageDigits.includes(tail) : null,
    mapLink: /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\/|waze\.com/i.test(html),
    cityInHead: city ? head.includes(city) : null,
    keywordInHead: keywords.length ? keywords.some((k) => k && head.includes(k)) : null,
    words: text.split(' ').length,
  };
}

export async function checkSite(raw, { phone = '', city = '', keywords = [], fetchImpl = globalThis.fetch, lookup = dns.lookup, timeout = 12000 } = {}) {
  let url = raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw;
  for (let hop = 0; hop < 5; hop++) {
    const safe = await publicUrl(url, lookup);
    if (!safe) return { url: String(raw ?? ''), error: 'הכתובת לא תקינה או לא ציבורית.' };
    let res;
    try {
      res = await fetchImpl(safe, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeout),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; GoFiveSiteCheck/1.0)', accept: 'text/html' },
      });
    } catch {
      return { url: safe, error: 'האתר לא נפתח (לא עונה או איטי מדי).' };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), safe).toString();
      continue;
    }
    if (!res.ok) return { url: safe, error: `האתר החזיר שגיאה (${res.status}).` };
    const reader = res.body?.getReader?.();
    let html = '';
    if (reader) {
      const dec = new TextDecoder();
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        html += dec.decode(value, { stream: true });
        if (size > MAX) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    } else {
      html = (await res.text()).slice(0, MAX);
    }
    return readSite(html, { url: safe, phone, city, keywords });
  }
  return { url: String(raw ?? ''), error: 'יותר מדי הפניות בין כתובות.' };
}
