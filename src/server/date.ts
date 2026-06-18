// getFullYear/getMonth/getDate respect the TZ env var (Asia/Shanghai),
// unlike toISOString() which is always UTC.
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Hours before DAY_START_HOUR (default 6) are treated as the previous day.
const DAY_START_HOUR = parseInt(process.env.DAY_START_HOUR ?? '6', 10);

export function effectiveDate(): string {
  const now = new Date();
  if (now.getHours() < DAY_START_HOUR) {
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    return localDate(prev);
  }
  return localDate(now);
}
