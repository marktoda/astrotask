/**
 * SQLite database adapter
 */

import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { sqliteSchema } from '../schema.js';
import type { DatabaseBackend, DbCapabilities } from './types.js';

// The adapter now relies on libSQL (`@libsql/client`) which works both for local file databases
// (using the `file:` URL scheme) and for remote Turso databases. We pass the libSQL client to
// Drizzle's `libsql` driver.
export class SqliteAdapter implements DatabaseBackend {
  public readonly type = 'sqlite' as const;
  public readonly capabilities: DbCapabilities = {
    concurrentWrites: true, // WAL mode allows multiple readers + 1 writer, handles concurrency natively
    listenNotify: false,
    extensions: new Set(),
  };

  private client!: Client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public drizzle!: any;

  constructor(
    private readonly config: {
      dataDir: string;
      debug: boolean;
    }
  ) {}

  async init(): Promise<void> {
    const connectionUrl = `file:${this.config.dataDir}`;

    this.client = createClient({ url: connectionUrl });

    // Drizzle's libsql driver is async-capable, but still exposes familiar methods.
    this.drizzle = drizzleLibsql(this.client, { schema: sqliteSchema });
  }

  get rawClient(): Client {
    return this.client;
  }

  async migrate(migrationsDir: string): Promise<void> {
    const { migrate } = await import('drizzle-orm/libsql/migrator');
    await migrate(this.drizzle, { migrationsFolder: migrationsDir });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
