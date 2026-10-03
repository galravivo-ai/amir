import express from 'express';
import { buildReport, lastMonth, monthRange, recentMonths, reportFacts } from '../report.js';
import * as V from '../views/report.js';

/** The monthly report: a printable page (saved as PDF from the browser). */
export function reportRoutes(ctx) {
  const { store, render } = ctx;
  const router = express.Router();

  router.get('/reports/monthly', async (req, res) => {
    const range = monthRange(req.query.month || lastMonth()) || monthRange(lastMonth());
    const report = buildReport(store, req.business, range);
    const summary = await monthlySummary(ctx, req.business, range, report, req.plan.ai);
    render(
      req,
      res,
      `דוח חודשי · ${range.label}`,
      V.monthlyReportView({
        business: req.business,
        range,
        months: recentMonths(),
        report,
        summary: summary.text,
        aiNote: summary.note,
      }),
    );
  });

  return router;
}

/**
 * The AI's "bottom line", written once per finished month and kept.
 * A month still in progress gets none: its numbers are still moving.
 */
export async function monthlySummary(ctx, business, range, report, planAllowsAi = true) {
  const saved = ctx.store.monthlyReport(business.id, range.month);
  if (saved?.summary) return { text: saved.summary };
  if (!ctx.ai?.monthlySummary || !planAllowsAi || report.empty) return { text: '' };
  if (range.partial) return { text: '', note: 'סיכום ה-AI ייכתב כשהחודש יסתיים.' };
  try {
    const text = await ctx.ai.monthlySummary(reportFacts(business, range, report));
    ctx.store.saveMonthlyReport(business.id, range.month, text);
    return { text };
  } catch (err) {
    console.warn('[report] summary failed:', err.message);
    return { text: '', note: 'סיכום ה-AI לא נוצר הפעם. רעננו את הדף כדי לנסות שוב.' };
  }
}
