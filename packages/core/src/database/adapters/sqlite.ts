/**
 * SQLite database adapter
 */

import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { createModuleLogger } from '../../utils/logger.js';
import { sqliteSchema } from '../schema.js';
import type { DatabaseBackend, DbCapabilities } from './types.js';

const logger = createModuleLogger('SqliteAdapter');

/**
 * SQLite backend adapter with WAL mode for better concurrency
 */
export class SqliteAdapter implements DatabaseBackend<BetterSQLite3Database<typeof sqliteSchema>> {
  public readonly type = 'sqlite' as const;
  public readonly capabilities: DbCapabilities = {
    concurrentWrites: true, // WAL mode allows multiple readers + 1 writer, handles concurrency natively
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
      verbose: this.config.debug
        ? (message?: unknown, ...additionalArgs: unknown[]) =>
            logger.debug('SQLite SQL:', { message, additionalArgs })
        : undefined,
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

  async migrate(migrationsDir: string): Promise<void> {
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    await migrate(this.drizzle, { migrationsFolder: migrationsDir });
  }

  async close(): Promise<void> {
    this.sqlite.close();
  }
}
