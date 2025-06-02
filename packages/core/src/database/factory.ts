/**
 * Database factory using the adapter pattern
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import { createModuleLogger } from '../utils/logger.js';
import type { DatabaseBackend } from './adapters.js';
import { PgLiteAdapter, PostgresAdapter } from './adapters.js';
import { withDatabaseLock } from './lock.js';
import * as schema from './schema.js';
import type { DbUrl } from './url-parser.js';

const logger = createModuleLogger('DatabaseFactory');

export interface OpenDatabaseOptions {
  migrationsDir: string;
  debug?: boolean;
  useLocking?: boolean;
}

/**
 * Ensure data directory exists for file-based databases
 */
function ensureDataDir(file: string): void {
  try {
    const dir = dirname(file);
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    logger.warn({ error, file }, 'Failed to create data directory');
  }
}

/**
 * Ensure PROJECT_ROOT task exists with proper conflict handling
 */
async function ensureProjectRoot(backend: DatabaseBackend): Promise<void> {
  try {
    // First check if it exists
    const existingRoot = await backend.drizzle
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT))
      .limit(1);

    if (existingRoot.length === 0) {
      // Use raw SQL with ON CONFLICT to handle race conditions
      await backend.client.query(
        `INSERT INTO tasks (id, title, description, status, priority, parent_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          TASK_IDENTIFIERS.PROJECT_ROOT,
          'Project Root',
          'Root container for all project tasks',
          'done',
          'low',
          null,
        ]
      );

      logger.info('Created PROJECT_ROOT task');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to ensure PROJECT_ROOT task exists');
  }
}

/**
 * Open a database connection with automatic backend detection
 */
export async function openDatabase(
  parsed: DbUrl,
  options: OpenDatabaseOptions
): Promise<DatabaseBackend> {
  // Create appropriate adapter based on URL type
  const backend: DatabaseBackend = (() => {
    switch (parsed.kind) {
      case 'postgres':
        return new PostgresAdapter(parsed.url, options.debug ?? false);

      case 'pglite-file':
        ensureDataDir(parsed.file);
        return new PgLiteAdapter({
          dataDir: parsed.file,
          debug: options.debug ?? false,
        });

      case 'pglite-mem':
        return new PgLiteAdapter({
          dataDir: `memory://${parsed.label}`,
          debug: options.debug ?? false,
        });

      case 'pglite-idb':
        return new PgLiteAdapter({
          dataDir: `idb://${parsed.label}`,
          debug: options.debug ?? false,
        });
    }
  })();

  try {
    // Initialize the backend
    await backend.init();

    // Run migrations with locking for PGLite
    if (backend.type === 'pglite' && options.useLocking !== false) {
      // Use lock for migrations in PGLite to prevent races
      const lockPath = parsed.kind === 'pglite-file' ? parsed.file : 'memory://lock';
      await withDatabaseLock(lockPath, { processType: 'migration' }, async () => {
        await backend.migrate(options.migrationsDir);
      });
    } else {
      // PostgreSQL handles concurrent migrations internally
      await backend.migrate(options.migrationsDir);
    }

    // Ensure PROJECT_ROOT task exists
    await ensureProjectRoot(backend);

    logger.debug(
      {
        backend: backend.type,
        capabilities: {
          concurrentWrites: backend.capabilities.concurrentWrites,
          listenNotify: backend.capabilities.listenNotify,
          extensions: Array.from(backend.capabilities.extensions),
        },
      },
      'Database opened successfully'
    );

    return backend;
  } catch (error) {
    // Clean up on error
    await backend.close().catch(() => {});
    throw error;
  }
}
