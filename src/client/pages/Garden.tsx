import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Sprout, Volume2, VolumeX } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../hooks/api';
import { useTheme } from '../contexts/ThemeContext';
import { ATTR_META, setSoundEnabled, soundEnabled } from '../lib/garden';
import { GROUND, drawPlant, growthFor } from '../lib/gardenArt';
import {
  ACHIEVEMENT_SEEDS, COMMON_LADDER, MILESTONE_EVERY, MILESTONE_SPECIES, SPECIES, TIER_LEVELS,
  type Attribute, type Reward,
} from '../../shared/gardenSpecies';
import { AttrDot, CardHead, PageHeader } from '../components/PageKit';

// The Growth Garden: every completion that earns XP plants something here. What
// grows depends on the attribute's level; achievements and level milestones earn
// rare seeds you plant yourself. Statistics live on Home.

interface Plant {
  id: number;
  species: string;
  attribute: Attribute | null;
  source_type: string;
  label: string | null;
  crit: boolean;
  day: string;
  planted_at: string;
}

interface GardenData {
  plants: Plant[];
  seeds: Reward[];
  ladder: { attribute: Attribute; level: number; current: string; next: { level: number; species: string } | null }[];
  today: string;
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' }, { id: 'all', label: 'All' },
];

const SOURCE_LABEL: Record<string, string> = {
  checkin: 'Check-in', todo: 'Todo', review: 'Review', plan_task: 'Plan task', plan: 'Finished plan', seed: 'Seed from',
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodStart(period: Period, today: string) {
  if (period === 'today') return today;
  if (period === 'week') return addDays(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
  if (period === 'month') return `${today.slice(0, 8)}01`;
  if (period === 'year') return `${today.slice(0, 5)}01-01`;
  return '';
}

function ageDays(day: string, today: string) {
  return Math.max(0, Math.round((+new Date(`${today}T12:00:00`) - +new Date(`${day}T12:00:00`)) / 86_400_000));
}

function fmtDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Stable pseudo-random slot order per period, so plants keep their places.
function shuffledSlots(count: number, key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const slots = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = (h >>> 0) % (i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

function GardenCanvas({ plants, today, layoutKey, highlight, onPick }: {
  plants: Plant[];
  today: string;
  layoutKey: string;
  highlight: number | null;
  onPick: (p: Plant | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<{ plant: Plant; x0: number; x1: number; y0: number; y1: number }[]>([]);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const n = Math.max(4, Math.ceil(Math.sqrt(plants.length * 1.3)));
    const slots = shuffledSlots(n * n, layoutKey);
    return { n, placed: plants.map((p, k) => ({ p, i: slots[k] % n, j: Math.floor(slots[k] / n) })) };
  }, [plants, layoutKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const { n, placed } = layout;
    const W = width;
    const tw = (W * 0.94) / n, th = tw / 2;
    const wall = Math.min(22, Math.max(6, tw * 0.5));
    const unit = Math.min(64, tw * 0.95);
    const heights = placed.map(({ p }) => {
      const sp = SPECIES[p.species] ?? SPECIES.sprout;
      return unit * sp.size * growthFor(sp, ageDays(p.day, today));
    });
    const topPad = Math.max(24, ...heights.map((h, k) => h - (placed[k].i + placed[k].j) * th / 2)) + 6;
    const H = topPad + n * th + wall + 6;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    const g = dark ? GROUND.dark : GROUND.light;
    const ox = W / 2, oy = topPad;
    const L = { x: ox - (n * tw) / 2, y: oy + (n * th) / 2 }, R = { x: ox + (n * tw) / 2, y: oy + (n * th) / 2 };
    const B = { x: ox, y: oy + n * th };

    const order = placed.map((pl, k) => ({ ...pl, h: heights[k], k }))
      .sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);
    const many = placed.length > 180;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // island: two soil walls and the grass top
      ctx.fillStyle = g.left;
      ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y + wall); ctx.lineTo(L.x, L.y + wall); ctx.closePath(); ctx.fill();
      ctx.fillStyle = g.right;
      ctx.beginPath(); ctx.moveTo(R.x, R.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y + wall); ctx.lineTo(R.x, R.y + wall); ctx.closePath(); ctx.fill();
      const grad = ctx.createLinearGradient(0, oy, 0, B.y);
      grad.addColorStop(0, g.topEdge);
      grad.addColorStop(1, g.top);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(R.x, R.y); ctx.lineTo(B.x, B.y); ctx.lineTo(L.x, L.y); ctx.closePath(); ctx.fill();
      if (tw > 9) {
        ctx.strokeStyle = g.line;
        ctx.lineWidth = 1;
        for (let k = 1; k < n; k++) {
          ctx.beginPath(); ctx.moveTo(ox + (k * tw) / 2, oy + (k * th) / 2); ctx.lineTo(L.x + (k * tw) / 2, L.y + (k * th) / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox - (k * tw) / 2, oy + (k * th) / 2); ctx.lineTo(R.x - (k * tw) / 2, R.y + (k * th) / 2); ctx.stroke();
        }
      }

      const hits: typeof hitRef.current = [];
      for (const o of order) {
        const sp = SPECIES[o.p.species] ?? SPECIES.sprout;
        const x = ox + ((o.i - o.j) * tw) / 2;
        const y = oy + ((o.i + o.j + 1) * th) / 2;
        const delay = many ? 0 : (o.k / Math.max(1, placed.length)) * 0.45;
        let s = easeOutBack(Math.min(1, Math.max(0, (t - delay) / 0.55)));
        if (o.p.id === highlight) s *= 1 + 0.12 * Math.sin(Math.min(1, t) * Math.PI);
        const h = o.h * s;
        if (h < 0.5) continue;
        drawPlant(ctx, sp, x, y, h, { seed: o.p.id, crit: o.p.crit, dark });
        hits.push({ plant: o.p, x0: x - Math.max(h * 0.4, tw / 2), x1: x + Math.max(h * 0.4, tw / 2), y0: y - h, y1: y + th / 2 });
      }
      hitRef.current = hits;
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, width, dark, today, highlight]);

  function pick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    // Front-most (last drawn) plant under the finger.
    const hit = [...hitRef.current].reverse().find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
    onPick(hit?.plant ?? null);
  }

  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} onClick={pick} className="block w-full cursor-pointer" />
    </div>
  );
}

// A single species, for lists.
function PlantIcon({ species, size = 36, locked = false }: { species: string; size?: number; locked?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const sp = SPECIES[species];
    drawPlant(ctx, sp, size / 2, size * 0.9, size * 0.82, { seed: 7, dark: resolvedTheme === 'dark' });
  }, [species, size, resolvedTheme]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={locked ? 'opacity-30 grayscale' : ''} />;
}

export default function Garden() {
  const [data, setData] = useState<GardenData | null>(null);
  const [period, setPeriod] = useState<Period>('today');
  const [picked, setPicked] = useState<Plant | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [planting, setPlanting] = useState<number | null>(null);
  const [sound, setSound] = useState(soundEnabled());
  const autoPeriod = useRef(false);

  const load = () => api.getGardenPlants().then((r: { data: GardenData }) => setData(r.data));
  useEffect(() => { load(); }, []);

  // Open on the smallest period that has something growing.
  useEffect(() => {
    if (!data || autoPeriod.current) return;
    autoPeriod.current = true;
    const first = PERIODS.find(({ id }) => data.plants.some((p) => p.day >= periodStart(id, data.today)));
    if (first) setPeriod(first.id);
  }, [data]);

  const shown = useMemo(() => {
    if (!data) return [];
    const from = periodStart(period, data.today);
    return data.plants.filter((p) => p.day >= from && p.day <= data.today);
  }, [data, period]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const speciesShown = new Set(shown.map((p) => p.species)).size;
  const rarePlanted = new Map<string, number>();
  data.plants.forEach((p) => { if (SPECIES[p.species]?.rare) rarePlanted.set(p.species, (rarePlanted.get(p.species) ?? 0) + 1); });
  const pickedSp = picked ? SPECIES[picked.species] : null;

  async function plantSeed(seed: Reward) {
    setPlanting(seed.id);
    try {
      await api.plantGardenSeed(seed.id);
      const r: { data: GardenData } = await api.getGardenPlants();
      setData(r.data);
      setPeriod('today');
      const newest = r.data.plants.reduce((m, p) => (p.id > m.id ? p : m), r.data.plants[0]);
      setHighlight(newest?.id ?? null);
      setPicked(newest ?? null);
      toast.success(`${SPECIES[seed.species].name} planted`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setPlanting(null);
  }

  // How each rare species is earned.
  const rareSources = new Map<string, string[]>();
  for (const [id, s] of Object.entries(ACHIEVEMENT_SEEDS)) rareSources.set(s.species, [...(rareSources.get(s.species) ?? []), id]);
  (Object.keys(MILESTONE_SPECIES) as Attribute[]).forEach((a) => {
    const sp = MILESTONE_SPECIES[a];
    rareSources.set(sp, [...(rareSources.get(sp) ?? []), `every ${MILESTONE_EVERY} ${ATTR_META[a].label} levels`]);
  });
  const rareList = Object.values(SPECIES).filter((s) => s.rare);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 md:ml-16">
      <PageHeader
        icon={Sprout}
        title="Growth Garden"
        subtitle={`${data.plants.length.toLocaleString()} plants · everything you finish grows here`}
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

      <motion.div variants={item} className="card !p-3">
        <div className="seg mb-3">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => { setPeriod(p.id); setPicked(null); }} className={`!px-1 !text-xs ${period === p.id ? 'on' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-baseline justify-between px-1 mb-1">
          <span className="text-[11px] text-gray-500">
            {period === 'today' ? fmtDay(data.today) : period === 'all' ? 'Since the beginning' : `Since ${fmtDay(periodStart(period, data.today))}`}
          </span>
          <span className="text-[11px] text-gray-500">{shown.length} plants · {speciesShown} species</span>
        </div>
        <div className="relative">
          <GardenCanvas
            plants={shown}
            today={data.today}
            layoutKey={`${period}:${periodStart(period, data.today)}`}
            highlight={highlight}
            onPick={setPicked}
          />
          {shown.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-xs text-gray-600 dark:text-gray-300 pointer-events-none">
              Nothing planted {period === 'today' ? 'yet today' : 'in this period'}. Finish a check-in, todo or review to plant something.
            </div>
          )}
        </div>
        <div className="row mt-2 min-h-[52px] flex items-center gap-3">
          {picked && pickedSp ? (
            <>
              <PlantIcon species={picked.species} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {picked.crit ? `Golden ${pickedSp.name}` : pickedSp.name}
                  {picked.attribute && <AttrDot attribute={picked.attribute} />}
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  {fmtDay(picked.day)} · {SOURCE_LABEL[picked.source_type] ?? picked.source_type}{picked.label ? `: ${picked.label}` : ''}
                </div>
              </div>
            </>
          ) : (
            <span className="text-[11px] text-gray-500">
              Tap a plant to see what planted it. Plants grow for three weeks, rare trees for two months; critical hits grow golden.
            </span>
          )}
        </div>
      </motion.div>

      {data.seeds.length > 0 && (
        <motion.div variants={item} className="card !border-brand-400/50">
          <CardHead title="Seeds to plant" meta={`${data.seeds.length} earned · swipe`} />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 snap-x">
            {data.seeds.map((s) => (
              <div key={s.id} className="row snap-start flex w-32 flex-shrink-0 flex-col items-center !px-2 !py-2.5 text-center">
                <PlantIcon species={s.species} size={44} />
                <div className="mt-1 w-full truncate text-[12px] font-bold text-gray-900 dark:text-gray-100">{SPECIES[s.species].name}</div>
                <div className="w-full truncate text-[10px] text-gray-500">{s.reason}</div>
                <button onClick={() => plantSeed(s)} disabled={planting !== null} className="btn-primary mt-2 w-full !px-2 !py-1 text-xs">
                  {planting === s.id ? '…' : 'Plant'}
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div variants={item} className="card">
        <CardHead title="What you can grow" meta="by level" />
        <div className="space-y-3">
          {data.ladder.map((a) => (
            <div key={a.attribute}>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><AttrDot attribute={a.attribute} />{ATTR_META[a.attribute].label}</span>
                <span className="text-[11px] text-gray-500">
                  Lv {a.level}{a.next ? ` · ${SPECIES[a.next.species].name} at Lv ${a.next.level}` : ' · all unlocked'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {COMMON_LADDER[a.attribute].map((sp, tier) => {
                  const unlocked = a.level >= TIER_LEVELS[tier];
                  const current = sp === a.current;
                  return (
                    <div key={sp} title={`${SPECIES[sp].name}${unlocked ? '' : ` · Lv ${TIER_LEVELS[tier]}`}`}
                      className={`rounded-lg border flex flex-col items-center pt-1 pb-1.5 ${current
                        ? 'border-brand-400/60 bg-brand-400/[0.10]'
                        : 'border-gray-200/70 dark:border-white/[0.06]'}`}>
                      <PlantIcon species={sp} size={32} locked={!unlocked} />
                      <span className={`text-[10px] leading-3 text-center ${unlocked ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                        {unlocked ? SPECIES[sp].name : `Lv ${TIER_LEVELS[tier]}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={item} className="card">
        <CardHead title="Rare trees" meta={`${rarePlanted.size}/${rareList.length} grown`} />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {rareList.map((sp) => {
            const count = rarePlanted.get(sp.id) ?? 0;
            const ready = data.seeds.some((s) => s.species === sp.id);
            const how = (rareSources.get(sp.id) ?? []).map((src) =>
              src.startsWith('every') ? src : `achievement: ${src}`).join(' / ');
            return (
              <div key={sp.id} title={how}
                className={`rounded-lg border flex flex-col items-center pt-1.5 pb-2 px-1 ${ready
                  ? 'border-brand-400/60 bg-brand-400/[0.10]'
                  : 'border-gray-200/70 dark:border-white/[0.06]'}`}>
                <PlantIcon species={sp.id} size={40} locked={count === 0 && !ready} />
                <span className="text-[10px] leading-3 text-center text-gray-600 dark:text-gray-300 mt-0.5">{sp.name}</span>
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  {count > 0 ? `×${count}` : ready ? 'seed ready' : <><Lock size={8} />locked</>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Each achievement earns a rare seed (see Achievements on Home), and so does every {MILESTONE_EVERY} levels in an attribute.
        </p>
      </motion.div>
    </motion.div>
  );
}
