/**
 * SQLite database adapter
 */

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { createModuleLogger } from '../../utils/logger.js';
import * as sqliteSchema from '../schema-sqlite.js';
import type { DatabaseBackend, DatabaseClient, DbCapabilities } from './types.js';

const logger = createModuleLogger('SqliteAdapter');

/**
 * SQLite backend adapter with WAL mode for better concurrency
 */
export class SqliteAdapter implements DatabaseBackend<BetterSQLite3Database<typeof sqliteSchema>> {
  public readonly type = 'sqlite' as const;
  public readonly capabilities: DbCapabilities = {
    concurrentWrites: false, // WAL mode allows multiple readers + 1 writer
    listenNotify: false,
    extensions: new Set(),
  };

  private sqlite!: Database.Database;
  public drizzle!: BetterSQLite3Database<typeof sqliteSchema>;

  constructor(
    private readonly config: {
      dataDir: string;
      debug: boolean;
    }
  ) {}

  async init(): Promise<void> {
    this.sqlite = new Database(this.config.dataDir, {
      verbose: this.config.debug ? (message?: unknown, ...additionalArgs: unknown[]) => 
        logger.debug('SQLite SQL:', { message, additionalArgs }) : undefined,
    });

    // Enable WAL mode for better concurrency (multiple readers + 1 writer)
    this.sqlite.pragma('journal_mode = WAL');
    // NORMAL sync is safer than OFF but much faster than FULL
    this.sqlite.pragma('synchronous = NORMAL');
    // Increased timeout for better handling of write contention
    this.sqlite.pragma('busy_timeout = 20000'); // 20 seconds
    // Larger cache for better performance
    this.sqlite.pragma('cache_size = -64000'); // 64MB cache
    // Optimize checkpoint behavior
    this.sqlite.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages

    this.drizzle = drizzleSqlite(this.sqlite, { schema: sqliteSchema });
  }

  get rawClient(): Database.Database {
    return this.sqlite;
  }

  get client(): DatabaseClient {
    return {
      query: async (sql, params) => {
        try {
          const stmt = this.sqlite.prepare(sql);
          const rows = params ? stmt.all(...params) : stmt.all();
          // biome-ignore lint/suspicious/noExplicitAny: Better-sqlite3 returns unknown rows that need type assertion
          return { rows: rows as any[] };
        } catch (error) {
          logger.error({ error, sql, params }, 'SQLite query error');
          throw error;
        }
      },
      close: async () => {
        await this.close();
      },
      dataDir: this.config.dataDir,
    };
  }

  async migrate(_migrationsDir: string): Promise<void> {
    // For SQLite, we'll use schema sync instead of migrations
    // This is more reliable than complex migration files
    try {
      // Try to create tables if they don't exist
      await this.ensureTablesExist();
    } catch (error) {
      logger.error({ error }, 'Failed to ensure SQLite tables exist');
      throw error;
    }
  }

  /**
   * Ensure all required tables exist in the SQLite database
   */
  private async ensureTablesExist(): Promise<void> {
    const tables = [
      {
        name: 'context_slices',
        sql: `CREATE TABLE IF NOT EXISTS "context_slices" (
          "id" text PRIMARY KEY NOT NULL,
          "title" text NOT NULL,
          "description" text,
          "task_id" text,
          "context_digest" text,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL
        )`,
      },
      {
        name: 'task_dependencies',
        sql: `CREATE TABLE IF NOT EXISTS "task_dependencies" (
          "id" text PRIMARY KEY NOT NULL,
          "dependent_task_id" text NOT NULL,
          "dependency_task_id" text NOT NULL,
          "created_at" integer NOT NULL,
          CONSTRAINT "unique_dependency" UNIQUE("dependent_task_id","dependency_task_id"),
          CONSTRAINT "no_self_dependency" CHECK ("task_dependencies"."dependent_task_id" != "task_dependencies"."dependency_task_id")
        )`,
      },
      {
        name: 'tasks',
        sql: `CREATE TABLE IF NOT EXISTS "tasks" (
          "id" text PRIMARY KEY NOT NULL,
          "parent_id" text,
          "title" text NOT NULL,
          "description" text,
          "status" text DEFAULT 'pending' NOT NULL,
          "priority" text DEFAULT 'medium' NOT NULL,
          "prd" text,
          "context_digest" text,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          CONSTRAINT "status_check" CHECK ("tasks"."status" IN ('pending', 'in-progress', 'done', 'cancelled', 'archived')),
          CONSTRAINT "priority_check" CHECK ("tasks"."priority" IN ('low', 'medium', 'high'))
        )`,
      },
    ];

    const indexes = [
      'CREATE INDEX IF NOT EXISTS "idx_context_slices_task_id" ON "context_slices" ("task_id")',
      'CREATE INDEX IF NOT EXISTS "idx_task_dependencies_dependent" ON "task_dependencies" ("dependent_task_id")',
      'CREATE INDEX IF NOT EXISTS "idx_task_dependencies_dependency" ON "task_dependencies" ("dependency_task_id")',
      'CREATE INDEX IF NOT EXISTS "idx_tasks_parent_id" ON "tasks" ("parent_id")',
      'CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks" ("status")',
    ];

    // Create tables
    for (const table of tables) {
      this.sqlite.exec(table.sql);
      logger.debug(`Ensured table ${table.name} exists`);
    }

    // Create indexes
    for (const indexSql of indexes) {
      this.sqlite.exec(indexSql);
    }

    logger.debug('All SQLite tables and indexes ensured');
  }

  async close(): Promise<void> {
    if (this.sqlite) {
      this.sqlite.close();
    }
  }
}
