import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorPage, isEmail } from '../util.js';
import { accessibilityView, cookiesView, landingView, LEAD_KINDS, operatorInfo, privacyView, termsView } from '../views/site.js';
import { rateLimiter } from './public.js';

const SW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/sw.js');

/** Public site pages: landing, privacy, terms and uploaded logos. */
export function siteRoutes(store, { signupOpen = () => true, notifier = null, adminEmails = () => [], contactLimit } = {}) {
  const router = express.Router();
  const limit = rateLimiter(contactLimit || { windowMs: 60 * 60e3, max: 5 });

  // Quote requests from agencies and large chains.
  router.post('/contact', limit, async (req, res) => {
    const clean = (k, max) => String(req.body[k] ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
    const v = {
      kind: Object.hasOwn(LEAD_KINDS, req.body.kind) ? req.body.kind : 'other',
      name: clean('name', 80),
      phone: clean('phone', 30),
      email: isEmail(clean('email', 120)) ? clean('email', 120) : '',
      company: clean('company', 100),
      size: clean('size', 40),
      message: String(req.body.message ?? '').trim().slice(0, 1000),
    };
    // Bots fill the hidden field; pretend it worked.
    if (req.body.website) return res.redirect(303, '/?sent=1#contact');
    const error = !v.name ? 'נא למלא שם' : !v.phone && !v.email ? 'נא להשאיר טלפון או אימייל תקין' : '';
    if (error) {
      return res.status(422).send(landingView({ signupOpen: signupOpen(), contactError: error, contactValues: v }));
    }
    store.createLead(v);
    await notifier?.leadReceived({ lead: v, kindLabel: LEAD_KINDS[v.kind], admins: adminEmails() }).catch((err) => console.error('[notify] lead failed:', err));
    res.redirect(303, '/?sent=1#contact');
  });

  router.get('/', (req, res) => {
    if (req.user) return res.redirect('/admin');
    // An agency's own domain is for its clients: no platform marketing page there.
    if (store.agencyByDomain(req.hostname)) return res.redirect('/login');
    res.send(landingView({ signupOpen: signupOpen(), contactSent: req.query.sent === '1' }));
  });
  // Caddy asks here before issuing an HTTPS certificate on demand, so
  // certificates are only issued for domains that belong to an agency.
  router.get('/.well-known/tls-check', (req, res) => {
    const domain = String(req.query.domain ?? '').toLowerCase();
    res.status(domain && store.agencyByDomain(domain) ? 200 : 404).type('text/plain').send('');
  });

  // Installable app ("Add to home screen")
  router.get('/manifest.webmanifest', (req, res) => {
    const brand = operatorInfo().brand;
    res.type('application/manifest+json').send(
      JSON.stringify({
        name: brand,
        short_name: brand,
        description: 'ניהול ביקורות ושביעות רצון',
        start_url: '/admin',
        scope: '/',
        display: 'standalone',
        dir: 'rtl',
        lang: 'he',
        background_color: '#1d1650',
        theme_color: '#4b2bd6',
        icons: [
          { src: '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      }),
    );
  });

  // Served from the root so it can control every page.
  router.get('/sw.js', (req, res) => {
    res.set({ 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
    res.sendFile(SW);
  });

  router.get('/privacy', (req, res) => res.send(privacyView({ signupOpen: signupOpen() })));
  router.get('/terms', (req, res) => res.send(termsView({ signupOpen: signupOpen() })));
  router.get('/cookies', (req, res) => res.send(cookiesView({ signupOpen: signupOpen() })));
  router.get('/accessibility', (req, res) => res.send(accessibilityView({ signupOpen: signupOpen() })));

  router.get('/logo/:id', (req, res) => {
    const logo = store.logoOf(Number(req.params.id));
    if (!logo) return res.status(404).send(errorPage('הקובץ לא נמצא'));
    res.set({
      'Content-Type': logo.mime,
      // The URL carries a version, so the file can be cached for a long time.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(Buffer.from(logo.data));
  });

  return router;
}
