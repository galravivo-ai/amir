import { sendDropAlerts } from './drops.js';
import { backupDb, lastBackupAge } from './backup.js';
import { accessOf, planOf, PLANS, profilesOf } from './plans.js';
import { amountFor } from './billing.js';
import { buildReport, lastMonth, monthRange } from './report.js';
import { monthlySummary } from './routes/reports.js';
import { sendWhatsAppInvite } from './whatsapp.js';
import { withBusinessLang } from './lang.js';

/**
 * Periodic background work: invite reminders, SLA alerts and weekly reports.
 * Every job is idempotent (it records what it sent), so running it more often
 * or after a restart never sends duplicates.
 */
export function createJobs({ store, notifier, ai = null, googleSync = null, serpSync = null, visibility = null, billing = null, whatsapp = null, competitors = null, health = null, rankings = null, ctx = null, now = () => new Date(), backups = true }) {
  async function inviteReminders() {
    let sent = 0;
    for (const invite of store.invitesDueForReminder()) {
      const business = store.businessById(invite.business_id);
      const campaign = store.campaignById(invite.campaign_id);
      // Mark first so a slow or failing mail server can't cause repeats.
      store.markInviteReminded(invite.id);
      if (accessOf(business).state === 'paused') continue;
      if (await notifier.customerInvite({ business, campaign, invite, reminder: true })) sent++;
    }
    return sent;
  }

  /** Emails that the API scheduled for later (e.g. two hours after the visit). */
  async function scheduledInvites() {
    let sent = 0;
    for (const invite of store.invitesDueToSend()) {
      store.markInviteSendAttempted(invite.id);
      const business = store.businessById(invite.business_id);
      const campaign = store.campaignById(invite.campaign_id);
      if (accessOf(business).state === 'paused') continue;
      if (await notifier.customerInvite({ business, campaign, invite })) {
        store.markInviteEmailed(invite.id);
        sent++;
      }
    }
    return sent;
  }

  /** WhatsApp requests the API scheduled for later. */
  async function scheduledWhatsApp() {
    if (!whatsapp) return 0;
    const baseUrl = String(process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
    let sent = 0;
    for (const invite of store.whatsAppDue()) {
      // Clear the time first so a slow or failing send can't repeat.
      store.setInviteWhatsApp(invite.id, { wa_send_at: null });
      const business = store.businessById(invite.business_id);
      if (accessOf(business).state === 'paused') continue;
      const campaign = store.campaignById(invite.campaign_id);
      if ((await sendWhatsAppInvite({ store, whatsapp, business, campaign, invite, baseUrl })).ok) sent++;
    }
    return sent;
  }

  /** Tags new comments by topic with AI, a small batch each run. */
  async function aiTagging() {
    if (!ai?.tagComments) return 0;
    const plans = Object.entries(PLANS).filter(([, p]) => p.ai).map(([k]) => k);
    let tagged = 0;
    const batch = store.untaggedResponses(plans, 20);
    if (batch.length) {
      const tags = await ai.tagComments(batch.map((r) => ({ id: r.id, text: r.comment, rating: r.rating })));
      for (const r of batch) store.setTags(r.id, tags.get(r.id) ?? []);
      tagged += batch.length;
    }
    const reviews = store.untaggedGoogleReviews(plans, 20);
    if (reviews.length) {
      const tags = await ai.tagComments(reviews.map((r) => ({ id: r.id, text: r.comment, rating: r.rating })));
      for (const r of reviews) store.setGoogleTags(r.id, tags.get(r.id) ?? []);
      tagged += reviews.length;
    }
    return tagged;
  }

  async function slaAlerts() {
    let sent = 0;
    for (const response of store.overdueUnalerted()) {
      store.markSlaAlerted(response.id);
      await notifier.slaOverdue(store.businessById(response.business_id), response);
      sent++;
    }
    return sent;
  }

  /**
   * During a trial: a day in without Google, a nudge to connect; from day 3,
   * either what is already visible (connected) or a second nudge. Each once.
   */
  async function trialNudges() {
    let sent = 0;
    const t = now().getTime();
    const replyTo = String(process.env.CONTACT_EMAIL || '').trim() || store.superadminEmails()[0] || '';
    for (const business of store.allBusinesses()) {
      if (business.billing !== 'trial' || !business.owner_email) continue;
      const age = t - Date.parse(`${String(business.created_at).replace(' ', 'T')}Z`);
      if (!(age >= 864e5)) continue;
      const flags = (() => { try { return JSON.parse(business.onboarding || '{}'); } catch { return {}; } })();
      const access = accessOf(business, t);
      const daysLeft = access.state === 'trial' ? access.daysLeft : null;
      const owner = { name: business.owner_name, email: business.owner_email };
      let kind = null;
      let flag = null;
      if (age >= 3 * 864e5 && !flags.mail_d3) {
        kind = business.has_google ? 'progress' : 'connect_again';
        flag = 'mail_d3';
      } else if (age < 3 * 864e5 && !business.has_google && !flags.mail_d1) {
        kind = 'connect';
        flag = 'mail_d1';
      }
      if (!kind) continue;
      store.setOnboardingFlag(business.id, flag);
      // A business that joined days ago and never got the first one: only the day-3 email.
      if (flag === 'mail_d3') store.setOnboardingFlag(business.id, 'mail_d1');
      const summary = kind === 'progress' ? store.googleSummary(business.id) : null;
      if (await notifier.trialNudge({ business, owner, kind, summary, daysLeft, replyTo })) sent++;
    }
    return sent;
  }

  /** One email the day before a trial ends, and one when it has ended. */
  async function trialNotices() {
    let sent = 0;
    const t = now().getTime();
    for (const business of store.allBusinesses()) {
      if (business.billing !== 'trial') continue;
      const access = accessOf(business, t);
      if (access.state === 'paused' && business.trial_notice !== 'ended') {
        store.updateBusiness(business.id, { trial_notice: 'ended' });
        await notifier.trialEnded(business);
        sent++;
      } else if (access.state === 'trial' && access.daysLeft <= 1 && !business.trial_notice) {
        store.updateBusiness(business.id, { trial_notice: 'ending' });
        await notifier.trialEnding(business, { amount: amountFor(business.plan, business.billing_cycle || 'monthly', profilesOf(store, business.id)) });
        sent++;
      }
    }
    return sent;
  }

  /** Sends on Sunday from 08:00 Israel time, once per week per business. */
  async function weeklyReports() {
    const t = now();
    const local = new Date(t.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    if (local.getDay() !== 0 || local.getHours() < 8) return 0;
    const cutoff = new Date(t.getTime() - 6 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
    let sent = 0;
    for (const business of store.allBusinesses()) {
      if (!business.weekly_report) continue;
      if (business.last_weekly_report_at && business.last_weekly_report_at > cutoff) continue;
      store.updateBusiness(business.id, { last_weekly_report_at: t.toISOString().slice(0, 19).replace('T', ' ') });
      const stats = store.stats(business.id, { days: 7 });
      if (stats.scans === 0 && stats.responses === 0) continue;
      const topStaff = store.leaderboard(business.id, { days: 7, minRatings: 3 }).staff.find((s) => s.ranked) || null;
      await notifier.weeklyReport(business, { ...stats, topStaff });
      sent++;
    }
    return sent;
  }

  /** In the first days of a month, from 08:00 Israel time: last month's report by email, once. */
  async function monthlyReports() {
    const t = now();
    const local = new Date(t.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    if (local.getDate() > 5 || local.getHours() < 8) return 0;
    const range = monthRange(lastMonth(t.getTime()), t.getTime());
    let sent = 0;
    for (const business of store.monthlyReportsDue(range.month)) {
      store.updateBusiness(business.id, { last_monthly_report: range.month });
      if (accessOf(business).state === 'paused') continue;
      const report = buildReport(store, business, range, t.getTime());
      if (report.empty) continue;
      const summary = ctx ? await withBusinessLang(store, business, () => monthlySummary(ctx, business, range, report, planOf(business).ai)) : { text: '' };
      if (await notifier.monthlyReport({ business, range, report, summary: summary.text })) sent++;
    }
    return sent;
  }

  /** Weekly: do AI answers mention the business? */
  async function aiVisibility() {
    return visibility ? visibility.runDue() : 0;
  }

  /** New Google reviews: connected businesses every 30 minutes, places followed by link every few hours. */
  async function googleReviews() {
    const connected = googleSync ? await googleSync.syncAll() : 0;
    const byLink = serpSync ? await serpSync.syncAll() : 0;
    return connected + byLink;
  }

  /** Daily: tell the business when its rating, map rank or AI visibility went down. */
  async function dropAlerts() {
    return sendDropAlerts({ store, notifier });
  }

  /** Daily: the profile's views, calls, directions and clicks from Google. */
  async function profileMetrics() {
    return googleSync ? googleSync.syncAllMetrics() : 0;
  }

  /** Paid on an iCount page and cancelled: the account closes when the paid period is over. */
  async function cancelledEnds() {
    let ended = 0;
    const t = now().toISOString().slice(0, 19).replace('T', ' ');
    const due = store.db
      .prepare("SELECT * FROM businesses WHERE billing = 'active' AND canceled_at IS NOT NULL AND (card_token IS NULL OR card_token = '') AND paid_until IS NOT NULL AND paid_until <= ?")
      .all(t);
    for (const b of due) {
      store.updateBusiness(b.id, { billing: 'paused' });
      await notifier.billingNotice?.({ business: b, kind: 'ended' }).catch((err) => console.error('[notify] billing ended failed:', err));
      ended++;
    }
    return ended;
  }

  /** Card subscriptions whose period ended: charge, or pause after repeated failures. */
  async function renewals() {
    return billing ? billing.renewDue() : 0;
  }

  /** Competitors every few days (one SerpApi search each), and today's reading of the business's own places. */
  async function competitorChecks() {
    return competitors ? competitors.runDue() : 0;
  }

  /** Weekly: how complete and active each followed Google profile is. */
  async function profileHealth() {
    return health ? health.runDue() : 0;
  }

  /** Weekly: where each followed search shows the business on the map. */
  async function mapRankings() {
    return rankings ? rankings.runDue() : 0;
  }

  /** One automatic backup a day (kept next to the database; copy offsite too). */
  async function dailyBackup() {
    if (!backups || lastBackupAge() < 23 * 3600e3) return 0;
    const { file } = backupDb(store.db);
    console.log(`[jobs] backup written: ${file}`);
    return 1;
  }

  async function runAll() {
    const result = {};
    for (const [name, job] of Object.entries({ renewals, cancelledEnds, scheduledInvites, scheduledWhatsApp, inviteReminders, slaAlerts, aiTagging, trialNotices, trialNudges, googleReviews, profileMetrics, competitorChecks, profileHealth, mapRankings, aiVisibility, dropAlerts, weeklyReports, monthlyReports, dailyBackup })) {
      try {
        result[name] = await job();
      } catch (err) {
        console.error(`[jobs] ${name} failed:`, err);
        result[name] = 'error';
      }
    }
    return result;
  }

  return {
    renewals,
    cancelledEnds,
    competitorChecks,
    profileHealth,
    profileMetrics,
    dropAlerts,
    mapRankings,
    monthlyReports,
    scheduledInvites,
    scheduledWhatsApp,
    aiTagging,
    inviteReminders,
    slaAlerts,
    weeklyReports,
    trialNotices,
    trialNudges,
    googleReviews,
    aiVisibility,
    dailyBackup,
    runAll,
    start(intervalMs = 5 * 60e3) {
      const timer = setInterval(runAll, intervalMs);
      timer.unref();
      setTimeout(runAll, 10e3).unref();
      return () => clearInterval(timer);
    },
  };
}
