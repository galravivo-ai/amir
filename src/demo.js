// A demo business anyone can open from the website without signing up: a
// fictional bistro with four branches (a network) and three months of reviews, surveys, Google profile
// numbers, map rank, competitors and AI visibility. The visitor gets a
// read-only role; the jobs skip it (is_demo), so it costs nothing to keep.
// It is rebuilt every few days so the dates stay fresh.

import crypto from 'node:crypto';
import { healthChecks } from './health.js';
import { gridPoints } from './rankings.js';

export const DEMO_EMAIL = 'demo@gofive.demo';
const REBUILD_DAYS = 3;
const DAY = 864e5;

/** Deterministic randomness, so the demo looks the same every time it's built. */
function rng(seed) {
  let s = seed;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
const sql = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const iso = (ms) => new Date(ms).toISOString();
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

const QUERIES = [
  'איפה יש ביסטרו טוב בדיזנגוף?',
  'מסעדה מומלצת לדייט בצפון הישן',
  'ארוחת ערב איטלקית ליד כיכר דיזנגוף',
  'מסעדה עם ישיבה בחוץ ברחוב דיזנגוף',
  'איפה לאכול פסטה טרייה בתל אביב?',
  'מסעדה טובה לארוחה משפחתית בצפון תל אביב',
  'ביסטרו עם יין טוב באזור כיכר המדינה',
  'מסעדה שפתוחה מאוחר בדיזנגוף',
  'מסעדה לאירוע קטן של 20 איש בתל אביב',
  'ארוחת צהריים עסקית ליד דיזנגוף סנטר',
];
const RIVALS = ['פסטה דה לוקה', 'ביסטרו 61', 'מסעדת הנמל', 'קפה נואר', 'טאיזו'];
const SOURCES = [
  ['https://www.rest.co.il/', 'Rest'],
  ['https://www.tripadvisor.co.il/', 'Tripadvisor'],
  ['https://www.timeout.co.il/', 'Time Out'],
  ['https://www.easy.co.il/', 'Easy'],
  ['https://hagefen-demo.co.il/', 'ביסטרו הגפן'],
  ['https://www.mako.co.il/food', 'mako אוכל'],
  ['https://www.google.com/maps/place/hagefen', 'ביסטרו הגפן'],
];
const ENGINES = ['google_ai_mode', 'google_ai_overview', 'claude', 'chatgpt', 'gemini', 'perplexity'];
const GOOD = ['הפסטה הכי טובה בעיר', 'שירות מקסים ואווירה נעימה', 'יין מעולה והמלצרית ידעה להמליץ', 'חזרנו בפעם השלישית, לא מאכזב', 'מקום קטן עם לב גדול', 'הטירמיסו שווה את ההגעה', ''];
const BAD = ['חיכינו 40 דקות למנה העיקרית', 'יקר ביחס לגודל המנות', 'היה רועש מאוד', 'המנה הגיעה קרה'];
const NAMES = ['נועה כהן', 'יוסי לוי', 'מיכל אברהם', 'אבי פרץ', 'שירה מזרחי', 'דני ביטון', 'רונית גולן', 'עומר שפירא', 'תמר אשכנזי', 'גיל דהן'];
const PLAN = `## איפה אתם עומדים
ממליצים עליכם בכמעט חצי מהתשובות, בעיקר בשאלות על דייט ועל פסטה. בשאלות על אירועים וארוחות עסקיות ממליצים על "ביסטרו 61" ו"פסטה דה לוקה", שמופיעים ב-Rest ובטיים אאוט עם הרבה ביקורות.
## מה לעשות
- להשלים את העמוד ב-Rest ולבקש מלקוחות קבועים ביקורת שם. זה המקור שה-AI מצטט הכי הרבה, ואתם מופיעים בו מעט.
- להוסיף לאתר עמוד "אירועים פרטיים" עם מספר המקומות, תפריט אירועים ותמונות. בשאלות על אירועים ה-AI ממליץ רק על מי שכותב על זה במפורש.
- להוסיף בפרופיל הגוגל את הקטגוריה "מסעדה איטלקית" ואת השירות "ארוחת צהריים עסקית".
- לכתוב בתיאור הפרופיל ובאתר את השכונה ("הצפון הישן, ליד כיכר דיזנגוף"). התשובות מחפשות התאמה למיקום.
- לבקש בביקורות להזכיר מנה ספציפית ("הפסטה", "הטירמיסו"). ה-AI מצטט ביקורות עם פרטים.`;

function build(store) {
  const db = store.db;
  const r = rng(42);
  const now = Date.now();
  let userId = store.userByEmail(DEMO_EMAIL)?.id;
  if (!userId) userId = store.createUser({ email: DEMO_EMAIL, name: 'אורח בדמו', passwordHash: `!demo-${crypto.randomBytes(16).toString('hex')}` });

  const bizId = store.createBusiness(userId, { name: 'ביסטרו הגפן', plan: 'pro', brand_color: '#7c3aed' });
  db.prepare("UPDATE memberships SET role = 'viewer' WHERE business_id = ? AND user_id = ?").run(bizId, userId);
  db.prepare('UPDATE businesses SET is_demo = 1, alert_drops = 0, weekly_report = 0, monthly_report = 0, alert_negative = 0 WHERE id = ?').run(bizId);
  store.updateBusiness(bizId, {
    ai_queries: JSON.stringify(QUERIES),
    ai_aliases: 'הגפן, Hagefen',
    ai_site: 'https://hagefen-demo.co.il/',
    ai_city: 'תל אביב',
    ai_plus: true,
  });

  // ---- surveys and QR ----
  const campaignId = store.createCampaign(bizId, { name: 'שולחנות וקופה', slug: `demo-${crypto.randomBytes(4).toString('hex')}`, google_review_url: 'https://g.page/r/demo/review', ask_staff: true });
  const staff = ['דנה', 'יוסי', 'מיכל'].map((n) => store.createStaff(bizId, n));
  const sources = ['שולחן 4', 'שולחן 9', 'קופה', 'וואטסאפ'];
  for (let i = 0; i < 140; i++) {
    const t = now - Math.floor(r() * 75) * DAY - r() * DAY;
    const vid = `demo-v-${i}`;
    const source = sources[i % sources.length];
    db.prepare('INSERT INTO events (campaign_id, type, source, visitor_id, created_at) VALUES (?, ?, ?, ?, ?)').run(campaignId, 'scan', source, vid, sql(t));
    if (r() < 0.32) continue;
    const roll = r();
    const rating = roll < 0.6 ? 5 : roll < 0.82 ? 4 : roll < 0.9 ? 3 : roll < 0.96 ? 2 : 1;
    const sentiment = rating >= 4 ? 'positive' : 'negative';
    const tok = store.createResponse({ campaign_id: campaignId, visitor_id: vid, source, rating, sentiment, staff_id: staff[i % 3] });
    const resp = store.responseByToken(tok);
    const comment = sentiment === 'positive' ? GOOD[i % GOOD.length] : BAD[i % BAD.length];
    store.completeResponse(resp.id, {
      answers: sentiment === 'positive' ? { nps: 8 + (i % 3) } : { nps: 3 + (i % 4) },
      comment,
      customer_name: sentiment === 'negative' ? NAMES[i % NAMES.length] : '',
      phone: sentiment === 'negative' ? `05${String(20000000 + i * 7919).slice(0, 8)}` : '',
      email: '',
      wants_contact: sentiment === 'negative',
    });
    const tags = comment ? JSON.stringify(sentiment === 'positive' ? [['איכות', 'שירות', 'אווירה'][i % 3]] : [['זמן המתנה', 'מחיר', 'אווירה', 'איכות'][i % 4]]) : '[]';
    db.prepare("UPDATE responses SET created_at = ?, tags = ?, tagged_at = datetime('now') WHERE id = ?").run(sql(t), tags, resp.id);
    if (sentiment === 'negative' && t < now - 2 * DAY) {
      db.prepare("UPDATE responses SET status = 'resolved', resolved_at = datetime(?, '+5 hours'), notes = 'דיברנו עם הלקוח ופיצינו' WHERE id = ?").run(sql(t), resp.id);
    }
    if (sentiment === 'positive' && r() < 0.6) {
      store.addReviewClick(resp.id, 'google');
      db.prepare('INSERT INTO events (campaign_id, type, source, visitor_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(campaignId, 'review_click', source, vid, 'google', sql(t));
    }
  }

  // ---- the Google profile: reviews, rating over time ----
  const lat = 32.0853;
  const lng = 34.7745;
  const locId = Number(
    db.prepare(`INSERT INTO google_locations (business_id, name, title, address, place_id, review_url, enabled, source, avg_rating, total_reviews, synced_at, lat, lng, campaign_id)
                VALUES (?, ?, 'ביסטרו הגפן · דיזנגוף', 'דיזנגוף 180, תל אביב-יפו', 'demo-place', 'https://g.page/r/demo/review', 1, 'demo', 4.6, 412, datetime('now'), ?, ?, ?)`)
      .run(bizId, `demo:${bizId}`, lat, lng, campaignId).lastInsertRowid,
  );
  for (let i = 0; i < 80; i++) {
    const t = now - Math.floor(r() * 90) * DAY - r() * DAY;
    const roll = r();
    const rating = roll < 0.66 ? 5 : roll < 0.86 ? 4 : roll < 0.92 ? 3 : roll < 0.97 ? 2 : 1;
    const comment = rating >= 4 ? GOOD[i % GOOD.length] : BAD[i % BAD.length];
    const replied = t < now - 3 * DAY && r() < 0.92;
    store.upsertGoogleReview(locId, {
      name: `demo/${bizId}/reviews/${i}`,
      reviewer: NAMES[i % NAMES.length],
      photo: '',
      rating,
      comment,
      createTime: iso(t),
      updateTime: iso(t),
      reply: replied ? (rating >= 4 ? 'תודה רבה! שמחים שנהניתם, מחכים לכם שוב.' : 'מצטערים מאוד על החוויה. נשמח שתיצרו קשר כדי שנוכל לתקן.') : '',
      replyTime: replied ? iso(t + DAY) : '',
    });
  }
  db.prepare("UPDATE google_reviews SET alerted = 1, tagged_at = datetime('now'), tags = CASE WHEN rating >= 4 THEN '[\"איכות\"]' ELSE '[\"זמן המתנה\"]' END WHERE location_id = ?").run(locId);
  for (let d = 90; d >= 0; d--) {
    store.snapshot('location', locId, { rating: +(4.48 + ((90 - d) / 90) * 0.12).toFixed(2), total: 330 + Math.round((90 - d) * 0.9) }, day(now - d * DAY));
  }

  // ---- profile health: a month ago and now ----
  const profile = {
    title: 'ביסטרו הגפן', rating: 4.6, reviews: 412, phone: '03-5551234', website: 'https://hagefen-demo.co.il/', address: 'דיזנגוף 180, תל אביב-יפו',
    hours: true, description: 'ביסטרו שכונתי בצפון הישן', types: ['מסעדה', 'ביסטרו'], photos: 64, attributes: true, menu: true, unclaimed: false, lat, lng,
  };
  const activity = { recent30: 14, replyRate: 0.74, postsRecent: null };
  const before = healthChecks({ ...profile, description: '', photos: 12 }, { ...activity, replyRate: 0.4 });
  const nowScore = healthChecks(profile, activity);
  db.prepare('INSERT INTO profile_audits (business_id, location_id, run_at, score, profile, items) VALUES (?, ?, ?, ?, ?, ?)').run(bizId, locId, sql(now - 35 * DAY), before.score, JSON.stringify(profile), JSON.stringify(before.items));
  db.prepare('INSERT INTO profile_audits (business_id, location_id, run_at, score, profile, items, tips) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    bizId, locId, sql(now - DAY), nowScore.score, JSON.stringify(profile), JSON.stringify(nowScore.items),
    '## מה לעשות קודם\n- **להאריך את התיאור**: לכתוב מה מגישים, לאיזה אירועים ואיפה בדיוק.\n- **לענות לכל הביקורות**: רבע מהביקורות עדיין בלי תשובה.\n## הצעה לתיאור העסק\nביסטרו הגפן הוא ביסטרו שכונתי בצפון הישן של תל אביב, ליד כיכר דיזנגוף. פסטה טרייה שמכינים במקום, יין מכרמים קטנים וטירמיסו שאנשים חוזרים בשבילו. מתאים לדייט, לארוחה משפחתית ולאירועים קטנים של עד 25 איש.\n## קטגוריות משניות מומלצות\nמסעדה איטלקית, בר יין, מסעדה לאירועים',
  );

  // ---- map rank: two searches, five weekly checks ----
  for (const [keyword, startRank] of [['ביסטרו', 6.5], ['מסעדה איטלקית', 8.2]]) {
    const kw = store.addRankKeyword(bizId, locId, keyword, 1000);
    for (let w = 4; w >= 0; w--) {
      const base = startRank - (4 - w) * (startRank - 2.5) / 4;
      const points = gridPoints(lat, lng, 1000).map((p, i) => {
        const rank = Math.max(1, Math.round(base + (i % 3) - 1 + (r() - 0.5) * 2));
        return { ...p, rank: rank > 20 ? null : rank, top: [RIVALS[i % 5], 'ביסטרו הגפן', RIVALS[(i + 2) % 5]] };
      });
      const found = points.filter((p) => p.rank != null).length;
      const avg = points.reduce((s, p) => s + Math.min(p.rank ?? 21, 21), 0) / points.length;
      db.prepare('INSERT INTO rank_checks (keyword_id, run_at, avg_rank, found, points, leaders) VALUES (?, ?, ?, ?, ?, ?)').run(
        kw, sql(now - w * 7 * DAY - DAY), +avg.toFixed(1), found, JSON.stringify(points),
        JSON.stringify([{ title: RIVALS[0], n: 8 }, { title: 'ביסטרו הגפן', n: 6 }, { title: RIVALS[1], n: 5 }]),
      );
    }
  }

  // ---- competitors ----
  [[RIVALS[0], 4.5, 1240, 38], [RIVALS[1], 4.7, 860, 22], [RIVALS[2], 4.3, 2105, 51]].forEach(([title, rating, total, recent], i) => {
    const c = store.addCompetitor(bizId, { dataId: `demo-rival-${bizId}-${i}`, title, address: 'תל אביב-יפו' });
    store.updateCompetitor(c.id, { rating, total, recent30: recent, checked_at: sql(now - DAY) });
    for (let d = 60; d >= 0; d -= 3) store.snapshot('competitor', c.id, { rating, total: total - Math.round(d * recent / 30) }, day(now - d * DAY));
  });

  // ---- AI visibility: six weekly checks, improving ----
  const rates = [0.22, 0.27, 0.3, 0.36, 0.41, 0.47];
  rates.forEach((rate, k) => {
    const runAt = sql(now - (rates.length - 1 - k) * 7 * DAY - 2 * 3600e3);
    for (const query of QUERIES) {
      for (const engine of ENGINES) {
        if (engine === 'google_ai_overview' && r() < 0.3) {
          store.saveAiCheck(bizId, runAt, { query, engine, error: 'no_answer' });
          continue;
        }
        const mentioned = r() < rate;
        const cited = mentioned && r() < 0.45;
        const src = SOURCES.filter(() => r() < 0.4).map(([link, title]) => ({ link, title }));
        store.saveAiCheck(bizId, runAt, {
          query, engine, mentioned, cited,
          snippet: mentioned ? 'כדאי לנסות את ביסטרו הגפן בדיזנגוף, עם פסטה טרייה ואווירה אינטימית.' : '',
          citedLink: cited ? 'https://hagefen-demo.co.il/' : '',
          sources: src,
        });
        const names = RIVALS.filter(() => r() < 0.35).slice(0, 3);
        store.setAiRecommended(bizId, runAt, query, engine, names);
      }
    }
    if (k === rates.length - 1) {
      store.saveAiPlan(bizId, runAt, PLAN);
      store.updateBusiness(bizId, { ai_checked_at: runAt });
    }
  });

  // ---- views, calls and directions from the Google profile ----
  const rows = [];
  for (let d = 420; d >= 3; d--) {
    const t = now - d * DAY;
    const wk = [0.8, 0.9, 1, 1.05, 1.3, 1.5, 0.7][new Date(t).getUTCDay()];
    const growth = 1 + (420 - d) / 700;
    const add = (metric, base) => rows.push({ date: day(t), metric, value: Math.round(base * wk * growth * (0.65 + r() * 0.7)) });
    add('BUSINESS_IMPRESSIONS_MOBILE_MAPS', 70); add('BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 38); add('BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 12); add('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 16);
    add('CALL_CLICKS', 4.5); add('BUSINESS_DIRECTION_REQUESTS', 7); add('WEBSITE_CLICKS', 3.5); add('BUSINESS_CONVERSATIONS', 0.8); add('BUSINESS_BOOKINGS', 1.2);
  }
  store.saveProfileMetrics(locId, rows);
  for (let m = 0; m < 3; m++) {
    const month = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - m, 1)).toISOString().slice(0, 7);
    store.saveProfileKeywords(locId, month, [
      ['ביסטרו הגפן', 720], ['מסעדה בדיזנגוף', 410], ['מסעדה איטלקית תל אביב', 260], ['פסטה טרייה', 180], ['מסעדה רומנטית תל אביב', 120], ['ביסטרו ליד', null, 15],
    ].map(([keyword, value, threshold]) => ({ keyword, value, threshold })));
  }
  db.prepare("UPDATE google_locations SET metrics_at = datetime('now') WHERE id = ?").run(locId);

  for (const branch of BRANCHES) addBranch(store, bizId, branch, r, now);
  for (const t of TEMPLATES) store.addReplyTemplate(bizId, t);
  return bizId;
}

// ---- more branches, so the demo shows a network: a strong one, a new one, and one that needs attention ----
const BRANCHES = [
  { title: 'ביסטרו הגפן · רמת אביב', address: 'איינשטיין 40, תל אביב-יפו', lat: 32.1133, lng: 34.8044, rating: 4.7, total: 268, reviews: 60, good: 0.9, replied: 0.92, health: [70, 88], traffic: 0.85, rank: 3.1 },
  { title: 'ביסטרו הגפן · הרצליה פיתוח', address: 'המנופים 8, הרצליה', lat: 32.1624, lng: 34.8076, rating: 4.5, total: 74, reviews: 34, good: 0.82, replied: 0.7, health: [52, 74], traffic: 0.55, rank: 7.4 },
  { title: 'ביסטרו הגפן · חיפה', address: 'דרך הים 12, חיפה', lat: 32.8065, lng: 34.9857, rating: 4.2, total: 151, reviews: 46, good: 0.68, replied: 0.35, health: [55, 58], traffic: 0.7, rank: 9.6 },
];
const TEMPLATES = [
  { title: 'תודה על ביקורת חיובית', stars: '45', body: 'תודה רבה {שם}! שמחים מאוד שנהניתם אצלנו ב{סניף}. מחכים לראות אתכם שוב בקרוב.' },
  { title: 'ביקורת בינונית', stars: '3', body: 'תודה {שם} על המשוב. חשוב לנו לשמוע מה אפשר לשפר, ונשמח אם תכתבו לנו ישירות כדי שנוכל לתקן לפעם הבאה.' },
  { title: 'ביקורת שלילית', stars: '12', body: 'שלום {שם}, מצטערים מאוד לשמוע על החוויה ב{סניף}. זה לא הסטנדרט שלנו. נשמח לדבר איתכם ישירות ולתקן.' },
];

function addBranch(store, bizId, b, r, now) {
  const db = store.db;
  const locId = Number(
    db.prepare(`INSERT INTO google_locations (business_id, name, title, address, place_id, review_url, enabled, source, avg_rating, total_reviews, synced_at, lat, lng, metrics_at)
                VALUES (?, ?, ?, ?, ?, 'https://g.page/r/demo/review', 1, 'demo', ?, ?, datetime('now'), ?, ?, datetime('now'))`)
      .run(bizId, `demo:${bizId}:${b.title}`, b.title, b.address, `demo-place-${b.lat}`, b.rating, b.total, b.lat, b.lng).lastInsertRowid,
  );
  for (let i = 0; i < b.reviews; i++) {
    const t = now - Math.floor(r() * 60) * DAY - r() * DAY;
    const roll = r();
    const rating = roll < b.good * 0.75 ? 5 : roll < b.good ? 4 : roll < b.good + (1 - b.good) * 0.4 ? 3 : roll < b.good + (1 - b.good) * 0.8 ? 2 : 1;
    const replied = t < now - 2 * DAY && r() < b.replied;
    store.upsertGoogleReview(locId, {
      name: `demo/${bizId}/${locId}/reviews/${i}`,
      reviewer: NAMES[(i + 3) % NAMES.length],
      photo: '',
      rating,
      comment: rating >= 4 ? GOOD[(i + 2) % GOOD.length] : BAD[(i + 1) % BAD.length],
      createTime: iso(t),
      updateTime: iso(t),
      reply: replied ? (rating >= 4 ? 'תודה רבה! מחכים לכם שוב.' : 'מצטערים מאוד. נשמח שתיצרו קשר כדי שנוכל לתקן.') : '',
      replyTime: replied ? iso(t + DAY) : '',
    });
  }
  db.prepare("UPDATE google_reviews SET alerted = 1, tagged_at = datetime('now'), tags = CASE WHEN rating >= 4 THEN '[\"איכות\"]' ELSE '[\"זמן המתנה\"]' END WHERE location_id = ?").run(locId);
  for (let d = 90; d >= 0; d -= 3) store.snapshot('location', locId, { rating: +(b.rating - 0.05 + ((90 - d) / 90) * 0.05).toFixed(2), total: b.total - Math.round(d * 0.4) }, day(now - d * DAY));

  b.health.forEach((score, k) => {
    db.prepare('INSERT INTO profile_audits (business_id, location_id, run_at, score, profile, items) VALUES (?, ?, ?, ?, ?, ?)').run(
      bizId, locId, sql(now - (k ? 1 : 35) * DAY), score, JSON.stringify({ title: b.title, rating: b.rating, reviews: b.total, address: b.address, lat: b.lat, lng: b.lng }), '[]',
    );
  });

  const kw = store.addRankKeyword(bizId, locId, 'ביסטרו', 1000);
  for (let w = 2; w >= 0; w--) {
    const base = b.rank + w * 0.6;
    const points = gridPoints(b.lat, b.lng, 1000).map((p, i) => {
      const rank = Math.max(1, Math.round(base + (i % 3) - 1 + (r() - 0.5) * 2));
      return { ...p, rank: rank > 20 ? null : rank, top: [RIVALS[i % 5], b.title, RIVALS[(i + 2) % 5]] };
    });
    const avg = points.reduce((sum, p) => sum + Math.min(p.rank ?? 21, 21), 0) / points.length;
    db.prepare('INSERT INTO rank_checks (keyword_id, run_at, avg_rank, found, points, leaders) VALUES (?, ?, ?, ?, ?, ?)').run(
      kw, sql(now - w * 7 * DAY - DAY), +avg.toFixed(1), points.filter((p) => p.rank != null).length, JSON.stringify(points), '[]',
    );
  }

  const rows = [];
  for (let d = 120; d >= 3; d--) {
    const t = now - d * DAY;
    const wk = [0.8, 0.9, 1, 1.05, 1.3, 1.5, 0.7][new Date(t).getUTCDay()];
    const add = (metric, base) => rows.push({ date: day(t), metric, value: Math.round(base * b.traffic * wk * (0.65 + r() * 0.7)) });
    add('BUSINESS_IMPRESSIONS_MOBILE_MAPS', 70); add('BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 38); add('BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 12); add('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 16);
    add('CALL_CLICKS', 4.5); add('BUSINESS_DIRECTION_REQUESTS', 7); add('WEBSITE_CLICKS', 3.5);
  }
  store.saveProfileMetrics(locId, rows);
}

/** The demo business, built (or rebuilt when stale). Returns { userId, businessId }. */
export function ensureDemo(store) {
  const db = store.db;
  const existing = db.prepare('SELECT * FROM businesses WHERE is_demo = 1 ORDER BY id DESC LIMIT 1').get();
  // Rebuilt when stale, or when it was built before the branches were added.
  const current = existing && db.prepare('SELECT COUNT(*) AS n FROM google_locations WHERE business_id = ?').get(existing.id).n === BRANCHES.length + 1;
  if (current && Date.parse(`${existing.created_at.replace(' ', 'T')}Z`) > Date.now() - REBUILD_DAYS * DAY) {
    return { userId: store.userByEmail(DEMO_EMAIL).id, businessId: existing.id };
  }
  db.exec('BEGIN');
  try {
    if (existing) db.prepare('DELETE FROM businesses WHERE is_demo = 1').run();
    const businessId = build(store);
    db.exec('COMMIT');
    return { userId: store.userByEmail(DEMO_EMAIL).id, businessId };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const isDemoUser = (user) => user?.email === DEMO_EMAIL;
