/**
 * PGLite database adapter
 */

import { PGlite } from '@electric-sql/pglite';
import { type PgliteDatabase, drizzle } from 'drizzle-orm/pglite';
import * as schema from '../schema.js';
import type { DatabaseBackend, DbCapabilities, DatabaseClient } from './types.js';

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