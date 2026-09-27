import path from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { dropPrivileges } from './privileges.js';

if (process.env.NODE_ENV === 'production') {
  dropPrivileges({ dataDir: path.dirname(path.resolve(process.env.DB_FILE || 'data/reviews.db')) });
}

const port = Number(process.env.PORT) || 3000;
const production = process.env.NODE_ENV === 'production';
const db = openDb();
const { app, jobs, mailer } = createApp(db, {
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  backups: process.env.DISABLE_BACKUPS !== 'true',
});

const server = app.listen(port, () => {
  console.log(`Reviews system running on port ${port}`);
  if (!mailer.enabled) console.log('SMTP_URL not set: emails are only recorded in the outbox (/superadmin).');
  if (!process.env.ANTHROPIC_API_KEY) console.log('ANTHROPIC_API_KEY not set: AI features are disabled.');
  if (production && !process.env.PUBLIC_URL) {
    console.warn('WARNING: PUBLIC_URL is not set. QR codes and email links may point to the wrong address.');
  }
  if (production && process.env.SECURE_COOKIES !== 'true') {
    console.warn('WARNING: SECURE_COOKIES is not true. Set it once the site is served over HTTPS.');
  }
});

// Reminders, SLA alerts, weekly reports and the daily backup.
const stopJobs = process.env.DISABLE_JOBS !== 'true' ? jobs.start() : () => {};

// Hosting platforms send SIGTERM on deploy/restart: finish requests, then close the database cleanly.
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  stopJobs();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10e3).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
