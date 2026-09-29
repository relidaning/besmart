import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Trophy, FileText, ExternalLink, ChevronRight, RefreshCw, Search, Brain } from 'lucide-react';
import { api } from '../hooks/api';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { PageHeader, StatTiles, XpChip } from '../components/PageKit';
import type { GardenSummary } from './Garden';

interface ReviewRecord {
  id: number;
  course_id: number;
  course_name: string;
  course_description: string;
  reviewed_times: number;
  planned_date: string;
  is_reviewed: boolean;
  is_postponed: boolean;
  vault_path: string | null;
  vault_paths: string[] | null;
  vault_match_status: string | null;
  ease_factor: number;
  interval_days: number;
}

interface VaultNote {
  path: string;
  title: string;
  mtime: string;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const listItem  = { hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } };

function primaryPath(vault_path: string | null, vault_paths: string[] | null) {
  return vault_path ?? vault_paths?.[0] ?? null;
}

function obsidianUri(vaultName: string, p: string) {
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(p.replace(/\.md$/, ''))}`;
}

export default function Review() {
  const navigate = useNavigate();
  const [dueRecords, setDueRecords] = useState<ReviewRecord[]>([]);
  const [dueTotal, setDueTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ReviewRecord | null>(null);
  const [form, setForm] = useState({ name: '', description: '', is_postponed: false });

  const [vaultName, setVaultName] = useState('');
  const [vaultSuggestions, setVaultSuggestions] = useState<VaultNote[]>([]);
  const [selectedVault, setSelectedVault] = useState<Set<string>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [importingVault, setImportingVault] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [courseCount, setCourseCount] = useState<number | null>(null);
  const [wisdom, setWisdom] = useState<GardenSummary['attributes'][number] | null>(null);

  const initialLoadDone = useRef(false);

  const fetchAll = (search = debouncedQuery) => {
    if (!initialLoadDone.current) setLoading(true);
    api.getDueReviews(search || undefined)
      .then((dueR) => { setDueRecords(dueR.data); setDueTotal(dueR.total ?? dueR.data.length); initialLoadDone.current = true; })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    fetchAll(debouncedQuery);
  }, [debouncedQuery]);

  useEffect(() => {
    api.getStats().then((r) => setCourseCount(r.data.reviews.total_courses)).catch(() => {});
    api.getGardenSummary()
      .then((r: { data: GardenSummary }) => setWisdom(r.data.attributes.find((a) => a.attribute === 'wisdom') ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.getVaultInfo().then((r: any) => setVaultName(r.vault_name)).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem('review-anchor');
    if (!saved) return;
    sessionStorage.removeItem('review-anchor');

    const [savedId, savedIdx] = saved.split(':').map(Number);
    // Prefer exact match (user went back); fall back to same position (item was completed)
    const target = dueRecords.find((r) => r.id === savedId)
      ?? dueRecords[Math.min(savedIdx, dueRecords.length - 1)];
    if (!target) return;

    const targetIdx = dueRecords.indexOf(target);
    const needsExpand = targetIdx + 1 > dueVisible;
    if (needsExpand) setDueVisible(targetIdx + 5);

    setTimeout(() => {
      document.getElementById(`review-item-${target.id}`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    }, needsExpand ? 50 : 0);
  }, [loading]);

  useEffect(() => {
    if (!loading && dueRecords.length === 0 && vaultSuggestions.length === 0) {
      loadVaultSuggestions();
    }
  }, [loading, dueRecords.length]);

  const loadVaultSuggestions = async () => {
    if (loadingSuggestions) return;
    setLoadingSuggestions(true);
    try { const r = await api.getVaultSuggestions(); setVaultSuggestions(r.data); } catch {}
    setLoadingSuggestions(false);
  };

  const handleImportVault = async () => {
    if (!selectedVault.size) return;
    setImportingVault(true);
    try {
      await api.importVaultNotes(Array.from(selectedVault));
      const n = selectedVault.size;
      toast.success(`Added ${n} note${n > 1 ? 's' : ''} to review queue. First review tomorrow.`);
      setSelectedVault(new Set());
      setVaultSuggestions([]);
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
    setImportingVault(false);
  };

  const handleRematch = async () => {
    setRematching(true);
    try {
      const r = await api.rematchVault();
      toast.success(`Re-matched ${r.updated} course${r.updated !== 1 ? 's' : ''} against vault`);
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
    setRematching(false);
  };

  const handleSyncVault = async () => {
    setSyncing(true);
    try {
      const r = await api.syncVault();
      const parts = [];
      if (r.missing > 0) parts.push(`${r.missing} missing`);
      if (r.restored > 0) parts.push(`${r.restored} restored`);
      toast.success(parts.length ? parts.join(', ') : 'All notes accounted for');
      if (r.missing > 0 || r.restored > 0) fetchAll();
    } catch (err: any) { toast.error(err.message); }
    setSyncing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) { await api.updateCourse(editing.course_id, form); toast.success('Updated'); }
      else { await api.createCourse(form); toast.success('Course created! First review tomorrow.'); }
      setShowForm(false); setEditing(null); fetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const openForm = (record?: ReviewRecord) => {
    setEditing(record ?? null);
    setForm(record
      ? { name: record.course_name, description: record.course_description, is_postponed: record.is_postponed }
      : { name: '', description: '', is_postponed: false });
    setShowForm(true);
  };

  const handleDelete = async (courseId: number) => {
    if (!confirm('Delete this course and all its review records?')) return;
    await api.deleteCourse(courseId); toast.success('Deleted'); fetchAll();
  };

  const handleTogglePostpone = async (record: ReviewRecord) => {
    try {
      await api.updateCourse(record.course_id, { is_postponed: !record.is_postponed });
      toast.success(record.is_postponed ? 'Un-postponed' : 'Postponed to the back of the queue');
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const { visible: dueVisible, setVisible: setDueVisible, sentinelRef: dueSentinelRef } = useInfiniteScroll(dueRecords.length);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      <PageHeader
        icon={RefreshCw}
        title="Review"
        subtitle={dueRecords.length > 0
          ? dueTotal > dueRecords.length
            ? `Showing ${dueRecords.length} of ${dueTotal} due`
            : `${dueRecords.length} due for review`
          : 'Spaced repetition for lasting memory'}
        actions={<button onClick={() => openForm()} className="btn-primary text-sm">+ New Course</button>}
      />

      <StatTiles stats={[
        {
          value: dueTotal,
          label: debouncedQuery ? 'Matches' : 'Due',
        },
        { value: courseCount ?? '–', label: 'Courses' },
        {
          value: wisdom ? wisdom.level : '–',
          label: 'Wisdom Lv',
          progress: wisdom ? ((wisdom.xp - wisdom.floor) / (wisdom.next - wisdom.floor)) * 100 : undefined,
          barClass: 'bg-[#a854f7]',
        },
      ]} />

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
        <input
          className="input pl-9 pr-8 text-sm"
          placeholder="Search courses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >✕</button>
        )}
      </div>

      {/* Vault tools */}
      <div className="flex justify-end gap-3">
        <button onClick={handleSyncVault} disabled={syncing}
          className="flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-700 dark:hover:text-brand-300 disabled:opacity-40 transition-colors font-medium"
          title="Import all unscheduled vault notes and detect moved/deleted ones">
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync vault'}
        </button>
        <button onClick={handleRematch} disabled={rematching}
          className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
          title="Re-scan vault and update fuzzy matches for manually added courses">
          <RefreshCw size={13} className={rematching ? 'animate-spin' : ''} />
          {rematching ? 'Matching...' : 'Re-match'}
        </button>
      </div>

      {dueRecords.length === 0 ? (
        <motion.div variants={listItem} className="space-y-4">
          <div className="card text-center py-10">
            <div className="flex justify-center mb-3 text-green-400"><Trophy size={40} /></div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{debouncedQuery ? 'No matches' : 'All caught up!'}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{debouncedQuery ? 'Try a different search term.' : 'No reviews due. Pick notes from your vault to schedule.'}</p>
          </div>
          <VaultSuggestionPanel
            loading={loadingSuggestions} suggestions={vaultSuggestions}
            selected={selectedVault} importing={importingVault}
            onToggle={(p) => setSelectedVault((prev) => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; })}
            onSelectAll={() => setSelectedVault(new Set(vaultSuggestions.map((n) => n.path)))}
            onClear={() => setSelectedVault(new Set())}
            onImport={handleImportVault}
          />
        </motion.div>
      ) : (
        <>
          {dueRecords.slice(0, dueVisible).map((record) => {
            const pp = primaryPath(record.vault_path, record.vault_paths);
            const noMatch = record.vault_match_status === 'none';
            const isMissing = record.vault_match_status === 'missing';
            const isOverdue = record.planned_date < new Date().toISOString().slice(0, 10);

            return (
              <motion.div key={record.id} id={`review-item-${record.id}`} variants={listItem}
                className={`card cursor-pointer ${record.is_postponed ? 'opacity-60' : ''}`}
                onClick={() => {
                  const idx = dueRecords.indexOf(record);
                  sessionStorage.setItem('review-anchor', `${record.id}:${idx}`);
                  navigate(`/review/record/${record.id}`);
                }}
              >
                <div className="flex items-start gap-2">
                  <span className={`dot mt-1.5 ${noMatch || isOverdue ? 'bg-[#e66666]' : isMissing ? 'bg-brand-400' : 'bg-[#a854f7]'}`} />
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-[13px] font-bold leading-snug ${noMatch ? 'text-[#d64545] dark:text-[#ec8a8a]' : isMissing ? 'text-brand-600 dark:text-brand-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {record.course_name}
                    </h3>
                    {(record.vault_paths && record.vault_paths.length > 0
                      ? record.vault_paths
                      : pp ? [pp] : []
                    ).map((path) => (
                      <p key={path} className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1 min-w-0">
                        <FileText size={10} className="flex-shrink-0" />
                        <span className="truncate">{path}</span>
                        {vaultName && (
                          <a href={obsidianUri(vaultName, path)} onClick={(e) => e.stopPropagation()}
                            title="Open in Obsidian"
                            className="text-[#a854f7] hover:text-[#c58cfa] transition-colors flex-shrink-0 ml-0.5">
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </p>
                    ))}
                    {noMatch && <p className="text-[11px] text-[#d64545] dark:text-[#ec8a8a] mt-0.5">No matching note in vault</p>}
                    {isMissing && <p className="text-[11px] text-brand-600 dark:text-brand-400 mt-0.5">Note moved or deleted</p>}
                    <div className="text-[11px] text-gray-500 mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <XpChip attribute="wisdom" amount="6–12" />
                      <span>· review #{record.reviewed_times + 1} · {record.interval_days}d interval ·</span>
                      <span className={isOverdue ? 'text-[#d64545] dark:text-[#ec8a8a]' : ''}>
                        {isOverdue ? 'overdue since' : 'due'} {record.planned_date}
                      </span>
                      {record.is_postponed && <span>· postponed</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-400 dark:text-gray-600 mt-0.5 flex-shrink-0" />
                </div>
                <div className="flex justify-end gap-1 mt-2 -mb-1 -mr-1">
                  <button onClick={(e) => { e.stopPropagation(); handleTogglePostpone(record); }}
                    title={record.is_postponed ? 'Move back to normal order' : 'Postpone to the back of the queue'}
                    className={`btn-ghost text-xs !px-2 !py-1 ${record.is_postponed ? '!text-brand-600 dark:!text-brand-400' : ''}`}
                  >{record.is_postponed ? 'Unpostpone' : 'Postpone'}</button>
                  <button onClick={(e) => { e.stopPropagation(); openForm(record); }}
                    className="btn-ghost text-xs !px-2 !py-1">Edit</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(record.course_id); }}
                    className="btn-ghost text-xs !px-2 !py-1 !text-[#d64545] dark:!text-[#ec8a8a]"
                  >Delete</button>
                </div>
              </motion.div>
            );
          })}
          <div ref={dueSentinelRef} className="h-1" />
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 bg-[#050609]/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/70 dark:border-white/[0.08] shadow-2xl shadow-black/30 w-full max-w-md p-5"
          >
            <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{editing ? 'Edit Course' : 'New Course'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input className="input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Introduction to Algorithms" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea className="input" rows={2} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What did you learn? (optional)" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">{editing ? 'Save' : 'Create'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Vault suggestion panel ────────────────────────────────────────────────────

function VaultSuggestionPanel({ loading, suggestions, selected, importing, onToggle, onSelectAll, onClear, onImport }: {
  loading: boolean; suggestions: any[]; selected: Set<string>; importing: boolean;
  onToggle: (p: string) => void; onSelectAll: () => void; onClear: () => void; onImport: () => void;
}) {
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Add from your vault</h3>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Recently modified notes not yet in your review queue</p>
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">No unscheduled notes found.</p>
      ) : (
        <>
          <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
            {suggestions.map((note) => (
              <label key={note.path} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input type="checkbox" checked={selected.has(note.path)} onChange={() => onToggle(note.path)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-900 text-brand-500 focus:ring-brand-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{note.title}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{note.path}</p>
                </div>
                <span className="text-xs text-gray-300 dark:text-gray-600 flex-shrink-0">{new Date(note.mtime).toLocaleDateString()}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 dark:border-white/[0.08]">
            <button onClick={onSelectAll} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Select all</button>
            <button onClick={onClear} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">Clear</button>
            <button onClick={onImport} disabled={!selected.size || importing} className="btn-primary ml-auto text-sm disabled:opacity-40">
              {importing ? 'Adding...' : selected.size ? `Schedule ${selected.size} note${selected.size > 1 ? 's' : ''}` : 'Schedule selected'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
