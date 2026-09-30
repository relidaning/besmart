// Species of the Growth Garden, shared by the server (which decides what gets
// planted) and the client (which draws it).
//
// Flowers and shrubs are notes: every vault note plants one, in its folder's
// color, and better species unlock with your Wisdom level. Trees are study plans:
// creating a plan plants the tree you pick, and it grows as the plan's tasks get
// done. Six trees are available from the start; achievements and every 5 levels
// in an attribute unlock the rest.

export type Attribute = 'wisdom' | 'health' | 'capability' | 'wealth';

// How the client draws a species (see client/lib/gardenArt.ts).
export type PlantKind =
  | 'sprout' | 'spike' | 'bloom' | 'bell' | 'sunflower' | 'fern'
  | 'bush' | 'tree' | 'pine' | 'cypress' | 'blossom' | 'willow' | 'bamboo';

export interface Species {
  id: string;
  name: string;
  kind: PlantKind;
  /** Main color (flowers, blossoms, canopy). */
  color: string;
  /** Leaf / foliage color. */
  leaf: string;
  rare?: boolean;
  /** Relative height at full growth (1 = a common flower). */
  size: number;
  /** Keeps its foliage all winter (pines, cypresses, boxwood, olive, bamboo…). */
  evergreen?: boolean;
  /** Foliage color in autumn; deciduous plants default to a yellow-orange. */
  autumn?: string;
}

const S = (id: string, name: string, kind: PlantKind, color: string, leaf: string, size: number, rare = false,
  extra: Partial<Species> = {}): Species =>
  ({ id, name, kind, color, leaf, size, ...(rare ? { rare } : {}), ...extra });
const EVERGREEN = { evergreen: true };

export const SPECIES: Record<string, Species> = Object.fromEntries([
  // Tier 0: everyone starts here.
  S('sprout', 'Sprout', 'sprout', '#7ad38f', '#4fbf73', 0.55),
  // Wisdom (purple)
  S('lavender', 'Lavender', 'spike', '#a78bfa', '#6f9e7a', 0.9),
  S('iris', 'Iris', 'bloom', '#8b5cf6', '#4f9a6a', 1.05),
  S('lilac', 'Lilac', 'bush', '#c4a1ff', '#3f8a5a', 1.45),
  S('jacaranda', 'Jacaranda', 'tree', '#a78bfa', '#3c7a52', 2.8, false, { autumn: '#d4a017' }),
  // Health (green)
  S('clover', 'Clover', 'bloom', '#f5f5f4', '#34a86a', 0.7),
  S('fern', 'Fern', 'fern', '#1fa874', '#1fa874', 1.0),
  S('boxwood', 'Boxwood', 'bush', '#86efac', '#1f8a55', 1.35, false, EVERGREEN),
  S('olive', 'Olive Tree', 'tree', '#d9f99d', '#5b8a4a', 2.6, false, EVERGREEN),
  // Capability (blue)
  S('bluebell', 'Bluebell', 'bell', '#60a5fa', '#3f8f63', 0.85),
  S('cornflower', 'Cornflower', 'bloom', '#3987e5', '#4a9466', 1.0),
  S('hydrangea', 'Hydrangea', 'bush', '#7ab3f5', '#2f7d57', 1.4),
  S('spruce', 'Blue Spruce', 'pine', '#7ab3f5', '#3b7f8f', 3.0, false, EVERGREEN),
  // Wealth (amber)
  S('buttercup', 'Buttercup', 'bloom', '#fde047', '#4d9a5c', 0.75),
  S('sunflower', 'Sunflower', 'sunflower', '#fabf40', '#4a8f4f', 1.3),
  S('marigold', 'Marigold', 'bush', '#f59e0b', '#3f8a4f', 1.35),
  S('ginkgo', 'Ginkgo', 'tree', '#facc15', '#7fa83a', 2.8, false, { autumn: '#facc15' }),
  // Rare: from seeds only.
  S('oak', 'Oak', 'tree', '#4d9a5c', '#3f7f4a', 3.0, false, { autumn: '#b45309' }),
  S('ancient-oak', 'Ancient Oak', 'tree', '#3f8a4f', '#2f6b3d', 3.4, true, { autumn: '#a16207' }),
  S('maple', 'Red Maple', 'tree', '#ef4444', '#4d9a5c', 2.7, true, { autumn: '#dc2626' }),
  S('cherry', 'Cherry Blossom', 'blossom', '#f9a8d4', '#6b4f3a', 2.8, true),
  S('willow', 'Weeping Willow', 'willow', '#86c77a', '#5f9e55', 3.0, true),
  S('bamboo', 'Bamboo Grove', 'bamboo', '#8fd694', '#5fae6a', 2.8, true, EVERGREEN),
  S('redwood', 'Redwood', 'pine', '#2f6b4f', '#1f5a40', 3.6, true, EVERGREEN),
  S('bodhi', 'Bodhi Tree', 'tree', '#c4a1ff', '#3f7f52', 3.0, true),
  S('golden-ginkgo', 'Golden Ginkgo', 'tree', '#fabf40', '#8fb34a', 3.0, true, { autumn: '#fbbf24' }),
  S('magnolia', 'Magnolia', 'blossom', '#fdf2f8', '#5b4636', 2.6, true),
  S('flame-tree', 'Flame Tree', 'blossom', '#f97316', '#6b4f3a', 2.7, true),
    S('pine', 'Mountain Pine', 'pine', '#3f8a5f', '#2f6b4a', 3.0, false, EVERGREEN),
  S('cypress', 'Italian Cypress', 'cypress', '#2f6b4a', '#2a5e40', 3.2, true, EVERGREEN),
  S('moon-tree', 'Moon Tree', 'blossom', '#dbeafe', '#475569', 3.0, true),
  S('olive-grand', 'Old Olive', 'tree', '#bef264', '#4d7c3a', 3.0, true, EVERGREEN),
  S('rainbow-eucalyptus', 'Rainbow Eucalyptus', 'tree', '#34d399', '#2f7d57', 3.2, true),
  S('jade', 'Jade Tree', 'tree', '#6ee7b7', '#2f7d57', 2.8, true, EVERGREEN),
].map((s) => [s.id, s]));

// Common species per attribute, unlocked at these attribute levels.
// Note plants top out at shrubs: trees are only for study plans.
export const TIER_LEVELS = [0, 3, 6, 9] as const;
export const COMMON_LADDER: Record<Attribute, string[]> = {
  wisdom: ['sprout', 'lavender', 'iris', 'lilac'],
  health: ['sprout', 'clover', 'fern', 'boxwood'],
  capability: ['sprout', 'bluebell', 'cornflower', 'hydrangea'],
  wealth: ['sprout', 'buttercup', 'sunflower', 'marigold'],
};

// ── Trees are study plans ───────────────────────────────────────────────────
const TREE_KINDS = new Set<PlantKind>(['tree', 'pine', 'cypress', 'blossom', 'willow', 'bamboo']);
export const isTree = (id: string) => !!SPECIES[id] && TREE_KINDS.has(SPECIES[id].kind);
export const TREES = Object.values(SPECIES).filter((s) => TREE_KINDS.has(s.kind)).map((s) => s.id);
export const STARTER_TREES = ['oak', 'pine', 'jacaranda', 'ginkgo', 'olive', 'spruce'];

export function commonSpeciesFor(attribute: Attribute, level: number): string {
  let tier = 0;
  TIER_LEVELS.forEach((min, i) => { if (level >= min) tier = i; });
  return COMMON_LADDER[attribute][tier];
}

export function nextUnlock(attribute: Attribute, level: number): { level: number; species: string } | null {
  const i = TIER_LEVELS.findIndex((min) => min > level);
  return i === -1 ? null : { level: TIER_LEVELS[i], species: COMMON_LADDER[attribute][i] };
}

// Achievements unlock tree species (all-time: an unlock is a choice, not a free plant).
export const ACHIEVEMENT_TREES: Record<string, string> = {
  'first-sprout': 'magnolia',
  'todo-100': 'bamboo',
  'todo-500': 'redwood',
  'checkin-500': 'cherry',
  'checkin-1000': 'willow',
  'review-100': 'bodhi',
  'plan-finisher': 'ancient-oak',
  'early-bird': 'flame-tree',
  'balanced-week': 'rainbow-eucalyptus',
  'streak-7': 'maple',
  'streak-30': 'cypress',
  'big-day': 'golden-ginkgo',
  'level-10': 'olive-grand',
};

// Reaching level 5 in an attribute unlocks its grand tree.
export const MILESTONE_EVERY = 5;
export const MILESTONE_SPECIES: Record<Attribute, string> = {
  wisdom: 'moon-tree',
  health: 'olive-grand',
  capability: 'cypress',
  wealth: 'jade',
};
// ── Flowers are notes ───────────────────────────────────────────────────────
// Every note you create in the vault (as a review course) plants a sapling.
// Its color family follows the note's folder; the species within the family
// depends on your Wisdom level when it's planted.

export function familyForNote(path: string | null | undefined): Attribute {
  const p = path ?? '';
  if (/^0_dev\/(0_)?AI\//i.test(p)) return 'wisdom';   // AI/ML/DL: purple
  if (p.startsWith('0_dev/')) return 'capability';        // other dev: blue
  if (p.startsWith('1_English/')) return 'wealth';        // English: amber
  return 'health';                                        // everything else: green
}

export const FAMILY_LABEL: Record<Attribute, string> = {
  wisdom: 'AI notes', capability: 'Dev notes', wealth: 'English notes', health: 'Other notes',
};

export const GROWTH = {
  // Reviews are what grow a note's plant: about five Good reviews (months apart, with
  // FSRS) take it to full size. Water only helps a little, so a busy day of check-ins
  // can't mature a plant.
  review: { again: 6, hard: 12, ok: 18, easy: 22 } as Record<string, number>,
  water: 2,        // per watered note plant, at most once a day
  waterMax: 20,    // most growth a plant can get from water in total
  waterPlants: 3,  // note plants watered by one finished check-in / todo
  full: 100,       // growth at full size; a tree's growth is its plan's share of finished tasks
};
