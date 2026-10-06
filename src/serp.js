// Google Maps places and reviews through SerpApi, for businesses that follow
// a place by its link instead of connecting their Google account.
// All calls go through `fetchImpl` so tests can stand in for SerpApi.
import { flattenSerpAnswer } from './visibility.js';

const API = 'https://serpapi.com/search.json';
// Short links are followed only on these hosts, so a pasted link can't make
// the server fetch arbitrary addresses.
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.page', 'g.co', 'share.google']);
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/i;

export class SerpError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

/** A place's public Google Maps link, from whichever id we have. */
export function mapsUrl({ placeId = '', dataId = '', title = '' }) {
  if (placeId) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
  if (dataId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title || 'place')}`;
  return '';
}

/** The "write a review" link Google gives every place. */
export const writeReviewUrl = (placeId) => (placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : '');

/** Pulls the place ids and name out of a long Google Maps link. */
export function parseMapsLink(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  // Google's cookie-consent page carries the real address in `continue`.
  if (/^consent\./.test(u.hostname) && u.searchParams.get('continue')) return parseMapsLink(u.searchParams.get('continue'));
  let s = u.href;
  try {
    s = decodeURIComponent(u.href);
  } catch {
    /* keep it encoded */
  }
  const dataId = (s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || s.match(/[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1] || '';
  const placeId =
    u.searchParams.get('query_place_id') || u.searchParams.get('place_id') || (s.match(/place_id:([\w-]{10,})/) || [])[1] || '';
  const name = ((u.pathname.match(/\/maps\/place\/([^/]+)/) || [])[1] || u.searchParams.get('q') || u.searchParams.get('query') || '')
    .replace(/\+/g, ' ')
    .trim();
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    /* keep it as it came */
  }
  return { dataId, placeId, name: name.startsWith('place_id:') ? '' : decoded };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function place(p) {
  return {
    dataId: p.data_id || '',
    placeId: p.place_id || '',
    title: p.title || '',
    address: p.address || '',
    rating: num(p.rating),
    total: Math.round(num(p.reviews)),
  };
}

function review(r) {
  const id = r.review_id || r.link || `${r.user?.name}|${r.iso_date || r.date}`;
  const text = (x) => (x ? x.extracted_snippet?.original || x.snippet || '' : '');
  return {
    name: `serp:${id}`,
    reviewer: r.user?.name || '',
    photo: r.user?.thumbnail || '',
    rating: Math.max(1, Math.min(5, Math.round(num(r.rating)) || 1)),
    comment: text(r),
    createTime: r.iso_date || '',
    updateTime: r.iso_date_of_last_edit || r.iso_date || '',
    reply: text(r.response),
    replyTime: r.response?.iso_date || r.response?.iso_date_of_last_edit || '',
    link: r.link || '',
  };
}

const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== '' && !(typeof v === 'object' && !Object.keys(v).length));

/**
 * The profile fields the health check reads. `null` means SerpApi didn't say,
 * which the check treats as unknown rather than missing.
 */
export function profileOf(p) {
  const types = Array.isArray(p.types) ? p.types : p.type ? [p.type] : [];
  const photos = num(p.photos_count ?? p.images_count) || (Array.isArray(p.images) ? p.images.length : 0);
  return {
    title: p.title || '',
    rating: num(p.rating),
    reviews: Math.round(num(p.reviews)),
    phone: p.phone || '',
    website: p.website || '',
    address: p.address || '',
    hours: has(p.operating_hours) || has(p.hours),
    description: typeof p.description === 'string' ? p.description : p.description?.snippet || p.about?.description || '',
    types,
    photos: photos || null,
    attributes: has(p.extensions) || has(p.service_options) || has(p.amenities),
    menu: has(p.menu),
    unclaimed: p.unclaimed_listing === true ? true : null,
    lat: Number(p.gps_coordinates?.latitude) || null,
    lng: Number(p.gps_coordinates?.longitude) || null,
  };
}

/** The reviews array, wherever this version of the answer keeps it. */
function findReviews(r) {
  if (Array.isArray(r.reviews)) return r.reviews;
  for (const v of Object.values(r)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && 'rating' in v[0] && ('snippet' in v[0] || 'user' in v[0])) return v;
  }
  return [];
}

/** Returns null when no SerpApi key is configured. */
export function createSerp({ apiKey = process.env.SERPAPI_KEY, fetchImpl = globalThis.fetch, onCall = null } = {}) {
  apiKey = String(apiKey ?? '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return null;

  async function call(params) {
    const q = new URLSearchParams({ ...params, api_key: apiKey });
    const res = await fetchImpl(`${API}?${q}`, { signal: AbortSignal.timeout(60e3) });
    onCall?.();
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    // "No results" comes back as an error; for us it is just an empty answer.
    if (json.error && /hasn't returned any results/i.test(json.error)) return {};
    if (!res.ok || json.error) throw new SerpError(String(json.error || `HTTP ${res.status}`), res.status);
    return json;
  }

  /** Follows a short share link (maps.app.goo.gl...) to the full Maps URL. */
  async function expand(link) {
    let url = link;
    for (let hop = 0; hop < 6; hop++) {
      const u = new URL(url);
      if (/^consent\./.test(u.hostname)) {
        const next = u.searchParams.get('continue');
        if (!next) break;
        url = next;
        continue;
      }
      // Short links, and the hop share.google makes through google.com/share.google.
      const hop1 = SHORT_HOSTS.has(u.hostname) || (GOOGLE_HOST.test(u.hostname) && u.pathname === '/share.google');
      if (!hop1) break;
      const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15e3) });
      let next = res.headers.get('location');
      if (!next && res.status === 200) {
        // Some answers redirect in the page instead of the header.
        const body = (await res.text()).slice(0, 200000).replace(/&amp;/g, '&').replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
        next = (body.match(/https:\/\/(?:www\.|maps\.)?google\.[a-z.]+\/(?:maps|search)[^"'<>\s\\]*/) || [])[0] || null;
      }
      if (!next) break;
      url = new URL(next, url).href;
    }
    return url;
  }

  return {
    /** Places matching a free-text search ("קפה במרכז תל אביב"). */
    async search(text) {
      const r = await call({ engine: 'google_maps', type: 'search', q: text, hl: 'iw', gl: 'il' });
      if (r.place_results) return [place(r.place_results)];
      return (r.local_results || []).slice(0, 8).map(place).filter((p) => p.dataId || p.placeId);
    },

    /**
     * Turns what the user pasted into a place to follow: ids from a Maps link,
     * or search results to choose from.
     */
    async find(input) {
      const text = String(input ?? '').trim().slice(0, 500);
      if (!text) return { matches: [] };
      let link = null;
      try {
        const u = new URL(text);
        if (SHORT_HOSTS.has(u.hostname) || GOOGLE_HOST.test(u.hostname)) link = await expand(u.href);
      } catch {
        /* not a link: search for it */
      }
      if (link) {
        const parsed = parseMapsLink(link) || {};
        if (parsed.dataId || parsed.placeId) return { direct: { dataId: parsed.dataId, placeId: parsed.placeId, title: parsed.name, address: '' } };
        // A link we could only read a name from (a Google search page, say): search by the name.
        const host = new URL(link).hostname;
        if (parsed.name && !SHORT_HOSTS.has(host)) return { matches: await this.search(parsed.name) };
        return { matches: [], unreadLink: true };
      }
      return { matches: await this.search(text) };
    },

    /**
     * What the public Google profile shows: hours, phone, site, categories,
     * description, photos and more. By place id when known, else by searching
     * for the place and picking it by its data id.
     */
    async placeDetails({ placeId = '', dataId = '', title = '', address = '' }) {
      let p = null;
      if (placeId) p = (await call({ engine: 'google_maps', place_id: placeId, hl: 'iw', gl: 'il' })).place_results || null;
      if (!p && title) {
        const r = await call({ engine: 'google_maps', type: 'search', q: [title, address].filter(Boolean).join(' '), hl: 'iw', gl: 'il' });
        p = r.place_results || (r.local_results || []).find((x) => (dataId && x.data_id === dataId) || (placeId && x.place_id === placeId)) || null;
      }
      return p ? profileOf(p) : null;
    },

    /**
     * The Maps results for a search made from a point, in order. One search.
     * `zoom` sets how wide around the point Google looks.
     */
    async mapResults(query, { lat, lng, zoom = 15 }) {
      const r = await call({ engine: 'google_maps', type: 'search', q: query, ll: `@${lat},${lng},${zoom}z`, hl: 'iw', gl: 'il' });
      return (r.local_results || []).map((x, i) => ({ position: Number(x.position) || i + 1, dataId: x.data_id || '', placeId: x.place_id || '', title: x.title || '', rating: num(x.rating) }));
    },

    /** The account's plan and how many searches are left this month (free: not counted as a search). */
    async account() {
      const res = await fetchImpl(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(20e3) });
      const json = JSON.parse(await res.text());
      if (!res.ok || json.error) throw new SerpError(String(json.error || `HTTP ${res.status}`), res.status);
      return {
        plan: json.plan_name || '',
        perMonth: Number(json.searches_per_month) || 0,
        left: Number(json.plan_searches_left ?? json.total_searches_left) || 0,
        used: Number(json.this_month_usage) || 0,
      };
    },

    /** Google's AI Mode answer to a question, as text and sources. */
    async aiMode(question) {
      const r = await call({ engine: 'google_ai_mode', q: question, hl: 'iw', gl: 'il', no_cache: 'true' });
      return flattenSerpAnswer(r);
    },

    /** The AI Overview above Google's results, or null when Google shows none. */
    async aiOverview(question) {
      const r = await call({ engine: 'google', q: question, hl: 'iw', gl: 'il', google_domain: 'google.co.il', no_cache: 'true' });
      let ov = r.ai_overview;
      if (!ov) return null;
      // Sometimes the overview comes in a second request, with a token that lives a minute.
      if (ov.page_token && !ov.text_blocks) ov = (await call({ engine: 'google_ai_overview', page_token: ov.page_token })).ai_overview || ov;
      return flattenSerpAnswer(ov);
    },

    /** The untouched SerpApi answer for a place, for the system admin's diagnosis page. */
    rawReviews: ({ dataId, placeId }) =>
      call({ engine: 'google_maps_reviews', sort_by: 'newestFirst', hl: 'iw', ...(dataId ? { data_id: dataId } : { place_id: placeId }) }),

    /** Newest reviews first, plus the place's overall rating. */
    async reviews({ dataId, placeId }, { nextPageToken = '' } = {}) {
      const base = { engine: 'google_maps_reviews' };
      if (dataId) base.data_id = dataId;
      else base.place_id = placeId;
      // Hebrew and newest-first are what we want; if Google answers with a
      // rating but no reviews, fall back step by step to plainer requests.
      const attempts = nextPageToken
        ? [{ sort_by: 'newestFirst', hl: 'iw', next_page_token: nextPageToken, num: '20' }]
        : [{ sort_by: 'newestFirst', hl: 'iw' }, { sort_by: 'newestFirst' }, {}];
      let r = {};
      for (const extra of attempts) {
        r = await call({ ...base, ...extra });
        if (findReviews(r).length || !num(r.place_info?.reviews)) break;
      }
      const info = r.place_info || {};
      return {
        place: { title: info.title || '', address: info.address || '', rating: num(info.rating), total: Math.round(num(info.reviews)) },
        reviews: findReviews(r).map(review),
        next: r.serpapi_pagination?.next_page_token || '',
        keys: Object.keys(r).filter((k) => k !== 'search_metadata' && k !== 'search_parameters'),
      };
    },
  };
}
