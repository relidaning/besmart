import db from './database.js';
import { sendPushToUser } from './push.js';
import { localDate } from './date.js';

// An all-day item (no time) reminds at this hour, local time.
export const ALL_DAY_REMIND_HOUR = 9;
// A reminder more overdue than this (the server was down) is dropped, not sent late.
const STALE_MS = 6 * 60 * 60 * 1000;

export const REPEATS = ['weekly', 'monthly', 'yearly'] as const;
export type Repeat = (typeof REPEATS)[number];

// When to alert for an item, as a UTC ISO string, or null for no reminder.
// date/time are local (the container's TZ), remind_before is minutes before.
export function computeRemindAt(date: string, time: string | null, remindBefore: number | null): string | null {
  if (remindBefore == null) return null;
  const at = new Date(`${date}T${time ?? `${String(ALL_DAY_REMIND_HOUR).padStart(2, '0')}:00`}:00`);
  if (isNaN(at.getTime())) return null;
  at.setMinutes(at.getMinutes() - remindBefore);
  return at.toISOString();
}

// Date-only arithmetic in UTC, so no time zone shift can move a day.
const ymd = (s: string) => s.split('-').map(Number);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const daysIn = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

// The k-th occurrence (k = 0 is the start). A monthly item on the 31st falls on the last
// day of shorter months, and a yearly one on Feb 29 on Feb 28, counted from the start
// each time so the 31st comes back after a short month.
export function nthOccurrence(start: string, repeat: Repeat, k: number): string {
  const [y, m, d] = ymd(start);
  if (repeat === 'weekly') return fmt(new Date(Date.UTC(y, m - 1, d + 7 * k)));
  const total = repeat === 'monthly' ? m - 1 + k : m - 1;
  const yy = y + (repeat === 'yearly' ? k : Math.floor(total / 12));
  const mm = ((total % 12) + 12) % 12;
  return fmt(new Date(Date.UTC(yy, mm, Math.min(d, daysIn(yy, mm)))));
}

// A k at or before the first occurrence on or after `from`, to skip a long history.
function firstK(start: string, repeat: Repeat, from: string): number {
  if (from <= start) return 0;
  const [sy, sm] = ymd(start);
  const [fy, fm] = ymd(from);
  if (repeat === 'weekly') return Math.max(0, Math.floor((Date.parse(from) - Date.parse(start)) / (7 * 86400000)) - 1);
  if (repeat === 'monthly') return Math.max(0, (fy - sy) * 12 + fm - sm - 1);
  return Math.max(0, fy - sy - 1);
}

// The series' occurrence dates within [from, to].
export function occurrences(start: string, repeat: Repeat, from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = firstK(start, repeat, from); ; k++) {
    const d = nthOccurrence(start, repeat, k);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

// The first occurrence whose reminder comes after `afterIso`, or null (no reminder).
export function nextSeriesReminder(
  ev: { date: string; time: string | null; remind_before: number | null; repeat: Repeat },
  afterIso: string,
): { date: string; at: string } | null {
  if (ev.remind_before == null) return null;
  // remind_before is at most a week, so an occurrence 8 days back can't remind later.
  const from = localDate(new Date(Date.parse(afterIso) - 8 * 86400000));
  for (let k = firstK(ev.date, ev.repeat, from), n = 0; n < 1000; k++, n++) {
    const date = nthOccurrence(ev.date, ev.repeat, k);
    const at = computeRemindAt(date, ev.time, ev.remind_before);
    if (at && at > afterIso) return { date, at };
  }
  return null;
}

function formatWhen(date: string, time: string | null): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return time ? `${day}, ${time}` : day;
}

let running = false;

// Runs every 30 s from index.ts. Each reminder is marked before its push goes out:
// a send retries for up to ~2.5 min, and the next tick must not send it again.
// A one-off item is marked sent (`reminded_at`); a series moves `remind_at` on to its
// next occurrence, and skips an occurrence already ticked off.
export async function sendDueCalendarReminders() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const due = db.prepare(`
      SELECT * FROM calendar_events
      WHERE reminded_at IS NULL AND remind_at IS NOT NULL AND remind_at <= ? AND (done = 0 OR repeat IS NOT NULL)
      ORDER BY remind_at
    `).all(nowIso) as any[];
    const mark = db.prepare('UPDATE calendar_events SET reminded_at = ? WHERE id = ?');
    const advance = db.prepare('UPDATE calendar_events SET remind_at = ? WHERE id = ?');
    const isDone = db.prepare('SELECT 1 FROM calendar_done WHERE event_id = ? AND date = ?');
    for (const ev of due) {
      let date = ev.date;
      let skip = false;
      if (ev.repeat) {
        // The occurrence this reminder is for: the first one reminding at remind_at.
        const cur = nextSeriesReminder(ev, new Date(Date.parse(ev.remind_at) - 1).toISOString());
        const next = nextSeriesReminder(ev, ev.remind_at > nowIso ? ev.remind_at : nowIso);
        advance.run(next?.at ?? null, ev.id);
        if (!cur) continue;
        date = cur.date;
        skip = !!isDone.get(ev.id, date);
      } else {
        mark.run(nowIso, ev.id);
      }
      if (skip || now.getTime() - new Date(ev.remind_at).getTime() > STALE_MS) continue;
      await sendPushToUser(ev.user_id, ev.title, `📅 ${formatWhen(date, ev.time)}`, `/?date=${date}`);
    }
  } catch (err) {
    console.error('Calendar reminders failed:', err);
  } finally {
    running = false;
  }
}
