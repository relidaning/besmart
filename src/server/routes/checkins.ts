import express, { Router } from 'express';
import db from '../database.js';
import { localDate, effectiveDate, effectiveDayBounds } from '../date.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { awardXp, revokeXp, scheduleCategory, isAttribute, MIN_CHECKIN_XP } from '../garden.js';
import { getUserVaultConfig } from './reviews.js';
import { diaryPeriod, diaryHeadingKey, diaryKeyEnd, isDiaryType, type DiaryType } from '../../shared/diary.js';

export const checkinRoutes = Router();

checkinRoutes.get('/today', (req, res) => {
  const userId = req.user!.id;
  const date = (req.query.date as string) || effectiveDate();

  const tasks = db.prepare(`
    SELECT t.*, s.score, s.category, s.name
    FROM checkin_tasks t
    JOIN checkin_schedules s ON t.schedule_id = s.id
    WHERE s.user_id = ?
      AND ((t.task_date = ? AND t.schedule_type = 'daily')
        OR (t.is_completed = 0 AND t.schedule_type != 'daily'))
    ORDER BY t.is_completed ASC, t.schedule_type ASC, t.id ASC
  `).all(userId, date) as any[];

  const total = tasks.length;
  const completed = tasks.filter((t) => t.is_completed).length;

  res.json({
    data: {
      date,
      tasks: tasks.map(({ name, ...t }) => ({
        ...t,
        category: scheduleCategory({ category: t.category, name }),
        is_completed: Boolean(t.is_completed),
        is_timeout: Boolean(t.is_timeout),
      })),
      total,
      completed,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
  });
});

checkinRoutes.post('/tasks/:id/complete', (req, res) => {
  const userId = req.user!.id;
  const task = db.prepare(`
    SELECT t.*, s.score, s.category, s.name FROM checkin_tasks t
    JOIN checkin_schedules s ON t.schedule_id = s.id
    WHERE t.id = ? AND s.user_id = ?
  `).get(req.params.id, userId) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE checkin_tasks SET is_completed = 1, completed_at = ? WHERE id = ?'
  ).run(now, req.params.id);

  const xp = awardXp(userId, 'checkin', task.id, scheduleCategory(task), Math.max(task.score || 0, MIN_CHECKIN_XP));
  res.json({ success: true, xp });
});

checkinRoutes.post('/tasks/:id/uncomplete', (req, res) => {
  const userId = req.user!.id;
  const task = db.prepare(`
    SELECT t.* FROM checkin_tasks t
    JOIN checkin_schedules s ON t.schedule_id = s.id
    WHERE t.id = ? AND s.user_id = ?
  `).get(req.params.id, userId) as any;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare(
    'UPDATE checkin_tasks SET is_completed = 0, completed_at = NULL, is_timeout = 0 WHERE id = ?'
  ).run(req.params.id);
  revokeXp('checkin', task.id);
  res.json({ success: true });
});

// --- Schedules ---

checkinRoutes.get('/schedules', (req, res) => {
  const userId = req.user!.id;
  const schedules = db.prepare(
    'SELECT * FROM checkin_schedules WHERE user_id = ? ORDER BY is_active DESC, type, name'
  ).all(userId);
  res.json({
    data: (schedules as any[]).map((s) => ({
      ...s,
      category: scheduleCategory(s),
      is_active: Boolean(s.is_active),
    })),
  });
});

checkinRoutes.post('/schedules', (req, res) => {
  const userId = req.user!.id;
  const { name, type, score, category } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'name and type are required' });
  }

  const result = db.prepare(
    'INSERT INTO checkin_schedules (name, type, score, user_id, category) VALUES (?, ?, ?, ?, ?)'
  ).run(name, type, score || 0, userId, isAttribute(category) ? category : null);

  const scheduleId = result.lastInsertRowid;

  if (type !== 'daily') {
    const today = localDate(new Date());
    db.prepare(
      'INSERT INTO checkin_tasks (schedule_id, schedule_name, task_date, schedule_type) VALUES (?, ?, ?, ?)'
    ).run(scheduleId, name, today, type);
  }

  const schedule = db.prepare('SELECT * FROM checkin_schedules WHERE id = ?').get(scheduleId);
  res.status(201).json({ data: schedule });
});

checkinRoutes.put('/schedules/:id', (req, res) => {
  const userId = req.user!.id;
  const { name, type, score, is_active, category } = req.body;
  const existing = db.prepare(
    'SELECT * FROM checkin_schedules WHERE id = ? AND user_id = ?'
  ).get(req.params.id, userId) as any;
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const newType = type ?? existing.type;
  const newName = name ?? existing.name;
  const becomingActive = is_active === true && !existing.is_active;

  db.prepare(
    'UPDATE checkin_schedules SET name = ?, type = ?, score = ?, is_active = ?, category = ? WHERE id = ?'
  ).run(
    newName,
    newType,
    score ?? existing.score,
    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    isAttribute(category) ? category : existing.category,
    req.params.id
  );

  if (becomingActive && newType !== 'daily') {
    const today = localDate(new Date());
    const hasTask = db.prepare(
      'SELECT id FROM checkin_tasks WHERE schedule_id = ? AND is_completed = 0'
    ).get(req.params.id);
    if (!hasTask) {
      db.prepare(
        'INSERT INTO checkin_tasks (schedule_id, schedule_name, task_date, schedule_type) VALUES (?, ?, ?, ?)'
      ).run(req.params.id, newName, today, newType);
    }
  }

  const updated = db.prepare('SELECT * FROM checkin_schedules WHERE id = ?').get(req.params.id);
  res.json({ data: updated });
});

checkinRoutes.delete('/schedules/:id', (req, res) => {
  const userId = req.user!.id;
  db.prepare('DELETE FROM checkin_schedules WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ success: true });
});

// --- Scores ---

checkinRoutes.get('/scores', (req, res) => {
  const userId = req.user!.id;
  const { start, end } = req.query;
  const today = effectiveDate();

  let scores;
  if (start && end) {
    scores = db.prepare(
      'SELECT * FROM scores WHERE user_id = ? AND score_date >= ? AND score_date <= ? ORDER BY score_date DESC'
    ).all(userId, start as string, end as string);
  } else {
    scores = db.prepare(
      'SELECT * FROM scores WHERE user_id = ? ORDER BY score_date DESC LIMIT 30'
    ).all(userId);
  }

  const todayLive = db.prepare(`
    SELECT COALESCE(SUM(s.score), 0) as score
    FROM checkin_tasks t
    JOIN checkin_schedules s ON t.schedule_id = s.id
    WHERE s.user_id = ?
      AND ((t.task_date = ? AND t.schedule_type = 'daily' AND t.is_completed = 1)
        OR (t.schedule_type != 'daily' AND t.is_completed = 1 AND t.completed_at >= ? AND t.completed_at < ?))
  `).get(userId, today, ...effectiveDayBounds(today)) as any;

  const todayRecord = { id: -1, score_date: today, score: todayLive.score };
  const withoutToday = (scores as any[]).filter((s: any) => s.score_date !== today);
  const result = [...withoutToday, todayRecord].sort(
    (a, b) => a.score_date.localeCompare(b.score_date)
  );

  res.json({ data: result });
});

checkinRoutes.get('/streak', (req, res) => {
  res.json({ data: { streak: computeStreak(req.user!.id) } });
});

export function computeStreak(userId: number): number {
  const today = effectiveDate();
  const getDayStats = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN ct.is_completed = 1 THEN 1 ELSE 0 END) as done
    FROM checkin_tasks ct
    JOIN checkin_schedules cs ON ct.schedule_id = cs.id
    WHERE ct.task_date = ? AND ct.schedule_type = 'daily' AND cs.user_id = ?
  `);

  const t = getDayStats.get(today, userId) as any;
  const todayComplete = t?.total > 0 && t.done === t.total;

  let streak = 0;
  // Count back from the effective day, not the calendar one: between midnight and
  // DAY_START_HOUR the calendar day has no tasks yet, which read as a broken streak.
  for (let i = todayComplete ? 0 : 1; i < 365; i++) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - i);
    const s = getDayStats.get(localDate(d), userId) as any;
    if (!s || s.total === 0 || s.done < s.total) break;
    streak++;
  }
  return streak;
}

// ── Diary ─────────────────────────────────────────────────────────────────────
// A diary entry appended to the vault's diary folder (0_lidaning/Diaries), written
// the way the monthly note's other snippets are: "- HH:MM **Diary**" (**Weekly**,
// **Monthly**, **Yearly** for the longer kinds), then each line of the text as an
// indented sub-item; a later entry of the same kind in the same period adds its
// lines to the earlier one's sub-items. A daily entry goes under the day's "### YYYY-MM-DD" heading;
// weekly, monthly and yearly ones under a heading for their period. Headings stay
// in date order by the day their period ends, so last week's diary written today
// lands before today's heading. shared/diary.ts decides the note and the heading.

const DIARY_DIR = process.env.DIARY_DIR ?? '0_lidaning/Diaries';
const DIARY_MAX = { daily: 4000, weekly: 20000, monthly: 20000, yearly: 20000 };
// Photos are uploaded one per request (the client shrinks each to a JPEG first, so
// any number fits under the body limit) into an attachs/ folder beside the note,
// Obsidian's "./attachs" attachment setting. The entry then names them in `photos`,
// and each is embedded as a "![[name]]" sub-item after the text.
const DIARY_PHOTO_NAME = /^diary-\d{8}-\d{6}-\d+\.jpg$/;

function diaryNoteFile(root: string, type: DiaryType, previous: unknown, now: Date) {
  const period = diaryPeriod(type, localDate(now), type !== 'daily' && previous === true);
  const rel = `${DIARY_DIR}/${period.note}`;
  return { period, rel, file: path.join(root, rel) };
}

function mkdirOwned(dir: string, owner: fs.Stats) {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  try { fs.chownSync(dir, owner.uid, owner.gid); } catch { /* best effort */ }
}

// The phone's link drops large request bodies (a 0.4 MB photo never arrived in 25 s,
// while small requests went through), so a photo comes in 64 KB pieces, each its own
// request: `upload` names the photo, `offset` is where the piece goes, and the last
// piece has `done=1`. Pieces collect in a temp file; a retried piece overwrites from
// its offset. On the last piece the JPEG moves into the note's attachs/ folder.
const UPLOAD_DIR = path.join(os.tmpdir(), 'besmart-diary-uploads');
const UPLOAD_MAX = 10 * 1024 * 1024;

checkinRoutes.post('/diary/photo', express.raw({ type: 'application/octet-stream', limit: '1mb' }), (req, res) => {
  const chunk = req.body;
  const upload = String(req.query.upload ?? '');
  const offset = Number(req.query.offset);
  if (!Buffer.isBuffer(chunk) || !/^[a-z0-9]{8,32}$/.test(upload) || !Number.isInteger(offset) || offset < 0) {
    return res.status(400).json({ error: 'Bad upload' });
  }
  const type: DiaryType = isDiaryType(req.query.type) ? req.query.type : 'daily';
  const cfg = getUserVaultConfig(req.user!.id);
  if (!cfg) return res.status(400).json({ error: 'No vault configured' });

  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    // Pieces of photos whose entry was never saved.
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      try { if (Date.now() - fs.statSync(path.join(UPLOAD_DIR, f)).mtimeMs > 86_400_000) fs.unlinkSync(path.join(UPLOAD_DIR, f)); } catch { /* gone */ }
    }
    const part = path.join(UPLOAD_DIR, `${req.user!.id}-${upload}.part`);
    const size = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (offset > size) return res.status(409).json({ error: 'Missing piece', received: size });
    if (offset + chunk.length > UPLOAD_MAX) return res.status(400).json({ error: 'Photo too large' });
    const fd = fs.openSync(part, size ? 'r+' : 'w');
    try {
      fs.ftruncateSync(fd, offset);
      fs.writeSync(fd, chunk, 0, chunk.length, offset);
    } finally { fs.closeSync(fd); }
    if (req.query.done !== '1') return res.json({ received: offset + chunk.length });

    const head = Buffer.alloc(3);
    const fd2 = fs.openSync(part, 'r');
    try { fs.readSync(fd2, head, 0, 3, 0); } finally { fs.closeSync(fd2); }
    // JPEG files start with FF D8 FF.
    if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
      fs.unlinkSync(part);
      return res.status(400).json({ error: 'Photos must be JPEG' });
    }
    const now = new Date();
    const { file } = diaryNoteFile(cfg.vaultRoot, type, req.query.previous === '1', now);
    const owner = fs.statSync(cfg.vaultRoot);
    const dir = path.join(path.dirname(file), 'attachs');
    mkdirOwned(dir, owner);
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${localDate(now).replace(/-/g, '')}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    let n = 1, name: string;
    do name = `diary-${stamp}-${n++}.jpg`; while (fs.existsSync(path.join(dir, name)));
    // copy + unlink: the temp dir and the vault may be on different filesystems.
    fs.copyFileSync(part, path.join(dir, name));
    fs.unlinkSync(part);
    try { fs.chownSync(path.join(dir, name), owner.uid, owner.gid); } catch { /* best effort */ }
    res.json({ name });
  } catch (err) {
    res.status(500).json({ error: `Couldn't save the photo: ${(err as Error).message}` });
  }
});

checkinRoutes.post('/diary', (req, res) => {
  const text: string = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const type: DiaryType = isDiaryType(req.body?.type) ? req.body.type : 'daily';
  const photos: unknown = req.body?.photos ?? [];
  if (!Array.isArray(photos) || !photos.every((p) => typeof p === 'string' && DIARY_PHOTO_NAME.test(p))) {
    return res.status(400).json({ error: 'Bad photos' });
  }
  if (!text && !photos.length) return res.status(400).json({ error: 'Write something first' });
  if (text.length > DIARY_MAX[type]) return res.status(400).json({ error: `Too long (${DIARY_MAX[type]} characters at most)` });
  const cfg = getUserVaultConfig(req.user!.id);
  if (!cfg) return res.status(400).json({ error: 'No vault configured' });

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const { period, rel, file } = diaryNoteFile(cfg.vaultRoot, type, req.body?.previous, now);
  try {
    const owner = fs.statSync(cfg.vaultRoot);
    mkdirOwned(path.dirname(file), owner);
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    // A line typed as a list item ("- x") is not bulleted twice.
    const lines = text.split(/\r?\n/).map((l) => l.trim().replace(/^[-*+]\s+/, '')).filter(Boolean);
    lines.push(...photos.map((p) => `![[${p}]]`));
    const label = { daily: 'Diary', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }[type];
    const entry = [`- ${time} **${label}**`, ...lines.map((l) => `\t- ${l}`)];

    const note = existing ? existing.replace(/\r\n/g, '\n').replace(/\n*$/, '').split('\n') : [];
    const headings = note.flatMap((l, i) => {
      const m = l.match(/^(#{1,6})\s+(.*?)\s*$/);
      return m ? [{ i, level: m[1].length, key: diaryHeadingKey(m[2]) }] : [];
    });
    const own = headings.filter((h) => h.key === period.key).pop();
    if (own) {
      const sectionEnd = headings.find((h) => h.i > own.i && h.level <= own.level)?.i ?? note.length;
      // The period already has an entry of this kind: its new lines join that
      // entry's sub-items instead of starting a second "- HH:MM **Diary**".
      const entryRe = new RegExp(`^- \\d{1,2}:\\d{2} \\*\\*${label}\\*\\*\\s*$`);
      let prev = -1;
      for (let i = own.i + 1; i < sectionEnd; i++) if (entryRe.test(note[i])) prev = i;
      if (prev >= 0) {
        let end = prev + 1;
        while (end < sectionEnd && /^\s+\S/.test(note[end])) end++;
        note.splice(end, 0, ...entry.slice(1));
      } else {
        // Append to the end of the period's section, before any blank lines that
        // separate it from the next heading.
        let end = sectionEnd;
        while (end > own.i + 1 && !note[end - 1].trim()) end--;
        note.splice(end, 0, ...entry);
      }
    } else {
      const periodEnd = diaryKeyEnd(period.key);
      const next = headings.find((h) => h.key && diaryKeyEnd(h.key) > periodEnd);
      const section = [`### ${period.heading}`, '', ...entry];
      if (next) note.splice(next.i, 0, ...section, '');
      else note.push(...(note.length ? [''] : []), ...section);
    }
    fs.writeFileSync(file, `${note.join('\n')}\n`);
    if (!existing) { try { fs.chownSync(file, owner.uid, owner.gid); } catch { /* best effort */ } }
    res.json({ success: true, path: rel, heading: period.heading });
  } catch (err) {
    res.status(500).json({ error: `Couldn't write the diary: ${(err as Error).message}` });
  }
});
