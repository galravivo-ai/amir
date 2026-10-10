import { withBusiness } from './meter.js';
import { parseJson } from './db.js';
import { accessOf, hasAiPlus } from './plans.js';
import { ENGINES, MAX_QUERIES, PLUS_ENGINES, PLUS_MAX_QUERIES, matchAnswer, namesOf } from './visibility.js';

/**
 * Asks each AI engine the business's questions and records whether the answer
 * mentions the business and cites its site or Google profile. Runs weekly;
 * each question costs one SerpApi search per Google engine and one call to
 * each other engine. ChatGPT, Gemini and Perplexity (`extra`) are asked only
 * for businesses with the "AI visibility plus" add-on.
 */
export function createVisibility({ store, serp = null, ai = null, extra = {}, everyDays = 7 }) {
  const configured = (e) => {
    if (e === 'claude') return Boolean(ai?.webAnswer);
    if (PLUS_ENGINES.includes(e)) return typeof extra[e] === 'function';
    return Boolean(serp);
  };
  /** The engines that are set up; with a business, only the ones its plan includes. */
  const engines = (business) =>
    Object.keys(ENGINES).filter((e) => configured(e) && (!business || hasAiPlus(business) || !PLUS_ENGINES.includes(e)));
  const maxQueries = (business) => (hasAiPlus(business) ? PLUS_MAX_QUERIES : MAX_QUERIES);

  async function answer(engine, question, business) {
    if (engine === 'google_ai_mode') return serp.aiMode(question);
    if (engine === 'google_ai_overview') return serp.aiOverview(question);
    if (engine === 'claude') return ai.webAnswer(question, { city: business.ai_city });
    return extra[engine](question, { city: business.ai_city });
  }

  async function runBusinessUnscoped(business, onProgress = null) {
    const queries = parseJson(business.ai_queries, []).slice(0, maxQueries(business));
    if (!queries.length || !engines(business).length) return null;
    const names = namesOf({
      businessName: business.name,
      aliases: business.ai_aliases,
      places: store.googleLocations(business.id).map((l) => l.title),
    });
    const runAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const list = engines(business);
    const total = queries.length * list.length;
    let mentioned = 0;
    let done = 0;
    const answered = [];
    onProgress?.(0, total);
    for (const query of queries) {
      // The engines are independent: ask them all at once, one question at a time.
      const results = await Promise.all(
        list.map(async (engine) => {
          try {
            const a = await answer(engine, query, business);
            // No answer: Google showed no AI Overview for this search, not an error.
            return { engine, a };
          } catch (err) {
            return { engine, error: String(err.message).slice(0, 200) };
          } finally {
            onProgress?.(++done, total);
          }
        }),
      );
      for (const { engine, a, error } of results) {
        if (error) store.saveAiCheck(business.id, runAt, { query, engine, error });
        else if (!a) store.saveAiCheck(business.id, runAt, { query, engine, error: 'no_answer' });
        else {
          const m = matchAnswer(a, { names, site: business.ai_site });
          if (m.mentioned) mentioned++;
          store.saveAiCheck(business.id, runAt, { query, engine, ...m, sources: a.sources.slice(0, 8) });
          if (a.text) answered.push({ i: answered.length + 1, query, engine: ENGINES[engine], key: engine, text: a.text, mentioned: m.mentioned, sources: a.sources });
        }
      }
    }
    store.updateBusiness(business.id, { ai_checked_at: runAt });
    const withPlan = answered.length && ai?.visibilityPlan && hasAiPlus(business);
    if (withPlan) onProgress?.(done, total, 'plan');
    if (withPlan) await planFor(business, runAt, answered, mentioned).catch((err) => console.warn('[visibility] plan failed:', err.message));
    return { runAt, mentioned };
  }

  /** Who the answers recommend instead, and what to do to show up: one AI request per check. */
  async function planFor(business, runAt, answered, mentioned) {
    const hosts = new Map();
    for (const a of answered) {
      for (const host of new Set(a.sources.map((x) => { try { return new URL(x.link).hostname.replace(/^www\./, ''); } catch { return ''; } }).filter(Boolean))) {
        hosts.set(host, (hosts.get(host) || 0) + 1);
      }
    }
    const top = [...hosts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, n]) => `${h} (${n})`).join(', ');
    const facts = [
      `שם העסק: ${business.name}`,
      business.ai_aliases ? `שמות נוספים: ${business.ai_aliases}` : '',
      `אתר: ${business.ai_site || 'אין'}`,
      `עיר או אזור: ${business.ai_city || 'לא צוין'}`,
      `הוזכר ב-${mentioned} מתוך ${answered.length} תשובות`,
      `המקורות שהתשובות נשענו עליהם (כמה תשובות): ${top || 'אין'}`,
    ].filter(Boolean).join('\n');
    const { names, plan } = await ai.visibilityPlan({ facts, answers: answered });
    for (const a of answered) store.setAiRecommended(business.id, runAt, a.query, a.key, names.get(a.i) || []);
    if (plan) store.saveAiPlan(business.id, runAt, plan);
  }

  async function runDue() {
    let done = 0;
    for (const business of store.aiVisibilityDue(everyDays)) {
      if (accessOf(business).state === 'paused') continue;
      if (await runBusiness(business)) done++;
    }
    return done;
  }

  // Searches and AI requests made here are counted against the business.
  const runBusiness = (business, onProgress) => withBusiness(business.id, () => runBusinessUnscoped(business, onProgress));

  return { engines, maxQueries, runBusiness, runDue };
}
