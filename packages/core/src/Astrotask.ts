/**
 * Astrotask Core SDK - Main entry point class
 *
 * Provides a unified interface for Astrotask functionality with automatic
 * database setup, service composition, and lifecycle management.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IDatabaseAdapter } from './database/adapters/index.js';
import { createAdapter } from './database/adapters/index.js';
import { initializeDatabase } from './database/initialization.js';
import { type MigrationResult, createMigrationRunner } from './database/migrate.js';
import type { Store } from './database/store.js';
import { parseDbUrl } from './database/url-parser.js';
import { TrackingDependencyGraph } from './entities/TrackingDependencyGraph.js';
import { TrackingTaskTree } from './entities/TrackingTaskTree.js';
import {
  AdapterNotAvailableError,
  SDKAlreadyInitializedError,
  SDKDisposedError,
  SDKInitializationError,
  SDKNotInitializedError,
  ServiceNotAvailableError,
  wrapError,
} from './errors/index.js';
import type { TaskStatus } from './schemas/task.js';
import type { ComplexityAnalyzer } from './services/ComplexityAnalyzer.js';
import type { DependencyService } from './services/DependencyService.js';
import type { TaskExpansionService } from './services/TaskExpansionService.js';
import type { TaskService } from './services/TaskService.js';
import { DependencyType } from './services/dependency-type.js';
import { Registry } from './services/registry.js';
import {
  type ServiceConfig,
  type ServiceContainer,
  initializeServices,
} from './services/service-initialization.js';
import { TEST_CONFIG, cfg } from './utils/config.js';
import { createModuleLogger } from './utils/logger.js';

const logger = createModuleLogger('Astrotask');

// Get the directory of this file for default migrations
const __dirname = dirname(fileURLToPath(import.meta.url));
// The migrations folder lives in packages/core/migrations relative to this source file (packages/core/src)
// We only need to go up one level to reach the package root and then enter migrations
const DEFAULT_MIGRATIONS_DIR = resolve(__dirname, '..', 'migrations');

/**
 * Filter options for available tasks
 */
export interface AvailableTasksFilter {
  status?: TaskStatus;
  priorityScore?: number;
  useEffectiveStatus?: boolean;
  parentId?: string;
}

/**
 * Filter options for next task selection
 */
export interface NextTaskFilter extends AvailableTasksFilter {
  includeInProgress?: boolean;
}

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
  /** Hook for replacing or extending the DI registry */
  overrides?: (reg: Registry) => void;
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
  private registry = new Registry();
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
      throw new SDKAlreadyInitializedError();
    }

    if (this._disposed) {
      throw new SDKDisposedError('initialization');
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
        throw new SDKInitializationError('Adapter not set up properly', 'database-init');
      }
      await initializeDatabase(this._adapter);

      // Step 4: Create registry and services
      await this._setupServices();

      this._initialized = true;
      const duration = Date.now() - startTime;
      const databaseUrl = this.config.databaseUrl ?? cfg.DATABASE_URI;

      logger.info(
        {
          adapterType: this._adapter.type,
          databaseUrl,
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

      const wrappedError = wrapError(error, 'sdk', 'initialization', { duration });

      return {
        success: false,
        adapterType: this._adapter?.type ?? 'unknown',
        error: wrappedError,
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
      throw new ServiceNotAvailableError('Adapter', 'get-adapter');
    }
    return this._adapter;
  }

  /**
   * Get the database store (lazy initialization)
   */
  get store(): Store {
    this._ensureInitialized();
    if (!this._services) {
      throw new ServiceNotAvailableError('Store', 'get-store');
    }
    return this._services.store;
  }

  /**
   * Get a TrackingTaskTree at the root or specified parent (NEW TREE-CENTRIC API)
   * @param parentId - Optional parent ID to get subtree from; if not provided, returns project root
   */
  async tasks(parentId?: string): Promise<TrackingTaskTree> {
    this._ensureInitialized();
    if (!this._services) {
      throw new ServiceNotAvailableError('TaskService', 'get-tasks');
    }

    // Get the task tree from the service
    const tree = await this._services.taskService.getTaskTree(parentId);
    if (!tree) {
      throw new ServiceNotAvailableError('TaskTree', `get-tasks-${parentId || 'root'}`);
    }

    // Convert to TrackingTaskTree and associate with dependency graph
    const trackingTree = TrackingTaskTree.fromTaskTree(tree);

    // Set up dependency graph integration
    const dependencyGraph = await this.dependencies(parentId);
    trackingTree.withDependencyGraph(dependencyGraph);

    return trackingTree;
  }

  /**
   * Get a TrackingDependencyGraph for dependency management
   * @param graphId - Optional graph ID for scoping dependencies
   */
  async dependencies(graphId?: string): Promise<TrackingDependencyGraph> {
    this._ensureInitialized();
    if (!this._services) {
      throw new ServiceNotAvailableError('DependencyService', 'get-dependencies');
    }

    // Create or get dependency graph from service
    const baseDependencyGraph = await this._services.dependencyService.createDependencyGraph();

    // Convert to TrackingDependencyGraph
    return TrackingDependencyGraph.fromDependencyGraph(baseDependencyGraph, graphId || 'default');
  }

  /**
   * Legacy getter for TaskService (for backward compatibility)
   * @deprecated Use the async tasks() method instead
   */
  get taskService(): TaskService {
    this._ensureInitialized();
    if (!this._services) {
      throw new ServiceNotAvailableError('TaskService', 'get-taskService');
    }
    return this._services.taskService;
  }

  /**
   * Legacy getter for DependencyService (for backward compatibility)
   * @deprecated Use the async dependencies() method instead
   */
  get dependencyService(): DependencyService {
    this._ensureInitialized();
    if (!this._services) {
      throw new ServiceNotAvailableError('DependencyService', 'get-dependencyService');
    }
    return this._services.dependencyService;
  }

  /**
   * Get the complexity analyzer (lazy initialization)
   */
  get complexity(): ComplexityAnalyzer {
    this._ensureInitialized();
    if (!this._services?.complexityAnalyzer) {
      throw new ServiceNotAvailableError('ComplexityAnalyzer', 'get-complexity');
    }
    return this._services.complexityAnalyzer;
  }

  /**
   * Get the task expansion service (lazy initialization)
   */
  get expansion(): TaskExpansionService {
    this._ensureInitialized();
    if (!this._services?.taskExpansionService) {
      throw new ServiceNotAvailableError('TaskExpansionService', 'get-expansion');
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

  // New Convenience Methods for Tree-Centric API

  /**
   * Get available tasks across the entire project
   * @param filter - Filter options for task selection
   */
  async getAvailableTasks(filter?: AvailableTasksFilter): Promise<TrackingTaskTree[]> {
    const rootTree = await this.tasks();
    const availableTasks = rootTree.getAvailableSubtasks();

    if (!filter) return availableTasks;

    return availableTasks.filter((task) => {
      // Filter by status
      if (filter.status && task.status !== filter.status) {
        return false;
      }

      // Filter by priority score
      if (
        filter.priorityScore !== undefined &&
        (task.task.priorityScore ?? 50) < filter.priorityScore
      ) {
        return false;
      }

      // Filter by parent
      if (filter.parentId !== undefined && task.task.parentId !== filter.parentId) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get the next highest priority available task
   * @param filter - Filter options for task selection
   */
  async getNextTask(filter?: NextTaskFilter): Promise<TrackingTaskTree | null> {
    const parentTree = filter?.parentId ? await this.tasks(filter.parentId) : await this.tasks();
    return parentTree.getNextAvailableTask();
  }

  /**
   * Create a new task as a TrackingTaskTree
   * @param taskData - Task creation data
   * @param parentId - Optional parent task ID
   */
  async createTask(
    taskData: {
      title: string;
      description?: string;
      status?: TaskStatus;
      priorityScore?: number;
    },
    parentId?: string
  ): Promise<TrackingTaskTree> {
    // Create task through store
    const createdTask = await this.store.addTask({
      title: taskData.title,
      description: taskData.description || undefined,
      status: taskData.status || 'pending',
      priorityScore: taskData.priorityScore || 50,
      parentId: parentId || undefined,
    });

    // Return as TrackingTaskTree
    const trackingTree = TrackingTaskTree.fromTask(createdTask);

    // Set up dependency graph integration
    const dependencyGraph = await this.dependencies();
    trackingTree.withDependencyGraph(dependencyGraph);

    return trackingTree;
  }

  /**
   * Create multiple tasks with dependencies in a batch operation
   * @param tasksData - Array of task creation data with optional dependency references
   */
  async createTaskBatch(
    tasksData: Array<{
      title: string;
      description?: string;
      status?: TaskStatus;
      priorityScore?: number;
      parentIndex?: number; // Reference to parent by index in this array
      dependsOn?: number[]; // Array of indices this task depends on
    }>
  ): Promise<TrackingTaskTree[]> {
    const createdTasks: TrackingTaskTree[] = [];
    const dependencyGraph = await this.dependencies();

    // Phase 1: Create all tasks
    for (let i = 0; i < tasksData.length; i++) {
      const taskData = tasksData[i];
      if (!taskData) continue;

      const parentId =
        taskData.parentIndex !== undefined ? createdTasks[taskData.parentIndex]?.id : undefined;

      const task = await this.createTask(taskData, parentId);
      task.withDependencyGraph(dependencyGraph);
      createdTasks.push(task);
    }

    // Phase 2: Set up dependencies
    for (let i = 0; i < tasksData.length; i++) {
      const taskData = tasksData[i];
      if (!taskData?.dependsOn) continue;

      const currentTask = createdTasks[i];
      if (!currentTask) continue;

      for (const depIndex of taskData.dependsOn) {
        const dependencyTask = createdTasks[depIndex];
        if (dependencyTask) {
          currentTask.dependsOn(dependencyTask.id);
        }
      }
    }

    return createdTasks;
  }

  /**
   * Execute a coordinated flush operation across task tree and dependencies
   * @param tree - The TrackingTaskTree to flush
   */
  async flushTree(
    tree: TrackingTaskTree
  ): Promise<import('./entities/TrackingTaskTree.js').EnhancedFlushResult> {
    this._ensureInitialized();
    if (!this._services) {
      throw new ServiceNotAvailableError('Services', 'flush-tree');
    }

    return tree.flushWithDependencies(this._services.taskService, this._services.dependencyService);
  }

  // Private implementation methods

  private async _setupAdapter(): Promise<void> {
    if (this.config.adapter) {
      // Use provided adapter
      this._adapter = this.config.adapter;
      await this._adapter.init();
    } else {
      // Create adapter from URL
      const databaseUrl = this.config.databaseUrl ?? cfg.DATABASE_URI;
      if (!databaseUrl) {
        throw new SDKInitializationError(
          'Database URL is required. Please set DATABASE_URI environment variable or provide databaseUrl in config.',
          'database-url'
        );
      }
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
      throw new AdapterNotAvailableError('migrations');
    }
    return runner.runMigrations(this._adapter, parsed);
  }

  private async _setupServices(): Promise<void> {
    if (!this._adapter) {
      throw new AdapterNotAvailableError('service-setup');
    }

    // Create service configuration
    const serviceConfig: ServiceConfig = {
      adapter: this._adapter,
      complexityConfig: this.config.complexityConfig,
      expansionConfig: this.config.expansionConfig,
    };

    // Initialize services with the unified approach
    const { registry, store, services } = await initializeServices(serviceConfig);
    this.registry = registry;

    // Apply caller overrides if provided
    if (this.config.overrides) {
      this.config.overrides(this.registry);
      // Re-resolve services after overrides
      const taskService = await this.registry.resolve<TaskService>(DependencyType.TASK_SERVICE);
      const dependencyService = await this.registry.resolve<DependencyService>(
        DependencyType.DEPENDENCY_SERVICE
      );
      const complexityAnalyzer = await this.registry
        .resolve<ComplexityAnalyzer>(DependencyType.COMPLEXITY_ANALYZER)
        .catch(() => undefined);
      const taskExpansionService = await this.registry
        .resolve<TaskExpansionService>(DependencyType.TASK_EXPANSION_SERVICE)
        .catch(() => undefined);

      const container: ServiceContainer = {
        store,
        taskService,
        dependencyService,
      };

      if (complexityAnalyzer) {
        container.complexityAnalyzer = complexityAnalyzer;
      }

      if (taskExpansionService) {
        container.taskExpansionService = taskExpansionService;
      }

      this._services = container;
    } else {
      this._services = services;
    }
  }

  private async _cleanup(): Promise<void> {
    try {
      // Close database connection
      if (this._adapter) {
        await this._adapter.close();
      }
    } catch (error) {
      const wrappedError = wrapError(error, 'sdk', 'cleanup');
      logger.warn({ error: wrappedError }, 'Error during cleanup');
    }

    // Clear references
    this._adapter = undefined;
    this._services = undefined;
    this._initialized = false;
  }

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new SDKNotInitializedError();
    }

    if (this._disposed) {
      throw new SDKDisposedError();
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
    throw result.error ?? new SDKInitializationError('Failed to initialize Astrotask SDK');
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
  config: Omit<AstrotaskConfig, 'databaseUrl'> = {}
): Promise<Astrotask> {
  return createAstrotask({
    ...config,
    databaseUrl: TEST_CONFIG.DATABASE_URL,
    overrides(reg) {
      // Apply user-provided overrides first
      config.overrides?.(reg);

      // Then apply our test-specific overrides (these will not replace user overrides due to registry behavior)
      reg.register(DependencyType.LLM_SERVICE, {
        getChatModel: () => {
          // Create a mock that extends a minimal base class
          // This is a hack to avoid the LangChain type checking issues
          const mockLLM = {
            // LangChain Runnable interface methods
            invoke: async (_input: unknown) => {
              return { content: 'Mock response for testing', role: 'assistant' };
            },

            stream: async function* (_input: unknown) {
              yield { content: 'Mock response for testing', role: 'assistant' };
            },

            pipe: (_nextRunnable: unknown) => {
              // Return another mock runnable that implements the chain
              return {
                invoke: async (_input: unknown) => {
                  // Return mock complexity analysis results
                  return [
                    {
                      taskId: 'test-task',
                      taskTitle: 'Test Task',
                      complexityScore: 5,
                      recommendedSubtasks: 3,
                      expansionPrompt: 'Test expansion prompt',
                      reasoning: 'Test reasoning for complexity analysis',
                    },
                  ];
                },

                pipe: (_nextNextRunnable: unknown) => {
                  return {
                    invoke: async (_input: unknown) => {
                      // This handles the final parser in the chain
                      return [
                        {
                          taskId: 'test-task',
                          taskTitle: 'Test Task',
                          complexityScore: 5,
                          recommendedSubtasks: 3,
                          expansionPrompt: 'Test expansion prompt',
                          reasoning: 'Test reasoning for complexity analysis',
                        },
                      ];
                    },
                  };
                },
              };
            },

            // Mock ChatOpenAI specific properties
            modelName: 'gpt-4',
            temperature: 0.7,
            maxTokens: 1000,

            // Add minimal Runnable interface properties that LangChain expects
            lc_runnable: true,
            lc_namespace: ['langchain', 'chat_models', 'openai'],

            // Mock additional methods that might be called
            batch: async (inputs: unknown[]) => {
              return inputs.map(() => ({ content: 'Mock batch response', role: 'assistant' }));
            },
          };

          return mockLLM as unknown as import('@langchain/openai').ChatOpenAI;
        },
      });
    },
  });
}
