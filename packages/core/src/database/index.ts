/**
 * Database initialization and factory functions
 *
 * This module provides database creation with support for both PGlite and PostgreSQL.
 * PGlite is used for local-only file-based databases, while PostgreSQL is used
 * for full PostgreSQL connection strings.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import { openDatabase } from './factory.js';
import type { LockOptions } from './lock.js';
import { DatabaseLockError } from './lock.js';
import { LockingStore } from './lockingStore.js';
import { DatabaseStore, type Store } from './store.js';
import { isFileBasedUrl, parseDbUrl } from './url-parser.js';

const logger = createModuleLogger('database');

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'migrations', 'drizzle');

export interface DatabaseOptions {
  /** Database file path or connection string */
  dataDir?: string;
  /** Verbose logging */
  verbose?: boolean;
  /** Enable cooperative locking (wraps store with LockingStore) */
  enableLocking?: boolean;
  /** Lock options (only used when enableLocking is true) */
  lockOptions?: LockOptions;
  /** Custom migrations directory (defaults to built-in migrations) */
  migrationsDir?: string;
}

/**
 * Create a database connection with automatic backend detection
 *
 * If dataDir is a PostgreSQL connection string, uses PostgreSQL.
 * Otherwise, uses PGLite for local file-based database.
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<Store> {
  const dataDir = options.dataDir ?? cfg.DATABASE_URI;
  const verbose = options.verbose ?? cfg.DB_VERBOSE;
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  try {
    // Parse URL once
    const parsed = parseDbUrl(dataDir);

    // Open database with the new factory
    const backend = await openDatabase(parsed, {
      migrationsDir,
      debug: verbose,
      ...(options.enableLocking !== undefined ? { useLocking: options.enableLocking } : {}),
    });

    // Create the store
    const baseStore = new DatabaseStore(backend.client, backend.drizzle, backend.type, false, false);

    // Determine if we should use locking
    // Server-based databases should NEVER use file-based locking as they handle concurrency natively
    const shouldUseLocking =
      isFileBasedUrl(parsed) && // Only use locking for file-based databases
      (options.enableLocking ?? true); // Default to true for file-based databases

    // Get the actual file path for locking (not the URL)
    const lockPath = shouldUseLocking
      ? parsed.kind === 'sqlite-file' || parsed.kind === 'pglite-file'
        ? parsed.file
        : parsed.kind === 'pglite-mem'
          ? `memory-${parsed.label}.db`
          : parsed.kind === 'pglite-idb'
            ? `idb-${parsed.label}.db`
            : dataDir
      : dataDir;

    // Wrap with locking if needed
    const store = shouldUseLocking
      ? new LockingStore(baseStore, lockPath, options.lockOptions)
      : baseStore;

    return store;
  } catch (error) {
    // Handle lock errors with user-friendly messages
    if (error instanceof DatabaseLockError) {
      const lockHolder = error.lockInfo
        ? `${error.lockInfo.process} (PID: ${error.lockInfo.pid})`
        : 'another process';

      const friendlyError = new Error(
        `Database is currently in use by ${lockHolder}. Please try again in a moment.`
      );
      // Preserve the original error for debugging
      (friendlyError as Error & { cause?: unknown }).cause = error;
      throw friendlyError;
    }

    throw error;
  }
}

/**
 * Create a local-only database (alias for createDatabase for backward compatibility)
 */
export async function createLocalDatabase(dataDir?: string): Promise<Store> {
  return createDatabase({
    dataDir: dataDir ?? cfg.DATABASE_URI,
  });
}

/**
 * Create a local-only database with cooperative locking enabled
 */
export async function createLockedDatabase(
  dataDir?: string,
  lockOptions?: LockOptions
): Promise<Store> {
  const dbOptions: DatabaseOptions = {
    dataDir: dataDir ?? cfg.DATABASE_URI,
    enableLocking: true,
  };

  if (lockOptions) {
    dbOptions.lockOptions = lockOptions;
  }

  return createDatabase(dbOptions);
}

/**
 * Create a database with locking enabled using process type detection
 */
export async function createDatabaseWithLocking(
  options: Omit<DatabaseOptions, 'enableLocking'> & {
    /** Process type for lock identification (auto-detected if not provided) */
    processType?: string;
  } = {}
): Promise<Store> {
  const { processType, ...dbOptions } = options;

  // Auto-detect process type if not provided
  const detectedProcessType =
    processType ??
    (process.env.NODE_ENV === 'test'
      ? 'test'
      : typeof process !== 'undefined' && process.title?.includes('node')
        ? 'cli'
        : 'unknown');

  const finalOptions: DatabaseOptions = {
    ...dbOptions,
    enableLocking: true,
    lockOptions: {
      processType: detectedProcessType,
      ...(options.lockOptions || {}),
    },
  };

  return createDatabase(finalOptions);
}

/**
 * Create a synced database (now just creates local database since sync is removed)
 * @deprecated Electric SQL sync has been removed. This now creates a local-only database.
 */
export async function createSyncedDatabase(
  dataDir?: string,
  _electricUrl?: string
): Promise<Store> {
  logger.warn('Electric SQL sync has been removed. Creating local-only database instead.');
  return createLocalDatabase(dataDir);
}

// Re-export types and utilities
export type { Store } from './store.js';
export { DatabaseStore } from './store.js';
export { LockingStore } from './lockingStore.js';
export { DatabaseLock, DatabaseLockError, withDatabaseLock } from './lock.js';
export type { LockOptions } from './lock.js';
export type { DatabaseBackend, DbCapabilities } from './adapters/index.js';
export { parseDbUrl, type DbUrl } from './url-parser.js';
export { openDatabase } from './factory.js';

// Migration runner exports
export {
  MigrationRunner,
  runMigrations,
  createMigrationRunner,
  type MigrationConfig,
  type MigrationResult,
} from './migrate.js';

export * from './schema.js';
