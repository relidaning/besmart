import { Router } from 'express';
import db from '../database.js';
import { localDate } from '../date.js';
import { awardXp, revokeXp, PLAN_XP, PLAN_TASK_XP } from '../garden.js';

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
    'SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY sort_order ASC'
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
  let xp = null;
  if (updated.is_completed && !existing.is_completed) xp = awardXp(userId, 'plan', updated.id, 'wisdom', PLAN_XP);
  else if (!updated.is_completed && existing.is_completed) revokeXp('plan', updated.id);
  res.json({ data: { ...updated, is_completed: Boolean(updated.is_completed) }, xp });
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
  const xp = awardXp(userId, 'plan', req.params.id, 'wisdom', PLAN_XP);
  res.json({ success: true, xp });
});

// --- Plan Tasks (WBS tree) ---

function getOwnedPlan(planId: string, userId: number) {
  return db.prepare('SELECT id FROM study_plans WHERE id = ? AND user_id = ?').get(planId, userId) as any;
}

function getOwnedTask(planId: string, taskId: string, userId: number) {
  return db.prepare(`
    SELECT pt.* FROM plan_tasks pt
    JOIN study_plans sp ON pt.plan_id = sp.id
    WHERE pt.id = ? AND pt.plan_id = ? AND sp.user_id = ?
  `).get(taskId, planId, userId) as any;
}

function getSiblings(planId: number, parentTaskId: number | null) {
  if (parentTaskId === null) {
    return db.prepare(
      'SELECT * FROM plan_tasks WHERE plan_id = ? AND parent_task_id IS NULL ORDER BY sort_order ASC'
    ).all(planId) as any[];
  }
  return db.prepare(
    'SELECT * FROM plan_tasks WHERE plan_id = ? AND parent_task_id = ? ORDER BY sort_order ASC'
  ).all(planId, parentTaskId) as any[];
}

function nextSortOrder(planId: number, parentTaskId: number | null) {
  const siblings = getSiblings(planId, parentTaskId);
  if (siblings.length === 0) return 1;
  return Math.max(...siblings.map((s) => s.sort_order)) + 1;
}

studyPlanRoutes.get('/:planId/tasks', (req, res) => {
  const userId = req.user!.id;
  const plan = getOwnedPlan(req.params.planId, userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const tasks = db.prepare(
    'SELECT * FROM plan_tasks WHERE plan_id = ? ORDER BY sort_order ASC'
  ).all(req.params.planId);
  res.json({ data: (tasks as any[]).map((t) => ({ ...t, is_completed: Boolean(t.is_completed) })) });
});

studyPlanRoutes.post('/:planId/tasks', (req, res) => {
  const userId = req.user!.id;
  const plan = getOwnedPlan(req.params.planId, userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const { name, description, planned_start, planned_end, parent_task_id } = req.body;
  if (!name || !planned_start || !planned_end) {
    return res.status(400).json({ error: 'name, planned_start, and planned_end are required' });
  }

  const planId = Number(req.params.planId);
  let parentId: number | null = null;
  if (parent_task_id !== undefined && parent_task_id !== null) {
    const parent = db.prepare('SELECT id FROM plan_tasks WHERE id = ? AND plan_id = ?').get(parent_task_id, planId);
    if (!parent) return res.status(400).json({ error: 'Parent task not found in this plan' });
    parentId = Number(parent_task_id);
  }

  const sortOrder = nextSortOrder(planId, parentId);

  const result = db.prepare(
    'INSERT INTO plan_tasks (plan_id, parent_task_id, sort_order, name, description, planned_start, planned_end) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(planId, parentId, sortOrder, name, description || '', planned_start, planned_end);

  const task = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(result.lastInsertRowid) as any;
  res.status(201).json({ data: { ...task, is_completed: Boolean(task.is_completed) } });
});

studyPlanRoutes.put('/:planId/tasks/:taskId', (req, res) => {
  const userId = req.user!.id;
  const existing = getOwnedTask(req.params.planId, req.params.taskId, userId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const hasChildren = (db.prepare(
    'SELECT COUNT(*) as c FROM plan_tasks WHERE parent_task_id = ?'
  ).get(existing.id) as any).c > 0;

  const { name, description, planned_start, planned_end, is_completed } = req.body;
  const now = localDate(new Date());
  const nextCompleted = is_completed !== undefined && !hasChildren
    ? (is_completed ? 1 : 0)
    : existing.is_completed;

  db.prepare(
    'UPDATE plan_tasks SET name = ?, description = ?, planned_start = ?, planned_end = ?, is_completed = ?, actual_end = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    planned_start ?? existing.planned_start,
    planned_end ?? existing.planned_end,
    nextCompleted,
    nextCompleted && !hasChildren ? now : existing.actual_end,
    req.params.taskId
  );

  const updated = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(req.params.taskId) as any;
  let xp = null;
  if (updated.is_completed && !existing.is_completed) xp = awardXp(userId, 'plan_task', updated.id, 'wisdom', PLAN_TASK_XP);
  else if (!updated.is_completed && existing.is_completed) revokeXp('plan_task', updated.id);
  res.json({ data: { ...updated, is_completed: Boolean(updated.is_completed) }, xp });
});

studyPlanRoutes.delete('/:planId/tasks/:taskId', (req, res) => {
  const userId = req.user!.id;
  const existing = getOwnedTask(req.params.planId, req.params.taskId, userId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM plan_tasks WHERE id = ?
      UNION ALL
      SELECT pt.id FROM plan_tasks pt JOIN descendants d ON pt.parent_task_id = d.id
    )
    DELETE FROM plan_tasks WHERE id IN (SELECT id FROM descendants)
  `).run(req.params.taskId);

  res.json({ success: true });
});

// Move a task one level deeper: becomes the last child of its previous sibling.
studyPlanRoutes.post('/:planId/tasks/:taskId/indent', (req, res) => {
  const userId = req.user!.id;
  const task = getOwnedTask(req.params.planId, req.params.taskId, userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const siblings = getSiblings(task.plan_id, task.parent_task_id);
  const idx = siblings.findIndex((s) => s.id === task.id);
  if (idx <= 0) return res.status(400).json({ error: 'Cannot indent: no preceding sibling' });

  const newParent = siblings[idx - 1];
  const sortOrder = nextSortOrder(task.plan_id, newParent.id);
  db.prepare('UPDATE plan_tasks SET parent_task_id = ?, sort_order = ? WHERE id = ?')
    .run(newParent.id, sortOrder, task.id);

  const updated = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(task.id) as any;
  res.json({ data: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

// Move a task one level shallower: becomes a sibling right after its old parent.
studyPlanRoutes.post('/:planId/tasks/:taskId/outdent', (req, res) => {
  const userId = req.user!.id;
  const task = getOwnedTask(req.params.planId, req.params.taskId, userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.parent_task_id === null) return res.status(400).json({ error: 'Already at top level' });

  const parent = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(task.parent_task_id) as any;
  const grandparentId: number | null = parent.parent_task_id;

  const levelSiblings = getSiblings(task.plan_id, grandparentId);
  const parentIdx = levelSiblings.findIndex((s) => s.id === parent.id);
  const nextAtLevel = levelSiblings[parentIdx + 1];

  const sortOrder = nextAtLevel ? (parent.sort_order + nextAtLevel.sort_order) / 2 : parent.sort_order + 1;
  db.prepare('UPDATE plan_tasks SET parent_task_id = ?, sort_order = ? WHERE id = ?')
    .run(grandparentId, sortOrder, task.id);

  const updated = db.prepare('SELECT * FROM plan_tasks WHERE id = ?').get(task.id) as any;
  res.json({ data: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

// Reorder a task among its siblings (direction: 'up' | 'down').
studyPlanRoutes.post('/:planId/tasks/:taskId/move', (req, res) => {
  const userId = req.user!.id;
  const task = getOwnedTask(req.params.planId, req.params.taskId, userId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { direction } = req.body;
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: "direction must be 'up' or 'down'" });
  }

  const siblings = getSiblings(task.plan_id, task.parent_task_id);
  const idx = siblings.findIndex((s) => s.id === task.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) {
    return res.status(400).json({ error: `Cannot move ${direction}: at boundary` });
  }

  const other = siblings[swapIdx];
  db.transaction(() => {
    db.prepare('UPDATE plan_tasks SET sort_order = ? WHERE id = ?').run(other.sort_order, task.id);
    db.prepare('UPDATE plan_tasks SET sort_order = ? WHERE id = ?').run(task.sort_order, other.id);
  })();

  res.json({ success: true });
});
