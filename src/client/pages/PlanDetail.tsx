import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FileText, Check } from 'lucide-react';
import { api } from '../hooks/api';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
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
  name: string;
  description: string;
  planned_start: string;
  planned_end: string;
  is_completed: boolean;
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

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<PlanTask | null>(null);
  const [taskForm, setTaskForm] = useState({ name: '', description: '', planned_start: '', planned_end: '' });

  // Plan edit form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', description: '', start_date: '', end_date: '' });

  const fetchPlan = () => {
    api.getPlan(Number(id)).then((r) => setPlan(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlan(); }, [id]);

  const { visible, sentinelRef } = useInfiniteScroll(plan?.tasks.length ?? 0);

  const openTaskForm = (task?: PlanTask) => {
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
        await api.createPlanTask(plan!.id, taskForm);
        toast.success('Task added');
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

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.deletePlanTask(plan!.id, taskId);
      toast.success('Task deleted');
      fetchPlan();
    } catch (err: any) { toast.error(err.message); }
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
        <p className="text-gray-500">Plan not found</p>
        <button onClick={() => navigate('/plans')} className="btn-secondary mt-4">Back to Plans</button>
      </div>
    );
  }

  const progress = plan.tasks.length > 0
    ? Math.round((plan.tasks.filter((t) => t.is_completed).length / plan.tasks.length) * 100)
    : 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/plans')} className="text-sm text-gray-400 hover:text-gray-600 mb-3 block">
          ← Back to Plans
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 break-words">{plan.name}</h1>
            {plan.description && <p className="text-gray-500 mt-1 break-words">{plan.description}</p>}
            <p className="text-sm text-gray-400 mt-1">{plan.start_date} → {plan.end_date}</p>
          </div>
          {plan.is_completed && (
            <span className="badge bg-green-100 text-green-700 text-sm px-3 py-1 flex-shrink-0">Done</span>
          )}
        </div>

        {/* Plan actions */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          {!plan.is_completed ? (
            <button onClick={handleComplete}
              className="flex items-center gap-1 text-sm font-medium text-green-600 hover:text-green-700">
              <Check size={14} /> Mark Complete
            </button>
          ) : <span />}
          <button onClick={openPlanEdit}
            className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Edit
          </button>
          <button onClick={handleDelete}
            className="text-sm font-medium text-red-400 hover:text-red-600">
            Delete Plan
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {plan.tasks.length > 0 && (
        <motion.div variants={listItem} className="card">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">Progress</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <motion.div
              className="bg-brand-500 h-2.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {plan.tasks.filter((t) => t.is_completed).length}/{plan.tasks.length} tasks done
          </p>
        </motion.div>
      )}

      {/* Tasks */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Tasks</h2>
        <button onClick={() => openTaskForm()} className="text-sm text-brand-600 font-medium hover:text-brand-700">
          + Add Task
        </button>
      </div>

      {plan.tasks.length === 0 ? (
        <motion.div variants={listItem} className="card text-center py-12">
          <div className="flex justify-center mb-3 text-gray-300"><FileText size={40} /></div>
          <p className="text-gray-500 text-sm">No tasks yet. Break down your plan into actionable tasks.</p>
          <button onClick={() => openTaskForm()} className="btn-primary mt-4 text-sm">Add First Task</button>
        </motion.div>
      ) : (
        <>
          {plan.tasks.slice(0, visible).map((task) => (
            <motion.div key={task.id} variants={listItem}>
              <div className={`card ${task.is_completed ? 'opacity-60 bg-gray-50' : ''}`}>
                <div className="flex items-start gap-4">
                  <button
                    onClick={() => handleToggleTask(task)}
                    className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      task.is_completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 hover:border-brand-400'
                    }`}
                  >
                    {task.is_completed && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center"><Check size={12} /></motion.span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-medium ${task.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {task.name}
                    </h3>
                    {task.description && (
                      <p className="text-sm text-gray-500 mt-0.5 break-words">{task.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{task.planned_start} → {task.planned_end}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => openTaskForm(task)} className="btn-ghost text-xs text-brand-600 hover:text-brand-700">Edit</button>
                  <button onClick={() => handleDeleteTask(task.id)} className="btn-ghost text-xs text-red-400">Del</button>
                </div>
              </div>
            </motion.div>
          ))}
          <div ref={sentinelRef} className="h-1" />
        </>
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
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
          >
            <h2 className="text-lg font-bold mb-4">{editingTask ? 'Edit Task' : 'New Task'}</h2>
            <form onSubmit={handleTaskSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input className="input" value={taskForm.name}
                  onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                  placeholder="e.g. Watch Introduction Video" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea className="input" rows={4} value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Optional notes" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Planned Start</label>
                <DatePicker value={taskForm.planned_start}
                  onChange={(v) => setTaskForm({ ...taskForm, planned_start: v })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Planned End</label>
                <DatePicker value={taskForm.planned_end}
                  onChange={(v) => setTaskForm({ ...taskForm, planned_end: v })} required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {editingTask ? 'Save Changes' : 'Add Task'}
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
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
          >
            <h2 className="text-lg font-bold mb-4">Edit Plan</h2>
            <form onSubmit={handlePlanSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input className="input" value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea className="input" rows={4} value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <DatePicker value={planForm.start_date}
                  onChange={(v) => setPlanForm({ ...planForm, start_date: v })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
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
