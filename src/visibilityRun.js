import { parseJson } from './db.js';
import { accessOf } from './plans.js';
import { ENGINES, matchAnswer, namesOf } from './visibility.js';

/**
 * Asks each AI engine the business's questions and records whether the answer
 * mentions the business and cites its site or Google profile. Runs weekly;
 * each question costs one SerpApi search per Google engine and one Claude call.
 */
export function createVisibility({ store, serp = null, ai = null, everyDays = 7 }) {
  const engines = () =>
    Object.keys(ENGINES).filter((e) => (e === 'claude' ? Boolean(ai?.webAnswer) : Boolean(serp)));

  async function answer(engine, question, business) {
    if (engine === 'google_ai_mode') return serp.aiMode(question);
    if (engine === 'google_ai_overview') return serp.aiOverview(question);
    return ai.webAnswer(question, { city: business.ai_city });
  }

  async function runBusiness(business) {
    const queries = parseJson(business.ai_queries, []).slice(0, 5);
    if (!queries.length || !engines().length) return null;
    const names = namesOf({
      businessName: business.name,
      aliases: business.ai_aliases,
      places: store.googleLocations(business.id).map((l) => l.title),
    });
    const runAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let mentioned = 0;
    for (const query of queries) {
      for (const engine of engines()) {
        try {
          const a = await answer(engine, query, business);
          if (!a) {
            // Google showed no AI Overview for this search: not an error, just nothing to check.
            store.saveAiCheck(business.id, runAt, { query, engine, error: 'no_answer' });
            continue;
          }
          const m = matchAnswer(a, { names, site: business.ai_site });
          if (m.mentioned) mentioned++;
          store.saveAiCheck(business.id, runAt, { query, engine, ...m, sources: a.sources.slice(0, 8) });
        } catch (err) {
          store.saveAiCheck(business.id, runAt, { query, engine, error: String(err.message).slice(0, 200) });
        }
      }
    }
    store.updateBusiness(business.id, { ai_checked_at: runAt });
    return { runAt, mentioned };
  }

  async function runDue() {
    let done = 0;
    for (const business of store.aiVisibilityDue(everyDays)) {
      if (accessOf(business).state === 'paused') continue;
      if (await runBusiness(business)) done++;
    }
    return done;
  }

  return { engines, runBusiness, runDue };
}
