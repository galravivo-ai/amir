import fs from 'node:fs';
import path from 'node:path';

const PATTERN = /^reviews-\d{12}\.db$/;

/**
 * Consistent online backup of the SQLite database (safe while the server runs).
 * Keeps the newest `keep` files in `dir`.
 */
export function backupDb(db, { dir = process.env.BACKUP_DIR || 'data/backups', keep = Number(process.env.BACKUP_KEEP) || 14 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const target = path.join(dir, `reviews-${stamp}.db`);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  db.prepare('VACUUM INTO ?').run(target);
  const old = fs.readdirSync(dir).filter((f) => PATTERN.test(f)).sort().slice(0, -keep);
  for (const f of old) fs.unlinkSync(path.join(dir, f));
  return { file: target, removed: old.length };
}

/** Age in ms of the newest backup in `dir`, or Infinity when there is none. */
export function lastBackupAge(dir = process.env.BACKUP_DIR || 'data/backups') {
  if (!fs.existsSync(dir)) return Infinity;
  const newest = fs.readdirSync(dir).filter((f) => PATTERN.test(f)).sort().at(-1);
  return newest ? Date.now() - fs.statSync(path.join(dir, newest)).mtimeMs : Infinity;
}

// CLI: npm run backup
if (import.meta.url === `file://${process.argv[1]}`) {
  const { openDb } = await import('./db.js');
  const db = openDb();
  const { file, removed } = backupDb(db);
  db.close();
  console.log(`Backup written: ${file}${removed ? ` (removed ${removed} old)` : ''}`);
}
