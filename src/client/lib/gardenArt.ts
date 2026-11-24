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

function foliage(
  ctx: CanvasRenderingContext2D, x: number, y: number, radius: number,
  shade: string, leaf: string, light: string, tilt: number,
) {
  ellipse(ctx, x, y, radius, radius * 0.76, tilt, shade);
  ellipse(ctx, x - radius * 0.08, y - radius * 0.15, radius * 0.92, radius * 0.65, tilt, leaf);
  if (radius < 3) return;
  ellipse(ctx, x - radius * 0.43, y - radius * 0.34, radius * 0.36, radius * 0.14, tilt - 0.35, light);
  ellipse(ctx, x + radius * 0.12, y - radius * 0.37, radius * 0.29, radius * 0.12, tilt + 0.35, light);
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
  opts: { seed: number; crit?: boolean; dark: boolean; season: Season; young?: boolean; pct?: number; fruit?: boolean },
) {
  const r = rng(opts.seed);
  const { season } = opts;
  const w = h * 0.5;
  const evergreen = !!sp.evergreen;
  const winterBare = season === 'winter' && !evergreen;
  const snow = season === 'winter';
  // Trees gain detail as they grow (their plan's share of finished tasks).
  const detail = 0.45 + 0.55 * Math.min(1, Math.max(0, opts.pct ?? 1));

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
  const leafShade = mix(leaf, '#262337', 0.32);
  const leafLight = mix(leaf, '#fff0c4', 0.32);
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
          const px = cx + Math.cos(a) * pr, py = cy + Math.sin(a) * pr * 0.8;
          ellipse(ctx, px, py, pr * 0.98, pr * 0.65, a, sp.color);
          ellipse(ctx, px - Math.cos(a) * pr * 0.18, py - Math.sin(a) * pr * 0.18, pr * 0.54, pr * 0.28, a, bud);
        }
        circle(ctx, cx, cy, pr * 0.6, '#fde68a');
        circle(ctx, cx, cy, pr * 0.24, '#a16207');
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
        const controlX = Math.cos(a) * h * 0.5 * reach;
        const controlY = Math.sin(a) * h * 0.9 * reach;
        const tipX = Math.cos(a) * h * 0.75 * reach;
        const tipY = Math.sin(a) * h * 0.6 * reach + (state === 'dry' ? h * 0.2 : 0);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + controlX, y + controlY, x + tipX, y + tipY);
        ctx.stroke();
        for (const t of [0.4, 0.59, 0.77]) {
          const fx = x + 2 * (1 - t) * t * controlX + t * t * tipX;
          const fy = y + 2 * (1 - t) * t * controlY + t * t * tipY;
          const size = h * reach * (0.13 - t * 0.08);
          ellipse(ctx, fx - size * 0.6, fy, size, size * 0.27, a - 0.8, herbLeaf);
          ellipse(ctx, fx + size * 0.6, fy, size, size * 0.27, a + 0.8, state === 'dry' ? DRY_STEM : leafLight);
        }
      }
      break;
    }
    case 'bush': {
      // A low dome of leaf clumps sitting on the ground, about as wide as it is tall,
      // so no single clump outweighs the plant. Autumn thins it to show bare twigs.
      const sparse = season === 'autumn' && !evergreen;
      const clumps: [number, number, number][] = [
        [-0.26, -0.13, 0.12], [0.26, -0.13, 0.12], [0, -0.15, 0.13], [-0.14, -0.27, 0.14],
        [0.14, -0.27, 0.14], [-0.22, -0.38, 0.1], [0.22, -0.38, 0.1], [0, -0.42, 0.14],
      ];
      if (sparse) {
        for (let k = 0; k < 5; k++) line(ctx, x, y, x + (k - 2) * h * 0.12, y - h * (0.42 + (k % 2) * 0.1), h * 0.025, TRUNK);
      }
      clumps.forEach(([dx, dy, rr], k) => {
        if (sparse && k % 2) return;
        foliage(ctx, x + dx * h, y + dy * h, h * rr * (sparse ? 0.8 : 1), leafShade, leaf, leafLight, (r() - 0.5) * 0.8);
      });
      const dots = season === 'summer' ? 11 : season === 'spring' ? 7 : 0;
      for (let k = 0; k < dots; k++) {
        circle(ctx, x + (r() - 0.5) * h * 0.6, y - h * (0.15 + r() * 0.35), h * (season === 'spring' ? 0.03 : 0.045), season === 'spring' ? bud : sp.color);
      }
      if (sparse) for (let k = 0; k < 3; k++) ellipse(ctx, x + (r() - 0.5) * h * 0.9, y - h * 0.02, h * 0.05, h * 0.02, r(), leaf);
      if (snow) ellipse(ctx, x, y - h * 0.52, h * 0.22, h * 0.06, 0, '#f1f5f9');
      break;
    }
    case 'tree': {
      trunk(ctx, x, y, h * 0.5, h * 0.14);
      const cy = y - h * 0.68;
      const scale = season === 'spring' ? 0.85 : season === 'autumn' && !evergreen ? 0.9 : 1;
      const puffs = Math.max(3, Math.round((sp.rare ? 8 : 6) * detail));
      const crownWidth = 0.18 + r() * 0.08;
      const lean = (r() - 0.5) * h * 0.1;
      for (const side of [-1, 1]) {
        line(ctx, x, y - h * 0.35, x + lean + side * h * 0.22, cy, h * 0.045, TRUNK);
      }
      for (let k = 0; k < puffs; k++) {
        if (season === 'autumn' && !evergreen && k % 3 === 2) continue; // thinning canopy
        const a = (k / puffs) * Math.PI * 2;
        foliage(ctx, x + lean + Math.cos(a) * h * crownWidth * scale, cy + Math.sin(a) * h * 0.16 * scale,
          h * (0.17 + r() * 0.07) * scale, leafShade, leaf, leafLight, (r() - 0.5) * 0.7);
      }
      foliage(ctx, x + lean, cy - h * 0.1, h * 0.22 * scale, leafShade, leaf, leafLight, -0.2);
      if (season === 'summer' || season === 'spring') {
        for (let k = 0; k < Math.round((sp.rare ? 14 : 10) * detail); k++) {
          circle(ctx, x + (r() - 0.5) * h * 0.65 * scale, cy + (r() - 0.55) * h * 0.45 * scale,
            h * (season === 'spring' ? 0.03 : 0.045), season === 'spring' ? bud : sp.color);
        }
      }
      if (season === 'autumn' && !evergreen) {
        for (let k = 0; k < 4; k++) ellipse(ctx, x + (r() - 0.5) * h * 0.8, y - h * 0.01, h * 0.04, h * 0.016, r(), leaf);
      }
      if (opts.fruit && (season === 'summer' || season === 'autumn')) { // a finished plan bears fruit
        for (let k = 0; k < 7; k++) circle(ctx, x + (r() - 0.5) * h * 0.55, cy + (r() - 0.35) * h * 0.35, h * 0.035, k % 2 ? '#ef4444' : '#f59e0b');
      }
      if (snow) {
        ellipse(ctx, x, cy - h * 0.28, h * 0.2, h * 0.06, 0, '#f1f5f9');
        ellipse(ctx, x - h * 0.2, cy - h * 0.12, h * 0.1, h * 0.035, -0.3, '#f1f5f9');
      }
      break;
    }
    case 'pine': {
      trunk(ctx, x, y, h * 0.25, h * 0.1);
      const tiers = Math.min(4, 2 + Math.round(2 * (detail - 0.45) / 0.55));
      for (let k = 0; k < tiers; k++) {
        const top = y - h * (0.35 + k * 0.18) - h * 0.22;
        const half = h * (0.34 - k * 0.07);
        ctx.fillStyle = k % 2 ? sp.leaf : mix(sp.leaf, sp.color);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.quadraticCurveTo(x - half * 0.42, top + h * 0.2, x - half, top + h * 0.3);
        ctx.quadraticCurveTo(x, top + h * 0.39, x + half, top + h * 0.3);
        ctx.quadraticCurveTo(x + half * 0.42, top + h * 0.2, x, top);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = leafShade;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.quadraticCurveTo(x + half * 0.42, top + h * 0.2, x + half, top + h * 0.3);
        ctx.quadraticCurveTo(x + half * 0.45, top + h * 0.35, x, top + h * 0.345);
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
      const n = Math.round((season === 'summer' ? 36 : season === 'spring' ? 20 : 18) * detail);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        const c = season === 'summer' ? (k % 5 === 0 ? '#ffffff' : sp.color)
          : season === 'spring' ? (k % 3 ? mix(FRESH, '#4d9a5c', 0.3) : bud)
            : autumnColor(sp, opts.seed + k);
        const cx = x + Math.cos(a) * d * h * 0.42;
        const cy = y - h * 0.7 + Math.sin(a) * d * h * 0.26;
        const radius = h * (season === 'spring' ? 0.045 : 0.06);
        if (season === 'autumn') foliage(ctx, cx, cy, radius * 1.25, leafShade, c, leafLight, a);
        else {
          circle(ctx, cx, cy, radius, c);
          if (season === 'summer') circle(ctx, cx - radius * 0.2, cy - radius * 0.25, radius * 0.37, bud);
        }
      }
      break;
    }
    case 'willow': {
      trunk(ctx, x, y, h * 0.5, h * 0.13);
      const cy = y - h * 0.72;
      const strands = season === 'autumn' ? 7 : 11;
      ctx.lineWidth = Math.max(0.5, h * 0.032);
      for (let k = 0; k < strands; k++) {
        const sx = x + (k / (strands - 1) - 0.5) * h * 0.58;
        ctx.strokeStyle = k % 3 === 0 ? leafShade : k % 3 === 1 ? leaf : leafLight;
        ctx.beginPath();
        ctx.moveTo(sx, cy - h * 0.05);
        ctx.quadraticCurveTo(sx + (sx - x) * 0.3, cy + h * 0.2, sx + (sx - x) * 0.2, cy + h * (0.3 + r() * 0.15));
        ctx.stroke();
      }
      for (const offset of [-0.2, 0.2, 0]) {
        foliage(ctx, x + h * offset, cy - h * (0.08 - Math.abs(offset) * 0.4),
          h * 0.21, leafShade, leaf, leafLight, offset * 2);
      }
      break;
    }
    case 'bamboo': {
      for (const dx of [-0.05, 0.1, -0.2, 0.24].slice(0, 1 + Math.round(3 * (detail - 0.45) / 0.55))) {
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

// Growth comes from events (planting, watering, reviews), not the clock: a plant is
// a sapling until it has 10% of its target growth, then takes its species shape
// and keeps growing to full size at `target` (100, or 150 for rare trees).
export function growthFor(growth: number, target: number) {
  const g = Math.min(1, Math.max(0, growth / target));
  return { scale: 0.3 + 0.7 * g, young: g < 0.1, pct: g };
}

const GROUND_DETAILS = {
  spring: ['#eeb4d0', '#fff5c8', '#86c86a'],
  summer: ['#80ae48', '#568834', '#b9cb59'],
  autumn: ['#ce631e', '#e8a72e', '#a33f24'],
  winter: ['#ffffff', '#c2dff2', '#a2c8e0'],
} satisfies Record<Season, string[]>;

export function drawGroundDetail(
  ctx: CanvasRenderingContext2D, season: Season, x: number, y: number, size: number, index: number, tilt: number,
) {
  const color = GROUND_DETAILS[season][index % 3];
  switch (season) {
    case 'spring':
      ellipse(ctx, x, y, size * 0.46, size * 0.26, tilt, color);
      if (index % 3 !== 2) ellipse(ctx, x, y, size * 0.16, size * 0.1, tilt, '#c98836');
      break;
    case 'summer':
      line(ctx, x, y, x - size * 0.48, y - size * 0.46, size * 0.13, color);
      line(ctx, x, y, x + size * 0.28, y - size * 0.65, size * 0.13, color);
      break;
    case 'autumn':
      ellipse(ctx, x, y, size * 0.64, size * 0.29, tilt, color);
      ellipse(ctx, x, y, size * 0.42, size * 0.04, tilt, '#75401f');
      break;
    case 'winter':
      ellipse(ctx, x, y, size * 1.4, size * 0.38, 0, color);
      break;
  }
}

export const GROUND: Record<Season, Record<'dark' | 'light', { top: string; topEdge: string; line: string; left: string; right: string }>> = {
  spring: {
    dark: { top: '#1f3a28', topEdge: '#2a4d33', line: 'rgba(255,255,255,0.035)', left: '#3a2a1e', right: '#2b1f16' },
    light: { top: '#bfe6a8', topEdge: '#abdc92', line: 'rgba(30,60,20,0.06)', left: '#a57e57', right: '#8d6947' },
  },
  summer: {
    dark: { top: '#1d3526', topEdge: '#244430', line: 'rgba(255,255,255,0.035)', left: '#3a2a1e', right: '#2b1f16' },
    light: { top: '#80b95f', topEdge: '#a7ce70', line: 'rgba(30,60,20,0.06)', left: '#a57e57', right: '#8d6947' },
  },
  autumn: {
    dark: { top: '#513522', topEdge: '#70502c', line: 'rgba(255,255,255,0.05)', left: '#3a2419', right: '#2b1a12' },
    light: { top: '#ca954b', topEdge: '#e3bc74', line: 'rgba(60,50,20,0.07)', left: '#ae754b', right: '#895332' },
  },
  winter: {
    dark: { top: '#647e9b', topEdge: '#8babc2', line: 'rgba(255,255,255,0.07)', left: '#3e536d', right: '#2e4159' },
    light: { top: '#dcebf8', topEdge: '#f8fcff', line: 'rgba(40,60,90,0.07)', left: '#acbfd4', right: '#8fa6bf' },
  },
};
