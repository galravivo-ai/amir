// A local preview with a stand-in for Google, to try Google-connected screens
// (such as editing the profile) without a real Business Profile.
//   PORT=4390 node tools/dev-preview.mjs   → sign in as owner@preview.test / preview123
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createGoogle } from '../src/google.js';

const profile = {
  title: 'ביסטרו הגפן',
  storefrontAddress: { addressLines: ['דיזנגוף 120'], locality: 'תל אביב' },
  categories: { primaryCategory: { name: 'categories/gcid:italian_restaurant', displayName: 'מסעדה איטלקית' }, additionalCategories: [{ name: 'categories/gcid:pizza_restaurant', displayName: 'פיצרייה' }] },
  profile: { description: 'מסעדה איטלקית שכונתית בלב דיזנגוף.' },
  phoneNumbers: { primaryPhone: '03-5551234' },
  websiteUri: 'https://bistro-hagefen.example.com',
  regularHours: { periods: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'].flatMap((d) => [{ openDay: d, openTime: { hours: 12 }, closeDay: d, closeTime: { hours: 16 } }, { openDay: d, openTime: { hours: 18 }, closeDay: d, closeTime: { hours: 23 } }]).concat([{ openDay: 'FRIDAY', openTime: { hours: 11 }, closeDay: 'FRIDAY', closeTime: { hours: 15 } }]) },
  metadata: {},
};
const CATS = ['מסעדה איטלקית', 'פיצרייה', 'מסעדה', 'בית קפה', 'מסעדה ים תיכונית', 'בר יין', 'מסעדת פסטה', 'קייטרינג'];
const known = new Map([['categories/gcid:italian_restaurant', 'מסעדה איטלקית'], ['categories/gcid:pizza_restaurant', 'פיצרייה'], ...CATS.map((c, i) => [`categories/gcid:c${i}`, c])]);
const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const fetchImpl = async (url, init = {}) => {
  if (url === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, id_token: `x.${Buffer.from(JSON.stringify({ email: 'owner@preview.test' })).toString('base64url')}.y` });
  if (url.startsWith('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')) return json(200, { accounts: [{ name: 'accounts/1' }] });
  if (url.includes('/v1/accounts/1/locations')) return json(200, { locations: [{ name: 'locations/9', title: profile.title, storefrontAddress: profile.storefrontAddress, metadata: { placeId: 'P9' } }] });
  if (url.includes('/v1/locations/9?readMask=')) return json(200, profile);
  if (url.includes('/v1/locations/9?updateMask=') && init.method === 'PATCH') {
    const body = JSON.parse(init.body);
    // Google answers with the categories' Hebrew names, as it does on a real profile.
    if (body.categories) {
      const label = (c) => ({ ...c, displayName: known.get(c.name) || c.name });
      body.categories = { primaryCategory: label(body.categories.primaryCategory), additionalCategories: (body.categories.additionalCategories || []).map(label) };
    }
    Object.assign(profile, body);
    profile.metadata = { hasPendingEdits: true };
    return json(200, profile);
  }
  if (url.includes('/v1/categories?')) {
    const q = decodeURIComponent(new URL(url).searchParams.get('filter') || '').replace('displayName=', '');
    return json(200, { categories: CATS.filter((c) => c.includes(q) || q.split(' ').some((w) => w && c.includes(w))).map((c, i) => ({ name: `categories/gcid:c${i}`, displayName: c })) });
  }
  if (url.includes('/reviews?')) return json(200, { reviews: [], averageRating: 4.6, totalReviewCount: 905 });
  return json(200, {});
};
const google = createGoogle({ clientId: 'preview', clientSecret: 'GOCSPX-preview', fetchImpl });
const created = createApp(openDb(':memory:'), { google, backups: false, cardcom: null, serp: null });
const port = Number(process.env.PORT) || 4390;
const server = created.app.listen(port, async () => {
  const base = `http://127.0.0.1:${port}`;
  const jar = {};
  const req = async (path, form) => {
    const res = await fetch(base + path, { method: form ? 'POST' : 'GET', redirect: 'manual', headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
    for (const c of res.headers.getSetCookie()) { const [p] = c.split(';'); jar[p.slice(0, p.indexOf('='))] = p.slice(p.indexOf('=') + 1); }
    return res;
  };
  await req('/register', { name: 'גל', email: 'owner@preview.test', password: 'preview123', business: 'ביסטרו הגפן', terms: '1' });
  const csrf = (await (await req('/account')).text()).match(/name="_csrf" value="([^"]+)"/)[1];
  const start = await req('/admin/google/connect', { _csrf: csrf });
  await req(`/admin/google/callback?code=x&state=${new URL(start.headers.get('location')).searchParams.get('state')}`);
  console.log(`preview on ${base}  ·  owner@preview.test / preview123`);
});
process.on('SIGTERM', () => server.close());
