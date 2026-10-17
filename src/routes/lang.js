import { LANGS, LANG_COOKIE, runWithLang, translate } from '../lang.js';

// The operator's own screens stay in Hebrew.
const HEBREW_ONLY = /^\/(superadmin|admin\/status)(\/|$)/;

/**
 * The language of this request: ?lang= (remembered in a cookie, and on the
 * user), else the user's setting, else the cookie. English pages are
 * translated on the way out.
 */
export function languageMiddleware(ctx) {
  return (req, res, next) => {
    let value = req.user?.lang || req.cookies?.[LANG_COOKIE] || 'he';
    // The English landing page has its own address, for search engines and ads.
    const asked = req.path === '/en' ? 'en' : String(req.query?.lang ?? '');
    if (LANGS.includes(asked)) {
      value = asked;
      if (req.cookies?.[LANG_COOKIE] !== asked) res.cookie(LANG_COOKIE, asked, { ...ctx.cookieOpts, httpOnly: false, maxAge: 365 * 864e5 });
      if (req.user && req.user.lang !== asked) ctx.store.setUserLang(req.user.id, asked);
    }
    if (value === 'en' && !HEBREW_ONLY.test(req.path)) {
      const send = res.send.bind(res);
      res.send = (body) => send(typeof body === 'string' && body.includes('<html') ? translate(body) : body);
    }
    runWithLang(value, next);
  };
}
