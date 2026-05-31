import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ListTodo, Trophy, Check, AlertTriangle } from 'lucide-react';
import { api } from '../hooks/api';

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
  high: { border: 'border-l-red-400' },
  medium: { border: 'border-l-yellow-400' },
  low: { border: 'border-l-green-400' },
};

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', due_date: '' });
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [completedToday, setCompletedToday] = useState<number>(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const buildParams = useCallback((pageNum: number) => {
    const params: any = { page: pageNum, limit: PAGE_SIZE };
    if (tab === 'active') params.completed = 'false';
    else if (tab === 'completed') params.completed = 'true';
    if (priorityFilter) params.priority = priorityFilter;
    if (search) params.search = search;
    return params;
  }, [tab, priorityFilter, search]);

  const fetchTodos = useCallback(() => {
    setLoading(true);
    setPage(1);
    api.getTodos(buildParams(1)).then((r) => {
      setTodos(r.data);
      setHasMore(r.pagination.page < r.pagination.totalPages);
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
    api.getTodoStats().then((r) => setCompletedToday(r.data.completedToday));
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
    setCompletedToday((n) => todo.completed ? n - 1 : n + 1);
    setCompletingId(todo.id);
    try {
      if (todo.completed) {
        await api.uncompleteTodo(todo.id);
        toast('Reopened');
      } else {
        await api.completeTodo(todo.id);
        toast.success('Done! 🎉');
      }
    } catch (err: any) {
      toast.error(err.message);
      // Revert on failure
      setTodos((prev) => [todo, ...prev]);
      setCompletedToday((n) => todo.completed ? n + 1 : n - 1);
    }
    setCompletingId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this todo?')) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.deleteTodo(id);
      toast.success('Deleted');
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
        setTodos((prev) => prev.map((t) =>
          t.id === editing.id ? { ...t, ...form, priority: form.priority as Todo['priority'] } : t
        ));
        toast.success('Updated');
      } else {
        const r = await api.createTodo(form);
        if (tab === 'active') setTodos((prev) => [r.data, ...prev]);
        toast.success('Created');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Todos</h1>
          <p className="text-gray-500 text-sm mt-0.5">{todos.length} tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
            <Check size={14} className="text-green-600" />
            <span className="text-green-700 font-semibold text-sm">{completedToday}</span>
            <span className="text-green-600 text-xs">done today</span>
          </div>
          <button onClick={() => openForm()} className="btn-primary text-sm">+ New Todo</button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        className="input"
        placeholder="Search todos..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Tabs + filter */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
          <button
            onClick={() => setTab('active')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === 'active' ? 'bg-brand-500 text-white font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === 'completed' ? 'bg-brand-500 text-white font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
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
        <motion.div variants={listItem} className="card text-center py-12">
          <div className="flex justify-center mb-4 text-gray-300">
            {tab === 'completed' ? <Trophy size={48} /> : <ListTodo size={48} />}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {tab === 'completed' ? 'No completed todos yet' : 'No active todos'}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {tab === 'completed' ? 'Complete some tasks to see them here.' : 'Create your first todo to get started.'}
          </p>
          {tab === 'active' && (
            <button onClick={() => openForm()} className="btn-primary text-sm">Create a Todo</button>
          )}
        </motion.div>
      ) : (
        <>
          {todos.map((todo) => {
            const config = priorityConfig[todo.priority];
            const isOverdue = !todo.completed && todo.due_date && todo.due_date < new Date().toISOString().split('T')[0];

            return (
              <motion.div key={todo.id} variants={listItem}>
                <div className={`card border-l-4 ${config.border} ${todo.completed ? 'opacity-60 bg-gray-50' : ''}`}>
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => handleToggle(todo)}
                      disabled={completingId === todo.id}
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        todo.completed
                          ? 'bg-green-500 border-green-500 text-white'
                          : completingId === todo.id
                            ? 'border-brand-400 bg-brand-50'
                            : 'border-gray-300 hover:border-brand-400'
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
                      <h3 className={`font-medium ${todo.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {todo.title}
                      </h3>
                      {todo.description && (
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{todo.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {todo.due_date && (
                          <span className={`flex items-center gap-0.5 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {isOverdue && <AlertTriangle size={11} />}
                            {isOverdue ? 'Overdue: ' : 'Due: '}{todo.due_date}
                          </span>
                        )}
                        {todo.completed && todo.completed_at && (
                          <span className="text-xs text-gray-400">Done: {todo.completed_at.split('T')[0]}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100 justify-center">
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
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
          >
            <h2 className="text-lg font-bold mb-4">{editing ? 'Edit Todo' : 'New Todo'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input className="input" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="What needs to be done?" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea className="input" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Details (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select className="input" value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" className="input" value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                {form.due_date && (
                  <button type="button"
                    onClick={() => setForm({ ...form, due_date: '' })}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1 block">
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
