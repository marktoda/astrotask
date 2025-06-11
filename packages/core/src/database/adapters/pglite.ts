/**
 * PGLite database adapter
 */

import { PGlite } from '@electric-sql/pglite';
import { type PgliteDatabase, drizzle } from 'drizzle-orm/pglite';
import { pgliteSchema } from '../schema.js';
import type { DatabaseBackend, DbCapabilities } from './types.js';

/**
 * PGLite backend adapter
 */
export class PgLiteAdapter implements DatabaseBackend<PgliteDatabase<typeof pgliteSchema>> {
  public readonly type = 'pglite' as const;
  public readonly capabilities: DbCapabilities = {
    concurrentWrites: false,
    listenNotify: false,
    extensions: new Set(),
  };

  private pglite!: PGlite;
  public drizzle!: PgliteDatabase<typeof pgliteSchema>;

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
    this.drizzle = drizzle(this.pglite, { schema: pgliteSchema });
  }

  get rawClient(): PGlite {
    return this.pglite;
  }

  async migrate(migrationsDir: string): Promise<void> {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(this.drizzle, { migrationsFolder: migrationsDir });
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}
