import express from 'express';
import { errorPage } from '../util.js';
import { landingView, privacyView, termsView } from '../views/site.js';

/** Public site pages: landing, privacy, terms and uploaded logos. */
export function siteRoutes(store, { signupOpen = () => true } = {}) {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (req.user) return res.redirect('/admin');
    res.send(landingView({ signupOpen: signupOpen() }));
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
