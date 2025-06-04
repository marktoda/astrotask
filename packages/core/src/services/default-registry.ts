import { DEFAULT_CONFIG } from '../constants/defaults.js';
import type { IDatabaseAdapter } from '../database/adapters/index.js';
import { DatabaseStore, type Store } from '../database/store.js';
import { createModuleLogger } from '../utils/logger.js';
import { createComplexityAnalyzer } from './ComplexityAnalyzer.js';
import { DependencyService } from './DependencyService.js';
import { DefaultLLMService, type ILLMService } from './LLMService.js';
import { createTaskExpansionService } from './TaskExpansionService.js';
import { TaskService } from './TaskService.js';
import { DependencyType as DT } from './dependency-type.js';
import { Registry } from './registry.js';

export interface RegistryConfig {
  adapter: IDatabaseAdapter;
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

export interface DefaultRegistryResult {
  registry: Registry;
  store: Store;
}

export function createDefaultRegistry(config: RegistryConfig): DefaultRegistryResult {
  const reg = new Registry();
  const logger = createModuleLogger('ServiceFactory');

  // Create store - this is created directly and not part of the DI system
  // since it's fundamental infrastructure that other services depend on
  const store = new DatabaseStore(
    config.adapter.client,
    config.adapter.drizzle,
    DEFAULT_CONFIG.STORE.IS_SYNCING,
    DEFAULT_CONFIG.STORE.IS_ENCRYPTED
  );

  reg
    .register(DT.LLM_SERVICE, () => new DefaultLLMService())
    .register(DT.COMPLEXITY_ANALYZER, async () => {
      const llmService = await reg.resolve<ILLMService>(DT.LLM_SERVICE);
      return createComplexityAnalyzer(
        logger,
        {
          threshold: config.complexityConfig?.threshold ?? DEFAULT_CONFIG.COMPLEXITY.THRESHOLD,
          research: config.complexityConfig?.research ?? DEFAULT_CONFIG.COMPLEXITY.RESEARCH,
          batchSize: config.complexityConfig?.batchSize ?? DEFAULT_CONFIG.COMPLEXITY.BATCH_SIZE,
        },
        llmService
      );
    })
    .register(DT.TASK_SERVICE, () => new TaskService(store))
    .register(DT.DEPENDENCY_SERVICE, () => new DependencyService(store))
    .register(DT.TASK_EXPANSION_SERVICE, async () => {
      const llmService = await reg.resolve<ILLMService>(DT.LLM_SERVICE);
      return createTaskExpansionService(
        logger,
        store,
        await reg.resolve<TaskService>(DT.TASK_SERVICE),
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
        llmService
      );
    });

  return { registry: reg, store };
}
