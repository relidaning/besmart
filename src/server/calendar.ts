import db from './database.js';
import { sendPushToUser } from './push.js';
import { nextSeriesReminder } from './calendarDates.js';

// A reminder more overdue than this (the server was down) is dropped, not sent late.
const STALE_MS = 6 * 60 * 60 * 1000;

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
