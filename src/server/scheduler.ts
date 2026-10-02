import db from './database.js';
import { localDate, effectiveDate } from './date.js';
import { intervalFor } from './fsrs.js';


export function scheduleJob() {
  // The app's day runs until DAY_START_HOUR (06:00), not midnight: check-ins done at
  // 01:00 belong to the day before. Using calendar dates here closed "yesterday" at
  // midnight and froze its score before those late check-ins landed.
  const today = effectiveDate();
  const prev = new Date(`${today}T12:00:00`);
  prev.setDate(prev.getDate() - 1);
  const yesterday = localDate(prev);

  const run = db.transaction(() => {
    const now = new Date();

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
              OR (t.schedule_type != 'daily' AND t.is_completed = 1 AND DATE(t.completed_at) = ?))
        `).get(user_id, yesterday, yesterday) as any).total;

        if (existingScore) {
          db.prepare('UPDATE scores SET score = ? WHERE id = ?').run(earned, existingScore.id);
        } else {
          db.prepare('INSERT INTO scores (score_date, score, user_id) VALUES (?, ?, ?)')
            .run(yesterday, earned, user_id);
        }
      }

      // Ensure non-daily tasks exist if no uncompleted ones
      for (const type of ['weekly', 'monthly', 'seasonly', 'yearly']) {
        const hasSchedules = (db.prepare(
          'SELECT COUNT(*) as c FROM checkin_schedules WHERE is_active = 1 AND type = ? AND user_id = ?'
        ).get(type, user_id) as any).c;
        if (hasSchedules > 0) {
          const hasUncompleted = (db.prepare(`
            SELECT COUNT(*) as c FROM checkin_tasks t
            JOIN checkin_schedules s ON t.schedule_id = s.id
            WHERE t.schedule_type = ? AND t.is_completed = 0 AND s.user_id = ?
          `).get(type, user_id) as any).c;
          if (hasUncompleted === 0) {
            const typeSchedules = db.prepare(
              'SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = ? AND user_id = ?'
            ).all(type, user_id) as any[];
            for (const s of typeSchedules) {
              insertTask.run(s.id, s.name, today, type);
            }
          }
        }
      }

      // Weekly tasks on Saturday
      if (now.getDay() === 6) {
        const weeklies = db.prepare(
          "SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = 'weekly' AND user_id = ?"
        ).all(user_id) as any[];
        const existingWeekly = db.prepare(`
          SELECT t.schedule_id FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE t.task_date = ? AND t.schedule_type = 'weekly' AND s.user_id = ?
        `).all(today, user_id) as any[];
        const existingWeeklyIds = new Set(existingWeekly.map((e) => e.schedule_id));
        for (const s of weeklies) {
          if (!existingWeeklyIds.has(s.id)) insertTask.run(s.id, s.name, today, 'weekly');
        }
      }

      // Monthly tasks on 1st of month
      if (now.getDate() === 1) {
        const monthlies = db.prepare(
          "SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = 'monthly' AND user_id = ?"
        ).all(user_id) as any[];
        const existingMonthly = db.prepare(`
          SELECT t.schedule_id FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE t.task_date = ? AND t.schedule_type = 'monthly' AND s.user_id = ?
        `).all(today, user_id) as any[];
        const existingMonthlyIds = new Set(existingMonthly.map((e) => e.schedule_id));
        for (const s of monthlies) {
          if (!existingMonthlyIds.has(s.id)) insertTask.run(s.id, s.name, today, 'monthly');
        }
      }

      // Seasonal tasks
      if (now.getDate() === 1 && [3, 6, 9, 0].includes(now.getMonth())) {
        const seasonlies = db.prepare(
          "SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = 'seasonly' AND user_id = ?"
        ).all(user_id) as any[];
        const existingSeasonly = db.prepare(`
          SELECT t.schedule_id FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE t.task_date = ? AND t.schedule_type = 'seasonly' AND s.user_id = ?
        `).all(today, user_id) as any[];
        const existingSeasonlyIds = new Set(existingSeasonly.map((e) => e.schedule_id));
        for (const s of seasonlies) {
          if (!existingSeasonlyIds.has(s.id)) insertTask.run(s.id, s.name, today, 'seasonly');
        }
      }

      // Yearly tasks on Jan 1
      if (now.getDate() === 1 && now.getMonth() === 0) {
        const yearlies = db.prepare(
          "SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = 'yearly' AND user_id = ?"
        ).all(user_id) as any[];
        const existingYearly = db.prepare(`
          SELECT t.schedule_id FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE t.task_date = ? AND t.schedule_type = 'yearly' AND s.user_id = ?
        `).all(today, user_id) as any[];
        const existingYearlyIds = new Set(existingYearly.map((e) => e.schedule_id));
        for (const s of yearlies) {
          if (!existingYearlyIds.has(s.id)) insertTask.run(s.id, s.name, today, 'yearly');
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
      WHERE EXISTS (SELECT 1 FROM review_records WHERE course_id = c.id)
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
}
