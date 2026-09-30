import { Router } from 'express';
import db from '../database.js';
import { localDate, effectiveDate } from '../date.js';
import fs from 'fs';
import path from 'path';
import { awardXp, revokeXp, scheduleCategory, isAttribute, MIN_CHECKIN_XP } from '../garden.js';
import { getUserVaultConfig } from './reviews.js';

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
        OR (t.schedule_type != 'daily' AND t.is_completed = 1 AND DATE(t.completed_at) = ?))
  `).get(userId, today, today) as any;

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
  for (let i = todayComplete ? 0 : 1; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = getDayStats.get(localDate(d), userId) as any;
    if (!s || s.total === 0 || s.done < s.total) break;
    streak++;
  }
  return streak;
}

// ── Diary ─────────────────────────────────────────────────────────────────────
// A short note about the day, appended to the vault's monthly diary
// (0_lidaning/Diaries/YYYY/YYYY-MM.md) the way its other entries are written:
// a "### YYYY-MM-DD" heading per day, then "- HH:MM text".

const DIARY_DIR = process.env.DIARY_DIR ?? '0_lidaning/Diaries';

checkinRoutes.post('/diary', (req, res) => {
  const text: string = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Write something first' });
  if (text.length > 4000) return res.status(400).json({ error: 'Too long (4000 characters at most)' });
  const cfg = getUserVaultConfig(req.user!.id);
  if (!cfg) return res.status(400).json({ error: 'No vault configured' });

  const now = new Date();
  const day = localDate(now);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const rel = `${DIARY_DIR}/${day.slice(0, 4)}/${day.slice(0, 7)}.md`;
  const file = path.join(cfg.vaultRoot, rel);
  try {
    const owner = fs.statSync(cfg.vaultRoot);
    if (!fs.existsSync(path.dirname(file))) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { fs.chownSync(path.dirname(file), owner.uid, owner.gid); } catch { /* best effort */ }
    }
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    // The last day heading in the note (older ones are numbered: "### ⁠5. 2026-09-22").
    const lastDay = [...existing.matchAll(/^#{1,6}\s.*?(\d{4}-\d{2}-\d{2})\s*$/gm)].pop()?.[1];
    const [first, ...rest] = text.split(/\r?\n/);
    const entry = [`- ${time} ${first}`, ...rest.filter((l) => l.trim()).map((l) => `\t${l}`)].join('\n');
    let add = lastDay === day ? '' : `${existing ? '\n' : ''}### ${day}\n\n`;
    if (existing && !existing.endsWith('\n')) add = `\n${add}`;
    fs.appendFileSync(file, `${add}${entry}\n`);
    if (!existing) { try { fs.chownSync(file, owner.uid, owner.gid); } catch { /* best effort */ } }
    res.json({ success: true, path: rel });
  } catch (err) {
    res.status(500).json({ error: `Couldn't write the diary: ${(err as Error).message}` });
  }
});
