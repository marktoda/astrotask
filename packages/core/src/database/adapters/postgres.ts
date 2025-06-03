/**
 * PostgreSQL database adapter
 */

import { type PostgresJsDatabase, drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createModuleLogger } from '../../utils/logger.js';
import * as schema from '../schema.js';
import type { DatabaseBackend, DbCapabilities, DatabaseClient } from './types.js';

const logger = createModuleLogger('PostgresAdapter');

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