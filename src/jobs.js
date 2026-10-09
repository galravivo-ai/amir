import { sendDropAlerts } from './drops.js';
import { backupDb, lastBackupAge } from './backup.js';
import { accessOf, planOf, PLANS } from './plans.js';
import { buildReport, lastMonth, monthRange } from './report.js';
import { monthlySummary } from './routes/reports.js';
import { sendWhatsAppInvite } from './whatsapp.js';

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
        await notifier.trialEnding(business);
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
      const summary = ctx ? await monthlySummary(ctx, business, range, report, planOf(business).ai) : { text: '' };
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
    for (const [name, job] of Object.entries({ renewals, scheduledInvites, scheduledWhatsApp, inviteReminders, slaAlerts, aiTagging, trialNotices, googleReviews, profileMetrics, competitorChecks, profileHealth, mapRankings, aiVisibility, dropAlerts, weeklyReports, monthlyReports, dailyBackup })) {
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
