/**
 * Astrotask Core SDK - Main entry point class
 *
 * Provides a unified interface for Astrotask functionality with automatic
 * database setup, service composition, and lifecycle management.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, TEST_CONFIG } from './constants/defaults.js';
import type { IDatabaseAdapter } from './database/adapters/index.js';
import { createAdapter } from './database/adapters/index.js';
import { initializeDatabase } from './database/initialization.js';
import { type MigrationResult, createMigrationRunner } from './database/migrate.js';
import type { Store } from './database/store.js';
import { parseDbUrl } from './database/url-parser.js';
import type { ComplexityAnalyzer } from './services/ComplexityAnalyzer.js';
import type { DependencyService } from './services/DependencyService.js';
import type { ILLMService } from './services/LLMService.js';
import { type ServiceContainer, createServices } from './services/ServiceFactory.js';
import type { TaskExpansionService } from './services/TaskExpansionService.js';
import type { TaskService } from './services/TaskService.js';
import { createModuleLogger } from './utils/logger.js';

const logger = createModuleLogger('Astrotask');

// Get the directory of this file for default migrations
const __dirname = dirname(fileURLToPath(import.meta.url));
// The migrations folder lives in packages/core/migrations relative to this source file (packages/core/src)
// We only need to go up one level to reach the package root and then enter migrations
const DEFAULT_MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

/**
 * Configuration options for Astrotask SDK
 */
export interface AstrotaskConfig {
  /** Database connection string or file path */
  databaseUrl?: string;
  /** Custom migrations directory */
  migrationsDir?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Disable automatic migrations on init */
  skipMigrations?: boolean;
  /** Custom adapter instance (advanced usage) */
  adapter?: IDatabaseAdapter;
  /** Optional LLM service to use (dependency-injection). */
  llmService?: ILLMService;
  /** Complexity analysis configuration */
  complexityConfig?: {
    threshold?: number;
    research?: boolean;
    batchSize?: number;
  };
  /** Task expansion configuration */
  expansionConfig?: {
    useComplexityAnalysis?: boolean;
    research?: boolean;
    complexityThreshold?: number;
    defaultSubtasks?: number;
    maxSubtasks?: number;
    forceReplace?: boolean;
    createContextSlices?: boolean;
  };
}

/**
 * Initialization result with details about setup
 */
export interface InitializationResult {
  success: boolean;
  adapterType: string;
  migrationResult?: MigrationResult;
  error?: Error;
}

/**
 * Main Astrotask SDK class
 *
 * Provides a unified interface for all Astrotask functionality including:
 * - Database management with automatic adapter selection
 * - Service composition and lifecycle management
 * - Task and dependency operations
 * - Complexity analysis and task expansion
 */
export class Astrotask {
  private _adapter?: IDatabaseAdapter | undefined;
  private _services?: ServiceContainer | undefined;
  private _initialized = false;
  private _disposed = false;

  constructor(private config: AstrotaskConfig = {}) {}

  /**
   * Initialize the Astrotask SDK
   *
   * Sets up database connection, runs migrations, and initializes services
   */
  async init(): Promise<InitializationResult> {
    if (this._initialized) {
      throw new Error('Astrotask SDK is already initialized');
    }

    if (this._disposed) {
      throw new Error('Astrotask SDK has been disposed and cannot be reinitialized');
    }

    const startTime = Date.now();

    try {
      logger.info('Initializing Astrotask SDK...');

      // Step 1: Setup database adapter
      await this._setupAdapter();

      // Step 2: Run migrations (unless skipped)
      let migrationResult: MigrationResult | undefined;
      if (!this.config.skipMigrations) {
        migrationResult = await this._runMigrations();
      }

      // Step 3: Initialize database business logic
      if (!this._adapter) {
        throw new Error('Adapter not set up properly');
      }
      await initializeDatabase(this._adapter);

      // Step 4: Create store and services
      this._setupServices();

      this._initialized = true;
      const duration = Date.now() - startTime;

      logger.info(
        {
          adapterType: this._adapter.type,
          duration,
          migrationsSkipped: this.config.skipMigrations,
        },
        'Astrotask SDK initialized successfully'
      );

      return {
        success: true,
        adapterType: this._adapter.type,
        ...(migrationResult ? { migrationResult } : {}),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'Failed to initialize Astrotask SDK');

      // Clean up on error
      await this._cleanup();

      return {
        success: false,
        adapterType: this._adapter?.type ?? 'unknown',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Dispose of the Astrotask SDK and clean up resources
   */
  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    logger.info('Disposing Astrotask SDK...');

    await this._cleanup();
    this._disposed = true;

    logger.info('Astrotask SDK disposed');
  }

  /**
   * Get the database adapter (lazy initialization)
   */
  get adapter(): IDatabaseAdapter {
    this._ensureInitialized();
    if (!this._adapter) {
      throw new Error('Adapter not initialized');
    }
    return this._adapter;
  }

  /**
   * Get the database store (lazy initialization)
   */
  get store(): Store {
    this._ensureInitialized();
    if (!this._services) {
      throw new Error('Services not initialized');
    }
    return this._services.store;
  }

  /**
   * Get the task service (lazy initialization)
   */
  get tasks(): TaskService {
    this._ensureInitialized();
    if (!this._services) {
      throw new Error('Services not initialized');
    }
    return this._services.taskService;
  }

  /**
   * Get the dependency service (lazy initialization)
   */
  get dependencies(): DependencyService {
    this._ensureInitialized();
    if (!this._services) {
      throw new Error('Services not initialized');
    }
    return this._services.dependencyService;
  }

  /**
   * Get the complexity analyzer (lazy initialization)
   */
  get complexity(): ComplexityAnalyzer {
    this._ensureInitialized();
    if (!this._services?.complexityAnalyzer) {
      throw new Error('Complexity analyzer not initialized');
    }
    return this._services.complexityAnalyzer;
  }

  /**
   * Get the task expansion service (lazy initialization)
   */
  get expansion(): TaskExpansionService {
    this._ensureInitialized();
    if (!this._services?.taskExpansionService) {
      throw new Error('Task expansion service not initialized');
    }
    return this._services.taskExpansionService;
  }

  /**
   * Check if the SDK is initialized
   */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Check if the SDK is disposed
   */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Get the current database type
   */
  get databaseType(): string | undefined {
    return this._adapter?.type;
  }

  // Private implementation methods

  private async _setupAdapter(): Promise<void> {
    if (this.config.adapter) {
      // Use provided adapter
      this._adapter = this.config.adapter;
      await this._adapter.init();
    } else {
      // Create adapter from URL
      const databaseUrl = this.config.databaseUrl ?? DEFAULT_CONFIG.DATABASE_URL;
      const parsed = parseDbUrl(databaseUrl);

      this._adapter = createAdapter(parsed, {
        debug: this.config.debug ?? false,
      });

      await this._adapter.init();
    }
  }

  private async _runMigrations(): Promise<MigrationResult> {
    const migrationsDir = this.config.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
    const runner = createMigrationRunner(migrationsDir);

    // Parse URL for locking if needed
    const parsed = this.config.databaseUrl ? parseDbUrl(this.config.databaseUrl) : undefined;

    if (!this._adapter) {
      throw new Error('Adapter not set up for migrations');
    }
    return runner.runMigrations(this._adapter, parsed);
  }

  private _setupServices(): void {
    if (!this._adapter) {
      throw new Error('Adapter not available for service setup');
    }

    this._services = createServices({
      adapter: this._adapter,
      llmService: this.config.llmService,
      complexityConfig: this.config.complexityConfig,
      expansionConfig: this.config.expansionConfig,
    });
  }

  private async _cleanup(): Promise<void> {
    try {
      // Close database connection
      if (this._adapter) {
        await this._adapter.close();
      }
    } catch (error) {
      logger.warn({ error }, 'Error during cleanup');
    }

    // Clear references
    this._adapter = undefined;
    this._services = undefined;
    this._initialized = false;
  }

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('Astrotask SDK is not initialized. Call init() first.');
    }

    if (this._disposed) {
      throw new Error('Astrotask SDK has been disposed.');
    }
  }
}

/**
 * Create and initialize an Astrotask SDK instance
 *
 * Convenience function for one-step initialization
 */
export async function createAstrotask(config: AstrotaskConfig = {}): Promise<Astrotask> {
  const astrotask = new Astrotask(config);
  const result = await astrotask.init();

  if (!result.success) {
    throw result.error ?? new Error('Failed to initialize Astrotask SDK');
  }

  return astrotask;
}

/**
 * Create an Astrotask SDK instance with a specific database URL
 */
export async function createAstrotaskWithDatabase(
  databaseUrl: string,
  config: Omit<AstrotaskConfig, 'databaseUrl'> = {}
): Promise<Astrotask> {
  return createAstrotask({ ...config, databaseUrl });
}

/**
 * Create an in-memory Astrotask SDK instance (useful for testing)
 */
export async function createInMemoryAstrotask(
  config: Omit<AstrotaskConfig, 'databaseUrl'> = {}
): Promise<Astrotask> {
  return createAstrotask({ ...config, databaseUrl: TEST_CONFIG.DATABASE_URL });
}

/**
 * Create an in-memory Astrotask SDK instance for testing without LLM services
 * This avoids requiring OpenAI API keys in test environments
 */
export async function createTestAstrotask(
  config: Omit<AstrotaskConfig, 'databaseUrl' | 'llmService'> = {}
): Promise<Astrotask> {
  return createAstrotask({
    ...config,
    databaseUrl: TEST_CONFIG.DATABASE_URL,
    llmService: {
      getChatModel: () => ({}) as unknown as import('@langchain/openai').ChatOpenAI,
    },
  });
}
