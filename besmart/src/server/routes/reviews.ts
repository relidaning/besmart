import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../database.js';
import { localDate } from '../date.js';

export const reviewRoutes = Router();

const DEFAULT_VAULT_PATH = process.env.VAULT_PATH ?? '';
const VAULT_SYNC_EXCLUDE = ['0_lidaning']; // top-level dirs excluded from bulk sync

// ── SM-2 ──────────────────────────────────────────────────────────────────────

function sm2(rating: 'hard' | 'ok' | 'easy', intervalDays: number, ef: number) {
  let newEf = ef;
  let newInterval: number;
  if (rating === 'hard') {
    newEf = Math.max(1.3, ef - 0.2);
    newInterval = Math.max(1, Math.round(intervalDays * 0.5));
  } else if (rating === 'ok') {
    newInterval = Math.max(1, Math.round(intervalDays * ef * 0.85));
  } else {
    newEf = Math.min(3.5, ef + 0.15);
    newInterval = Math.max(1, Math.round(intervalDays * ef));
  }
  return { interval: newInterval, ef: Math.round(newEf * 100) / 100 };
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
      if (entry.isDirectory()) results.push(...scanVault(base, entryRel));
      else if (entry.name.endsWith('.md')) results.push(entryRel);
    }
  } catch {}
  return results;
}

function extractTitle(content: string, fallback: string): string {
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m);
    if (t) return t[1].trim().replace(/^["']|["']$/g, '');
  }
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[-_]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function matchVaultNotes(courseName: string, allNotes: string[]): string[] {
  const nameNorm = norm(courseName);
  const nameWords = nameNorm.split(' ').filter((w) => w.length > 2);
  return allNotes.filter((p) => {
    const fileNorm = norm(path.basename(p, '.md'));
    if (fileNorm === nameNorm) return true;
    if (fileNorm.includes(nameNorm)) return true;
    if (nameNorm.includes(fileNorm) && fileNorm.length > 3) return true;
    if (nameWords.length > 0 && nameWords.every((w) => fileNorm.includes(w))) return true;
    return false;
  });
}

function autoMatch(courses: Array<{ id: number; name: string }>, vaultRoot: string) {
  if (courses.length === 0) return;
  try {
    const allNotes = scanVault(vaultRoot, '');
    for (const { id, name } of courses) {
      const paths = matchVaultNotes(name, allNotes);
      const status = paths.length === 0 ? 'none' : paths.length === 1 ? 'matched' : 'multiple';
      const vaultPaths = paths.length > 0 ? JSON.stringify(paths) : null;

      let trueTitle: string | null = null;
      if (paths.length > 0) {
        try {
          const content = fs.readFileSync(path.join(vaultRoot, paths[0]), 'utf-8');
          trueTitle = extractTitle(content, path.basename(paths[0], '.md'));
        } catch {}
      }

      if (trueTitle) {
        db.prepare(
          'UPDATE review_courses SET vault_paths = ?, vault_match_status = ?, name = ? WHERE id = ?'
        ).run(vaultPaths, status, trueTitle, id);
      } else {
        db.prepare(
          'UPDATE review_courses SET vault_paths = ?, vault_match_status = ? WHERE id = ?'
        ).run(vaultPaths, status, id);
      }
    }
  } catch {}
}

function buildObsidianUris(paths: string[], vaultName: string): string[] {
  return paths.map(
    (p) => `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(p.replace(/\.md$/, ''))}`
  );
}

function getCourseContent(course: any, vaultRoot: string): { content: string; paths: string[] } {
  const paths: string[] = [];
  if (course.vault_path) {
    paths.push(course.vault_path);
  } else if (course.vault_paths) {
    const parsed = typeof course.vault_paths === 'string' ? JSON.parse(course.vault_paths) : course.vault_paths;
    paths.push(...parsed);
  }
  if (paths.length === 0) return { content: '', paths: [] };

  const parts = paths.map((p) => {
    try {
      const raw = fs.readFileSync(path.join(vaultRoot, p), 'utf-8');
      return paths.length > 1 ? `# ${path.basename(p, '.md')}\n\n${raw}` : raw;
    } catch {
      return `*(file not found: ${p})*`;
    }
  });
  return { content: parts.join('\n\n---\n\n'), paths };
}

function serializeCourse(c: any) {
  return {
    ...c,
    is_postponed: Boolean(c.is_postponed),
    vault_paths: c.vault_paths ? JSON.parse(c.vault_paths) : null,
  };
}

// ── Vault sync ────────────────────────────────────────────────────────────────

export function scheduleVaultNote(userId: number, vaultRoot: string, relPath: string): boolean {
  const existing = db.prepare(
    'SELECT id FROM review_courses WHERE user_id = ? AND vault_path = ?'
  ).get(userId, relPath);
  if (existing) return false;

  const fallback = path.basename(relPath, '.md');
  let name = fallback;
  try {
    const content = fs.readFileSync(path.join(vaultRoot, relPath), 'utf-8');
    name = extractTitle(content, fallback);
  } catch {}

  const today = localDate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const result = db.prepare(
    'INSERT INTO review_courses (name, description, studied_date, vault_path, vault_match_status, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, '', today, relPath, 'matched', userId);
  db.prepare(
    'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, 0, ?, 2.5, 1)'
  ).run(result.lastInsertRowid, localDate(tomorrow));
  return true;
}

export function syncVaultForUser(userId: number): { missing: number; restored: number } {
  const config = getUserVaultConfig(userId);
  if (!config) return { missing: 0, restored: 0 };
  const { vaultRoot } = config;

  const fileSet = new Set(
    scanVault(vaultRoot, '').filter((p) => !VAULT_SYNC_EXCLUDE.includes(p.split('/')[0]))
  );

  // Detect missing (file gone) and restored (file came back) for exact-path courses
  const exactRows = db.prepare(
    'SELECT id, vault_path, vault_match_status FROM review_courses WHERE user_id = ? AND vault_path IS NOT NULL'
  ).all(userId) as any[];

  let missing = 0, restored = 0;
  for (const row of exactRows) {
    const exists = fileSet.has(row.vault_path);
    if (!exists && row.vault_match_status !== 'missing') {
      db.prepare("UPDATE review_courses SET vault_match_status = 'missing' WHERE id = ?").run(row.id);
      missing++;
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

reviewRoutes.get('/due', (req, res) => {
  const userId = req.user!.id;
  const today = localDate(new Date());

  const records = db.prepare(`
    SELECT r.id, r.course_id, c.name as course_name, c.description as course_description,
           r.is_reviewed, r.reviewed_times, r.planned_date, r.reviewed_date,
           r.ease_factor, r.interval_days,
           c.vault_path, c.vault_paths, c.vault_match_status, c.is_postponed
    FROM review_records r
    JOIN review_courses c ON c.id = r.course_id
    WHERE c.user_id = ? AND r.is_reviewed = 0 AND r.planned_date <= ?
    ORDER BY r.planned_date ASC
  `).all(userId, today) as any[];

  const cfg = getUserVaultConfig(userId);

  // Auto-match courses that have never been scanned
  if (cfg) {
    const toMatch = records
      .filter((r) => !r.vault_path && r.vault_match_status === null)
      .reduce((acc: Array<{ id: number; name: string }>, r) => {
        if (!acc.find((x) => x.id === r.course_id)) acc.push({ id: r.course_id, name: r.course_name });
        return acc;
      }, []);
    if (toMatch.length) {
      autoMatch(toMatch, cfg.vaultRoot);
      toMatch.forEach(({ id }) => {
        const updated = db.prepare('SELECT name, vault_paths, vault_match_status FROM review_courses WHERE id = ?').get(id) as any;
        records.filter((r) => r.course_id === id).forEach((r) => {
          r.course_name = updated.name;
          r.vault_paths = updated.vault_paths;
          r.vault_match_status = updated.vault_match_status;
        });
      });
    }
  }

  res.json({
    data: records.map((r) => ({
      ...r,
      is_reviewed: Boolean(r.is_reviewed),
      is_postponed: Boolean(r.is_postponed),
      ease_factor: r.ease_factor ?? 2.5,
      interval_days: r.interval_days ?? 1,
      vault_paths: r.vault_paths ? JSON.parse(r.vault_paths) : null,
    })),
  });
});

reviewRoutes.post('/records/:id/complete', (req, res) => {
  const userId = req.user!.id;
  const { rating = 'ok' } = req.body as { rating?: 'hard' | 'ok' | 'easy' };

  const record = db.prepare(`
    SELECT r.* FROM review_records r
    JOIN review_courses c ON r.course_id = c.id
    WHERE r.id = ? AND c.user_id = ?
  `).get(req.params.id, userId) as any;
  if (!record) return res.status(404).json({ error: 'Record not found' });

  const today = localDate(new Date());
  const { interval, ef } = sm2(rating, record.interval_days ?? 1, record.ease_factor ?? 2.5);

  db.prepare('UPDATE review_records SET is_reviewed = 1, reviewed_date = ? WHERE id = ?').run(today, req.params.id);

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  db.prepare(
    'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, ?, ?, ?, ?)'
  ).run(record.course_id, record.reviewed_times + 1, localDate(nextDate), ef, interval);

  res.json({ success: true });
});

// ── Record detail ─────────────────────────────────────────────────────────────

reviewRoutes.get('/records/:id/detail', (req, res) => {
  const userId = req.user!.id;
  const record = db.prepare(`
    SELECT r.*, c.name as course_name, c.description as course_description,
           c.vault_path, c.vault_paths, c.vault_match_status
    FROM review_records r
    JOIN review_courses c ON r.course_id = c.id
    WHERE r.id = ? AND c.user_id = ?
  `).get(req.params.id, userId) as any;
  if (!record) return res.status(404).json({ error: 'Not found' });

  const cfg = getUserVaultConfig(userId);
  const { content, paths } = cfg ? getCourseContent(record, cfg.vaultRoot) : { content: '', paths: [] };
  const liveTitle = cfg && paths[0]
    ? (() => { try { return extractTitle(fs.readFileSync(path.join(cfg.vaultRoot, paths[0]), 'utf-8'), record.course_name); } catch { return record.course_name; } })()
    : record.course_name;

  res.json({
    record,
    content,
    paths,
    title: liveTitle,
    vault_name: cfg?.vaultName ?? '',
    obsidian_uris: cfg ? buildObsidianUris(paths, cfg.vaultName) : [],
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

  const cfg = getUserVaultConfig(userId);
  if (cfg) {
    const toMatch = courses.filter((c) => !c.vault_path && c.vault_match_status === null);
    if (toMatch.length) {
      autoMatch(toMatch.map((c) => ({ id: c.id, name: c.name })), cfg.vaultRoot);
      toMatch.forEach((c) => {
        const updated = db.prepare('SELECT name, vault_paths, vault_match_status FROM review_courses WHERE id = ?').get(c.id) as any;
        c.name = updated.name;
        c.vault_paths = updated.vault_paths;
        c.vault_match_status = updated.vault_match_status;
      });
    }
  }

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
  const existing = db.prepare('SELECT id FROM review_courses WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Course not found' });

  db.prepare('DELETE FROM review_records WHERE course_id = ?').run(req.params.id);
  db.prepare('DELETE FROM review_courses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Course detail ─────────────────────────────────────────────────────────────

reviewRoutes.get('/courses/:id/detail', (req, res) => {
  const userId = req.user!.id;
  const course = db.prepare('SELECT * FROM review_courses WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!course) return res.status(404).json({ error: 'Not found' });

  const cfg = getUserVaultConfig(userId);
  const { content, paths } = cfg ? getCourseContent(course, cfg.vaultRoot) : { content: '', paths: [] };
  const liveTitle = cfg && paths[0]
    ? (() => { try { return extractTitle(fs.readFileSync(path.join(cfg.vaultRoot, paths[0]), 'utf-8'), course.name); } catch { return course.name; } })()
    : course.name;

  res.json({
    course: serializeCourse(course),
    content,
    paths,
    title: liveTitle,
    vault_name: cfg?.vaultName ?? '',
    obsidian_uris: cfg ? buildObsidianUris(paths, cfg.vaultName) : [],
  });
});

// ── Rematch ───────────────────────────────────────────────────────────────────

reviewRoutes.post('/courses/rematch', (req, res) => {
  const userId = req.user!.id;
  const cfg = getUserVaultConfig(userId);
  if (!cfg) return res.json({ updated: 0 });

  const courses = db.prepare('SELECT id, name FROM review_courses WHERE user_id = ? AND vault_path IS NULL').all(userId) as any[];
  if (!courses.length) return res.json({ updated: 0 });
  autoMatch(courses, cfg.vaultRoot);
  res.json({ updated: courses.length });
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

reviewRoutes.post('/vault/sync', (req, res) => {
  const userId = req.user!.id;
  const result = syncVaultForUser(userId);
  res.json({ success: true, ...result });
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

  const { paths } = req.body as { paths: string[] };
  if (!paths?.length) return res.status(400).json({ error: 'paths required' });

  const today = localDate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const created = db.transaction(() =>
    paths.map((vaultPath) => {
      const fallback = path.basename(vaultPath, '.md');
      let name = fallback;
      try {
        const content = fs.readFileSync(path.join(cfg.vaultRoot, vaultPath), 'utf-8');
        name = extractTitle(content, fallback);
      } catch {}
      const result = db.prepare(
        'INSERT INTO review_courses (name, description, studied_date, vault_path, vault_match_status, user_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(name, '', today, vaultPath, 'matched', userId);
      db.prepare(
        'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, ease_factor, interval_days) VALUES (?, 0, 0, ?, 2.5, 1)'
      ).run(result.lastInsertRowid, localDate(tomorrow));
      return { id: result.lastInsertRowid, name };
    })
  )();

  res.status(201).json({ data: created });
});
