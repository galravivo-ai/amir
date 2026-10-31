import { googleAuthLost } from './googleSync.js';
import { parseJson } from './db.js';
import { leadGoals, STAGE2_AT } from './goals.js';
import { cityOf } from './routes/visibility.js';
import { weekKey } from './tasks.js';
import { monthKey } from './usage.js';
import { siteHost } from './visibility.js';

// The promotion plan: the actions that move a business up in Google Maps and
// into AI answers, in four tracks: the Google profile, the website, presence
// on other sites, and AI answers. Each action says why and how; where the
// system can see the result (the profile check, the reviews, the website
// check, the AI checks) it marks it on its own, otherwise it's marked by hand.
// Weekly and monthly actions start over each week or month. The score is the
// weighted share done.

const DAY = 864e5;

export const TRACKS = {
  profile: 'פרופיל הגוגל (מפות)',
  site: 'האתר',
  web: 'נוכחות ברשת',
  ai: 'נראות ב-AI',
};

export const CADENCE = { once: '', week: 'כל שבוע', month: 'כל חודש' };

/** Directories worth a listing in Israel, with the same name, address and phone everywhere. */
export const DIRECTORIES = [
  ['b144', 'B144', 'https://www.b144.co.il/'],
  ['d', 'דפי זהב', 'https://www.d.co.il/'],
  ['easy', 'איזי', 'https://easy.co.il/'],
  ['facebook', 'עמוד פייסבוק', 'https://www.facebook.com/pages/create'],
  ['instagram', 'אינסטגרם עסקי', 'https://www.instagram.com/'],
  ['waze', 'Waze', 'https://www.waze.com/he/'],
  ['apple', 'Apple Maps', 'https://businessconnect.apple.com/'],
  ['bing', 'Bing Places', 'https://www.bingplaces.com/'],
];

/** What the AI can write for an action. */
export const WRITERS = {
  description: 'תיאור עסק לפרופיל',
  'review-ask': 'הודעה לבקשת ביקורת',
  seo: 'כותרת ותיאור לאתר',
  faq: 'שאלות נפוצות',
  article: 'מאמר לאתר',
  outreach: 'פנייה לקישור',
  pitch: 'פנייה לכתבה או רשימה',
  'ai-answers': 'תשובות לשאלות של לקוחות',
};

const ACTIONS = [
  // ---------- the Google profile ----------
  {
    key: 'keywords', track: 'profile', weight: 10, cadence: 'once', ai: true, write: 'description',
    title: 'מילות מפתח בפרופיל',
    why: 'גוגל מציגה עסק בחיפוש כשהפרופיל שלו מתאים למה שחיפשו. תיאור, קטגוריות ושירותים עם המילים שלקוחות מחפשים, ועם שם העיר והשכונה, מעלים את העסק ביותר חיפושים.',
    how: [
      'רשמו 5-10 ביטויים שלקוחות מחפשים (למשל "מספרה לגברים בחולון", "תספורת ילדים").',
      'קטגוריה ראשית מדויקת, ועוד 2-4 קטגוריות משניות שמתאימות.',
      'תיאור של 500-750 תווים: מה אתם עושים, למי ואיפה. בלי רשימת מילים, בשפה טבעית.',
      'ברשימת השירותים או המוצרים בפרופיל: כל שירות עם שם ברור ותיאור קצר.',
    ],
    link: ['https://business.google.com/', 'לעריכת הפרופיל בגוגל'],
  },
  {
    key: 'basics', track: 'profile', weight: 8, cadence: 'once',
    title: 'פרטים מלאים בפרופיל',
    why: 'פרופיל מלא נראה אמין יותר לגוגל וללקוחות: שעות פתיחה, טלפון, אתר, מאפייני שירות ותמונות.',
    how: ['שעות פתיחה, כולל שעות מיוחדות בחגים.', 'טלפון וקישור לאתר.', 'מאפייני שירות: נגישות, חניה, משלוחים, תשלום באשראי.', 'לפחות 20 תמונות אמיתיות.'],
    href: '/admin/maps#health',
  },
  {
    key: 'photos', track: 'profile', weight: 6, cadence: 'week',
    title: 'תמונות חדשות בפרופיל',
    why: 'תמונות חדשות מראות לגוגל שהעסק פעיל, ופרופיל עם תמונות עדכניות מקבל יותר כניסות ושיחות.',
    how: ['2-3 תמונות בשבוע: עבודות, מוצרים, הצוות, המקום מבפנים ומבחוץ.', 'תמונות אמיתיות ומוארות, לא מאגר תמונות.', 'מעלים מהטלפון באפליקציית Google Maps, או בעריכת הפרופיל.'],
    link: ['https://business.google.com/', 'להעלאת תמונות'],
  },
  {
    key: 'posts', track: 'profile', weight: 8, cadence: 'week',
    title: 'פוסט בגוגל',
    why: 'פוסט קבוע (מבצע, עדכון, אירוע, עבודה שעשיתם) שומר על הפרופיל פעיל ומופיע למי שמחפש אתכם.',
    how: ['פוסט אחד בשבוע, עם תמונה.', 'כתבו מה חדש או מה מיוחד השבוע, ושלבו את השירות ואת האזור.', 'הוסיפו כפתור: התקשרו, הזמינו, למידע נוסף.'],
    href: '/admin/google/posts',
    hrefLabel: 'לכתיבת פוסט עם AI',
  },
  {
    key: 'reviews', track: 'profile', weight: 10, cadence: 'once', ai: true, write: 'review-ask',
    title: 'ביקורות חדשות, עם מילים',
    why: 'קצב קבוע של ביקורות חדשות הוא מהגורמים החזקים במפות. ביקורת שמספרת מה הלקוח קיבל ואיפה ("תספורת מעולה בחולון") עוזרת גם לחיפוש וגם ל-AI להבין במה אתם טובים.',
    how: ['מבקשים ביקורת מכל לקוח מרוצה, מיד אחרי השירות.', 'מבקשים לכתוב במשפט מה עשינו ומה אהבו. לא מכתיבים מילים ולא נותנים הטבה תמורת ביקורת (זה נגד הכללים של גוגל).', 'יעד: לפחות 4 ביקורות חדשות בחודש.'],
    href: '/admin/campaigns',
    hrefLabel: 'לקמפיינים ושלטי QR',
  },
  {
    key: 'replies', track: 'profile', weight: 8, cadence: 'once',
    title: 'מענה לכל ביקורת',
    why: 'גוגל רואה בעסק שעונה לביקורות עסק פעיל. תשובה שמזכירה את השירות ואת האזור מוסיפה הקשר לפרופיל.',
    how: ['עונים לכל ביקורת, גם לחיובית, תוך יום-יומיים.', 'בתשובה מזכירים את השירות באופן טבעי ("שמחים שנהניתם מהתספורת").', 'לביקורת שלילית: עניינית, מתנצלת, ומזמינה לדבר.'],
    href: '/admin/google/reviews?filter=unanswered',
    hrefLabel: 'לביקורות שמחכות',
  },
  {
    key: 'booking', track: 'profile', weight: 5, cadence: 'once',
    title: 'קישורי הזמנה והודעות',
    why: 'כפתור הזמנה, קישור לתור או וואטסאפ בפרופיל הופכים צפייה לפנייה, וגוגל מודדת את הפעולות האלה.',
    how: ['בעריכת הפרופיל: קישור להזמנת תור, להזמנה אונליין או לתפריט.', 'הוסיפו קישור לוואטסאפ או הפעילו צ\'אט אם האפשרות זמינה לכם.', 'בדקו שהקישורים עובדים מהטלפון.'],
    link: ['https://business.google.com/', 'לעריכת הפרופיל בגוגל'],
  },

  // ---------- the website ----------
  {
    key: 'site-seo', track: 'site', weight: 8, cadence: 'once', write: 'seo',
    title: 'אופטימיזציה בסיסית לחיפוש',
    why: 'האתר שמקושר לפרופיל הוא חלק ממה שגוגל בודקת. כותרת ותיאור עם השירות והעיר, ואתר שעובד טוב בטלפון, מחזקים את ההתאמה לחיפוש.',
    how: ['כותרת הדף (title): השירות + העיר + שם העסק, עד 60 תווים.', 'תיאור (meta description) של 140-160 תווים עם הזמנה לפעולה.', 'כותרת ראשית (H1) אחת שאומרת מה אתם ואיפה.', 'אתר מאובטח (https) ומותאם לטלפון.'],
  },
  {
    key: 'site-nap', track: 'site', weight: 5, cadence: 'once', ai: true,
    title: 'טלפון, כתובת ומפה באתר',
    why: 'אותו שם, כתובת וטלפון באתר ובפרופיל מאשרים לגוגל ול-AI שמדובר באותו עסק ובאותו מקום.',
    how: ['בתחתית כל עמוד: שם העסק, כתובת וטלפון, בדיוק כמו בפרופיל.', 'קישור למיקום בגוגל מפות או מפה מוטמעת בעמוד יצירת קשר.'],
  },
  {
    key: 'site-schema', track: 'site', weight: 6, cadence: 'once', ai: true, schema: true,
    title: 'סימון עסק מקומי (Schema)',
    why: 'קוד קצר בדף שמסביר למנועי חיפוש ול-AI בשפה שלהם מי העסק, איפה הוא ומתי הוא פתוח. הכנו לכם אותו מהפרופיל.',
    how: ['מעתיקים את הקוד שלמטה.', 'מדביקים אותו בתוך ה-<head> של דף הבית (בוורדפרס: תוסף להוספת קוד, או בהגדרות התבנית).', 'בודקים בכלי של גוגל: Rich Results Test.'],
    link: ['https://search.google.com/test/rich-results', 'לבדיקה בכלי של גוגל'],
  },
  {
    key: 'site-faq', track: 'site', weight: 6, cadence: 'once', ai: true, write: 'faq',
    title: 'שאלות ותשובות',
    why: 'עוזרי AI אוהבים תשובות ישירות. דף שאלות נפוצות עם סימון FAQ עוזר להם לצטט אתכם, ועונה ללקוחות לפני שהם מתקשרים.',
    how: ['8-12 שאלות שלקוחות באמת שואלים: מחיר, זמנים, אזור שירות, חניה, אחריות.', 'תשובה קצרה וישירה לכל אחת, במשפט הראשון.', 'הדביקו את קוד ה-FAQ שה-AI מכין יחד עם השאלות.', 'אם בפרופיל שלכם בגוגל יש אזור "שאלות ותשובות", הוסיפו שם 3-5 מהשאלות.'],
  },
  {
    key: 'site-content', track: 'site', weight: 6, cadence: 'month', ai: true, write: 'article',
    title: 'תוכן ייחודי לאתר',
    why: 'מאמר או מדריך חדש בכל חודש, שעונה על שאלה של לקוחות, בונה סמכות בתחום. גם גוגל וגם עוזרי AI מעדיפים תוכן מקורי עם ניסיון אמיתי.',
    how: ['בחרו שאלה אחת שלקוחות שואלים החודש.', 'כתבו תשובה מפורטת עם דוגמאות מהעבודה שלכם, תמונות ומחירים אם אפשר.', 'ה-AI כותב טיוטה. הוסיפו לה מניסיון שלכם לפני שמפרסמים.'],
  },

  // ---------- presence on other sites ----------
  {
    key: 'citations', track: 'web', weight: 8, cadence: 'once', ai: true, directories: true,
    title: 'אינדקסים ואזכורים',
    why: 'רישום באינדקסים ובמפות אחרות, עם אותם שם, כתובת וטלפון, מחזק את האמינות של העסק בגוגל ומוסיף מקורות שה-AI קורא.',
    how: ['נרשמים באינדקסים שברשימה. מסמנים כל אחד שהושלם.', 'מעתיקים את הפרטים מהתיבה, כדי שיהיו זהים בכל מקום.'],
  },
  {
    key: 'consistent', track: 'web', weight: 5, cadence: 'once', ai: true,
    title: 'מידע עקבי בכל מקום',
    why: 'כשהשם, הכתובת, הטלפון והשירותים זהים באתר, בגוגל, ברשתות ובאינדקסים, גוגל וה-AI בטוחים יותר שזה אתם, וממליצים בביטחון.',
    how: ['עברו על האתר, הפרופיל, פייסבוק, אינסטגרם והאינדקסים.', 'תקנו כל מקום שבו הטלפון, הכתובת, השעות או השם שונים.', 'אותו תיאור קצר של מה שאתם עושים בכל מקום.'],
  },
  {
    key: 'multi-reviews', track: 'web', weight: 5, cadence: 'once', ai: true,
    title: 'ביקורות בכמה פלטפורמות',
    why: 'עוזרי AI אוספים מידע מכמה מקומות. ביקורות טובות גם בפייסבוק, באיזי או ב-TripAdvisor (לתיירות ומסעדות) מחזקות את ההמלצה עליכם.',
    how: ['בחרו פלטפורמה אחת נוספת שמתאימה לתחום שלכם.', 'בקשו מחלק מהלקוחות המרוצים לכתוב גם שם.', 'ענו לביקורות גם שם.'],
  },
  {
    key: 'backlinks', track: 'web', weight: 7, cadence: 'month', write: 'outreach',
    title: 'קישורים מאתרים אחרים',
    why: 'קישור לאתר שלכם מאתר אמין (ספק, איגוד, שותף, עיתון מקומי) הוא סימן חזק לגוגל שהעסק קיים ומוכר.',
    how: ['בחרו החודש אתר אחד: ספק, לקוח עסקי, איגוד מקצועי, מתנ"ס, אתר שכונתי.', 'בקשו שיזכירו אתכם עם קישור (למשל ברשימת לקוחות, שותפים או ספקים מומלצים).', 'ה-AI מנסח את הפנייה.'],
  },
  {
    key: 'mentions', track: 'web', weight: 7, cadence: 'month', ai: true, write: 'pitch', sources: true,
    title: 'אזכורים בכתבות ורשימות',
    why: 'כשעוזר AI ממליץ על עסקים, הוא מסתמך על כתבות, רשימות "הכי טובים" ובלוגים. להופיע שם זו הדרך הישירה להופיע בתשובות.',
    how: ['האתרים שה-AI הסתמך עליהם בבדיקות שלכם מופיעים למטה.', 'פנו לעורך או לכותב של רשימה מתאימה, עם מה שמייחד אתכם.', 'גם ראיון בעיתון מקומי או בבלוג מקצועי נחשב.'],
  },

  // ---------- AI answers ----------
  {
    key: 'ai-questions', track: 'ai', weight: 4, cadence: 'once', ai: true,
    title: 'שאלות למעקב ב-AI',
    why: 'כדי לדעת אם ChatGPT ו-Gemini ממליצים עליכם, בוחרים את השאלות שלקוחות שואלים, והמערכת בודקת כל שבוע.',
    how: ['בעמוד "נראות ב-AI" בוחרים 3-5 שאלות, או מקבלים הצעות מה-AI.'],
    href: '/admin/ai-visibility',
    hrefLabel: 'לנראות ב-AI',
  },
  {
    key: 'ai-content', track: 'ai', weight: 8, cadence: 'once', ai: true, write: 'ai-answers',
    title: 'תוכן שעונה ישר על השאלות',
    why: 'מנועי AI מחפשים תשובה ברורה: מי אתם, מה אתם עושים, איפה, למי, כמה זה עולה ולמה אתכם. דף באתר שעונה על זה בעובדות, בלי סיסמאות, הוא מה שהם מצטטים.',
    how: ['לכל שאלה שבמעקב: פסקה באתר שעונה עליה ישר במשפט הראשון.', 'עובדות ומספרים: שנות ניסיון, אזור שירות, מחירים, שעות, התמחות.', 'עמוד "אודות" עם אותן עובדות, ומקושר מכל האתר.'],
  },
];

const periodOf = (cadence, now) => (cadence === 'week' ? weekKey(now) : cadence === 'month' ? monthKey(now) : '');

/** What the AI writer and the schema code are built from. */
export function growthFacts(store, business) {
  const id = business.id;
  const loc = store.googleLocations(id).find((l) => l.enabled);
  const audit = store.latestAudits(id).find((a) => !a.error);
  const profile = audit ? parseJson(audit.profile, {}) : {};
  const address = profile.address || loc?.address || '';
  const site = parseJson(business.site_check, null);
  return {
    name: business.name,
    address,
    city: business.ai_city || cityOf(address),
    phone: profile.phone || '',
    website: business.ai_site || profile.website || '',
    categories: (profile.types || []).slice(0, 5),
    description: profile.description || '',
    hours: profile.hoursText || '',
    rating: profile.rating || null,
    reviews: profile.reviews ?? null,
    services: String(business.growth_services ?? '').trim(),
    keywords: store.rankKeywords(id).map((k) => k.keyword),
    questions: parseJson(business.ai_queries, []),
    praise: store
      .googleReviews(id, { stars: '5', text: 'with', limit: 8 })
      .map((r) => String(r.comment || '').slice(0, 240))
      .filter(Boolean)
      .slice(0, 5),
    site,
  };
}

/** The LocalBusiness JSON-LD for the website, from what we know of the profile. */
export function localSchema(facts) {
  const data = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: facts.name };
  if (facts.description) data.description = facts.description.slice(0, 300);
  if (facts.website) data.url = facts.website;
  if (facts.phone) data.telephone = facts.phone;
  if (facts.address) data.address = { '@type': 'PostalAddress', streetAddress: facts.address.split(',')[0].trim(), addressLocality: facts.city || undefined, addressCountry: 'IL' };
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

/** The hosts AI answers leaned on in the last check, other than the business's own and Google's. */
export function aiSourceHosts(store, business, limit = 6) {
  const mine = siteHost(business.ai_site);
  const count = new Map();
  for (const r of store.aiVisibility(business.id).latest) {
    if (r.error) continue;
    for (const s of parseJson(r.sources, [])) {
      let host = '';
      try {
        host = new URL(s.link).hostname.replace(/^www\./, '');
      } catch {
        continue;
      }
      if (!host || host === mine || /(^|\.)google\.|(^|\.)goo\.gl$|g\.page$/.test(host)) continue;
      count.set(host, (count.get(host) || 0) + 1);
    }
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([host]) => host);
}

/** What the system itself can tell about an action: { state, detail } or null when it can't. */
function autoState(key, ctx) {
  const { audit, g, site, postsWeek, gbp, fresh, business, ai } = ctx;
  const items = new Map(parseJson(audit?.items, []).map((i) => [i.key, i]));
  const profile = parseJson(audit?.profile, {});
  switch (key) {
    case 'keywords': {
      if (!audit) return null;
      const desc = profile.description || '';
      const okDesc = desc.length >= 250;
      const okCats = (profile.types || []).length >= 2;
      const city = ctx.city;
      const okCity = !city || desc.includes(city);
      const parts = [okDesc, okCats, okCity].filter(Boolean).length;
      const detail = [
        desc ? `${desc.length} תווים בתיאור` : 'אין תיאור',
        `${(profile.types || []).length} קטגוריות`,
        city ? (desc.includes(city) ? 'העיר מופיעה בתיאור' : 'העיר לא מופיעה בתיאור') : '',
      ].filter(Boolean);
      return { state: parts === 3 ? 'done' : parts ? 'partial' : 'todo', detail };
    }
    case 'basics': {
      if (!audit) return null;
      const keys = ['hours', 'phone', 'website', 'attributes', 'photos'].filter((k) => items.has(k) && items.get(k).state !== 'unknown');
      if (!keys.length) return null;
      const missing = keys.filter((k) => items.get(k).state !== 'pass').map((k) => items.get(k).label);
      return { state: missing.length ? (missing.length < keys.length ? 'partial' : 'todo') : 'done', detail: missing.length ? [{ miss: missing }] : ['הכול מלא'] };
    }
    case 'posts':
      if (!gbp) return null;
      return postsWeek ? { state: 'done', detail: ['פורסם פוסט השבוע'] } : null;
    case 'reviews':
      if (fresh == null) return null;
      return { state: fresh >= 4 ? 'done' : fresh ? 'partial' : 'todo', detail: [`${fresh} ביקורות חדשות ב-30 יום`] };
    case 'replies':
      if (!g || g.replyRate == null) return null;
      return { state: g.replyRate >= 0.8 ? 'done' : g.replyRate >= 0.5 ? 'partial' : 'todo', detail: [`${Math.round(g.replyRate * 100)}% מהביקורות נענו`] };
    case 'site-seo': {
      if (!site || site.error) return null;
      const checks = [Boolean(site.title), Boolean(site.description), site.viewport, site.https, site.cityInHead !== false];
      const ok = checks.filter(Boolean).length;
      const miss = [
        !site.title && 'אין כותרת',
        !site.description && 'אין תיאור',
        !site.viewport && 'לא מותאם לטלפון',
        !site.https && 'לא מאובטח (https)',
        site.cityInHead === false && 'העיר לא מופיעה בכותרת או בתיאור',
      ].filter(Boolean);
      return { state: ok === checks.length ? 'done' : ok >= 3 ? 'partial' : 'todo', detail: miss.length ? miss : ['כותרת, תיאור, התאמה לטלפון ואבטחה תקינים'] };
    }
    case 'site-nap': {
      if (!site || site.error) return null;
      const ok = [site.phoneOnPage !== false, site.mapLink].filter(Boolean).length;
      const miss = [site.phoneOnPage === false && 'הטלפון מהפרופיל לא נמצא בדף הבית', !site.mapLink && 'אין קישור למפה'].filter(Boolean);
      return { state: ok === 2 ? 'done' : ok ? 'partial' : 'todo', detail: miss.length ? miss : ['טלפון וקישור למפה נמצאו'] };
    }
    case 'site-schema':
      if (!site || site.error) return null;
      return site.localSchema ? { state: 'done', detail: ['נמצא סימון עסק מקומי'] } : { state: 'todo', detail: ['לא נמצא סימון עסק מקומי בדף הבית'] };
    case 'site-faq':
      if (!site || site.error) return null;
      return site.faqSchema ? { state: 'done', detail: ['נמצא סימון FAQ'] } : null;
    case 'citations': {
      const n = ctx.marks.filter((m) => m.key.startsWith('dir:')).length;
      return { state: n >= 5 ? 'done' : n ? 'partial' : 'todo', detail: [`${n} מתוך ${DIRECTORIES.length} אינדקסים`] };
    }
    case 'ai-questions': {
      const n = parseJson(business.ai_queries, []).length;
      return { state: n ? 'done' : 'todo', detail: n ? [`${n} שאלות במעקב`] : [] };
    }
    case 'ai-content':
      if (!ai?.answered) return null;
      return ai.mentioned / ai.answered >= 0.5 ? { state: 'done', detail: [`הוזכרתם ב-${ai.mentioned} מתוך ${ai.answered} תשובות AI`] } : null;
    default:
      return null;
  }
}

export function growthPlan(store, business, { now = Date.now() } = {}) {
  const id = business.id;
  const locations = store.googleLocations(id).filter((l) => l.enabled);
  const audit = store.latestAudits(id).find((a) => !a.error) || null;
  const marks = store.growthMarks(id);
  const marked = new Set(marks.map((m) => `${m.key}|${m.period}`));
  const gbp = locations.some((l) => l.source === 'gbp');
  const since = new Date(now - 30 * DAY).toISOString();
  const fresh = locations.length ? locations.reduce((n, l) => n + store.googleReviewCount(l.id, since), 0) : null;
  const totals = locations.length
    ? store.db.prepare("SELECT COUNT(*) AS n, SUM(reply != '') AS replied FROM google_reviews r JOIN google_locations l ON l.id = r.location_id WHERE l.business_id = ? AND l.enabled = 1 AND r.create_time >= ?").get(id, new Date(now - 180 * DAY).toISOString())
    : null;
  const g = totals?.n ? { replyRate: (totals.replied || 0) / totals.n } : null;
  const week = weekKey(now);
  const postsWeek = gbp
    ? store.db.prepare('SELECT COUNT(*) AS n FROM google_posts WHERE business_id = ? AND created_at >= ?').get(id, `${week} 00:00:00`).n
    : 0;
  const site = parseJson(business.site_check, null);
  const ai = store.aiVisibility(id).runs.at(-1) || null;
  const facts = growthFacts(store, business);
  const ctx = { audit, g, site, postsWeek, gbp, fresh, business, ai, marks, city: facts.city };

  const items = ACTIONS.map((a) => {
    const period = periodOf(a.cadence, now);
    const auto = autoState(a.key, ctx);
    const byHand = marked.has(`${a.key}|${period}`);
    const state = auto?.state === 'done' || byHand ? 'done' : auto?.state || 'todo';
    return { ...a, period, state, auto: Boolean(auto), byHand, detail: auto?.detail || [] };
  });
  const total = items.reduce((s, i) => s + i.weight, 0);
  const got = items.reduce((s, i) => s + i.weight * (i.state === 'done' ? 1 : i.state === 'partial' ? 0.5 : 0), 0);
  const score = Math.round((got / total) * 100);
  // What to do next: the weightiest not done, weekly ones first when the week's not done.
  const next = items
    .filter((i) => i.state !== 'done')
    .sort((x, y) => y.weight + (y.cadence === 'week' ? 3 : 0) - (x.weight + (x.cadence === 'week' ? 3 : 0)))
    .slice(0, 3);
  const byTrack = Object.fromEntries(
    Object.keys(TRACKS).map((t) => {
      const list = items.filter((i) => i.track === t);
      const w = list.reduce((s, i) => s + i.weight, 0);
      const d = list.reduce((s, i) => s + i.weight * (i.state === 'done' ? 1 : i.state === 'partial' ? 0.5 : 0), 0);
      return [t, { items: list, score: Math.round((d / w) * 100) }];
    }),
  );
  return {
    score,
    next,
    tracks: byTrack,
    marks: new Set(marks.filter((m) => m.key.startsWith('dir:')).map((m) => m.key.slice(4))),
    facts,
    site,
    siteCheckedAt: business.site_checked_at || null,
    sources: aiSourceHosts(store, business),
  };
}

/**
 * What can't wait, ahead of the plan: customers who were unhappy, reviews
 * waiting for a reply, and the first steps without which nothing else works.
 */
export function urgentActions(store, business) {
  const id = business.id;
  const out = [];
  const locations = store.googleLocations(id).filter((l) => l.enabled);
  if (!locations.length) out.push({ key: 'connect', title: 'לחבר את העסק בגוגל', why: 'בלי זה אין ביקורות, נתונים ובדיקות. לוקח דקה.', href: '/admin/google' });
  else if (!business.is_demo && locations.some((l) => l.source !== 'serp') && (!store.googleConnection(id) || googleAuthLost(store.googleConnection(id).last_error))) {
    out.push({ key: 'reconnect', title: 'לחבר שוב את גוגל', why: 'החיבור נותק: ביקורות חדשות ונתונים לא מגיעים, ואי אפשר לענות מכאן. הנתונים הקודמים נשמרו.', href: '/admin/google' });
  }
  const unhappy = store.openIssuesCount(id);
  if (unhappy) {
    out.push({ key: 'unhappy', title: unhappy === 1 ? 'לחזור ללקוח לא מרוצה' : `לחזור ל-${unhappy} לקוחות לא מרוצים`, why: 'שיחה מהירה הופכת לקוח כועס לממליץ, ומונעת ביקורת שלילית בגוגל.', href: '/admin/responses?sentiment=negative&status=new' });
  }
  if (locations.length) {
    const g = store.googleStats(id, { days: 30 });
    if (g.unanswered) {
      out.push({ key: 'reply', title: g.unanswered === 1 ? 'לענות לביקורת שמחכה' : `לענות ל-${g.unanswered} ביקורות שמחכות`, why: g.waiting.length ? 'יש ביניהן ביקורות של 3 כוכבים ומטה. תשובה עניינית מראה ללקוחות הבאים שאכפת לכם.' : 'עסק שעונה לביקורות נראה פעיל, וגוגל רואה בזה סימן טוב. ה-AI מנסח טיוטה.', href: '/admin/google/reviews?filter=unanswered' });
    }
  }
  if (!store.campaignsFor(id).length) out.push({ key: 'campaign', title: 'ליצור קמפיין ושלט QR', why: 'הכלי הראשי לאסוף ביקורות מלקוחות בעסק.', href: '/admin/campaigns/new' });
  return out;
}

/** The dashboard's "what to do now": the urgent first, then the plan's next steps. */
export function todoNow(store, business, limit = 3) {
  const urgent = urgentActions(store, business);
  const connected = store.googleLocations(business.id).some((l) => l.enabled);
  const plan = connected ? growthPlan(store, business) : null;
  const next = (plan?.next || []).map((i) => ({ key: i.key, title: i.title, why: i.why, href: `/admin/growth#a-${i.key}`, cadence: i.cadence }));
  const goals = plan && plan.score >= STAGE2_AT ? leadGoals(store, business) : [];
  return { score: plan?.score ?? null, goals, items: [...urgent.map((u) => ({ ...u, urgent: true })), ...next].slice(0, goals.length ? Math.min(limit, 2) : limit) };
}

/** Can this key be marked by hand, and in which period. */
export function markPeriod(key, now = Date.now()) {
  if (key.startsWith('dir:')) return DIRECTORIES.some(([k]) => `dir:${k}` === key) ? '' : null;
  const a = ACTIONS.find((x) => x.key === key);
  return a ? periodOf(a.cadence, now) : null;
}

export const growthScoreLabel = (s) => (s >= 80 ? 'מצוין' : s >= 60 ? 'בדרך הנכונה' : s >= 35 ? 'יש עוד הרבה לעשות' : 'רק מתחילים');
