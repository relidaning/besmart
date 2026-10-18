import db from './database.js';
import { localDate, effectiveDate, effectiveDayBounds } from './date.js';
import { intervalFor } from './fsrs.js';


const PERIOD_TYPES = ['weekly', 'monthly', 'seasonly', 'yearly'] as const;

// Whether `day` (noon of a local date) is the last day of a period of this type.
function isPeriodEnd(type: typeof PERIOD_TYPES[number], day: Date): boolean {
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  const lastOfMonth = next.getDate() === 1;
  switch (type) {
    case 'weekly': return day.getDay() === 0;
    case 'monthly': return lastOfMonth;
    case 'seasonly': return lastOfMonth && day.getMonth() % 3 === 2;
    case 'yearly': return lastOfMonth && day.getMonth() === 11;
  }
}

export function scheduleJob() {
  // The app's day runs until DAY_START_HOUR (06:00), not midnight: check-ins done at
  // 01:00 belong to the day before. Using calendar dates here closed "yesterday" at
  // midnight and froze its score before those late check-ins landed.
  const today = effectiveDate();
  const prev = new Date(`${today}T12:00:00`);
  prev.setDate(prev.getDate() - 1);
  const yesterday = localDate(prev);

  const run = db.transaction(() => {
    // The weekly/monthly/seasonal/yearly triggers follow the effective day as well. With
    // the wall clock they fired from midnight, when the effective day is still the day
    // before: the task got that date, and after 06:00 the same-date check below no longer
    // found it, so every such task was inserted twice.
    const now = new Date(`${today}T12:00:00`);

    // Get all users with active schedules
    const userIds = db.prepare(
      'SELECT DISTINCT user_id FROM checkin_schedules WHERE is_active = 1 AND user_id IS NOT NULL'
    ).all() as { user_id: number }[];

    const insertTask = db.prepare(
      'INSERT INTO checkin_tasks (schedule_id, schedule_name, task_date, schedule_type) VALUES (?, ?, ?, ?)'
    );

    for (const { user_id } of userIds) {
      // Generate daily tasks for today
      const dailySchedules = db.prepare(
        "SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = 'daily' AND user_id = ?"
      ).all(user_id) as any[];

      const existingDaily = db.prepare(`
        SELECT t.schedule_id FROM checkin_tasks t
        JOIN checkin_schedules s ON t.schedule_id = s.id
        WHERE t.task_date = ? AND t.schedule_type = 'daily' AND s.user_id = ?
      `).all(today, user_id) as any[];

      const existingDailyIds = new Set(existingDaily.map((e) => e.schedule_id));
      for (const s of dailySchedules) {
        if (!existingDailyIds.has(s.id)) {
          insertTask.run(s.id, s.name, today, 'daily');
        }
      }

      // Mark yesterday's uncompleted daily tasks as timed out
      const unfinished = db.prepare(`
        SELECT t.id FROM checkin_tasks t
        JOIN checkin_schedules s ON t.schedule_id = s.id
        WHERE t.task_date = ? AND t.is_completed = 0 AND t.schedule_type = 'daily' AND s.user_id = ?
      `).all(yesterday, user_id) as any[];

      for (const t of unfinished) {
        db.prepare('UPDATE checkin_tasks SET is_timeout = 1 WHERE id = ?').run(t.id);
      }

      // Record yesterday's earned score (sum of completed task scores — daily + non-daily).
      // Recomputed on every run, so a late completion or undo still corrects it.
      const existingScore = db.prepare(
        'SELECT id FROM scores WHERE score_date = ? AND user_id = ?'
      ).get(yesterday, user_id) as { id: number } | undefined;
      {
        const earned = (db.prepare(`
          SELECT COALESCE(SUM(s.score), 0) as total
          FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE s.user_id = ?
            AND ((t.task_date = ? AND t.schedule_type = 'daily' AND t.is_completed = 1)
              OR (t.schedule_type != 'daily' AND t.is_completed = 1 AND t.completed_at >= ? AND t.completed_at < ?))
        `).get(user_id, yesterday, ...effectiveDayBounds(yesterday)) as any).total;

        if (existingScore) {
          db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(earned, existingScore.id);
        } else {
          db.prepare('INSERT INTO scores (score_date, score, user_id) VALUES (?, ?, ?)')
            .run(yesterday, earned, user_id);
        }
      }

      // Each weekly/monthly/seasonal/yearly task opens once, on the last day of its period
      // (Sunday, the month's last day, Mar 31/Jun 30/Sep 30/Dec 31, Dec 31), so it is done
      // looking back on the period. The same-date check keeps the hourly runs from
      // inserting it again.
      for (const type of PERIOD_TYPES) {
        if (!isPeriodEnd(type, now)) continue;
        const schedules = db.prepare(
          'SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = ? AND user_id = ?'
        ).all(type, user_id) as any[];
        const existing = db.prepare(`
          SELECT t.schedule_id FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE t.task_date = ? AND t.schedule_type = ? AND s.user_id = ?
        `).all(today, type, user_id) as any[];
        const existingIds = new Set(existing.map((e) => e.schedule_id));
        for (const s of schedules) {
          if (!existingIds.has(s.id)) insertTask.run(s.id, s.name, today, type);
        }
      }
    }

    // Safety net for review courses left without a pending review (the normal path,
    // POST /reviews/records/:id/complete, always schedules the next one with FSRS).
    // This replaced a legacy job that re-derived "next" reviews from a fixed
    // 1/3/7/15/30/60/120/240-day ladder, a second scheduler that fought FSRS.
    const orphans = db.prepare(`
      SELECT c.id, c.fsrs_stability, c.fsrs_last_review,
        (SELECT MAX(reviewed_times) FROM review_records WHERE course_id = c.id) AS times
      FROM review_courses c
      WHERE c.excluded_at IS NULL
        AND EXISTS (SELECT 1 FROM review_records WHERE course_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM review_records WHERE course_id = c.id AND is_reviewed = 0)
    `).all() as any[];
    const insertRecord = db.prepare(
      'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date, interval_days) VALUES (?, 0, ?, ?, ?)'
    );
    for (const c of orphans) {
      const interval = c.fsrs_stability ? intervalFor(c.fsrs_stability) : 1;
      const due = new Date(`${c.fsrs_last_review ?? today}T12:00:00`);
      due.setDate(due.getDate() + interval);
      insertRecord.run(c.id, (c.times ?? 0) + 1, localDate(due), interval);
    }
  });

  try {
    run();
    console.log('Scheduler job completed');
  } catch (err) {
    console.error('Scheduler error:', err);
  }

  // SQLite only checkpoints on its own once the WAL holds 1000 pages (about 4 MB), which
  // takes this app around two weeks: until then besmart.db itself is that far behind, and
  // a plain copy of it is an old backup. PASSIVE never waits on a reader.
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (err) {
    console.error('WAL checkpoint failed:', err);
  }
}
