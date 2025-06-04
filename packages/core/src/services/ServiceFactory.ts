/**
 * Service Factory - Handles initialization and composition of all Astrotask services
 */

import { DEFAULT_CONFIG } from '../constants/defaults.js';
import type { IDatabaseAdapter } from '../database/adapters/index.js';
import { DatabaseStore, type Store } from '../database/store.js';
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

  // Create store
  const store = new DatabaseStore(
    adapter.client,
    adapter.drizzle,
    DEFAULT_CONFIG.STORE.IS_SYNCING,
    DEFAULT_CONFIG.STORE.IS_ENCRYPTED
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
        threshold: config.complexityConfig?.threshold ?? DEFAULT_CONFIG.COMPLEXITY.THRESHOLD,
        research: config.complexityConfig?.research ?? DEFAULT_CONFIG.COMPLEXITY.RESEARCH,
        batchSize: config.complexityConfig?.batchSize ?? DEFAULT_CONFIG.COMPLEXITY.BATCH_SIZE,
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
          config.expansionConfig?.useComplexityAnalysis ??
          DEFAULT_CONFIG.EXPANSION.USE_COMPLEXITY_ANALYSIS,
        research: config.expansionConfig?.research ?? DEFAULT_CONFIG.EXPANSION.RESEARCH,
        complexityThreshold:
          config.expansionConfig?.complexityThreshold ??
          DEFAULT_CONFIG.EXPANSION.COMPLEXITY_THRESHOLD,
        defaultSubtasks:
          config.expansionConfig?.defaultSubtasks ?? DEFAULT_CONFIG.EXPANSION.DEFAULT_SUBTASKS,
        maxSubtasks: config.expansionConfig?.maxSubtasks ?? DEFAULT_CONFIG.EXPANSION.MAX_SUBTASKS,
        forceReplace:
          config.expansionConfig?.forceReplace ?? DEFAULT_CONFIG.EXPANSION.FORCE_REPLACE,
        createContextSlices:
          config.expansionConfig?.createContextSlices ??
          DEFAULT_CONFIG.EXPANSION.CREATE_CONTEXT_SLICES,
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
