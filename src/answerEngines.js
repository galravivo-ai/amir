// The AI assistants of the "AI visibility plus" add-on: ChatGPT, Gemini and
// Perplexity, each asked with web search on. Each is on only when its key is
// set. Plain fetch, so tests can stand in for the providers.

const SYSTEM = 'ענה בעברית לשאלה של משתמש בישראל, כמו עוזר AI רגיל. אם מבקשים המלצה, תן המלצות קונקרטיות עם שמות של עסקים אמיתיים, על סמך חיפוש ברשת.';

export class EngineError extends Error {}

const clean = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');
const isDomain = (s) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(s ?? ''));

async function post(fetchImpl, url, headers, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120e3),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) throw new EngineError(String(json.error?.message || json.error || `HTTP ${res.status}`).slice(0, 200));
  return json;
}

/** ChatGPT through the Responses API with the web search tool. */
function chatgpt({ key, model, fetchImpl }) {
  return async (question, { city = '' } = {}) => {
    const r = await post(fetchImpl, 'https://api.openai.com/v1/responses', { authorization: `Bearer ${key}` }, {
      model,
      instructions: SYSTEM,
      input: question,
      tools: [{ type: 'web_search', user_location: { type: 'approximate', country: 'IL', timezone: 'Asia/Jerusalem', ...(city ? { city } : {}) } }],
    });
    const text = [];
    const sources = [];
    for (const item of r.output || []) {
      if (item.type !== 'message') continue;
      for (const c of item.content || []) {
        if (c.type !== 'output_text') continue;
        text.push(c.text || '');
        for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url) sources.push({ title: a.title || '', link: a.url });
      }
    }
    return { text: text.join('\n'), sources };
  };
}

/** Gemini with Google Search grounding. */
function gemini({ key, model, fetchImpl }) {
  return async (question, { city = '' } = {}) => {
    const r = await post(
      fetchImpl,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': key },
      {
        systemInstruction: { parts: [{ text: SYSTEM + (city ? ` המשתמש נמצא ב${city}.` : '') }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
      },
    );
    const cand = r.candidates?.[0] || {};
    const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
    // Gemini's links are short-lived redirects; the title is the site's domain.
    const sources = (cand.groundingMetadata?.groundingChunks || [])
      .map((c) => c.web)
      .filter((w) => w?.uri)
      .map((w) => ({ title: w.title || '', link: isDomain(w.title) ? `https://${w.title}` : w.uri }));
    return { text, sources };
  };
}

/** Perplexity's Sonar, which always searches the web. */
function perplexity({ key, model, fetchImpl }) {
  return async (question, { city = '' } = {}) => {
    const r = await post(fetchImpl, 'https://api.perplexity.ai/chat/completions', { authorization: `Bearer ${key}` }, {
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: question },
      ],
      web_search_options: { user_location: { country: 'IL', ...(city ? { city } : {}) } },
    });
    const text = r.choices?.[0]?.message?.content || '';
    const sources = Array.isArray(r.search_results) && r.search_results.length
      ? r.search_results.filter((s) => s.url).map((s) => ({ title: s.title || '', link: s.url }))
      : (r.citations || []).filter((u) => typeof u === 'string').map((u) => ({ title: '', link: u }));
    return { text, sources };
  };
}

/** The engines whose keys are set: { chatgpt?, gemini?, perplexity? }. */
export function createAnswerEngines({ env = process.env, fetchImpl = globalThis.fetch, onCall = null } = {}) {
  const out = {};
  const metered = (name, fn) => async (...args) => {
    onCall?.(name);
    return fn(...args);
  };
  const openai = clean(env.OPENAI_API_KEY);
  const google = clean(env.GEMINI_API_KEY);
  const pplx = clean(env.PERPLEXITY_API_KEY);
  if (openai) out.chatgpt = metered('openai', chatgpt({ key: openai, model: clean(env.OPENAI_MODEL) || 'gpt-5-mini', fetchImpl }));
  if (google) out.gemini = metered('gemini', gemini({ key: google, model: clean(env.GEMINI_MODEL) || 'gemini-2.5-flash', fetchImpl }));
  if (pplx) out.perplexity = metered('perplexity', perplexity({ key: pplx, model: clean(env.PERPLEXITY_MODEL) || 'sonar', fetchImpl }));
  return out;
}
