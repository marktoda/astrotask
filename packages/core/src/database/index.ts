/**
 * Database initialization and factory functions
 *
 * This module provides database creation with support for PostgreSQL, PGLite, and SQLite.
 * Simplified factory pattern with direct adapter creation and minimal abstraction layers.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import { AdapterHelpers, createAdapter } from './adapters/index.js';
import { initializeDatabase } from './initialization.js';
import type { LockOptions } from './lock.js';
import { DatabaseLockError, withDatabaseLock } from './lock.js';
import { LockingStore } from './lockingStore.js';
import { pgliteSchema, postgresSchema, sqliteSchema } from './schema.js';
import { DatabaseStore, type Store } from './store.js';
import { parseDbUrl } from './url-parser.js';

const logger = createModuleLogger('database');

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'migrations', 'drizzle');

export interface DatabaseOptions {
  /** Database file path or connection string */
  dataDir?: string;
  /** Verbose logging */
  verbose?: boolean;
  /** Enable cooperative locking (wraps store with LockingStore) - opt-in only for special cases */
  enableLocking?: boolean;
  /** Lock options (only used when enableLocking is true) */
  lockOptions?: LockOptions;
  /** Custom migrations directory (defaults to built-in migrations) */
  migrationsDir?: string;
}

/**
 * Create a database connection with automatic backend detection
 * Simplified factory that combines URL parsing, adapter creation, and migration
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<Store> {
  const dataDir = options.dataDir ?? cfg.DATABASE_URI;
  const verbose = options.verbose ?? cfg.DB_VERBOSE;
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

  try {
    // Parse URL and create adapter in one step
    const parsed = parseDbUrl(dataDir);
    const backend = createAdapter(parsed, { debug: verbose });

    // Initialize backend
    await backend.init();

    // Run migrations with minimal locking logic
    if (options.enableLocking === true && parsed.kind === 'sqlite-file') {
      // Opt-in external locking for SQLite file migrations only
      const lockPath = AdapterHelpers.getLockPath(parsed);
      await withDatabaseLock(lockPath, { processType: 'migration' }, async () => {
        await backend.migrate(migrationsDir);
      });
    } else {
      // Default: rely on database's native concurrency handling
      await backend.migrate(migrationsDir);
    }

    // Initialize business data
    await initializeDatabase(backend);

    // Select appropriate schema
    const schema =
      backend.type === 'sqlite'
        ? sqliteSchema
        : backend.type === 'pglite'
          ? pgliteSchema
          : postgresSchema;

    // Create store directly
    const baseStore = new DatabaseStore(backend.rawClient, backend.drizzle, schema, false, false);

    // Optional locking wrapper (opt-in only)
    if (options.enableLocking === true) {
      const lockPath = AdapterHelpers.getLockPath(parsed);
      return new LockingStore(baseStore, lockPath, options.lockOptions);
    }

    logger.debug(
      {
        backend: backend.type,
        capabilities: {
          concurrentWrites: backend.capabilities.concurrentWrites,
          listenNotify: backend.capabilities.listenNotify,
          extensions: Array.from(backend.capabilities.extensions),
        },
      },
      'Database created successfully'
    );

    return baseStore;
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

// Migration runner exports
export {
  MigrationRunner,
  runMigrations,
  createMigrationRunner,
  type MigrationConfig,
  type MigrationResult,
} from './migrate.js';

export * from './schema.js';
