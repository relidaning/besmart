import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, Play, Pause, SkipBack, SkipForward, Shuffle, Volume2, VolumeX, ListMusic } from 'lucide-react';
import { api } from '../hooks/api';

const STORAGE_KEY = 'besmart-music';
const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

interface Track {
  id: string;
  title: string;
  composer: string;
  filename: string;
  durationSec: number;
}

interface StoredPrefs {
  volume: number;
  speedIndex: number;
  shuffle: boolean;
}

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { volume: 0.6, speedIndex: 0, shuffle: false, ...JSON.parse(raw) };
  } catch {
    // ignore malformed prefs
  }
  return { volume: 0.6, speedIndex: 0, shuffle: false };
}

export default function MusicPlayer() {
  const initialPrefs = useRef(loadPrefs()).current;
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [muted, setMuted] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(initialPrefs.speedIndex);
  const [shuffle, setShuffle] = useState(initialPrefs.shuffle);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const trackIndex = tracks.findIndex((t) => t.id === currentTrackId);
  const track = trackIndex >= 0 ? tracks[trackIndex] : tracks[0];

  function refreshLibrary() {
    api.getMusicLibrary().then((r) => {
      const updated: Track[] = r.data;
      setTracks(updated);
      setCurrentTrackId((prev) => (prev && updated.some((t) => t.id === prev) ? prev : (updated[0]?.id ?? null)));
    }).catch(() => {});
  }

  // Initial load, and refresh whenever the panel is opened (picks up changes made
  // on the /music management page, since Layout — and this component — stay mounted across routes).
  useEffect(() => { refreshLibrary(); }, []);
  useEffect(() => { if (open) refreshLibrary(); }, [open]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, speedIndex, shuffle }));
  }, [volume, speedIndex, shuffle]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = SPEEDS[speedIndex];
    audio.muted = muted;
  }, [volume, speedIndex, muted]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function nextTrackId() {
    if (tracks.length === 0) return null;
    const idx = trackIndex >= 0 ? trackIndex : 0;
    if (shuffle && tracks.length > 1) {
      let next = idx;
      while (next === idx) next = Math.floor(Math.random() * tracks.length);
      return tracks[next].id;
    }
    return tracks[(idx + 1) % tracks.length].id;
  }

  function playPause() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }

  function skip(delta: 1 | -1) {
    if (tracks.length === 0) return;
    const idx = trackIndex >= 0 ? trackIndex : 0;
    const nextId = delta === 1 ? nextTrackId() : tracks[(idx - 1 + tracks.length) % tracks.length].id;
    setCurrentTrackId(nextId);
    requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
  }

  function cycleSpeed() {
    setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  }

  function goManage() {
    setOpen(false);
    navigate('/music');
  }

  return (
    <div className="relative" ref={panelRef}>
      {track && (
        <audio
          ref={audioRef}
          src={`/media/music/${track.filename}`}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setCurrentTrackId(nextTrackId());
            requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
          }}
        />
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className={`transition-colors ${
          isPlaying ? 'text-brand-500 hover:text-brand-700' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
        }`}
        title="Focus music"
      >
        <Music size={16} className={isPlaying ? 'animate-pulse' : ''} />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-gray-100 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {!track ? (
            <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
              No tracks active.
              <button
                onClick={goManage}
                className="mt-2 block w-full rounded-lg bg-brand-50 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-400 dark:hover:bg-brand-900"
              >
                Manage music
              </button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{track.title}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{track.composer}</div>
                </div>
                <button
                  onClick={goManage}
                  className="shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  title="Manage music"
                >
                  <ListMusic size={15} />
                </button>
              </div>

              <div className="mb-3 flex items-center justify-center gap-4">
                <button onClick={() => skip(-1)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <SkipBack size={18} />
                </button>
                <button
                  onClick={playPause}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                >
                  {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <button onClick={() => skip(1)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <SkipForward size={18} />
                </button>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <button
                  onClick={() => setShuffle((s) => !s)}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                    shuffle ? 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                  }`}
                  title="Shuffle"
                >
                  <Shuffle size={13} /> Shuffle
                </button>
                <button
                  onClick={cycleSpeed}
                  className="rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  title="Playback speed"
                >
                  {SPEEDS[speedIndex]}x
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setMuted((m) => !m)} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                  {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setMuted(false);
                  }}
                  className="h-1 flex-1 accent-brand-600"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
