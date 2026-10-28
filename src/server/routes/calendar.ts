import { Router } from 'express';
import db from '../database.js';
import { computeRemindAt } from '../calendar.js';

export const calendarRoutes = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_REMIND_BEFORE = 7 * 24 * 60;

type Fields = { date?: string; time?: string | null; title?: string; remind_before?: number | null; done?: boolean };

// Type-checks the body: a non-string bound into a query makes better-sqlite3 throw.
// `partial` allows any field to be missing (PUT).
function parseFields(body: any, partial: boolean): Fields | string {
  const out: Fields = {};
  if (body.date !== undefined || !partial) {
    if (typeof body.date !== 'string' || !DATE_RE.test(body.date) || isNaN(Date.parse(body.date))) return 'Invalid date';
    out.date = body.date;
  }
  if (body.time !== undefined) {
    if (body.time === null || body.time === '') out.time = null;
    else if (typeof body.time !== 'string' || !TIME_RE.test(body.time)) return 'Invalid time';
    else out.time = body.time;
  }
  if (body.title !== undefined || !partial) {
    if (typeof body.title !== 'string' || !body.title.trim()) return 'Title is required';
    if (body.title.length > 200) return 'Title is too long';
    out.title = body.title.trim();
  }
  if (body.remind_before !== undefined) {
    const r = body.remind_before;
    if (r === null) out.remind_before = null;
    else if (!Number.isInteger(r) || r < 0 || r > MAX_REMIND_BEFORE) return 'Invalid reminder';
    else out.remind_before = r;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== 'boolean') return 'Invalid done';
    out.done = body.done;
  }
  return out;
}

// A reminder whose time has already passed when saved is marked sent, so saving an
// item for earlier today doesn't alert at once.
function reminderColumns(date: string, time: string | null, remindBefore: number | null) {
  const remindAt = computeRemindAt(date, time, remindBefore);
  const nowIso = new Date().toISOString();
  return { remindAt, remindedAt: remindAt && remindAt <= nowIso ? nowIso : null };
}

// GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (both inclusive)
calendarRoutes.get('/', (req, res) => {
  const { from, to } = req.query;
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
    return;
  }
  const rows = db.prepare(`
    SELECT id, date, time, title, remind_before, remind_at, done FROM calendar_events
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date, time IS NOT NULL, time, id
  `).all(req.user!.id, from, to) as any[];
  res.json(rows.map((r) => ({ ...r, done: !!r.done })));
});

calendarRoutes.post('/', (req, res) => {
  const f = parseFields(req.body ?? {}, false);
  if (typeof f === 'string') {
    res.status(400).json({ error: f });
    return;
  }
  const time = f.time ?? null;
  const remindBefore = f.remind_before === undefined ? 0 : f.remind_before;
  const { remindAt, remindedAt } = reminderColumns(f.date!, time, remindBefore);
  const info = db.prepare(`
    INSERT INTO calendar_events (user_id, date, time, title, remind_before, remind_at, reminded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user!.id, f.date, time, f.title, remindBefore, remindAt, remindedAt);
  const row = db.prepare('SELECT id, date, time, title, remind_before, remind_at, done FROM calendar_events WHERE id = ?')
    .get(info.lastInsertRowid) as any;
  res.json({ ...row, done: !!row.done });
});

calendarRoutes.put('/:id', (req, res) => {
  const ev = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as any;
  if (!ev) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const f = parseFields(req.body ?? {}, true);
  if (typeof f === 'string') {
    res.status(400).json({ error: f });
    return;
  }
  const date = f.date ?? ev.date;
  const time = f.time !== undefined ? f.time : ev.time;
  const remindBefore = f.remind_before !== undefined ? f.remind_before : ev.remind_before;
  let { remind_at: remindAt, reminded_at: remindedAt } = ev;
  // Moving the item or its reminder arms it again; ticking it off alone doesn't.
  if (date !== ev.date || time !== ev.time || remindBefore !== ev.remind_before) {
    ({ remindAt, remindedAt } = reminderColumns(date, time, remindBefore));
  }
  db.prepare(`
    UPDATE calendar_events SET date = ?, time = ?, title = ?, remind_before = ?, remind_at = ?, reminded_at = ?, done = ?
    WHERE id = ?
  `).run(date, time, f.title ?? ev.title, remindBefore, remindAt, remindedAt, f.done !== undefined ? (f.done ? 1 : 0) : ev.done, ev.id);
  const row = db.prepare('SELECT id, date, time, title, remind_before, remind_at, done FROM calendar_events WHERE id = ?').get(ev.id) as any;
  res.json({ ...row, done: !!row.done });
});

calendarRoutes.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});
