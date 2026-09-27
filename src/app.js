import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

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
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  });
  next();
}

export function createApp(db, options = {}) {
  const store = createStore(db);
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy ?? process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(parseCookies);
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 500 }));
  app.use('/static', express.static(path.join(root, 'public'), { maxAge: '1h' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.use(publicRoutes(store, options));
  app.use(adminRoutes(store, options));

  app.use((_req, res) => res.status(404).send('Not found'));
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).send('Server error');
  });
  return { app, store };
}
