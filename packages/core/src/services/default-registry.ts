import type { IDatabaseAdapter } from '../database/adapters/index.js';
import { pgliteSchema, postgresSchema, sqliteSchema } from '../database/schema.js';
import { DatabaseStore, type Store } from '../database/store.js';
import { cfg } from '../utils/config.js';
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

/**
 * @deprecated Use `initializeServices` from './service-initialization.js' instead.
 * This function is maintained for backward compatibility.
 */
export function createDefaultRegistry(config: RegistryConfig): DefaultRegistryResult {
  const reg = new Registry();
  const logger = createModuleLogger('ServiceFactory');

  // Get the appropriate schema based on adapter type
  const schema =
    config.adapter.type === 'sqlite'
      ? sqliteSchema
      : config.adapter.type === 'pglite'
        ? pgliteSchema
        : postgresSchema;

  // Create store - this is created directly and not part of the DI system
  // since it's fundamental infrastructure that other services depend on
  const store = new DatabaseStore(
    config.adapter.rawClient,
    config.adapter.drizzle,
    schema,
    cfg.STORE_IS_ENCRYPTED
  );

  reg
    .register(DT.LLM_SERVICE, () => new DefaultLLMService())
    .register(DT.COMPLEXITY_ANALYZER, async () => {
      const llmService = await reg.resolve<ILLMService>(DT.LLM_SERVICE);
      return createComplexityAnalyzer(
        logger,
        {
          threshold: config.complexityConfig?.threshold ?? cfg.COMPLEXITY_THRESHOLD,
          research: config.complexityConfig?.research ?? cfg.COMPLEXITY_RESEARCH,
          batchSize: config.complexityConfig?.batchSize ?? cfg.COMPLEXITY_BATCH_SIZE,
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
            config.expansionConfig?.useComplexityAnalysis ?? cfg.EXPANSION_USE_COMPLEXITY_ANALYSIS,
          research: config.expansionConfig?.research ?? cfg.EXPANSION_RESEARCH,
          complexityThreshold:
            config.expansionConfig?.complexityThreshold ?? cfg.EXPANSION_COMPLEXITY_THRESHOLD,
          defaultSubtasks:
            config.expansionConfig?.defaultSubtasks ?? cfg.EXPANSION_DEFAULT_SUBTASKS,
          maxSubtasks: config.expansionConfig?.maxSubtasks ?? cfg.EXPANSION_MAX_SUBTASKS,
          forceReplace: config.expansionConfig?.forceReplace ?? cfg.EXPANSION_FORCE_REPLACE,
          createContextSlices:
            config.expansionConfig?.createContextSlices ?? cfg.EXPANSION_CREATE_CONTEXT_SLICES,
        },
        llmService
      );
    });

  return { registry: reg, store };
}
