/**
 * Database factory using the adapter pattern
 */

import { createModuleLogger } from '../utils/logger.js';
import type { DatabaseBackend } from './adapters/index.js';
import { AdapterHelpers, createAdapter, needsExternalLocking } from './adapters/index.js';
import { initializeDatabase } from './initialization.js';
import { withDatabaseLock } from './lock.js';
import type { DbUrl } from './url-parser.js';

const logger = createModuleLogger('DatabaseFactory');

export interface OpenDatabaseOptions {
  migrationsDir: string;
  debug?: boolean;
  useLocking?: boolean;
}

/**
 * Open a database connection with automatic backend detection
 * Uses the adapter registry pattern for clean, extensible backend creation
 */
export async function openDatabase(
  parsed: DbUrl,
  options: OpenDatabaseOptions
): Promise<DatabaseBackend> {
  // Create appropriate adapter using the registry
  const backend = createAdapter(parsed, {
    debug: options.debug ?? false,
  });

  try {
    // Initialize the backend
    await backend.init();

    // Run migrations with locking for file-based databases
    if (needsExternalLocking(backend) && options.useLocking !== false) {
      // Use lock for migrations in file-based databases to prevent races
      const lockPath = AdapterHelpers.getLockPath(parsed);
      await withDatabaseLock(lockPath, { processType: 'migration' }, async () => {
        await backend.migrate(options.migrationsDir);
      });
    } else {
      // Server-based databases handle concurrent migrations internally
      await backend.migrate(options.migrationsDir);
    }

    // Initialize database with required business data
    await initializeDatabase(backend);

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
