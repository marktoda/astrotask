/**
 * Database backend adapters for PGLite and PostgreSQL
 *
 * Provides a clean abstraction over different database backends while
 * maintaining type safety and shared behavior.
 */

import { PGlite } from '@electric-sql/pglite';
import { type PgliteDatabase, drizzle } from 'drizzle-orm/pglite';
import { type PostgresJsDatabase, drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DatabaseClient } from '../types/database.js';
import { createModuleLogger } from '../utils/logger.js';
import * as schema from './schema.js';

const logger = createModuleLogger('DatabaseAdapter');

/**
 * Database capabilities that vary between backends
 */
export interface DbCapabilities {
  concurrentWrites: boolean;
  listenNotify: boolean;
  extensions: Set<string>;
}

/**
 * Common interface for database backends
 */
export interface DatabaseBackend {
  /** Drizzle ORM instance */
  readonly drizzle: PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

  /** Raw client for escape hatch operations */
  readonly rawClient: unknown;

  /** Backend capabilities */
  readonly capabilities: DbCapabilities;

  /** Backend type for logging/debugging */
  readonly type: 'pglite' | 'postgres';

  /** PGLite-compatible client interface for backward compatibility */
  readonly client: DatabaseClient;

  /** Initialize the backend connection */
  init(): Promise<void>;

  /** Run database migrations */
  migrate(migrationsDir: string): Promise<void>;

  /** Close the database connection */
  close(): Promise<void>;
}

/**
 * PGLite backend adapter
 */
export class PgLiteAdapter implements DatabaseBackend {
  public readonly type = 'pglite' as const;
  public readonly capabilities: DbCapabilities = {
    concurrentWrites: false,
    listenNotify: false,
    extensions: new Set(),
  };

  private pglite!: PGlite;
  public drizzle!: PgliteDatabase<typeof schema>;

  constructor(
    private readonly config: {
      dataDir?: string;
      debug: boolean;
    }
  ) {}

  async init(): Promise<void> {
    this.pglite = await PGlite.create({
      dataDir: this.config.dataDir ?? 'memory://',
      debug: this.config.debug ? 1 : 0,
    });
    this.drizzle = drizzle(this.pglite, { schema });
  }

  get rawClient(): PGlite {
    return this.pglite;
  }

  get client(): DatabaseClient {
    return {
      query: async (sql, params) => {
        return await this.pglite.query(sql, params);
      },
      close: async () => {
        await this.close();
      },
      ...(this.config.dataDir ? { dataDir: this.config.dataDir } : {}),
    };
  }

  async migrate(migrationsDir: string): Promise<void> {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(this.drizzle, { migrationsFolder: migrationsDir });
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}

/**
 * PostgreSQL backend adapter
 */
export class PostgresAdapter implements DatabaseBackend {
  public readonly type = 'postgres' as const;
  public readonly capabilities: DbCapabilities = {
    concurrentWrites: true,
    listenNotify: true,
    extensions: new Set(['pg_trgm', 'uuid-ossp', 'pgcrypto']),
  };

  private sql!: postgres.Sql;
  public drizzle!: PostgresJsDatabase<typeof schema>;

  constructor(
    private readonly url: URL,
    private readonly debug: boolean
  ) {}

  async init(): Promise<void> {
    this.sql = postgres(this.url.toString(), {
      debug: this.debug,
      max: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      // Suppress NOTICE messages to reduce noise
      onnotice: () => {}, // Suppress notices like "schema already exists"
    });

    // Handle connection errors
    this.sql.listen('error', (error) => {
      logger.error({ error }, 'PostgreSQL connection error');
    });

    this.drizzle = drizzlePostgres(this.sql, { schema });
  }

  get rawClient(): postgres.Sql {
    return this.sql;
  }

  get client(): DatabaseClient {
    return {
      query: async (sql, params) => {
        const result = await this.sql.unsafe(sql, params);
        return { rows: result };
      },
      close: async () => {
        await this.close();
      },
    };
  }

  async migrate(migrationsDir: string): Promise<void> {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(this.drizzle, { migrationsFolder: migrationsDir });
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
