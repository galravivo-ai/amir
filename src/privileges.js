import fs from 'node:fs';
import path from 'node:path';

/**
 * In Docker the process starts as root so it can take ownership of the data
 * volume (hosting platforms usually mount it owned by root), then permanently
 * drops to the unprivileged "node" user (uid/gid 1000) before doing anything else.
 */
export function dropPrivileges({ dataDir, uid = 1000, gid = 1000 } = {}) {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return false;
  if (process.env.RUN_AS_ROOT === 'true') return false;
  fs.mkdirSync(dataDir, { recursive: true });
  const chownTree = (p) => {
    fs.chownSync(p, uid, gid);
    if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) chownTree(path.join(p, f));
  };
  chownTree(dataDir);
  process.setgroups?.([gid]);
  process.setgid(gid);
  process.setuid(uid);
  return true;
}
