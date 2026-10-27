import express from 'express';
import { pilotSteps } from '../pilot.js';
import * as V from '../views/pilot.js';

const PAY = { yes: 'כן', maybe: 'אולי', no: 'לא' };

/** The pilot checklist, for businesses that came in through a pilot link. */
export function pilotRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();
  const pilotOnly = (req, res, next) => (req.business.pilot ? next() : res.redirect(303, '/admin'));

  router.get('/pilot', pilotOnly, (req, res) => {
    render(req, res, 'הפיילוט שלכם', V.pilotView({ pilot: pilotSteps(store, req.business, req.user), csrf: req.user.csrf, sent: Boolean(req.query.sent) }));
  });

  router.post('/pilot/mark', pilotOnly, (req, res) => {
    store.setGrowthMark(req.business.id, 'pilot:ask', '', req.body.on !== '0');
    res.redirect(303, '/admin/pilot');
  });

  router.post('/pilot/feedback', pilotOnly, async (req, res) => {
    const text = (k) => String(req.body[k] ?? '').trim().slice(0, 1000);
    const helped = text('helped');
    if (!helped) return res.redirect(303, '/admin/pilot#feedback');
    const p = pilotSteps(store, req.business, req.user);
    const message = [
      `מה הכי עזר: ${helped}`,
      `מה היה מבלבל: ${text('confusing') || '—'}`,
      `משלמים ₪99 בחודש: ${PAY[req.body.pay] || '—'}`,
      `מה חסר / עוד: ${text('more') || '—'}`,
      `צעדים שבוצעו: ${p.done}/${p.total}${p.score != null ? ` · ציון קידום ${p.score}` : ''}`,
    ].join('\n');
    const lead = { kind: 'pilot', name: req.user.name, email: req.user.email, phone: '', company: req.business.name, size: '', message };
    store.createLead(lead);
    store.setGrowthMark(req.business.id, 'pilot:feedback', '', true);
    await ctx.notifier
      ?.leadReceived({ lead, kindLabel: 'משוב מפיילוט', admins: ctx.adminEmails() })
      .catch((err) => console.error('[notify] pilot feedback failed:', err.message));
    res.redirect(303, '/admin/pilot?sent=1#feedback');
  });

  return router;
}
