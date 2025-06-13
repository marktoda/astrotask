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
import { DatabaseAdapterError } from './errors.js';
import { initializeDatabase } from './initialization.js';
import type { LockOptions } from './lock.js';
import { DatabaseLockError } from './lock.js';
import { LockingStore } from './lockingStore.js';
import { createMigrationRunner } from './migrate.js';
import { pgliteSchema, postgresSchema, sqliteSchema } from './schema.js';
import { DatabaseStore, type Store } from './store.js';
import { parseDbUrl } from './url-parser.js';

const logger = createModuleLogger('database');

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_BASE_DIR = resolve(__dirname, '..', '..', 'migrations');

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

  try {
    // Parse URL and create adapter in one step
    const parsed = parseDbUrl(dataDir);
    const backend = createAdapter(parsed, { debug: verbose });

    // Initialize backend
    await backend.init();

    // Run migrations using the MigrationRunner which automatically selects the correct directory
    if (options.migrationsDir) {
      // Use custom migrations directory if provided
      await backend.migrate(options.migrationsDir);
    } else {
      // Use MigrationRunner to automatically select correct migrations directory
      const migrationRunner = createMigrationRunner(MIGRATIONS_BASE_DIR, {
        useLocking: options.enableLocking === true && parsed.kind === 'sqlite-file',
      });
      await migrationRunner.runMigrations(backend, parsed);
    }

    // Initialize business data
    await initializeDatabase(backend);

    // Select appropriate schema based on backend type
    const schema = getSchemaForBackend(backend.type);

    // Create store directly
    const baseStore = new DatabaseStore(backend.rawClient, backend.drizzle, schema, false);

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
 * Helper function to select the appropriate schema based on backend type
 */
function getSchemaForBackend(backendType: string) {
  switch (backendType) {
    case 'sqlite':
      return sqliteSchema;
    case 'pglite':
      return pgliteSchema;
    case 'postgres':
      return postgresSchema;
    default:
      throw new DatabaseAdapterError(`Unsupported backend type: ${backendType}`, 'factory', backendType);
  }
}

/**
 * Create a local-only database (simplified alias)
 */
export async function createLocalDatabase(dataDir?: string): Promise<Store> {
  return createDatabase({ dataDir: dataDir ?? cfg.DATABASE_URI });
}

/**
 * Create a database with cooperative locking enabled
 * Simplified version that auto-detects process type
 */
export async function createLockedDatabase(
  dataDir?: string,
  lockOptions?: LockOptions
): Promise<Store> {
  return createDatabase({
    dataDir: dataDir ?? cfg.DATABASE_URI,
    enableLocking: true,
    lockOptions: {
      processType: process.env.NODE_ENV === 'test' ? 'test' : 'cli',  // Simplified auto-detection
      ...lockOptions,
    },
  });
}



// Re-export types and utilities
export type { Store, TransactionStore } from './store.js';
export { DatabaseStore } from './store.js';
export { BaseStore } from './store-base.js';
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
