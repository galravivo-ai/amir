import { parseJson } from './db.js';
import { templateQuestions } from './templates.js';
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

export const DEFAULT_QUESTIONS = templateQuestions('general', 'he');

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
    // ---------- Google Business Profile ----------
    googleConnection: (businessId) => q('SELECT * FROM google_connections WHERE business_id = ?').get(businessId) || null,
    saveGoogleConnection(businessId, f) {
      q(`INSERT INTO google_connections (business_id, email, refresh_token, access_token, expires_at, connected_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(business_id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token,
           access_token = excluded.access_token, expires_at = excluded.expires_at, connected_by = excluded.connected_by,
           last_error = NULL`).run(businessId, f.email, f.refreshToken, f.accessToken, f.expiresAt, f.connectedBy ?? null);
    },
    updateGoogleToken: (businessId, accessToken, expiresAt) =>
      q('UPDATE google_connections SET access_token = ?, expires_at = ? WHERE business_id = ?').run(accessToken, expiresAt, businessId),
    googleSyncResult: (businessId, error) =>
      q(`UPDATE google_connections SET last_sync_at = datetime('now'), last_error = ? WHERE business_id = ?`).run(error || null, businessId),
    deleteGoogleConnection(businessId) {
      q("DELETE FROM google_locations WHERE business_id = ? AND source = 'gbp'").run(businessId);
      q('DELETE FROM google_connections WHERE business_id = ?').run(businessId);
    },
    googleConnections: () => q('SELECT * FROM google_connections').all(),
    /** Keeps the list in step with Google; a new location starts disabled until the owner picks it. */
    upsertGoogleLocations(businessId, locations) {
      for (const l of locations) {
        q(`INSERT INTO google_locations (business_id, name, title, address, place_id, review_url, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(business_id, name) DO UPDATE SET title = excluded.title, address = excluded.address,
             place_id = excluded.place_id, review_url = excluded.review_url`).run(
          businessId, l.name, l.title, l.address, l.placeId, l.reviewUrl, locations.length === 1 ? 1 : 0,
        );
      }
    },
    googleLocations: (businessId) =>
      q(`SELECT l.*, c.name AS campaign_name,
           (SELECT COUNT(*) FROM google_reviews r WHERE r.location_id = l.id AND r.reply = '') AS unanswered
         FROM google_locations l LEFT JOIN campaigns c ON c.id = l.campaign_id
         WHERE l.business_id = ? ORDER BY l.title`).all(businessId),
    googleLocation: (id, businessId) => q('SELECT * FROM google_locations WHERE id = ? AND business_id = ?').get(id, businessId) || null,
    updateGoogleLocation: (id, { enabled, campaignId }) =>
      q('UPDATE google_locations SET enabled = ?, campaign_id = ? WHERE id = ?').run(enabled ? 1 : 0, campaignId ?? null, id),
    googleLocationStats: (id, avg, total) =>
      q(`UPDATE google_locations SET avg_rating = ?, total_reviews = ?, synced_at = datetime('now') WHERE id = ?`).run(avg, total, id),
    /** Returns true when the review is new to us. */
    upsertGoogleReview(locationId, r) {
      const existing = q('SELECT id FROM google_reviews WHERE name = ?').get(r.name);
      q(`INSERT INTO google_reviews (location_id, name, reviewer, photo, rating, comment, create_time, update_time, reply, reply_time, link)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET reviewer = excluded.reviewer, photo = excluded.photo, rating = excluded.rating,
           comment = excluded.comment, update_time = excluded.update_time, reply = excluded.reply, reply_time = excluded.reply_time,
           link = excluded.link`).run(
        locationId, r.name, r.reviewer, r.photo, r.rating, r.comment, r.createTime, r.updateTime, r.reply, r.replyTime, r.link || '',
      );
      return !existing;
    },
    googleReviews(businessId, { locationId = null, filter = '', limit = 100 } = {}) {
      const where = ['l.business_id = ?', 'l.enabled = 1'];
      const args = [businessId];
      if (locationId) {
        where.push('l.id = ?');
        args.push(locationId);
      }
      if (filter === 'unanswered') where.push("r.reply = ''");
      if (filter === 'negative') where.push('r.rating <= 3');
      return q(`SELECT r.*, l.title AS location_title FROM google_reviews r JOIN google_locations l ON l.id = r.location_id
                WHERE ${where.join(' AND ')} ORDER BY r.create_time DESC LIMIT ?`).all(...args, limit);
    },
    googleReviewByName: (name) =>
      q(`SELECT r.*, l.title AS location_title FROM google_reviews r JOIN google_locations l ON l.id = r.location_id WHERE r.name = ?`).get(name) || null,
    googleReview: (id, businessId) =>
      q(`SELECT r.*, l.title AS location_title, l.business_id, l.source, l.place_id, l.data_id FROM google_reviews r JOIN google_locations l ON l.id = r.location_id
         WHERE r.id = ? AND l.business_id = ?`).get(id, businessId) || null,
    setGoogleReply: (id, reply) => q(`UPDATE google_reviews SET reply = ?, reply_time = ? WHERE id = ?`).run(reply, new Date().toISOString(), id),
    /** A place followed by its link (SerpApi). Returns the location row. */
    addSerpLocation(businessId, p) {
      const name = `serp:${p.dataId || p.placeId}`;
      q(`INSERT INTO google_locations (business_id, name, title, address, place_id, data_id, review_url, source, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'serp', 1)
         ON CONFLICT(business_id, name) DO UPDATE SET enabled = 1`).run(
        businessId, name, p.title || '', p.address || '', p.placeId || '', p.dataId || '', p.reviewUrl || '',
      );
      return q('SELECT * FROM google_locations WHERE business_id = ? AND name = ?').get(businessId, name);
    },
    updateSerpPlace: (id, p) =>
      q(`UPDATE google_locations SET title = CASE WHEN ? != '' THEN ? ELSE title END,
           address = CASE WHEN ? != '' THEN ? ELSE address END WHERE id = ?`).run(p.title, p.title, p.address, p.address, id),
    serpLocationsDue: (hours) =>
      q(`SELECT * FROM google_locations WHERE source = 'serp' AND enabled = 1
           AND (synced_at IS NULL OR synced_at < datetime('now', ?)) ORDER BY synced_at`).all(`-${Number(hours) || 6} hours`),
    serpLocationCount: (businessId) =>
      q("SELECT COUNT(*) AS n FROM google_locations WHERE business_id = ? AND source = 'serp'").get(businessId).n,
    setLocationSyncError: (id, error) => q('UPDATE google_locations SET sync_error = ? WHERE id = ?').run(error ? String(error).slice(0, 300) : null, id),
    deleteGoogleLocation: (id, businessId) => q('DELETE FROM google_locations WHERE id = ? AND business_id = ?').run(id, businessId),
    markGoogleAlerted: (id) => q('UPDATE google_reviews SET alerted = 1 WHERE id = ?').run(id),
    /** Overall Google rating across the business's chosen locations. */
    googleSummary(businessId) {
      const r = q(`SELECT SUM(total_reviews) AS total, SUM(avg_rating * total_reviews) AS weighted
                   FROM google_locations WHERE business_id = ? AND enabled = 1 AND total_reviews > 0`).get(businessId);
      const unanswered = q(`SELECT COUNT(*) AS n FROM google_reviews r JOIN google_locations l ON l.id = r.location_id
                            WHERE l.business_id = ? AND l.enabled = 1 AND r.reply = ''`).get(businessId).n;
      return r.total ? { total: r.total, avg: r.weighted / r.total, unanswered } : { total: 0, avg: 0, unanswered };
    },

    // ---------- posts to Google Business Profile ----------
    savePostImage(businessId, { mime, data }) {
      const t = token(12);
      q('INSERT INTO post_images (token, business_id, mime, data) VALUES (?, ?, ?, ?)').run(t, businessId, mime, data);
      return t;
    },
    postImage: (t) => q('SELECT mime, data FROM post_images WHERE token = ?').get(String(t)) || null,
    createGooglePost(businessId, f) {
      return Number(
        q(`INSERT INTO google_posts (business_id, topic, summary, title, starts_at, ends_at, coupon, terms, cta_type, cta_url, image_token, results, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          businessId, f.topic, f.summary, f.title, f.startsAt, f.endsAt, f.coupon, f.terms, f.ctaType, f.ctaUrl, f.imageToken,
          JSON.stringify(f.results || []), f.createdBy ?? null,
        ).lastInsertRowid,
      );
    },
    googlePosts: (businessId, limit = 30) =>
      q('SELECT * FROM google_posts WHERE business_id = ? ORDER BY id DESC LIMIT ?').all(businessId, limit),

    // ---------- AI visibility ----------
    saveAiCheck(businessId, runAt, c) {
      q(`INSERT INTO ai_checks (business_id, run_at, query, engine, mentioned, cited, snippet, cited_link, sources, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        businessId, runAt, c.query, c.engine, c.mentioned ? 1 : 0, c.cited ? 1 : 0, c.snippet || '', c.citedLink || '',
        JSON.stringify(c.sources || []), c.error || null,
      );
    },
    /** The latest run's rows, and a score per earlier run for the trend. */
    aiVisibility(businessId) {
      const runs = q(
        `SELECT run_at, COUNT(*) AS total, SUM(error IS NULL) AS answered, SUM(mentioned) AS mentioned, SUM(cited) AS cited
         FROM ai_checks WHERE business_id = ? GROUP BY run_at ORDER BY run_at DESC LIMIT 12`,
      ).all(businessId);
      const latest = runs[0]
        ? q('SELECT * FROM ai_checks WHERE business_id = ? AND run_at = ? ORDER BY id').all(businessId, runs[0].run_at)
        : [];
      return { runs: runs.reverse(), latest };
    },
    aiVisibilityDue: (days) =>
      q(`SELECT * FROM businesses WHERE ai_queries != '[]'
           AND (ai_checked_at IS NULL OR ai_checked_at < datetime('now', ?))`).all(`-${Number(days) || 7} days`),

    // ---------- leads (quote requests) ----------
    createLead(f) {
      const r = q('INSERT INTO leads (kind, name, phone, email, company, size, message) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        f.kind, f.name, f.phone, f.email, f.company, f.size, f.message,
      );
      return Number(r.lastInsertRowid);
    },
    recentLeads: (limit = 50) => q('SELECT * FROM leads ORDER BY handled_at IS NOT NULL, id DESC LIMIT ?').all(limit),
    markLeadHandled: (id, handled) =>
      q(`UPDATE leads SET handled_at = ${handled ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(id),
    superadminEmails: () => q('SELECT email FROM users WHERE is_superadmin = 1').all().map((u) => u.email),
    setSuperadmin: (id, on) => q('UPDATE users SET is_superadmin = ? WHERE id = ?').run(on ? 1 : 0, id),
    allUsers: () =>
      q(`SELECT u.id, u.email, u.name, u.is_superadmin, u.totp_enabled, u.created_at,
           (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS businesses
         FROM users u ORDER BY u.id DESC`).all(),

    // ---------- two-factor authentication ----------
    setPendingTotp: (id, secret) =>
      q('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').run(secret, id),
    enableTotp: (id, backupHashes, step) =>
      q('UPDATE users SET totp_enabled = 1, totp_backup = ?, totp_last_step = ? WHERE id = ?').run(
        JSON.stringify(backupHashes),
        step,
        id,
      ),
    disableTotp: (id) =>
      q("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup = '[]', totp_last_step = 0 WHERE id = ?").run(id),
    setTotpLastStep: (id, step) => q('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, id),
    /** Consumes a backup code; returns true when it was valid and unused. */
    useBackupCode(id, code) {
      const row = q('SELECT totp_backup FROM users WHERE id = ?').get(id);
      const hashes = parseJson(row?.totp_backup, []);
      const hash = sha256(String(code ?? '').trim().toLowerCase());
      const i = hashes.indexOf(hash);
      if (i < 0) return false;
      hashes.splice(i, 1);
      q('UPDATE users SET totp_backup = ? WHERE id = ?').run(JSON.stringify(hashes), id);
      return true;
    },
    backupCodesLeft: (id) => parseJson(q('SELECT totp_backup FROM users WHERE id = ?').get(id)?.totp_backup, []).length,
    createLoginChallenge(userId, next = '') {
      const raw = token(24);
      q('INSERT INTO login_challenges (token_hash, user_id, next, expires_at) VALUES (?, ?, ?, ?)').run(
        sha256(raw),
        userId,
        next,
        sqlTime(5 * 60e3),
      );
      return raw;
    },
    loginChallenge: (raw) =>
      q('SELECT * FROM login_challenges WHERE token_hash = ? AND expires_at > ? AND attempts < 5').get(
        sha256(String(raw ?? '')),
        sqlTime(),
      ) || null,
    failLoginChallenge: (raw) =>
      q('UPDATE login_challenges SET attempts = attempts + 1 WHERE token_hash = ?').run(sha256(String(raw ?? ''))),
    deleteLoginChallenge: (raw) => q('DELETE FROM login_challenges WHERE token_hash = ?').run(sha256(String(raw ?? ''))),

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
    /** `trialDays` starts a free trial; without it the business is active right away. */
    createBusiness(userId, { name, logo_url = '', brand_color = '#4b2bd6', plan = 'basic', trialDays = 0 }) {
      const r = q(
        `INSERT INTO businesses (user_id, name, logo_url, brand_color, plan, widget_key, billing, trial_ends_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(userId, name, logo_url, brand_color, plan, token(12), trialDays ? 'trial' : 'active', trialDays ? sqlTime(trialDays * 864e5) : null);
      const id = Number(r.lastInsertRowid);
      q("INSERT INTO memberships (business_id, user_id, role) VALUES (?, ?, 'owner')").run(id, userId);
      return id;
    },
    /** Updates only whitelisted columns that are present in `f`. */
    updateBusiness(id, f) {
      const allowed = [
        'name', 'logo_url', 'brand_color', 'webhook_url', 'alert_emails', 'alert_negative',
        'weekly_report', 'sla_hours', 'widget_auto_publish', 'plan', 'last_weekly_report_at', 'followup_auto',
        'billing', 'trial_ends_at', 'trial_notice', 'billing_cycle', 'plan_request', 'invite_template',
        'ai_queries', 'ai_aliases', 'ai_site', 'ai_city', 'ai_checked_at', 'ai_plus', 'ai_plus_request',
        'paid_until', 'card_token', 'card_expiry', 'card_last4', 'auto_renew', 'pay_failures', 'next_plan', 'next_cycle',
        'monthly_report', 'last_monthly_report',
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
    setOnboardingFlag(id, flag) {
      const row = q('SELECT onboarding FROM businesses WHERE id = ?').get(id);
      const flags = parseJson(row?.onboarding, {});
      if (flags[flag]) return;
      flags[flag] = true;
      q('UPDATE businesses SET onboarding = ? WHERE id = ?').run(JSON.stringify(flags), id);
    },
    /** First-run checklist, computed from what the business has actually done. */
    onboarding(business) {
      const flags = parseJson(business.onboarding, {});
      const c = q(
        `SELECT COUNT(*) AS campaigns, SUM(google_review_url != '') AS google FROM campaigns WHERE business_id = ?`,
      ).get(business.id);
      const responses = q(
        'SELECT COUNT(*) AS n FROM responses r JOIN campaigns c ON c.id = r.campaign_id WHERE c.business_id = ?',
      ).get(business.id).n;
      const members = q('SELECT COUNT(*) AS n FROM memberships WHERE business_id = ?').get(business.id).n;
      const steps = [
        { key: 'brand', label: 'מעלים לוגו ובוחרים צבע', href: '/admin/business#logo', done: Boolean(business.logo_version || business.logo_url) },
        { key: 'campaign', label: 'יוצרים קמפיין ראשון', href: '/admin/campaigns/new', done: c.campaigns > 0 },
        { key: 'google', label: 'מחברים את הקישור לביקורות בגוגל', href: '/admin/campaigns', done: (c.google || 0) > 0 },
        { key: 'poster', label: 'מעצבים ומדפיסים שלט QR', href: '/admin/poster', done: Boolean(flags.poster) },
        { key: 'test', label: 'סורקים ומדרגים בעצמכם, לבדיקה', href: '/admin/campaigns', done: responses > 0 },
        { key: 'team', label: 'מזמינים עובד לצוות', href: '/admin/team', done: members > 1, optional: true },
      ];
      const required = steps.filter((s) => !s.optional);
      return {
        steps,
        done: required.filter((s) => s.done).length,
        total: required.length,
        complete: required.every((s) => s.done),
        dismissed: Boolean(flags.dismissed),
      };
    },
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
           reminder_hours, ask_consent, ask_staff)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        f.ask_staff ? 1 : 0,
      );
      return Number(r.lastInsertRowid);
    },
    updateCampaign(id, f) {
      q(
        `UPDATE campaigns SET name = ?, lang = ?, google_review_url = ?, extra_links = ?, threshold = ?,
           questions = ?, texts = ?, active = ?, reminder_hours = ?, ask_consent = ?, ask_staff = ?
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
        f.ask_staff ? 1 : 0,
        id,
      );
    },
    setPosterDesign: (id, design) => q('UPDATE campaigns SET poster_design = ? WHERE id = ?').run(JSON.stringify(design), id),
    setCampaignGoogleUrl: (id, url) => q('UPDATE campaigns SET google_review_url = ? WHERE id = ?').run(url, id),
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
    /** Invite created by the API; `send_at` delays the email. */
    createApiInvite(campaignId, { customer_name, phone, email, send_at, external_id }) {
      const t = token(9);
      q(`INSERT INTO invites (campaign_id, token, customer_name, phone, email, send_at, external_id, origin)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'api')`).run(campaignId, t, customer_name, phone, email, send_at, external_id);
      return t;
    },
    /** A request to the same customer (email or phone) in the last `days` days, if any. */
    recentInviteFor(campaignId, { email, phone, days = 30 }) {
      if (!email && !phone) return null;
      return (
        q(`SELECT * FROM invites WHERE campaign_id = ? AND created_at >= ?
             AND ((? != '' AND email = ?) OR (? != '' AND phone = ?)) ORDER BY id DESC LIMIT 1`).get(
          campaignId,
          sqlTime(-days * 864e5),
          email,
          email,
          phone,
          phone,
        ) || null
      );
    },
    /** Email invites whose scheduled time has come. */
    invitesDueToSend: () =>
      q(`SELECT i.*, c.business_id FROM invites i JOIN campaigns c ON c.id = i.campaign_id
         WHERE i.email != '' AND i.email_sent_at IS NULL AND i.send_at IS NOT NULL AND i.send_at <= ?
           AND i.send_at >= ? AND c.active = 1`).all(sqlTime(), sqlTime(-3 * 864e5)),
    markInviteSendAttempted: (id) => q('UPDATE invites SET send_at = NULL WHERE id = ?').run(id),

    // ---------- API keys ----------
    createApiKey(businessId, { name, createdBy }) {
      const raw = `rk_${token(24)}`;
      q('INSERT INTO api_keys (business_id, name, prefix, key_hash, created_by) VALUES (?, ?, ?, ?, ?)').run(
        businessId,
        name,
        raw.slice(0, 10),
        sha256(raw),
        createdBy,
      );
      return raw;
    },
    apiKeysFor: (businessId) =>
      q('SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE business_id = ? AND revoked_at IS NULL ORDER BY id DESC').all(businessId),
    revokeApiKey: (businessId, id) =>
      q("UPDATE api_keys SET revoked_at = datetime('now') WHERE business_id = ? AND id = ?").run(businessId, id),
    businessByApiKey(raw) {
      const key = q('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').get(sha256(String(raw ?? '')));
      if (!key) return null;
      q("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(key.id);
      return { key, business: q('SELECT * FROM businesses WHERE id = ?').get(key.business_id) };
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

    // ---------- staff (leaderboard) ----------
    staffFor: (businessId, { activeOnly = false } = {}) =>
      q(`SELECT * FROM staff WHERE business_id = ? ${activeOnly ? 'AND active = 1' : ''} ORDER BY active DESC, name`).all(businessId),
    staffMember: (id, businessId) => q('SELECT * FROM staff WHERE id = ? AND business_id = ?').get(id, businessId) || null,
    /** Staff member from a personal link (?e=code); inactive staff no longer collect ratings. */
    staffByCode: (businessId, code) =>
      code ? q('SELECT * FROM staff WHERE business_id = ? AND code = ? AND active = 1').get(businessId, String(code)) || null : null,
    createStaff(businessId, name) {
      const r = q('INSERT INTO staff (business_id, name, code) VALUES (?, ?, ?)').run(businessId, name, token(6));
      return Number(r.lastInsertRowid);
    },
    updateStaff: (id, { name, active }) =>
      q('UPDATE staff SET name = ?, active = ? WHERE id = ?').run(name, active ? 1 : 0, id),
    deleteStaff: (id) => q('DELETE FROM staff WHERE id = ?').run(id),
    setResponseStaff: (id, staffId) =>
      q('UPDATE responses SET staff_id = ? WHERE id = ? AND staff_id IS NULL').run(staffId, id),

    /**
     * Ranking of staff and branches (campaigns) for a period. The score is a
     * Bayesian average: few ratings are pulled toward the business average, so
     * one lucky 5★ does not beat thirty solid 4.8★ ratings.
     */
    leaderboard(businessId, { days = 30, minRatings = 3 } = {}) {
      const since = sqlTime(-days * 864e5);
      const overall = q(
        `SELECT COUNT(*) AS n, AVG(r.rating) AS avg FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ?`,
      ).get(businessId, since);
      const prior = overall.avg || 4;
      const WEIGHT = 5;
      const cols = `COUNT(r.id) AS responses, AVG(r.rating) AS avg_rating,
          SUM(r.sentiment = 'positive') AS positive, SUM(r.sentiment = 'negative') AS negative,
          SUM(r.review_clicks != '[]') AS reviewed, SUM(r.rating) AS rating_sum`;
      const rank = (rows) =>
        rows
          .map((x) => ({
            ...x,
            responses: x.responses || 0,
            positive: x.positive || 0,
            negative: x.negative || 0,
            reviewed: x.reviewed || 0,
            avg_rating: x.avg_rating || 0,
            score: x.responses ? ((x.rating_sum || 0) + prior * WEIGHT) / (x.responses + WEIGHT) : 0,
            ranked: (x.responses || 0) >= minRatings,
          }))
          .sort((a, b) => b.ranked - a.ranked || b.score - a.score || b.responses - a.responses);
      const staff = rank(
        q(
          `SELECT s.id, s.name, s.active, ${cols}
           FROM staff s
           LEFT JOIN responses r ON r.staff_id = s.id AND r.created_at >= ?
           WHERE s.business_id = ?
           GROUP BY s.id`,
        ).all(since, businessId),
      ).filter((x) => x.active || x.responses);
      const branches = rank(
        q(
          `SELECT c.id, c.name, c.active, ${cols}
           FROM campaigns c
           LEFT JOIN responses r ON r.campaign_id = c.id AND r.created_at >= ?
           WHERE c.business_id = ?
           GROUP BY c.id`,
        ).all(since, businessId),
      );
      const unassigned = q(
        `SELECT COUNT(*) AS n FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? AND r.staff_id IS NULL`,
      ).get(businessId, since).n;
      return { days, minRatings, staff, branches, unassigned, total: overall.n || 0, prior: overall.avg || 0 };
    },

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
        `INSERT INTO responses (campaign_id, token, visitor_id, invite_id, source, rating, sentiment, staff_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(f.campaign_id, t, f.visitor_id, f.invite_id ?? null, f.source, f.rating, f.sentiment, f.staff_id ?? null);
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
        `SELECT r.*, c.name AS campaign_name, c.questions AS campaign_questions, s.name AS staff_name
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id LEFT JOIN staff s ON s.id = r.staff_id
         WHERE r.id = ? AND c.business_id = ?`,
      ).get(id, businessId) || null,
    updateResponseStatus(id, status, notes) {
      q(`UPDATE responses SET status = ?, notes = ?, updated_at = datetime('now'),
           resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN COALESCE(resolved_at, datetime('now')) ELSE NULL END
         WHERE id = ?`).run(status, notes, status, id);
    },
    /** Gives a resolved ticket its follow-up link token (once). */
    ensureFollowupToken(id) {
      const row = q('SELECT followup_token FROM responses WHERE id = ?').get(id);
      if (row?.followup_token) return row.followup_token;
      const t = token(12);
      q('UPDATE responses SET followup_token = ? WHERE id = ?').run(t, id);
      return t;
    },
    markFollowupSent: (id) => q("UPDATE responses SET followup_sent_at = datetime('now') WHERE id = ?").run(id),
    responseByFollowupToken: (t) => q('SELECT * FROM responses WHERE followup_token = ?').get(String(t)) || null,
    /** Records the customer's answer once; a "no" reopens the ticket. */
    recordRecovery(id, yes) {
      const r = q(
        `UPDATE responses SET recovered = ?, recovered_at = datetime('now'), updated_at = datetime('now'),
           status = CASE WHEN ? = 0 THEN 'in_progress' ELSE status END,
           resolved_at = CASE WHEN ? = 0 THEN NULL ELSE resolved_at END,
           notes = CASE WHEN ? = 0 THEN trim(notes || char(10) || '[הלקוח ענה שהטיפול לא עזר, הפנייה נפתחה מחדש]') ELSE notes END
         WHERE id = ? AND recovered IS NULL`,
      ).run(yes ? 1 : 0, yes ? 1 : 0, yes ? 1 : 0, yes ? 1 : 0, id);
      return r.changes > 0;
    },
    /** Completed comments not tagged yet, only for businesses whose plan includes AI. */
    untaggedResponses: (plans, limit = 20) =>
      q(`SELECT r.id, r.comment, r.rating FROM responses r
         JOIN campaigns c ON c.id = r.campaign_id JOIN businesses b ON b.id = c.business_id
         WHERE r.completed = 1 AND r.comment != '' AND r.tagged_at IS NULL AND r.created_at >= ?
           AND b.plan IN (${plans.map(() => '?').join(',') || "''"})
         ORDER BY r.id LIMIT ?`).all(sqlTime(-30 * 864e5), ...plans, limit),
    setTags: (id, tags) =>
      q("UPDATE responses SET tags = ?, tagged_at = datetime('now') WHERE id = ?").run(JSON.stringify(tags), id),
    /** How often each topic came up, split by satisfied / unsatisfied. */
    /** How often each topic came up in surveys and Google reviews, split by satisfied / unsatisfied. */
    topicCounts(businessId, { campaignId = null, days = 30, from = null, to = null } = {}) {
      const end = to ?? Date.now();
      const start = from ?? end - days * 864e5;
      const sqlAt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
      const since = sqlAt(start);
      // Without an end date nothing is cut off, not even what arrived this second.
      const until = to == null ? '9999-12-31 23:59:59' : sqlAt(end);
      const sinceIso = new Date(start).toISOString();
      const untilIso = to == null ? '9999-12-31T23:59:59Z' : new Date(end).toISOString();
      return q(
        `SELECT topic, SUM(pos) AS positive, SUM(neg) AS negative, COUNT(*) AS total FROM (
           SELECT t.value AS topic, r.sentiment = 'positive' AS pos, r.sentiment = 'negative' AS neg
           FROM responses r JOIN campaigns c ON c.id = r.campaign_id, json_each(r.tags) t
           WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${campaignId ? 'AND c.id = ?' : ''}
           UNION ALL
           SELECT t.value, g.rating >= 4, g.rating < 4
           FROM google_reviews g JOIN google_locations l ON l.id = g.location_id, json_each(g.tags) t
           WHERE l.business_id = ? AND l.enabled = 1 AND g.create_time >= ? AND g.create_time < ? ${campaignId ? 'AND l.campaign_id = ?' : ''}
         ) GROUP BY topic ORDER BY total DESC LIMIT 10`,
      ).all(
        ...[businessId, since, until, ...(campaignId ? [campaignId] : []), businessId, sinceIso, untilIso, ...(campaignId ? [campaignId] : [])],
      );
    },
    untaggedGoogleReviews: (plans, limit = 20) =>
      q(`SELECT g.id, g.comment, g.rating FROM google_reviews g
         JOIN google_locations l ON l.id = g.location_id JOIN businesses b ON b.id = l.business_id
         WHERE g.comment != '' AND g.tagged_at IS NULL AND l.enabled = 1 AND g.create_time >= ?
           AND b.plan IN (${plans.map(() => '?').join(',') || "''"})
         ORDER BY g.id DESC LIMIT ?`).all(new Date(Date.now() - 90 * 864e5).toISOString(), ...plans, limit),
    setGoogleTags: (id, tags) =>
      q("UPDATE google_reviews SET tags = ?, tagged_at = datetime('now') WHERE id = ?").run(JSON.stringify(tags), id),

    /**
     * Google reviews over a period, for the dashboard: counts, average, star
     * distribution, per-day split and the ones waiting for a reply. Only places that are
     * followed count; a campaign filter keeps the places linked to it.
     */
    googleStats(businessId, { campaignId = null, days = 30, from = null, to = null } = {}) {
      const end = to ?? Date.now();
      const start = from ?? end - days * 864e5;
      const iso = (ms) => new Date(ms).toISOString();
      const where = `l.business_id = ? AND l.enabled = 1 ${campaignId ? 'AND l.campaign_id = ?' : ''}`;
      const args = [businessId, ...(campaignId ? [campaignId] : [])];
      const fromIso = iso(start);
      const toIso = to == null ? '9999-12-31T23:59:59Z' : iso(end);
      const period = q(
        `SELECT COUNT(*) AS n, AVG(g.rating) AS avg, SUM(g.rating >= 4) AS positive, SUM(g.rating < 4) AS negative,
                SUM(g.rating = 1) AS s1, SUM(g.rating = 2) AS s2, SUM(g.rating = 3) AS s3, SUM(g.rating = 4) AS s4, SUM(g.rating = 5) AS s5
         FROM google_reviews g JOIN google_locations l ON l.id = g.location_id WHERE ${where} AND g.create_time >= ? AND g.create_time < ?`,
      ).get(...args, fromIso, toIso);
      const prev = q(
        `SELECT COUNT(*) AS n, AVG(g.rating) AS avg FROM google_reviews g JOIN google_locations l ON l.id = g.location_id
         WHERE ${where} AND g.create_time >= ? AND g.create_time < ?`,
      ).get(...args, iso(start - (end - start)), fromIso);
      const daily = q(
        `SELECT substr(g.create_time, 1, 10) AS d, COUNT(*) AS n, SUM(g.rating < 4) AS neg
         FROM google_reviews g JOIN google_locations l ON l.id = g.location_id WHERE ${where} AND g.create_time >= ? AND g.create_time < ? GROUP BY d`,
      ).all(...args, fromIso, toIso);
      const waiting = q(
        `SELECT g.*, l.title AS location_title FROM google_reviews g JOIN google_locations l ON l.id = g.location_id
         WHERE ${where} AND g.reply = '' AND g.rating <= 3 ORDER BY g.create_time DESC LIMIT 5`,
      ).all(...args);
      const unanswered = q(
        `SELECT COUNT(*) AS n FROM google_reviews g JOIN google_locations l ON l.id = g.location_id WHERE ${where} AND g.reply = ''`,
      ).get(...args).n;
      const overall = q(
        `SELECT SUM(l.total_reviews) AS total, SUM(l.avg_rating * l.total_reviews) AS weighted FROM google_locations l
         WHERE ${where} AND l.total_reviews > 0`,
      ).get(...args);
      return {
        total: overall.total || 0,
        avg: overall.total ? overall.weighted / overall.total : 0,
        unanswered,
        count: period.n,
        avgPeriod: period.avg || 0,
        positive: period.positive || 0,
        negative: period.negative || 0,
        distribution: [period.s1, period.s2, period.s3, period.s4, period.s5].map((v) => v || 0),
        prevCount: prev.n,
        prevAvg: prev.avg || 0,
        daily: new Map(daily.map((r) => [r.d, { n: r.n, neg: r.neg || 0 }])),
        waiting,
      };
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

    // ---------- agencies ----------
    createAgency(f) {
      const r = q(
        `INSERT INTO agencies (name, brand_name, brand_color, logo_url, custom_domain, default_plan, max_clients)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(f.name, f.brand_name || f.name, f.brand_color || '#4b2bd6', f.logo_url || '', f.custom_domain || null, f.default_plan || 'pro', f.max_clients ?? 25);
      return Number(r.lastInsertRowid);
    },
    updateAgency(id, f) {
      const allowed = ['name', 'brand_name', 'brand_color', 'logo_url', 'custom_domain', 'default_plan', 'max_clients'];
      const keys = allowed.filter((k) => f[k] !== undefined);
      if (!keys.length) return;
      q(`UPDATE agencies SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), id);
    },
    agencyById: (id) => q('SELECT * FROM agencies WHERE id = ?').get(id) || null,
    agencyByDomain: (host) =>
      host ? q('SELECT * FROM agencies WHERE custom_domain = ?').get(String(host).toLowerCase()) || null : null,
    allAgencies: () =>
      q(`SELECT a.*, (SELECT COUNT(*) FROM businesses b WHERE b.agency_id = a.id) AS clients,
           (SELECT COUNT(*) FROM agency_members m WHERE m.agency_id = a.id) AS members
         FROM agencies a ORDER BY a.id DESC`).all(),
    agenciesForUser: (userId) =>
      q(`SELECT a.* FROM agencies a JOIN agency_members m ON m.agency_id = a.id WHERE m.user_id = ? ORDER BY a.id`).all(userId),
    isAgencyMember: (agencyId, userId) =>
      Boolean(q('SELECT 1 FROM agency_members WHERE agency_id = ? AND user_id = ?').get(agencyId, userId)),
    addAgencyMember: (agencyId, userId) =>
      q('INSERT OR IGNORE INTO agency_members (agency_id, user_id) VALUES (?, ?)').run(agencyId, userId),
    removeAgencyMember: (agencyId, userId) =>
      q('DELETE FROM agency_members WHERE agency_id = ? AND user_id = ?').run(agencyId, userId),
    agencyMembers: (agencyId) =>
      q(`SELECT u.id, u.name, u.email FROM agency_members m JOIN users u ON u.id = m.user_id WHERE m.agency_id = ?`).all(agencyId),
    setBusinessAgency: (businessId, agencyId) =>
      q('UPDATE businesses SET agency_id = ? WHERE id = ?').run(agencyId || null, businessId),
    /** Client businesses with the numbers an agency checks every morning. */
    agencyClients(agencyId) {
      return q(
        `SELECT b.id, b.name, b.plan, b.created_at,
           (SELECT COUNT(*) FROM responses r JOIN campaigns c ON c.id = r.campaign_id
              WHERE c.business_id = b.id AND r.created_at >= datetime('now', 'start of month')) AS month_responses,
           (SELECT AVG(r.rating) FROM responses r JOIN campaigns c ON c.id = r.campaign_id
              WHERE c.business_id = b.id AND r.created_at >= datetime('now', '-30 days')) AS avg_rating,
           (SELECT COUNT(*) FROM responses r JOIN campaigns c ON c.id = r.campaign_id
              WHERE c.business_id = b.id AND r.sentiment = 'negative' AND r.status = 'new') AS open_issues,
           (SELECT COUNT(*) FROM responses r JOIN campaigns c ON c.id = r.campaign_id
              WHERE c.business_id = b.id AND r.sentiment = 'negative' AND r.status = 'new' AND b.sla_hours > 0
                AND r.created_at <= datetime('now', '-' || b.sla_hours || ' hours')) AS overdue
         FROM businesses b WHERE b.agency_id = ? ORDER BY b.name`,
      ).all(agencyId);
    },

    // ---------- app settings & push subscriptions ----------
    setting: (key) => q('SELECT value FROM app_settings WHERE key = ?').get(key)?.value ?? null,
    setSetting: (key, value) =>
      q('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
    savePushSubscription(userId, { endpoint, p256dh, auth, userAgent = '' }) {
      q(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`).run(
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent,
      );
    },
    deletePushSubscription: (endpoint) => q('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint),
    pushSubscriptionsForUser: (userId) => q('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId),
    /** Devices of the owners and managers of a business. */
    pushSubscriptionsForBusiness: (businessId) =>
      q(`SELECT p.* FROM push_subscriptions p JOIN memberships m ON m.user_id = p.user_id
         WHERE m.business_id = ? AND m.role IN ('owner', 'manager')`).all(businessId),

    // ---------- payments ----------
    createPayment(businessId, { kind, plan, cycle, amount, createdBy = '' }) {
      return Number(
        q('INSERT INTO payments (business_id, kind, plan, cycle, amount, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(
          businessId, kind, plan, cycle, amount, createdBy,
        ).lastInsertRowid,
      );
    },
    paymentById: (id) => q('SELECT * FROM payments WHERE id = ?').get(id) || null,
    setPaymentPage: (id, pageId) => q('UPDATE payments SET page_id = ? WHERE id = ?').run(pageId, id),
    /** Marks a pending payment paid or failed; false if it was already settled (a repeat). */
    settlePayment(id, { status, transactionId = null, error = null }) {
      const r = q(`UPDATE payments SET status = ?, transaction_id = ?, error = ?, paid_at = CASE WHEN ? = 'paid' THEN datetime('now') END
                   WHERE id = ? AND status = 'pending'`).run(status, transactionId, error, status, id);
      return r.changes > 0;
    },
    paymentsFor: (businessId, limit = 24) => q('SELECT * FROM payments WHERE business_id = ? ORDER BY id DESC LIMIT ?').all(businessId, limit),
    /** Card subscriptions whose paid period is over. */
    renewalsDue: (now = sqlTime()) =>
      q(`SELECT b.*, u.email AS owner_email FROM businesses b LEFT JOIN users u ON u.id = b.user_id
         WHERE b.billing = 'active' AND b.card_token IS NOT NULL AND b.paid_until IS NOT NULL AND b.paid_until <= ?`).all(now),

    // ---------- WhatsApp invites ----------
    setInviteWhatsApp(id, f) {
      const keys = ['wa_message_id', 'wa_status', 'wa_error', 'wa_send_at', 'wa_sent_at'].filter((k) => f[k] !== undefined);
      if (keys.length) q(`UPDATE invites SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => f[k]), id);
    },
    /** A delivery update from WhatsApp; statuses only move forward. */
    updateWhatsAppStatus(messageId, status, error = null) {
      const order = { sent: 1, delivered: 2, read: 3, failed: 4 };
      const invite = q('SELECT id, wa_status FROM invites WHERE wa_message_id = ?').get(messageId);
      if (!invite || (order[invite.wa_status] || 0) >= (order[status] || 0)) return false;
      q('UPDATE invites SET wa_status = ?, wa_error = ? WHERE id = ?').run(status, error, invite.id);
      return true;
    },
    /** WhatsApp invites the API scheduled for later. */
    whatsAppDue: () =>
      q(`SELECT i.*, c.business_id FROM invites i JOIN campaigns c ON c.id = i.campaign_id
         WHERE i.wa_send_at IS NOT NULL AND i.wa_send_at <= ? AND i.wa_send_at >= ? AND c.active = 1`).all(sqlTime(), sqlTime(-3 * 864e5)),
    /** WhatsApp messages a business sent this calendar month (UTC), for the plan's quota. */
    whatsAppSentThisMonth: (businessId) =>
      q(`SELECT COUNT(*) AS n FROM invites i JOIN campaigns c ON c.id = i.campaign_id
         WHERE c.business_id = ? AND i.wa_sent_at >= strftime('%Y-%m-01 00:00:00', 'now')`).get(businessId).n,

    // ---------- competitors ----------
    competitorsFor: (businessId) => q('SELECT * FROM competitors WHERE business_id = ? ORDER BY id').all(businessId),
    competitorById: (businessId, id) => q('SELECT * FROM competitors WHERE business_id = ? AND id = ?').get(businessId, id) || null,
    addCompetitor(businessId, { dataId = '', placeId = '', title = '', address = '' }) {
      const found = q('SELECT * FROM competitors WHERE business_id = ? AND ((data_id != \'\' AND data_id = ?) OR (place_id != \'\' AND place_id = ?))').get(
        businessId, dataId, placeId,
      );
      if (found) return found;
      const id = q('INSERT INTO competitors (business_id, data_id, place_id, title, address) VALUES (?, ?, ?, ?, ?)').run(
        businessId, dataId, placeId, title, address,
      ).lastInsertRowid;
      return q('SELECT * FROM competitors WHERE id = ?').get(id);
    },
    deleteCompetitor: (businessId, id) => q('DELETE FROM competitors WHERE business_id = ? AND id = ?').run(businessId, id),
    updateCompetitor(id, f) {
      const keys = ['title', 'address', 'rating', 'total', 'recent30', 'recent_capped', 'checked_at', 'error'].filter((k) => f[k] !== undefined);
      if (keys.length) q(`UPDATE competitors SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => (typeof f[k] === 'boolean' ? Number(f[k]) : f[k])), id);
    },
    /** Competitors not checked for `hours`, of businesses that aren't paused. */
    competitorsDue: (hours) =>
      q(`SELECT c.* FROM competitors c JOIN businesses b ON b.id = c.business_id
         WHERE b.billing != 'paused' AND (c.checked_at IS NULL OR c.checked_at <= ?) ORDER BY c.checked_at IS NOT NULL, c.checked_at`).all(sqlTime(-hours * 3600e3)),
    /** One rating / count reading a day, for trends ("competitor" or "location"). */
    snapshot: (kind, refId, { rating, total }, day = sqlTime().slice(0, 10)) =>
      q('INSERT OR REPLACE INTO place_snapshots (kind, ref_id, day, rating, total) VALUES (?, ?, ?, ?, ?)').run(kind, refId, day, rating, total),
    /** The latest reading on or before `day`, else null. */
    snapshotOnOrBefore: (kind, refId, day) =>
      q('SELECT * FROM place_snapshots WHERE kind = ? AND ref_id = ? AND day <= ? ORDER BY day DESC LIMIT 1').get(kind, refId, day) || null,
    /** Google reviews the business's places got in [fromIso, toIso). */
    googleReviewCount: (locationId, fromIso, toIso = '9999-12-31T23:59:59Z') =>
      q('SELECT COUNT(*) AS n FROM google_reviews WHERE location_id = ? AND create_time >= ? AND create_time < ?').get(locationId, fromIso, toIso).n,

    // ---------- profile health ----------
    saveAudit(businessId, locationId, { score = 0, profile = {}, items = [], tips = '', error = null }) {
      q('INSERT INTO profile_audits (business_id, location_id, score, profile, items, tips, error) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        businessId, locationId, score, JSON.stringify(profile), JSON.stringify(items), tips, error,
      );
    },
    /** The latest check of each followed place, and the score a month or more before it. */
    latestAudits(businessId) {
      return q(`SELECT a.*, l.title AS location_title,
                  (SELECT p.score FROM profile_audits p WHERE p.location_id = a.location_id AND p.error IS NULL AND p.run_at <= datetime(a.run_at, '-25 days')
                   ORDER BY p.id DESC LIMIT 1) AS prev_score
                FROM profile_audits a JOIN google_locations l ON l.id = a.location_id
                WHERE a.business_id = ? AND l.enabled = 1
                  AND a.id = (SELECT MAX(id) FROM profile_audits WHERE location_id = a.location_id)
                ORDER BY l.id`).all(businessId);
    },
    /** Followed places not checked for `days`, of businesses that aren't paused. */
    auditsDue: (days) =>
      q(`SELECT l.* FROM google_locations l JOIN businesses b ON b.id = l.business_id
         WHERE l.enabled = 1 AND b.billing != 'paused'
           AND COALESCE((SELECT MAX(run_at) FROM profile_audits a WHERE a.location_id = l.id), '') < datetime('now', ?)`).all(`-${Number(days) || 7} days`),

    // ---------- weekly tasks ----------
    tasksDone: (businessId, week) => q('SELECT task FROM weekly_tasks_done WHERE business_id = ? AND week = ?').all(businessId, week).map((r) => r.task),
    markTaskDone: (businessId, week, task) => q('INSERT OR IGNORE INTO weekly_tasks_done (business_id, week, task) VALUES (?, ?, ?)').run(businessId, week, task),

    // ---------- monthly report ----------
    monthlyReport: (businessId, month) => q('SELECT * FROM monthly_reports WHERE business_id = ? AND month = ?').get(businessId, month) || null,
    saveMonthlyReport: (businessId, month, summary) =>
      q('INSERT OR REPLACE INTO monthly_reports (business_id, month, summary) VALUES (?, ?, ?)').run(businessId, month, summary),
    /** The best and the worst things customers wrote in [from, to): survey comments and Google reviews. */
    highlights(businessId, { from, to, limit = 3 }) {
      const sqlAt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
      const iso = (ms) => new Date(ms).toISOString();
      const pick = (good) =>
        q(`SELECT * FROM (
             SELECT r.comment AS text, r.rating, r.customer_name AS name, 'survey' AS source, r.created_at AS at
             FROM responses r JOIN campaigns c ON c.id = r.campaign_id
             WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? AND length(r.comment) >= 15 AND r.rating ${good ? '>= 5' : '<= 2'}
             UNION ALL
             SELECT g.comment, g.rating, g.reviewer, 'google', g.create_time
             FROM google_reviews g JOIN google_locations l ON l.id = g.location_id
             WHERE l.business_id = ? AND l.enabled = 1 AND g.create_time >= ? AND g.create_time < ? AND length(g.comment) >= 15 AND g.rating ${good ? '>= 5' : '<= 2'}
           ) ORDER BY length(text) BETWEEN 40 AND 280 DESC, at DESC LIMIT ?`)
          .all(businessId, sqlAt(from), sqlAt(to), businessId, iso(from), iso(to), limit * 4)
          // The same words twice (a survey comment also posted on Google) show once.
          .filter((r, i, all) => all.findIndex((x) => x.text.trim() === r.text.trim()) === i)
          .slice(0, limit);
      return { good: pick(true), bad: pick(false) };
    },
    /** Businesses whose report for `month` wasn't sent yet. */
    monthlyReportsDue: (month) =>
      q("SELECT * FROM businesses WHERE monthly_report = 1 AND billing != 'paused' AND (last_monthly_report IS NULL OR last_monthly_report < ?)").all(month),

    // ---------- outbox ----------
    recentOutbox: (limit = 100) => q('SELECT * FROM outbox ORDER BY id DESC LIMIT ?').all(limit),
    listResponses(businessId, { campaignId, staffId, sentiment, status, search, overdue, consent, tag, limit = 100, offset = 0 } = {}) {
      const where = ['c.business_id = ?'];
      const args = [businessId];
      if (staffId) {
        where.push('r.staff_id = ?');
        args.push(staffId);
      }
      if (tag) {
        where.push('EXISTS (SELECT 1 FROM json_each(r.tags) WHERE value = ?)');
        args.push(tag);
      }
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
      const sql = `SELECT r.*, c.name AS campaign_name, s.name AS staff_name,
          (r.sentiment = 'negative' AND r.status = 'new' AND b.sla_hours > 0
            AND r.created_at <= datetime('now', '-' || b.sla_hours || ' hours')) AS overdue
        FROM responses r
        JOIN campaigns c ON c.id = r.campaign_id JOIN businesses b ON b.id = c.business_id
        LEFT JOIN staff s ON s.id = r.staff_id
        WHERE ${where.join(' AND ')}
        ORDER BY r.id DESC LIMIT ? OFFSET ?`;
      return q(sql).all(...args, limit, offset);
    },

    // ---------- analytics ----------
    /** Headline numbers for the window [now - fromDays, now - toDays), used for trends. */
    periodSummary(businessId, { campaignId = null, fromDays, toDays = 0, from = null, to = null }) {
      const sqlAt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
      const args = [businessId, from != null ? sqlAt(from) : sqlTime(-fromDays * 864e5), to != null ? sqlAt(to) : sqlTime(-toDays * 864e5)];
      const cf = campaignId ? 'AND c.id = ?' : '';
      if (campaignId) args.push(campaignId);
      const r = q(
        `SELECT COUNT(*) AS responses, AVG(r.rating) AS avg_rating, SUM(r.review_clicks != '[]') AS reviewed
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${cf}`,
      ).get(...args);
      return { responses: r.responses || 0, avgRating: r.avg_rating || 0, reviewed: r.reviewed || 0 };
    },

    /** Everything the dashboard shows about surveys, for [from, to) (ms) or the last `days`. */
    stats(businessId, { campaignId = null, days = 30, from = null, to = null } = {}) {
      const end = to ?? Date.now();
      const start = from ?? end - days * 864e5;
      const sqlAt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
      const since = sqlAt(start);
      // Without an end date nothing is cut off, not even what arrived this second.
      const until = to == null ? '9999-12-31 23:59:59' : sqlAt(end);
      const cFilter = campaignId ? 'AND c.id = ?' : '';
      const base = campaignId ? [businessId, since, until, campaignId] : [businessId, since, until];

      const ev = q(
        `SELECT e.type, COUNT(*) AS n, COUNT(DISTINCT e.visitor_id) AS uniq
         FROM events e JOIN campaigns c ON c.id = e.campaign_id
         WHERE c.business_id = ? AND e.created_at >= ? AND e.created_at < ? ${cFilter}
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
                SUM(r.recovered = 1) AS recovered_yes,
                SUM(r.recovered IS NOT NULL) AS recovered_answered,
                AVG(CASE WHEN r.resolved_at IS NOT NULL
                    THEN (julianday(r.resolved_at) - julianday(r.created_at)) * 24 END) AS avg_resolve_hours
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${cFilter}`,
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
         WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${cFilter} GROUP BY r.rating`,
      ).all(...base)) {
        if (row.rating >= 1 && row.rating <= 5) dist[row.rating - 1] = row.n;
      }

      const daily = new Map();
      for (let t = Date.parse(since.slice(0, 10)); t < end; t += 864e5) {
        const d = new Date(t).toISOString().slice(0, 10);
        daily.set(d, { date: d, scans: 0, responses: 0, negative: 0 });
      }
      for (const row of q(
        `SELECT substr(e.created_at, 1, 10) AS d, COUNT(*) AS n FROM events e
         JOIN campaigns c ON c.id = e.campaign_id
         WHERE c.business_id = ? AND e.created_at >= ? AND e.created_at < ? ${cFilter} AND e.type = 'scan' GROUP BY d`,
      ).all(...base)) {
        if (daily.has(row.d)) daily.get(row.d).scans = row.n;
      }
      for (const row of q(
        `SELECT substr(r.created_at, 1, 10) AS d, COUNT(*) AS n, SUM(r.sentiment = 'negative') AS neg
         FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${cFilter} GROUP BY d`,
      ).all(...base)) {
        if (daily.has(row.d)) Object.assign(daily.get(row.d), { responses: row.n, negative: row.neg });
      }

      const sources = q(
        `SELECT e.source, COUNT(*) AS scans FROM events e JOIN campaigns c ON c.id = e.campaign_id
         WHERE c.business_id = ? AND e.created_at >= ? AND e.created_at < ? ${cFilter} AND e.type = 'scan'
         GROUP BY e.source ORDER BY scans DESC LIMIT 10`,
      ).all(...base);

      // NPS across every nps-type question answered in range.
      let promoters = 0;
      let detractors = 0;
      let npsCount = 0;
      const rows = q(
        `SELECT r.answers, c.questions FROM responses r JOIN campaigns c ON c.id = r.campaign_id
         WHERE c.business_id = ? AND r.created_at >= ? AND r.created_at < ? ${cFilter} AND r.completed = 1`,
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
        recoveredYes: agg.recovered_yes || 0,
        recoveredAnswered: agg.recovered_answered || 0,
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
