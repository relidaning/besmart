import { Router } from 'express';
import db from '../database.js';
import { localDate } from '../date.js';

export const todoRoutes = Router();

todoRoutes.get('/', (req, res) => {
  const userId = req.user!.id;
  const { completed, priority, search, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const offset = (pageNum - 1) * limitNum;

  let where = 'WHERE user_id = ?';
  const params: any[] = [userId];

  if (completed !== undefined) {
    where += ' AND completed = ?';
    params.push(completed === 'true' ? 1 : 0);
  }
  if (priority) {
    where += ' AND priority = ?';
    params.push(priority);
  }
  if (search) {
    where += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM todos ${where}`).get(...params) as any;
  const total = countRow.total;

  const todos = db.prepare(
    `SELECT * FROM todos ${where} ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
      due_date ASC NULLS LAST,
      created_at DESC
    LIMIT ? OFFSET ?`
  ).all(...params, limitNum, offset) as any[];

  res.json({
    data: todos.map((t) => ({ ...t, completed: Boolean(t.completed) })),
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
  });
});

todoRoutes.post('/', (req, res) => {
  const userId = req.user!.id;
  const { title, description, priority, due_date, plan_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const result = db.prepare(
    'INSERT INTO todos (title, description, priority, due_date, plan_id, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, description || '', priority || 'medium', due_date || null, plan_id || null, userId);

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ data: todo });
});

todoRoutes.put('/:id', (req, res) => {
  const userId = req.user!.id;
  const { title, description, priority, due_date, completed } = req.body;
  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, userId) as any;
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE todos SET title = ?, description = ?, priority = ?, due_date = ?, completed = ?, completed_at = ? WHERE id = ?'
  ).run(
    title ?? existing.title,
    description ?? existing.description,
    priority ?? existing.priority,
    due_date !== undefined ? (due_date || null) : existing.due_date,
    completed !== undefined ? (completed ? 1 : 0) : existing.completed,
    completed ? now : existing.completed_at,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  res.json({ data: updated });
});

todoRoutes.post('/:id/complete', (req, res) => {
  const userId = req.user!.id;
  const existing = db.prepare('SELECT id FROM todos WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Todo not found' });

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  db.prepare('UPDATE todos SET completed = 1, completed_at = ? WHERE id = ?').run(now, req.params.id);

  const completedToday = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 1 AND date(completed_at) = ?'
  ).get(userId, today) as any).c;

  if (completedToday >= 5) {
    const checkinTask = db.prepare(`
      SELECT t.id FROM checkin_tasks t
      JOIN checkin_schedules s ON t.schedule_id = s.id
      WHERE t.is_completed = 0 AND s.user_id = ? AND lower(s.name) LIKE '%5%todo%'
      LIMIT 1
    `).get(userId) as any;
    if (checkinTask) {
      db.prepare('UPDATE checkin_tasks SET is_completed = 1, completed_at = ? WHERE id = ?').run(now, checkinTask.id);
    }
  }

  res.json({ success: true });
});

todoRoutes.post('/:id/uncomplete', (req, res) => {
  const userId = req.user!.id;
  db.prepare('UPDATE todos SET completed = 0, completed_at = NULL WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ success: true });
});

todoRoutes.delete('/:id', (req, res) => {
  const userId = req.user!.id;
  db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ success: true });
});

todoRoutes.get('/stats/overview', (req, res) => {
  const userId = req.user!.id;
  const today = localDate(new Date());

  const total = (db.prepare('SELECT COUNT(*) as c FROM todos WHERE user_id = ?').get(userId) as any).c;
  const completed = (db.prepare('SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 1').get(userId) as any).c;
  const pending = total - completed;
  const overdue = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 0 AND due_date IS NOT NULL AND due_date < ?'
  ).get(userId, today) as any).c;
  const todayCount = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND due_date = ?'
  ).get(userId, today) as any).c;
  const highPriority = (db.prepare(
    "SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 0 AND priority = 'high'"
  ).get(userId) as any).c;
  const completedToday = (db.prepare(
    'SELECT COUNT(*) as c FROM todos WHERE user_id = ? AND completed = 1 AND date(completed_at) = ?'
  ).get(userId, today) as any).c;

  res.json({
    data: { total, completed, pending, overdue, today: todayCount, highPriority, completedToday },
  });
});
