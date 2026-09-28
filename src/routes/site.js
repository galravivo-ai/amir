import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorPage } from '../util.js';
import { landingView, operatorInfo, privacyView, termsView } from '../views/site.js';

const SW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/sw.js');

/** Public site pages: landing, privacy, terms and uploaded logos. */
export function siteRoutes(store, { signupOpen = () => true } = {}) {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (req.user) return res.redirect('/admin');
    // An agency's own domain is for its clients: no platform marketing page there.
    if (store.agencyByDomain(req.hostname)) return res.redirect('/login');
    res.send(landingView({ signupOpen: signupOpen() }));
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
