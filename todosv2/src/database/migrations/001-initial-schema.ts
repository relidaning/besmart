import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "email" varchar(100) NOT NULL UNIQUE,
        "username" varchar(100) NOT NULL,
        "password" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Categories table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categories" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "name" varchar(120) NOT NULL,
        "color" varchar(7) NOT NULL DEFAULT '#3B82F6',
        "icon" varchar(255),
        "isActive" boolean NOT NULL DEFAULT (1),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "userId" integer NOT NULL,
        FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);

    // Todos table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "todos" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "priority" varchar(10) CHECK(priority IN ('low', 'medium', 'high')) NOT NULL DEFAULT 'medium',
        "dueDate" date,
        "completedAt" datetime,
        "isCompleted" boolean NOT NULL DEFAULT (0),
        "postponedCount" integer NOT NULL DEFAULT (0),
        "estimatedMinutes" integer NOT NULL DEFAULT (0),
        "tags" text,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        "userId" integer NOT NULL,
        "categoryId" integer,
        FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
        FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_todos_userId" ON "todos" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_todos_categoryId" ON "todos" ("categoryId")`);
    await queryRunner.query(`CREATE INDEX "IDX_todos_isCompleted" ON "todos" ("isCompleted")`);
    await queryRunner.query(`CREATE INDEX "IDX_todos_priority" ON "todos" ("priority")`);
    await queryRunner.query(`CREATE INDEX "IDX_categories_userId" ON "categories" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_categories_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_todos_priority"`);
    await queryRunner.query(`DROP INDEX "IDX_todos_isCompleted"`);
    await queryRunner.query(`DROP INDEX "IDX_todos_categoryId"`);
    await queryRunner.query(`DROP INDEX "IDX_todos_userId"`);
    await queryRunner.query(`DROP TABLE "todos"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}