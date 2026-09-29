import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ClipboardCheck, Check, Flame } from 'lucide-react';
import { api } from '../hooks/api';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { ATTRIBUTES, ATTR_META, type Attribute } from '../lib/garden';
import { PageHeader, StatTiles, XpChip, EmptyState, AttrDot } from '../components/PageKit';

// Mirrors MIN_CHECKIN_XP in server/garden.ts.
const checkinXp = (score: number | null) => Math.max(score || 0, 5);

interface CheckinData {
  date: string;
  tasks: CheckinTask[];
  total: number;
  completed: number;
  progress: number;
}

interface CheckinTask {
  id: number;
  schedule_name: string;
  task_date: string;
  is_completed: boolean;
  completed_at: string | null;
  is_timeout: boolean;
  schedule_type: string;
  score: number | null;
  category: Attribute;
}

interface Schedule {
  id: number;
  name: string;
  type: string;
  score: number;
  category: Attribute;
  is_active: boolean;
  created_at: string | null;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const listItem = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0 },
};

const typeBadges: Record<string, string> = {
  daily: 'badge-daily',
  weekly: 'badge-weekly',
  monthly: 'badge-monthly',
  seasonly: 'badge bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400',
  yearly: 'badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400',
};

export default function CheckIn() {
  const [data, setData] = useState<CheckinData | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'today' | 'schedules'>('today');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{ name: string; type: string; score: number; category?: Attribute }>({ name: '', type: 'daily', score: 0 });
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  const fetchAll = () => {
    Promise.all([api.getTodayCheckins(), api.getSchedules(), api.getStreak()])
      .then(([checkinData, schedData, streakData]) => {
        setData(checkinData.data);
        setSchedules(schedData.data);
        setStreak(streakData.data.streak);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleComplete = async (task: CheckinTask) => {
    setCompletingId(task.id);
    try {
      if (task.is_completed) {
        await api.uncompleteCheckin(task.id);
        toast('Task reopened');
      } else {
        await api.completeCheckin(task.id);
        toast.success('Checked in');
      }
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
    setCompletingId(null);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSchedule) {
        await api.updateSchedule(editingSchedule.id, scheduleForm);
        toast.success('Schedule updated');
      } else {
        await api.createSchedule(scheduleForm);
        toast.success('Schedule created');
      }
      setShowScheduleForm(false);
      setEditingSchedule(null);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleToggleActive = async (s: Schedule) => {
    await api.updateSchedule(s.id, { is_active: !s.is_active });
    fetchAll();
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Delete this schedule?')) return;
    await api.deleteSchedule(id);
    toast.success('Schedule deleted');
    fetchAll();
  };

  const taskCount = data ? data.tasks.length : 0;
  const { visible: tasksVisible, sentinelRef: tasksSentinelRef } = useInfiniteScroll(taskCount);
  const { visible: schedsVisible, sentinelRef: schedsSentinelRef } = useInfiniteScroll(schedules.length);

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
        icon={ClipboardCheck}
        title="Check In"
        subtitle={data?.date && new Date(`${data.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={tab === 'schedules' && (
          <button onClick={() => { setEditingSchedule(null); setScheduleForm({ name: '', type: 'daily', score: 10 }); setShowScheduleForm(true); }}
            className="btn-primary text-sm">+ New</button>
        )}
      />

      {/* Tabs */}
      <div className="seg">
        {(['today', 'schedules'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'on' : ''}>
            {t === 'today' ? `Today (${data?.tasks.length ?? 0})` : `Schedules (${schedules.length})`}
          </button>
        ))}
      </div>

      {/* ── Today tab ── */}
      {tab === 'today' && (<>
      {/* Stats */}
      {data && (() => {
        const dailyTasks = data.tasks.filter((t) => t.schedule_type === 'daily');
        const dailyTotal = dailyTasks.length;
        const dailyDone = dailyTasks.filter((t) => t.is_completed).length;
        const xpLeft = data.tasks.filter((t) => !t.is_completed).reduce((sum, t) => sum + checkinXp(t.score), 0);
        return (
          <StatTiles stats={[
            {
              value: `${dailyDone}/${dailyTotal}`,
              label: 'Daily Done',
              progress: dailyTotal > 0 ? (dailyDone / dailyTotal) * 100 : 0,
            },
            { value: streak, label: 'Day Streak' },
            { value: xpLeft, label: 'XP to Earn' },
          ]} />
        );
      })()}

      {/* Tasks */}
      {!data || data.tasks.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No check-in tasks for today">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            Tasks are auto-generated from your schedules. Add some daily schedules to get started.
          </p>
          <button onClick={() => { setEditingSchedule(null); setScheduleForm({ name: '', type: 'daily', score: 10 }); setShowScheduleForm(true); }}
            className="btn-primary text-sm">
            + Add Schedule
          </button>
        </EmptyState>
      ) : (
        <>
          {(() => {
            const byDateDesc = (a: CheckinTask, b: CheckinTask) =>
              b.task_date.localeCompare(a.task_date);
            const incomplete = data.tasks.filter((t) => !t.is_completed).sort(byDateDesc);
            const completed  = data.tasks.filter((t) => t.is_completed).sort(byDateDesc);
            const allTasks = [...incomplete, ...completed];
            const visibleTasks = allTasks.slice(0, tasksVisible);
            const visibleIncomplete = visibleTasks.filter((t) => !t.is_completed);
            const visibleCompleted = visibleTasks.filter((t) => t.is_completed);
            return (
              <>
                {/* Incomplete tasks first */}
                {visibleIncomplete.map((task) => (
                  <motion.div key={task.id} variants={listItem}>
                    <button
                      onClick={() => handleComplete(task)}
                      disabled={completingId === task.id}
                      className="w-full card flex items-center gap-4 text-left hover:border-brand-200 dark:hover:border-brand-800 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        completingId === task.id ? 'border-brand-400 bg-brand-50 dark:bg-brand-950' : 'border-gray-300 dark:border-gray-700 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950'
                      }`}>
                        {completingId === task.id && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-3 h-3 bg-brand-500 rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{task.schedule_name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`badge ${typeBadges[task.schedule_type] || ''}`}>{task.schedule_type}</span>
                          <XpChip attribute={task.category} amount={checkinXp(task.score)} />
                          <span className="text-xs text-gray-300 dark:text-gray-600">{task.task_date}</span>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                ))}

                {/* Completed tasks */}
                {visibleCompleted.map((task) => (
                  <motion.div key={task.id} variants={listItem}>
                    <button
                      onClick={() => handleComplete(task)}
                      className="w-full card flex items-center gap-4 text-left opacity-60 bg-gray-50 dark:bg-gray-900/60"
                    >
                      <div className="w-6 h-6 rounded-full bg-[#1fa874] flex items-center justify-center flex-shrink-0">
                        <motion.span
                          initial={{ scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          className="text-white flex items-center"
                        >
                          <Check size={12} />
                        </motion.span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="line-through text-gray-400 dark:text-gray-500">{task.schedule_name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`badge ${typeBadges[task.schedule_type] || ''}`}>{task.schedule_type}</span>
                          <span className="text-xs text-gray-300 dark:text-gray-600">{task.task_date}</span>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                ))}
                <div ref={tasksSentinelRef} className="h-1" />
              </>
            );
          })()}
        </>
      )}
      </>)}

      {/* ── Schedules tab ── */}
      {tab === 'schedules' && (<>
        {schedules.length === 0 ? (
          <motion.div variants={listItem} className="card text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">No schedules yet. Add one to start generating daily tasks.</p>
            <button onClick={() => { setEditingSchedule(null); setScheduleForm({ name: '', type: 'daily', score: 10 }); setShowScheduleForm(true); }}
              className="btn-primary text-sm">+ New Schedule</button>
          </motion.div>
        ) : (
          <>
            {schedules.slice(0, schedsVisible).map((s) => (
              <motion.div key={s.id} variants={listItem}
                className={`card flex items-center gap-3 ${!s.is_active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100">{s.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`badge ${typeBadges[s.type] || ''}`}>{s.type}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{s.score} pts</span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-1.5"><AttrDot attribute={s.category} />{ATTR_META[s.category].label}</span>
                  </div>
                </div>
                <button onClick={() => handleToggleActive(s)}
                  className={`text-xs px-2 py-1 rounded ${s.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                  {s.is_active ? 'On' : 'Off'}
                </button>
                <button onClick={() => { setEditingSchedule(s); setScheduleForm({ name: s.name, type: s.type, score: s.score, category: s.category }); setShowScheduleForm(true); }}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Edit</button>
                <button onClick={() => handleDeleteSchedule(s.id)} className="text-xs text-red-400 hover:text-red-600">Del</button>
              </motion.div>
            ))}
            <div ref={schedsSentinelRef} className="h-1" />
          </>
        )}
        <ScoreHistory />
      </>)}

      {/* Schedule form modal */}
      {showScheduleForm && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-[#050609]/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowScheduleForm(false); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/70 dark:border-white/[0.08] shadow-2xl shadow-black/30 w-full max-w-md p-5"
          >
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</h2>
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input className="input" value={scheduleForm.name}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                  placeholder="e.g. Morning meditation" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select className="input" value={scheduleForm.type}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, type: e.target.value })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="seasonly">Seasonly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Growth area</label>
                <select className="input" value={scheduleForm.category ?? ''}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, category: (e.target.value || undefined) as Attribute | undefined })}>
                  {!editingSchedule && <option value="">Auto (guess from name)</option>}
                  {ATTRIBUTES.map((a) => (
                    <option key={a} value={a}>{ATTR_META[a].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Score (points)</label>
                <input type="number" className="input" value={scheduleForm.score}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, score: Number(e.target.value) })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {editingSchedule ? 'Save Changes' : 'Create Schedule'}
                </button>
                <button type="button" onClick={() => setShowScheduleForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

function ScoreHistory() {
  const [scores, setScores] = useState<any[]>([]);
  const [show, setShow] = useState(false);

  const load = () => {
    api.getScores().then((r) => {
      setScores(r.data);
      setShow(true);
    });
  };

  if (!show) {
    return (
      <button onClick={load} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 w-full text-center py-2">
        Show score history
      </button>
    );
  }

  if (scores.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">No score data yet</p>;
  }

  return (
    <div className="card">
      <h3 className="font-medium text-sm mb-3 text-gray-900 dark:text-gray-100">Score History (Last 30 days)</h3>
      <div className="flex items-end gap-1 h-24">
        {[...scores].reverse().map((s) => (
          <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-brand-400 rounded-t"
              style={{ height: `${Math.min(100, (s.score / 100) * 100)}%`, minHeight: s.score > 0 ? '2px' : '0' }}
            />
            <span className="text-[9px] text-gray-400 dark:text-gray-500 rotate-90 origin-left whitespace-nowrap">
              {s.score_date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
