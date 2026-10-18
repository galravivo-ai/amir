import crypto from 'node:crypto';
import { ANNUAL_MONTHS, branchPrice, PLANS, priceFor, profilesOf } from './plans.js';
import { parseJson } from './db.js';

// Payments made on iCount's payment pages. iCount calls the IPN address after
// each payment; the address carries a secret (ICOUNT_IPN_SECRET), which is
// what proves the call came from the iCount account it was set up in.
//
// A payment opens a plan or a branch on its own only when it's unambiguous:
// the payer's email belongs to the owner of a business that asked for exactly
// that, and the amount is exactly its price. Anything else is kept and sent to
// the operator, who activates by hand as before. The field names aren't
// assumed: any email in the call is the payer's, any sum/amount/total field
// the amount.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every value in the call, with its key, also inside nested objects. */
function entries(obj, out = [], key = '') {
  if (obj == null) return out;
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) entries(v, out, k);
  } else out.push([key, String(obj).trim()]);
  return out;
}

export function readPayment(payload) {
  const all = entries(payload);
  const emails = [...new Set(all.map(([, v]) => v.toLowerCase()).filter((v) => EMAIL.test(v)))];
  const amounts = [...new Set(all.filter(([k]) => /sum|amount|total|price/i.test(k)).map(([, v]) => Number(v.replace(/[₪,\s]/g, ''))).filter((n) => Number.isFinite(n) && n > 0))];
  return { emails, amounts };
}

export const secretMatches = (given) => {
  const secret = String(process.env.ICOUNT_IPN_SECRET ?? '').trim();
  if (secret.length < 16) return false;
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** What this payment pays for: one plan request or one waiting branch, or null. */
export function matchPayment(store, { emails, amounts }) {
  const found = [];
  for (const email of emails) {
    const user = store.userByEmail(email);
    if (!user) continue;
    for (const b of store.businessesFor(user.id).filter((x) => x.role === 'owner')) {
      const request = parseJson(b.plan_request, null);
      const plan = request && PLANS[request.plan];
      if (plan?.price != null) {
        const cycle = request.cycle === 'annual' ? 'annual' : 'monthly';
        // The plan's own page charges one profile; a single page for everything may charge them all.
        const prices = new Set([priceFor(plan, cycle, 1), priceFor(plan, cycle, profilesOf(store, b.id))]);
        if (amounts.some((a) => prices.has(a))) found.push({ kind: 'plan', business: b, plan: request.plan, cycle });
      }
      const current = PLANS[b.plan];
      if (current?.price != null) {
        const price = branchPrice(current) * (b.billing_cycle === 'annual' ? ANNUAL_MONTHS : 1);
        const branch = store
          .pendingBranches()
          .filter((l) => l.business_id === b.id && l.pay_requested_at)
          .sort((x, y) => x.pay_requested_at.localeCompare(y.pay_requested_at))[0];
        if (branch && amounts.includes(price)) found.push({ kind: 'branch', business: b, branch });
      }
    }
  }
  return found.length === 1 ? found[0] : null;
}
