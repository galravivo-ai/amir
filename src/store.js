import { parseJson } from './db.js';
import { sha256, slugify, sqlTime, token } from './util.js';

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

export const ROLES = {
  owner: 'בעלים',
  manager: 'מנהל',
  viewer: 'צפייה בלבד',
};
const ROLE_RANK = { viewer: 1, manager: 2, owner: 3 };
export const roleAtLeast = (role, min) => (ROLE_RANK[role] || 0) >= ROLE_RANK[min];

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
      const r = q("INSERT INTO users (email, name, password_hash, terms_accepted_at) VALUES (?, ?, ?, datetime('now'))").run(
        email.toLowerCase(),
        name,
        passwordHash,
      );
      return Number(r.lastInsertRowid);
    },
    userByEmail: (email) => q('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()),
    userById: (id) => q('SELECT * FROM users WHERE id = ?').get(id) || null,
    updateUserName: (id, name) => q('UPDATE users SET name = ? WHERE id = ?').run(name, id),
    updateUserPassword(id, passwordHash, keepSessionId = null) {
      q('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
      // Changing the password signs out every other session.
      q('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(id, keepSessionId);
    },
    setSuperadmin: (id, on) => q('UPDATE users SET is_superadmin = ? WHERE id = ?').run(on ? 1 : 0, id),
    allUsers: () =>
      q(`SELECT u.id, u.email, u.name, u.is_superadmin, u.created_at,
           (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS businesses
         FROM users u ORDER BY u.id DESC`).all(),

    // ---------- password reset ----------
    createPasswordReset(userId) {
      const raw = token(24);
      q('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
        sha256(raw),
        userId,
        sqlTime(60 * 60e3),
      );
      return raw;
    },
    passwordResetByToken: (raw) =>
      q('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(
        sha256(raw),
        sqlTime(),
      ) || null,
    usePasswordReset: (raw) =>
      q("UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?").run(sha256(raw)),
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
          `SELECT s.id AS session_id, s.csrf, u.id, u.email, u.name, u.is_superadmin
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND s.expires_at > ?`,
        ).get(id, new Date().toISOString()) || null
      );
    },
    deleteSession: (id) => q('DELETE FROM sessions WHERE id = ?').run(id),

    // ---------- businesses ----------
    /** Businesses the user belongs to, with their role in each. */
    businessesFor: (userId) =>
      q(`SELECT b.*, m.role FROM businesses b JOIN memberships m ON m.business_id = b.id
         WHERE m.user_id = ? ORDER BY b.id`).all(userId),
    business: (id, userId) =>
      q(`SELECT b.*, m.role FROM businesses b JOIN memberships m ON m.business_id = b.id
         WHERE b.id = ? AND m.user_id = ?`).get(id, userId) || null,
    businessById: (id) => q('SELECT * FROM businesses WHERE id = ?').get(id) || null,
    businessByWidgetKey: (key) => q('SELECT * FROM businesses WHERE widget_key = ?').get(String(key)) || null,
    createBusiness(userId, { name, logo_url = '', brand_color = '#4b2bd6', plan = 'free' }) {
      const r = q(
        'INSERT INTO businesses (user_id, name, logo_url, brand_color, plan, widget_key) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(userId, name, logo_url, brand_color, plan, token(12));
      const id = Number(r.lastInsertRowid);
      q("INSERT INTO memberships (business_id, user_id, role) VALUES (?, ?, 'owner')").run(id, userId);
      return id;
    },
    /** Updates only whitelisted columns that are present in `f`. */
    updateBusiness(id, f) {
      const allowed = [
        'name', 'logo_url', 'brand_color', 'webhook_url', 'alert_emails', 'alert_negative',
        'weekly_report', 'sla_hours', 'widget_auto_publish', 'plan', 'last_weekly_report_at',
      ];
      const keys = allowed.filter((k) => f[k] !== undefined);
      if (!keys.length) return;
      q(`UPDATE businesses SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...keys.map((k) => (typeof f[k] === 'boolean' ? Number(f[k]) : f[k])),
        id,
      );
    },
    setLogo(businessId, { mime, data }) {
      q(`INSERT INTO business_logos (business_id, mime, data, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(business_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`).run(
        businessId,
        mime,
        data,
      );
      q('UPDATE businesses SET logo_version = ? WHERE id = ?').run(token(6), businessId);
    },
    removeLogo(businessId) {
      q('DELETE FROM business_logos WHERE business_id = ?').run(businessId);
      q('UPDATE businesses SET logo_version = NULL WHERE id = ?').run(businessId);
    },
    logoOf: (businessId) => q('SELECT mime, data FROM business_logos WHERE business_id = ?').get(businessId) || null,
    ensureWidgetKey(id) {
      q('UPDATE businesses SET widget_key = ? WHERE id = ? AND widget_key IS NULL').run(token(12), id);
    },
    allBusinesses: () =>
      q(`SELECT b.*, u.email AS owner_email,
           (SELECT COUNT(*) FROM campaigns c WHERE c.business_id = b.id) AS campaigns,
           (SELECT COUNT(*) FROM memberships m WHERE m.business_id = b.id) AS members,
           (SELECT COUNT(*) FROM responses r JOIN campaigns c ON c.id = r.campaign_id
              WHERE c.business_id = b.id AND r.created_at >= datetime('now', 'start of month')) AS month_responses
         FROM businesses b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.id DESC`).all(),
    openIssuesCount: (businessId) =>
      q(`SELECT COUNT(*) AS n FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.sentiment = 'negative' AND r.status = 'new'`).get(businessId).n,
    monthlyResponseCount: (businessId) =>
      q(`SELECT COUNT(*) AS n FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= datetime('now', 'start of month')`).get(businessId).n,

    // ---------- team ----------
    membersOf: (businessId) =>
      q(`SELECT u.id, u.email, u.name, m.role, m.created_at FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.business_id = ? ORDER BY m.created_at`).all(businessId),
    /** Emails of people who should get operational alerts (owners + managers). */
    alertRecipients: (businessId) =>
      q(`SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.business_id = ? AND m.role IN ('owner', 'manager')`).all(businessId).map((r) => r.email),
    addMember(businessId, userId, role) {
      q('INSERT OR IGNORE INTO memberships (business_id, user_id, role) VALUES (?, ?, ?)').run(businessId, userId, role);
    },
    setMemberRole: (businessId, userId, role) =>
      q('UPDATE memberships SET role = ? WHERE business_id = ? AND user_id = ?').run(role, businessId, userId),
    removeMember: (businessId, userId) =>
      q('DELETE FROM memberships WHERE business_id = ? AND user_id = ?').run(businessId, userId),
    countOwners: (businessId) =>
      q("SELECT COUNT(*) AS n FROM memberships WHERE business_id = ? AND role = 'owner'").get(businessId).n,
    createTeamInvite(businessId, { email, role, invitedBy }) {
      const raw = token(24);
      q(`INSERT INTO team_invites (business_id, email, role, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`).run(businessId, email.toLowerCase(), role, sha256(raw), invitedBy, sqlTime(7 * 864e5));
      return raw;
    },
    teamInviteByToken: (raw) =>
      q(`SELECT t.*, b.name AS business_name FROM team_invites t JOIN businesses b ON b.id = t.business_id
         WHERE t.token_hash = ? AND t.accepted_at IS NULL AND t.expires_at > ?`).get(sha256(raw), sqlTime()) || null,
    acceptTeamInvite(invite, userId) {
      q("UPDATE team_invites SET accepted_at = datetime('now') WHERE id = ?").run(invite.id);
      q('INSERT OR REPLACE INTO memberships (business_id, user_id, role) VALUES (?, ?, ?)').run(
        invite.business_id,
        userId,
        invite.role,
      );
    },
    pendingTeamInvites: (businessId) =>
      q(`SELECT * FROM team_invites WHERE business_id = ? AND accepted_at IS NULL AND expires_at > ?
         ORDER BY id DESC`).all(businessId, sqlTime()),
    deleteTeamInvite: (businessId, id) => q('DELETE FROM team_invites WHERE business_id = ? AND id = ?').run(businessId, id),
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
        `INSERT INTO campaigns (business_id, name, slug, lang, google_review_url, extra_links, threshold, questions, texts,
           reminder_hours, ask_consent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        f.reminder_hours ?? 48,
        f.ask_consent === false ? 0 : 1,
      );
      return Number(r.lastInsertRowid);
    },
    updateCampaign(id, f) {
      q(
        `UPDATE campaigns SET name = ?, lang = ?, google_review_url = ?, extra_links = ?, threshold = ?,
           questions = ?, texts = ?, active = ?, reminder_hours = ?, ask_consent = ?
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
        f.reminder_hours ?? 48,
        f.ask_consent ? 1 : 0,
        id,
      );
    },
    deleteCampaign: (id) => q('DELETE FROM campaigns WHERE id = ?').run(id),

    // ---------- invites ----------
    createInvite(campaignId, { customer_name, phone, email = '' }) {
      const t = token(9);
      q('INSERT INTO invites (campaign_id, token, customer_name, phone, email) VALUES (?, ?, ?, ?, ?)').run(
        campaignId,
        t,
        customer_name,
        phone,
        email,
      );
      return t;
    },
    markInviteEmailed: (id) => q("UPDATE invites SET email_sent_at = datetime('now') WHERE id = ?").run(id),
    markInviteReminded: (id) => q("UPDATE invites SET reminder_sent_at = datetime('now') WHERE id = ?").run(id),
    /** Email invites that were sent, not answered, and are due for their single reminder. */
    invitesDueForReminder: () =>
      q(`SELECT i.*, c.slug, c.name AS campaign_name, c.business_id
         FROM invites i JOIN campaigns c ON c.id = i.campaign_id
         WHERE i.email != '' AND i.email_sent_at IS NOT NULL AND i.responded_at IS NULL
           AND i.reminder_sent_at IS NULL AND c.active = 1 AND c.reminder_hours > 0
           AND i.email_sent_at <= datetime('now', '-' || c.reminder_hours || ' hours')
           AND i.email_sent_at >= datetime('now', '-14 days')`).all(),
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
    deleteResponse: (id) => q('DELETE FROM responses WHERE id = ?').run(id),
    completeResponse(id, f) {
      q(
        `UPDATE responses SET answers = ?, comment = ?, customer_name = ?, phone = ?, email = ?,
           wants_contact = ?, publish_consent = ?, published = ?, completed = 1, updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        JSON.stringify(f.answers),
        f.comment,
        f.customer_name,
        f.phone,
        f.email,
        f.wants_contact ? 1 : 0,
        f.publish_consent ? 1 : 0,
        f.published ? 1 : 0,
        id,
      );
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
      q(`UPDATE responses SET status = ?, notes = ?, updated_at = datetime('now'),
           resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN COALESCE(resolved_at, datetime('now')) ELSE NULL END
         WHERE id = ?`).run(status, notes, status, id);
    },
    setPublished: (id, on) => q('UPDATE responses SET published = ? WHERE id = ? AND publish_consent = 1').run(on ? 1 : 0, id),
    setAiDraft: (id, text) => q('UPDATE responses SET ai_draft = ? WHERE id = ?').run(text, id),
    /** Testimonials approved for the public widget. */
    publishedTestimonials: (businessId, limit = 30) =>
      q(`SELECT r.id, r.rating, r.comment, r.customer_name, r.created_at FROM responses r
         JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.published = 1 AND r.publish_consent = 1 AND r.comment != ''
         ORDER BY r.id DESC LIMIT ?`).all(businessId, limit),
    /** Negative tickets past the business SLA that have not triggered an alert yet. */
    overdueUnalerted: () =>
      q(`SELECT r.*, c.name AS campaign_name, c.business_id, b.sla_hours
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id JOIN businesses b ON b.id = c.business_id
         WHERE r.sentiment = 'negative' AND r.status = 'new' AND r.sla_alerted_at IS NULL AND b.sla_hours > 0
           AND r.created_at <= datetime('now', '-' || b.sla_hours || ' hours')
           AND r.created_at >= datetime('now', '-30 days')`).all(),
    markSlaAlerted: (id) => q("UPDATE responses SET sla_alerted_at = datetime('now') WHERE id = ?").run(id),
    /** Completed responses, newest first, for AI summaries. */
    responsesForInsights(businessId, { campaignId = null, days = 30, limit = 300 } = {}) {
      return q(
        `SELECT r.rating, r.answers, r.comment, c.questions FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.completed = 1 AND r.created_at >= ? ${campaignId ? 'AND c.id = ?' : ''}
         ORDER BY r.id DESC LIMIT ?`,
      ).all(...[businessId, sqlTime(-days * 864e5), ...(campaignId ? [campaignId] : []), limit]);
    },

    // ---------- AI insights ----------
    saveInsight(f) {
      const r = q(
        `INSERT INTO ai_insights (business_id, campaign_id, days, response_count, content, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(f.business_id, f.campaign_id ?? null, f.days, f.response_count, f.content, f.created_by ?? null);
      return Number(r.lastInsertRowid);
    },
    insightsFor: (businessId, limit = 10) =>
      q(`SELECT i.*, c.name AS campaign_name, u.name AS author FROM ai_insights i
         LEFT JOIN campaigns c ON c.id = i.campaign_id LEFT JOIN users u ON u.id = i.created_by
         WHERE i.business_id = ? ORDER BY i.id DESC LIMIT ?`).all(businessId, limit),

    // ---------- outbox ----------
    recentOutbox: (limit = 100) => q('SELECT * FROM outbox ORDER BY id DESC LIMIT ?').all(limit),
    listResponses(businessId, { campaignId, sentiment, status, search, overdue, consent, limit = 100, offset = 0 } = {}) {
      const where = ['c.business_id = ?'];
      const args = [businessId];
      if (overdue) {
        where.push(
          "r.sentiment = 'negative' AND r.status = 'new' AND b.sla_hours > 0 AND r.created_at <= datetime('now', '-' || b.sla_hours || ' hours')",
        );
      }
      if (consent) where.push("r.publish_consent = 1 AND r.comment != ''");
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
      const sql = `SELECT r.*, c.name AS campaign_name,
          (r.sentiment = 'negative' AND r.status = 'new' AND b.sla_hours > 0
            AND r.created_at <= datetime('now', '-' || b.sla_hours || ' hours')) AS overdue
        FROM responses r
        JOIN campaigns c ON c.id = r.campaign_id JOIN businesses b ON b.id = c.business_id
        WHERE ${where.join(' AND ')}
        ORDER BY r.id DESC LIMIT ? OFFSET ?`;
      return q(sql).all(...args, limit, offset);
    },

    // ---------- analytics ----------
    /** Headline numbers for the window [now - fromDays, now - toDays), used for trends. */
    periodSummary(businessId, { campaignId = null, fromDays, toDays = 0 }) {
      const args = [businessId, sqlTime(-fromDays * 864e5), sqlTime(-toDays * 864e5)];
      const cf = campaignId ? 'AND c.id = ?' : '';
      if (campaignId) args.push(campaignId);
      const r = q(
        `SELECT COUNT(*) AS responses, AVG(r.rating) AS avg_rating, SUM(r.review_clicks != '[]') AS reviewed
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${cf}`,
      ).get(...args);
      return { responses: r.responses || 0, avgRating: r.avg_rating || 0, reviewed: r.reviewed || 0 };
    },

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
                SUM(r.review_clicks != '[]') AS reviewed,
                AVG(CASE WHEN r.resolved_at IS NOT NULL
                    THEN (julianday(r.resolved_at) - julianday(r.created_at)) * 24 END) AS avg_resolve_hours
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? ${cFilter}`,
      ).get(...base);
      const overdue = q(
        `SELECT COUNT(*) AS n FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         JOIN businesses b ON b.id = c.business_id
         WHERE c.business_id = ? ${cFilter} AND r.sentiment = 'negative' AND r.status = 'new' AND b.sla_hours > 0
           AND r.created_at <= datetime('now', '-' || b.sla_hours || ' hours')`,
      ).get(...(campaignId ? [businessId, campaignId] : [businessId])).n;

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
        overdue,
        avgResolveHours: agg.avg_resolve_hours ?? null,
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
