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

/** Gemini with Google Search grounding. When Google retires the model, it says which one to use: switch once and remember. */
function gemini({ key, model, fetchImpl }) {
  let current = model;
  const ask = (m, question, city) =>
    post(
      fetchImpl,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      { 'x-goog-api-key': key },
      {
        systemInstruction: { parts: [{ text: SYSTEM + (city ? ` המשתמש נמצא ב${city}.` : '') }] },
        contents: [{ role: 'user', parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
      },
    );
  return async (question, { city = '' } = {}) => {
    let r;
    try {
      r = await ask(current, question, city);
    } catch (err) {
      const next = /no longer available|not found|deprecated/i.test(err.message) && String(err.message).match(/use (?:models\/)?(gemini-[\w.-]*\w)/i)?.[1];
      if (!next || next === current) throw err;
      console.warn(`[gemini] ${current} is retired, switching to ${next} (set GEMINI_MODEL to choose)`);
      current = next;
      r = await ask(current, question, city);
    }
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

/**
 * Perplexity's Agent API (Sonar's chat completions were retired): an
 * OpenAI-style Responses call with web search forced on. A preset by default,
 * or a model when PERPLEXITY_MODEL is set.
 */
function perplexity({ key, model, fetchImpl }) {
  return async (question, { city = '' } = {}) => {
    const r = await post(fetchImpl, 'https://api.perplexity.ai/v1/responses', { authorization: `Bearer ${key}` }, {
      ...(model ? { model } : { preset: 'fast' }),
      instructions: SYSTEM + (city ? ` המשתמש נמצא ב${city}, ישראל.` : ' המשתמש נמצא בישראל.'),
      input: question,
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
    });
    const text = [];
    const sources = [];
    const add = (url, title) => url && /^https?:/.test(url) && sources.push({ title: title || '', link: url });
    for (const item of r.output || []) {
      if (item.type === 'message') {
        for (const c of item.content || []) {
          if (c.text) text.push(c.text);
          for (const a of c.annotations || []) add(a.url, a.title);
        }
      } else if (item.type === 'search_results') {
        for (const x of item.results || []) add(x.url, x.title);
      }
    }
    for (const x of r.search_results || []) add(x.url, x.title);
    const seen = new Set();
    return {
      text: text.join('\n') || r.output_text || '',
      sources: sources.filter((s) => (seen.has(s.link) ? false : seen.add(s.link))),
    };
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
  if (google) out.gemini = metered('gemini', gemini({ key: google, model: clean(env.GEMINI_MODEL) || 'gemini-3.8-flash', fetchImpl }));
  if (pplx) out.perplexity = metered('perplexity', perplexity({ key: pplx, model: clean(env.PERPLEXITY_MODEL), fetchImpl }));
  return out;
}
