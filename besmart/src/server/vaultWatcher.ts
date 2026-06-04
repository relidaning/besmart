import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';
import db from './database.js';
import { scheduleVaultNote, ensureScheduleForNote, deleteCourseForNote } from './routes/reviews.js';

const VAULT_SYNC_EXCLUDE = ['0_lidaning'];

// Grace window after a note disappears before we delete its review schedule.
// A move fires unlink(old) + add(new); the add handler re-links within this window.
const DELETE_GRACE_MS = 5000;

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
      // A note with this filename whose old path no longer exists = a move → re-link it.
      const newBasename = path.basename(rel);
      const candidates = db.prepare(
        'SELECT id, vault_path FROM review_courses WHERE user_id = ? AND vault_path IS NOT NULL AND vault_path != ? AND (vault_path = ? OR vault_path LIKE ?)'
      ).all(userId, rel, newBasename, `%/${newBasename}`) as any[];
      const moved = candidates.find((c) => !fs.existsSync(path.join(vaultRoot, c.vault_path)));
      if (moved) {
        db.prepare(
          "UPDATE review_courses SET vault_path = ?, vault_match_status = 'matched' WHERE id = ?"
        ).run(rel, moved.id);
        console.log(`[vault-watch] moved: ${moved.vault_path} → ${rel}`);
        return;
      }

      if (scheduleVaultNote(userId, vaultRoot, rel)) {
        console.log(`[vault-watch] scheduled: ${rel}`);
      }
    })
    .on('change', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      const rel = path.relative(vaultRoot, filePath);
      const result = ensureScheduleForNote(userId, vaultRoot, rel);
      if (result !== 'noop') {
        console.log(`[vault-watch] ${result} (on update): ${rel}`);
      }
      markRestored(userId, rel);
    })
    .on('unlink', (filePath: string) => {
      if (!filePath.endsWith('.md')) return;
      const rel = path.relative(vaultRoot, filePath);
      markMissing(userId, rel);
      // Defer deletion: a move re-links the course (to a path that exists) within the grace
      // window, so only delete notes that are still gone afterwards.
      setTimeout(() => {
        const course = db.prepare(
          'SELECT vault_path FROM review_courses WHERE user_id = ? AND vault_path = ?'
        ).get(userId, rel) as any;
        if (!course) return; // already re-linked elsewhere (moved)
        if (fs.existsSync(path.join(vaultRoot, rel))) {
          markRestored(userId, rel);
          return;
        }
        if (deleteCourseForNote(userId, rel)) {
          console.log(`[vault-watch] deleted schedule (note removed): ${rel}`);
        }
      }, DELETE_GRACE_MS);
    });

  console.log(`[vault-watch] watching ${vaultRoot} (user ${userId})`);
}
