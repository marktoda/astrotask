/**
 * Migration runner system for Astrotask database adapters
 *
 * Provides a unified interface for running migrations across different database backends
 * with support for adapter-specific migration directories and locking strategies.
 */

import { join } from 'node:path';
import { createModuleLogger } from '../utils/logger.js';
import type { IDatabaseAdapter } from './adapters/index.js';
import { AdapterHelpers, needsExternalLocking } from './adapters/index.js';
import { withDatabaseLock } from './lock.js';
import type { DbUrl } from './url-parser.js';

const logger = createModuleLogger('MigrationRunner');

/**
 * Configuration for migration runner
 */
export interface MigrationConfig {
  /** Base migrations directory */
  migrationsDir: string;
  /** Whether to use locking for file-based databases */
  useLocking?: boolean;
  /** Custom migration directory mapping per adapter type */
  adapterMigrationDirs?: {
    postgres?: string;
    pglite?: string;
    sqlite?: string;
  };
}

/**
 * Result of migration operation
 */
export interface MigrationResult {
  success: boolean;
  adapterType: string;
  migrationsApplied: number;
  error?: Error;
  lockUsed: boolean;
}

/**
 * Migration runner that handles adapter-specific migration strategies
 */
export class MigrationRunner {
  constructor(private config: MigrationConfig) {}

  /**
   * Run migrations for a database adapter
   */
  async runMigrations(adapter: IDatabaseAdapter, parsed?: DbUrl): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Determine the appropriate migrations directory for this adapter
      const migrationsDir = this.getMigrationsDir(adapter.type);

      logger.debug(
        {
          adapterType: adapter.type,
          migrationsDir,
          capabilities: {
            concurrentWrites: adapter.capabilities.concurrentWrites,
            listenNotify: adapter.capabilities.listenNotify,
          },
        },
        'Starting migrations'
      );

      let lockUsed = false;
      let migrationsApplied = 0;

      // Run migrations with appropriate locking strategy
      if (needsExternalLocking(adapter) && this.config.useLocking !== false && parsed) {
        // File-based databases need external locking
        const lockPath = AdapterHelpers.getLockPath(parsed);
        lockUsed = true;

        await withDatabaseLock(lockPath, { processType: 'migration' }, async () => {
          migrationsApplied = await this.executeMigrations(adapter, migrationsDir);
        });
      } else {
        // Server-based databases handle concurrency internally
        migrationsApplied = await this.executeMigrations(adapter, migrationsDir);
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          adapterType: adapter.type,
          migrationsApplied,
          duration,
          lockUsed,
        },
        'Migrations completed successfully'
      );

      return {
        success: true,
        adapterType: adapter.type,
        migrationsApplied,
        lockUsed,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          error,
          adapterType: adapter.type,
          duration,
        },
        'Migration failed'
      );

      return {
        success: false,
        adapterType: adapter.type,
        migrationsApplied: 0,
        lockUsed: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Get the appropriate migrations directory for an adapter type
   */
  private getMigrationsDir(adapterType: string): string {
    const customDir =
      this.config.adapterMigrationDirs?.[
        adapterType as keyof typeof this.config.adapterMigrationDirs
      ];

    if (customDir) {
      return customDir;
    }

    // Default mapping based on adapter type
    switch (adapterType) {
      case 'postgres':
      case 'pglite':
        return join(this.config.migrationsDir, 'drizzle');
      case 'sqlite':
        return join(this.config.migrationsDir, 'drizzle-sqlite');
      default:
        return this.config.migrationsDir;
    }
  }

  /**
   * Execute migrations using the adapter's migration method
   */
  private async executeMigrations(
    adapter: IDatabaseAdapter,
    migrationsDir: string
  ): Promise<number> {
    // For now, delegate to the adapter's migrate method
    // In the future, we could add more sophisticated tracking here
    await adapter.migrate(migrationsDir);

    // TODO: Return actual count of migrations applied
    // This would require adapter-specific logic to track migration state
    return 0; // Placeholder - adapters don't currently return migration count
  }
}

/**
 * Convenience function to create and run migrations
 */
export async function runMigrations(
  adapter: IDatabaseAdapter,
  config: MigrationConfig,
  parsed?: DbUrl
): Promise<MigrationResult> {
  const runner = new MigrationRunner(config);
  return runner.runMigrations(adapter, parsed);
}

/**
 * Create a migration runner with default configuration
 */
export function createMigrationRunner(
  migrationsDir: string,
  options?: {
    useLocking?: boolean;
    adapterMigrationDirs?: MigrationConfig['adapterMigrationDirs'];
  }
): MigrationRunner {
  const config: MigrationConfig = {
    migrationsDir,
  };

  if (options?.useLocking !== undefined) {
    config.useLocking = options.useLocking;
  }

  if (options?.adapterMigrationDirs !== undefined) {
    config.adapterMigrationDirs = options.adapterMigrationDirs;
  }

  return new MigrationRunner(config);
}
