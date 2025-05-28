import { createModuleLogger } from '../utils/logger.js';
import { initializeDatabase } from './config.js';
import { createStore } from './electric.js';
import type { Store } from './store.js';

const logger = createModuleLogger('database');

/**
 * Configuration options for creating a database
 */
export interface DatabaseOptions {
  /** Path to database file or 'memory' for in-memory database */
  dbPath?: string;
  /** Enable database encryption (requires ASTROLABE_DB_KEY env var) */
  encrypted?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Enable real-time sync via ElectricSQL */
  autoSync?: boolean;
}

/**
 * Create a new database store with automatic migration and configuration.
 *
 * This is the main entry point for database operations, providing:
 * - Automatic database initialization and migration
 * - Type-safe ORM via Drizzle
 * - Raw SQL access via PGlite
 * - Optional real-time sync via ElectricSQL
 * - Business methods for common operations
 *
 * @param options Database configuration options
 * @returns Store instance with all database functionality
 */
export async function createDatabase(options: DatabaseOptions = {}): Promise<Store> {
  const { dbPath = 'astrolabe.db', encrypted = false, verbose = false, autoSync = false } = options;

  // Initialize the database connection and run migrations
  const connection = await initializeDatabase({
    dbPath,
    encrypted,
    verbose,
    autoMigrate: true, // Always run migrations
  });

  // Create the store with ElectricSQL integration
  const store = await createStore(connection.db, connection.drizzle, connection.isEncrypted, {
    sync: autoSync,
    verbose,
    databasePath: dbPath,
  });

  if (verbose) {
    logger.info('Database store created successfully');
  }

  return store;
}

// Re-export commonly used types and functions
export type { Store } from './store.js';
export { DatabaseError, EncryptionError } from './config.js';
export type { ElectricConnection } from './electric.js';
export { schema } from './schema.js';

// Import types from Zod schemas (single source of truth)
export type {
  Task,
  CreateTask as NewTask,
  TaskStatus,
  TaskPriority,
} from '../schemas/task.js';
export type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
