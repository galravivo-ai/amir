import express from 'express';
import { branchesOf, branchRows, networkSummary } from '../network.js';
import { errorPage } from '../util.js';
import { resolvePeriod } from '../period.js';
import * as V from '../views/network.js';

const STARTER = [
  { title: 'תודה על ביקורת חיובית', stars: '45', body: 'תודה רבה {שם}! שמחים מאוד שנהניתם אצלנו ב{סניף}. מחכים לראות אתכם שוב בקרוב.' },
  { title: 'ביקורת בינונית', stars: '3', body: 'תודה {שם} על המשוב. חשוב לנו לשמוע מה אפשר לשפר, ונשמח אם תכתבו לנו ישירות כדי שנוכל לתקן לפעם הבאה.' },
  { title: 'ביקורת שלילית', stars: '12', body: 'שלום {שם}, מצטערים מאוד לשמוע על החוויה ב{סניף}. זה לא הסטנדרט שלנו. נשמח לדבר איתכם ישירות ולתקן, אפשר לפנות אלינו בטלפון או בהודעה.' },
];

/** The network of branches: the comparison, a page per branch, and the shared reply templates. */
export function networkRoutes(ctx) {
  const { store, render, requireRole } = ctx;
  const router = express.Router();
  const periodOf = (req) => resolvePeriod({ range: V.NETWORK_RANGES[req.query.range] ? req.query.range : '30d' });

  router.get('/network', (req, res) => {
    const branches = branchesOf(store, req.business.id);
    if (branches.length < 2) {
      return render(req, res, 'רשת הסניפים', V.networkIntroView({ branches: branches.length, plan: req.plan, canAdd: req.can('manager') }));
    }
    const period = periodOf(req);
    const rows = branchRows(store, req.business.id, period);
    render(req, res, 'רשת הסניפים', V.networkView({ rows, summary: networkSummary(rows), period, sort: String(req.query.sort || '') }));
  });

  router.get('/network/:id', (req, res) => {
    const id = Number(req.params.id);
    if (req.branchId && req.branchId !== id) return res.redirect(303, `/admin/network/${req.branchId}`);
    const period = periodOf(req);
    const rows = branchRows(store, req.business.id, period);
    const row = rows.find((r) => r.id === id);
    if (!row) return ctx.notFound(res);
    render(
      req,
      res,
      row.title,
      V.branchView({
        row,
        network: { branches: rows.length, rows },
        reviews: store.googleReviews(req.business.id, { locationId: id, limit: 8 }),
        period,
        scoped: Boolean(req.branchId),
        canReply: req.can('manager'),
      }),
    );
  });

  // ---------- reply templates ----------
  const editor = (req) => req.can('manager') && !req.branchId;
  const readTemplate = (body) => ({
    title: String(body.title ?? '').trim().slice(0, 80),
    body: String(body.body ?? '').trim().slice(0, 2000),
    stars: ['45', '3', '12'].includes(body.stars) ? body.stars : '',
  });

  router.get('/reply-templates', (req, res) => {
    render(req, res, 'תבניות תשובה', V.templatesView({ templates: store.replyTemplates(req.business.id), csrf: req.user.csrf, canEdit: editor(req) }));
  });

  router.post('/reply-templates/starter', requireRole('manager'), (req, res) => {
    if (!editor(req)) return res.status(403).end();
    if (!store.replyTemplates(req.business.id).length) for (const t of STARTER) store.addReplyTemplate(req.business.id, t);
    res.redirect(303, '/admin/reply-templates?ok=1');
  });

  router.post('/reply-templates', requireRole('manager'), (req, res) => {
    if (!editor(req)) return res.status(403).end();
    const t = readTemplate(req.body);
    if (t.title && t.body && store.replyTemplates(req.business.id).length < 50) store.addReplyTemplate(req.business.id, t);
    res.redirect(303, '/admin/reply-templates?ok=1');
  });

  router.post('/reply-templates/:id', requireRole('manager'), (req, res) => {
    if (!editor(req)) return res.status(403).end();
    const id = Number(req.params.id);
    if (req.body.action === 'delete') store.deleteReplyTemplate(req.business.id, id);
    else {
      const t = readTemplate(req.body);
      if (t.title && t.body) store.updateReplyTemplate(req.business.id, id, t);
    }
    res.redirect(303, '/admin/reply-templates?ok=1');
  });

  return router;
}

/**
 * A member limited to one branch sees only that branch: its page, its Google
 * reviews (and replies to them) and the shared templates. Anything else
 * leads back to the branch page.
 */
export function branchGate(req, res, next) {
  if (!req.branchId) return next();
  const p = req.path;
  const allowed =
    p === '/switch' ||
    /^\/network\/\d+$/.test(p) ||
    p === '/reply-templates' ||
    p === '/google/reviews' ||
    /^\/google\/reviews\/\d+(\/(draft|reply))?$/.test(p);
  if (allowed) return next();
  if (req.method === 'GET') return res.redirect(303, `/admin/network/${req.branchId}`);
  res.status(403).send(errorPage('אין לך הרשאה לפעולה הזו'));
}
