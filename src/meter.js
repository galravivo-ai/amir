import { AsyncLocalStorage } from 'node:async_hooks';
import { monthKey } from './usage.js';

// Measures what each business costs: every SerpApi search and AI request is
// counted against the business whose work caused it. The business is carried
// through async calls, so deep code (a background check, a job) needn't pass it.

const scope = new AsyncLocalStorage();

/** Runs `fn` with work counted against `businessId`. */
export const withBusiness = (businessId, fn) => scope.run({ businessId }, fn);

export function createMeter(store) {
  return {
    /** service: 'serp', 'ai', 'openai', 'gemini', 'perplexity'. */
    record(service, { calls = 1, tokensIn = 0, tokensOut = 0 } = {}) {
      try {
        store.addApiUsage(scope.getStore()?.businessId ?? null, monthKey(), service, calls, tokensIn, tokensOut);
      } catch (err) {
        console.warn('[meter] could not record:', err.message);
      }
    },
  };
}
