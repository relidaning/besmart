import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award, Brain, CalendarCheck, CalendarRange, CheckCheck, Crown, Flag, Flame, Hammer, Scale, Sprout,
  Sunrise, TreePine, Zap, type LucideIcon,
} from 'lucide-react';
import { ACHIEVEMENT_TREES, SPECIES } from '../../shared/gardenSpecies';
import type { AttributeLevel } from './AttributeBar';
import { Bar, CardHead } from './PageKit';
import PlantIcon from './PlantIcon';
import { chime, confetti } from '../lib/garden';

// Growth Garden statistics, shown on Home (the Garden page is only the garden).

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  progress: number;
  goal: number;
}

export interface GardenSummary {
  attributes: AttributeLevel[];
  totalXp: number;
  todayXp: number;
  streak: { current: number; best: number; shields: number };
  heatmap: { day: string; xp: number }[];
  achievements: Achievement[];
}

// Line icons for the server's achievement ids (the server's emoji are ignored).
const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  'first-sprout': Sprout, 'todo-100': CheckCheck, 'todo-500': Hammer, 'checkin-500': CalendarCheck,
  'checkin-1000': CalendarRange, 'review-100': Brain, 'plan-finisher': Flag, 'early-bird': Sunrise,
  'balanced-week': Scale, 'streak-7': Flame, 'streak-30': TreePine, 'big-day': Zap, 'level-10': Crown,
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Heatmap({ data }: { data: { day: string; xp: number }[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, []);

  const byDay = new Map(data.map((d) => [d.day, d.xp]));
  const sorted = data.map((d) => d.xp).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  const thresholds = [q(0.25), q(0.5), q(0.75)];
  const shade = (xp: number) => {
    if (!xp) return 'fill-gray-200/70 dark:fill-white/[0.06]';
    if (xp <= thresholds[0]) return 'fill-brand-200 dark:fill-brand-900';
    if (xp <= thresholds[1]) return 'fill-brand-300 dark:fill-brand-700';
    if (xp <= thresholds[2]) return 'fill-brand-400 dark:fill-brand-500';
    return 'fill-brand-600 dark:fill-brand-300';
  };

  // 53 Monday-based week columns ending with the current week.
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - 52 * 7);
  const cell = 11, gap = 3;
  const cells: { x: number; y: number; day: string; xp: number }[] = [];
  const months: { x: number; label: string }[] = [];
  const todayStr = ymd(today);
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const day = ymd(date);
      if (day > todayStr) continue;
      if (d === 0 && date.getDate() <= 7) {
        months.push({ x: w * (cell + gap), label: date.toLocaleDateString('en-US', { month: 'short' }) });
      }
      cells.push({ x: w * (cell + gap), y: 14 + d * (cell + gap), day, xp: byDay.get(day) ?? 0 });
    }
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <svg width={53 * (cell + gap)} height={14 + 7 * (cell + gap)} className="block">
        {months.map((m) => (
          <text key={m.x} x={m.x} y={9} fontSize={9} className="fill-gray-400 dark:fill-gray-500">{m.label}</text>
        ))}
        {cells.map((c) => (
          <rect key={c.day} x={c.x} y={c.y} width={cell} height={cell} rx={2} className={shade(c.xp)}>
            <title>{c.day}: {c.xp} XP</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

export function YearOfGrowth({ data }: { data: GardenSummary }) {
  return (
    <motion.div variants={item} className="card">
      <CardHead title="A year of growth" meta={`${data.totalXp.toLocaleString()} XP · best streak ${data.streak.best}d`} />
      <Heatmap data={data.heatmap} />
      <p className="text-[11px] text-gray-500 mt-2">
        Any XP keeps the streak alive. Every 7 days in a row banks a shield (max 2) that covers one missed day.
      </p>
    </motion.div>
  );
}

// The achievement pop-up: springs in over a dimmed page. Unlocked ones get a
// glowing medal with rotating rays, confetti and a chime; locked ones fill a
// progress ring and count up to where you are, with the seed they'll earn.
export function AchievementModal({ a, onClose }: { a: Achievement; onClose: () => void }) {
  const done = a.progress >= a.goal;
  const Icon = ACHIEVEMENT_ICON[a.id] ?? Award;
  const tree = ACHIEVEMENT_TREES[a.id];
  const pct = Math.min(1, a.progress / a.goal);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (done) {
      confetti(60, ['#fabf40', '#fde68a', '#a854f7', '#1fa874', '#3987e5']);
      chime([659, 784, 988, 1319]);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      setCount(Math.round(a.progress * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [a.id]);

  const R = 46, C = 2 * Math.PI * R;
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#050609]/70 p-6 backdrop-blur-[3px]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.55, y: 40, rotate: -4, opacity: 0 }}
        animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className={`relative w-full max-w-xs overflow-hidden rounded-[22px] border bg-white p-6 text-center shadow-2xl shadow-black/40 dark:bg-gray-900 ${done
          ? 'border-brand-400/70' : 'border-gray-200/70 dark:border-white/[0.1]'}`}
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-2 text-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>

        <div className="relative mx-auto mb-4 h-32 w-32">
          {done && (
            <motion.div
              className="absolute -inset-8 rounded-full opacity-70"
              style={{ background: 'repeating-conic-gradient(from 0deg, rgba(250,191,64,0.35) 0deg 10deg, transparent 10deg 30deg)',
                maskImage: 'radial-gradient(circle, black 30%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            />
          )}
          <svg viewBox="0 0 112 112" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="56" cy="56" r={R} fill="none" strokeWidth="7" className="stroke-gray-200 dark:stroke-white/[0.08]" />
            <motion.circle
              cx="56" cy="56" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
              stroke={done ? '#fabf40' : '#a854f7'}
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - pct) }}
              transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </svg>
          <motion.div
            className={`absolute inset-[18px] flex items-center justify-center rounded-full ${done
              ? 'bg-gradient-to-br from-brand-300 to-brand-500 text-ink shadow-[0_0_40px_rgba(250,191,64,0.55)]'
              : 'bg-gray-100 text-gray-400 dark:bg-white/[0.05] dark:text-gray-500'}`}
            initial={{ scale: 0.2, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 12, delay: 0.1 }}
          >
            <Icon size={38} strokeWidth={2.2} />
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <div className={`text-[11px] font-bold uppercase tracking-[0.18em] ${done ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500'}`}>
            {done ? 'Achievement unlocked' : 'In progress'}
          </div>
          <h3 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{a.title}</h3>
          <p className="mt-1.5 text-[13px] leading-snug text-gray-600 dark:text-gray-300">{a.description}.</p>
          <div className="mt-3 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {count.toLocaleString()}<span className="text-sm font-normal text-gray-500"> / {a.goal.toLocaleString()}</span>
          </div>
          {!done && <div className="text-[11px] text-gray-500">{(a.goal - a.progress).toLocaleString()} to go · {Math.floor(pct * 100)}%</div>}
        </motion.div>

        {tree && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45 }}
            className="row mt-4 flex items-center gap-3 text-left"
          >
            <PlantIcon species={tree} size={52} locked={!done} />
            <div className="min-w-0">
              <div className="text-[11px] text-gray-500">{done ? 'Unlocked' : 'Unlocks'}</div>
              <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100">{SPECIES[tree].name}</div>
              <div className="text-[11px] text-gray-500">a tree you can plant for a study plan</div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

export function Achievements({ data }: { data: GardenSummary }) {
  const [open, setOpen] = useState<string | null>(null);
  const unlocked = data.achievements.filter((a) => a.progress >= a.goal);
  const locked = data.achievements.filter((a) => a.progress < a.goal)
    .sort((a, b) => b.progress / b.goal - a.progress / a.goal);
  const openA = data.achievements.find((a) => a.id === open) ?? null;
  return (
    <motion.div variants={item} className="card">
      <CardHead title="Achievements" meta={`${unlocked.length}/${data.achievements.length} unlocked · tap one`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {[...unlocked, ...locked].map((a) => {
          const done = a.progress >= a.goal;
          const Icon = ACHIEVEMENT_ICON[a.id] ?? Award;
          const tree = ACHIEVEMENT_TREES[a.id];
          return (
            <motion.button key={a.id} onClick={() => setOpen(a.id)} whileTap={{ scale: 0.96 }}
              className={`row flex items-center gap-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] ${done ? '' : 'opacity-80'}`}>
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${done
                ? 'border-brand-400/60 bg-brand-400/[0.12] text-brand-600 dark:text-brand-400'
                : 'border-gray-200 dark:border-white/[0.08] text-gray-400 dark:text-gray-600'}`}>
                <Icon size={15} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">{a.title}</span>
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{done ? 'done' : `${a.progress}/${a.goal}`}</span>
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  {a.description}{tree && <> · <span className="text-gray-600 dark:text-gray-400">{SPECIES[tree].name}</span></>}
                </div>
                {!done && <div className="mt-1.5"><Bar pct={(a.progress / a.goal) * 100} thin /></div>}
              </div>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>{openA && <AchievementModal key={openA.id} a={openA} onClose={() => setOpen(null)} />}</AnimatePresence>
    </motion.div>
  );
}
