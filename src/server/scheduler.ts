import db from './database.js';
import { localDate } from './date.js';

const REVIEW_INTERVALS = [1, 3, 7, 15, 30, 60, 120, 240];

export function scheduleJob() {
  const now = new Date();
  const today = localDate(now);
  const prev = new Date(now);
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

      // Record yesterday's earned score (sum of completed task scores — daily + non-daily)
      const existingScore = db.prepare(
        'SELECT id FROM scores WHERE score_date = ? AND user_id = ?'
      ).get(yesterday, user_id);
      if (!existingScore) {
        const earned = (db.prepare(`
          SELECT COALESCE(SUM(s.score), 0) as total
          FROM checkin_tasks t
          JOIN checkin_schedules s ON t.schedule_id = s.id
          WHERE s.user_id = ?
            AND ((t.task_date = ? AND t.schedule_type = 'daily' AND t.is_completed = 1)
              OR (t.schedule_type != 'daily' AND t.is_completed = 1 AND DATE(t.completed_at) = ?))
        `).get(user_id, yesterday, yesterday) as any).total;

        db.prepare('INSERT INTO scores (score_date, score, user_id) VALUES (?, ?, ?)')
          .run(yesterday, earned, user_id);
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
        for (const s of seasonlies) insertTask.run(s.id, s.name, today, 'seasonly');
      }

      // Yearly tasks on Jan 1
      if (now.getDate() === 1 && now.getMonth() === 0) {
        const yearlies = db.prepare(
          "SELECT * FROM checkin_schedules WHERE is_active = 1 AND type = 'yearly' AND user_id = ?"
        ).all(user_id) as any[];
        for (const s of yearlies) insertTask.run(s.id, s.name, today, 'yearly');
      }
    }

    // Generate next review records for all completed reviews
    const courses = db.prepare(`
      SELECT r.* FROM review_records r
      JOIN (
        SELECT course_id, MAX(reviewed_times) as max_times
        FROM review_records GROUP BY course_id
      ) latest ON r.course_id = latest.course_id AND r.reviewed_times = latest.max_times
      WHERE r.is_reviewed = 1
    `).all() as any[];

    const insertRecord = db.prepare(
      'INSERT INTO review_records (course_id, is_reviewed, reviewed_times, planned_date) VALUES (?, 0, ?, ?)'
    );
    const existingRecords = db.prepare(
      'SELECT course_id, reviewed_times FROM review_records WHERE is_reviewed = 0'
    ).all() as any[];
    const existingSet = new Set(existingRecords.map((e: any) => `${e.course_id}-${e.reviewed_times}`));

    for (const r of courses) {
      const nextTimes = r.reviewed_times + 1;
      if (nextTimes >= REVIEW_INTERVALS.length) continue;
      const key = `${r.course_id}-${nextTimes}`;
      if (existingSet.has(key)) continue;

      const nextDate = new Date(r.reviewed_date || r.planned_date);
      nextDate.setDate(nextDate.getDate() + REVIEW_INTERVALS[nextTimes]);
      insertRecord.run(r.course_id, nextTimes, localDate(nextDate));
    }
  });

  try {
    run();
    console.log('Scheduler job completed');
  } catch (err) {
    console.error('Scheduler error:', err);
  }
}
