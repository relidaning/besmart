import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ListTodo, Trophy, Check, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../hooks/api';
import { PageHeader, StatTiles, XpChip, EmptyState } from '../components/PageKit';

interface Todo {
  id: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  plan_id: number | null;
}

const PAGE_SIZE = 20;

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

const priorityConfig = {
  high: { label: 'High' },
  medium: { label: 'Medium' },
  low: { label: 'Low' },
};

// Mirrors the todo XP table in server/garden.ts.
const TODO_XP: Record<Todo['priority'], number> = { high: 15, medium: 10, low: 5 };

const priorityOrder: Todo['priority'][] = ['low', 'medium', 'high'];
const priorityRank: Record<Todo['priority'], number> = { high: 0, medium: 1, low: 2 };

// Mirrors the server's ORDER BY (priority, due_date ASC NULLS LAST) so a local
// priority change re-sorts the same way a refetch would.
function sortTodos(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => {
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    if (a.due_date === b.due_date) return 0;
    if (a.due_date === null) return 1;
    if (b.due_date === null) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  });
}

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '' });
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [stats, setStats] = useState({ completedToday: 0, pending: 0, overdue: 0 });
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback((pageNum: number) => {
    const params: any = { page: pageNum, limit: PAGE_SIZE };
    if (tab === 'active') params.completed = 'false';
    else if (tab === 'completed') params.completed = 'true';
    if (priorityFilter) params.priority = priorityFilter;
    if (debouncedSearch) params.search = debouncedSearch;
    return params;
  }, [tab, priorityFilter, debouncedSearch]);

  const initialLoadDone = useRef(false);

  const fetchTodos = useCallback(() => {
    if (!initialLoadDone.current) setLoading(true);
    setPage(1);
    api.getTodos(buildParams(1)).then((r) => {
      setTodos(r.data);
      setHasMore(r.pagination.page < r.pagination.totalPages);
      initialLoadDone.current = true;
    }).finally(() => setLoading(false));
  }, [buildParams]);

  const fetchMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    api.getTodos(buildParams(nextPage)).then((r) => {
      setTodos((prev) => [...prev, ...r.data]);
      setPage(nextPage);
      setHasMore(r.pagination.page < r.pagination.totalPages);
    }).finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, page, buildParams]);

  const fetchStats = useCallback(() => {
    api.getTodoStats().then((r) => setStats({
      completedToday: r.data.completedToday, pending: r.data.pending, overdue: r.data.overdue,
    }));
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Sentinel observer — rewire whenever hasMore/loadingMore changes
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!sentinelRef.current || !hasMore) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchMore(); },
      { threshold: 0.1 }
    );
    observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, fetchMore]);

  const handleToggle = async (todo: Todo) => {
    // Remove from current tab immediately — it belongs to the other tab now
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    const shift = (sign: 1 | -1) => setStats((s) => ({
      ...s,
      completedToday: s.completedToday + sign,
      pending: s.pending - sign,
    }));
    shift(todo.completed ? -1 : 1);
    setCompletingId(todo.id);
    try {
      if (todo.completed) {
        await api.uncompleteTodo(todo.id);
        toast('Reopened');
      } else {
        const r = await api.completeTodo(todo.id);
        if (!r.xp) toast.success('Completed'); // otherwise the XP toast confirms it
      }
      fetchStats();
    } catch (err: any) {
      toast.error(err.message);
      // Revert on failure
      setTodos((prev) => [todo, ...prev]);
      shift(todo.completed ? 1 : -1);
    }
    setCompletingId(null);
  };

  const handlePriorityChange = async (todo: Todo, direction: 1 | -1) => {
    const nextIndex = priorityOrder.indexOf(todo.priority) + direction;
    if (nextIndex < 0 || nextIndex >= priorityOrder.length) return;
    const newPriority = priorityOrder[nextIndex];
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === todo.id ? { ...t, priority: newPriority } : t))));
    try {
      await api.updateTodo(todo.id, { priority: newPriority });
    } catch (err: any) {
      toast.error(err.message);
      setTodos((prev) => sortTodos(prev.map((t) => (t.id === todo.id ? { ...t, priority: todo.priority } : t))));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this todo?')) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.deleteTodo(id);
      toast.success('Deleted');
      fetchStats();
    } catch (err: any) {
      toast.error(err.message);
      fetchTodos(); // revert
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      if (editing) {
        await api.updateTodo(editing.id, form);
        setTodos((prev) => sortTodos(prev.map((t) =>
          t.id === editing.id
            ? { ...t, ...form, priority: form.priority as Todo['priority'], due_date: form.due_date || null }
            : t
        )));
        toast.success('Updated');
      } else {
        const r = await api.createTodo(form);
        if (tab === 'active' && (!priorityFilter || r.data.priority === priorityFilter)) {
          setTodos((prev) => sortTodos([r.data, ...prev]));
        }
        toast.success('Created');
        fetchStats();
      }
      setShowForm(false);
      setEditing(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openForm = (todo?: Todo) => {
    if (todo) {
      setEditing(todo);
      setForm({ title: todo.title, description: todo.description || '', priority: todo.priority, due_date: todo.due_date || '' });
    } else {
      setEditing(null);
      setForm({ title: '', description: '', priority: 'medium', due_date: '' });
    }
    setShowForm(true);
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
        icon={ListTodo}
        title="Todos"
        subtitle="Each completed todo earns Capability XP."
        actions={<button onClick={() => openForm()} className="btn-primary text-sm">+ New Todo</button>}
      />

      <StatTiles stats={[
        { value: stats.pending, label: 'Active' },
        { value: stats.completedToday, label: 'Done Today' },
        {
          value: stats.overdue,
          label: 'Overdue',
          tone: stats.overdue > 0 ? 'critical' : 'muted',
        },
      ]} />

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          className="input pr-8"
          placeholder="Search todos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >✕</button>
        )}
      </div>

      {/* Tabs + filter */}
      <div className="flex items-center gap-2">
        <div className="seg flex-1">
          <button
            onClick={() => setTab('active')}
            className={tab === 'active' ? 'on' : ''}
          >
            Active
          </button>
          <button
            onClick={() => setTab('completed')}
            className={tab === 'completed' ? 'on' : ''}
          >
            Done
          </button>
        </div>
        <select
          className="input w-auto text-sm"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Todo list */}
      {todos.length === 0 ? (
        <EmptyState
          icon={tab === 'completed' ? Trophy : ListTodo}
          title={debouncedSearch ? 'No matches' : tab === 'completed' ? 'No completed todos yet' : 'No active todos'}
        >
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            {debouncedSearch ? 'Try a different search term.' : tab === 'completed' ? 'Complete some tasks to see them here.' : 'Create your first todo to get started.'}
          </p>
          {tab === 'active' && !debouncedSearch && (
            <button onClick={() => openForm()} className="btn-primary text-sm">Create a Todo</button>
          )}
        </EmptyState>
      ) : (
        <>
          {todos.map((todo) => {
            const config = priorityConfig[todo.priority];
            const isOverdue = !todo.completed && todo.due_date && todo.due_date < new Date().toISOString().split('T')[0];

            return (
              <motion.div key={todo.id} variants={listItem}>
                <div className={`card ${todo.completed ? 'opacity-60 bg-gray-50 dark:bg-gray-900/60' : ''}`}>
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => handleToggle(todo)}
                      disabled={completingId === todo.id}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        todo.completed
                          ? 'bg-[#1fa874] border-[#1fa874] text-white'
                          : completingId === todo.id
                            ? 'border-brand-400 bg-brand-50 dark:bg-brand-950'
                            : 'border-gray-300 dark:border-gray-700 hover:border-brand-400'
                      }`}
                    >
                      {todo.completed && (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center"><Check size={12} /></motion.span>
                      )}
                      {completingId === todo.id && !todo.completed && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-3 h-3 bg-brand-500 rounded-full" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <span className={`badge badge-${todo.priority} flex-shrink-0 ${todo.completed ? 'opacity-60' : ''}`}>
                          {config.label}
                        </span>
                        <h3 className={`font-medium min-w-0 break-words ${todo.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                          {todo.title}
                        </h3>
                      </div>
                      {todo.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{todo.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                        {!todo.completed && <XpChip attribute="capability" amount={TODO_XP[todo.priority]} />}
                        {todo.due_date && (
                          <span className={`flex items-center gap-0.5 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                            {isOverdue && <AlertTriangle size={11} />}
                            {isOverdue ? 'Overdue: ' : 'Due: '}{todo.due_date}
                          </span>
                        )}
                        {todo.completed && todo.completed_at && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">Done: {todo.completed_at.split('T')[0]}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.08] justify-center items-center">
                    <button
                      onClick={() => handlePriorityChange(todo, 1)}
                      disabled={todo.priority === 'high'}
                      title="Prioritize"
                      className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => handlePriorityChange(todo, -1)}
                      disabled={todo.priority === 'low'}
                      title="De-prioritize"
                      className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => openForm(todo)} className="btn-ghost text-xs">Edit</button>
                    <button onClick={() => handleDelete(todo.id)} className="btn-ghost text-xs text-red-400">Delete</button>
                  </div>
                </div>
              </motion.div>
            );
          })}
          <div ref={sentinelRef} className="h-4 flex items-center justify-center">
            {loadingMore && <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}
          </div>
        </>
      )}

      {/* Todo form modal */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-[#050609]/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/70 dark:border-white/[0.08] shadow-2xl shadow-black/30 w-full max-w-md p-5"
          >
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{editing ? 'Edit Todo' : 'New Todo'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input className="input" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="What needs to be done?" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea className="input" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Details (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                <select className="input" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                <input type="date" className="input" value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                {form.due_date && (
                  <button type="button"
                    onClick={() => setForm({ ...form, due_date: '' })}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mt-1 block">
                    Clear date
                  </button>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {editing ? 'Save Changes' : 'Create Todo'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
