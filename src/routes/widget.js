import express from 'express';
import { accessOf, planOf } from '../plans.js';
import { errorPage } from '../util.js';
import { widgetPage, widgetScript } from '../views/widget.js';

/**
 * Public, embeddable testimonials widget. Only testimonials the customer
 * agreed to publish and the business approved are ever shown.
 */
export function widgetRoutes(store) {
  const router = express.Router();

  // These pages are meant to be framed by the business website.
  const allowFraming = (_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors *",
    );
    next();
  };

  function load(key) {
    const business = store.businessByWidgetKey(key);
    return business && planOf(business).widget && accessOf(business).state !== 'paused' ? business : null;
  }

  router.get('/widget/:key.js', (req, res) => {
    const business = load(req.params.key);
    res.type('application/javascript').set('Cache-Control', 'public, max-age=300');
    if (!business) return res.send('/* widget unavailable */');
    const origin = process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
    res.send(widgetScript({ src: `${origin}/widget/${business.widget_key}`, origin }));
  });

  router.get('/widget/:key', allowFraming, (req, res) => {
    const business = load(req.params.key);
    if (!business) return res.status(404).send(errorPage('הווידג\'ט לא זמין'));
    res.set('Cache-Control', 'public, max-age=300');
    res.send(widgetPage({ business, testimonials: store.publishedTestimonials(business.id, 12) }));
  });

  return router;
}
