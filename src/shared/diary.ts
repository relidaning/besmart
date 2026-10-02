// Where a diary entry goes in the vault's diary folder, by kind. Daily, weekly and
// monthly entries share the monthly note (YYYY/YYYY-MM.md); a yearly one goes to
// the year's note (YYYY/YYYY.md). Each period has its own heading in the note.
// Shared by the diary endpoint and the Check In dialog, which shows the target.
export const DIARY_TYPES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type DiaryType = (typeof DIARY_TYPES)[number];

export const isDiaryType = (v: unknown): v is DiaryType => DIARY_TYPES.includes(v as DiaryType);

export interface DiaryPeriod {
  key: string;     // '2026-10-02' | '2026-W40' | '2026-10' | '2026'
  heading: string; // heading text in the note
  label: string;   // for the UI: 'Sep 28 – Oct 4', 'September 2026', '2026'
  note: string;    // path under the diary folder
}

const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
// Dates are 'YYYY-MM-DD' strings handled in UTC, so no time zone can shift them.
const parse = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const monthNote = (day: string) => `${day.slice(0, 4)}/${day.slice(0, 7)}.md`;
const short = (day: string) => `${MONTHS[+day.slice(5, 7) - 1].slice(0, 3)} ${+day.slice(8, 10)}`;

// The period `today` falls in, or the one before it (`previous`): a weekly diary is
// often written on the Monday after, a monthly one on the 1st.
export function diaryPeriod(type: DiaryType, today: string, previous = false): DiaryPeriod {
  if (type === 'weekly') {
    const t = parse(today);
    // Weeks run Monday to Sunday and are numbered the ISO way (by their Thursday).
    const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY - (previous ? 7 * DAY : 0);
    const sunday = monday + 6 * DAY;
    const isoYear = new Date(monday + 3 * DAY).getUTCFullYear();
    const week = Math.floor((monday + 3 * DAY - Date.UTC(isoYear, 0, 1)) / (7 * DAY)) + 1;
    const key = `${isoYear}-W${pad(week)}`;
    const [from, to] = [ymd(monday), ymd(sunday)];
    return {
      key,
      heading: `Weekly ${key} (${from.slice(5)} – ${to.slice(5)})`,
      label: `${short(from)} – ${from.slice(5, 7) === to.slice(5, 7) ? +to.slice(8, 10) : short(to)}`,
      // The month the week ends in, but never a month that hasn't started yet.
      note: monthNote(to < today ? to : today),
    };
  }
  if (type === 'monthly') {
    let [y, m] = [+today.slice(0, 4), +today.slice(5, 7)];
    if (previous) [y, m] = m === 1 ? [y - 1, 12] : [y, m - 1];
    const key = `${y}-${pad(m)}`;
    return { key, heading: `Monthly ${key}`, label: `${MONTHS[m - 1]} ${y}`, note: `${y}/${key}.md` };
  }
  if (type === 'yearly') {
    const key = String(+today.slice(0, 4) - (previous ? 1 : 0));
    return { key, heading: `Yearly ${key}`, label: key, note: `${key}/${key}.md` };
  }
  return { key: today, heading: today, label: today, note: monthNote(today) };
}

// Early in a period the diary is most likely about the one that just ended.
export function defaultsToPrevious(type: DiaryType, today: string): boolean {
  if (type === 'weekly') return [1, 2].includes(new Date(parse(today)).getUTCDay()); // Mon, Tue
  if (type === 'monthly') return +today.slice(8, 10) <= 5;
  if (type === 'yearly') return today.slice(5, 7) === '01';
  return false;
}

// The period a note heading stands for, or null when it isn't a diary heading.
// Day headings may be numbered ("### 5. 2026-09-22"), so only their end is matched.
export function diaryHeadingKey(heading: string): string | null {
  const period = heading.match(/^(?:Weekly (\d{4}-W\d{2})|Monthly (\d{4}-\d{2})|Yearly (\d{4}))(?!\S)/);
  if (period) return period[1] ?? period[2] ?? period[3];
  return heading.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? null;
}
