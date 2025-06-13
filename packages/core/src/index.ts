/**
 * Astrolabe - A local-first, MCP-compatible task-navigation platform
 * Entry point for the application
 */

import { pathToFileURL } from 'node:url';
// Import centralised configuration
import { cfg } from './utils/config.js';
import { createModuleLogger, logShutdown } from './utils/logger.js';

export const APP_VERSION = '0.1.0';
export const APP_NAME = 'Astrolabe';

// Core functionality
export * from './database/index.js';
export { TaskService } from './services/TaskService.js';
export { DependencyService } from './services/DependencyService.js';
export { DependencyGraph } from './entities/DependencyGraph.js';

// Service initialization (unified approach)
export {
  initializeServices,
  createServiceContainer,
  type ServiceConfig,
  type ServiceContainer,
  type ServiceInitializationResult,
} from './services/service-initialization.js';

// Dependency Injection system
export { Registry, type Provider } from './services/registry.js';
export { DependencyType } from './services/dependency-type.js';

// Configuration constants
export { TEST_CONFIG } from './utils/config.js';

// Error handling
export * from './errors/index.js';

// Astrotask SDK - Main entry point
export {
  Astrotask,
  createAstrotask,
  createAstrotaskWithDatabase,
  createInMemoryAstrotask,
  createTestAstrotask,
  type AstrotaskConfig,
  type InitializationResult,
} from './Astrotask.js';

// Schema exports
export {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  taskStatus,
  validateTask,
  contextSliceSchema,
  createContextSliceSchema,
  updateContextSliceSchema,
  validateContextSlice,
  taskDependencySchema,
  createTaskDependencySchema,
  taskDependencyGraphSchema,
  taskWithDependenciesSchema,
  dependencyValidationResultSchema,
  taskDependencyApiSchema,
  createTaskDependencyApiSchema,
  taskDependencyToApi,
  taskDependencyFromApi,
  uuid,
  optionalUuid,
  title,
  description,
  uuidPattern,
  CONSTRAINTS,
  safeParseSchema,
  validateWithErrors,
  validateBySchemaKey,
  isTask,
  isContextSlice,
  isValidUuid,
  validateStringConstraints,
  type ValidationError,
  type ValidationResult,
} from './schemas/index.js';

// TaskTree utilities
export {
  TaskTree,
  type TaskTreeData,
  type BatchUpdateOperation,
  type TreeMetrics,
} from './entities/TaskTree.js';

// TaskTree constants
export { TASK_IDENTIFIERS } from './entities/TaskTreeConstants.js';

// TrackingTaskTree utilities
export {
  TrackingTaskTree,
  type PendingOperation,
  type ReconciliationPlan,
  serializeTrackingState,
  deserializeTrackingState,
} from './entities/TrackingTaskTree.js';

// TrackingDependencyGraph utilities
export {
  TrackingDependencyGraph,
  type DependencyPendingOperation,
  type DependencyReconciliationPlan,
  serializeDependencyTrackingState,
  deserializeDependencyTrackingState,
} from './entities/TrackingDependencyGraph.js';

// Tracking service interfaces and types
export type {
  ITaskReconciliationService,
  IDependencyReconciliationService,
  TaskFlushResult,
  DependencyFlushResult,
  FlushMetadata,
} from './entities/TrackingTypes.js';

// Tracking error types
export {
  TrackingError,
  ReconciliationError,
  OperationConsolidationError,
  IdMappingError,
  StructureValidationError,
} from './entities/TrackingErrors.js';

// ID mapping utilities
export {
  IdMapper,
  createIdMapper,
  applyIdMappingsToTaskOperations,
  applyIdMappingsToDependencyOperations,
} from './entities/IdMapping.js';

// TaskTree validation
export {
  validateTaskTree,
  validateTaskTreeData,
  validateMoveOperation,
  validateTaskForest,
  type ValidationWarning,
  type ValidationOptions,
} from './entities/TaskTreeValidation.js';

// TaskTree caching
export {
  TaskTreeCache,
  CachedTaskTreeOperations,
  LRUCache,
  type CacheStats,
  type TaskTreeCacheStats,
  type TaskTreeMetadata,
} from './entities/TaskTreeCache.js';

// Tree operations utilities
export {
  type TreeNode,
  type TreeVisitor,
  type TreePredicate,
  TreeTraversal,
  TreeSearch,
  TreeAnalysis,
  TreeTransform,
  TreeValidation,
  TreeBatch,
} from './entities/tree-operations.js';

export {
  TaskTreeAdapter,
  TrackingTaskTreeAdapter,
  TreeAdapterUtils,
} from './entities/tree-adapters.js';

// Task generation exports
export type {
  TaskGenerator,
  GenerationResult,
} from './services/generators/TaskGenerator.js';
export * from './services/generators/PRDTaskGenerator.js';
export * from './services/generators/schemas.js';

// Complexity analysis exports
export {
  ComplexityAnalyzer,
  createComplexityAnalyzer,
  taskComplexitySchema,
  complexityReportSchema,
  type TaskComplexity,
  type ComplexityReport,
  type ComplexityAnalysisConfig,
} from './services/ComplexityAnalyzer.js';
export {
  ComplexityContextService,
  createComplexityContextService,
  type ComplexityContextConfig,
} from './services/ComplexityContextService.js';

// Task expansion exports
export {
  TaskExpansionService,
  createTaskExpansionService,
  type TaskExpansionConfig,
  type TaskExpansionInput,
  type TaskExpansionResult,
} from './services/TaskExpansionService.js';

// LLM service exports
export {
  type ILLMService,
  type LLMConfig,
  DefaultLLMService,
  createLLMService,
} from './services/LLMService.js';

// Configuration and models
export * from './utils/config.js';
export * from './utils/models.js';

// Acceptance criteria utilities
export * from './utils/acceptanceCriteria.js';

// Re-export task types
export type {
  Task,
  CreateTask,
  TaskStatus,
  PriorityScore,
  PriorityLevel,
} from './schemas/task.js';
export {
  taskToApi,
  scoreToPriorityLevel,
  priorityLevelToScore,
  getEffectivePriorityScore,
  priorityScore,
} from './schemas/task.js';

// Re-export context slice types
export type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from './schemas/contextSlice.js';

// Re-export dependency types
export type {
  TaskDependency,
  CreateTaskDependency,
  TaskDependencyGraph,
  TaskWithDependencies,
  DependencyValidationResult,
  TaskDependencyApi,
  CreateTaskDependencyApi,
} from './schemas/dependency.js';

// Status transition validation
export {
  isValidStatusTransition,
  canTransitionStatus,
  getTransitionRejectionReason,
  validateStatusTransition,
  taskStatusTransitions,
  type StatusTransitionResult,
} from './utils/statusTransitions.js';

// Create application logger
const logger = createModuleLogger('App');

// Test function to verify TypeScript compilation
export function greet(name: string): string {
  return `Hello, ${name}! Welcome to ${APP_NAME} v${APP_VERSION}`;
}

const isEntrypoint = process.argv && import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isEntrypoint) {
  // Example usage of the logger in development
  if (cfg.NODE_ENV === 'development') {
    logger.info('Starting application in development mode', {
      environment: cfg.NODE_ENV,
      port: cfg.PORT,
      logLevel: cfg.LOG_LEVEL,
    });

    logger.info(greet('Developer'));
    logger.info('Application initialized', { version: APP_VERSION });

    // Set up graceful shutdown handling
    process.on('SIGTERM', () => {
      logShutdown(logger, 'SIGTERM', async () => {
        logger.info('Performing cleanup...');
        // Add any cleanup logic here
      });
    });

    process.on('SIGINT', () => {
      logShutdown(logger, 'SIGINT', async () => {
        logger.info('Performing cleanup...');
        // Add any cleanup logic here
      });
    });
  }
}

// Re-export logger utilities
export { createModuleLogger, logError, logShutdown, startTimer } from './utils/logger.js';

// Re-export task ID utilities
export {
  generateNextTaskId,
  generateNextRootTaskId,
  generateNextSubtaskId,
  validateTaskId,
  validateSubtaskId,
  parseTaskId,
  TaskIdGenerationError,
} from './utils/taskId.js';
