import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award, Brain, CalendarCheck, CalendarRange, CheckCheck, Crown, Flag, Flame, Hammer, Scale, Sprout,
  Sunrise, TreePine, Zap, type LucideIcon,
} from 'lucide-react';
import { ACHIEVEMENT_SEEDS, SPECIES } from '../../shared/gardenSpecies';
import type { AttributeLevel } from './AttributeBar';
import { Bar, CardHead } from './PageKit';

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
  seedsAvailable?: number;
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

export function Achievements({ data }: { data: GardenSummary }) {
  const [open, setOpen] = useState<string | null>(null);
  const unlocked = data.achievements.filter((a) => a.progress >= a.goal);
  const locked = data.achievements.filter((a) => a.progress < a.goal)
    .sort((a, b) => b.progress / b.goal - a.progress / a.goal);
  return (
    <motion.div variants={item} className="card">
      <CardHead title="Achievements" meta={`${unlocked.length}/${data.achievements.length} unlocked · tap for details`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {[...unlocked, ...locked].map((a) => {
          const done = a.progress >= a.goal;
          const Icon = ACHIEVEMENT_ICON[a.id] ?? Award;
          const seed = ACHIEVEMENT_SEEDS[a.id];
          return (
            <button key={a.id} onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}
              className={`row flex items-start gap-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.06] ${done ? '' : 'opacity-80'} ${open === a.id ? 'sm:col-span-2 !opacity-100' : ''}`}>
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
                {open === a.id ? (
                  <div className="mt-1 space-y-1 text-[12px] leading-snug text-gray-600 dark:text-gray-300">
                    <p>{a.description}.</p>
                    <p className="text-[11px] text-gray-500">
                      {done ? 'Unlocked.' : `Progress: ${a.progress.toLocaleString()} of ${a.goal.toLocaleString()} (${Math.floor((a.progress / a.goal) * 100)}%).`}
                    </p>
                    {seed && (
                      <p className="text-[11px] text-gray-500">
                        Reward: a <b className="text-gray-700 dark:text-gray-300">{SPECIES[seed.species].name}</b> seed to plant in your garden.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500 truncate">
                    {a.description}{seed && <> · <span className="text-gray-600 dark:text-gray-400">{SPECIES[seed.species].name} seed</span></>}
                  </div>
                )}
                {!done && <div className="mt-1.5"><Bar pct={(a.progress / a.goal) * 100} thin /></div>}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
