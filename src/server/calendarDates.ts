// Calendar date and reminder math, kept apart from the DB so it can be tested alone
// (calendarDates.test.ts).
import { localDate } from './date.js';

// An all-day item (no time) reminds at this hour, local time.
export const ALL_DAY_REMIND_HOUR = 9;
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
