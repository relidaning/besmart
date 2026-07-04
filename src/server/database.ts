import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'besmart.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function addColIfMissing(table: string, col: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.find((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      is_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      verification_expires TEXT,
      password_reset_token TEXT,
      password_reset_expires TEXT,
      oauth_provider TEXT,
      oauth_id TEXT,
      display_name TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plan_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      planned_start TEXT NOT NULL,
      planned_end TEXT NOT NULL,
      actual_start TEXT,
      actual_end TEXT,
      is_completed INTEGER DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checkin_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('daily','weekly','monthly','seasonly','yearly')),
      score REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkin_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      schedule_name TEXT NOT NULL,
      task_date TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      is_timeout INTEGER DEFAULT 0,
      schedule_type TEXT NOT NULL,
      FOREIGN KEY (schedule_id) REFERENCES checkin_schedules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS review_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      studied_date TEXT NOT NULL,
      is_postponed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS review_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      is_reviewed INTEGER DEFAULT 0,
      reviewed_times INTEGER DEFAULT 0,
      planned_date TEXT NOT NULL,
      reviewed_date TEXT,
      FOREIGN KEY (course_id) REFERENCES review_courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      due_date TEXT,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      plan_id INTEGER,
      FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE SET NULL
    );
  `);

  const version = (db.prepare('SELECT COALESCE(MAX(version), 0) as v FROM schema_migrations').get() as any).v;

  // Migration 1: add user_id to pre-existing tables and create default admin user
  if (version < 1) {
    db.transaction(() => {
      db.prepare(
        `INSERT OR IGNORE INTO users (id, email, is_verified, display_name) VALUES (1, 'admin@besmart.local', 1, 'Admin')`
      ).run();

      addColIfMissing('study_plans', 'user_id', 'INTEGER');
      addColIfMissing('checkin_schedules', 'user_id', 'INTEGER');
      addColIfMissing('review_courses', 'user_id', 'INTEGER');
      addColIfMissing('todos', 'user_id', 'INTEGER');
      addColIfMissing('scores', 'user_id', 'INTEGER');

      db.exec(`
        UPDATE study_plans SET user_id = 1 WHERE user_id IS NULL;
        UPDATE checkin_schedules SET user_id = 1 WHERE user_id IS NULL;
        UPDATE review_courses SET user_id = 1 WHERE user_id IS NULL;
        UPDATE todos SET user_id = 1 WHERE user_id IS NULL;
        UPDATE scores SET user_id = 1 WHERE user_id IS NULL;
      `);

      db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
    })();
  }

  // Migration 4: auto-match vault fields
  if (version < 4) {
    db.transaction(() => {
      addColIfMissing('review_courses', 'vault_paths', 'TEXT');
      addColIfMissing('review_courses', 'vault_match_status', 'TEXT');
      db.prepare('INSERT INTO schema_migrations (version) VALUES (4)').run();
    })();
  }

  // Migration 5: per-user vault config
  if (version < 5) {
    db.transaction(() => {
      addColIfMissing('users', 'vault_root', 'TEXT');
      addColIfMissing('users', 'vault_name', 'TEXT');
      // Pre-configure the main user (id=2) with the server vault if env var is set
      const envVaultPath = process.env.VAULT_PATH;
      const envVaultName = process.env.VAULT_NAME;
      if (envVaultPath) {
        db.prepare('UPDATE users SET vault_root = ?, vault_name = ? WHERE id = 2 AND vault_root IS NULL')
          .run(envVaultPath, envVaultName || path.basename(envVaultPath));
      }
      db.prepare('INSERT INTO schema_migrations (version) VALUES (5)').run();
    })();
  }

  // Migration 6: push notification subscriptions
  if (version < 6) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (6)').run();
    })();
  }

  // Migration 3: vault path on courses, SM-2 fields on records
  if (version < 3) {
    db.transaction(() => {
      addColIfMissing('review_courses', 'vault_path', 'TEXT');
      addColIfMissing('review_records', 'ease_factor', 'REAL DEFAULT 2.5');
      addColIfMissing('review_records', 'interval_days', 'REAL DEFAULT 1');
      db.prepare('INSERT INTO schema_migrations (version) VALUES (3)').run();
    })();
  }

  // Migration 2: fix scores table to have per-user unique constraint
  if (version < 2) {
    db.transaction(() => {
      const hasScores = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='scores'"
      ).get();

      if (hasScores) {
        // Recreate with proper (score_date, user_id) unique constraint
        db.exec(`
          CREATE TABLE scores_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            score_date TEXT NOT NULL,
            score REAL DEFAULT 0,
            user_id INTEGER,
            UNIQUE(score_date, user_id)
          );
          INSERT OR IGNORE INTO scores_new (id, score_date, score, user_id)
            SELECT id, score_date, score, COALESCE(user_id, 1) FROM scores;
          DROP TABLE scores;
          ALTER TABLE scores_new RENAME TO scores;
        `);
      } else {
        db.exec(`
          CREATE TABLE scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            score_date TEXT NOT NULL,
            score REAL DEFAULT 0,
            user_id INTEGER,
            UNIQUE(score_date, user_id)
          );
        `);
      }

      db.prepare('INSERT INTO schema_migrations (version) VALUES (2)').run();
    })();
  }

  // Seed default schedules for admin user if none exist
  const adminScheduleCount = (db.prepare(
    'SELECT COUNT(*) as c FROM checkin_schedules WHERE user_id = 1'
  ).get() as any).c;

  if (adminScheduleCount === 0) {
    createDefaultSchedules(1);
  }
}

export function createDefaultSchedules(userId: number) {
  const insert = db.prepare(
    'INSERT INTO checkin_schedules (name, type, score, user_id) VALUES (?, ?, ?, ?)'
  );
  const defaults: [string, string, number][] = [
    ['Morning routine', 'daily', 10],
    ['Study session', 'daily', 15],
    ['Exercise', 'daily', 10],
    ['Reading', 'daily', 10],
    ['Weekly review', 'weekly', 20],
    ['Deep work session', 'weekly', 25],
    ['Monthly reflection', 'monthly', 30],
  ];
  for (const [name, type, score] of defaults) {
    insert.run(name, type, score, userId);
  }
}

export default db;
