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
