/**
 * Database initialization and factory functions
 *
 * This module provides simplified database creation with plain PGlite.
 * Removed Electric SQL sync - now uses local-only PGlite database.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
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
  /** Enable encryption */
  enableEncryption?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Ensure the data directory exists
 */
function ensureDataDir(dataDir: string): void {
  if (dataDir.startsWith('memory://') || dataDir.startsWith('idb://')) {
    return; // In-memory databases don't need directory creation
  }

  try {
    const dir = dirname(dataDir);
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    logger.warn({ error, dataDir }, 'Failed to create data directory');
  }
}

/**
 * Ensure PROJECT_ROOT task exists
 */
async function ensureProjectRoot(db: ReturnType<typeof drizzle>): Promise<void> {
  try {
    const existingRoot = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT))
      .limit(1);

    if (existingRoot.length === 0) {
      await db.insert(schema.tasks).values({
        id: TASK_IDENTIFIERS.PROJECT_ROOT,
        title: 'Project Root',
        description: 'Root container for all project tasks',
        status: 'done',
        priority: 'low',
        prd: null,
        contextDigest: null,
        parentId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Created PROJECT_ROOT task');
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to ensure PROJECT_ROOT task exists');
  }
}

/**
 * Create a local-only database store with plain PGlite
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<Store> {
  const {
    dataDir = cfg.DATABASE_PATH,
    enableEncryption = false,
    verbose = cfg.DB_VERBOSE,
  } = options;

  if (verbose) {
    logger.info({ dataDir, enableEncryption }, 'Initializing local PGlite database');
  }

  try {
    // Ensure data directory exists
    ensureDataDir(dataDir);

    // Initialize plain PGlite without any extensions
    const pgLite = await PGlite.create({
      dataDir,
      debug: verbose ? 1 : 0,
    });

    // Initialize Drizzle ORM
    const db = drizzle(pgLite, { schema });

    // Run migrations
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Ensure PROJECT_ROOT task exists
    await ensureProjectRoot(db);

    // Create store
    const store = new DatabaseStore(pgLite, db, false, enableEncryption);

    if (verbose) {
      logger.info('Local PGlite database initialized successfully');
    }

    return store;
  } catch (error) {
    logger.error({ error, dataDir }, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Create a local-only database (alias for createDatabase for backward compatibility)
 */
export async function createLocalDatabase(dataDir?: string): Promise<Store> {
  return createDatabase({
    dataDir: dataDir ?? cfg.DATABASE_PATH,
    enableEncryption: false,
  });
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
export * from './schema.js';
