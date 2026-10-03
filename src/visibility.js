// "AI visibility": do AI answers (Google AI Mode / AI Overview, Claude with
// web search) mention the business, and cite its site or Google profile?

export const ENGINES = {
  google_ai_mode: 'Google AI Mode',
  google_ai_overview: 'Google AI Overview',
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

/** Engines that come only with the "AI visibility plus" add-on. */
export const PLUS_ENGINES = ['chatgpt', 'gemini', 'perplexity'];

/** Questions per business: the plans include 5, the add-on raises it. */
export const MAX_QUERIES = 5;
export const PLUS_MAX_QUERIES = 10;

/** Lowercase, no niqqud or punctuation, one spelling for geresh and quotes. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[׳'’`"״“”]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The names to look for: the business name, the place names and the aliases the owner typed. */
export function namesOf({ businessName, aliases = '', places = [] }) {
  const all = [businessName, ...places, ...String(aliases).split(/[,\n]/)];
  // "ג׳קו סטריט · דיזנגוף" also counts as "ג׳קו סטריט".
  const parts = all.flatMap((n) => [n, String(n ?? '').split(/[·|–-]/)[0]]);
  return [...new Set(parts.map(normalize).filter((n) => n.length >= 3))];
}

export function siteHost(url) {
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Checks one answer. `sources` are { title, link }. Mentioned: a name appears in
 * the answer. Cited: a source is the business's site, or a Google Maps / profile
 * link whose title carries the name.
 */
export function matchAnswer({ text, sources = [] }, { names, site = '' }) {
  const body = ` ${normalize(text)} `;
  const hit = names.find((n) => body.includes(` ${n} `));
  let snippet = '';
  if (hit) {
    // The sentence the business appears in, for the owner to read.
    const sentences = String(text).split(/(?<=[.!?\n])\s+/);
    snippet = (sentences.find((s) => ` ${normalize(s)} `.includes(` ${hit} `)) || '').trim().slice(0, 300);
  }
  const host = siteHost(site);
  const cited = sources.find((s) => {
    const h = siteHost(s.link || '');
    if (host && (h === host || h.endsWith(`.${host}`))) return true;
    const isProfile = /(^|\.)google\.[a-z.]+$/.test(h) || h === 'maps.app.goo.gl' || h === 'g.page';
    return isProfile && names.some((n) => ` ${normalize(s.title)} `.includes(` ${n} `));
  });
  return { mentioned: Boolean(hit), cited: Boolean(cited), snippet, citedLink: cited?.link || '' };
}

/** Pulls readable text and sources out of SerpApi's AI Overview / AI Mode blocks. */
export function flattenSerpAnswer(r) {
  const texts = [];
  const sources = [];
  // Only the answer's own blocks count as "mentioned"; references only give sources.
  const walk = (v, key = '', answer = true) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key, answer));
    if (typeof v === 'object') {
      if (typeof v.link === 'string' && /^https?:/.test(v.link)) sources.push({ title: v.title || v.source || '', link: v.link });
      for (const [k, x] of Object.entries(v)) if (!['link', 'thumbnail', 'serpapi_link', 'page_token', 'favicon'].includes(k)) walk(x, k, answer);
      return;
    }
    if (answer && typeof v === 'string' && ['snippet', 'title', 'text', 'heading'].includes(key)) texts.push(v);
  };
  walk(r.text_blocks);
  walk(r.references, '', false);
  const seen = new Set();
  return {
    text: texts.join('\n'),
    sources: sources.filter((s) => (seen.has(s.link) ? false : seen.add(s.link))).slice(0, 20),
  };
}
