// getFullYear/getMonth/getDate respect the TZ env var (Asia/Shanghai),
// unlike toISOString() which is always UTC.
export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Before 6am, treat as the previous day — matches old checkin app behavior.
export function effectiveDate(): string {
  const now = new Date();
  if (now.getHours() < 6) {
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    return localDate(prev);
  }
  return localDate(now);
}
