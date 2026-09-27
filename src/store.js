import { parseJson } from './db.js';
import { slugify, token } from './util.js';

export const QUESTION_TYPES = {
  choice: 'בחירה אחת',
  multi: 'בחירה מרובה',
  text: 'טקסט חופשי',
  nps: 'NPS (0-10)',
};

export const AUDIENCES = {
  all: 'כולם',
  positive: 'מרוצים בלבד',
  negative: 'לא מרוצים בלבד',
};

export const STATUSES = {
  new: 'חדש',
  in_progress: 'בטיפול',
  resolved: 'טופל',
  closed: 'סגור ללא טיפול',
};

export const DEFAULT_QUESTIONS = [
  {
    id: 'liked',
    type: 'multi',
    label: 'מה אהבתם במיוחד?',
    options: ['שירות', 'איכות', 'מחיר', 'מהירות', 'אווירה'],
    audience: 'positive',
    required: false,
  },
  {
    id: 'issues',
    type: 'multi',
    label: 'מה לא עבד טוב?',
    options: ['שירות', 'איכות', 'מחיר', 'זמן המתנה', 'ניקיון'],
    audience: 'negative',
    required: false,
  },
  {
    id: 'nps',
    type: 'nps',
    label: 'מה הסיכוי שתמליצו עלינו לחבר?',
    options: [],
    audience: 'all',
    required: false,
  },
];

/** Sanitises a question list coming from the admin form or from JSON. */
export function normalizeQuestions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, 20)) {
    const label = String(raw?.label ?? '').trim().slice(0, 200);
    if (!label) continue;
    const type = Object.hasOwn(QUESTION_TYPES, raw.type) ? raw.type : 'text';
    const audience = Object.hasOwn(AUDIENCES, raw.audience) ? raw.audience : 'all';
    let options = Array.isArray(raw.options) ? raw.options : String(raw.options ?? '').split(',');
    options = options.map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 12);
    if ((type === 'choice' || type === 'multi') && options.length === 0) continue;
    if (type === 'text' || type === 'nps') options = [];
    let id = String(raw.id ?? '').replace(/[^a-z0-9_]/gi, '').slice(0, 30) || `q${out.length + 1}`;
    while (seen.has(id)) id = `${id}_${out.length + 1}`;
    seen.add(id);
    out.push({ id, type, label, options, audience, required: Boolean(raw.required) });
  }
  return out;
}

export function hydrateCampaign(row) {
  if (!row) return null;
  return {
    ...row,
    questionsList: normalizeQuestions(parseJson(row.questions, [])),
    extraLinks: parseJson(row.extra_links, []),
    textsObj: parseJson(row.texts, {}),
  };
}

export function createStore(db) {
  const q = (sql) => db.prepare(sql);

  return {
    db,

    // ---------- users & sessions ----------
    createUser({ email, name, passwordHash }) {
      const r = q('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(
        email.toLowerCase(),
        name,
        passwordHash,
      );
      return Number(r.lastInsertRowid);
    },
    userByEmail: (email) => q('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()),
    countUsers: () => q('SELECT COUNT(*) AS n FROM users').get().n,

    createSession(userId, days = 30) {
      const id = token(32);
      const csrf = token(18);
      const expires = new Date(Date.now() + days * 864e5).toISOString();
      q('INSERT INTO sessions (id, user_id, csrf, expires_at) VALUES (?, ?, ?, ?)').run(id, userId, csrf, expires);
      return id;
    },
    sessionUser(id) {
      if (!id) return null;
      return (
        q(
          `SELECT s.id AS session_id, s.csrf, u.id, u.email, u.name
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND s.expires_at > ?`,
        ).get(id, new Date().toISOString()) || null
      );
    },
    deleteSession: (id) => q('DELETE FROM sessions WHERE id = ?').run(id),

    // ---------- businesses ----------
    businessesFor: (userId) => q('SELECT * FROM businesses WHERE user_id = ? ORDER BY id').all(userId),
    business: (id, userId) => q('SELECT * FROM businesses WHERE id = ? AND user_id = ?').get(id, userId) || null,
    businessById: (id) => q('SELECT * FROM businesses WHERE id = ?').get(id) || null,
    createBusiness(userId, { name, logo_url = '', brand_color = '#2563eb' }) {
      const r = q('INSERT INTO businesses (user_id, name, logo_url, brand_color) VALUES (?, ?, ?, ?)').run(
        userId,
        name,
        logo_url,
        brand_color,
      );
      return Number(r.lastInsertRowid);
    },
    updateBusiness(id, f) {
      q(
        'UPDATE businesses SET name = ?, logo_url = ?, brand_color = ?, webhook_url = ? WHERE id = ?',
      ).run(f.name, f.logo_url, f.brand_color, f.webhook_url, id);
    },
    deleteBusiness: (id) => q('DELETE FROM businesses WHERE id = ?').run(id),

    // ---------- campaigns ----------
    campaignsFor: (businessId) =>
      q('SELECT * FROM campaigns WHERE business_id = ? ORDER BY id').all(businessId).map(hydrateCampaign),
    campaign: (id, businessId) =>
      hydrateCampaign(q('SELECT * FROM campaigns WHERE id = ? AND business_id = ?').get(id, businessId)),
    campaignBySlug: (slug) => hydrateCampaign(q('SELECT * FROM campaigns WHERE slug = ?').get(slug)),
    campaignById: (id) => hydrateCampaign(q('SELECT * FROM campaigns WHERE id = ?').get(id)),
    createCampaign(businessId, f) {
      const r = q(
        `INSERT INTO campaigns (business_id, name, slug, lang, google_review_url, extra_links, threshold, questions, texts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        businessId,
        f.name,
        f.slug || slugify(f.name),
        f.lang || 'he',
        f.google_review_url || '',
        JSON.stringify(f.extra_links || []),
        f.threshold ?? 4,
        JSON.stringify(f.questions ?? DEFAULT_QUESTIONS),
        JSON.stringify(f.texts || {}),
      );
      return Number(r.lastInsertRowid);
    },
    updateCampaign(id, f) {
      q(
        `UPDATE campaigns SET name = ?, lang = ?, google_review_url = ?, extra_links = ?, threshold = ?,
           questions = ?, texts = ?, active = ?
         WHERE id = ?`,
      ).run(
        f.name,
        f.lang,
        f.google_review_url,
        JSON.stringify(f.extra_links),
        f.threshold,
        JSON.stringify(f.questions),
        JSON.stringify(f.texts),
        f.active ? 1 : 0,
        id,
      );
    },
    deleteCampaign: (id) => q('DELETE FROM campaigns WHERE id = ?').run(id),

    // ---------- invites ----------
    createInvite(campaignId, { customer_name, phone }) {
      const t = token(9);
      q('INSERT INTO invites (campaign_id, token, customer_name, phone) VALUES (?, ?, ?, ?)').run(
        campaignId,
        t,
        customer_name,
        phone,
      );
      return t;
    },
    invitesFor: (campaignId, limit = 50) =>
      q('SELECT * FROM invites WHERE campaign_id = ? ORDER BY id DESC LIMIT ?').all(campaignId, limit),
    inviteByToken: (campaignId, t) =>
      q('SELECT * FROM invites WHERE campaign_id = ? AND token = ?').get(campaignId, t) || null,
    markInviteOpened: (id) =>
      q("UPDATE invites SET opened_at = COALESCE(opened_at, datetime('now')) WHERE id = ?").run(id),
    markInviteResponded: (id) =>
      q("UPDATE invites SET responded_at = COALESCE(responded_at, datetime('now')) WHERE id = ?").run(id),

    // ---------- events ----------
    logEvent(campaignId, type, { source = '', visitorId = '', meta = '' } = {}) {
      q('INSERT INTO events (campaign_id, type, source, visitor_id, meta) VALUES (?, ?, ?, ?, ?)').run(
        campaignId,
        type,
        String(source).slice(0, 60),
        visitorId,
        String(meta).slice(0, 200),
      );
    },

    // ---------- responses ----------
    createResponse(f) {
      const t = token(12);
      q(
        `INSERT INTO responses (campaign_id, token, visitor_id, invite_id, source, rating, sentiment)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(f.campaign_id, t, f.visitor_id, f.invite_id ?? null, f.source, f.rating, f.sentiment);
      return t;
    },
    responseByToken: (t) => q('SELECT * FROM responses WHERE token = ?').get(t) || null,
    completeResponse(id, f) {
      q(
        `UPDATE responses SET answers = ?, comment = ?, customer_name = ?, phone = ?, email = ?,
           wants_contact = ?, completed = 1, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(JSON.stringify(f.answers), f.comment, f.customer_name, f.phone, f.email, f.wants_contact ? 1 : 0, id);
    },
    addReviewClick(id, platform) {
      const row = q('SELECT review_clicks FROM responses WHERE id = ?').get(id);
      const clicks = parseJson(row?.review_clicks, []);
      if (!clicks.includes(platform)) clicks.push(platform);
      q('UPDATE responses SET review_clicks = ? WHERE id = ?').run(JSON.stringify(clicks), id);
    },
    responseForBusiness: (id, businessId) =>
      q(
        `SELECT r.*, c.name AS campaign_name, c.questions AS campaign_questions
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE r.id = ? AND c.business_id = ?`,
      ).get(id, businessId) || null,
    updateResponseStatus(id, status, notes) {
      q("UPDATE responses SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?").run(
        status,
        notes,
        id,
      );
    },
    listResponses(businessId, { campaignId, sentiment, status, search, limit = 100, offset = 0 } = {}) {
      const where = ['c.business_id = ?'];
      const args = [businessId];
      if (campaignId) {
        where.push('r.campaign_id = ?');
        args.push(campaignId);
      }
      if (sentiment) {
        where.push('r.sentiment = ?');
        args.push(sentiment);
      }
      if (status) {
        where.push('r.status = ?');
        args.push(status);
      }
      if (search) {
        where.push('(r.comment LIKE ? OR r.customer_name LIKE ? OR r.phone LIKE ? OR r.email LIKE ?)');
        const like = `%${search}%`;
        args.push(like, like, like, like);
      }
      const sql = `SELECT r.*, c.name AS campaign_name FROM responses r
        JOIN campaigns c ON c.id = r.campaign_id
        WHERE ${where.join(' AND ')}
        ORDER BY r.id DESC LIMIT ? OFFSET ?`;
      return q(sql).all(...args, limit, offset);
    },

    // ---------- analytics ----------
    stats(businessId, { campaignId = null, days = 30 } = {}) {
      const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');
      const cFilter = campaignId ? 'AND c.id = ?' : '';
      const base = campaignId ? [businessId, since, campaignId] : [businessId, since];

      const ev = q(
        `SELECT e.type, COUNT(*) AS n, COUNT(DISTINCT e.visitor_id) AS uniq
         FROM events e JOIN campaigns c ON c.id = e.campaign_id
         WHERE c.business_id = ? AND e.created_at >= ? ${cFilter}
         GROUP BY e.type`,
      ).all(...base);
      const evMap = Object.fromEntries(ev.map((e) => [e.type, e]));

      const agg = q(
        `SELECT COUNT(*) AS responses,
                SUM(r.completed) AS completed,
                AVG(r.rating) AS avg_rating,
                SUM(r.sentiment = 'positive') AS positive,
                SUM(r.sentiment = 'negative') AS negative,
                SUM(r.sentiment = 'negative' AND r.status IN ('new','in_progress')) AS open_issues,
                SUM(r.review_clicks != '[]') AS reviewed
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? ${cFilter}`,
      ).get(...base);

      const dist = [0, 0, 0, 0, 0];
      for (const row of q(
        `SELECT r.rating, COUNT(*) AS n FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? ${cFilter} GROUP BY r.rating`,
      ).all(...base)) {
        if (row.rating >= 1 && row.rating <= 5) dist[row.rating - 1] = row.n;
      }

      const daily = new Map();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        daily.set(d, { date: d, scans: 0, responses: 0, negative: 0 });
      }
      for (const row of q(
        `SELECT substr(e.created_at, 1, 10) AS d, COUNT(*) AS n FROM events e
         JOIN campaigns c ON c.id = e.campaign_id
         WHERE c.business_id = ? AND e.created_at >= ? ${cFilter} AND e.type = 'scan' GROUP BY d`,
      ).all(...base)) {
        if (daily.has(row.d)) daily.get(row.d).scans = row.n;
      }
      for (const row of q(
        `SELECT substr(r.created_at, 1, 10) AS d, COUNT(*) AS n, SUM(r.sentiment = 'negative') AS neg
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? ${cFilter} GROUP BY d`,
      ).all(...base)) {
        if (daily.has(row.d)) Object.assign(daily.get(row.d), { responses: row.n, negative: row.neg });
      }

      const sources = q(
        `SELECT e.source, COUNT(*) AS scans FROM events e JOIN campaigns c ON c.id = e.campaign_id
         WHERE c.business_id = ? AND e.created_at >= ? ${cFilter} AND e.type = 'scan'
         GROUP BY e.source ORDER BY scans DESC LIMIT 10`,
      ).all(...base);

      // NPS across every nps-type question answered in range.
      let promoters = 0;
      let detractors = 0;
      let npsCount = 0;
      const rows = q(
        `SELECT r.answers, c.questions FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? ${cFilter} AND r.completed = 1`,
      ).all(...base);
      const optionCounts = {};
      for (const row of rows) {
        const answers = parseJson(row.answers, {});
        for (const question of normalizeQuestions(parseJson(row.questions, []))) {
          const a = answers[question.id];
          if (a === undefined || a === '') continue;
          if (question.type === 'nps') {
            const n = Number(a);
            if (Number.isFinite(n)) {
              npsCount++;
              if (n >= 9) promoters++;
              else if (n <= 6) detractors++;
            }
          } else if (question.type === 'choice' || question.type === 'multi') {
            const key = question.label;
            optionCounts[key] ??= {};
            for (const v of [].concat(a)) optionCounts[key][v] = (optionCounts[key][v] || 0) + 1;
          }
        }
      }

      const scans = evMap.scan?.n || 0;
      const responses = agg.responses || 0;
      return {
        days,
        scans,
        uniqueVisitors: evMap.scan?.uniq || 0,
        responses,
        completed: agg.completed || 0,
        responseRate: scans ? responses / scans : 0,
        avgRating: agg.avg_rating || 0,
        positive: agg.positive || 0,
        negative: agg.negative || 0,
        openIssues: agg.open_issues || 0,
        reviewClicks: evMap.review_click?.n || 0,
        reviewedResponses: agg.reviewed || 0,
        reviewConversion: responses ? (agg.reviewed || 0) / responses : 0,
        distribution: dist,
        daily: [...daily.values()],
        sources,
        nps: npsCount ? Math.round(((promoters - detractors) / npsCount) * 100) : null,
        npsCount,
        optionCounts,
      };
    },
  };
}
