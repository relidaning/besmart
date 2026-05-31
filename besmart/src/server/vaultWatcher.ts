import chokidar from 'chokidar';
import path from 'path';
import db from './database.js';
import { scheduleVaultNote } from './routes/reviews.js';

const VAULT_SYNC_EXCLUDE = ['0_lidaning'];

function isExcluded(rel: string): boolean {
  return VAULT_SYNC_EXCLUDE.includes(rel.split('/')[0]);
}

function markMissing(userId: number, relPath: string) {
  const r = db.prepare(
    "UPDATE review_courses SET vault_match_status = 'missing' WHERE user_id = ? AND vault_path = ? AND vault_match_status != 'missing'"
  ).run(userId, relPath);
  if (r.changes > 0) console.log(`[vault-watch] missing: ${relPath}`);
}

function markRestored(userId: number, relPath: string) {
  const r = db.prepare(
    "UPDATE review_courses SET vault_match_status = 'matched' WHERE user_id = ? AND vault_path = ? AND vault_match_status = 'missing'"
  ).run(userId, relPath);
  if (r.changes > 0) console.log(`[vault-watch] restored: ${relPath}`);
}

export function startVaultWatchers() {
  const users = db.prepare('SELECT id, vault_root FROM users WHERE vault_root IS NOT NULL').all() as any[];
  for (const { id, vault_root } of users) {
    startWatcherForUser(id, vault_root);
  }
}

function startWatcherForUser(userId: number, vaultRoot: string) {
  const watcher = chokidar.watch(vaultRoot, {
    ignored: (filePath: string) => {
      const rel = path.relative(vaultRoot, filePath);
      if (!rel || rel === '.') return false;
      const base = path.basename(filePath);
      return base.startsWith('.') || isExcluded(rel);
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher
    .on('add', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      const rel = path.relative(vaultRoot, filePath);
      // Check if this looks like a move: a missing course shares the same filename
      const newBasename = path.basename(rel);
      const missingCourse = db.prepare(
        "SELECT id, vault_path FROM review_courses WHERE user_id = ? AND vault_match_status = 'missing' AND vault_path LIKE ?"
      ).get(userId, `%/${newBasename}`) as any
        ?? db.prepare(
          "SELECT id, vault_path FROM review_courses WHERE user_id = ? AND vault_match_status = 'missing' AND vault_path = ?"
        ).get(userId, newBasename) as any;

      if (missingCourse) {
        db.prepare(
          "UPDATE review_courses SET vault_path = ?, vault_match_status = 'matched' WHERE id = ?"
        ).run(rel, missingCourse.id);
        console.log(`[vault-watch] moved: ${missingCourse.vault_path} → ${rel}`);
        return;
      }

      if (scheduleVaultNote(userId, vaultRoot, rel)) {
        console.log(`[vault-watch] scheduled: ${rel}`);
      }
    })
    .on('change', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      const rel = path.relative(vaultRoot, filePath);
      if (scheduleVaultNote(userId, vaultRoot, rel)) {
        console.log(`[vault-watch] scheduled (on update): ${rel}`);
      }
      markRestored(userId, rel);
    })
    .on('unlink', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      const rel = path.relative(vaultRoot, filePath);
      markMissing(userId, rel);
    });

  console.log(`[vault-watch] watching ${vaultRoot} (user ${userId})`);
}
