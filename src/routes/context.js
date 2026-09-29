import { accessOf, planOf, TRIAL_DAYS, TRIAL_PLAN } from '../plans.js';
import { roleAtLeast } from '../store.js';
import { errorPage, isEmail, safeColor, safeUrl } from '../util.js';
import { operatorInfo } from '../views/site.js';
import { adminPage } from '../views/layout.js';

export const SESSION_COOKIE = 'sid';
export const BIZ_COOKIE = 'biz';

/**
 * Shared pieces for every logged-in route module: session loading, CSRF,
 * current business + role, rendering and permission guards.
 */
export function createContext(
  store,
  { allowSignup = true, secureCookies = false, mailer, ai, notifier, authLimit = { windowMs: 15 * 60e3, max: 20 } } = {},
) {
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: secureCookies };
  const superEmails = String(process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(isEmail);

  const ctx = {
    store,
    mailer,
    ai,
    notifier,
    cookieOpts,
    authLimit,
    signupOpen: () => allowSignup || store.countUsers() === 0,
    baseUrl: (req) => process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`,
    isSuperadmin: (user) => Boolean(user && (user.is_superadmin || superEmails.includes(user.email))),
    /** Who gets operator emails such as plan requests. */
    adminEmails: () => [...new Set([...store.superadminEmails(), ...superEmails])],

    startSession(res, userId) {
      res.cookie(SESSION_COOKIE, store.createSession(userId), { ...cookieOpts, maxAge: 30 * 864e5 });
    },

    /** Loads req.user and enforces CSRF on every POST made with a session. */
    session(req, res, next) {
      req.user = store.sessionUser(req.cookies[SESSION_COOKIE]);
      // File uploads (multipart) are parsed later by their route, so their token travels in the query string.
      const multipart = String(req.headers['content-type'] ?? '').startsWith('multipart/form-data');
      const sent = multipart ? req.query?._csrf : req.body?._csrf;
      if (req.method === 'POST' && req.user && sent !== req.user.csrf) {
        return res.status(403).send(errorPage('פג תוקף הטופס. רעננו את הדף ונסו שוב'));
      }
      next();
    },

    /**
     * White-label: an agency's own domain, or the agency the current business
     * belongs to, replaces the platform brand in the admin.
     */
    brandFor(req) {
      const agency =
        store.agencyByDomain(req.hostname) || (req.business?.agency_id ? store.agencyById(req.business.agency_id) : null);
      if (!agency) return { name: operatorInfo().brand, color: '', logo: '' };
      return { name: agency.brand_name || agency.name, color: safeColor(agency.brand_color, ''), logo: safeUrl(agency.logo_url) };
    },

    render(req, res, title, body, extra = {}) {
      const b = req.business;
      res.send(
        adminPage({
          title,
          user: req.user,
          business: b,
          businesses: req.businesses,
          csrf: req.user?.csrf,
          flash: req.query?.ok ? 'נשמר בהצלחה' : '',
          isSuperadmin: ctx.isSuperadmin(req.user),
          current: req.originalUrl,
          brand: ctx.brandFor(req),
          isAgency: req.user ? store.agenciesForUser(req.user.id).length > 0 : false,
          openCount: b ? store.openIssuesCount(b.id) : 0,
          googlePending: b ? store.googleSummary(b.id).unanswered : 0,
          usage: b
            ? {
                used: store.monthlyResponseCount(b.id),
                limit: req.plan.monthlyResponses,
                planLabel: req.access?.state === 'trial' ? `${req.plan.label} · ניסיון` : req.access?.state === 'paused' ? `${req.plan.label} · מושהה` : req.plan.label,
              }
            : null,
          access: req.access,
          body,
          ...extra,
        }),
      );
    },

    /** Requires login and resolves the active business (and the user's role in it). */
    requireAuth(req, res, next) {
      if (!req.user) return res.redirect(303, '/login');
      req.businesses = store.businessesFor(req.user.id);
      const wanted = Number(req.cookies[BIZ_COOKIE]);
      req.business = req.businesses.find((b) => b.id === wanted) || req.businesses[0];
      if (!req.business) {
        // A user whose last business was removed gets a fresh one.
        const id = store.createBusiness(req.user.id, { name: 'העסק שלי', plan: TRIAL_PLAN, trialDays: TRIAL_DAYS });
        req.business = store.business(id, req.user.id);
        req.businesses = [req.business];
      }
      // A system admin's own businesses are never on a trial (fixes accounts made before this rule).
      if (req.business.billing === 'trial' && req.business.user_id === req.user.id && ctx.isSuperadmin(req.user)) {
        store.updateBusiness(req.business.id, { billing: 'active', plan: 'business', trial_ends_at: null });
        req.business = { ...req.business, billing: 'active', plan: 'business', trial_ends_at: null };
      }
      req.role = req.business.role;
      req.plan = planOf(req.business);
      req.access = accessOf(req.business);
      req.can = (min) => roleAtLeast(req.role, min);
      res.locals.can = req.can;
      next();
    },

    requireRole(min) {
      return (req, res, next) => {
        if (req.can(min)) return next();
        res.status(403).send(errorPage('אין לך הרשאה לפעולה הזו'));
      };
    },

    requireSuperadmin(req, res, next) {
      if (ctx.isSuperadmin(req.user)) return next();
      res.status(404).send(errorPage('הדף לא נמצא'));
    },

    notFound: (res) => res.status(404).send(errorPage('הדף לא נמצא')),
  };
  return ctx;
}
