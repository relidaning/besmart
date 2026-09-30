import db from './database.js';
import { localDate, effectiveDate } from './date.js';
import {
  SPECIES, ACHIEVEMENT_SEEDS, MILESTONE_EVERY, MILESTONE_SPECIES, commonSpeciesFor, nextUnlock, milestoneRewardId,
  type Reward,
} from '../shared/gardenSpecies.js';

// Growth Garden: every meaningful completion earns XP in one of four attributes.
// xp_events is append-only (one row per source item), so totals are always a
// plain SUM and un-completing an item simply deletes its row.

export const ATTRIBUTES = ['wisdom', 'health', 'capability', 'wealth'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type SourceType = 'checkin' | 'todo' | 'review' | 'plan_task' | 'plan';

export const REVIEW_XP = { again: 12, hard: 12, ok: 8, easy: 6 } as const;
export const TODO_XP = { high: 15, medium: 10, low: 5 } as const;
export const PLAN_TASK_XP = 15;
export const PLAN_XP = 50;
export const MIN_CHECKIN_XP = 5;
// Matches DUE_DAILY_LIMIT in reviews.ts: reviews past the daily cap earn nothing,
// so the garden rewards learning, not grinding.
export const REVIEW_XP_DAILY_CAP = 20;
const CRIT_CHANCE = 1 / 8;

export function isAttribute(v: unknown): v is Attribute {
  return typeof v === 'string' && (ATTRIBUTES as readonly string[]).includes(v);
}

// Guess an attribute from a check-in schedule's name; the user can override it.
export function inferCategory(name: string): Attribute {
  const n = name.toLowerCase();
  if (/(exercis|excercis|run|gym|walk|sleep|hygiene|health|spray|head|water|diet|yoga|stretch)/.test(n)) return 'health';
  if (/(money|invest|saving|budget|income|finance|stock|fund|salary|side ?project|business)/.test(n)) return 'wealth';
  if (/(word|study|leetcode|read|english|translat|diary|write|shadow|learn|ppt|book|course)/.test(n)) return 'wisdom';
  return 'capability';
}

export function scheduleCategory(s: { category?: string | null; name: string }): Attribute {
  return isAttribute(s.category) ? s.category : inferCategory(s.name);
}

export function levelFor(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 50));
  const floor = 50 * level * level;
  const next = 50 * (level + 1) * (level + 1);
  return { level, xp, floor, next };
}

function attributeTotal(userId: number, attribute: Attribute): number {
  return (db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as t FROM xp_events WHERE user_id = ? AND attribute = ?'
  ).get(userId, attribute) as any).t;
}

export interface XpAward {
  attribute: Attribute;
  amount: number;
  crit: boolean;
  capped?: boolean;
  levelUp?: number;
  /** The plant this completion put in the garden. */
  plant?: string;
  /** A common species this level-up unlocked. */
  unlocked?: string;
  /** A rare seed this level-up earned (every MILESTONE_EVERY levels). */
  seed?: string;
}

export function awardXp(
  userId: number,
  sourceType: SourceType,
  sourceId: number | string,
  attribute: Attribute,
  base: number,
): XpAward | null {
  const existing = db.prepare(
    'SELECT amount, attribute FROM xp_events WHERE source_type = ? AND source_id = ?'
  ).get(sourceType, Number(sourceId)) as any;
  if (existing) return null;

  if (sourceType === 'review') {
    const today = effectiveDate();
    const reviewedToday = (db.prepare(
      "SELECT COUNT(*) as c FROM xp_events WHERE user_id = ? AND source_type = 'review' AND day = ?"
    ).get(userId, today) as any).c;
    if (reviewedToday >= REVIEW_XP_DAILY_CAP) return { attribute, amount: 0, crit: false, capped: true };
  }

  const crit = Math.random() < CRIT_CHANCE;
  const amount = Math.round(base * (crit ? 2 : 1));
  const before = levelFor(attributeTotal(userId, attribute)).level;

  db.prepare(
    'INSERT INTO xp_events (user_id, attribute, amount, source_type, source_id, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, attribute, amount, sourceType, Number(sourceId), effectiveDate(), new Date().toISOString());

  const after = levelFor(attributeTotal(userId, attribute)).level;
  const species = commonSpeciesFor(attribute, after);
  plant(userId, species, attribute, sourceType, Number(sourceId), sourceLabel(sourceType, Number(sourceId)),
    crit, effectiveDate(), new Date().toISOString());

  const award: XpAward = { attribute, amount, crit, plant: SPECIES[species].name };
  if (after > before) {
    award.levelUp = after;
    if (species !== commonSpeciesFor(attribute, before)) award.unlocked = SPECIES[species].name;
    if (Math.floor(after / MILESTONE_EVERY) > Math.floor(before / MILESTONE_EVERY)) {
      award.seed = SPECIES[MILESTONE_SPECIES[attribute]].name;
    }
  }
  return award;
}

export function revokeXp(sourceType: SourceType, sourceId: number | string) {
  db.prepare('DELETE FROM xp_events WHERE source_type = ? AND source_id = ?').run(sourceType, Number(sourceId));
  db.prepare('DELETE FROM garden_plants WHERE source_type = ? AND source_id = ?').run(sourceType, Number(sourceId));
}

// ── Plants ──────────────────────────────────────────────────────────────────

function plant(
  userId: number, species: string, attribute: Attribute | null, sourceType: string, sourceId: number,
  label: string | null, crit: boolean, day: string, plantedAt: string,
) {
  db.prepare(`
    INSERT OR IGNORE INTO garden_plants (user_id, species, attribute, source_type, source_id, label, crit, day, planted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, species, attribute, sourceType, sourceId, label, crit ? 1 : 0, day, plantedAt);
}

// What planted it, shown when the plant is tapped.
function sourceLabel(sourceType: string, id: number): string | null {
  const q: Record<string, string> = {
    checkin: 'SELECT s.name AS l FROM checkin_tasks t JOIN checkin_schedules s ON s.id = t.schedule_id WHERE t.id = ?',
    todo: 'SELECT title AS l FROM todos WHERE id = ?',
    review: 'SELECT c.name AS l FROM review_records r JOIN review_courses c ON c.id = r.course_id WHERE r.id = ?',
    plan_task: 'SELECT name AS l FROM plan_tasks WHERE id = ?',
    plan: 'SELECT name AS l FROM study_plans WHERE id = ?',
  };
  if (!q[sourceType]) return null;
  return ((db.prepare(q[sourceType]).get(id) as any)?.l as string | undefined)?.slice(0, 200) ?? null;
}

// Fresh start (2026-09-30): the user didn't want history filling the garden, or
// seeds handed out for achievements earned before the garden existed. Once, this
// clears every plant and records each user's already-earned rewards as a
// baseline that never yields seeds. The garden grows only from here on.
function freshStart() {
  db.transaction(() => {
    db.prepare('DELETE FROM garden_plants').run();
    const users = db.prepare('SELECT DISTINCT user_id FROM xp_events').all() as { user_id: number }[];
    for (const { user_id } of users) {
      const ids = earnedRewards(gardenSummary(user_id)).map((r) => r.id);
      db.prepare('INSERT OR REPLACE INTO garden_state (key, value) VALUES (?, ?)').run(`seed_baseline:${user_id}`, JSON.stringify(ids));
    }
  })();
}

function seedBaseline(userId: number): Set<number> {
  const row = db.prepare('SELECT value FROM garden_state WHERE key = ?').get(`seed_baseline:${userId}`) as any;
  try { return new Set(row ? JSON.parse(row.value) : []); } catch { return new Set(); }
}

// Seeds earned: one per unlocked achievement, one per MILESTONE_EVERY levels in each attribute.
function earnedRewards(summary: ReturnType<typeof gardenSummary>): Reward[] {
  const rewards: Reward[] = [];
  for (const a of summary.achievements) {
    const seed = ACHIEVEMENT_SEEDS[a.id];
    if (seed && a.progress >= a.goal) rewards.push({ id: seed.id, species: seed.species, reason: a.title, achievement: a.id });
  }
  for (const a of summary.attributes) {
    for (let lv = MILESTONE_EVERY; lv <= a.level; lv += MILESTONE_EVERY) {
      rewards.push({
        id: milestoneRewardId(a.attribute, lv), species: MILESTONE_SPECIES[a.attribute],
        reason: `${a.attribute[0].toUpperCase()}${a.attribute.slice(1)} level ${lv}`, milestone: { attribute: a.attribute, level: lv },
      });
    }
  }
  return rewards;
}

function availableSeeds(userId: number, summary: ReturnType<typeof gardenSummary>) {
  const planted = new Set((db.prepare(
    "SELECT source_id FROM garden_plants WHERE user_id = ? AND source_type = 'seed'"
  ).all(userId) as any[]).map((r) => r.source_id));
  const baseline = seedBaseline(userId);
  return earnedRewards(summary).filter((r) => !planted.has(r.id) && !baseline.has(r.id));
}

export function gardenPlants(userId: number) {
  const summary = gardenSummary(userId);
  const plants = db.prepare(
    'SELECT id, species, attribute, source_type, label, crit, day, planted_at FROM garden_plants WHERE user_id = ? ORDER BY planted_at, id'
  ).all(userId) as any[];
  return {
    plants: plants.map((p) => ({ ...p, crit: Boolean(p.crit) })),
    seeds: availableSeeds(userId, summary),
    ladder: summary.attributes.map((a) => ({
      attribute: a.attribute,
      level: a.level,
      current: commonSpeciesFor(a.attribute, a.level),
      next: nextUnlock(a.attribute, a.level),
    })),
    today: effectiveDate(),
  };
}

export function plantSeed(userId: number, rewardId: number) {
  const seed = availableSeeds(userId, gardenSummary(userId)).find((r) => r.id === rewardId);
  if (!seed) return null;
  plant(userId, seed.species, seed.milestone?.attribute ?? null, 'seed', seed.id, seed.reason, false,
    effectiveDate(), new Date().toISOString());
  return seed;
}

export function seedCount(userId: number) {
  return availableSeeds(userId, gardenSummary(userId)).length;
}

// Turn existing history into XP so the garden starts from everything already done.
// Idempotent thanks to UNIQUE(source_type, source_id); no crits, so history is stable.
function backfillXp() {
  const toDay = (ts: string | null, fallback: string) => {
    if (!ts) return fallback;
    const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T'));
    return isNaN(d.getTime()) ? fallback : localDate(d);
  };
  const insert = db.prepare(
    'INSERT OR IGNORE INTO xp_events (user_id, attribute, amount, source_type, source_id, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    const checkins = db.prepare(`
      SELECT t.id, t.task_date, t.completed_at, t.schedule_type, s.user_id, s.score, s.category, s.name
      FROM checkin_tasks t JOIN checkin_schedules s ON s.id = t.schedule_id
      WHERE t.is_completed = 1 AND s.user_id IS NOT NULL
    `).all() as any[];
    for (const c of checkins) {
      // Daily tasks belong to their task_date (completion may land after midnight).
      const day = c.schedule_type === 'daily' ? c.task_date : toDay(c.completed_at, c.task_date);
      insert.run(c.user_id, scheduleCategory(c), Math.max(c.score || 0, MIN_CHECKIN_XP),
        'checkin', c.id, day, c.completed_at || c.task_date);
    }

    const todos = db.prepare(
      'SELECT id, user_id, priority, completed_at, created_at FROM todos WHERE completed = 1 AND user_id IS NOT NULL'
    ).all() as any[];
    for (const t of todos) {
      const fallback = (t.created_at || '').slice(0, 10) || localDate(new Date());
      insert.run(t.user_id, 'capability', TODO_XP[t.priority as keyof typeof TODO_XP] ?? TODO_XP.medium,
        'todo', t.id, toDay(t.completed_at, fallback), t.completed_at || t.created_at);
    }

    const reviews = db.prepare(`
      SELECT r.id, r.reviewed_date, c.user_id FROM review_records r
      JOIN review_courses c ON c.id = r.course_id
      WHERE r.is_reviewed = 1 AND r.reviewed_date IS NOT NULL AND c.user_id IS NOT NULL
    `).all() as any[];
    for (const r of reviews) {
      insert.run(r.user_id, 'wisdom', REVIEW_XP.ok, 'review', r.id, r.reviewed_date, r.reviewed_date);
    }

    const tasks = db.prepare(`
      SELECT t.id, t.actual_end, t.planned_end, p.user_id FROM plan_tasks t
      JOIN study_plans p ON p.id = t.plan_id
      WHERE t.is_completed = 1 AND p.user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM plan_tasks c WHERE c.parent_task_id = t.id)
    `).all() as any[];
    for (const t of tasks) {
      const day = t.actual_end || t.planned_end;
      insert.run(t.user_id, 'wisdom', PLAN_TASK_XP, 'plan_task', t.id, day, day);
    }

    const plans = db.prepare(
      'SELECT id, user_id, end_date FROM study_plans WHERE is_completed = 1 AND user_id IS NOT NULL'
    ).all() as any[];
    for (const p of plans) {
      insert.run(p.user_id, 'wisdom', PLAN_XP, 'plan', p.id, p.end_date, p.end_date);
    }
  })();
}

// One-time backfill (tracked in garden_state so over-cap reviews skipped live
// aren't re-awarded on every restart).
export function initGarden() {
  const flag = (key: string) => db.prepare('SELECT value FROM garden_state WHERE key = ?').get(key);
  const set = (key: string) => db.prepare('INSERT INTO garden_state (key, value) VALUES (?, ?)').run(key, new Date().toISOString());
  if (!flag('backfilled')) { backfillXp(); set('backfilled'); }
  if (!flag('garden_fresh_start')) { freshStart(); set('garden_fresh_start'); }
}

// Kind streak: any XP on a day keeps it alive. Every 7 active days in a row earns
// a shield (max 2 banked); a missed day spends a shield instead of resetting.
export function computeGardenStreak(activeDays: Set<string>, today: string) {
  if (activeDays.size === 0) return { current: 0, best: 0, shields: 0 };
  const sorted = [...activeDays].sort();
  const d = new Date(sorted[0] + 'T12:00:00');
  let run = 0, best = 0, shields = 0, sinceShield = 0;
  for (let day = localDate(d); day <= today; d.setDate(d.getDate() + 1), day = localDate(d)) {
    if (activeDays.has(day)) {
      run++; sinceShield++;
      if (sinceShield === 7) { sinceShield = 0; shields = Math.min(2, shields + 1); }
      best = Math.max(best, run);
    } else if (day === today) {
      // Today isn't over yet.
    } else if (shields > 0) {
      shields--;
    } else {
      run = 0; sinceShield = 0;
    }
  }
  return { current: run, best, shields };
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  goal: number;
}

export function gardenSummary(userId: number) {
  const today = effectiveDate();

  const totals = db.prepare(
    'SELECT attribute, SUM(amount) as xp FROM xp_events WHERE user_id = ? GROUP BY attribute'
  ).all(userId) as { attribute: Attribute; xp: number }[];
  const attributes = ATTRIBUTES.map((a) => ({
    attribute: a,
    ...levelFor(totals.find((t) => t.attribute === a)?.xp ?? 0),
  }));
  const totalXp = attributes.reduce((s, a) => s + a.xp, 0);

  const daily = db.prepare(
    'SELECT day, SUM(amount) as xp FROM xp_events WHERE user_id = ? GROUP BY day ORDER BY day'
  ).all(userId) as { day: string; xp: number }[];
  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 364);
  const heatmap = daily.filter((d) => d.day >= localDate(yearAgo) && d.day <= today);
  const streak = computeGardenStreak(new Set(daily.map((d) => d.day)), today);
  const todayXp = daily.find((d) => d.day === today)?.xp ?? 0;

  const counts = Object.fromEntries((db.prepare(
    'SELECT source_type, COUNT(*) as c FROM xp_events WHERE user_id = ? GROUP BY source_type'
  ).all(userId) as any[]).map((r) => [r.source_type, r.c])) as Record<string, number>;

  const earlyCheckins = (db.prepare(
    "SELECT created_at FROM xp_events WHERE user_id = ? AND source_type = 'checkin' AND created_at LIKE '%T%'"
  ).all(userId) as any[]).filter((r) => new Date(r.created_at).getHours() < 8).length;

  // Best number of attributes touched within a single Monday-based week.
  const weekRows = db.prepare(`
    SELECT date(day, '-' || ((strftime('%w', day) + 6) % 7) || ' days') as wk, COUNT(DISTINCT attribute) as n
    FROM xp_events WHERE user_id = ? GROUP BY wk ORDER BY n DESC LIMIT 1
  `).get(userId) as any;
  const bestDay = daily.reduce((m, d) => Math.max(m, d.xp), 0);
  const maxLevel = Math.max(...attributes.map((a) => a.level));

  const achievements: Achievement[] = [
    { id: 'first-sprout', icon: '🌱', title: 'First Sprout', description: 'Earn your first XP', progress: Math.min(totalXp, 1), goal: 1 },
    { id: 'todo-100', icon: '✅', title: 'Getting Things Done', description: 'Complete 100 todos', progress: counts.todo ?? 0, goal: 100 },
    { id: 'todo-500', icon: '🏗️', title: 'Master Builder', description: 'Complete 500 todos', progress: counts.todo ?? 0, goal: 500 },
    { id: 'checkin-500', icon: '📅', title: 'Creature of Habit', description: 'Finish 500 check-ins', progress: counts.checkin ?? 0, goal: 500 },
    { id: 'checkin-1000', icon: '🗓️', title: 'Unshakeable', description: 'Finish 1,000 check-ins', progress: counts.checkin ?? 0, goal: 1000 },
    { id: 'review-100', icon: '🧠', title: 'Memory Palace', description: 'Complete 100 reviews', progress: counts.review ?? 0, goal: 100 },
    { id: 'plan-finisher', icon: '🏁', title: 'Plan Finisher', description: 'Complete a whole study plan', progress: counts.plan ?? 0, goal: 1 },
    { id: 'early-bird', icon: '🌅', title: 'Early Bird', description: 'Finish 5 check-ins before 8:00', progress: earlyCheckins, goal: 5 },
    { id: 'balanced-week', icon: '⚖️', title: 'Balanced Week', description: 'Earn XP in all four attributes in one week', progress: weekRows?.n ?? 0, goal: 4 },
    { id: 'streak-7', icon: '🔥', title: 'On Fire', description: 'Reach a 7-day garden streak', progress: streak.best, goal: 7 },
    { id: 'streak-30', icon: '🌳', title: 'Deep Roots', description: 'Reach a 30-day garden streak', progress: streak.best, goal: 30 },
    { id: 'big-day', icon: '⚡', title: 'Power Day', description: 'Earn 200 XP in a single day', progress: bestDay, goal: 200 },
    { id: 'level-10', icon: '👑', title: 'Double Digits', description: 'Reach level 10 in any attribute', progress: maxLevel, goal: 10 },
  ].map((a) => ({ ...a, progress: Math.min(a.progress, a.goal) }));

  return { attributes, totalXp, todayXp, streak, heatmap, achievements };
}
