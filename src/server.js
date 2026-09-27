import { openDb } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { app, jobs, mailer } = createApp(openDb(), {
  allowSignup: process.env.ALLOW_SIGNUP !== 'false',
  secureCookies: process.env.SECURE_COOKIES === 'true',
});

app.listen(port, () => {
  console.log(`Reviews system running on http://localhost:${port}`);
  if (!mailer.enabled) console.log('SMTP_URL not set: emails are only recorded in the outbox (/superadmin).');
  if (!process.env.ANTHROPIC_API_KEY) console.log('ANTHROPIC_API_KEY not set: AI features are disabled.');
});

// Reminders, SLA alerts and weekly reports.
if (process.env.DISABLE_JOBS !== 'true') jobs.start();
