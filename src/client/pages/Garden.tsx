import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Award, Brain, CalendarCheck, CalendarRange, CheckCheck, Crown, Flag, Flame, Hammer, Scale, Shield, Sprout,
  Sunrise, TreePine, Volume2, VolumeX, Zap, type LucideIcon,
} from 'lucide-react';
import { api } from '../hooks/api';
import { ATTR_META, setSoundEnabled, soundEnabled } from '../lib/garden';
import AttributeBar, { type AttributeLevel } from '../components/AttributeBar';
import { AttrDot, Bar, CardHead, PageHeader, StatTiles } from '../components/PageKit';

// Line icons for the server's achievement ids (the server's emoji are ignored).
const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  'first-sprout': Sprout, 'todo-100': CheckCheck, 'todo-500': Hammer, 'checkin-500': CalendarCheck,
  'checkin-1000': CalendarRange, 'review-100': Brain, 'plan-finisher': Flag, 'early-bird': Sunrise,
  'balanced-week': Scale, 'streak-7': Flame, 'streak-30': TreePine, 'big-day': Zap, 'level-10': Crown,
};

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
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 md:ml-16">
      <PageHeader
        icon={Sprout}
        title="Growth Garden"
        subtitle="Wisdom, health, capability, wealth: one step at a time."
        actions={
          <button
            onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}
            className="btn-ghost !p-2"
            title={sound ? 'Mute reward sounds' : 'Enable reward sounds'}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        }
      />

      <StatTiles stats={[
        { value: gardenLevel, label: 'Garden level' },
        { value: `+${data.todayXp}`, label: 'XP today', tone: data.todayXp > 0 ? undefined : 'muted' },
        {
          value: `${data.streak.current}d`,
          label: <>Streak{data.streak.shields > 0 && (
            <span className="inline-flex items-center gap-0.5" title="Streak shields: a missed day uses one instead of breaking your streak">
              · <Shield size={10} />{data.streak.shields}
            </span>
          )}</>,
        },
      ]} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr] lg:items-start [&>*]:min-w-0">
        <motion.div variants={item} className="card lg:sticky lg:top-20">
          <CardHead title="Attributes" meta={`${data.totalXp.toLocaleString()} XP`} />
          <div className="space-y-4">
            {data.attributes.map((a) => <AttributeBar key={a.attribute} a={a} />)}
          </div>
          <p className="text-[11px] text-gray-500 border-t border-gray-200/70 dark:border-white/[0.08] pt-3 mt-4 flex items-start gap-2">
            <span className="mt-1"><AttrDot attribute={weakest.attribute} /></span>
            <span>
              {weakest.xp === 0
                ? <><b className="text-gray-700 dark:text-gray-300">{ATTR_META[weakest.attribute].label}</b> has no XP yet. Give it a check-in schedule (Check In → Schedules → Growth area).</>
                : <><b className="text-gray-700 dark:text-gray-300">{ATTR_META[weakest.attribute].label}</b> is your least-grown attribute.</>}
            </span>
          </p>
        </motion.div>

        <div className="space-y-4 min-w-0">
          <motion.div variants={item} className="card">
            <CardHead title="A year of growth" meta={`best streak ${data.streak.best}d`} />
            <Heatmap data={data.heatmap} />
            <p className="text-[11px] text-gray-500 mt-2">
              Any XP keeps the streak alive. Every 7 days in a row banks a shield (max 2) that covers one missed day.
            </p>
          </motion.div>

          <motion.div variants={item} className="card">
            <CardHead title="Achievements" meta={`${unlocked.length}/${data.achievements.length} unlocked`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {[...unlocked, ...locked].map((a) => {
                const done = a.progress >= a.goal;
                const Icon = ACHIEVEMENT_ICON[a.id] ?? Award;
                return (
                  <div key={a.id} className={`row flex items-center gap-3 ${done ? '' : 'opacity-70'}`}>
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
                      <div className="text-[11px] text-gray-500 truncate">{a.description}</div>
                      {!done && <div className="mt-1.5"><Bar pct={(a.progress / a.goal) * 100} thin /></div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div variants={item} className="card text-[11px] text-gray-500 space-y-1.5">
            <CardHead title="How XP works" />
            <p className="flex items-center gap-2"><AttrDot attribute="wisdom" />Reviews: Hard 12 · OK 8 · Easy 6 (first 20 a day). Plan tasks 15, finished plans 50.</p>
            <p className="flex items-center gap-2"><AttrDot attribute="capability" />Todos: High 15 · Medium 10 · Low 5.</p>
            <p className="flex items-center gap-2"><AttrDot attribute="health" />Check-ins earn their points (min 5) in the schedule's growth area.</p>
            <p className="flex items-center gap-2"><span className="dot bg-gray-400 dark:bg-gray-600" />About 1 in 8 completions is a critical hit worth double XP.</p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
