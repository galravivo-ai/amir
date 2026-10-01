// Google Maps places and reviews through SerpApi, for businesses that follow
// a place by its link instead of connecting their Google account.
// All calls go through `fetchImpl` so tests can stand in for SerpApi.

const API = 'https://serpapi.com/search.json';
// Short links are followed only on these hosts, so a pasted link can't make
// the server fetch arbitrary addresses.
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.page', 'g.co']);
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
  const s = decodeURIComponent(u.href);
  const dataId = (s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || [])[1] || '';
  const placeId =
    u.searchParams.get('query_place_id') || u.searchParams.get('place_id') || (s.match(/place_id:([\w-]{10,})/) || [])[1] || '';
  const name = ((u.pathname.match(/\/maps\/place\/([^/]+)/) || [])[1] || u.searchParams.get('q') || u.searchParams.get('query') || '')
    .replace(/\+/g, ' ')
    .trim();
  return { dataId, placeId, name: name.startsWith('place_id:') ? '' : decodeURIComponent(name) };
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

/** Returns null when no SerpApi key is configured. */
export function createSerp({ apiKey = process.env.SERPAPI_KEY, fetchImpl = globalThis.fetch } = {}) {
  apiKey = String(apiKey ?? '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return null;

  async function call(params) {
    const q = new URLSearchParams({ ...params, api_key: apiKey });
    const res = await fetchImpl(`${API}?${q}`, { signal: AbortSignal.timeout(60e3) });
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
    for (let hop = 0; hop < 4; hop++) {
      const host = new URL(url).hostname;
      if (!SHORT_HOSTS.has(host)) break;
      const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15e3) });
      const next = res.headers.get('location');
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
        if (parsed.name) return { matches: await this.search(parsed.name) };
        return { matches: [] };
      }
      return { matches: await this.search(text) };
    },

    /** The untouched SerpApi answer for a place, for the system admin's diagnosis page. */
    rawReviews: ({ dataId, placeId }) =>
      call({ engine: 'google_maps_reviews', sort_by: 'newestFirst', hl: 'iw', ...(dataId ? { data_id: dataId } : { place_id: placeId }) }),

    /** Newest reviews first, plus the place's overall rating. */
    async reviews({ dataId, placeId }, { nextPageToken = '' } = {}) {
      const params = { engine: 'google_maps_reviews', sort_by: 'newestFirst', hl: 'iw' };
      if (dataId) params.data_id = dataId;
      else params.place_id = placeId;
      if (nextPageToken) Object.assign(params, { next_page_token: nextPageToken, num: '20' });
      const r = await call(params);
      const info = r.place_info || {};
      return {
        place: { title: info.title || '', address: info.address || '', rating: num(info.rating), total: Math.round(num(info.reviews)) },
        reviews: (r.reviews || []).map(review),
        next: r.serpapi_pagination?.next_page_token || '',
      };
    },
  };
}
