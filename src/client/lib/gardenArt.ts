import type { Species } from '../../shared/gardenSpecies';

// Procedural plant drawings for the garden canvas. Every plant is drawn from its
// ground point (x, y) upward to height h; `grow` (0–1) scales it for age.

const TRUNK = '#6b4f3a';

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

function stem(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, color: string, bend = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, w);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + bend, y - h / 2, x, y - h);
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
function rng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawPlant(
  ctx: CanvasRenderingContext2D, sp: Species, x: number, y: number, h: number,
  opts: { seed: number; crit?: boolean; dark: boolean },
) {
  const r = rng(opts.seed);
  const w = h * 0.5;

  // soft ground shadow
  ellipse(ctx, x, y, w * (sp.rare ? 0.55 : 0.4), w * 0.14, 0, opts.dark ? 'rgba(0,0,0,0.35)' : 'rgba(40,60,30,0.18)');

  if (opts.crit) {
    const g = ctx.createRadialGradient(x, y - h * 0.55, 0, x, y - h * 0.55, h * 0.7);
    g.addColorStop(0, 'rgba(250,191,64,0.45)');
    g.addColorStop(1, 'rgba(250,191,64,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - h * 0.55, h * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  switch (sp.kind) {
    case 'sprout': {
      stem(ctx, x, y, h * 0.7, h * 0.08, sp.leaf);
      ellipse(ctx, x - h * 0.2, y - h * 0.72, h * 0.22, h * 0.1, -0.5, sp.color);
      ellipse(ctx, x + h * 0.2, y - h * 0.8, h * 0.22, h * 0.1, 0.5, sp.color);
      break;
    }
    case 'spike': {
      for (const dx of [-0.18, 0, 0.18]) {
        const sh = h * (0.8 + r() * 0.2);
        const sx = x + dx * h;
        stem(ctx, sx, y, sh, h * 0.04, sp.leaf, dx * h * 0.5);
        for (let k = 0; k < 6; k++) circle(ctx, sx + (r() - 0.5) * h * 0.06, y - sh + k * h * 0.07, h * 0.05, sp.color);
      }
      break;
    }
    case 'bloom': {
      stem(ctx, x, y, h * 0.75, h * 0.06, sp.leaf, h * 0.08);
      ellipse(ctx, x - h * 0.14, y - h * 0.3, h * 0.16, h * 0.06, -0.6, sp.leaf);
      ellipse(ctx, x + h * 0.13, y - h * 0.42, h * 0.15, h * 0.055, 0.6, sp.leaf);
      const cx = x, cy = y - h * 0.78, pr = h * 0.11;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        circle(ctx, cx + Math.cos(a) * pr, cy + Math.sin(a) * pr * 0.8, pr * 0.85, sp.color);
      }
      circle(ctx, cx, cy, pr * 0.6, '#fde68a');
      break;
    }
    case 'bell': {
      stem(ctx, x, y, h * 0.85, h * 0.05, sp.leaf, h * 0.2);
      for (let k = 0; k < 3; k++) {
        const by = y - h * (0.5 + k * 0.14);
        const bx = x + h * (0.1 + k * 0.05);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.moveTo(bx - h * 0.07, by + h * 0.09);
        ctx.quadraticCurveTo(bx, by - h * 0.08, bx + h * 0.07, by + h * 0.09);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'sunflower': {
      stem(ctx, x, y, h * 0.8, h * 0.07, sp.leaf);
      ellipse(ctx, x - h * 0.15, y - h * 0.35, h * 0.18, h * 0.07, -0.5, sp.leaf);
      ellipse(ctx, x + h * 0.15, y - h * 0.5, h * 0.18, h * 0.07, 0.5, sp.leaf);
      const cy = y - h * 0.85;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ellipse(ctx, x + Math.cos(a) * h * 0.13, cy + Math.sin(a) * h * 0.13, h * 0.08, h * 0.035, a, sp.color);
      }
      circle(ctx, x, cy, h * 0.09, '#7c4a1e');
      break;
    }
    case 'fern': {
      ctx.strokeStyle = sp.leaf;
      ctx.lineWidth = Math.max(0.6, h * 0.05);
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.45;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a) * h * 0.5, y + Math.sin(a) * h * 0.9, x + Math.cos(a) * h * 0.75, y + Math.sin(a) * h * 0.6);
        ctx.stroke();
      }
      break;
    }
    case 'bush': {
      const cy = y - h * 0.4;
      circle(ctx, x - h * 0.22, cy + h * 0.08, h * 0.28, sp.leaf);
      circle(ctx, x + h * 0.22, cy + h * 0.08, h * 0.28, sp.leaf);
      circle(ctx, x, cy - h * 0.08, h * 0.33, sp.leaf);
      for (let k = 0; k < 9; k++) {
        circle(ctx, x + (r() - 0.5) * h * 0.8, cy + (r() - 0.6) * h * 0.55, h * 0.07, sp.color);
      }
      break;
    }
    case 'tree': {
      trunk(ctx, x, y, h * 0.5, h * 0.14);
      const cy = y - h * 0.68;
      const puffs = sp.rare ? 7 : 5;
      for (let k = 0; k < puffs; k++) {
        const a = (k / puffs) * Math.PI * 2;
        circle(ctx, x + Math.cos(a) * h * 0.2, cy + Math.sin(a) * h * 0.14, h * 0.22, sp.leaf);
      }
      circle(ctx, x, cy - h * 0.06, h * 0.26, sp.color === sp.leaf ? sp.leaf : mix(sp.leaf, sp.color));
      for (let k = 0; k < (sp.rare ? 14 : 8); k++) {
        circle(ctx, x + (r() - 0.5) * h * 0.65, cy + (r() - 0.55) * h * 0.45, h * 0.045, sp.color);
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
      }
      break;
    }
    case 'blossom': {
      trunk(ctx, x, y, h * 0.45, h * 0.12, sp.leaf);
      ctx.strokeStyle = sp.leaf;
      ctx.lineWidth = Math.max(0.6, h * 0.04);
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y - h * 0.4);
        ctx.lineTo(x + d * h * 0.28, y - h * 0.62);
        ctx.stroke();
      }
      for (let k = 0; k < 26; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        circle(ctx, x + Math.cos(a) * d * h * 0.42, y - h * 0.7 + Math.sin(a) * d * h * 0.26, h * 0.075, k % 5 === 0 ? '#ffffff' : sp.color);
      }
      break;
    }
    case 'willow': {
      trunk(ctx, x, y, h * 0.5, h * 0.13);
      const cy = y - h * 0.72;
      circle(ctx, x, cy, h * 0.3, sp.leaf);
      ctx.strokeStyle = sp.color;
      ctx.lineWidth = Math.max(0.5, h * 0.025);
      for (let k = 0; k < 11; k++) {
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
        ctx.strokeStyle = sp.leaf;
        ctx.lineWidth = Math.max(0.8, h * 0.05);
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.lineTo(sx, y - sh);
        ctx.stroke();
        for (let k = 1; k < 5; k++) circle(ctx, sx, y - (sh * k) / 5, h * 0.03, mix(sp.leaf, '#1f3a2a'));
        ellipse(ctx, sx + h * 0.08, y - sh * 0.85, h * 0.1, h * 0.03, -0.4, sp.color);
        ellipse(ctx, sx - h * 0.07, y - sh * 0.65, h * 0.09, h * 0.028, 0.4, sp.color);
      }
      break;
    }
    case 'palm': {
      ctx.strokeStyle = TRUNK;
      ctx.lineWidth = Math.max(0.8, h * 0.07);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + h * 0.15, y - h * 0.5, x + h * 0.05, y - h * 0.85);
      ctx.stroke();
      ctx.strokeStyle = sp.leaf;
      ctx.lineWidth = Math.max(0.7, h * 0.05);
      const tx = x + h * 0.05, ty = y - h * 0.85;
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + (k / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(tx + Math.cos(a) * h * 0.25, ty + Math.sin(a) * h * 0.2 - h * 0.05, tx + Math.cos(a) * h * 0.4, ty + h * 0.1);
        ctx.stroke();
      }
      circle(ctx, tx, ty + h * 0.03, h * 0.04, '#7c4a1e');
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

function mix(a: string, b: string) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => (((pa >> s) & 255) + ((pb >> s) & 255)) >> 1;
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// Age → size: common plants reach full size in three weeks, rare trees in two months.
export function growthFor(sp: Species, ageDays: number) {
  return sp.rare ? 0.4 + 0.6 * Math.min(1, ageDays / 60) : 0.5 + 0.5 * Math.min(1, ageDays / 21);
}

export const GROUND = {
  dark: { top: '#1d3526', topEdge: '#244430', line: 'rgba(255,255,255,0.035)', left: '#3a2a1e', right: '#2b1f16' },
  light: { top: '#b7dea8', topEdge: '#a5d394', line: 'rgba(30,60,20,0.06)', left: '#a57e57', right: '#8d6947' },
};
