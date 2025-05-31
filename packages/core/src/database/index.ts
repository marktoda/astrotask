/**
 * Database initialization and factory functions
 *
 * This module provides simplified database creation with optional Electric SQL sync.
 * The approach prioritizes simplicity and reliability over complex features.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import { type ElectricConfig, type ElectricSync, createElectricSync } from './electric.js';
import * as schema from './schema.js';
import { DatabaseStore, type Store } from './store.js';

const logger = createModuleLogger('database');

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export interface DatabaseOptions {
  /** Database file path or connection string */
  dataDir?: string;
  /** Enable Electric SQL synchronization */
  enableSync?: boolean;
  /** Electric SQL configuration */
  electricConfig?: ElectricConfig;
  /** Enable encryption */
  enableEncryption?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Ensure the directory for the database exists
 */
function ensureDataDir(dataDir: string): void {
  // Skip for special PGlite protocols
  if (dataDir.startsWith('memory://') || dataDir === ':memory:' || dataDir.startsWith('idb://')) {
    return;
  }

  // Create parent directories if needed
  try {
    mkdirSync(dirname(dataDir), { recursive: true });
  } catch (_error) {
    // Ignore errors if directory already exists
  }
}

/**
 * Create a database store with optional Electric SQL sync
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<Store> {
  const {
    dataDir = cfg.DATA_DIR,
    enableSync = true,
    electricConfig = {},
    enableEncryption = false,
    verbose = cfg.DB_VERBOSE,
  } = options;

  if (verbose) {
    logger.info({ dataDir, enableSync, enableEncryption }, 'Initializing database');
  }

  try {
    // Ensure data directory exists
    ensureDataDir(dataDir);

    // Initialize PGlite
    const pgLite = new PGlite(dataDir, {
      debug: verbose ? 1 : 0,
    });

    // Initialize Drizzle ORM
    const db = drizzle(pgLite, { schema });

    // Run migrations
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Initialize Electric SQL sync if enabled
    let electricSync: ElectricSync | undefined;
    if (enableSync) {
      const syncUrl = electricConfig.syncUrl || cfg.ELECTRIC_URL;
      const syncConfig: ElectricConfig = {
        ...(syncUrl && { syncUrl }),
        tables: electricConfig.tables || ['tasks', 'context_slices'],
        verbose: electricConfig.verbose ?? verbose,
      };

      electricSync = createElectricSync(db, syncConfig);

      try {
        await electricSync.start();
      } catch (error) {
        logger.warn({ error }, 'Failed to start Electric SQL sync - continuing in local-only mode');
      }
    }

    // Create store
    const store = new DatabaseStore(pgLite, db, electricSync, enableEncryption);

    if (verbose) {
      logger.info(
        {
          syncing: store.isSyncing,
          encrypted: enableEncryption,
        },
        'Database initialized successfully'
      );
    }

    return store;
  } catch (error) {
    logger.error({ error, dataDir }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Create a local-only database without sync
 */
export async function createLocalDatabase(dataDir?: string): Promise<Store> {
  return createDatabase({
    dataDir: dataDir ?? cfg.DATA_DIR,
    enableSync: false,
    verbose: cfg.DB_VERBOSE,
  });
}

/**
 * Create a synced database with Electric SQL
 */
export async function createSyncedDatabase(
  dataDir?: string,
  electricConfig?: ElectricConfig
): Promise<Store> {
  return createDatabase({
    dataDir: dataDir ?? cfg.DATA_DIR,
    enableSync: true,
    electricConfig: electricConfig ?? {},
    verbose: cfg.DB_VERBOSE,
  });
}

// Re-export types and utilities
export type { Store } from './store.js';
export type { ElectricConfig } from './electric.js';
export { DatabaseStore } from './store.js';
export * from './schema.js';
