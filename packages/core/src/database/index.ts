/**
 * Database initialization and factory functions
 *
 * This module provides simplified database creation with optional Electric SQL sync.
 * Uses the official @electric-sql/pglite-sync plugin for automatic sync management.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { electricSync } from '@electric-sql/pglite-sync';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import * as schema from './schema.js';
import { DatabaseStore, type Store } from './store.js';

const logger = createModuleLogger('database');

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'drizzle');

export interface DatabaseOptions {
  /** Database file path or connection string */
  dataDir?: string;
  /** Enable Electric SQL synchronization */
  enableSync?: boolean;
  /** Electric SQL server URL */
  electricUrl?: string;
  /** Tables to sync */
  syncTables?: string[];
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
    electricUrl = cfg.ELECTRIC_URL,
    syncTables = ['tasks', 'context_slices'],
    enableEncryption = false,
    verbose = cfg.DB_VERBOSE,
  } = options;

  if (verbose) {
    logger.info({ dataDir, enableSync, enableEncryption }, 'Initializing database');
  }

  try {
    // Ensure data directory exists
    ensureDataDir(dataDir);

    // Initialize PGlite with Electric sync extension if enabled
    const pgLite = await PGlite.create({
      dataDir,
      debug: verbose ? 1 : 0,
      extensions: enableSync && electricUrl ? { electric: electricSync() } : {},
    });

    // Initialize Drizzle ORM
    const db = drizzle(pgLite, { schema });

    // Run migrations
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Start Electric SQL sync if enabled
    let isSyncing = false;
    if (enableSync && electricUrl && 'electric' in pgLite) {
      try {
        // Sync each configured table
        for (const tableName of syncTables) {
          logger.debug({ table: tableName }, 'Starting sync for table');

          // Map database column names to shape column names
          const columnMap =
            tableName === 'tasks'
              ? {
                  id: 'id',
                  title: 'title',
                  description: 'description',
                  status: 'status',
                  priority: 'priority',
                  prd: 'prd',
                  contextDigest: 'context_digest',
                  parentId: 'parent_id',
                  createdAt: 'created_at',
                  updatedAt: 'updated_at',
                }
              : tableName === 'context_slices'
                ? {
                    id: 'id',
                    title: 'title',
                    description: 'description',
                    taskId: 'task_id',
                    contextDigest: 'context_digest',
                    createdAt: 'created_at',
                    updatedAt: 'updated_at',
                  }
                : {};

          await pgLite.electric.syncShapeToTable({
            shape: {
              url: `${electricUrl}/v1/shape/${tableName}`,
            },
            shapeKey: tableName,
            table: tableName,
            primaryKey: ['id'],
            mapColumns: columnMap,
          });
        }

        isSyncing = true;
        logger.info({ tables: syncTables }, 'Electric SQL sync started successfully');
      } catch (error) {
        logger.warn({ error }, 'Failed to start Electric SQL sync - continuing in local-only mode');
      }
    }

    // Create store
    const store = new DatabaseStore(pgLite, db, isSyncing, enableEncryption);

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
export async function createSyncedDatabase(dataDir?: string, electricUrl?: string): Promise<Store> {
  const url = electricUrl || cfg.ELECTRIC_URL;
  if (!url) {
    logger.warn('No Electric URL provided, creating local-only database');
    return createLocalDatabase(dataDir);
  }

  return createDatabase({
    dataDir: dataDir ?? cfg.DATA_DIR,
    enableSync: true,
    electricUrl: url,
    verbose: cfg.DB_VERBOSE,
  });
}

// Re-export types and utilities
export type { Store } from './store.js';
export { DatabaseStore } from './store.js';
export * from './schema.js';
