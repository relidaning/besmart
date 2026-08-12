import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { FileText, Check, ChevronRight, ChevronDown, Plus, ArrowUp, ArrowDown, ChevronsRight, ChevronsLeft } from 'lucide-react';
import { api } from '../hooks/api';
import DatePicker from '../components/ui/DatePicker';

interface Plan {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  is_completed: boolean;
  tasks: PlanTask[];
}

interface PlanTask {
  id: number;
  plan_id: number;
  parent_task_id: number | null;
  sort_order: number;
  name: string;
  description: string;
  planned_start: string;
  planned_end: string;
  is_completed: boolean;
}

interface TaskNode extends PlanTask {
  children: TaskNode[];
}

function buildTree(tasks: PlanTask[]): TaskNode[] {
  const byParent = new Map<number | null, PlanTask[]>();
  for (const t of tasks) {
    const key = t.parent_task_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  function attach(parentId: number | null): TaskNode[] {
    return (byParent.get(parentId) || []).map((t) => ({ ...t, children: attach(t.id) }));
  }
  return attach(null);
}

function leafStats(node: TaskNode): { total: number; completed: number } {
  if (node.children.length === 0) {
    return { total: 1, completed: node.is_completed ? 1 : 0 };
  }
  return node.children.reduce(
    (acc, c) => {
      const s = leafStats(c);
      return { total: acc.total + s.total, completed: acc.completed + s.completed };
    },
    { total: 0, completed: 0 }
  );
}

function isNodeComplete(node: TaskNode): boolean {
  if (node.children.length === 0) return node.is_completed;
  return node.children.every(isNodeComplete);
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<PlanTask | null>(null);
  const [parentTaskId, setParentTaskId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({ name: '', description: '', planned_start: '', planned_end: '' });

  // Plan edit form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', description: '', start_date: '', end_date: '' });

  const fetchPlan = () => {
    api.getPlan(Number(id)).then((r) => setPlan(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlan(); }, [id]);

  const openTaskForm = (parentId: number | null, task?: PlanTask) => {
    setParentTaskId(parentId);
    if (task) {
      setEditingTask(task);
      setTaskForm({ name: task.name, description: task.description || '', planned_start: task.planned_start, planned_end: task.planned_end });
    } else {
      setEditingTask(null);
      setTaskForm({ name: '', description: '', planned_start: '', planned_end: '' });
    }
    setShowTaskForm(true);
  };

  const openPlanEdit = () => {
    setPlanForm({ name: plan!.name, description: plan!.description || '', start_date: plan!.start_date, end_date: plan!.end_date });
    setShowPlanForm(true);
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTask) {
        await api.updatePlanTask(plan!.id, editingTask.id, taskForm);
        toast.success('Task updated');
      } else {
        await api.createPlanTask(plan!.id, { ...taskForm, parent_task_id: parentTaskId });
        toast.success(parentTaskId ? 'Subtask added' : 'Task added');
      }
      setShowTaskForm(false);
      fetchPlan();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updatePlan(plan!.id, planForm);
      toast.success('Plan updated');
      setShowPlanForm(false);
      fetchPlan();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleComplete = async () => {
    try {
      await api.completePlan(plan!.id);
      toast.success('Plan completed! 🎉');
      navigate('/plans');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this plan and all its tasks?')) return;
    try {
      await api.deletePlan(plan!.id);
      toast.success('Plan deleted');
      navigate('/plans');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleToggleTask = async (task: PlanTask) => {
    try {
      await api.updatePlanTask(plan!.id, task.id, { is_completed: !task.is_completed });
      toast.success(task.is_completed ? 'Task reopened' : 'Task completed! ✓');
      fetchPlan();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteTask = async (task: TaskNode) => {
    const msg = task.children.length > 0 ? 'Delete this task and all its subtasks?' : 'Delete this task?';
    if (!confirm(msg)) return;
    try {
      await api.deletePlanTask(plan!.id, task.id);
      toast.success('Task deleted');
      fetchPlan();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleIndent = async (taskId: number) => {
    try {
      await api.indentPlanTask(plan!.id, taskId);
      fetchPlan();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleOutdent = async (taskId: number) => {
    try {
      await api.outdentPlanTask(plan!.id, taskId);
      fetchPlan();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleMove = async (taskId: number, direction: 'up' | 'down') => {
    try {
      await api.movePlanTask(plan!.id, taskId, direction);
      fetchPlan();
    } catch (err: any) { toast.error(err.message); }
  };

  const toggleCollapsed = (taskId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Plan not found</p>
        <button onClick={() => navigate('/plans')} className="btn-secondary mt-4">Back to Plans</button>
      </div>
    );
  }

  const tree = buildTree(plan.tasks);
  const overall = tree.reduce(
    (acc, n) => {
      const s = leafStats(n);
      return { total: acc.total + s.total, completed: acc.completed + s.completed };
    },
    { total: 0, completed: 0 }
  );
  const progress = overall.total > 0 ? Math.round((overall.completed / overall.total) * 100) : 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/plans')} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-3 block">
          ← Back to Plans
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">{plan.name}</h1>
            {plan.description && <p className="text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-pre-line">{plan.description}</p>}
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{plan.start_date} → {plan.end_date}</p>
          </div>
          {plan.is_completed && (
            <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 text-sm px-3 py-1 flex-shrink-0">Done</span>
          )}
        </div>

        {/* Plan actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          {!plan.is_completed ? (
            <button onClick={handleComplete}
              className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300">
              <Check size={14} /> Mark Complete
            </button>
          ) : <span />}
          <button onClick={openPlanEdit}
            className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
            Edit
          </button>
          <button onClick={handleDelete}
            className="text-sm font-medium text-red-400 hover:text-red-600">
            Delete Plan
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {overall.total > 0 && (
        <motion.div variants={listItem} className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-400">Progress</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5">
            <motion.div
              className="bg-brand-500 h-2.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {overall.completed}/{overall.total} work items done
          </p>
        </motion.div>
      )}

      {/* WBS Tasks */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Work Breakdown</h2>
        <button onClick={() => openTaskForm(null)} className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1">
          <Plus size={14} /> Add Task
        </button>
      </div>

      {tree.length === 0 ? (
        <motion.div variants={listItem} className="card text-center py-12">
          <div className="flex justify-center mb-3 text-gray-300 dark:text-gray-700"><FileText size={40} /></div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">No tasks yet. Break your plan down into a work breakdown structure.</p>
          <button onClick={() => openTaskForm(null)} className="btn-primary mt-4 text-sm">Add First Task</button>
        </motion.div>
      ) : (
        <motion.div variants={listItem} className="card divide-y divide-gray-100 dark:divide-gray-800 !p-2">
          {tree.map((node, idx) => (
            <TaskRow
              key={node.id}
              node={node}
              code={`${idx + 1}`}
              depth={0}
              isFirst={idx === 0}
              isLast={idx === tree.length - 1}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapsed}
              onToggleComplete={handleToggleTask}
              onEdit={(t) => openTaskForm(t.parent_task_id, t)}
              onAddSubtask={(t) => openTaskForm(t.id)}
              onDelete={handleDeleteTask}
              onIndent={handleIndent}
              onOutdent={handleOutdent}
              onMove={handleMove}
            />
          ))}
        </motion.div>
      )}

      {/* Task form modal */}
      {showTaskForm && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTaskForm(false); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6"
          >
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">
              {editingTask ? 'Edit Task' : parentTaskId ? 'New Subtask' : 'New Task'}
            </h2>
            <form onSubmit={handleTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input className="input" value={taskForm.name}
                  onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                  placeholder="e.g. Watch Introduction Video" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea className="input" rows={4} value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Optional notes" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Planned Start</label>
                <DatePicker value={taskForm.planned_start}
                  onChange={(v) => setTaskForm({ ...taskForm, planned_start: v })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Planned End</label>
                <DatePicker value={taskForm.planned_end}
                  onChange={(v) => setTaskForm({ ...taskForm, planned_end: v })} required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {editingTask ? 'Save Changes' : parentTaskId ? 'Add Subtask' : 'Add Task'}
                </button>
                <button type="button" onClick={() => setShowTaskForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}

      {/* Plan edit modal */}
      {showPlanForm && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPlanForm(false); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6"
          >
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Edit Plan</h2>
            <form onSubmit={handlePlanSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input className="input" value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea className="input" rows={4} value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                <DatePicker value={planForm.start_date}
                  onChange={(v) => setPlanForm({ ...planForm, start_date: v })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                <DatePicker value={planForm.end_date}
                  onChange={(v) => setPlanForm({ ...planForm, end_date: v })} required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Save Changes</button>
                <button type="button" onClick={() => setShowPlanForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

interface TaskRowProps {
  node: TaskNode;
  code: string;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  collapsed: Set<number>;
  onToggleCollapse: (id: number) => void;
  onToggleComplete: (task: PlanTask) => void;
  onEdit: (task: TaskNode) => void;
  onAddSubtask: (task: TaskNode) => void;
  onDelete: (task: TaskNode) => void;
  onIndent: (id: number) => void;
  onOutdent: (id: number) => void;
  onMove: (id: number, direction: 'up' | 'down') => void;
}

function TaskRow({
  node, code, depth, isFirst, isLast, collapsed,
  onToggleCollapse, onToggleComplete, onEdit, onAddSubtask, onDelete, onIndent, onOutdent, onMove,
}: TaskRowProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const complete = isNodeComplete(node);
  const stats = leafStats(node);

  return (
    <div>
      <div
        className={`flex items-start gap-2 py-2.5 px-2 rounded-lg group ${complete ? 'opacity-60' : ''}`}
        style={{ marginLeft: depth * 20 }}
      >
        {/* Expand/collapse */}
        <button
          onClick={() => hasChildren && onToggleCollapse(node.id)}
          className={`mt-1 w-4 h-4 flex-shrink-0 flex items-center justify-center text-gray-400 dark:text-gray-600 ${hasChildren ? 'hover:text-gray-600 dark:hover:text-gray-300' : 'invisible'}`}
        >
          {hasChildren && (isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />)}
        </button>

        {/* Completion */}
        {hasChildren ? (
          <div
            title={`${stats.completed}/${stats.total} done`}
            className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold ${
              complete ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500'
            }`}
          >
            {complete ? <Check size={12} /> : `${stats.completed}/${stats.total}`}
          </div>
        ) : (
          <button
            onClick={() => onToggleComplete(node)}
            title={node.is_completed ? 'Mark incomplete' : 'Mark complete'}
            className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              node.is_completed
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-gray-300 dark:border-gray-700 hover:border-brand-400'
            }`}
          >
            {node.is_completed && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center"><Check size={12} /></motion.span>
            )}
          </button>
        )}

        {/* Name / meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-mono text-gray-400 dark:text-gray-600 flex-shrink-0">{code}</span>
            <h3 className={`font-medium break-words ${complete ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
              {node.name}
            </h3>
          </div>
          {node.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 break-words whitespace-pre-line">{node.description}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{node.planned_start} → {node.planned_end}</p>

          {/* Row actions */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button onClick={() => onAddSubtask(node)} className="btn-ghost text-xs text-brand-600 dark:text-brand-400 flex items-center gap-0.5" title="Add subtask">
              <Plus size={12} /> Sub
            </button>
            <button onClick={() => onMove(node.id, 'up')} disabled={isFirst} className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
              <ArrowUp size={12} />
            </button>
            <button onClick={() => onMove(node.id, 'down')} disabled={isLast} className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
              <ArrowDown size={12} />
            </button>
            <button onClick={() => onIndent(node.id)} disabled={isFirst} className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed" title="Indent (make subtask of previous item)">
              <ChevronsRight size={12} />
            </button>
            <button onClick={() => onOutdent(node.id)} disabled={depth === 0} className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed" title="Outdent">
              <ChevronsLeft size={12} />
            </button>
            <button onClick={() => onEdit(node)} className="btn-ghost text-xs text-brand-600 dark:text-brand-400">Edit</button>
            <button onClick={() => onDelete(node)} className="btn-ghost text-xs text-red-400">Del</button>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hasChildren && !isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child, idx) => (
              <TaskRow
                key={child.id}
                node={child}
                code={`${code}.${idx + 1}`}
                depth={depth + 1}
                isFirst={idx === 0}
                isLast={idx === node.children.length - 1}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                onToggleComplete={onToggleComplete}
                onEdit={onEdit}
                onAddSubtask={onAddSubtask}
                onDelete={onDelete}
                onIndent={onIndent}
                onOutdent={onOutdent}
                onMove={onMove}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
