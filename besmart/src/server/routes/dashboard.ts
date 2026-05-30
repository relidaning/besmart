import { Router } from 'express';
import db from '../database.js';
import { computeStreak } from './checkins.js';
import { effectiveDate } from '../date.js';

export const dashboardRoutes = Router();

dashboardRoutes.get('/stats', (req, res) => {
  const userId = req.user!.id;
  const today = effectiveDate();

  const activePlans = (db.prepare(
    'SELECT COUNT(*) as c FROM study_plans WHERE user_id = ? AND is_completed = 0'
  ).get(userId) as any).c;
  const completedPlans = (db.prepare(
    'SELECT COUNT(*) as c FROM study_plans WHERE user_id = ? AND is_completed = 1'
  ).get(userId) as any).c;

  // Match checkin page logic: daily tasks for today + all incomplete non-daily tasks
  const todayTasks = db.prepare(`
    SELECT COUNT(*) as c FROM checkin_tasks ct
    JOIN checkin_schedules cs ON ct.schedule_id = cs.id
    WHERE cs.user_id = ?
      AND ((ct.task_date = ? AND ct.schedule_type = 'daily')
        OR (ct.is_completed = 0 AND ct.schedule_type != 'daily'))
  `).get(userId, today) as any;

  const todayCompleted = db.prepare(`
    SELECT COUNT(*) as c FROM checkin_tasks ct
    JOIN checkin_schedules cs ON ct.schedule_id = cs.id
    WHERE cs.user_id = ?
      AND ((ct.task_date = ? AND ct.schedule_type = 'daily' AND ct.is_completed = 1)
        OR (ct.schedule_type != 'daily' AND ct.is_completed = 1 AND DATE(ct.completed_at) = ?))
  `).get(userId, today, today) as any;

  const streak = computeStreak(userId);

  // Earned points today: daily tasks done today + non-daily tasks completed today
  const todayScore = db.prepare(`
    SELECT COALESCE(SUM(s.score), 0) as score
    FROM checkin_tasks t
    JOIN checkin_schedules s ON t.schedule_id = s.id
    WHERE s.user_id = ?
      AND ((t.task_date = ? AND t.schedule_type = 'daily' AND t.is_completed = 1)
        OR (t.schedule_type != 'daily' AND t.is_completed = 1 AND DATE(t.completed_at) = ?))
  `).get(userId, today, today) as any;

  const dueReviews = (db.prepare(`
    SELECT COUNT(*) as c FROM review_records r
    JOIN review_courses c ON r.course_id = c.id
    WHERE c.user_id = ? AND r.is_reviewed = 0 AND r.planned_date <= ?
  `).get(userId, today) as any).c;

  const totalCourses = (db.prepare(
    'SELECT COUNT(*) as c FROM review_courses WHERE user_id = ?'
  ).get(userId) as any).c;

  const todoActive = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 0'
  ).get(userId) as any).c;
  const todoCompleted = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 1'
  ).get(userId) as any).c;
  const todoOverdue = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 0 AND due_date IS NOT NULL AND due_date < ?'
  ).get(userId, today) as any).c;
  const todoHigh = (db.prepare(
    "SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 0 AND priority = 'high'"
  ).get(userId) as any).c;

  res.json({
    data: {
      studyplans: { active: activePlans, completed: completedPlans, total: activePlans + completedPlans },
      checkins: {
        today_total: todayTasks.c,
        today_completed: todayCompleted.c,
        streak,
        score_today: todayScore?.score ?? null,
      },
      reviews: { due_today: dueReviews, total_courses: totalCourses },
      todos: { active: todoActive, completed: todoCompleted, overdue: todoOverdue, high_priority: todoHigh },
    },
  });
});
