import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAi } from './ai.js';
import { createGoogle } from './google.js';
import { createGoogleSync } from './googleSync.js';
import { createSerp } from './serp.js';
import { createSerpSync } from './serpSync.js';
import { createVisibility } from './visibilityRun.js';
import { createAnswerEngines } from './answerEngines.js';
import { createCardcom } from './cardcom.js';
import { createBilling } from './billing.js';
import { webhookRoutes } from './routes/webhooks.js';
import { createWhatsApp } from './whatsapp.js';
import { createCompetitors } from './competitors.js';
import { competitorRoutes } from './routes/competitors.js';
import { reportRoutes } from './routes/reports.js';
import { visibilityRoutes } from './routes/visibility.js';
import { googleRoutes } from './routes/google.js';
import { createJobs } from './jobs.js';
import { createMailer } from './mailer.js';
import { createNotifier } from './notifications.js';
import { createPusher } from './push.js';
import { pushRoutes } from './routes/push.js';
import { createStore } from './store.js';
import { adminRoutes } from './routes/admin.js';
import { agencyRoutes } from './routes/agency.js';
import { apiRoutes } from './routes/api.js';
import { authRoutes } from './routes/auth.js';
import { createContext } from './routes/context.js';
import { publicRoutes } from './routes/public.js';
import { settingsRoutes } from './routes/settings.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { siteRoutes } from './routes/site.js';
import { superadminRoutes } from './routes/superadmin.js';
import { widgetRoutes } from './routes/widget.js';
import { errorPage } from './util.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseCookies(req, _res, next) {
  req.cookies = {};
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  next();
}

function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self' https://secure.cardcom.solutions https://accounts.google.com https://wa.me https://api.whatsapp.com; frame-ancestors 'none'",
  });
  next();
}

/**
 * options: allowSignup, secureCookies, trustProxy, publicLimit,
 * mailTransport (nodemailer transport, for tests), ai (injected helper or null).
 */
export function createApp(db, options = {}) {
  const store = createStore(db);
  const mailer = createMailer(db, { transport: options.mailTransport });
  const ai = options.ai !== undefined ? options.ai : createAi();
  const pusher = createPusher(store, { webpush: options.webpush });
  const notifier = createNotifier({ store, mailer, pusher, publicUrl: options.publicUrl });
  const google = options.google !== undefined ? options.google : createGoogle();
  const googleSync = google ? createGoogleSync({ store, google, notifier }) : null;
  const serp = options.serp !== undefined ? options.serp : createSerp();
  const serpSync = serp ? createSerpSync({ store, serp, notifier }) : null;
  const competitors = serp ? createCompetitors({ store, serp }) : null;
  const visibility = createVisibility({ store, serp, ai, extra: options.answerEngines ?? createAnswerEngines() });
  const cardcom = options.cardcom !== undefined ? options.cardcom : createCardcom();
  const billing = cardcom ? createBilling({ store, cardcom, notifier }) : null;
  const ctx = createContext(store, { ...options, mailer, ai, notifier });
  ctx.billing = billing;
  const whatsapp = options.whatsapp !== undefined ? options.whatsapp : createWhatsApp();
  ctx.whatsapp = whatsapp;
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy ?? process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(parseCookies);
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 500 }));
  app.use('/static', express.static(path.join(root, 'public'), { maxAge: '1h' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.use(
    '/api/v1',
    apiRoutes(store, {
      notifier,
      whatsapp,
      apiLimit: options.apiLimit,
      baseUrl: (req) => process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`,
    }),
  );
  app.use(webhookRoutes(store, { billing }));
  app.use(publicRoutes(store, { ...options, notifier }));
  app.use(widgetRoutes(store));

  app.use(ctx.session);
  app.use(siteRoutes(store, { signupOpen: ctx.signupOpen, notifier, adminEmails: ctx.adminEmails, contactLimit: options.contactLimit }));
  app.use(authRoutes(ctx));
  app.use(pushRoutes(ctx, pusher));
  app.use('/admin', ctx.requireAuth, adminRoutes(ctx), settingsRoutes(ctx), leaderboardRoutes(ctx), googleRoutes(ctx, { google, sync: googleSync, serp, serpSync }), visibilityRoutes(ctx, { visibility }), competitorRoutes(ctx, { serp, competitors }), reportRoutes(ctx));
  app.use('/superadmin', ctx.requireAuth, superadminRoutes(ctx));
  app.use('/agency', ctx.requireAuth, agencyRoutes(ctx));

  app.use((_req, res) => res.status(404).send(errorPage('הדף לא נמצא')));
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).send(errorPage('אירעה שגיאה בשרת, נסו שוב מאוחר יותר'));
  });
  return { app, store, mailer, notifier, pusher, jobs: createJobs({ store, notifier, ai, googleSync, serpSync, visibility, billing, whatsapp, competitors, ctx, backups: options.backups ?? true }), googleSync, serpSync, visibility, billing };
}
