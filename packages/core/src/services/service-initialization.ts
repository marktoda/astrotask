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
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
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

const logger = createModuleLogger('ServiceInitialization');

/**
 * Configuration for service initialization
 */
export interface ServiceConfig {
  /** Database adapter instance */
  adapter: IDatabaseAdapter;
  
  /** Optional custom LLM service (defaults to DefaultLLMService) */
  llmService?: ILLMService;
  
  /** Complexity analyzer configuration */
  complexityConfig?: {
    threshold?: number;
    research?: boolean;
    batchSize?: number;
  } | undefined;
  
  /** Task expansion configuration */
  expansionConfig?: {
    useComplexityAnalysis?: boolean;
    research?: boolean;
    complexityThreshold?: number;
    defaultSubtasks?: number;
    maxSubtasks?: number;
    forceReplace?: boolean;
    createContextSlices?: boolean;
  } | undefined;
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
export async function initializeServices(config: ServiceConfig): Promise<ServiceInitializationResult> {
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
    cfg.STORE_IS_ENCRYPTED
  );
  
  // Register services with dependency injection
  configureRegistry(registry, store, config);
  
  // Resolve all services
  const services = await resolveServices(registry, store);
  
  logger.debug('Service initialization complete');
  
  return { registry, store, services };
}

/**
 * Configure the dependency injection registry
 */
function configureRegistry(registry: Registry, store: Store, config: ServiceConfig): void {
  // LLM Service (use provided or default)
  registry.register(DependencyType.LLM_SERVICE, 
    config.llmService ?? (() => new DefaultLLMService())
  );
  
  // Task Service
  registry.register(DependencyType.TASK_SERVICE, () => new TaskServiceImpl(store));
  
  // Dependency Service
  registry.register(DependencyType.DEPENDENCY_SERVICE, () => new DependencyServiceImpl(store));
  
  // Complexity Analyzer (depends on LLM)
  registry.register(DependencyType.COMPLEXITY_ANALYZER, async () => {
    const llmService = await registry.resolve<ILLMService>(DependencyType.LLM_SERVICE);
    return createComplexityAnalyzer(
      logger,
      {
        threshold: config.complexityConfig?.threshold ?? cfg.COMPLEXITY_THRESHOLD,
        research: config.complexityConfig?.research ?? cfg.COMPLEXITY_RESEARCH,
        batchSize: config.complexityConfig?.batchSize ?? cfg.COMPLEXITY_BATCH_SIZE,
      },
      llmService
    );
  });
  
  // Task Expansion Service (depends on LLM and TaskService)
  registry.register(DependencyType.TASK_EXPANSION_SERVICE, async () => {
    const [llmService, taskService] = await Promise.all([
      registry.resolve<ILLMService>(DependencyType.LLM_SERVICE),
      registry.resolve<TaskService>(DependencyType.TASK_SERVICE)
    ]);
    
    return createTaskExpansionService(
      logger,
      store,
      taskService,
      {
        useComplexityAnalysis:
          config.expansionConfig?.useComplexityAnalysis ?? cfg.EXPANSION_USE_COMPLEXITY_ANALYSIS,
        research: config.expansionConfig?.research ?? cfg.EXPANSION_RESEARCH,
        complexityThreshold:
          config.expansionConfig?.complexityThreshold ?? cfg.EXPANSION_COMPLEXITY_THRESHOLD,
        defaultSubtasks: config.expansionConfig?.defaultSubtasks ?? cfg.EXPANSION_DEFAULT_SUBTASKS,
        maxSubtasks: config.expansionConfig?.maxSubtasks ?? cfg.EXPANSION_MAX_SUBTASKS,
        forceReplace: config.expansionConfig?.forceReplace ?? cfg.EXPANSION_FORCE_REPLACE,
        createContextSlices:
          config.expansionConfig?.createContextSlices ?? cfg.EXPANSION_CREATE_CONTEXT_SLICES,
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
  const [taskService, dependencyService, complexityAnalyzer, taskExpansionService] = await Promise.all([
    registry.resolve<TaskService>(DependencyType.TASK_SERVICE),
    registry.resolve<DependencyService>(DependencyType.DEPENDENCY_SERVICE),
    registry.resolve<ComplexityAnalyzer>(DependencyType.COMPLEXITY_ANALYZER).catch(() => undefined),
    registry.resolve<TaskExpansionService>(DependencyType.TASK_EXPANSION_SERVICE).catch(() => undefined)
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