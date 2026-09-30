import type { Species } from '../../shared/gardenSpecies';

// Procedural plant drawings for the garden canvas. Every plant is drawn from its
// ground point (x, y) upward to height h, as it looks in the given season:
// spring buds, summer bloom, autumn color and dry flowers, winter bare branches
// (evergreens keep their needles under a little snow). Young plants are saplings.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// Meteorological seasons, northern hemisphere (the app runs on Shanghai time).
export function seasonOf(date: Date): Season {
  const m = date.getMonth();
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}

const TRUNK = '#6b4f3a';
const DRY_STEM = '#a3804f';
const DRY_HEAD = '#8b6b3e';
const FRESH = '#9ad97f';
const AUTUMN_DEFAULTS = ['#d97706', '#ca8a04', '#c2410c', '#eab308'];
const WOODY = new Set(['bush', 'tree', 'pine', 'cypress', 'blossom', 'willow', 'bamboo']);

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.3, r), 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.3, rx), Math.max(0.3, ry), rot, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, w);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function stem(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, color: string, bend = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, w);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + bend, y - h / 2, x + bend * 0.6, y - h);
  ctx.stroke();
}

function trunk(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, color = TRUNK) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 4, y - h);
  ctx.lineTo(x + w / 4, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

// Deterministic jitter so a plant looks the same on every draw.
export function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mix(a: string, b: string, t = 0.5) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Foliage color a deciduous plant turns in autumn. */
export function autumnColor(sp: Species, seed: number) {
  return sp.autumn ?? AUTUMN_DEFAULTS[seed % AUTUMN_DEFAULTS.length];
}

// Bare winter tree: trunk and two levels of branches, snow on the tips.
function bareTree(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, r: () => number, snow: boolean) {
  trunk(ctx, x, y, h * 0.55, h * 0.1);
  const branch = (bx: number, by: number, len: number, ang: number, w: number, depth: number) => {
    const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
    line(ctx, bx, by, ex, ey, w, TRUNK);
    if (depth > 0) {
      branch(ex, ey, len * 0.6, ang - 0.45 - r() * 0.2, w * 0.6, depth - 1);
      branch(ex, ey, len * 0.6, ang + 0.45 + r() * 0.2, w * 0.6, depth - 1);
    } else if (snow) {
      circle(ctx, ex, ey - w, w * 1.1, '#f1f5f9');
    }
  };
  const top = y - h * 0.5;
  for (const a of [-2.3, -1.9, -1.57, -1.25, -0.85]) branch(x, top + h * 0.05, h * 0.26, a + (r() - 0.5) * 0.2, h * 0.035, 1);
}

// A young plant: thin stem and a few leaves (a twig for deciduous trees in winter).
function sapling(ctx: CanvasRenderingContext2D, sp: Species, x: number, y: number, h: number, season: Season, r: () => number) {
  const woody = WOODY.has(sp.kind);
  if (sp.kind === 'pine' || sp.kind === 'cypress') {
    line(ctx, x, y, x, y - h * 0.3, h * 0.08, TRUNK);
    ctx.fillStyle = sp.leaf;
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x - h * 0.22, y - h * 0.25); ctx.lineTo(x + h * 0.22, y - h * 0.25); ctx.closePath(); ctx.fill();
    if (season === 'winter') circle(ctx, x, y - h * 0.92, h * 0.07, '#f1f5f9');
    return;
  }
  if (season === 'winter' && !sp.evergreen) {
    line(ctx, x, y, x, y - h * 0.8, h * 0.06, woody ? TRUNK : DRY_STEM);
    line(ctx, x, y - h * 0.5, x + h * 0.18, y - h * 0.68, h * 0.04, woody ? TRUNK : DRY_STEM);
    return;
  }
  const leaf = season === 'autumn' && !sp.evergreen ? autumnColor(sp, 1) : season === 'spring' ? FRESH : sp.leaf;
  stem(ctx, x, y, h, h * 0.06, woody ? TRUNK : mix(sp.leaf, '#2f5f3a'), (r() - 0.5) * h * 0.2);
  ellipse(ctx, x - h * 0.16, y - h * 0.62, h * 0.17, h * 0.07, -0.6, leaf);
  ellipse(ctx, x + h * 0.16, y - h * 0.78, h * 0.17, h * 0.07, 0.6, leaf);
  ellipse(ctx, x, y - h * 0.98, h * 0.12, h * 0.06, 0, leaf);
}

export function drawPlant(
  ctx: CanvasRenderingContext2D, sp: Species, x: number, y: number, h: number,
  opts: { seed: number; crit?: boolean; dark: boolean; season: Season; young?: boolean },
) {
  const r = rng(opts.seed);
  const { season } = opts;
  const w = h * 0.5;
  const evergreen = !!sp.evergreen;
  const winterBare = season === 'winter' && !evergreen;
  const snow = season === 'winter';

  // soft ground shadow
  ellipse(ctx, x, y, w * (sp.rare ? 0.55 : 0.4) * (opts.young ? 0.5 : 1), w * 0.14, 0, opts.dark ? 'rgba(0,0,0,0.35)' : 'rgba(40,60,30,0.18)');

  if (opts.crit && !winterBare) {
    const g = ctx.createRadialGradient(x, y - h * 0.55, 0, x, y - h * 0.55, h * 0.7);
    g.addColorStop(0, 'rgba(250,191,64,0.45)');
    g.addColorStop(1, 'rgba(250,191,64,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - h * 0.55, h * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  if (opts.young) {
    sapling(ctx, sp, x, y, h, season, r);
    return;
  }

  // Seasonal palette.
  const leaf = evergreen ? sp.leaf
    : season === 'spring' ? mix(sp.leaf, FRESH, 0.55)
      : season === 'autumn' ? autumnColor(sp, opts.seed)
        : sp.leaf;
  const bud = mix(sp.color, '#ffffff', 0.35);
  const herb = !WOODY.has(sp.kind); // flowers, ferns, sprouts

  // Winter: herbs die back to a dry stub; deciduous woody plants stand bare.
  if (winterBare) {
    if (herb) {
      line(ctx, x, y, x + h * 0.04, y - h * 0.28, h * 0.05, DRY_STEM);
      line(ctx, x, y - h * 0.12, x - h * 0.08, y - h * 0.24, h * 0.035, DRY_STEM);
      if (snow) ellipse(ctx, x, y - h * 0.02, h * 0.14, h * 0.04, 0, 'rgba(241,245,249,0.9)');
    } else if (sp.kind === 'bush') {
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.32;
        line(ctx, x, y, x + Math.cos(a) * h * 0.55, y + Math.sin(a) * h * 0.65, h * 0.035, TRUNK);
      }
    } else {
      bareTree(ctx, x, y, h, r, snow);
    }
    return;
  }

  // Herb drawing states: spring bud, summer bloom, autumn dry.
  const state = season === 'spring' ? 'bud' : season === 'summer' ? 'full' : 'dry';
  const herbStem = state === 'dry' ? DRY_STEM : sp.leaf;
  const herbLeaf = state === 'dry' ? mix(DRY_STEM, '#6b4f2a') : leaf;
  const droop = state === 'dry' ? h * 0.12 : 0;

  switch (sp.kind) {
    case 'sprout': {
      stem(ctx, x, y, h * 0.7, h * 0.08, herbStem, droop);
      ellipse(ctx, x - h * 0.2, y - h * 0.72, h * 0.22, h * 0.1, -0.5, state === 'dry' ? herbLeaf : sp.color);
      ellipse(ctx, x + h * 0.2, y - h * 0.8, h * 0.22, h * 0.1, 0.5, state === 'dry' ? herbLeaf : sp.color);
      break;
    }
    case 'spike': {
      for (const dx of [-0.18, 0, 0.18]) {
        const sh = h * (0.8 + r() * 0.2) * (state === 'bud' ? 0.8 : 1);
        const sx = x + dx * h;
        stem(ctx, sx, y, sh, h * 0.04, herbStem, dx * h * 0.5 + droop);
        const n = state === 'bud' ? 3 : 6;
        const c = state === 'bud' ? mix(sp.color, sp.leaf, 0.5) : state === 'dry' ? DRY_HEAD : sp.color;
        for (let k = 0; k < n; k++) circle(ctx, sx + droop * 0.6 + (r() - 0.5) * h * 0.06, y - sh + k * h * 0.07, h * (state === 'bud' ? 0.035 : 0.05), c);
      }
      break;
    }
    case 'bloom': {
      stem(ctx, x, y, h * 0.75, h * 0.06, herbStem, h * 0.08 + droop);
      ellipse(ctx, x - h * 0.14, y - h * 0.3, h * 0.16, h * 0.06, -0.6, herbLeaf);
      ellipse(ctx, x + h * 0.13, y - h * 0.42, h * 0.15, h * 0.055, 0.6, herbLeaf);
      const cx = x + h * 0.05 + droop * 0.6, cy = y - h * 0.78 + droop * 0.5;
      if (state === 'bud') {
        ellipse(ctx, cx, cy, h * 0.06, h * 0.1, 0, mix(bud, sp.leaf, 0.3));
      } else if (state === 'full') {
        const pr = h * 0.11;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          circle(ctx, cx + Math.cos(a) * pr, cy + Math.sin(a) * pr * 0.8, pr * 0.85, sp.color);
        }
        circle(ctx, cx, cy, pr * 0.6, '#fde68a');
      } else {
        circle(ctx, cx, cy, h * 0.07, DRY_HEAD);
      }
      break;
    }
    case 'bell': {
      stem(ctx, x, y, h * 0.85, h * 0.05, herbStem, h * 0.2 + droop);
      for (let k = 0; k < 3; k++) {
        const by = y - h * (0.5 + k * 0.14) + droop * 0.3;
        const bx = x + h * (0.1 + k * 0.05) + droop * 0.4;
        if (state === 'bud') { circle(ctx, bx, by + h * 0.04, h * 0.035, mix(sp.color, sp.leaf, 0.5)); continue; }
        ctx.fillStyle = state === 'dry' ? DRY_HEAD : sp.color;
        ctx.beginPath();
        ctx.moveTo(bx - h * 0.07, by + h * 0.09);
        ctx.quadraticCurveTo(bx, by - h * 0.08, bx + h * 0.07, by + h * 0.09);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'sunflower': {
      stem(ctx, x, y, h * 0.8, h * 0.07, herbStem, droop);
      ellipse(ctx, x - h * 0.15, y - h * 0.35, h * 0.18, h * 0.07, -0.5, herbLeaf);
      ellipse(ctx, x + h * 0.15, y - h * 0.5, h * 0.18, h * 0.07, 0.5, herbLeaf);
      const cx = x + droop * 0.8, cy = y - h * 0.85 + droop * 0.6;
      if (state === 'bud') {
        circle(ctx, cx, cy, h * 0.08, mix(sp.leaf, '#2f5f3a'));
      } else if (state === 'full') {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          ellipse(ctx, cx + Math.cos(a) * h * 0.13, cy + Math.sin(a) * h * 0.13, h * 0.08, h * 0.035, a, sp.color);
        }
        circle(ctx, cx, cy, h * 0.09, '#7c4a1e');
      } else {
        circle(ctx, cx, cy, h * 0.1, '#5a3a1a'); // spent, drooping head
      }
      break;
    }
    case 'fern': {
      ctx.strokeStyle = state === 'dry' ? DRY_STEM : leaf;
      ctx.lineWidth = Math.max(0.6, h * 0.05);
      ctx.lineCap = 'round';
      const reach = state === 'bud' ? 0.55 : 1;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.45;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * h * 0.5 * reach, y + Math.sin(a) * h * 0.9 * reach,
          x + Math.cos(a) * h * 0.75 * reach, y + Math.sin(a) * h * 0.6 * reach + (state === 'dry' ? h * 0.2 : 0));
        ctx.stroke();
      }
      break;
    }
    case 'bush': {
      const cy = y - h * 0.4;
      const sparse = season === 'autumn' && !evergreen;
      const puffs: [number, number, number][] = [[-0.22, 0.08, 0.28], [0.22, 0.08, 0.28], [0, -0.08, 0.33]];
      if (sparse) {
        for (let k = 0; k < 5; k++) line(ctx, x, y, x + (k - 2) * h * 0.15, y - h * 0.6, h * 0.03, TRUNK);
      }
      puffs.forEach(([dx, dy, rr], k) => {
        if (sparse && k === 2) return;
        circle(ctx, x + dx * h, cy + dy * h, h * rr * (sparse ? 0.8 : 1), leaf);
      });
      const dots = season === 'summer' ? 9 : season === 'spring' ? 6 : 0;
      for (let k = 0; k < dots; k++) {
        circle(ctx, x + (r() - 0.5) * h * 0.8, cy + (r() - 0.6) * h * 0.55, h * (season === 'spring' ? 0.04 : 0.07), season === 'spring' ? bud : sp.color);
      }
      if (sparse) for (let k = 0; k < 3; k++) ellipse(ctx, x + (r() - 0.5) * h * 0.9, y - h * 0.02, h * 0.05, h * 0.02, r(), leaf);
      if (snow) ellipse(ctx, x, cy - h * 0.34, h * 0.26, h * 0.07, 0, '#f1f5f9');
      break;
    }
    case 'tree': {
      trunk(ctx, x, y, h * 0.5, h * 0.14);
      const cy = y - h * 0.68;
      const scale = season === 'spring' ? 0.85 : season === 'autumn' && !evergreen ? 0.9 : 1;
      const puffs = sp.rare ? 7 : 5;
      for (let k = 0; k < puffs; k++) {
        if (season === 'autumn' && !evergreen && k % 3 === 2) continue; // thinning canopy
        const a = (k / puffs) * Math.PI * 2;
        circle(ctx, x + Math.cos(a) * h * 0.2 * scale, cy + Math.sin(a) * h * 0.14 * scale, h * 0.22 * scale, leaf);
      }
      // Crown a shade lighter than the canopy; flowers show as dots, never mixed into the green.
      circle(ctx, x, cy - h * 0.06, h * 0.26 * scale, mix(leaf, '#ffffff', 0.12));
      if (season === 'summer' || season === 'spring') {
        for (let k = 0; k < (sp.rare ? 14 : 8); k++) {
          circle(ctx, x + (r() - 0.5) * h * 0.65 * scale, cy + (r() - 0.55) * h * 0.45 * scale,
            h * (season === 'spring' ? 0.03 : 0.045), season === 'spring' ? bud : sp.color);
        }
      }
      if (season === 'autumn' && !evergreen) {
        for (let k = 0; k < 4; k++) ellipse(ctx, x + (r() - 0.5) * h * 0.8, y - h * 0.01, h * 0.04, h * 0.016, r(), leaf);
      }
      if (snow) {
        ellipse(ctx, x, cy - h * 0.28, h * 0.2, h * 0.06, 0, '#f1f5f9');
        ellipse(ctx, x - h * 0.2, cy - h * 0.12, h * 0.1, h * 0.035, -0.3, '#f1f5f9');
      }
      break;
    }
    case 'pine': {
      trunk(ctx, x, y, h * 0.25, h * 0.1);
      for (let k = 0; k < 4; k++) {
        const top = y - h * (0.35 + k * 0.18) - h * 0.22;
        const half = h * (0.34 - k * 0.07);
        ctx.fillStyle = k % 2 ? sp.leaf : mix(sp.leaf, sp.color);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x - half, top + h * 0.3);
        ctx.lineTo(x + half, top + h * 0.3);
        ctx.closePath();
        ctx.fill();
        if (snow) {
          ctx.fillStyle = '#f1f5f9';
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x - half * 0.45, top + h * 0.13);
          ctx.lineTo(x + half * 0.45, top + h * 0.13);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case 'cypress': {
      trunk(ctx, x, y, h * 0.12, h * 0.08);
      ctx.fillStyle = sp.leaf;
      ctx.beginPath();
      ctx.moveTo(x, y - h);
      ctx.bezierCurveTo(x + h * 0.2, y - h * 0.75, x + h * 0.17, y - h * 0.25, x + h * 0.02, y - h * 0.1);
      ctx.lineTo(x - h * 0.02, y - h * 0.1);
      ctx.bezierCurveTo(x - h * 0.17, y - h * 0.25, x - h * 0.2, y - h * 0.75, x, y - h);
      ctx.fill();
      ellipse(ctx, x - h * 0.04, y - h * 0.55, h * 0.03, h * 0.28, 0, mix(sp.leaf, '#ffffff', 0.12));
      if (snow) ellipse(ctx, x, y - h * 0.93, h * 0.035, h * 0.03, 0, '#f1f5f9');
      break;
    }
    case 'blossom': {
      // Flowering trees: buds in spring, clouds of blossom in summer, color in autumn.
      trunk(ctx, x, y, h * 0.45, h * 0.12, sp.leaf);
      for (const d of [-1, 1]) line(ctx, x, y - h * 0.4, x + d * h * 0.28, y - h * 0.62, h * 0.04, sp.leaf);
      const n = season === 'summer' ? 36 : season === 'spring' ? 20 : 18;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        const c = season === 'summer' ? (k % 5 === 0 ? '#ffffff' : sp.color)
          : season === 'spring' ? (k % 3 ? mix(FRESH, '#4d9a5c', 0.3) : bud)
            : autumnColor(sp, opts.seed + k);
        circle(ctx, x + Math.cos(a) * d * h * 0.42, y - h * 0.7 + Math.sin(a) * d * h * 0.26,
          h * (season === 'spring' ? 0.045 : 0.06), c);
      }
      break;
    }
    case 'willow': {
      trunk(ctx, x, y, h * 0.5, h * 0.13);
      const cy = y - h * 0.72;
      circle(ctx, x, cy, h * 0.3 * (season === 'autumn' ? 0.85 : 1), leaf);
      ctx.strokeStyle = season === 'summer' ? sp.color : leaf;
      ctx.lineWidth = Math.max(0.5, h * 0.025);
      for (let k = 0; k < (season === 'autumn' ? 7 : 11); k++) {
        const sx = x + (k / 10 - 0.5) * h * 0.7;
        ctx.beginPath();
        ctx.moveTo(sx, cy - h * 0.05);
        ctx.quadraticCurveTo(sx + (sx - x) * 0.3, cy + h * 0.2, sx + (sx - x) * 0.2, cy + h * (0.3 + r() * 0.15));
        ctx.stroke();
      }
      break;
    }
    case 'bamboo': {
      for (const dx of [-0.2, -0.05, 0.1, 0.24]) {
        const sh = h * (0.75 + r() * 0.25);
        const sx = x + dx * h;
        line(ctx, sx, y, sx, y - sh, h * 0.05, sp.leaf);
        for (let k = 1; k < 5; k++) circle(ctx, sx, y - (sh * k) / 5, h * 0.03, mix(sp.leaf, '#1f3a2a'));
        ellipse(ctx, sx + h * 0.08, y - sh * 0.85, h * 0.1, h * 0.03, -0.4, sp.color);
        ellipse(ctx, sx - h * 0.07, y - sh * 0.65, h * 0.09, h * 0.028, 0.4, sp.color);
        if (snow) circle(ctx, sx + h * 0.08, y - sh * 0.87, h * 0.03, '#f1f5f9');
      }
      break;
    }
  }

  if (opts.crit) {
    ctx.fillStyle = '#fde68a';
    for (let k = 0; k < 3; k++) {
      const sx = x + (r() - 0.5) * h * 0.8, sy = y - h * (0.3 + r() * 0.8), s = h * 0.05;
      ctx.beginPath();
      ctx.moveTo(sx, sy - s * 2); ctx.lineTo(sx + s * 0.5, sy); ctx.lineTo(sx, sy + s * 2); ctx.lineTo(sx - s * 0.5, sy);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Growth: flowers reach full size in 3 days, rare trees in 7. The first fifth of
// that is a sapling; after that the plant takes its own shape and keeps growing.
export const GROW_DAYS = { common: 3, rare: 7 };
export function growthFor(sp: Species, ageDays: number) {
  const g = Math.min(1, Math.max(0, ageDays / (sp.rare ? GROW_DAYS.rare : GROW_DAYS.common)));
  return { scale: 0.3 + 0.7 * g, young: g < 0.2 };
}

export const GROUND: Record<Season, Record<'dark' | 'light', { top: string; topEdge: string; line: string; left: string; right: string }>> = {
  spring: {
    dark: { top: '#1f3a28', topEdge: '#2a4d33', line: 'rgba(255,255,255,0.035)', left: '#3a2a1e', right: '#2b1f16' },
    light: { top: '#bfe6a8', topEdge: '#abdc92', line: 'rgba(30,60,20,0.06)', left: '#a57e57', right: '#8d6947' },
  },
  summer: {
    dark: { top: '#1d3526', topEdge: '#244430', line: 'rgba(255,255,255,0.035)', left: '#3a2a1e', right: '#2b1f16' },
    light: { top: '#b7dea8', topEdge: '#a5d394', line: 'rgba(30,60,20,0.06)', left: '#a57e57', right: '#8d6947' },
  },
  autumn: {
    dark: { top: '#33321f', topEdge: '#3d3a22', line: 'rgba(255,255,255,0.035)', left: '#3a2a1e', right: '#2b1f16' },
    light: { top: '#dcd29a', topEdge: '#cfc486', line: 'rgba(60,50,20,0.07)', left: '#a57e57', right: '#8d6947' },
  },
  winter: {
    dark: { top: '#3a4452', topEdge: '#4a5566', line: 'rgba(255,255,255,0.05)', left: '#3a2f28', right: '#2c231d' },
    light: { top: '#e8eef5', topEdge: '#f5f8fb', line: 'rgba(40,60,90,0.07)', left: '#a58c75', right: '#8d7661' },
  },
};
