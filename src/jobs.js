import { backupDb, lastBackupAge } from './backup.js';

/**
 * Periodic background work: invite reminders, SLA alerts and weekly reports.
 * Every job is idempotent (it records what it sent), so running it more often
 * or after a restart never sends duplicates.
 */
export function createJobs({ store, notifier, now = () => new Date(), backups = true }) {
  async function inviteReminders() {
    let sent = 0;
    for (const invite of store.invitesDueForReminder()) {
      const business = store.businessById(invite.business_id);
      const campaign = store.campaignById(invite.campaign_id);
      // Mark first so a slow or failing mail server can't cause repeats.
      store.markInviteReminded(invite.id);
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
      if (await notifier.customerInvite({ business, campaign, invite })) {
        store.markInviteEmailed(invite.id);
        sent++;
      }
    }
    return sent;
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
      await notifier.weeklyReport(business, stats);
      sent++;
    }
    return sent;
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
    for (const [name, job] of Object.entries({ scheduledInvites, inviteReminders, slaAlerts, weeklyReports, dailyBackup })) {
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
    scheduledInvites,
    inviteReminders,
    slaAlerts,
    weeklyReports,
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
