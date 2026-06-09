import { Router } from 'express';
import db from '../database.js';
import { localDate } from '../date.js';

export const studyPlanRoutes = Router();

studyPlanRoutes.get('/', (req, res) => {
  const userId = req.user!.id;
  const today = localDate(new Date());
  const plans = db.prepare(
    'SELECT * FROM study_plans WHERE user_id = ? ORDER BY is_completed ASC, start_date DESC'
  ).all(userId);

  res.json({
    data: (plans as any[]).map((p) => ({
      ...p,
      is_completed: Boolean(p.is_completed),
      expired: !Boolean(p.is_completed) && p.end_date < today,
    })),
  });
});

studyPlanRoutes.get('/:id', (req, res) => {
  const userId = req.user!.id;
  const plan = db.prepare(
    'SELECT * FROM study_plans WHERE id = ? AND user_id = ?'
  ).get(req.params.id, userId) as any;
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const tasks = db.prepare(
    'SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY planned_start ASC'
  ).all(req.params.id);

  res.json({
    data: {
      ...plan,
      is_completed: Boolean(plan.is_completed),
      tasks: (tasks as any[]).map((t) => ({ ...t, is_completed: Boolean(t.is_completed) })),
    },
  });
});

studyPlanRoutes.post('/', (req, res) => {
  const userId = req.user!.id;
  const { name, description, start_date, end_date } = req.body;
  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'name, start_date, and end_date are required' });
  }

  const result = db.prepare(
    'INSERT INTO study_plans (name, description, start_date, end_date, user_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name, description || '', start_date, end_date, userId);

  const plan = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(result.lastInsertRowid) as any;
  res.status(201).json({ data: { ...plan, is_completed: Boolean(plan.is_completed) } });
});

studyPlanRoutes.put('/:id', (req, res) => {
  const userId = req.user!.id;
  const { name, description, start_date, end_date, is_completed } = req.body;
  const existing = db.prepare(
    'SELECT * FROM study_plans WHERE id = ? AND user_id = ?'
  ).get(req.params.id, userId) as any;
  if (!existing) return res.status(404).json({ error: 'Plan not found' });

  db.prepare(
    'UPDATE study_plans SET name = ?, description = ?, start_date = ?, end_date = ?, is_completed = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    start_date ?? existing.start_date,
    end_date ?? existing.end_date,
    is_completed !== undefined ? (is_completed ? 1 : 0) : existing.is_completed,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM study_plans WHERE id = ?').get(req.params.id) as any;
  res.json({ data: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

studyPlanRoutes.delete('/:id', (req, res) => {
  const userId = req.user!.id;
  db.prepare('DELETE FROM study_plans WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ success: true });
});

studyPlanRoutes.post('/:id/complete', (req, res) => {
  const userId = req.user!.id;
  const existing = db.prepare('SELECT id FROM study_plans WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Plan not found' });

  const today = localDate(new Date());
  db.prepare('UPDATE study_plans SET is_completed = 1 WHERE id = ?').run(req.params.id);
  db.prepare(
    'UPDATE plan_tasks SET is_completed = 1, actual_end = ? WHERE plan_id = ? AND is_completed = 0'
  ).run(today, req.params.id);
  res.json({ success: true });
});

// --- Plan Tasks ---

studyPlanRoutes.get('/:planId/tasks', (req, res) => {
  const userId = req.user!.id;
  const plan = db.prepare('SELECT id FROM study_plans WHERE id = ? AND user_id = ?').get(req.params.planId, userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const tasks = db.prepare(
    'SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY planned_start ASC'
  ).all(req.params.planId);
  res.json({ data: (tasks as any[]).map((t) => ({ ...t, is_completed: Boolean(t.is_completed) })) });
});

studyPlanRoutes.post('/:planId/tasks', (req, res) => {
  const userId = req.user!.id;
  const plan = db.prepare('SELECT id FROM study_plans WHERE id = ? AND user_id = ?').get(req.params.planId, userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { name, description, planned_start, planned_end } = req.body;
  if (!name || !planned_start || !planned_end) {
    return res.status(400).json({ error: 'name, planned_start, and planned_end are required' });
  }

  const result = db.prepare(
    'INSERT INTO plan_tasks (plan_id, name, description, planned_start, planned_end) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.planId, name, description || '', planned_start, planned_end);

  const task = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(result.lastInsertRowid) as any;
  res.status(201).json({ data: { ...task, is_completed: Boolean(task.is_completed) } });
});

studyPlanRoutes.put('/:planId/tasks/:taskId', (req, res) => {
  const userId = req.user!.id;
  const existing = db.prepare(`
    SELECT pt.* FROM plan_tasks pt
    JOIN study_plans sp ON pt.plan_id = sp.id
    WHERE pt.id = ? AND pt.plan_id = ? AND sp.user_id = ?
  `).get(req.params.taskId, req.params.planId, userId) as any;
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const { name, description, planned_start, planned_end, is_completed } = req.body;
  const now = localDate(new Date());
  db.prepare(
    'UPDATE plan_tasks SET name = ?, description = ?, planned_start = ?, planned_end = ?, is_completed = ?, actual_end = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    planned_start ?? existing.planned_start,
    planned_end ?? existing.planned_end,
    is_completed !== undefined ? (is_completed ? 1 : 0) : existing.is_completed,
    is_completed ? now : existing.actual_end,
    req.params.taskId
  );

  const updated = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(req.params.taskId) as any;
  res.json({ data: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

studyPlanRoutes.delete('/:planId/tasks/:taskId', (req, res) => {
  const userId = req.user!.id;
  db.prepare(`
    DELETE FROM plan_tasks WHERE id = ? AND plan_id = ?
    AND plan_id IN (SELECT id FROM study_plans WHERE user_id = ?)
  `).run(req.params.taskId, req.params.planId, userId);
  res.json({ success: true });
});
