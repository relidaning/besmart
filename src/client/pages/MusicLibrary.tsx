import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Trash2, ListMusic, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/PageKit';
import { api } from '../hooks/api';

const PAGE_SIZE = 8;

interface CatalogTrack {
  id: string;
  title: string;
  composer: string;
  filename: string;
  durationSec: number;
  downloaded: boolean;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.02 } },
};

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MusicLibrary() {
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [catalog, setCatalog] = useState<CatalogTrack[] | null>(null);
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.getMusicCatalog().then((r) => setCatalog(r.data)).catch(() => setError('Failed to load music catalog'));
    api.getMusicLibrary().then((r) => setActiveIds(r.data.map((t: { id: string }) => t.id))).catch(() => {});
  }, []);

  useEffect(() => () => audioRef.current?.pause(), []);

  const activeSet = useMemo(() => new Set(activeIds), [activeIds]);

  // Only the locally-downloaded tracks are playable/manageable — nothing to do with an
  // entry that hasn't been fetched to disk, so don't clutter the list with it.
  const available = useMemo(() => (catalog ?? []).filter((t) => t.downloaded), [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((t) => t.title.toLowerCase().includes(q) || t.composer.toLowerCase().includes(q));
  }, [available, query]);

  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  async function toggle(track: CatalogTrack) {
    setError(null);
    setPendingId(track.id);
    try {
      if (activeSet.has(track.id)) {
        const r = await api.removeMusicTrack(track.id);
        setActiveIds(r.data.map((t: { id: string }) => t.id));
      } else {
        const r = await api.addMusicTrack(track.id);
        setActiveIds(r.data.map((t: { id: string }) => t.id));
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setPendingId(null);
    }
  }

  function togglePreview(track: CatalogTrack) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    // avoid overlapping with the persistent top-bar player or a different preview
    document.querySelectorAll('audio').forEach((a) => { if (a !== audio) a.pause(); });
    audio.src = `/media/music/${track.filename}`;
    audio.play().catch(() => {});
    setPlayingId(track.id);
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />

      <PageHeader
        icon={ListMusic}
        iconClass="text-brand-500"
        title="Manage Music"
        subtitle={`${activeIds.length} of ${available.length} tracks active in the focus-music rotation.`}
        onBack={() => navigate(-1)}
      />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or composer…"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
        {!catalog && <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">Loading…</div>}
        {catalog && filtered.length === 0 && (
          <div className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No matches</div>
        )}
        {paged.map((track) => {
          const active = activeSet.has(track.id);
          const isPending = pendingId === track.id;
          const isPlaying = playingId === track.id;
          return (
            <div key={track.id} className="flex items-center gap-3 py-3 px-4">
              <button
                onClick={() => togglePreview(track)}
                title={isPlaying ? 'Pause preview' : 'Play preview'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-gray-800 dark:text-gray-100">{track.title}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {track.composer} · {formatDuration(track.durationSec)}
                </div>
              </div>

              <button
                onClick={() => toggle(track)}
                disabled={isPending}
                title={active ? 'Remove from rotation' : 'Add to rotation'}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                  active
                    ? 'bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900'
                    : 'bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-400 dark:hover:bg-brand-900'
                }`}
              >
                {isPending ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : active ? (
                  <Trash2 size={14} />
                ) : (
                  <Plus size={15} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pageSafe <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            Page {pageSafe} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageSafe >= totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </motion.div>
  );
}
