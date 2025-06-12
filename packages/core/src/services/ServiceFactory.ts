/**
 * Service Factory - Handles initialization and composition of all Astrotask services
 */

import type { IDatabaseAdapter } from '../database/adapters/index.js';
import { pgliteSchema, postgresSchema, sqliteSchema } from '../database/schema.js';
import { DatabaseStore, type Store } from '../database/store.js';
import { cfg } from '../utils/config.js';
import { createModuleLogger } from '../utils/logger.js';
import { type ComplexityAnalyzer, createComplexityAnalyzer } from './ComplexityAnalyzer.js';
import { DependencyService } from './DependencyService.js';
import { DefaultLLMService, type ILLMService } from './LLMService.js';
import { type TaskExpansionService, createTaskExpansionService } from './TaskExpansionService.js';
import { TaskService } from './TaskService.js';

const logger = createModuleLogger('ServiceFactory');

export interface ServiceContainer {
  store: Store;
  taskService: TaskService;
  dependencyService: DependencyService;
  complexityAnalyzer?: ComplexityAnalyzer | undefined;
  taskExpansionService?: TaskExpansionService | undefined;
}

export interface ServiceFactoryConfig {
  adapter: IDatabaseAdapter;
  llmService?: ILLMService | undefined;
  complexityConfig?:
    | {
        threshold?: number;
        research?: boolean;
        batchSize?: number;
      }
    | undefined;
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

export function createServices(config: ServiceFactoryConfig): ServiceContainer {
  const { adapter, llmService } = config;

  // Get the appropriate schema based on adapter type
  const schema =
    adapter.type === 'sqlite'
      ? sqliteSchema
      : adapter.type === 'pglite'
        ? pgliteSchema
        : postgresSchema;

  // Create store
  const store = new DatabaseStore(
    adapter.rawClient,
    adapter.drizzle,
    schema,
    cfg.STORE_IS_ENCRYPTED
  );

  // Create core services
  const taskService = new TaskService(store);
  const dependencyService = new DependencyService(store);

  // Create optional services that depend on LLM
  const effectiveLLMService = llmService ?? new DefaultLLMService();
  let complexityAnalyzer: ComplexityAnalyzer | undefined;
  let taskExpansionService: TaskExpansionService | undefined;

  if (effectiveLLMService) {
    // Create complexity analyzer
    complexityAnalyzer = createComplexityAnalyzer(
      logger,
      {
        threshold: config.complexityConfig?.threshold ?? cfg.COMPLEXITY_THRESHOLD,
        research: config.complexityConfig?.research ?? cfg.COMPLEXITY_RESEARCH,
        batchSize: config.complexityConfig?.batchSize ?? cfg.COMPLEXITY_BATCH_SIZE,
      },
      effectiveLLMService
    );

    // Create task expansion service
    taskExpansionService = createTaskExpansionService(
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
      effectiveLLMService
    );
  }

  return {
    store,
    taskService,
    dependencyService,
    complexityAnalyzer,
    taskExpansionService,
  };
}
