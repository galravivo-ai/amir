import { annualPrice, PLANS, profilesOf } from './plans.js';

// Subscriptions paid by card through Cardcom: the first payment on Cardcom's
// page saves a token, and the token pays every renewal. Upgrades are charged
// now for the rest of the period; downgrades and cycle changes wait for the
// renewal. Three failed renewals pause the account.

const DAY = 864e5;
const MAX_FAILURES = 3;
const toSql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const fromSql = (s) => (s ? Date.parse(`${String(s).replace(' ', 'T')}Z`) : 0);

/** The price of a plan for a period, for `profiles` Google profiles (each one pays the plan). */
export const amountFor = (plan, cycle, profiles = 1) => {
  const one = cycle === 'annual' ? annualPrice(PLANS[plan]) : PLANS[plan].price;
  return one == null ? null : one * Math.max(1, profiles);
};

/** One month or one year after `ms`, on the same day of the month. */
export function addPeriod(ms, cycle) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + (cycle === 'annual' ? 12 : 1));
  return d.getTime();
}

const describe = (plan, cycle, profiles = 1) => `GoFive · מסלול ${PLANS[plan].label} · ${cycle === 'annual' ? 'שנתי' : 'חודשי'}${profiles > 1 ? ` · ${profiles} פרופילים` : ''}`;

export function createBilling({ store, cardcom, notifier = null, now = () => Date.now() }) {
  const customer = (business) => ({ name: business.name, email: business.owner_email || '' });

  /** True when the business pays by card and the paid period hasn't ended. */
  const hasCardPlan = (b) => Boolean(b.card_token && b.billing === 'active' && fromSql(b.paid_until) > now());

  /** Opens Cardcom's payment page; returns its address. */
  async function startCheckout({ business, email, plan, cycle, baseUrl }) {
    const profiles = profilesOf(store, business.id);
    const amount = amountFor(plan, cycle, profiles);
    const id = store.createPayment(business.id, { kind: 'checkout', plan, cycle, amount, createdBy: email });
    const page = await cardcom.createPage({
      amount,
      description: describe(plan, cycle, profiles),
      returnValue: String(id),
      successUrl: `${baseUrl}/admin/billing/done?p=${id}`,
      failedUrl: `${baseUrl}/admin/billing/done?p=${id}&failed=1`,
      webhookUrl: `${baseUrl}/billing/cardcom/webhook?p=${id}`,
      customer: { name: business.name, email },
    });
    store.setPaymentPage(id, page.id);
    return page.url;
  }

  /**
   * Settles a payment page from Cardcom's own record (never from what the
   * browser or the webhook sent). Safe to call twice: the redirect and the
   * webhook both do. Returns the payment as it is now.
   */
  async function complete(paymentId, { failed = false } = {}) {
    const payment = store.paymentById(paymentId);
    if (!payment || payment.status !== 'pending' || !payment.page_id) return payment;
    const r = await cardcom.result(payment.page_id);
    const matches = (!r.returnValue || r.returnValue === String(payment.id)) && (!r.amount || Math.abs(r.amount - payment.amount) < 0.01);
    if (!r.ok || !matches) {
      // Before the customer pays, Cardcom reports "not done yet": only a failed redirect closes it.
      if (failed || (r.transactionId && !matches)) store.settlePayment(payment.id, { status: 'failed', error: matches ? r.error : 'הסכום ששולם לא תואם' });
      return store.paymentById(payment.id);
    }
    if (store.settlePayment(payment.id, { status: 'paid', transactionId: r.transactionId })) {
      store.updateBusiness(payment.business_id, {
        plan: payment.plan,
        billing_cycle: payment.cycle,
        billing: 'active',
        trial_ends_at: null,
        plan_request: null,
        trial_notice: null,
        paid_until: toSql(addPeriod(now(), payment.cycle)),
        card_token: r.token || null,
        card_expiry: r.expiry || null,
        card_last4: r.last4 || null,
        auto_renew: true,
        pay_failures: 0,
        next_plan: null,
        next_cycle: null,
      });
    }
    return store.paymentById(payment.id);
  }

  /**
   * A paying customer picks another plan. Upgrades are charged now for the
   * rest of the period; anything else takes effect at the renewal.
   */
  async function changePlan({ business, email, plan, cycle }) {
    const same = plan === business.plan && cycle === business.billing_cycle;
    if (same) {
      store.updateBusiness(business.id, { next_plan: null, next_cycle: null, auto_renew: true });
      return { status: 'kept' };
    }
    const profiles = profilesOf(store, business.id);
    const oldAmount = amountFor(business.plan, business.billing_cycle, profiles);
    const newAmount = amountFor(plan, cycle, profiles);
    if (cycle !== business.billing_cycle || newAmount <= oldAmount) {
      store.updateBusiness(business.id, { next_plan: plan, next_cycle: cycle, auto_renew: true });
      return { status: 'scheduled', at: business.paid_until };
    }
    const periodDays = business.billing_cycle === 'annual' ? 365 : 30;
    const left = Math.max(0, fromSql(business.paid_until) - now()) / DAY;
    const charge = Math.round((newAmount - oldAmount) * Math.min(1, left / periodDays) * 100) / 100;
    if (charge >= 1) {
      const id = store.createPayment(business.id, { kind: 'upgrade', plan, cycle, amount: charge, createdBy: email });
      const r = await cardcom.chargeToken({
        amount: charge,
        token: business.card_token,
        expiry: business.card_expiry,
        description: `${describe(plan, cycle, profiles)} · שדרוג עד סוף התקופה`,
        uniqueId: `upgrade-${id}`,
        customer: { name: business.name, email },
      });
      store.settlePayment(id, r.ok ? { status: 'paid', transactionId: r.transactionId } : { status: 'failed', error: r.error });
      if (!r.ok) return { status: 'failed', error: r.error };
    }
    store.updateBusiness(business.id, { plan, next_plan: null, next_cycle: null, auto_renew: true });
    return { status: 'upgraded', charged: charge >= 1 ? charge : 0 };
  }

  /**
   * What choosing a plan would do, before doing it: 'checkout' (a payment page),
   * 'kept', 'scheduled' (at the renewal) or 'upgrade' (charged now for the rest of the period).
   */
  function quote(business, plan, cycle) {
    const profiles = profilesOf(store, business.id);
    const amount = amountFor(plan, cycle, profiles);
    if (!hasCardPlan(business)) return { kind: 'checkout', amount, profiles };
    if (plan === business.plan && cycle === business.billing_cycle) return { kind: 'kept', amount, profiles };
    const oldAmount = amountFor(business.plan, business.billing_cycle, profiles);
    if (cycle !== business.billing_cycle || amount <= oldAmount) return { kind: 'scheduled', amount, profiles, at: business.paid_until };
    const periodDays = business.billing_cycle === 'annual' ? 365 : 30;
    const left = Math.max(0, fromSql(business.paid_until) - now()) / DAY;
    const charge = Math.round((amount - oldAmount) * Math.min(1, left / periodDays) * 100) / 100;
    return { kind: 'upgrade', amount, profiles, charge: charge >= 1 ? charge : 0 };
  }

  /** Stops (or restarts) the automatic renewal; the paid period stays. */
  const setAutoRenew = (business, on) =>
    store.updateBusiness(business.id, on ? { auto_renew: true, cancel_reason: null, canceled_at: null } : { auto_renew: false });

  /** Cancels the subscription: no more renewals, the paid period stays. */
  function cancel(business, reason = '') {
    store.updateBusiness(business.id, {
      auto_renew: false,
      next_plan: null,
      next_cycle: null,
      cancel_reason: String(reason).slice(0, 500) || null,
      canceled_at: toSql(now()),
    });
  }

  /** Charges every subscription whose period ended. Runs with the other jobs. */
  async function renewDue() {
    let renewed = 0;
    const t = now();
    for (const b of store.renewalsDue(toSql(t))) {
      if (!b.auto_renew) {
        store.updateBusiness(b.id, { billing: 'paused' });
        await notifier?.billingNotice?.({ business: b, kind: 'ended' }).catch(() => {});
        continue;
      }
      // After a failure, try again once a day.
      const last = store.paymentsFor(b.id, 1)[0];
      if (last?.kind === 'renewal' && last.status === 'failed' && fromSql(last.created_at) > t - DAY) continue;

      const plan = PLANS[b.next_plan] && !PLANS[b.next_plan].hidden ? b.next_plan : b.plan;
      const cycle = b.next_cycle || b.billing_cycle || 'monthly';
      // Profiles added during the period are charged from the renewal on.
      const profiles = profilesOf(store, b.id);
      const amount = amountFor(plan, cycle, profiles);
      if (amount == null) continue;
      const id = store.createPayment(b.id, { kind: 'renewal', plan, cycle, amount });
      // The same id for the same period and attempt, so a crash can't charge twice.
      const r = await cardcom.chargeToken({
        amount,
        token: b.card_token,
        expiry: b.card_expiry,
        description: describe(plan, cycle, profiles),
        uniqueId: `renew-${b.id}-${String(b.paid_until).replace(/\D/g, '')}-${b.pay_failures}`,
        customer: customer(b),
      });
      if (r.ok) {
        store.settlePayment(id, { status: 'paid', transactionId: r.transactionId });
        // Keep the billing day, unless the renewal is days late after failures.
        const from = fromSql(b.paid_until) > t - 7 * DAY ? fromSql(b.paid_until) : t;
        store.updateBusiness(b.id, { plan, billing_cycle: cycle, paid_until: toSql(addPeriod(from, cycle)), pay_failures: 0, next_plan: null, next_cycle: null });
        renewed++;
      } else {
        store.settlePayment(id, { status: 'failed', error: r.error });
        const failures = b.pay_failures + 1;
        const stop = failures >= MAX_FAILURES;
        store.updateBusiness(b.id, { pay_failures: failures, ...(stop ? { billing: 'paused' } : {}) });
        await notifier?.billingNotice?.({ business: b, kind: stop ? 'paused' : 'failed', error: r.error }).catch(() => {});
      }
    }
    return renewed;
  }

  return { hasCardPlan, startCheckout, complete, changePlan, quote, setAutoRenew, cancel, renewDue };
}
