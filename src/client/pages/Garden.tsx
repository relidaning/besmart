import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Shield, Sprout, Volume2, VolumeX } from 'lucide-react';
import { api } from '../hooks/api';
import { ATTR_META, setSoundEnabled, soundEnabled } from '../lib/garden';
import AttributeBar, { type AttributeLevel } from '../components/AttributeBar';

interface Achievement {
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

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Heatmap({ data }: { data: { day: string; xp: number }[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, []);

  const byDay = new Map(data.map((d) => [d.day, d.xp]));
  const sorted = data.map((d) => d.xp).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  const thresholds = [q(0.25), q(0.5), q(0.75)];
  const shade = (xp: number) => {
    if (!xp) return 'fill-gray-100 dark:fill-gray-800';
    if (xp <= thresholds[0]) return 'fill-emerald-200 dark:fill-emerald-900';
    if (xp <= thresholds[1]) return 'fill-emerald-400 dark:fill-emerald-700';
    if (xp <= thresholds[2]) return 'fill-emerald-500 dark:fill-emerald-500';
    return 'fill-emerald-700 dark:fill-emerald-300';
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

export default function Garden() {
  const [data, setData] = useState<GardenSummary | null>(null);
  const [sound, setSound] = useState(soundEnabled());

  useEffect(() => {
    api.getGardenSummary().then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const gardenLevel = data.attributes.reduce((s, a) => s + a.level, 0);
  const unlocked = data.achievements.filter((a) => a.progress >= a.goal);
  const locked = data.achievements.filter((a) => a.progress < a.goal)
    .sort((a, b) => b.progress / b.goal - a.progress / a.goal);
  const weakest = [...data.attributes].sort((a, b) => a.xp - b.xp)[0];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5 md:ml-16">
      <motion.div variants={item} className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sprout size={24} className="text-emerald-500" />
            Growth Garden
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Wiser, healthier, more capable, richer. One small step at a time.
          </p>
        </div>
        <button
          onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          title={sound ? 'Mute reward sounds' : 'Enable reward sounds'}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{gardenLevel}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Garden Level</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">+{data.todayXp}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">XP Today</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-orange-500 flex items-center justify-center gap-1">
            <Flame size={20} />{data.streak.current}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
            Day Streak
            {data.streak.shields > 0 && (
              <span className="inline-flex items-center text-sky-500" title="Streak shields: a missed day uses one instead of breaking your streak">
                · <Shield size={11} className="ml-0.5" />{data.streak.shields}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="card space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Attributes</h2>
        {data.attributes.map((a) => <AttributeBar key={a.attribute} a={a} />)}
        <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 pt-3">
          {weakest.xp === 0
            ? <>Your {ATTR_META[weakest.attribute].emoji} <b>{ATTR_META[weakest.attribute].label}</b> hasn't sprouted yet. Create a check-in for it (Check In → Schedules → Growth area) and give it some water.</>
            : <>Give {ATTR_META[weakest.attribute].emoji} <b>{ATTR_META[weakest.attribute].label}</b> some love. It's your least-grown attribute.</>}
        </p>
      </motion.div>

      <motion.div variants={item} className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">A Year of Growth</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {data.totalXp.toLocaleString()} XP all-time · best streak {data.streak.best}d
          </span>
        </div>
        <Heatmap data={data.heatmap} />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Any XP keeps your streak alive. Every 7 days in a row earns a shield (max 2) that covers one missed day.
        </p>
      </motion.div>

      <motion.div variants={item} className="card">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Achievements <span className="text-sm font-normal text-gray-400">{unlocked.length}/{data.achievements.length}</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...unlocked, ...locked].map((a) => {
            const done = a.progress >= a.goal;
            return (
              <div key={a.id}
                className={`flex items-center gap-3 rounded-xl p-3 border ${done
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40'
                  : 'border-gray-100 dark:border-gray-800'}`}>
                <span className={`text-2xl ${done ? '' : 'grayscale opacity-40'}`}>{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{a.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{a.description}</div>
                  {!done && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div className="h-full bg-emerald-400" style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{a.progress}/{a.goal}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      <motion.div variants={item} className="card text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-2">How XP works</h2>
        <p>🧠 Reviews: Hard 12 · OK 8 · Easy 6 (first 20 per day). Plan tasks 15, finished plans 50.</p>
        <p>🛠 Todos: High 15 · Medium 10 · Low 5.</p>
        <p>✅ Check-ins earn their points (min 5) in the growth area you choose for each schedule.</p>
        <p>✨ About 1 in 8 completions is a critical hit worth double XP.</p>
      </motion.div>
    </motion.div>
  );
}
