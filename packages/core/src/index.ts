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
export { DependencyGraph } from './utils/DependencyGraph.js';

// Schema exports
export {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  taskStatus,
  taskPriority,
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
  type Priority,
} from './schemas/index.js';

// TaskTree utilities
export {
  TaskTree,
  type TaskTreeData,
  type BatchUpdateOperation,
  type TreeMetrics,
} from './utils/TaskTree.js';

// TrackingTaskTree utilities
export {
  TrackingTaskTree,
  type PendingOperation,
  type ReconciliationPlan,
  serializeTrackingState,
  deserializeTrackingState,
} from './utils/TrackingTaskTree.js';

// TrackingDependencyGraph utilities
export {
  TrackingDependencyGraph,
  type DependencyPendingOperation,
  type DependencyReconciliationPlan,
  serializeDependencyTrackingState,
  deserializeDependencyTrackingState,
} from './utils/TrackingDependencyGraph.js';

// TaskTree validation
export {
  validateTaskTree,
  validateTaskTreeData,
  validateMoveOperation,
  validateTaskForest,
  type ValidationWarning,
  type ValidationOptions,
} from './utils/TaskTreeValidation.js';

// TaskTree caching
export {
  TaskTreeCache,
  CachedTaskTreeOperations,
  LRUCache,
  type CacheStats,
  type TaskTreeCacheStats,
  type TaskTreeMetadata,
} from './utils/TaskTreeCache.js';

// Task generation exports
export type {
  TaskGenerator,
  GenerationResult,
} from './services/generators/TaskGenerator.js';
export * from './services/generators/PRDTaskGenerator.js';
export * from './services/generators/schemas.js';

// Configuration and models
export * from './utils/config.js';
export * from './utils/models.js';
export * from './utils/llm.js';

// Re-export task types
export type {
  Task,
  CreateTask as NewTask,
  TaskStatus,
  TaskPriority,
} from './schemas/task.js';
export { taskToApi } from './schemas/task.js';

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
