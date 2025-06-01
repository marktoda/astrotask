/**
 * Database initialization and factory functions
 *
 * This module provides simplified database creation with optional Electric SQL sync.
 * Uses the official @electric-sql/pglite-sync plugin for automatic sync management.
 *
 * Implements Electric Schema Sync design doc requirements using the SDK's built-in features:
 * - Client bootstrap logic with automatic migration handling
 * - Built-in retry logic and error handling
 * - Status monitoring through shape subscriptions
 * - Offline mode support
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { electricSync } from '@electric-sql/pglite-sync';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import * as schema from './schema.js';
import { DatabaseStore, type Store } from './store.js';

const logger = createModuleLogger('database');

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'drizzle');

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
  /** Enable debug logging for Electric sync */
  electricDebug?: boolean;
}

export interface ElectricShape {
  isUpToDate: boolean;
  shapeId: string;
  subscribe: (onUpdate: () => void, onError: (err: Error) => void) => void;
  unsubscribe: () => void;
}

export interface ElectricMultiShape {
  isUpToDate: boolean;
  unsubscribe: () => void;
}

interface ElectricShapeConfig {
  shape: {
    url: string;
    params: { table: string };
  };
  table: string;
  primaryKey: string[];
}

interface ElectricEnabledPGlite extends PGlite {
  electric: {
    syncShapesToTables: (config: {
      shapes: Record<string, ElectricShapeConfig>;
      key: string;
      onInitialSync?: () => void;
    }) => Promise<ElectricMultiShape>;
  };
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
 * Ensure PROJECT_ROOT task exists in the database
 */
async function ensureProjectRoot(db: ReturnType<typeof drizzle>): Promise<void> {
  // Check if PROJECT_ROOT already exists
  const existingProjectRoot = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT))
    .limit(1);

  if (existingProjectRoot.length === 0) {
    // Create PROJECT_ROOT task
    const now = new Date();
    await db.insert(schema.tasks).values({
      id: TASK_IDENTIFIERS.PROJECT_ROOT,
      parentId: null,
      title: 'Project Tasks',
      description: 'Project root containing all task hierarchies',
      status: 'pending',
      priority: 'medium',
      prd: null,
      contextDigest: null,
      createdAt: now,
      updatedAt: now,
    });

    logger.debug('Created PROJECT_ROOT task');
  }
}

/**
 * Extended Store interface with Electric sync capabilities
 */
export interface ElectricStore extends Store {
  /** Active shape subscriptions for single table sync */
  shapes?: Record<string, ElectricShape> | undefined;
  /** Active multi-table sync subscription */
  multiTableSync?: ElectricMultiShape | undefined;
  /** Stop all Electric sync subscriptions */
  stopSync: () => Promise<void>;
  /** Whether Electric sync is active (mutable version for sync management) */
  electricSyncActive: boolean;
}

/**
 * Enhanced database store with Electric sync management
 */
class ElectricDatabaseStore extends DatabaseStore implements ElectricStore {
  shapes?: Record<string, ElectricShape> | undefined;
  multiTableSync?: ElectricMultiShape | undefined;
  electricSyncActive = false;

  async stopSync(): Promise<void> {
    // Unsubscribe from all single table shapes
    if (this.shapes) {
      for (const shape of Object.values(this.shapes)) {
        shape.unsubscribe();
      }
      this.shapes = undefined;
    }

    // Unsubscribe from multi-table sync
    if (this.multiTableSync) {
      this.multiTableSync.unsubscribe();
      this.multiTableSync = undefined;
    }

    this.electricSyncActive = false;
  }

  override async close(): Promise<void> {
    await this.stopSync();
    await super.close();
  }
}

/**
 * Create a database store with optional Electric SQL sync
 *
 * Leverages the built-in features of @electric-sql/pglite-sync:
 * - Automatic migration handling and schema sync
 * - Built-in retry logic with exponential backoff
 * - Persistent sync state for resuming between sessions
 * - Transactional consistency for multi-table sync
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<ElectricStore> {
  const {
    dataDir = cfg.DATA_DIR,
    enableSync = true,
    electricUrl = cfg.ELECTRIC_URL,
    syncTables = ['tasks', 'context_slices', 'task_dependencies'],
    enableEncryption = false,
    verbose = cfg.DB_VERBOSE,
    electricDebug = false,
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
      extensions:
        enableSync && electricUrl
          ? {
              electric: electricSync({
                debug: electricDebug,
              }),
            }
          : {},
    });

    // Initialize Drizzle ORM
    const db = drizzle(pgLite, { schema });

    // Run migrations
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Ensure PROJECT_ROOT task exists
    await ensureProjectRoot(db);

    // Create store
    const store = new ElectricDatabaseStore(pgLite, db, false, enableEncryption);

    // Start Electric SQL sync if enabled
    if (enableSync && electricUrl && 'electric' in pgLite) {
      try {
        // Use multi-table sync for transactional consistency
        const shapes: Record<string, ElectricShapeConfig> = {};

        for (const tableName of syncTables) {
          shapes[tableName] = {
            shape: {
              url: `${electricUrl}/v1/shape`,
              params: { table: tableName },
            },
            table: tableName,
            primaryKey: ['id'],
          };
        }

        if (verbose) {
          logger.info({ tables: syncTables }, 'Starting Electric SQL sync');
        }

        const sync = await (pgLite as ElectricEnabledPGlite).electric.syncShapesToTables({
          shapes,
          key: 'astrolabe-sync',
          onInitialSync: () => {
            logger.info('Electric SQL initial sync complete');
          },
        });

        store.multiTableSync = sync;
        store.electricSyncActive = true;

        if (verbose) {
          logger.info({ tables: syncTables }, 'Electric SQL sync started successfully');
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to start Electric SQL sync - continuing in local-only mode');
      }
    }

    if (verbose) {
      logger.info(
        {
          syncing: store.electricSyncActive,
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
export async function createLocalDatabase(dataDir?: string): Promise<ElectricStore> {
  return createDatabase({
    dataDir: dataDir ?? cfg.DATA_DIR,
    enableSync: false,
  });
}

/**
 * Create a database with Electric SQL sync enabled
 */
export async function createSyncedDatabase(
  dataDir?: string,
  electricUrl?: string
): Promise<ElectricStore> {
  const url = electricUrl ?? cfg.ELECTRIC_URL;
  if (!url) {
    logger.warn('No Electric URL provided, creating local-only database');
    return createLocalDatabase(dataDir);
  }

  return createDatabase({
    dataDir: dataDir ?? cfg.DATA_DIR,
    enableSync: true,
    electricUrl: url,
  });
}

// Re-export types and utilities
export type { Store } from './store.js';
export { DatabaseStore } from './store.js';
export * from './schema.js';
