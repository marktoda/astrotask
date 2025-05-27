import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Database migration utilities using Drizzle's built-in PGlite migrator
 */
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createModuleLogger } from '../utils/logger.js';
import type { DatabaseConnection } from './config.js';

const logger = createModuleLogger('Migration');

/**
 * Find the package root by walking up directories until we find package.json
 */
function findPackageRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== dirname(currentPath)) {
    if (existsSync(join(currentPath, 'package.json'))) {
      return currentPath;
    }
    currentPath = dirname(currentPath);
  }

  throw new Error('Could not find package.json in any parent directory');
}

/**
 * Resolve the migrations folder path by finding package root
 */
function resolveMigrationsPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const packageRoot = findPackageRoot(dirname(currentFile));

  // Always use the source migrations directory
  return join(packageRoot, 'src', 'database', 'migrations');
}

/**
 * Run database migrations using Drizzle's built-in migrator
 *
 * @param connection Database connection with Drizzle instance
 * @param options Migration options
 * @returns Promise that resolves when migrations complete
 */
export async function runMigrations(
  connection: DatabaseConnection,
  options: {
    migrationsFolder?: string;
    verbose?: boolean;
  } = {}
): Promise<void> {
  // Use the resolved migrations path as default
  const defaultFolder = resolveMigrationsPath();

  const { migrationsFolder = defaultFolder, verbose = false } = options;

  // Validate the migrations folder exists early so we fail fast and noisily
  if (!existsSync(migrationsFolder)) {
    throw new Error(
      `Migrations folder not found: ${migrationsFolder}. Pass a valid migrationsFolder path to runMigrations().`
    );
  }

  try {
    if (verbose) {
      logger.info('Starting database migrations', {
        migrationsFolder,
        databasePath: connection.path,
      });
    }

    // Run migrations using Drizzle's built-in migrator
    await migrate(connection.drizzle, {
      migrationsFolder,
    });

    // Verify migrations were applied successfully
    const result = await connection.db.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const tableCount = (result.rows[0] as { count: number })?.count || 0;

    if (verbose) {
      logger.info('Database migrations completed successfully', {
        tablesCreated: tableCount,
        migrationsFolder,
      });
    }

    // Log successful migration execution
    logger.info(`Database migrations applied successfully. Tables created: ${tableCount}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Database migration failed', {
      error: errorMessage,
      migrationsFolder,
      databasePath: connection.path,
    });

    throw new Error(`Migration execution failed: ${errorMessage}`);
  }
}

/**
 * Check if migrations need to be run by verifying core tables exist
 *
 * @param connection Database connection
 * @returns Promise that resolves to true if migrations are needed
 */
export async function needsMigration(connection: DatabaseConnection): Promise<boolean> {
  try {
    const result = await connection.db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name IN ('tasks', 'context_slices')
      ORDER BY table_name
    `);

    const existingTables = result.rows.map((row) => (row as { table_name: string }).table_name);
    const requiredTables = ['context_slices', 'tasks'];

    // Check if all required tables exist
    const hasAllTables = requiredTables.every((table) => existingTables.includes(table));

    return !hasAllTables;
  } catch (error) {
    // If we can't check, assume migration is needed
    logger.warn('Could not check migration status, assuming migration needed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * Automatically run migrations if needed during database initialization
 *
 * @param connection Database connection
 * @param options Migration options
 * @returns Promise that resolves when migration check/execution completes
 */
export async function autoMigrate(
  connection: DatabaseConnection,
  options: {
    migrationsFolder?: string;
    verbose?: boolean;
    force?: boolean;
  } = {}
): Promise<void> {
  const { force = false, verbose = false } = options;

  try {
    // Check if migration is needed (unless forced)
    if (!force && !(await needsMigration(connection))) {
      if (verbose) {
        logger.info('Database schema is up to date, skipping migrations');
      }
      return;
    }

    if (verbose) {
      logger.info('Database schema requires migration, running migrations...');
    }

    // Run migrations
    await runMigrations(connection, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Auto-migration failed', {
      error: errorMessage,
      databasePath: connection.path,
    });

    throw new Error(`Auto-migration failed: ${errorMessage}`);
  }
}
