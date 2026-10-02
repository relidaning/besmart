// FSRS-5 (Free Spaced Repetition Scheduler), the model Anki uses since 23.10.
// Each course carries a memory state: stability S (days until recall drops to
// 90%) and difficulty D (1–10). A review updates both from the rating and from
// how much was actually forgotten since the last review (retrievability R),
// and the next review is scheduled for when R is predicted to fall to
// DESIRED_RETENTION. Formulas and default weights:
// https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm

export type Grade = 1 | 2 | 3 | 4; // Again (forgot), Hard, Good, Easy

const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];
const DECAY = -0.5;
const FACTOR = 19 / 81; // makes R(S, S) = 0.9

export const DESIRED_RETENTION = 0.9;
export const MAXIMUM_INTERVAL = 365; // a well-known note still comes back once a year

export interface MemoryState {
  stability: number;
  difficulty: number;
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));

export function retrievability(elapsedDays: number, stability: number) {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

function initialDifficulty(g: Grade) {
  return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
}

function nextDifficulty(d: number, g: Grade) {
  const delta = -W[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // linear damping: harder cards move less
  return clampD(W[7] * initialDifficulty(4) + (1 - W[7]) * damped); // mean reversion
}

function recallStability(s: number, d: number, r: number, g: Grade) {
  const hardPenalty = g === 2 ? W[15] : 1;
  const easyBonus = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus);
}

function forgetStability(s: number, d: number, r: number) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
  return Math.min(sf, s); // forgetting never makes a memory more stable
}

/** Memory state after a review. `state` is null for a note's first review. */
export function review(state: MemoryState | null, elapsedDays: number, g: Grade): MemoryState {
  if (!state) return { stability: W[g - 1], difficulty: initialDifficulty(g) };
  const r = retrievability(elapsedDays, state.stability);
  const stability = g === 1
    ? forgetStability(state.stability, state.difficulty, r)
    : recallStability(state.stability, state.difficulty, r, g);
  return { stability: Math.max(0.1, stability), difficulty: nextDifficulty(state.difficulty, g) };
}

/** Days until recall is predicted to fall to DESIRED_RETENTION. */
export function intervalFor(stability: number) {
  const days = (stability / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  return Math.min(MAXIMUM_INTERVAL, Math.max(1, Math.round(days)));
}

// Small deterministic spread (±5% from 7 days up) so notes learned together
// don't all come due on the same day.
export function fuzzInterval(days: number, seed: number) {
  if (days < 7) return days;
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.min(MAXIMUM_INTERVAL, Math.max(1, Math.round(days * (0.95 + frac * 0.1))));
}

export const GRADE: Record<string, Grade> = { again: 1, hard: 2, ok: 3, good: 3, easy: 4 };

/** The next interval each rating would give, for the rating buttons. */
export function previewIntervals(state: MemoryState | null, elapsedDays: number) {
  const out: Record<'again' | 'hard' | 'ok' | 'easy', number> = { again: 1, hard: 1, ok: 1, easy: 1 };
  for (const [k, g] of [['again', 1], ['hard', 2], ['ok', 3], ['easy', 4]] as const) {
    out[k] = g === 1 ? 1 : intervalFor(review(state, elapsedDays, g).stability);
  }
  return out;
}
