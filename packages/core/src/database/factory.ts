/**
 * Database factory using the adapter pattern
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import { createModuleLogger } from '../utils/logger.js';
import type { DatabaseBackend } from './adapters/index.js';
import { PgLiteAdapter, PostgresAdapter, SqliteAdapter, needsExternalLocking } from './adapters/index.js';
import { withDatabaseLock } from './lock.js';
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
 * Get the appropriate lock path for a database URL
 */
function getLockPath(parsed: DbUrl): string {
  switch (parsed.kind) {
    case 'pglite-file':
    case 'sqlite-file':
      return parsed.file;
    case 'pglite-mem':
    case 'pglite-idb':
      return `memory://${parsed.label}`;
    default:
      return 'memory://default-lock';
  }
}

/**
 * Ensure PROJECT_ROOT task exists with proper conflict handling
 */
async function ensureProjectRoot(backend: DatabaseBackend): Promise<void> {
  try {
    // First check if it exists using raw SQL to avoid type union issues
    const existingRoot = await backend.client.query(
      'SELECT id FROM tasks WHERE id = $1 LIMIT 1',
      [TASK_IDENTIFIERS.PROJECT_ROOT]
    );

    if (existingRoot.rows.length === 0) {
      // Use raw SQL with ON CONFLICT to handle race conditions
      await backend.client.query(
        `INSERT INTO tasks (id, title, description, status, priority, parent_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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

      case 'sqlite-file':
        ensureDataDir(parsed.file);
        return new SqliteAdapter({
          dataDir: parsed.file,
          debug: options.debug ?? false,
        });
    }
  })();

  try {
    // Initialize the backend
    await backend.init();

    // Run migrations with locking for file-based databases
    if (needsExternalLocking(backend) && options.useLocking !== false) {
      // Use lock for migrations in file-based databases to prevent races
      const lockPath = getLockPath(parsed);
      await withDatabaseLock(lockPath, { processType: 'migration' }, async () => {
        await backend.migrate(options.migrationsDir);
      });
    } else {
      // Server-based databases handle concurrent migrations internally
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
