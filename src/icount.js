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

// A payment whose email isn't the account's can still be matched by its amount,
// when exactly one business went to pay that amount in the last few days.
const RECENT = 3 * 864e5;
const when = (t) => Date.parse(/Z|[+-]\d\d:?\d\d$/.test(t) ? t : `${String(t).replace(' ', 'T')}Z`) || 0;

/** Everything waiting for a payment: plan requests and branches sent to pay. */
function waiting(store) {
  const out = [];
  const emailsOf = (b) =>
    new Set([...store.membersOf(b.id).map((m) => m.email), ...String(b.alert_emails ?? '').split(/[,;\s]+/)].map((e) => String(e).trim().toLowerCase()).filter(Boolean));
  for (const b of store.db.prepare('SELECT * FROM businesses WHERE plan_request IS NOT NULL').all()) {
    const request = parseJson(b.plan_request, null);
    const plan = request && PLANS[request.plan];
    if (plan?.price == null) continue;
    const cycle = request.cycle === 'annual' ? 'annual' : 'monthly';
    // The plan's own page charges one profile; a single page for everything may charge them all.
    const prices = new Set([priceFor(plan, cycle, 1), priceFor(plan, cycle, profilesOf(store, b.id))]);
    out.push({ kind: 'plan', business: b, plan: request.plan, cycle, prices, emails: emailsOf(b), at: when(request.at) });
  }
  const seen = new Set();
  const branches = store.pendingBranches().filter((l) => l.pay_requested_at).sort((x, y) => x.pay_requested_at.localeCompare(y.pay_requested_at));
  for (const branch of branches) {
    if (seen.has(branch.business_id)) continue; // one payment opens the branch that waited longest
    seen.add(branch.business_id);
    const b = store.businessById(branch.business_id);
    const current = PLANS[b?.plan];
    if (current?.price == null) continue;
    const price = branchPrice(current) * (b.billing_cycle === 'annual' ? ANNUAL_MONTHS : 1);
    out.push({ kind: 'branch', business: b, branch, prices: new Set([price]), emails: emailsOf(b), at: when(branch.pay_requested_at) });
  }
  return out;
}

/**
 * What this payment pays for: one plan request or one waiting branch, or null.
 * First by the payer's email (anyone on the business's team) and the amount;
 * else by the amount alone, when only one business went to pay it lately.
 */
export function matchPayment(store, { emails, amounts }, now = Date.now()) {
  const priced = waiting(store).filter((w) => amounts.some((a) => w.prices.has(a)));
  const byEmail = priced.filter((w) => emails.some((e) => w.emails.has(e)));
  if (byEmail.length === 1) return { ...byEmail[0], by: 'email' };
  if (byEmail.length > 1) return null;
  const recent = priced.filter((w) => now - w.at < RECENT);
  return recent.length === 1 ? { ...recent[0], by: 'amount' } : null;
}
