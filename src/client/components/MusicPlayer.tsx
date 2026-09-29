import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Music, Moon, Play, Pause, SkipBack, SkipForward, Shuffle, Volume2, VolumeX, ListMusic } from 'lucide-react';
import { api } from '../hooks/api';

const STORAGE_KEY = 'besmart-music';
const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
const SLEEP_TIMERS = [15, 30, 60, 90] as const; // minutes
const FADE_MS = 20_000; // the sleep timer fades out over its last 20s (where the browser allows volume control)

type Mode = 'focus' | 'sleep';

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
  mode: Mode;
}

function loadPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { volume: 0.6, speedIndex: 0, shuffle: false, mode: 'focus', ...JSON.parse(raw) };
  } catch {
    // ignore malformed prefs
  }
  return { volume: 0.6, speedIndex: 0, shuffle: false, mode: 'focus' };
}

function mmss(ms: number) {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Phones get a bottom sheet instead of the dropdown (same 768px breakpoint as the bottom tab bar).
function useIsPhone() {
  const query = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

export default function MusicPlayer() {
  const initialPrefs = useRef(loadPrefs()).current;
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Focus plays the managed piano library; Sleep plays the rain recordings, each looped.
  const [mode, setMode] = useState<Mode>(initialPrefs.mode);
  const [focusTracks, setFocusTracks] = useState<Track[]>([]);
  const [sleepTracks, setSleepTracks] = useState<Track[]>([]);
  const [trackIds, setTrackIds] = useState<Record<Mode, string | null>>({ focus: null, sleep: null });
  const [sleepEndAt, setSleepEndAt] = useState<number | null>(null);
  const [sleepChoice, setSleepChoice] = useState<number | null>(null); // minutes picked, for the highlight
  const [now, setNow] = useState(Date.now());
  const tracks = mode === 'sleep' ? sleepTracks : focusTracks;
  const currentTrackId = trackIds[mode];
  const setCurrentTrackId = (id: string | null) => setTrackIds((prev) => ({ ...prev, [mode]: id }));
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [muted, setMuted] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(initialPrefs.speedIndex);
  const [shuffle, setShuffle] = useState(initialPrefs.shuffle);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const phone = useIsPhone();
  const pendingAutoplayRef = useRef(false);

  const trackIndex = tracks.findIndex((t) => t.id === currentTrackId);
  const track = trackIndex >= 0 ? tracks[trackIndex] : tracks[0];

  function refreshLibrary() {
    const keep = (list: Track[], prev: string | null) =>
      prev && list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? null);
    api.getMusicLibrary().then((r) => {
      const updated: Track[] = r.data;
      setFocusTracks(updated);
      setTrackIds((prev) => ({ ...prev, focus: keep(updated, prev.focus) }));
    }).catch(() => {});
    api.getSleepTracks().then((r) => {
      const updated: Track[] = r.data;
      setSleepTracks(updated);
      setTrackIds((prev) => ({ ...prev, sleep: keep(updated, prev.sleep) }));
    }).catch(() => {});
  }

  // Initial load, and refresh whenever the panel is opened (picks up changes made
  // on the /music management page, since Layout — and this component — stay mounted across routes).
  useEffect(() => { refreshLibrary(); }, []);
  useEffect(() => { if (open) refreshLibrary(); }, [open]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, speedIndex, shuffle, mode }));
  }, [volume, speedIndex, shuffle, mode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = mode === 'sleep' ? 1 : SPEEDS[speedIndex];
    audio.loop = mode === 'sleep';
    audio.muted = muted;
  }, [volume, speedIndex, muted, mode, currentTrackId]);

  // Sleep timer. Checked every second and on every timeupdate, since the page's own
  // timers may be throttled while the phone is locked but the audio keeps running.
  function tickSleepTimer() {
    const audio = audioRef.current;
    if (sleepEndAt === null || !audio) return;
    const left = sleepEndAt - Date.now();
    setNow(Date.now());
    if (left <= 0) {
      audio.pause();
      audio.volume = volume;
      setSleepEndAt(null);
      setSleepChoice(null);
    } else if (left < FADE_MS) {
      audio.volume = volume * (left / FADE_MS); // ignored on iOS, which then simply stops at the end
    }
  }
  useEffect(() => {
    if (sleepEndAt === null) return;
    const id = setInterval(tickSleepTimer, 1000);
    return () => clearInterval(id);
  }, [sleepEndAt, volume]);

  // Lock-screen / Control Center title.
  useEffect(() => {
    if (!track || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: mode === 'sleep' ? 'BeSmart · Sleep' : track.composer,
      album: 'BeSmart',
    });
  }, [track?.id, mode]);

  // requestAnimationFrame is throttled/suspended in background tabs, so autoplay-on-track-change
  // is driven from an effect (fires on commit regardless of tab visibility) instead.
  useEffect(() => {
    if (pendingAutoplayRef.current) {
      pendingAutoplayRef.current = false;
      audioRef.current?.play().catch(() => {});
    }
  }, [currentTrackId, mode]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || sheetRef.current?.contains(t)) return;
      setOpen(false);
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
    pendingAutoplayRef.current = true;
    setCurrentTrackId(nextId);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    const wasPlaying = isPlaying;
    audioRef.current?.pause();
    if (next === 'focus') { setSleepEndAt(null); setSleepChoice(null); }
    pendingAutoplayRef.current = wasPlaying;
    setMode(next);
  }

  function startSleepTimer(minutes: number | null) {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
    setSleepEndAt(minutes === null ? null : Date.now() + minutes * 60_000);
    setSleepChoice(minutes);
    setNow(Date.now());
    if (minutes !== null && !isPlaying) audio?.play().catch(() => {});
  }

  function cycleSpeed() {
    setSpeedIndex((i) => (i + 1) % SPEEDS.length);
  }

  function goManage() {
    setOpen(false);
    navigate('/music');
  }

  function controls(big: boolean) {
    const icon = big ? 24 : 18;
    const sleepLeft = sleepEndAt === null ? null : sleepEndAt - now;
    return (
      <>
        <div className={`seg ${big ? 'mb-4' : 'mb-3'}`}>
          <button onClick={() => switchMode('focus')} className={`flex items-center justify-center gap-1.5 !text-xs ${mode === 'focus' ? 'on' : ''}`}>
            <Music size={13} /> Focus
          </button>
          <button onClick={() => switchMode('sleep')} className={`flex items-center justify-center gap-1.5 !text-xs ${mode === 'sleep' ? 'on' : ''}`}>
            <Moon size={13} /> Sleep
          </button>
        </div>

        {!track ? (
          <div className="py-4 text-center text-sm text-gray-500">
            {mode === 'sleep' ? 'No rain recordings downloaded.' : 'No tracks active.'}
            {mode === 'focus' && <button onClick={goManage} className="btn-secondary mt-3 block w-full text-xs">Manage music</button>}
          </div>
        ) : (
          <>
            <div className={`flex items-start justify-between gap-2 ${big ? 'mb-4' : 'mb-2'}`}>
              <div className="min-w-0">
                <div className={`truncate font-bold text-gray-900 dark:text-gray-100 ${big ? 'text-base' : 'text-sm'}`}>{track.title}</div>
                <div className="text-xs text-gray-500">
                  {mode === 'sleep' ? `${Math.round(track.durationSec / 60)} min · loops` : track.composer}
                </div>
              </div>
              {mode === 'focus' && (
                <button onClick={goManage} className="btn-ghost shrink-0 !p-1.5" title="Manage music">
                  <ListMusic size={big ? 18 : 15} />
                </button>
              )}
            </div>

            <div className={`flex items-center justify-center ${big ? 'mb-5 gap-10' : 'mb-3 gap-4'}`}>
              <button onClick={() => skip(-1)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Previous">
                <SkipBack size={icon} />
              </button>
              <button
                onClick={playPause}
                className={`flex items-center justify-center rounded-full bg-brand-400 text-ink hover:bg-brand-300 ${big ? 'h-14 w-14' : 'h-9 w-9'}`}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={icon} /> : <Play size={icon} className="ml-0.5" />}
              </button>
              <button onClick={() => skip(1)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Next">
                <SkipForward size={icon} />
              </button>
            </div>

            <div className={`flex items-center gap-2 ${big ? 'mb-4' : 'mb-3'}`}>
              <button onClick={() => setMuted((m) => !m)} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Mute">
                {muted || volume === 0 ? <VolumeX size={big ? 18 : 14} /> : <Volume2 size={big ? 18 : 14} />}
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
                className={`flex-1 accent-brand-400 ${big ? 'h-2' : 'h-1'}`}
              />
            </div>

            {mode === 'focus' ? (
              <div className="seg">
                <button onClick={() => setShuffle((v) => !v)} className={`flex items-center justify-center gap-1.5 !text-xs ${shuffle ? 'on' : ''}`} title="Shuffle">
                  <Shuffle size={13} /> Shuffle
                </button>
                <button onClick={cycleSpeed} className="!text-xs" title="Playback speed">
                  {SPEEDS[speedIndex]}x speed
                </button>
              </div>
            ) : (
              <>
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-gray-500">
                  <span>Sleep timer</span>
                  <span className={sleepLeft !== null ? 'font-bold text-brand-600 dark:text-brand-400' : ''}>
                    {sleepLeft !== null ? `stops in ${mmss(sleepLeft)}` : 'off: plays until you stop it'}
                  </span>
                </div>
                <div className="seg">
                  <button onClick={() => startSleepTimer(null)} className={`!px-1 !text-xs ${sleepEndAt === null ? 'on' : ''}`}>Off</button>
                  {SLEEP_TIMERS.map((m) => (
                    <button key={m} onClick={() => startSleepTimer(m)} className={`!px-1 !text-xs ${sleepChoice === m ? 'on' : ''}`}>{m}m</button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {track && (
        <audio
          ref={audioRef}
          src={`/media/music/${track.filename}`}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={tickSleepTimer}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            pendingAutoplayRef.current = true;
            setCurrentTrackId(nextTrackId());
          }}
        />
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className={`transition-colors ${
          isPlaying ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
        }`}
        title="Focus & sleep music"
      >
        {mode === 'sleep'
          ? <Moon size={16} className={isPlaying ? 'animate-pulse' : ''} />
          : <Music size={16} className={isPlaying ? 'animate-pulse' : ''} />}
      </button>

      {open && !phone && (
        <div className="absolute right-0 top-8 z-50 w-64 rounded-[14px] border border-gray-200/70 bg-white p-3 shadow-2xl shadow-black/30 dark:border-white/[0.08] dark:bg-gray-900">
          {controls(false)}
        </div>
      )}

      {/* Phones: a bottom sheet (floatingsphere's .sheet). Portaled, because the top
          bar's backdrop-filter would make it position against the bar, not the screen. */}
      {phone && createPortal(
        <>
          <div
            onClick={() => setOpen(false)}
            className={`fixed inset-0 z-[60] bg-[#050609]/60 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          />
          <div
            ref={sheetRef}
            className={`fixed inset-x-0 bottom-0 z-[61] rounded-t-[18px] border border-b-0 border-gray-200/70 bg-white px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] dark:border-white/[0.08] dark:bg-gray-900 ${open ? 'translate-y-0' : 'invisible translate-y-[105%]'}`}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-300 dark:bg-white/[0.18]" />
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{mode === 'sleep' ? 'Sleep sounds' : 'Focus music'}</h2>
              <button onClick={() => setOpen(false)} className="-mr-1 px-1 text-lg leading-none text-gray-500">✕</button>
            </div>
            {controls(true)}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
