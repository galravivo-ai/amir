// Creates a demo account with sample data: demo@example.com / demo12345
import { openDb } from './db.js';
import { createStore } from './store.js';
import { hashPassword } from './util.js';

const store = createStore(openDb());
const email = 'demo@example.com';
if (store.userByEmail(email)) {
  console.log('Demo user already exists.');
  process.exit(0);
}

const userId = store.createUser({ email, name: 'דמו', passwordHash: hashPassword('demo12345') });
const bizId = store.createBusiness(userId, { name: 'קפה הדוגמה', plan: 'business' });
store.setSuperadmin(userId, true);
const campaignId = store.createCampaign(bizId, {
  name: 'סניף מרכזי',
  google_review_url: 'https://search.google.com/local/writereview?placeid=ChIJ_demo_place_id',
  extra_links: [{ label: 'Facebook', url: 'https://facebook.com' }],
  ask_staff: true,
});
const northId = store.createCampaign(bizId, {
  name: 'סניף הצפון',
  slug: 'demo-north',
  google_review_url: 'https://search.google.com/local/writereview?placeid=ChIJ_demo_place_id',
});
const staffIds = ['דנה', 'יוסי', 'מיכל', 'עומר'].map((n) => store.createStaff(bizId, n));

const goodComments = ['', 'המלצר היה מקסים', 'הכל מושלם!', 'קפה מעולה'];
const testimonials = [
  'הקפה הכי טוב באזור, והצוות תמיד מחייך',
  'מקום נעים לשבת לעבוד, אינטרנט מהיר ועוגות מצוינות',
  'הזמנו מגש אירוח לאירוע, הכל הגיע בזמן וטעים',
  'שירות אדיב במיוחד, הרגשנו בבית',
  'הקרואסון שווה כל שקל',
  'באנו עם ילדים וקיבלנו יחס מדהים',
];
const names = ['נועה', 'יוסי', 'מיכל', 'אבי', 'שירה', 'דני'];
const badComments = ['חיכינו הרבה זמן', 'הקפה היה קר', '', 'יקר מדי ביחס לכמות'];
const sources = ['table-1', 'table-2', 'cashier', ''];
const db = store.db;
for (let i = 0; i < 160; i++) {
  const daysAgo = Math.floor(Math.random() * 30);
  const when = new Date(Date.now() - daysAgo * 864e5 - Math.random() * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const source = sources[i % sources.length];
  const vid = `seed-visitor-${i}`;
  const cid = i % 3 === 0 ? northId : campaignId;
  db.prepare('INSERT INTO events (campaign_id, type, source, visitor_id, created_at) VALUES (?, ?, ?, ?, ?)').run(cid, 'scan', source, vid, when);
  if (Math.random() < 0.3) continue;
  // Each employee has a slightly different rating profile, so the leaderboard has a story.
  const who = i % 5;
  const profile = [[5, 5, 5, 5, 4, 4, 3], [5, 5, 4, 4, 4, 3, 2], [5, 4, 4, 4, 3, 2, 1], [5, 5, 5, 4, 4, 4, 2]][who] || [5, 5, 5, 4, 4, 4, 3, 2, 1];
  const rating = profile[Math.floor(Math.random() * profile.length)];
  const sentiment = rating >= 4 ? 'positive' : 'negative';
  const tok = store.createResponse({ campaign_id: cid, visitor_id: vid, source, rating, sentiment, staff_id: staffIds[who] ?? null });
  const r = store.responseByToken(tok);
  const answers =
    sentiment === 'positive'
      ? { liked: ['שירות', 'איכות', 'אווירה'].filter(() => Math.random() < 0.5), nps: 7 + Math.floor(Math.random() * 4) }
      : { issues: ['זמן המתנה', 'שירות', 'מחיר'].filter(() => Math.random() < 0.5), nps: Math.floor(Math.random() * 7) };
  store.completeResponse(r.id, {
    answers,
    comment: (sentiment === 'positive' ? goodComments : badComments)[i % 4],
    customer_name: sentiment === 'negative' ? `לקוח ${i}` : '',
    phone: sentiment === 'negative' ? `05${String(20000000 + i * 7919).slice(0, 8)}` : '',
    email: '',
    wants_contact: sentiment === 'negative',
  });
  if (sentiment === 'positive' && i % 3 === 0) {
    db.prepare("UPDATE responses SET customer_name = ?, comment = ?, publish_consent = 1, published = ? WHERE id = ?").run(
      names[(i / 3) % names.length | 0],
      testimonials[(i / 3) % testimonials.length | 0],
      i % 6 === 0 ? 1 : 0,
      r.id,
    );
  }
  db.prepare('UPDATE responses SET created_at = ? WHERE id = ?').run(when, r.id);
  // Older complaints were handled; recent ones are still open (some overdue).
  if (sentiment === 'negative' && daysAgo > 2) {
    db.prepare(
      "UPDATE responses SET status = 'resolved', resolved_at = datetime(?, '+' || ? || ' hours'), notes = 'דיברנו עם הלקוח' WHERE id = ?",
    ).run(when, 1 + (i % 20), r.id);
  }
  if (sentiment === 'positive' && Math.random() < 0.6) {
    store.addReviewClick(r.id, 'google');
    db.prepare('INSERT INTO events (campaign_id, type, source, visitor_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(cid, 'review_click', source, vid, 'google', when);
  }
}
console.log('Seeded demo data. Login: demo@example.com / demo12345');
