import db from './database.js';
import { sendPushToUser } from './push.js';

// An all-day item (no time) reminds at this hour, local time.
export const ALL_DAY_REMIND_HOUR = 9;
// A reminder more overdue than this (the server was down) is dropped, not sent late.
const STALE_MS = 6 * 60 * 60 * 1000;

// When to alert for an item, as a UTC ISO string, or null for no reminder.
// date/time are local (the container's TZ), remind_before is minutes before.
export function computeRemindAt(date: string, time: string | null, remindBefore: number | null): string | null {
  if (remindBefore == null) return null;
  const at = new Date(`${date}T${time ?? `${String(ALL_DAY_REMIND_HOUR).padStart(2, '0')}:00`}:00`);
  if (isNaN(at.getTime())) return null;
  at.setMinutes(at.getMinutes() - remindBefore);
  return at.toISOString();
}

function formatWhen(date: string, time: string | null): string {
  const d = new Date(`${date}T00:00:00`);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return time ? `${day}, ${time}` : day;
}

let running = false;

// Runs every 30 s from index.ts. Each item is marked sent before its push goes out:
// a send retries for up to ~2.5 min, and the next tick must not send it again.
export async function sendDueCalendarReminders() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const due = db.prepare(`
      SELECT * FROM calendar_events
      WHERE reminded_at IS NULL AND remind_at IS NOT NULL AND remind_at <= ? AND done = 0
      ORDER BY remind_at
    `).all(nowIso) as any[];
    const mark = db.prepare('UPDATE calendar_events SET reminded_at = ? WHERE id = ?');
    for (const ev of due) {
      mark.run(nowIso, ev.id);
      if (now.getTime() - new Date(ev.remind_at).getTime() > STALE_MS) continue;
      await sendPushToUser(ev.user_id, ev.title, `📅 ${formatWhen(ev.date, ev.time)}`, `/?date=${ev.date}`);
    }
  } catch (err) {
    console.error('Calendar reminders failed:', err);
  } finally {
    running = false;
  }
}
