// Species of the Growth Garden, shared by the server (which decides what gets
// planted) and the client (which draws it).
//
// Common plants are planted automatically by every completion that earns XP. The
// species depends on the attribute and on that attribute's level at planting
// time, so the garden visibly improves as you level up. Rare plants come from
// seeds: each achievement and every 5 levels in an attribute earns one, and you
// plant it yourself.

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
  S('jacaranda', 'Jacaranda', 'tree', '#a78bfa', '#3c7a52', 2.1, false, { autumn: '#d4a017' }),
  // Health (green)
  S('clover', 'Clover', 'bloom', '#f5f5f4', '#34a86a', 0.7),
  S('fern', 'Fern', 'fern', '#1fa874', '#1fa874', 1.0),
  S('boxwood', 'Boxwood', 'bush', '#86efac', '#1f8a55', 1.35, false, EVERGREEN),
  S('olive', 'Olive Tree', 'tree', '#d9f99d', '#5b8a4a', 2.0, false, EVERGREEN),
  // Capability (blue)
  S('bluebell', 'Bluebell', 'bell', '#60a5fa', '#3f8f63', 0.85),
  S('cornflower', 'Cornflower', 'bloom', '#3987e5', '#4a9466', 1.0),
  S('hydrangea', 'Hydrangea', 'bush', '#7ab3f5', '#2f7d57', 1.4),
  S('spruce', 'Blue Spruce', 'pine', '#7ab3f5', '#3b7f8f', 2.1, false, EVERGREEN),
  // Wealth (amber)
  S('buttercup', 'Buttercup', 'bloom', '#fde047', '#4d9a5c', 0.75),
  S('sunflower', 'Sunflower', 'sunflower', '#fabf40', '#4a8f4f', 1.3),
  S('marigold', 'Marigold', 'bush', '#f59e0b', '#3f8a4f', 1.35),
  S('ginkgo', 'Ginkgo', 'tree', '#facc15', '#7fa83a', 2.0, false, { autumn: '#facc15' }),
  // Rare: from seeds only.
  S('oak', 'Young Oak', 'tree', '#4d9a5c', '#3f7f4a', 2.6, true, { autumn: '#b45309' }),
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
    S('pine', 'Mountain Pine', 'pine', '#3f8a5f', '#2f6b4a', 2.9, true, EVERGREEN),
  S('cypress', 'Italian Cypress', 'cypress', '#2f6b4a', '#2a5e40', 3.2, true, EVERGREEN),
  S('moon-tree', 'Moon Tree', 'blossom', '#dbeafe', '#475569', 3.0, true),
  S('olive-grand', 'Old Olive', 'tree', '#bef264', '#4d7c3a', 3.0, true, EVERGREEN),
  S('rainbow-eucalyptus', 'Rainbow Eucalyptus', 'tree', '#34d399', '#2f7d57', 3.2, true),
  S('jade', 'Jade Tree', 'tree', '#6ee7b7', '#2f7d57', 2.8, true, EVERGREEN),
].map((s) => [s.id, s]));

// Common species per attribute, unlocked at these attribute levels.
export const TIER_LEVELS = [0, 3, 6, 9, 12] as const;
export const COMMON_LADDER: Record<Attribute, string[]> = {
  wisdom: ['sprout', 'lavender', 'iris', 'lilac', 'jacaranda'],
  health: ['sprout', 'clover', 'fern', 'boxwood', 'olive'],
  capability: ['sprout', 'bluebell', 'cornflower', 'hydrangea', 'spruce'],
  wealth: ['sprout', 'buttercup', 'sunflower', 'marigold', 'ginkgo'],
};

export function commonSpeciesFor(attribute: Attribute, level: number): string {
  let tier = 0;
  TIER_LEVELS.forEach((min, i) => { if (level >= min) tier = i; });
  return COMMON_LADDER[attribute][tier];
}

export function nextUnlock(attribute: Attribute, level: number): { level: number; species: string } | null {
  const i = TIER_LEVELS.findIndex((min) => min > level);
  return i === -1 ? null : { level: TIER_LEVELS[i], species: COMMON_LADDER[attribute][i] };
}

// Seeds. Ids are stable numbers (stored as garden_plants.source_id).
export interface Reward {
  id: number;
  species: string;
  reason: string;
  /** Achievement id, or attribute level milestone. */
  achievement?: string;
  milestone?: { attribute: Attribute; level: number };
}

export const ACHIEVEMENT_SEEDS: Record<string, { id: number; species: string }> = {
  'first-sprout': { id: 1, species: 'oak' },
  'todo-100': { id: 2, species: 'bamboo' },
  'todo-500': { id: 3, species: 'redwood' },
  'checkin-500': { id: 4, species: 'cherry' },
  'checkin-1000': { id: 5, species: 'willow' },
  'review-100': { id: 6, species: 'bodhi' },
  'plan-finisher': { id: 7, species: 'pine' },
  'early-bird': { id: 8, species: 'magnolia' },
  'balanced-week': { id: 9, species: 'rainbow-eucalyptus' },
  'streak-7': { id: 10, species: 'maple' },
  'streak-30': { id: 11, species: 'ancient-oak' },
  'big-day': { id: 12, species: 'flame-tree' },
  'level-10': { id: 13, species: 'golden-ginkgo' },
};

// Every 5 levels in an attribute earns that attribute's grand tree.
export const MILESTONE_EVERY = 5;
export const MILESTONE_SPECIES: Record<Attribute, string> = {
  wisdom: 'moon-tree',
  health: 'olive-grand',
  capability: 'cypress',
  wealth: 'jade',
};
const ATTR_INDEX: Record<Attribute, number> = { wisdom: 0, health: 1, capability: 2, wealth: 3 };

export function milestoneRewardId(attribute: Attribute, level: number) {
  return 100 + ATTR_INDEX[attribute] * 100 + level; // 105, 110, … per attribute
}
