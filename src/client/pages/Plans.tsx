import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FolderOpen } from 'lucide-react';
import { api } from '../hooks/api';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import DatePicker from '../components/ui/DatePicker';
import { PageHeader, StatTiles, XpChip, EmptyState } from '../components/PageKit';

interface Plan {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  is_completed: boolean;
  expired: boolean;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const listItem = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0 },
};

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '' });

  const fetchPlans = () => {
    api.getPlans().then((r) => setPlans(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlans(); }, []);

  const activePlans = plans.filter((p) => !p.is_completed);
  const completedPlans = plans.filter((p) => p.is_completed);
  const overdueCount = activePlans.filter((p) => p.expired).length;
  const displayed = tab === 'active' ? activePlans : completedPlans;
  const { visible, sentinelRef } = useInfiniteScroll(displayed.length, tab);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPlan(form);
      toast.success('Plan created');
      setShowForm(false);
      setForm({ name: '', description: '', start_date: '', end_date: '' });
      fetchPlans();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      <PageHeader
        icon={FolderOpen}
        iconClass="text-indigo-500"
        title="Study Plans"
        subtitle="Big goals, broken into steps that grow your 🧠 Wisdom."
        actions={<button onClick={() => setShowForm(true)} className="btn-primary text-sm whitespace-nowrap">+ New Plan</button>}
      />

      <StatTiles stats={[
        { value: activePlans.length, label: 'Active', valueClass: 'text-indigo-600 dark:text-indigo-400' },
        { value: completedPlans.length, label: 'Completed', valueClass: 'text-emerald-600 dark:text-emerald-400' },
        {
          value: overdueCount,
          label: 'Overdue',
          valueClass: overdueCount > 0 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500',
        },
      ]} />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-xl p-1">
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            tab === 'active' ? 'bg-brand-500 text-white font-semibold shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Active ({activePlans.length})
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
            tab === 'completed' ? 'bg-brand-500 text-white font-semibold shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Done ({completedPlans.length})
        </button>
      </div>

      {/* Plan list */}
      {displayed.length === 0 ? (
        <EmptyState icon={FolderOpen} title={tab === 'active' ? 'No active plans' : 'No completed plans yet'}>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            {tab === 'active' ? 'Create your first learning plan to get started.' : 'Complete a plan to see it here.'}
          </p>
          {tab === 'active' && (
            <button onClick={() => setShowForm(true)} className="btn-primary">Create a Plan</button>
          )}
        </EmptyState>
      ) : (
        <>
          {displayed.slice(0, visible).map((plan) => (
            <motion.div key={plan.id} variants={listItem}>
              <Link
                to={`/plans/${plan.id}`}
                className={`card block ${plan.is_completed ? 'opacity-70' : ''}`}
              >
                <h3 className={`font-semibold text-gray-900 dark:text-gray-100 truncate ${plan.is_completed ? 'line-through' : ''}`}>
                  {plan.name}
                </h3>
                {plan.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{plan.description}</p>
                )}
                <div className="flex items-center justify-between gap-3 mt-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{plan.start_date} → {plan.end_date}</span>
                    {!plan.is_completed && <XpChip attribute="wisdom" amount={50} />}
                    {plan.expired && !plan.is_completed && (
                      <span className="badge badge-high">Overdue</span>
                    )}
                    {plan.is_completed && (
                      <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">Done</span>
                    )}
                  </div>
                  <span className="text-gray-300 dark:text-gray-600 text-lg flex-shrink-0">›</span>
                </div>
              </Link>
            </motion.div>
          ))}
          <div ref={sentinelRef} className="h-1" />
        </>
      )}

      {/* New plan modal */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6"
          >
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">New Plan</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Learn TypeScript" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea className="input" rows={4} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What's the goal?" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                <DatePicker value={form.start_date}
                  onChange={(v) => setForm({ ...form, start_date: v })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                <DatePicker value={form.end_date}
                  onChange={(v) => setForm({ ...form, end_date: v })} required />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">Create Plan</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
