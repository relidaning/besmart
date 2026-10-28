import { Router } from 'express';
import db from '../database.js';
import { computeRemindAt, nextSeriesReminder, occurrences, REPEATS, type Repeat } from '../calendar.js';

export const calendarRoutes = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_REMIND_BEFORE = 7 * 24 * 60;

type Fields = {
  date?: string; time?: string | null; title?: string; remind_before?: number | null;
  repeat?: Repeat | null; done?: boolean; occurrence?: string;
};

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v) && !isNaN(Date.parse(v));

// Type-checks the body: a non-string bound into a query makes better-sqlite3 throw.
// `partial` allows any field to be missing (PUT).
function parseFields(body: any, partial: boolean): Fields | string {
  const out: Fields = {};
  if (body.date !== undefined || !partial) {
    if (!isDate(body.date)) return 'Invalid date';
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
  if (body.repeat !== undefined) {
    if (body.repeat === null || body.repeat === '') out.repeat = null;
    else if (!REPEATS.includes(body.repeat)) return 'Invalid repeat';
    else out.repeat = body.repeat;
  }
  if (body.done !== undefined) {
    if (typeof body.done !== 'boolean') return 'Invalid done';
    out.done = body.done;
  }
  if (body.occurrence !== undefined) {
    if (!isDate(body.occurrence)) return 'Invalid occurrence';
    out.occurrence = body.occurrence;
  }
  return out;
}

// A one-off reminder whose time has already passed when saved is marked sent, so saving
// an item for earlier today doesn't alert at once. A series arms its next occurrence.
function reminderColumns(date: string, time: string | null, remindBefore: number | null, repeat: Repeat | null) {
  const nowIso = new Date().toISOString();
  if (repeat) {
    const next = nextSeriesReminder({ date, time, remind_before: remindBefore, repeat }, nowIso);
    return { remindAt: next?.at ?? null, remindedAt: null };
  }
  const remindAt = computeRemindAt(date, time, remindBefore);
  return { remindAt, remindedAt: remindAt && remindAt <= nowIso ? nowIso : null };
}

// One entry per occurrence: `date` is the occurrence, `start_date` the series' first day.
function occurrenceRows(userId: number, from: string, to: string) {
  const rows = db.prepare(`
    SELECT id, date, time, title, remind_before, repeat, done FROM calendar_events
    WHERE user_id = ? AND ((repeat IS NULL AND date BETWEEN ? AND ?) OR (repeat IS NOT NULL AND date <= ?))
  `).all(userId, from, to, to) as any[];
  const doneDates = db.prepare('SELECT date FROM calendar_done WHERE event_id = ? AND date BETWEEN ? AND ?');
  const out: any[] = [];
  for (const r of rows) {
    if (!r.repeat) {
      out.push({ ...r, start_date: r.date, done: !!r.done });
      continue;
    }
    const done = new Set((doneDates.all(r.id, from, to) as any[]).map((d) => d.date));
    for (const date of occurrences(r.date, r.repeat, from, to)) {
      out.push({ ...r, date, start_date: r.date, done: done.has(date) });
    }
  }
  return out.sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id - b.id);
}

// GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (both inclusive)
calendarRoutes.get('/', (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || from > to) {
    res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });
    return;
  }
  // A weekly series over a long range would be a big answer; the UI asks for ≤ 90 days.
  if (Date.parse(to) - Date.parse(from) > 400 * 86400000) {
    res.status(400).json({ error: 'Range too long' });
    return;
  }
  res.json(occurrenceRows(req.user!.id, from, to));
});

calendarRoutes.post('/', (req, res) => {
  const f = parseFields(req.body ?? {}, false);
  if (typeof f === 'string') {
    res.status(400).json({ error: f });
    return;
  }
  const time = f.time ?? null;
  const remindBefore = f.remind_before === undefined ? 0 : f.remind_before;
  const repeat = f.repeat ?? null;
  const { remindAt, remindedAt } = reminderColumns(f.date!, time, remindBefore, repeat);
  const info = db.prepare(`
    INSERT INTO calendar_events (user_id, date, time, title, remind_before, repeat, remind_at, reminded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user!.id, f.date, time, f.title, remindBefore, repeat, remindAt, remindedAt);
  res.json({ id: Number(info.lastInsertRowid) });
});

// Edits the item, or the whole series. `{ done, occurrence }` ticks off one occurrence
// of a series.
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
  if (ev.repeat && f.done !== undefined) {
    if (!f.occurrence) {
      res.status(400).json({ error: 'occurrence is required for a repeating item' });
      return;
    }
    if (f.done) db.prepare('INSERT OR IGNORE INTO calendar_done (event_id, date) VALUES (?, ?)').run(ev.id, f.occurrence);
    else db.prepare('DELETE FROM calendar_done WHERE event_id = ? AND date = ?').run(ev.id, f.occurrence);
  }
  const date = f.date ?? ev.date;
  const time = f.time !== undefined ? f.time : ev.time;
  const remindBefore = f.remind_before !== undefined ? f.remind_before : ev.remind_before;
  const repeat = f.repeat !== undefined ? f.repeat : ev.repeat;
  let { remind_at: remindAt, reminded_at: remindedAt } = ev;
  // Moving the item or its reminder arms it again; ticking it off alone doesn't.
  if (date !== ev.date || time !== ev.time || remindBefore !== ev.remind_before || repeat !== ev.repeat) {
    ({ remindAt, remindedAt } = reminderColumns(date, time, remindBefore, repeat));
  }
  // A one-off's done lives on the row; a series' in calendar_done (handled above).
  const done = !ev.repeat && f.done !== undefined ? (f.done ? 1 : 0) : ev.done;
  db.transaction(() => {
    db.prepare(`
      UPDATE calendar_events SET date = ?, time = ?, title = ?, remind_before = ?, repeat = ?, remind_at = ?, reminded_at = ?, done = ?
      WHERE id = ?
    `).run(date, time, f.title ?? ev.title, remindBefore, repeat, remindAt, remindedAt, done, ev.id);
    // A series that stops repeating, or moves, starts its ticks afresh.
    if (ev.repeat && (repeat !== ev.repeat || date !== ev.date)) {
      db.prepare('DELETE FROM calendar_done WHERE event_id = ?').run(ev.id);
    }
  })();
  res.json({ ok: true });
});

calendarRoutes.delete('/:id', (req, res) => {
  const info = db.transaction(() => {
    const r = db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
    if (r.changes) db.prepare('DELETE FROM calendar_done WHERE event_id = ?').run(req.params.id);
    return r;
  })();
  if (info.changes === 0) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});
