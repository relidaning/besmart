import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../database.js';
import { localDate } from '../date.js';
import { review as fsrsReview, intervalFor, fuzzInterval, previewIntervals, retrievability, GRADE, type MemoryState } from '../fsrs.js';
import { plantForCourse, growFromReview, removePlantForCourse } from '../garden.js';
import { awardXp, REVIEW_XP } from '../garden.js';

export const reviewRoutes = Router();

const DEFAULT_VAULT_PATH = process.env.VAULT_PATH ?? '';
import { isExcludedVaultPath } from '../../shared/vaultRules.js';

// ── SM-2 ──────────────────────────────────────────────────────────────────────

// FSRS memory state for a course, and days since its last review.
function memoryOf(course: any, today: string): { state: MemoryState | null; elapsed: number } {
  if (course.fsrs_stability == null || !course.fsrs_last_review) return { state: null, elapsed: 0 };
  return {
    state: { stability: course.fsrs_stability, difficulty: course.fsrs_difficulty ?? 5 },
    elapsed: Math.max(0, Math.round((Date.parse(today) - Date.parse(course.fsrs_last_review)) / 86_400_000)),
  };
}

// ── Vault helpers ─────────────────────────────────────────────────────────────

function getUserVaultConfig(userId: number): { vaultRoot: string; vaultName: string } | null {
  const user = db.prepare('SELECT vault_root, vault_name FROM users WHERE id = ?').get(userId) as any;
  const vaultRoot = user?.vault_root || DEFAULT_VAULT_PATH;
  if (!vaultRoot) return null;
  const vaultName = user?.vault_name || path.basename(vaultRoot);
  return { vaultRoot, vaultName };
}

function scanVault(base: string, rel: string): string[] {
  const results: string[] = [];
  const dir = rel ? path.join(base, rel) : base;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcludedVaultPath(entryRel)) continue; // never review sources (vaultRules.ts)
      if (entry.isDirectory()) results.push(...scanVault(base, entryRel));
      else if (entry.name.endsWith('.md')) results.push(entryRel);
    }
  } catch {}
  return results;
}

function buildObsidianUris(paths: string[], vaultName: string): string[] {
  return paths.map(
    (p) => `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(p.replace(/\.md$/, ''))}`
  );
}

function getCourseContent(course: any, vaultRoot: string): { content: string; paths: string[] } {
  if (!course.vault_path) return { content: '', paths: [] };
  const p = course.vault_path as string;
  try {
    return { content: fs.readFileSync(path.join(vaultRoot, p), 'utf-8'), paths: [p] };
  } catch {
    return { content: `*(file not found: ${p})*`, paths: [p] };
  }
}

function serializeCourse(c: any) {
  return {
    ...c,
    is_postponed: Boolean(c.is_postponed),
  };
}

// ── Vault sync ────────────────────────────────────────────────────────────────

export function scheduleVaultNote(userId: number, vaultRoot: string, relPath: string): boolean {
  if (isExcludedVaultPath(relPath)) return false;
  const existing = db.prepare(
    'SELECT id FROM review_courses WHERE user_id = ? AND vault_path = ?'
  ).get(userId, relPath);
  if (existing) return false;

  const name = path.basename(relPath, '.md'); // a course is named after its note file

  const today = localDate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const result = db.prepare(
    'INSERT INTO review_courses (name, description, studied_date, vault_path, vault_match_status, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, '', today, relPath, 'matched', userId);
  db.prepare(
    'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, 0, ?, 2.5, 1)'
  ).run(result.lastInsertRowid, localDate(tomorrow));
  plantForCourse(userId, Number(result.lastInsertRowid), 'created'); // a new note plants a sapling
  return true;
}

// Called when a vault note is updated: if the note isn't tracked yet, schedule it;
// if it's tracked but has no pending (unreviewed) record, queue a fresh review for tomorrow.
export function ensureScheduleForNote(
  userId: number,
  vaultRoot: string,
  relPath: string
): 'created' | 'rescheduled' | 'noop' {
  const course = db.prepare(
    'SELECT id FROM review_courses WHERE user_id = ? AND vault_path = ?'
  ).get(userId, relPath) as { id: number } | undefined;
  if (!course) {
    return scheduleVaultNote(userId, vaultRoot, relPath) ? 'created' : 'noop';
  }

  const pending = db.prepare(
    'SELECT id FROM review_records WHERE course_id = ? AND is_reviewed = 0 LIMIT 1'
  ).get(course.id);
  if (pending) return 'noop';

  const last = db.prepare(
    'SELECT MAX(reviewed_times) as t FROM review_records WHERE course_id = ?'
  ).get(course.id) as any;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  db.prepare(
    'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, ?, ?, 2.5, 1)'
  ).run(course.id, (last?.t ?? 0) + 1, localDate(tomorrow));
  return 'rescheduled';
}

// Delete a course and all its review records when its note is removed from the vault.
export function deleteCourseForNote(userId: number, relPath: string): boolean {
  const course = db.prepare(
    'SELECT id FROM review_courses WHERE user_id = ? AND vault_path = ?'
  ).get(userId, relPath) as any;
  if (!course) return false;
  db.prepare('DELETE FROM review_records WHERE course_id = ?').run(course.id);
  db.prepare('DELETE FROM review_courses WHERE id = ?').run(course.id);
  removePlantForCourse(course.id);
  return true;
}

// Deleting a course in the app also removes its note from the vault. It's moved to
// the vault's .trash folder (Obsidian's "move to Obsidian trash") rather than
// erased, so it can be restored; Nextcloud's trash is a second safety net.
// Only an exact vault_path is touched, never a fuzzy match, and only inside the vault.
function trashVaultNote(vaultRoot: string, relPath: string): string | null {
  const root = path.resolve(vaultRoot);
  const src = path.resolve(root, relPath);
  if (!src.startsWith(root + path.sep) || !src.endsWith('.md') || !fs.existsSync(src)) return null;
  const trash = path.join(root, '.trash');
  if (!fs.existsSync(trash)) {
    fs.mkdirSync(trash);
    // The container runs as root; hand the folder to the vault's owner so Obsidian
    // and the Nextcloud client can still empty it.
    try { const st = fs.statSync(root); fs.chownSync(trash, st.uid, st.gid); } catch { /* best effort */ }
  }
  const base = path.basename(src, '.md');
  let dest = path.join(trash, `${base}.md`);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(trash, `${base} ${n}.md`);
  fs.renameSync(src, dest);
  return path.relative(root, dest);
}

export function syncVaultForUser(userId: number): { missing: number; restored: number } {
  const config = getUserVaultConfig(userId);
  if (!config) return { missing: 0, restored: 0 };
  const { vaultRoot } = config;

  const fileSet = new Set(
    scanVault(vaultRoot, '')
  );

  // Detect missing (file gone) and restored (file came back) for exact-path courses
  const exactRows = db.prepare(
    'SELECT id, vault_path, vault_match_status FROM review_courses WHERE user_id = ? AND vault_path IS NOT NULL'
  ).all(userId) as any[];

  let missing = 0, restored = 0;
  for (const row of exactRows) {
    const exists = fileSet.has(row.vault_path);
    if (!exists && row.vault_match_status !== 'missing') {
      // Try to find the file at a new location (same filename, different folder = moved)
      const basename = path.basename(row.vault_path);
      const movedTo = [...fileSet].find((p) => path.basename(p) === basename && p !== row.vault_path);
      if (movedTo) {
        db.prepare("UPDATE review_courses SET vault_path = ?, vault_match_status = 'matched' WHERE id = ?").run(movedTo, row.id);
        fileSet.delete(movedTo); // don't treat this as a brand-new file
        restored++;
      } else {
        db.prepare("UPDATE review_courses SET vault_match_status = 'missing' WHERE id = ?").run(row.id);
        missing++;
      }
    } else if (exists && row.vault_match_status === 'missing') {
      db.prepare("UPDATE review_courses SET vault_match_status = 'matched' WHERE id = ?").run(row.id);
      restored++;
    }
  }

  return { missing, restored };
}

export function syncVaultForAllConfiguredUsers() {
  const users = db.prepare('SELECT id FROM users WHERE vault_root IS NOT NULL').all() as any[];
  for (const { id } of users) {
    try {
      const result = syncVaultForUser(id);
      if (result.missing > 0 || result.restored > 0) {
        console.log(`[vault-sync] user ${id}: ${result.missing} missing, ${result.restored} restored`);
      }
    } catch (e) {
      console.error(`[vault-sync] user ${id} failed:`, e);
    }
  }
}

// ── Due records ───────────────────────────────────────────────────────────────

const DUE_DAILY_LIMIT = 20;

// Due-list tie-break by vault folder (the list is ordered latest note first): AI/ML/DL
// notes first, then the rest of 0_dev, then everything else. The AI folder was renamed
// from 0_dev/AI to 0_dev/0_AI, and older courses still carry the old path.
const DUE_TOPIC_TIER = `CASE
    WHEN COALESCE(c.vault_path, '') LIKE '%0_dev/0_AI/%'
      OR COALESCE(c.vault_path, '') LIKE '%0_dev/AI/%' THEN 0
    WHEN COALESCE(c.vault_path, '') LIKE '%0_dev/%' THEN 1
    ELSE 2
  END`;

reviewRoutes.get('/due', (req, res) => {
  const userId = req.user!.id;
  const today = localDate(new Date());
  const search = (req.query.search as string || '').trim();

  const dueWhere = `
    FROM review_records r
    JOIN review_courses c ON c.id = r.course_id
    WHERE c.user_id = ? AND r.is_reviewed = 0 AND r.planned_date <= ?
      AND (? = '' OR c.name LIKE '%' || ? || '%')
      AND r.id = (
        SELECT rr.id FROM review_records rr
        WHERE rr.course_id = r.course_id AND rr.is_reviewed = 0
        ORDER BY rr.planned_date ASC, rr.id ASC
        LIMIT 1
      )
      AND r.id = (
        SELECT rr2.id
        FROM review_records rr2
        JOIN review_courses cc ON cc.id = rr2.course_id
        WHERE cc.user_id = c.user_id AND cc.name = c.name
          AND rr2.is_reviewed = 0 AND rr2.planned_date <= ?
        ORDER BY rr2.planned_date ASC, rr2.id ASC
        LIMIT 1
      )
  `;

  const { total } = db.prepare(`SELECT COUNT(*) as total ${dueWhere}`)
    .get(userId, today, search, search, today) as any;

  const records = db.prepare(`
    SELECT r.id, r.course_id, c.name as course_name, c.description as course_description,
           r.is_reviewed, r.reviewed_times, r.planned_date, r.reviewed_date,
           r.ease_factor, r.interval_days,
           c.vault_path, c.vault_match_status, c.is_postponed
    ${dueWhere}
    ORDER BY c.is_postponed ASC,
      c.created_at DESC, c.id DESC, -- latest notes first
      ${DUE_TOPIC_TIER}, r.planned_date ASC
    LIMIT ?
  `).all(userId, today, search, search, today, DUE_DAILY_LIMIT) as any[];

  res.json({
    data: records.map((r) => ({
      ...r,
      is_reviewed: Boolean(r.is_reviewed),
      is_postponed: Boolean(r.is_postponed),
      ease_factor: r.ease_factor ?? 2.5,
      interval_days: r.interval_days ?? 1,
    })),
    total,
    limit: DUE_DAILY_LIMIT,
  });
});

reviewRoutes.post('/records/:id/complete', (req, res) => {
  const userId = req.user!.id;
  const { rating = 'ok' } = req.body as { rating?: string };
  const grade = GRADE[rating];
  if (!grade) return res.status(400).json({ error: 'rating must be again, hard, ok or easy' });

  const record = db.prepare(`
    SELECT r.*, c.fsrs_stability, c.fsrs_difficulty, c.fsrs_last_review, c.fsrs_reps, c.fsrs_lapses
    FROM review_records r
    JOIN review_courses c ON r.course_id = c.id
    WHERE r.id = ? AND c.user_id = ?
  `).get(req.params.id, userId) as any;
  if (!record) return res.status(404).json({ error: 'Record not found' });

  // FSRS: update the course's memory state from this rating and the time since
  // its last review, then schedule the next review for when recall is predicted
  // to drop to 90%. "Again" (forgot) brings it back tomorrow.
  const today = localDate(new Date());
  const { state, elapsed } = memoryOf(record, today);
  const next = fsrsReview(state, elapsed, grade);
  const interval = grade === 1 ? 1 : fuzzInterval(intervalFor(next.stability), record.course_id * 31 + record.fsrs_reps);

  db.prepare('UPDATE review_records SET is_reviewed = 1, reviewed_date = ? WHERE id = ?').run(today, req.params.id);
  db.prepare(`
    UPDATE review_courses SET fsrs_stability = ?, fsrs_difficulty = ?, fsrs_last_review = ?,
      fsrs_reps = fsrs_reps + 1, fsrs_lapses = fsrs_lapses + ? WHERE id = ?
  `).run(next.stability, next.difficulty, today, grade === 1 && state ? 1 : 0, record.course_id);

  // Self-heal: a course should have at most one pending record at a time. Stray
  // duplicates (from historical double-scheduling) would otherwise pop right back
  // into the due list as soon as this one is completed.
  db.prepare('DELETE FROM review_records WHERE course_id = ? AND is_reviewed = 0').run(record.course_id);

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  db.prepare(
    'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, ?, ?, NULL, ?)'
  ).run(record.course_id, record.reviewed_times + 1, localDate(nextDate), interval);

  const xp = awardXp(userId, 'review', record.id, 'wisdom', REVIEW_XP[rating as keyof typeof REVIEW_XP] ?? REVIEW_XP.ok);
  // The note's plant grows (it's planted now if the note predates the garden).
  const grew = growFromReview(userId, record.course_id, record.id, rating);
  if (xp && grew) xp.garden = grew;
  res.json({ success: true, xp, grew, next: { days: interval, date: localDate(nextDate) } });
});

// ── Record detail ─────────────────────────────────────────────────────────────

reviewRoutes.get('/records/:id/detail', (req, res) => {
  const userId = req.user!.id;
  const record = db.prepare(`
    SELECT r.*, c.name as course_name, c.description as course_description,
           c.vault_path, c.vault_match_status,
           c.fsrs_stability, c.fsrs_difficulty, c.fsrs_last_review, c.fsrs_reps, c.fsrs_lapses
    FROM review_records r
    JOIN review_courses c ON r.course_id = c.id
    WHERE r.id = ? AND c.user_id = ?
  `).get(req.params.id, userId) as any;
  if (!record) return res.status(404).json({ error: 'Not found' });

  const cfg = getUserVaultConfig(userId);
  const { content, paths } = cfg ? getCourseContent(record, cfg.vaultRoot) : { content: '', paths: [] };

  res.json({
    record,
    content,
    paths,
    title: record.course_name,
    vault_name: cfg?.vaultName ?? '',
    obsidian_uris: cfg ? buildObsidianUris(paths, cfg.vaultName) : [],
    memory: (() => {
      const { state, elapsed } = memoryOf(record, localDate(new Date()));
      return {
        // Next gap each rating button would give, and today's predicted recall.
        preview: previewIntervals(state, elapsed),
        recall: state ? retrievability(elapsed, state.stability) : null,
        reps: record.fsrs_reps ?? 0,
        lapses: record.fsrs_lapses ?? 0,
      };
    })(),
  });
});

// ── Courses ───────────────────────────────────────────────────────────────────

reviewRoutes.get('/courses', (req, res) => {
  const userId = req.user!.id;
  const courses = db.prepare(`
    SELECT c.*,
      (SELECT MAX(reviewed_times) FROM review_records WHERE course_id = c.id AND is_reviewed = 1) as total_reviews,
      (SELECT COUNT(*) FROM review_records WHERE course_id = c.id AND is_reviewed = 0 AND planned_date <= date('now')) as due_reviews
    FROM review_courses c
    WHERE c.user_id = ?
    ORDER BY c.studied_date DESC
  `).all(userId) as any[];

  res.json({ data: courses.map(serializeCourse) });
});

reviewRoutes.post('/courses', (req, res) => {
  const userId = req.user!.id;
  const { name, description, is_postponed, vault_path } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const today = localDate(new Date());
  const run = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO review_courses (name, description, studied_date, is_postponed, vault_path, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, description || '', today, is_postponed ? 1 : 0, vault_path ?? null, userId);

    const courseId = result.lastInsertRowid;
    const firstReview = new Date();
    firstReview.setDate(firstReview.getDate() + 1);
    db.prepare(
      'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, 0, ?, 2.5, 1)'
    ).run(courseId, localDate(firstReview));
    plantForCourse(userId, Number(courseId), 'created');

    return db.prepare('SELECT * FROM review_courses WHERE id = ?').get(courseId);
  });

  res.status(201).json({ data: run() });
});

reviewRoutes.put('/courses/:id', (req, res) => {
  const userId = req.user!.id;
  const { name, description, is_postponed } = req.body;
  const existing = db.prepare('SELECT * FROM review_courses WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!existing) return res.status(404).json({ error: 'Course not found' });

  db.prepare('UPDATE review_courses SET name = ?, description = ?, is_postponed = ? WHERE id = ?').run(
    name ?? existing.name,
    description ?? existing.description,
    is_postponed !== undefined ? (is_postponed ? 1 : 0) : existing.is_postponed,
    req.params.id
  );
  res.json({ data: db.prepare('SELECT * FROM review_courses WHERE id = ?').get(req.params.id) });
});

reviewRoutes.delete('/courses/:id', (req, res) => {
  const userId = req.user!.id;
  const existing = db.prepare('SELECT id, vault_path FROM review_courses WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!existing) return res.status(404).json({ error: 'Course not found' });

  const keepNote = req.query.keepNote === '1';
  let trashed: string | null = null;
  const cfg = getUserVaultConfig(userId);
  if (!keepNote && cfg && existing.vault_path) {
    try { trashed = trashVaultNote(cfg.vaultRoot, existing.vault_path); }
    catch (err) { return res.status(500).json({ error: `Couldn't move the note to .trash: ${(err as Error).message}` }); }
  }
  db.prepare('DELETE FROM review_records WHERE course_id = ?').run(req.params.id);
  db.prepare('DELETE FROM review_courses WHERE id = ?').run(req.params.id);
  removePlantForCourse(Number(req.params.id));
  res.json({ success: true, trashed });
});

// ── Course detail ─────────────────────────────────────────────────────────────

reviewRoutes.get('/courses/:id/detail', (req, res) => {
  const userId = req.user!.id;
  const course = db.prepare('SELECT * FROM review_courses WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!course) return res.status(404).json({ error: 'Not found' });

  const cfg = getUserVaultConfig(userId);
  const { content, paths } = cfg ? getCourseContent(course, cfg.vaultRoot) : { content: '', paths: [] };

  res.json({
    course: serializeCourse(course),
    content,
    paths,
    title: course.name,
    vault_name: cfg?.vaultName ?? '',
    obsidian_uris: cfg ? buildObsidianUris(paths, cfg.vaultName) : [],
  });
});

// ── Vault ─────────────────────────────────────────────────────────────────────

reviewRoutes.get('/vault/info', (req, res) => {
  const userId = req.user!.id;
  const cfg = getUserVaultConfig(userId);
  res.json({ vault_name: cfg?.vaultName ?? '' });
});

reviewRoutes.get('/vault/config', (req, res) => {
  const userId = req.user!.id;
  const user = db.prepare('SELECT vault_root, vault_name FROM users WHERE id = ?').get(userId) as any;
  const cfg = getUserVaultConfig(userId);
  res.json({
    vault_root: user?.vault_root ?? null,
    vault_name: user?.vault_name ?? null,
    effective_vault_root: cfg?.vaultRoot ?? null,
    effective_vault_name: cfg?.vaultName ?? null,
  });
});

reviewRoutes.put('/vault/config', (req, res) => {
  const userId = req.user!.id;
  const { vault_root, vault_name } = req.body as { vault_root?: string; vault_name?: string };
  if (vault_root && !fs.existsSync(vault_root)) {
    return res.status(400).json({ error: 'vault_root path does not exist on server' });
  }
  db.prepare('UPDATE users SET vault_root = ?, vault_name = ? WHERE id = ?').run(
    vault_root || null,
    vault_name || null,
    userId
  );
  res.json({ success: true });
});

reviewRoutes.get('/vault/suggestions', (req, res) => {
  const userId = req.user!.id;
  const cfg = getUserVaultConfig(userId);
  if (!cfg) return res.json({ data: [] });

  const scheduled = db.prepare(
    'SELECT vault_path FROM review_courses WHERE user_id = ? AND vault_path IS NOT NULL'
  ).all(userId) as any[];
  const scheduledPaths = new Set(scheduled.map((r: any) => r.vault_path));

  try {
    const notes = scanVault(cfg.vaultRoot, '').filter((p) => !scheduledPaths.has(p));
    const suggestions = notes
      .map((relPath) => {
        try {
          const stat = fs.statSync(path.join(cfg.vaultRoot, relPath));
          return { path: relPath, title: path.basename(relPath, '.md'), mtime: stat.mtime.toISOString() };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
      .slice(0, 30);
    res.json({ data: suggestions });
  } catch {
    res.json({ data: [] });
  }
});

reviewRoutes.get('/vault/content', (req, res) => {
  const userId = req.user!.id;
  const cfg = getUserVaultConfig(userId);
  if (!cfg) return res.status(404).json({ error: 'No vault configured' });

  const notePath = req.query.path as string;
  if (!notePath || notePath.includes('..')) return res.status(400).json({ error: 'Invalid path' });
  try {
    const content = fs.readFileSync(path.join(cfg.vaultRoot, notePath), 'utf-8');
    res.json({ data: content.slice(0, 2000) });
  } catch {
    res.status(404).json({ error: 'Note not found' });
  }
});

reviewRoutes.post('/vault/import', (req, res) => {
  const userId = req.user!.id;
  const cfg = getUserVaultConfig(userId);
  if (!cfg) return res.status(400).json({ error: 'No vault configured' });

  const { paths: requested } = req.body as { paths: string[] };
  if (!Array.isArray(requested) || !requested.length) return res.status(400).json({ error: 'paths required' });
  // Only notes inside the vault, and never from the excluded folders.
  const paths = requested.filter((p) => typeof p === 'string' && p.endsWith('.md') && !p.startsWith('/')
    && !p.split('/').includes('..') && !isExcludedVaultPath(p));
  if (!paths.length) return res.status(400).json({ error: 'No importable notes (excluded folders and paths outside the vault are skipped)' });

  const today = localDate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const created = db.transaction(() =>
    paths.map((vaultPath) => {
      const name = path.basename(vaultPath, '.md');
      const result = db.prepare(
        'INSERT INTO review_courses (name, description, studied_date, vault_path, vault_match_status, user_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(name, '', today, vaultPath, 'matched', userId);
      db.prepare(
        'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, 0, ?, 2.5, 1)'
      ).run(result.lastInsertRowid, localDate(tomorrow));
      plantForCourse(userId, Number(result.lastInsertRowid), 'created');
      return { id: result.lastInsertRowid, name };
    })
  )();

  res.status(201).json({ data: created });
});
