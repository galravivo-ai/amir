import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL DEFAULT '',
  brand_color TEXT NOT NULL DEFAULT '#4b2bd6',
  webhook_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  lang TEXT NOT NULL DEFAULT 'he',
  google_review_url TEXT NOT NULL DEFAULT '',
  extra_links TEXT NOT NULL DEFAULT '[]',
  threshold INTEGER NOT NULL DEFAULT 4,
  questions TEXT NOT NULL DEFAULT '[]',
  texts TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  opened_at TEXT,
  responded_at TEXT
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  visitor_id TEXT NOT NULL DEFAULT '',
  invite_id INTEGER REFERENCES invites(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL,
  sentiment TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  comment TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  wants_contact INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  review_clicks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  visitor_id TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_campaign ON events(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_responses_campaign ON responses(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_business ON campaigns(business_id);
`;

// Each entry upgrades the schema by one version (tracked in PRAGMA user_version).
// Never edit an entry that has shipped; append a new one instead.
const MIGRATIONS = [
  // v1: teams, email, SLA, widget, AI, plans
  `
  ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE memberships (
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (business_id, user_id)
  );
  INSERT OR IGNORE INTO memberships (business_id, user_id, role) SELECT id, user_id, 'owner' FROM businesses;
  CREATE INDEX idx_memberships_user ON memberships(user_id);

  CREATE TABLE team_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    accepted_at TEXT
  );

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  ALTER TABLE businesses ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
  ALTER TABLE businesses ADD COLUMN alert_emails TEXT NOT NULL DEFAULT '';
  ALTER TABLE businesses ADD COLUMN alert_negative INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE businesses ADD COLUMN weekly_report INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE businesses ADD COLUMN last_weekly_report_at TEXT;
  ALTER TABLE businesses ADD COLUMN sla_hours INTEGER NOT NULL DEFAULT 24;
  ALTER TABLE businesses ADD COLUMN widget_key TEXT;
  ALTER TABLE businesses ADD COLUMN widget_auto_publish INTEGER NOT NULL DEFAULT 0;
  CREATE UNIQUE INDEX idx_businesses_widget ON businesses(widget_key);

  ALTER TABLE campaigns ADD COLUMN reminder_hours INTEGER NOT NULL DEFAULT 48;
  ALTER TABLE campaigns ADD COLUMN ask_consent INTEGER NOT NULL DEFAULT 1;

  ALTER TABLE invites ADD COLUMN email TEXT NOT NULL DEFAULT '';
  ALTER TABLE invites ADD COLUMN email_sent_at TEXT;
  ALTER TABLE invites ADD COLUMN reminder_sent_at TEXT;

  ALTER TABLE responses ADD COLUMN publish_consent INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE responses ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE responses ADD COLUMN resolved_at TEXT;
  ALTER TABLE responses ADD COLUMN sla_alerted_at TEXT;
  ALTER TABLE responses ADD COLUMN ai_draft TEXT NOT NULL DEFAULT '';

  CREATE TABLE ai_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    days INTEGER NOT NULL,
    response_count INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_outbox_created ON outbox(created_at);
  `,
  // v2: uploaded logos (kept out of the businesses row so it stays light)
  `
  CREATE TABLE business_logos (
    business_id INTEGER PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ALTER TABLE businesses ADD COLUMN logo_version TEXT;
  ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
  `,
  // v3: new brand. Businesses still on the old default color move to the new purple.
  `
  UPDATE businesses SET brand_color = '#4b2bd6' WHERE lower(brand_color) = '#2563eb';
  `,
  // v4: two-factor authentication
  `
  ALTER TABLE users ADD COLUMN totp_secret TEXT;
  ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN totp_backup TEXT NOT NULL DEFAULT '[]';
  CREATE TABLE login_challenges (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    next TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL
  );
  `,
  // v5: onboarding checklist flags
  `
  ALTER TABLE businesses ADD COLUMN onboarding TEXT NOT NULL DEFAULT '{}';
  `,
  // v6: close the loop with unhappy customers
  `
  ALTER TABLE responses ADD COLUMN followup_token TEXT;
  ALTER TABLE responses ADD COLUMN followup_sent_at TEXT;
  ALTER TABLE responses ADD COLUMN recovered INTEGER;
  ALTER TABLE responses ADD COLUMN recovered_at TEXT;
  CREATE UNIQUE INDEX idx_responses_followup ON responses(followup_token);
  ALTER TABLE businesses ADD COLUMN followup_auto INTEGER NOT NULL DEFAULT 1;
  `,
  // v7: public API for automatic survey requests
  `
  CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    revoked_at TEXT
  );
  ALTER TABLE invites ADD COLUMN send_at TEXT;
  ALTER TABLE invites ADD COLUMN external_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE invites ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';
  CREATE INDEX idx_invites_campaign_email ON invites(campaign_id, email);
  CREATE INDEX idx_invites_campaign_phone ON invites(campaign_id, phone);
  CREATE INDEX idx_invites_send_at ON invites(send_at);
  `,
  // v8: AI topic tags on comments
  `
  ALTER TABLE responses ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE responses ADD COLUMN tagged_at TEXT;
  CREATE INDEX idx_responses_untagged ON responses(tagged_at, completed);
  `,
  // v9: installable app + push notifications
  `
  CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_push_user ON push_subscriptions(user_id);
  `,
  // v10: agencies (resellers managing many client businesses) with white-label branding
  `
  CREATE TABLE agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand_name TEXT NOT NULL DEFAULT '',
    brand_color TEXT NOT NULL DEFAULT '#4b2bd6',
    logo_url TEXT NOT NULL DEFAULT '',
    custom_domain TEXT,
    default_plan TEXT NOT NULL DEFAULT 'pro',
    max_clients INTEGER NOT NULL DEFAULT 25,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX idx_agencies_domain ON agencies(custom_domain);
  CREATE TABLE agency_members (
    agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agency_id, user_id)
  );
  ALTER TABLE businesses ADD COLUMN agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL;
  CREATE INDEX idx_businesses_agency ON businesses(agency_id);
  `,
  // v11: staff (employees) for the leaderboard; a campaign can ask "who served you?"
  `
  CREATE TABLE staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_staff_business ON staff(business_id);
  ALTER TABLE responses ADD COLUMN staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;
  CREATE INDEX idx_responses_staff ON responses(staff_id);
  ALTER TABLE campaigns ADD COLUMN ask_staff INTEGER NOT NULL DEFAULT 0;
  `,
  // v12: paid plans with a free trial; businesses can ask for a plan
  `
  ALTER TABLE businesses ADD COLUMN billing TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE businesses ADD COLUMN trial_ends_at TEXT;
  ALTER TABLE businesses ADD COLUMN trial_notice TEXT;
  ALTER TABLE businesses ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
  ALTER TABLE businesses ADD COLUMN plan_request TEXT;
  UPDATE businesses SET plan = 'basic' WHERE plan NOT IN ('basic', 'pro', 'business');
  `,
  // v13: quote requests from the website (agencies, chains above 10 branches)
  `
  CREATE TABLE leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    handled_at TEXT
  );
  `,
  // v14: Google Business Profile connection, locations and reviews
  `
  CREATE TABLE google_connections (
    business_id INTEGER PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    email TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expires_at INTEGER NOT NULL DEFAULT 0,
    connected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    last_sync_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE google_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    place_id TEXT NOT NULL DEFAULT '',
    review_url TEXT NOT NULL DEFAULT '',
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    avg_rating REAL,
    total_reviews INTEGER,
    synced_at TEXT,
    UNIQUE (business_id, name)
  );
  CREATE TABLE google_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES google_locations(id) ON DELETE CASCADE,
    name TEXT NOT NULL UNIQUE,
    reviewer TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    create_time TEXT NOT NULL DEFAULT '',
    update_time TEXT NOT NULL DEFAULT '',
    reply TEXT NOT NULL DEFAULT '',
    reply_time TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    alerted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_google_reviews_location ON google_reviews(location_id, create_time);
  `,
  // v15: Google places followed by link (through SerpApi), next to the Business Profile connection
  `
  ALTER TABLE google_locations ADD COLUMN source TEXT NOT NULL DEFAULT 'gbp';
  ALTER TABLE google_locations ADD COLUMN data_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE google_locations ADD COLUMN sync_error TEXT;
  ALTER TABLE google_reviews ADD COLUMN link TEXT NOT NULL DEFAULT '';
  `,
  // v16: AI topic tags on Google reviews, so the dashboard covers them too
  `
  ALTER TABLE google_reviews ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE google_reviews ADD COLUMN tagged_at TEXT;
  `,
  // v17: the QR poster design chosen for each campaign
  `
  ALTER TABLE campaigns ADD COLUMN poster_design TEXT NOT NULL DEFAULT '{}';
  `,
  // v18: the business's own wording for the WhatsApp rating request
  `
  ALTER TABLE businesses ADD COLUMN invite_template TEXT NOT NULL DEFAULT '';
  `,
  // v19: posts to Google Business Profile, and the photos they carry
  `
  CREATE TABLE google_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    topic TEXT NOT NULL DEFAULT 'STANDARD',
    summary TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    starts_at TEXT NOT NULL DEFAULT '',
    ends_at TEXT NOT NULL DEFAULT '',
    coupon TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT '',
    cta_type TEXT NOT NULL DEFAULT '',
    cta_url TEXT NOT NULL DEFAULT '',
    image_token TEXT NOT NULL DEFAULT '',
    results TEXT NOT NULL DEFAULT '[]',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_google_posts_business ON google_posts(business_id, id);
  CREATE TABLE post_images (
    token TEXT PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  // v20: AI visibility: the questions to ask AI engines, and what they answered
  `
  ALTER TABLE businesses ADD COLUMN ai_queries TEXT NOT NULL DEFAULT '[]';
  ALTER TABLE businesses ADD COLUMN ai_aliases TEXT NOT NULL DEFAULT '';
  ALTER TABLE businesses ADD COLUMN ai_site TEXT NOT NULL DEFAULT '';
  ALTER TABLE businesses ADD COLUMN ai_city TEXT NOT NULL DEFAULT '';
  ALTER TABLE businesses ADD COLUMN ai_checked_at TEXT;
  CREATE TABLE ai_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    run_at TEXT NOT NULL,
    query TEXT NOT NULL,
    engine TEXT NOT NULL,
    mentioned INTEGER NOT NULL DEFAULT 0,
    cited INTEGER NOT NULL DEFAULT 0,
    snippet TEXT NOT NULL DEFAULT '',
    cited_link TEXT NOT NULL DEFAULT '',
    sources TEXT NOT NULL DEFAULT '[]',
    error TEXT
  );
  CREATE INDEX idx_ai_checks_business ON ai_checks(business_id, run_at);
  `,
  // v21: the "AI visibility plus" add-on, and an owner's request for it
  `
  ALTER TABLE businesses ADD COLUMN ai_plus INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE businesses ADD COLUMN ai_plus_request TEXT;
  `,
  // v22: card payments (Cardcom) with automatic renewal, and WhatsApp API invites
  `
  ALTER TABLE businesses ADD COLUMN paid_until TEXT;
  ALTER TABLE businesses ADD COLUMN card_token TEXT;
  ALTER TABLE businesses ADD COLUMN card_expiry TEXT;
  ALTER TABLE businesses ADD COLUMN card_last4 TEXT;
  ALTER TABLE businesses ADD COLUMN auto_renew INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE businesses ADD COLUMN pay_failures INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE businesses ADD COLUMN next_plan TEXT;
  ALTER TABLE businesses ADD COLUMN next_cycle TEXT;
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    plan TEXT NOT NULL,
    cycle TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    page_id TEXT,
    transaction_id TEXT,
    error TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT
  );
  CREATE INDEX idx_payments_business ON payments(business_id, id);
  ALTER TABLE invites ADD COLUMN wa_message_id TEXT;
  ALTER TABLE invites ADD COLUMN wa_status TEXT;
  ALTER TABLE invites ADD COLUMN wa_error TEXT;
  ALTER TABLE invites ADD COLUMN wa_send_at TEXT;
  ALTER TABLE invites ADD COLUMN wa_sent_at TEXT;
  CREATE INDEX idx_invites_wa_message ON invites(wa_message_id);
  `,
  // v23: competitors followed through SerpApi, daily rating snapshots, monthly reports
  `
  CREATE TABLE competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    data_id TEXT NOT NULL DEFAULT '',
    place_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    rating REAL,
    total INTEGER,
    recent30 INTEGER,
    recent_capped INTEGER NOT NULL DEFAULT 0,
    checked_at TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_competitors_business ON competitors(business_id);
  CREATE TABLE place_snapshots (
    kind TEXT NOT NULL,
    ref_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    rating REAL,
    total INTEGER,
    PRIMARY KEY (kind, ref_id, day)
  );
  CREATE TABLE monthly_reports (
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (business_id, month)
  );
  ALTER TABLE businesses ADD COLUMN monthly_report INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE businesses ADD COLUMN last_monthly_report TEXT;
  `,
  // v24: Google profile health checks, and weekly tasks marked done
  `
  CREATE TABLE profile_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES google_locations(id) ON DELETE CASCADE,
    run_at TEXT NOT NULL DEFAULT (datetime('now')),
    score INTEGER NOT NULL DEFAULT 0,
    profile TEXT NOT NULL DEFAULT '{}',
    items TEXT NOT NULL DEFAULT '[]',
    tips TEXT NOT NULL DEFAULT '',
    error TEXT
  );
  CREATE INDEX idx_profile_audits_location ON profile_audits(location_id, id);
  CREATE TABLE weekly_tasks_done (
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    week TEXT NOT NULL,
    task TEXT NOT NULL,
    PRIMARY KEY (business_id, week, task)
  );
  `,
  // v25: map rank tracking (a grid of searches around each place)
  `
  ALTER TABLE google_locations ADD COLUMN lat REAL;
  ALTER TABLE google_locations ADD COLUMN lng REAL;
  CREATE TABLE rank_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES google_locations(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    radius_m INTEGER NOT NULL DEFAULT 1000,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_rank_keywords_business ON rank_keywords(business_id);
  CREATE TABLE rank_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword_id INTEGER NOT NULL REFERENCES rank_keywords(id) ON DELETE CASCADE,
    run_at TEXT NOT NULL DEFAULT (datetime('now')),
    avg_rank REAL,
    found INTEGER NOT NULL DEFAULT 0,
    points TEXT NOT NULL DEFAULT '[]',
    leaders TEXT NOT NULL DEFAULT '[]',
    error TEXT
  );
  CREATE INDEX idx_rank_checks_keyword ON rank_checks(keyword_id, id);
  `,
  // v26: monthly usage of the actions a user starts (AI drafts, checks on demand)
  `
  CREATE TABLE usage_counts (
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    action TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (business_id, month, action)
  );
  `,
  // v27: what each business costs: SerpApi searches and AI requests per month
  `
  CREATE TABLE api_usage (
    business_id INTEGER NOT NULL DEFAULT 0,
    month TEXT NOT NULL,
    service TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (business_id, month, service)
  );
  `,
  // v28: the profile's own numbers from Google (views, calls, directions, clicks) and the searches that found it
  `
  CREATE TABLE profile_metrics (
    location_id INTEGER NOT NULL REFERENCES google_locations(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    metric TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (location_id, date, metric)
  );
  CREATE TABLE profile_keywords (
    location_id INTEGER NOT NULL REFERENCES google_locations(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    keyword TEXT NOT NULL,
    value INTEGER,
    threshold INTEGER,
    PRIMARY KEY (location_id, month, keyword)
  );
  ALTER TABLE google_locations ADD COLUMN metrics_at TEXT;
  ALTER TABLE google_locations ADD COLUMN metrics_error TEXT;
  `,
];

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${v + 1} failed: ${err.message}`);
    }
  }
}

export function openDb(file = process.env.DB_FILE || 'data/reviews.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function parseJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
