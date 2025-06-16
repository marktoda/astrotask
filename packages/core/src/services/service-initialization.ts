/**
 * Unified Service Initialization
 *
 * This module provides the single, consistent way to initialize Astrotask services.
 * It consolidates the best aspects of both ServiceFactory and default-registry patterns:
 * - Dependency injection from the Registry pattern for flexibility
 * - Clear service container interface from ServiceFactory for ease of use
 * - Proper separation of concerns and testability
 */

import type { IDatabaseAdapter } from '../database/adapters/index.js';
import { pgliteSchema, postgresSchema, sqliteSchema } from '../database/schema.js';
import { DatabaseStore, type Store } from '../database/store.js';
import type { AppConfig } from '../utils/config.js';
import { cfg } from '../utils/config.js';
import { type LoggerFactory, createLoggerFactory } from '../utils/logger.js';
import type { ComplexityAnalyzer } from './ComplexityAnalyzer.js';
import { createComplexityAnalyzer } from './ComplexityAnalyzer.js';
import type { DependencyService } from './DependencyService.js';
import { DependencyService as DependencyServiceImpl } from './DependencyService.js';
import { DefaultLLMService, type ILLMService } from './LLMService.js';
import type { TaskExpansionService } from './TaskExpansionService.js';
import { createTaskExpansionService } from './TaskExpansionService.js';
import type { TaskService } from './TaskService.js';
import { TaskService as TaskServiceImpl } from './TaskService.js';
import { DependencyType } from './dependency-type.js';
import { Registry } from './registry.js';

/**
 * Configuration for service initialization
 */
export interface ServiceConfig {
  /** Database adapter instance */
  adapter: IDatabaseAdapter;

  /** Application configuration (defaults to global cfg) */
  appConfig?: AppConfig;

  /** Optional custom logger factory */
  loggerFactory?: LoggerFactory;

  /** Optional custom LLM service (defaults to DefaultLLMService) */
  llmService?: ILLMService;

  /** Complexity analyzer configuration */
  complexityConfig?:
    | {
        threshold?: number;
        research?: boolean;
        batchSize?: number;
      }
    | undefined;

  /** Task expansion configuration */
  expansionConfig?:
    | {
        useComplexityAnalysis?: boolean;
        research?: boolean;
        complexityThreshold?: number;
        defaultSubtasks?: number;
        maxSubtasks?: number;
        forceReplace?: boolean;
        createContextSlices?: boolean;
      }
    | undefined;
}

/**
 * Container for all initialized services
 */
export interface ServiceContainer {
  /** Database store instance */
  store: Store;
  /** Task management service */
  taskService: TaskService;
  /** Dependency management service */
  dependencyService: DependencyService;
  /** Complexity analysis service (optional if no LLM) */
  complexityAnalyzer?: ComplexityAnalyzer;
  /** Task expansion service (optional if no LLM) */
  taskExpansionService?: TaskExpansionService;
}

/**
 * Result of service initialization
 */
export interface ServiceInitializationResult {
  /** Configured dependency injection registry */
  registry: Registry;
  /** Database store (not part of DI as it's fundamental infrastructure) */
  store: Store;
  /** Container with all resolved services */
  services: ServiceContainer;
}

/**
 * Initialize all Astrotask services with proper dependency injection
 *
 * This is the unified way to set up services, replacing both the legacy
 * ServiceFactory pattern and the raw Registry pattern. It provides:
 * - Clear configuration interface
 * - Proper dependency injection
 * - Easy access to all services
 * - Flexibility for testing and customization
 */
export async function initializeServices(
  config: ServiceConfig
): Promise<ServiceInitializationResult> {
  // Use provided config or fall back to global cfg with defaults
  const appConfig = config.appConfig ?? {
    NODE_ENV: cfg.NODE_ENV ?? 'development',
    PORT: cfg.PORT ?? 3000,
    LOG_LEVEL: cfg.LOG_LEVEL ?? 'info',
    CLI_MODE: cfg.CLI_MODE ?? false,
    DATABASE_URI: cfg.DATABASE_URI ?? '',
    DB_VERBOSE: cfg.DB_VERBOSE ?? false,
    DB_TIMEOUT: cfg.DB_TIMEOUT ?? 5000,
    OPENAI_API_KEY: cfg.OPENAI_API_KEY ?? '',
    LLM_MODEL: cfg.LLM_MODEL ?? 'gpt-4',
    DEV_SERVER_HOST: cfg.DEV_SERVER_HOST ?? 'localhost',
    DEV_SERVER_PORT: cfg.DEV_SERVER_PORT ?? 5173,
    COMPLEXITY_THRESHOLD: cfg.COMPLEXITY_THRESHOLD ?? 7,
    COMPLEXITY_RESEARCH: cfg.COMPLEXITY_RESEARCH ?? false,
    COMPLEXITY_BATCH_SIZE: cfg.COMPLEXITY_BATCH_SIZE ?? 10,
    EXPANSION_USE_COMPLEXITY_ANALYSIS: cfg.EXPANSION_USE_COMPLEXITY_ANALYSIS ?? true,
    EXPANSION_RESEARCH: cfg.EXPANSION_RESEARCH ?? false,
    EXPANSION_COMPLEXITY_THRESHOLD: cfg.EXPANSION_COMPLEXITY_THRESHOLD ?? 7,
    EXPANSION_DEFAULT_SUBTASKS: cfg.EXPANSION_DEFAULT_SUBTASKS ?? 5,
    EXPANSION_MAX_SUBTASKS: cfg.EXPANSION_MAX_SUBTASKS ?? 10,
    EXPANSION_FORCE_REPLACE: cfg.EXPANSION_FORCE_REPLACE ?? false,
    EXPANSION_CREATE_CONTEXT_SLICES: cfg.EXPANSION_CREATE_CONTEXT_SLICES ?? true,
    STORE_IS_ENCRYPTED: cfg.STORE_IS_ENCRYPTED ?? false,
  };

  // Use provided logger factory or create one with appConfig
  const loggerFactory = config.loggerFactory ?? createLoggerFactory(appConfig);
  const logger = loggerFactory.createModuleLogger('ServiceInitialization');

  logger.debug('Initializing Astrotask services');

  // Create registry
  const registry = new Registry();

  // Determine schema based on adapter type
  const schema = getSchemaForAdapter(config.adapter);

  // Create store directly (not part of DI as it's fundamental)
  const store = new DatabaseStore(
    config.adapter.rawClient,
    config.adapter.drizzle,
    schema,
    appConfig.STORE_IS_ENCRYPTED
  );

  // Register services with dependency injection
  configureRegistry(registry, store, config, appConfig, loggerFactory);

  // Resolve all services
  const services = await resolveServices(registry, store);

  logger.debug('Service initialization complete');

  return { registry, store, services };
}

/**
 * Configure the dependency injection registry
 */
function configureRegistry(
  registry: Registry,
  store: Store,
  config: ServiceConfig,
  appConfig: AppConfig,
  loggerFactory: LoggerFactory
): void {
  // LLM Service (use provided or default)
  registry.register(
    DependencyType.LLM_SERVICE,
    config.llmService ?? (() => new DefaultLLMService(appConfig))
  );

  // Task Service
  registry.register(DependencyType.TASK_SERVICE, () => new TaskServiceImpl(store));

  // Dependency Service
  registry.register(DependencyType.DEPENDENCY_SERVICE, () => new DependencyServiceImpl(store));

  // Complexity Analyzer (depends on LLM)
  registry.register(DependencyType.COMPLEXITY_ANALYZER, async () => {
    const llmService = await registry.resolve<ILLMService>(DependencyType.LLM_SERVICE);
    const logger = loggerFactory.createModuleLogger('ComplexityAnalyzer');
    return createComplexityAnalyzer(
      logger,
      {
        threshold: config.complexityConfig?.threshold ?? appConfig.COMPLEXITY_THRESHOLD,
        research: config.complexityConfig?.research ?? appConfig.COMPLEXITY_RESEARCH,
        batchSize: config.complexityConfig?.batchSize ?? appConfig.COMPLEXITY_BATCH_SIZE,
      },
      llmService
    );
  });

  // Task Expansion Service (depends on LLM and TaskService)
  registry.register(DependencyType.TASK_EXPANSION_SERVICE, async () => {
    const [llmService, taskService] = await Promise.all([
      registry.resolve<ILLMService>(DependencyType.LLM_SERVICE),
      registry.resolve<TaskService>(DependencyType.TASK_SERVICE),
    ]);

    const logger = loggerFactory.createModuleLogger('TaskExpansionService');
    return createTaskExpansionService(
      logger,
      store,
      taskService,
      {
        useComplexityAnalysis:
          config.expansionConfig?.useComplexityAnalysis ??
          appConfig.EXPANSION_USE_COMPLEXITY_ANALYSIS,
        research: config.expansionConfig?.research ?? appConfig.EXPANSION_RESEARCH,
        complexityThreshold:
          config.expansionConfig?.complexityThreshold ?? appConfig.EXPANSION_COMPLEXITY_THRESHOLD,
        defaultSubtasks:
          config.expansionConfig?.defaultSubtasks ?? appConfig.EXPANSION_DEFAULT_SUBTASKS,
        maxSubtasks: config.expansionConfig?.maxSubtasks ?? appConfig.EXPANSION_MAX_SUBTASKS,
        forceReplace: config.expansionConfig?.forceReplace ?? appConfig.EXPANSION_FORCE_REPLACE,
        createContextSlices:
          config.expansionConfig?.createContextSlices ?? appConfig.EXPANSION_CREATE_CONTEXT_SLICES,
      },
      llmService
    );
  });
}

/**
 * Resolve all services from the registry
 */
async function resolveServices(registry: Registry, store: Store): Promise<ServiceContainer> {
  // Resolve all services in parallel where possible
  const [taskService, dependencyService, complexityAnalyzer, taskExpansionService] =
    await Promise.all([
      registry.resolve<TaskService>(DependencyType.TASK_SERVICE),
      registry.resolve<DependencyService>(DependencyType.DEPENDENCY_SERVICE),
      registry
        .resolve<ComplexityAnalyzer>(DependencyType.COMPLEXITY_ANALYZER)
        .catch(() => undefined),
      registry
        .resolve<TaskExpansionService>(DependencyType.TASK_EXPANSION_SERVICE)
        .catch(() => undefined),
    ]);

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

  return container;
}

/**
 * Get the appropriate schema for the adapter type
 */
function getSchemaForAdapter(adapter: IDatabaseAdapter) {
  switch (adapter.type) {
    case 'sqlite':
      return sqliteSchema;
    case 'pglite':
      return pgliteSchema;
    case 'postgres':
      return postgresSchema;
    default:
      throw new Error(`Unsupported adapter type: ${adapter.type}`);
  }
}

/**
 * Create a service container with custom overrides (for testing)
 *
 * This allows partial service replacement while maintaining proper DI
 */
export async function createServiceContainer(
  config: ServiceConfig,
  overrides?: (registry: Registry) => void
): Promise<ServiceContainer> {
  const { registry, store, services } = await initializeServices(config);

  if (overrides) {
    overrides(registry);
    // Re-resolve services after overrides
    return resolveServices(registry, store);
  }

  return services;
}
