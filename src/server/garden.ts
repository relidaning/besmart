import db from './database.js';
import { localDate, effectiveDate } from './date.js';
import {
  SPECIES, ACHIEVEMENT_TREES, MILESTONE_EVERY, MILESTONE_SPECIES, GROWTH, NO_PLANT_PREFIXES, STARTER_TREES, TREES,
  commonSpeciesFor, nextUnlock, familyForNote, isTree,
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
  /** What this completion did in the garden ("watered 3 plants", "Lilac grew"). */
  garden?: string;
  /** A common species this level-up unlocked. */
  unlocked?: string;
  /** A tree species this level-up unlocked (the attribute's grand tree at Lv 5). */
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
  const award: XpAward = { attribute, amount, crit };
  // Reviews grow their note's plant (reviews.ts); plan tasks and plans grow the
  // plan's tree; check-ins and todos water the note plants.
  if (sourceType === 'plan_task') {
    award.garden = growTreeFromTask(userId, Number(sourceId)) ?? undefined;
  } else if (sourceType === 'plan') {
    award.garden = finishTree(userId, Number(sourceId)) ?? undefined;
  } else if (sourceType !== 'review') {
    const watered = waterGarden(userId, sourceType, Number(sourceId));
    if (watered) award.garden = `watered ${watered} plant${watered > 1 ? 's' : ''}`;
  }
  if (after > before) {
    award.levelUp = after;
    if (attribute === 'wisdom' && commonSpeciesFor('wisdom', after) !== commonSpeciesFor('wisdom', before)) {
      award.unlocked = 'better plants';
    }
    if (before < MILESTONE_EVERY && after >= MILESTONE_EVERY) {
      award.seed = `${SPECIES[MILESTONE_SPECIES[attribute]].name} tree unlocked`;
    }
  }
  return award;
}

export function revokeXp(sourceType: SourceType, sourceId: number | string) {
  db.prepare('DELETE FROM xp_events WHERE source_type = ? AND source_id = ?').run(sourceType, Number(sourceId));
  // Un-completing takes back what it did in the garden (water, tree growth).
  db.prepare("DELETE FROM garden_events WHERE kind IN ('water', 'task', 'plan') AND source_type = ? AND source_id = ?").run(sourceType, Number(sourceId));
}

// ── Plants ──────────────────────────────────────────────────────────────────
// Flowers and shrubs are vault notes: planted when the note becomes a review
// course (or, for notes older than the garden, at its first review), watered by
// finished check-ins and todos, grown by reviewing the note; their growth is the
// sum of their garden_events. Trees are study plans: planted when the plan is
// created (older plans: at their next finished task), their growth is the share
// of the plan's tasks that are done. garden_events is also the journal.

type EventKind = 'plant' | 'water' | 'review' | 'task' | 'plan';

function logEvent(
  userId: number, plantId: number | null, kind: EventKind, amount: number,
  sourceType: string | null, sourceId: number | null, label: string,
) {
  db.prepare(`
    INSERT INTO garden_events (user_id, plant_id, kind, amount, source_type, source_id, label, day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, plantId, kind, Math.round(amount * 10) / 10, sourceType, sourceId, label.slice(0, 240), effectiveDate(), new Date().toISOString());
}

function insertPlant(userId: number, species: string, attribute: Attribute | null, sourceType: string, sourceId: number, label: string) {
  const r = db.prepare(`
    INSERT OR IGNORE INTO garden_plants (user_id, species, attribute, source_type, source_id, label, crit, day, planted_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(userId, species, attribute, sourceType, sourceId, label, effectiveDate(), new Date().toISOString());
  return r.changes ? Number(r.lastInsertRowid) : null;
}

function plantBySource(sourceType: 'note' | 'plan', id: number) {
  return db.prepare('SELECT id, species FROM garden_plants WHERE source_type = ? AND source_id = ?').get(sourceType, id) as
    { id: number; species: string } | undefined;
}

/** Plant a sapling for a review course's note. Returns the plant, or null for machine-written notes. */
export function plantForCourse(userId: number, courseId: number, why: 'created' | 'first-review') {
  const existing = plantBySource('note', courseId);
  if (existing) return existing;
  const course = db.prepare('SELECT name, vault_path, vault_paths FROM review_courses WHERE id = ? AND user_id = ?')
    .get(courseId, userId) as any;
  if (!course) return null;
  let path: string | null = course.vault_path;
  if (!path && course.vault_paths) { try { path = JSON.parse(course.vault_paths)[0] ?? null; } catch { /* malformed */ } }
  if (path && NO_PLANT_PREFIXES.some((pre) => path!.startsWith(pre))) return null;

  const family = familyForNote(path);
  const species = commonSpeciesFor(family, levelFor(attributeTotal(userId, 'wisdom')).level);
  const id = insertPlant(userId, species, family, 'note', courseId, course.name);
  if (id === null) return plantBySource('note', courseId) ?? null;
  logEvent(userId, id, 'plant', 0, 'course', courseId,
    why === 'created' ? `New note "${course.name}" planted a ${SPECIES[species].name}` : `First review of "${course.name}" planted a ${SPECIES[species].name}`);
  return { id, species };
}

/** Reviewing a note grows its plant. Returns e.g. "Lilac grew +25". */
export function growFromReview(userId: number, courseId: number, recordId: number, rating: string): string | null {
  const plant = plantForCourse(userId, courseId, 'first-review');
  if (!plant) return null;
  const amount = GROWTH.review[rating] ?? GROWTH.review.ok;
  const name = (db.prepare('SELECT name FROM review_courses WHERE id = ?').get(courseId) as any)?.name ?? 'a note';
  const word = { again: 'Forgot', hard: 'Hard', ok: 'Good', easy: 'Easy' }[rating] ?? 'Good';
  logEvent(userId, plant.id, 'review', amount, 'review', recordId, `Reviewed "${name}" (${word})`);
  return `${SPECIES[plant.species].name} grew +${amount}`;
}

// Water the note plants that have gone longest without water (still growing ones first).
function waterGarden(userId: number, sourceType: string, sourceId: number): number {
  const plants = db.prepare(`
    SELECT p.id,
      COALESCE((SELECT SUM(amount) FROM garden_events e WHERE e.plant_id = p.id), 0) AS growth,
      (SELECT MAX(created_at) FROM garden_events e WHERE e.plant_id = p.id AND e.kind = 'water') AS watered
    FROM garden_plants p WHERE p.user_id = ? AND p.source_type = 'note'
  `).all(userId) as any[];
  const chosen = plants
    .map((p) => ({ ...p, done: p.growth >= GROWTH.full }))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.watered ?? '').localeCompare(b.watered ?? '') || Math.random() - 0.5)
    .slice(0, GROWTH.waterPlants);
  const what = sourceLabel(sourceType, sourceId);
  const via = { checkin: 'Check-in', todo: 'Todo' }[sourceType] ?? sourceType;
  for (const p of chosen) {
    logEvent(userId, p.id, 'water', GROWTH.water, sourceType, sourceId, `${via} "${what ?? '…'}" watered it`);
  }
  return chosen.length;
}

// What watered it, for the journal.
function sourceLabel(sourceType: string, id: number): string | null {
  const q: Record<string, string> = {
    checkin: 'SELECT s.name AS l FROM checkin_tasks t JOIN checkin_schedules s ON s.id = t.schedule_id WHERE t.id = ?',
    todo: 'SELECT title AS l FROM todos WHERE id = ?',
  };
  if (!q[sourceType]) return null;
  return ((db.prepare(q[sourceType]).get(id) as any)?.l as string | undefined)?.slice(0, 120) ?? null;
}

// ── Trees (study plans) ─────────────────────────────────────────────────────

/** Tree species you can plant: the starters plus those your achievements and levels unlocked. */
export function unlockedTrees(userId: number): string[] {
  const summary = gardenSummary(userId);
  const set = new Set(STARTER_TREES);
  for (const a of summary.achievements) if (a.progress >= a.goal && ACHIEVEMENT_TREES[a.id]) set.add(ACHIEVEMENT_TREES[a.id]);
  for (const a of summary.attributes) if (a.level >= MILESTONE_EVERY) set.add(MILESTONE_SPECIES[a.attribute]);
  return TREES.filter((t) => set.has(t));
}

function planProgress(planId: number) {
  const r = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM plan_tasks t WHERE t.plan_id = ? AND NOT EXISTS (SELECT 1 FROM plan_tasks c WHERE c.parent_task_id = t.id)) AS total,
      (SELECT COUNT(*) FROM plan_tasks t WHERE t.plan_id = ? AND t.is_completed = 1 AND NOT EXISTS (SELECT 1 FROM plan_tasks c WHERE c.parent_task_id = t.id)) AS done,
      (SELECT is_completed FROM study_plans WHERE id = ?) AS finished
  `).get(planId, planId, planId) as any;
  return { total: r.total as number, done: r.done as number, finished: Boolean(r.finished) };
}

/** Plant a study plan's tree (the requested species if unlocked, else a starter). */
export function plantTreeForPlan(userId: number, planId: number, species: string | null, why: 'created' | 'first-task') {
  const existing = plantBySource('plan', planId);
  if (existing) return existing;
  const plan = db.prepare('SELECT name FROM study_plans WHERE id = ? AND user_id = ?').get(planId, userId) as any;
  if (!plan) return null;
  const choice = species && isTree(species) && unlockedTrees(userId).includes(species)
    ? species : STARTER_TREES[planId % STARTER_TREES.length];
  const id = insertPlant(userId, choice, null, 'plan', planId, plan.name);
  if (id === null) return plantBySource('plan', planId) ?? null;
  logEvent(userId, id, 'plant', 0, 'plan', planId,
    why === 'created' ? `New study plan "${plan.name}" planted a ${SPECIES[choice].name}` : `"${plan.name}" planted its ${SPECIES[choice].name}`);
  return { id, species: choice };
}

function growTreeFromTask(userId: number, taskId: number): string | null {
  const task = db.prepare('SELECT plan_id, name FROM plan_tasks WHERE id = ?').get(taskId) as any;
  if (!task) return null;
  const tree = plantTreeForPlan(userId, task.plan_id, null, 'first-task');
  if (!tree) return null;
  const p = planProgress(task.plan_id);
  logEvent(userId, tree.id, 'task', p.total ? GROWTH.full / p.total : 0, 'plan_task', taskId,
    `Finished "${task.name}" (${p.done}/${p.total} tasks)`);
  return `${SPECIES[tree.species].name} grew · ${p.done}/${p.total}`;
}

function finishTree(userId: number, planId: number): string | null {
  const tree = plantTreeForPlan(userId, planId, null, 'first-task');
  if (!tree) return null;
  const name = (db.prepare('SELECT name FROM study_plans WHERE id = ?').get(planId) as any)?.name ?? 'the plan';
  logEvent(userId, tree.id, 'plan', 0, 'plan', planId, `Finished "${name}": the ${SPECIES[tree.species].name} is fully grown`);
  return `${SPECIES[tree.species].name} is fully grown`;
}

/** A deleted review course (or a note deleted from the vault) takes its plant with it. */
export function removePlantForCourse(courseId: number) {
  const plant = plantBySource('note', courseId);
  if (!plant) return;
  db.prepare('DELETE FROM garden_events WHERE plant_id = ?').run(plant.id);
  db.prepare('DELETE FROM garden_plants WHERE id = ?').run(plant.id);
}

/** A deleted plan takes its tree with it. */
export function removeTreeForPlan(planId: number) {
  const tree = plantBySource('plan', planId);
  if (!tree) return;
  db.prepare('DELETE FROM garden_events WHERE plant_id = ?').run(tree.id);
  db.prepare('DELETE FROM garden_plants WHERE id = ?').run(tree.id);
}

export function gardenPlants(userId: number) {
  const summary = gardenSummary(userId);
  const rows = db.prepare(`
    SELECT p.id, p.species, p.attribute, p.source_type, p.source_id, p.label, p.crit, p.day, p.planted_at,
      COALESCE((SELECT SUM(amount) FROM garden_events e WHERE e.plant_id = p.id), 0) AS growth,
      (SELECT COUNT(*) FROM garden_events e WHERE e.plant_id = p.id AND e.kind = 'review') AS reviews,
      (SELECT COUNT(*) FROM garden_events e WHERE e.plant_id = p.id AND e.kind = 'water') AS waterings
    FROM garden_plants p WHERE p.user_id = ? ORDER BY p.planted_at, p.id
  `).all(userId) as any[];
  const plants = rows.map((p) => {
    if (p.source_type !== 'plan') return { ...p, crit: Boolean(p.crit), target: GROWTH.full };
    const pr = planProgress(p.source_id);
    const growth = pr.finished ? GROWTH.full : pr.total ? (GROWTH.full * pr.done) / pr.total : 0;
    return { ...p, crit: Boolean(p.crit), target: GROWTH.full, growth, tasks_done: pr.done, tasks_total: pr.total, finished: pr.finished };
  });
  const wisdom = summary.attributes.find((a) => a.attribute === 'wisdom')!.level;
  return {
    plants,
    unlockedTrees: unlockedTrees(userId),
    wisdomLevel: wisdom,
    ladder: (['wisdom', 'capability', 'wealth', 'health'] as Attribute[]).map((family) => ({
      attribute: family,
      level: wisdom,
      current: commonSpeciesFor(family, wisdom),
      next: nextUnlock(family, wisdom),
    })),
    today: effectiveDate(),
  };
}

export function gardenEvents(userId: number, opts: { before?: number; plantId?: number; limit?: number }) {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 40));
  return db.prepare(`
    SELECT e.id, e.plant_id, e.kind, e.amount, e.label, e.day, e.created_at, p.species
    FROM garden_events e LEFT JOIN garden_plants p ON p.id = e.plant_id
    WHERE e.user_id = ? AND (? IS NULL OR e.id < ?) AND (? IS NULL OR e.plant_id = ?)
    ORDER BY e.id DESC LIMIT ?
  `).all(userId, opts.before ?? null, opts.before ?? null, opts.plantId ?? null, opts.plantId ?? null, limit) as any[];
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
