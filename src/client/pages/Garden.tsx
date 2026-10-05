import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Droplets, Lock, Maximize2, Minus, Plus, Sprout, TreeDeciduous, Trophy, Volume2, VolumeX } from 'lucide-react';
import { api } from '../hooks/api';
import { useTheme } from '../contexts/ThemeContext';
import { ATTR_META, setSoundEnabled, soundEnabled } from '../lib/garden';
import { GROUND, autumnColor, drawPlant, growthFor, seasonOf, type Season } from '../lib/gardenArt';
import {
  ACHIEVEMENT_TREES, COMMON_LADDER, FAMILY_LABEL, GROWTH, MILESTONE_EVERY, MILESTONE_SPECIES, SPECIES, STARTER_TREES,
  TIER_LEVELS, TREES, type Attribute,
} from '../../shared/gardenSpecies';
import { AttrDot, Bar, CardHead, PageHeader } from '../components/PageKit';
import PlantIcon from '../components/PlantIcon';

// The Growth Garden. Flowers and shrubs are notes: every note you write plants a
// sapling, finished check-ins and todos water them, reviewing a note grows its
// plant. Trees are study plans: a new plan plants the tree you chose, and it grows
// with each finished task until the plan is done. Everything is kept in a journal.
// Statistics live on Home.

interface Plant {
  id: number;
  species: string;
  attribute: Attribute | null;
  source_type: string;
  source_id: number;
  label: string | null;
  crit: boolean;
  day: string;
  planted_at: string;
  growth: number;
  target: number;
  reviews: number;
  waterings: number;
  tasks_done?: number;
  tasks_total?: number;
  finished?: boolean;
}

interface GardenData {
  plants: Plant[];
  unlockedTrees: string[];
  wisdomLevel: number;
  ladder: { attribute: Attribute; level: number; current: string; next: { level: number; species: string } | null }[];
  today: string;
}

interface GardenEvent {
  id: number;
  plant_id: number | null;
  kind: 'plant' | 'water' | 'review' | 'task' | 'plan';
  amount: number;
  label: string;
  day: string;
  created_at: string;
  species: string | null;
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'year', label: 'Year' }, { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' }, { id: 'today', label: 'Today' },
];

const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: 'Spring' }, { id: 'summer', label: 'Summer' }, { id: 'autumn', label: 'Autumn' }, { id: 'winter', label: 'Winter' },
];

const EVENT_ICON = { plant: Sprout, water: Droplets, review: BookOpen, task: TreeDeciduous, plan: Trophy };
const EVENT_TINT = {
  plant: 'text-[#1fa874]', water: 'text-[#3987e5]', review: 'text-[#a854f7]', task: 'text-[#4d9a5c]', plan: 'text-brand-600 dark:text-brand-400',
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

function fmtDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// One garden: every plant has a fixed tile, filled in planting order row by row
// (snaking), so a period's plants sit together. A period view shows only its plants
// and crops the island to their tiles, so Today is close up and Month is wider.
function gardenLayout(all: Plant[], shown: Plant[], whole: boolean) {
  const N = Math.max(4, Math.ceil(Math.sqrt(all.length * 1.3)));
  const tile = new Map<number, [number, number]>();
  [...all]
    .sort((a, b) => a.planted_at.localeCompare(b.planted_at) || a.id - b.id)
    .forEach((p, k) => {
      const j = Math.floor(k / N), c = k % N;
      tile.set(p.id, [j % 2 ? N - 1 - c : c, j]);
    });
  const cells = shown.flatMap((p) => { const t = tile.get(p.id); return t ? [{ p, i: t[0], j: t[1] }] : []; });
  if (cells.length === 0) return { n: 4, placed: [] };
  if (whole) return { n: N, placed: cells };
  const is = cells.map((c) => c.i), js = cells.map((c) => c.j);
  const i0 = Math.min(...is), j0 = Math.min(...js);
  const wi = Math.max(...is) - i0 + 1, wj = Math.max(...js) - j0 + 1;
  const n = Math.max(3, wi, wj);
  const oi = Math.floor((n - wi) / 2), oj = Math.floor((n - wj) / 2);
  return { n, placed: cells.map((c) => ({ p: c.p, i: c.i - i0 + oi, j: c.j - j0 + oj })) };
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const MAX_ZOOM = 6;
const PARTICLE_FRAME_MS = 30; // just under two 60 Hz frames, so every second frame paints

interface Particle { x: number; y: number; vy: number; r: number; rot: number; spin: number; color: string; phase: number }

// ── The island ──────────────────────────────────────────────────────────────
// Painted to an offscreen canvas (repainted when the view changes); frames blit
// it and animate seasonal particles on top. Pinch or ctrl/⌘-scroll to zoom,
// drag to pan when zoomed, double-tap to zoom in / reset.

function GardenCanvas({ plants, all, whole, season, layoutKey, highlight, onPick }: {
  plants: Plant[];
  all: Plant[];
  whole: boolean; // the All view: the whole island, not cropped to the plants shown
  season: Season;
  layoutKey: string;
  highlight: number | null;
  onPick: (p: Plant | null) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef<{ plant: Plant; x0: number; x1: number; y0: number; y1: number }[]>([]);
  const viewRef = useRef({ k: 1, x: 0, y: 0 });
  const sizeRef = useRef({ W: 0, H: 0 });
  const dirtyRef = useRef(true);
  const kickRef = useRef<() => void>(() => {});
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => gardenLayout(all, plants, whole), [all, plants, whole, layoutKey]);

  // A new layout starts un-zoomed.
  useEffect(() => { viewRef.current = { k: 1, x: 0, y: 0 }; setZoom(1); }, [layout]);

  const setView = useCallback((k: number, x: number, y: number) => {
    const { W, H } = sizeRef.current;
    k = Math.min(MAX_ZOOM, Math.max(1, k));
    x = Math.min(0, Math.max(W - W * k, x));
    y = Math.min(0, Math.max(H - H * k, y));
    viewRef.current = { k, x, y };
    dirtyRef.current = true;
    setZoom(k);
    kickRef.current();
  }, []);

  // Zoom by `factor` keeping the screen point (sx, sy) fixed.
  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    const v = viewRef.current;
    const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
    const wx = (sx - v.x) / v.k, wy = (sy - v.y) / v.k;
    setView(k, sx - wx * k, sy - wy * k);
  }, [setView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const { n, placed } = layout;
    const W = width;
    const tw = (W * 0.86) / n, th = tw / 2;
    const wall = Math.min(22, Math.max(6, tw * 0.5));
    const unit = Math.min(64, tw * 0.95);
    const grown = placed.map(({ p }) => {
      const sp = SPECIES[p.species] ?? SPECIES.sprout;
      const g = growthFor(p.growth, p.target);
      // Cap height so a big tree at the island's edge stays inside the canvas.
      return { sp, young: g.young, pct: g.pct, fruit: !!p.finished, h: Math.min(unit * sp.size * g.scale, W * 0.36) };
    });
    const topPad = Math.max(40, ...grown.map((g, k) => g.h - (placed[k].i + placed[k].j) * th / 2)) + 6;
    const H = topPad + n * th + wall + 6;
    sizeRef.current = { W, H };
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d')!;
    const scene = document.createElement('canvas');
    scene.width = canvas.width;
    scene.height = canvas.height;
    const sctx = scene.getContext('2d')!;
    const g = GROUND[season][dark ? 'dark' : 'light'];
    const ox = W / 2, oy = topPad;
    const L = { x: ox - (n * tw) / 2, y: oy + (n * th) / 2 }, R = { x: ox + (n * tw) / 2, y: oy + (n * th) / 2 };
    const B = { x: ox, y: oy + n * th };
    const order = placed.map((pl, k) => ({ ...pl, ...grown[k], k }))
      .sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);
    const many = placed.length > 180;
    const pos = (o: { i: number; j: number }) => ({ x: ox + ((o.i - o.j) * tw) / 2, y: oy + ((o.i + o.j + 1) * th) / 2 });
    const worldTransform = (c: CanvasRenderingContext2D) => {
      const v = viewRef.current;
      c.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.x, dpr * v.y);
    };

    const paintScene = (t: number) => {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, scene.width, scene.height);
      worldTransform(sctx);
      sctx.fillStyle = g.left;
      sctx.beginPath(); sctx.moveTo(L.x, L.y); sctx.lineTo(B.x, B.y); sctx.lineTo(B.x, B.y + wall); sctx.lineTo(L.x, L.y + wall); sctx.closePath(); sctx.fill();
      sctx.fillStyle = g.right;
      sctx.beginPath(); sctx.moveTo(R.x, R.y); sctx.lineTo(B.x, B.y); sctx.lineTo(B.x, B.y + wall); sctx.lineTo(R.x, R.y + wall); sctx.closePath(); sctx.fill();
      const grad = sctx.createLinearGradient(0, oy, 0, B.y);
      grad.addColorStop(0, g.topEdge);
      grad.addColorStop(1, g.top);
      sctx.fillStyle = grad;
      sctx.beginPath(); sctx.moveTo(ox, oy); sctx.lineTo(R.x, R.y); sctx.lineTo(B.x, B.y); sctx.lineTo(L.x, L.y); sctx.closePath(); sctx.fill();
      if (tw * viewRef.current.k > 9) {
        sctx.strokeStyle = g.line;
        sctx.lineWidth = 1 / viewRef.current.k;
        for (let k = 1; k < n; k++) {
          sctx.beginPath(); sctx.moveTo(ox + (k * tw) / 2, oy + (k * th) / 2); sctx.lineTo(L.x + (k * tw) / 2, L.y + (k * th) / 2); sctx.stroke();
          sctx.beginPath(); sctx.moveTo(ox - (k * tw) / 2, oy + (k * th) / 2); sctx.lineTo(R.x - (k * tw) / 2, R.y + (k * th) / 2); sctx.stroke();
        }
      }
      const hits: typeof hitRef.current = [];
      for (const o of order) {
        const { x, y } = pos(o);
        const delay = many ? 0 : (o.k / Math.max(1, placed.length)) * 0.45;
        let sc = easeOutBack(Math.min(1, Math.max(0, (t - delay) / 0.55)));
        if (o.p.id === highlight) sc *= 1 + 0.12 * Math.sin(Math.min(1, t) * Math.PI);
        const h = o.h * sc;
        if (h < 0.5) continue;
        drawPlant(sctx, o.sp, x, y, h, { seed: o.p.id, crit: o.p.crit, dark, season, young: o.young, pct: o.pct, fruit: o.fruit });
        hits.push({ plant: o.p, x0: x - Math.max(h * 0.4, tw / 2), x1: x + Math.max(h * 0.4, tw / 2), y0: y - h, y1: y + th / 2 });
      }
      hitRef.current = hits;
    };

    // Seasonal particles (world coordinates): petals, leaves from deciduous trees, snow.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const particles: Particle[] = [];
    const sources = order.filter((o) => !o.young && !o.sp.evergreen && o.h > unit * 0.9);
    const spawn = (initial: boolean): Particle | null => {
      if (season === 'winter') {
        return { x: Math.random() * W, y: initial ? Math.random() * H : -4, vy: 9 + Math.random() * 10, r: 1 + Math.random() * 1.6, rot: 0, spin: 0, color: 'rgba(241,245,249,0.9)', phase: Math.random() * 6 };
      }
      if (season === 'summer' || (season === 'autumn' && !sources.length)) return null;
      const src = season === 'autumn' ? sources[Math.floor(Math.random() * sources.length)] : null;
      const at = src ? pos(src) : { x: Math.random() * W, y: topPad * 0.5 };
      const color = src ? autumnColor(src.sp, src.p.id) : Math.random() < 0.5 ? '#f9a8d4' : '#fdf2f8';
      const top = src ? at.y - src.h * (0.5 + Math.random() * 0.3) : at.y;
      return { x: at.x + (Math.random() - 0.5) * (src ? src.h * 0.5 : W), y: initial ? top + Math.random() * 30 : top, vy: 6 + Math.random() * 6,
        r: season === 'autumn' ? Math.max(1.6, unit * 0.06) : Math.max(1.2, unit * 0.045), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 2, color, phase: Math.random() * 6 };
    };
    const target = reduced ? 0 : season === 'winter' ? 70 : season === 'autumn' ? Math.min(28, sources.length * 3) : season === 'spring' ? 14 : 0;
    for (let k = 0; k < target; k++) { const p = spawn(true); if (p) particles.push(p); }
    const floorAt = (x: number) => {
      const dx = Math.abs(x - ox) / ((n * tw) / 2);
      return dx > 1 ? H : oy + (n * th) / 2 + (n * th) / 2 * (1 - dx) - 2;
    };

    const start = performance.now();
    let last = start;
    let raf = 0;
    let running = false;
    let visible = true;
    dirtyRef.current = true;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      // Particles drift well under a pixel per frame, so once nothing else moves, repaint the
      // canvas at 30 fps instead of every frame.
      if (t >= 1 && !dirtyRef.current && now - last < PARTICLE_FRAME_MS) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t < 1 || dirtyRef.current) { paintScene(t); dirtyRef.current = t < 1; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(scene, 0, 0);
      if (particles.length) {
        worldTransform(ctx);
        for (let k = particles.length - 1; k >= 0; k--) {
          const p = particles[k];
          p.phase += dt * 1.6;
          p.x += Math.sin(p.phase) * (season === 'winter' ? 6 : 14) * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          if (season === 'winter') ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          else ctx.ellipse(p.x, p.y, p.r, p.r * 0.45, p.rot, 0, Math.PI * 2);
          ctx.fill();
          if (p.y > floorAt(p.x) || p.y > H) {
            particles.splice(k, 1);
            const np = spawn(false);
            if (np) particles.push(np);
          }
        }
      }
      running = visible && (t < 1 || particles.length > 0 || dirtyRef.current);
      if (running) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!running && visible) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
    kickRef.current = kick;
    running = true;
    raf = requestAnimationFrame(frame);
    // Scrolled out of view (the journal and species lists are below), the loop stops; it
    // would otherwise keep repainting the whole canvas for particles nobody sees.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
    io.observe(canvas);
    return () => { cancelAnimationFrame(raf); io.disconnect(); kickRef.current = () => {}; };
  }, [layout, width, dark, season, highlight]);

  // Gestures: pinch / drag / double-tap on touch and mouse, ctrl/⌘ + wheel to zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; k: number; wx: number; wy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls the page; trackpad pinch sends ctrlKey
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * 0.01), p.x, p.y);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const v = viewRef.current;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: v.k, wx: (mx - v.x) / v.k, wy: (my - v.y) / v.k };
      drag.current = null;
    } else {
      const p = local(e);
      drag.current = { x: p.x, y: p.y, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const gs = gesture.current;
      const k = Math.min(MAX_ZOOM, Math.max(1, gs.k * (Math.hypot(a.x - b.x, a.y - b.y) / gs.dist)));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      setView(k, mx - gs.wx * k, my - gs.wy * k);
    } else if (drag.current) {
      const p = local(e);
      const dx = p.x - drag.current.x, dy = p.y - drag.current.y;
      if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
      if (drag.current.moved && viewRef.current.k > 1) setView(viewRef.current.k, drag.current.vx + dx, drag.current.vy + dy);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || pointers.current.size > 0) return;
    const p = local(e);
    const now = Date.now();
    if (now - lastTap.current < 300) { // double tap: zoom in there, or back out
      lastTap.current = 0;
      if (viewRef.current.k > 1.05) setView(1, 0, 0); else zoomAt(2.5, p.x, p.y);
      return;
    }
    lastTap.current = now;
    const v = viewRef.current;
    const wx = (p.x - v.x) / v.k, wy = (p.y - v.y) / v.k;
    const hit = [...hitRef.current].reverse().find((r) => wx >= r.x0 && wx <= r.x1 && wy >= r.y0 && wy <= r.y1);
    onPick(hit?.plant ?? null);
  }

  const center = () => ({ x: sizeRef.current.W / 2, y: sizeRef.current.H / 2 });

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
        className="block w-full cursor-pointer select-none"
      />
      <div className="absolute right-1 top-1 flex flex-col gap-1">
        {[
          { icon: Plus, label: 'Zoom in', on: () => { const c = center(); zoomAt(1.6, c.x, c.y); } },
          { icon: Minus, label: 'Zoom out', on: () => { const c = center(); zoomAt(1 / 1.6, c.x, c.y); }, disabled: zoom <= 1 },
          { icon: Maximize2, label: 'Reset zoom', on: () => setView(1, 0, 0), disabled: zoom <= 1 },
        ].map(({ icon: Icon, label, on, disabled }) => (
          <button key={label} onClick={on} disabled={disabled} title={label} aria-label={label}
            className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200/70 bg-white/80 text-gray-600 backdrop-blur disabled:opacity-30 dark:border-white/[0.08] dark:bg-gray-900/80 dark:text-gray-300">
            <Icon size={13} />
          </button>
        ))}
      </div>
      {zoom > 1 && (
        <span className="absolute left-1 top-1 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-900/80 dark:text-gray-300">
          {zoom.toFixed(1)}×
        </span>
      )}
    </div>
  );
}

function JournalRow({ e }: { e: GardenEvent }) {
  const Icon = EVENT_ICON[e.kind];
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon size={14} className={`mt-0.5 flex-shrink-0 ${EVENT_TINT[e.kind]}`} />
      <div className="min-w-0 flex-1 text-[12px] leading-snug text-gray-700 dark:text-gray-300">
        {e.kind !== 'plant' && e.species && <b className="font-bold">{SPECIES[e.species]?.name}: </b>}
        {e.label}
      </div>
      <span className="flex-shrink-0 text-[11px] text-gray-500 tabular-nums">
        {e.amount > 0 && <b className="text-gray-700 dark:text-gray-300">+{e.amount} </b>}{fmtTime(e.created_at)}
      </span>
    </div>
  );
}

export default function Garden() {
  const [data, setData] = useState<GardenData | null>(null);
  const [period, setPeriod] = useState<Period>('all');
  const [picked, setPicked] = useState<Plant | null>(null);
  const [pickedLog, setPickedLog] = useState<GardenEvent[]>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [sound, setSound] = useState(soundEnabled());
  const [journal, setJournal] = useState<GardenEvent[]>([]);
  const [journalDone, setJournalDone] = useState(false);
  const [achievementTitles, setAchievementTitles] = useState<Record<string, string>>({});
  const nowSeason = seasonOf(new Date());
  const [season, setSeason] = useState<Season>(nowSeason);

  const loadJournal = (before?: number) =>
    api.getGardenEvents({ before, limit: 30 }).then((r: { data: GardenEvent[] }) => {
      setJournal((prev) => (before ? [...prev, ...r.data] : r.data));
      setJournalDone(r.data.length < 30);
    });

  useEffect(() => {
    api.getGardenPlants().then((r: { data: GardenData }) => setData(r.data));
    api.getGardenSummary().then((r: { data: { achievements: { id: string; title: string }[] } }) =>
      setAchievementTitles(Object.fromEntries(r.data.achievements.map((a) => [a.id, a.title])))).catch(() => {});
    loadJournal();
  }, []);

  useEffect(() => {
    if (!picked) { setPickedLog([]); return; }
    api.getGardenEvents({ plant: picked.id, limit: 6 }).then((r: { data: GardenEvent[] }) => setPickedLog(r.data));
  }, [picked?.id]);

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
  const pickedSp = picked ? SPECIES[picked.species] : null;
  const pickedGrowth = picked ? growthFor(picked.growth, picked.target) : null;

  // How each locked tree is unlocked.
  const treeUnlock = new Map<string, string[]>();
  for (const [id, sp] of Object.entries(ACHIEVEMENT_TREES)) treeUnlock.set(sp, [...(treeUnlock.get(sp) ?? []), `"${achievementTitles[id] ?? id}"`]);
  (Object.keys(MILESTONE_SPECIES) as Attribute[]).forEach((a) => {
    const sp = MILESTONE_SPECIES[a];
    treeUnlock.set(sp, [...(treeUnlock.get(sp) ?? []), `${ATTR_META[a].label} Lv ${MILESTONE_EVERY}`]);
  });
  const treesPlanted = new Map<string, number>();
  data.plants.forEach((p) => { if (p.source_type === 'plan') treesPlanted.set(p.species, (treesPlanted.get(p.species) ?? 0) + 1); });

  // Journal grouped by day.
  const journalDays: [string, GardenEvent[]][] = [];
  for (const e of journal) {
    const last = journalDays[journalDays.length - 1];
    if (last && last[0] === e.day) last[1].push(e); else journalDays.push([e.day, [e]]);
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 md:ml-16">
      <PageHeader
        icon={Sprout}
        title="Growth Garden"
        subtitle={data.plants.length ? `${data.plants.length} plants · notes grow flowers, study plans grow trees` : 'Notes grow flowers here, study plans grow trees'}
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
        <div className="seg mb-2">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => { setPeriod(p.id); setPicked(null); }} className={`!px-1 !text-xs ${period === p.id ? 'on' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 px-1 mb-2 text-[11px] text-gray-500">
          {SEASONS.map((x) => (
            <button key={x.id} onClick={() => setSeason(x.id)}
              className={`rounded-md px-2 py-0.5 transition-colors ${season === x.id
                ? 'bg-gray-100 text-gray-900 font-bold dark:bg-white/[0.08] dark:text-gray-100'
                : 'hover:text-gray-800 dark:hover:text-gray-200'}`}>
              {x.label}{x.id === nowSeason ? ' ·now' : ''}
            </button>
          ))}
        </div>
        <div className="flex items-baseline justify-between px-1 mb-1">
          <span className="text-[11px] text-gray-500">
            {period === 'all' ? 'Your whole garden' : period === 'today' ? `Planted ${fmtDay(data.today)}` : `Planted since ${fmtDay(periodStart(period, data.today))}`}
          </span>
          <span className="text-[11px] text-gray-500">{shown.length} plants · {speciesShown} species</span>
        </div>
        <div className="relative">
          <GardenCanvas
            plants={shown}
            all={data.plants}
            whole={period === 'all'}
            season={season}
            layoutKey={`${period}:${periodStart(period, data.today)}`}
            highlight={highlight}
            onPick={setPicked}
          />
          {shown.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-xs text-gray-600 dark:text-gray-300 pointer-events-none">
              {data.plants.length === 0
                ? 'Nothing growing yet. Write a note in your vault or create a study plan to plant your first sapling.'
                : 'Nothing was planted in this period.'}
            </div>
          )}
        </div>

        <div className="row mt-2 min-h-[52px]">
          {picked && pickedSp && pickedGrowth ? (
            <div>
              <div className="flex items-center gap-3">
                <PlantIcon species={picked.species} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {pickedSp.name}{pickedGrowth.young ? ' sapling' : pickedGrowth.pct >= 1 ? ' · fully grown' : ''}
                    {picked.attribute && <AttrDot attribute={picked.attribute} />}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">
                    {picked.source_type === 'plan' ? `Study plan: ${picked.label}` : `${FAMILY_LABEL[picked.attribute ?? 'health'].replace(/s$/, '')}: ${picked.label}`}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                <div className="flex-1"><Bar pct={pickedGrowth.pct * 100} className="bg-[#1fa874]" thin /></div>
                <span className="tabular-nums">
                  {picked.source_type === 'plan' ? `${picked.tasks_done}/${picked.tasks_total} tasks` : `${Math.round(picked.growth)}/${picked.target}`}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                Planted {fmtDay(picked.day)} · {picked.source_type === 'plan'
                  ? (picked.finished ? 'plan finished, bearing fruit' : 'grows with every finished task')
                  : `reviewed ${picked.reviews}× · watered ${picked.waterings}×`}
              </div>
              {pickedLog.length > 0 && (
                <div className="mt-2 border-t border-gray-200/70 pt-1 dark:border-white/[0.06]">
                  {pickedLog.map((e) => <JournalRow key={e.id} e={{ ...e, species: null }} />)}
                </div>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-gray-500">
              Tap a plant to see its note and history. Pinch (or ctrl/⌘-scroll) to zoom, double-tap to zoom in or out.
            </span>
          )}
        </div>
      </motion.div>

      <motion.div variants={item} className="card">
        <CardHead title="How the garden grows" />
        <div className="grid gap-2 text-[12px] text-gray-600 dark:text-gray-300 sm:grid-cols-2">
          <div className="row flex gap-2.5"><Sprout size={16} className="text-[#1fa874] flex-shrink-0 mt-0.5" /><span><b>Write a note</b> in your vault: it plants a flower sapling in its folder's color. Older notes plant theirs at their first review.</span></div>
          <div className="row flex gap-2.5"><BookOpen size={16} className="text-[#a854f7] flex-shrink-0 mt-0.5" /><span><b>Review a note</b>: its plant grows a lot (+{GROWTH.review.again} to +{GROWTH.review.easy}). Full size at {GROWTH.full}.</span></div>
          <div className="row flex gap-2.5"><Droplets size={16} className="text-[#3987e5] flex-shrink-0 mt-0.5" /><span><b>Finish a check-in or todo</b>: it waters the {GROWTH.waterPlants} thirstiest flowers (+{GROWTH.water}, once a day each, up to +{GROWTH.waterMax} in all). Only reviews bring a flower to full size.</span></div>
          <div className="row flex gap-2.5"><TreeDeciduous size={16} className="text-[#4d9a5c] flex-shrink-0 mt-0.5" /><span><b>Create a study plan</b>: it plants the tree you pick. Every finished task grows it; finishing the plan brings it to full size, with fruit.</span></div>
        </div>
      </motion.div>

      <motion.div variants={item} className="card">
        <CardHead title="Garden journal" meta={journal.length ? 'newest first' : undefined} />
        {journal.length === 0 ? (
          <p className="text-[12px] text-gray-500">Plantings, waterings and reviews will be logged here.</p>
        ) : (
          <div className="space-y-3">
            {journalDays.map(([day, events]) => (
              <div key={day}>
                <div className="text-[11px] font-bold text-gray-500 mb-0.5">{day === data.today ? 'Today' : fmtDay(day)}</div>
                <div className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {events.map((e) => <JournalRow key={e.id} e={e} />)}
                </div>
              </div>
            ))}
            {!journalDone && (
              <button onClick={() => loadJournal(journal[journal.length - 1]?.id)} className="btn-secondary w-full text-xs">Show older</button>
            )}
          </div>
        )}
      </motion.div>

      <motion.div variants={item} className="card">
        <CardHead title="Flowers from notes" meta={`Wisdom Lv ${data.wisdomLevel}`} />
        <div className="space-y-3">
          {data.ladder.map((a) => (
            <div key={a.attribute}>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><AttrDot attribute={a.attribute} />{FAMILY_LABEL[a.attribute]}</span>
                <span className="text-[11px] text-gray-500">{a.next ? `${SPECIES[a.next.species].name} at Lv ${a.next.level}` : 'all unlocked'}</span>
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
        <p className="text-[11px] text-gray-500 mt-3">New notes get the best flower your Wisdom level has unlocked, in their folder's color. Trees are for study plans.</p>
      </motion.div>

      <motion.div variants={item} className="card">
        <CardHead title="Trees for study plans" meta={`${data.unlockedTrees.length}/${TREES.length} unlocked`} />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {TREES.map((id) => {
            const sp = SPECIES[id];
            const unlocked = data.unlockedTrees.includes(id);
            const count = treesPlanted.get(id) ?? 0;
            const how = STARTER_TREES.includes(id) ? 'available from the start' : `unlocked by ${(treeUnlock.get(id) ?? []).join(' or ')}`;
            return (
              <div key={id} title={how}
                className={`rounded-lg border flex flex-col items-center pt-1.5 pb-2 px-1 ${count
                  ? 'border-brand-400/60 bg-brand-400/[0.10]'
                  : 'border-gray-200/70 dark:border-white/[0.06]'}`}>
                <PlantIcon species={id} size={40} locked={!unlocked} />
                <span className="text-[10px] leading-3 text-center text-gray-600 dark:text-gray-300 mt-0.5">{sp.name}</span>
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  {count > 0 ? `growing ×${count}` : unlocked ? 'unlocked' : <><Lock size={8} />locked</>}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Pick a tree when you create a study plan. Six are available from the start; achievements (see Home) and reaching level {MILESTONE_EVERY} in an attribute unlock the rest.
        </p>
      </motion.div>
    </motion.div>
  );
}
