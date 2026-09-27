// Consistent online backup of the SQLite database (safe while the server runs).
// Usage: npm run backup   (keeps the newest BACKUP_KEEP files, default 14)
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';

const dir = process.env.BACKUP_DIR || 'data/backups';
const keep = Number(process.env.BACKUP_KEEP) || 14;
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const target = path.join(dir, `reviews-${stamp}.db`);
const db = openDb();
db.prepare('VACUUM INTO ?').run(target);
db.close();
console.log(`Backup written: ${target}`);

const old = fs
  .readdirSync(dir)
  .filter((f) => /^reviews-\d+\.db$/.test(f))
  .sort()
  .slice(0, -keep);
for (const f of old) fs.unlinkSync(path.join(dir, f));
if (old.length) console.log(`Removed ${old.length} old backup(s).`);
