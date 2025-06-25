/**
 * Astrotask Core - A local-first, MCP-compatible task management platform
 *
 * This is the main entry point providing essential functionality for most users.
 * For specialized functionality, see:
 * - @astrotask/core/advanced - Advanced data structures and power-user APIs
 * - @astrotask/core/validation - Comprehensive validation toolkit
 * - @astrotask/core/tree - Tree operations and utilities
 * - @astrotask/core/llm - LLM and AI services
 * - @astrotask/core/utils - Utility functions
 * - @astrotask/core/errors - Error handling
 */

// Core SDK - Main entry points
export {
  Astrotask,
  createAstrotask,
  createAstrotaskWithDatabase,
  createInMemoryAstrotask,
  createTestAstrotask,
  type AstrotaskConfig,
  type InitializationResult,
  type AvailableTasksFilter,
  type NextTaskFilter,
} from './Astrotask.js';

// Core services
export { TaskService } from './services/TaskService.js';
export { DependencyService } from './services/DependencyService.js';

// Service initialization
export {
  initializeServices,
  createServiceContainer,
  type ServiceConfig,
  type ServiceContainer,
  type ServiceInitializationResult,
} from './services/service-initialization.js';

// Essential types
export type {
  Task,
  CreateTask,
  TaskStatus,
  PriorityScore,
  PriorityLevel,
} from './schemas/task.js';

export type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from './schemas/contextSlice.js';

export type {
  TaskDependency,
  CreateTaskDependency,
  TaskDependencyGraph,
  TaskWithDependencies,
  DependencyValidationResult,
} from './schemas/dependency.js';

// Basic validation - most commonly used schemas
export {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  taskStatus,
  priorityScore,
  validateTask,
  contextSliceSchema,
  createContextSliceSchema,
  updateContextSliceSchema,
  validateContextSlice,
  taskDependencySchema,
  createTaskDependencySchema,
} from './schemas/index.js';

// Database exports
export { createDatabase } from './database/index.js';

export type {
  DatabaseOptions,
  Store,
} from './database/index.js';

// Utility exports
export {
  createModuleLogger,
  logShutdown,
  cfg,
  validateTaskId,
} from './utils.js';

// Tree exports
export type { TaskTreeData } from './tree.js';

export { TaskTree } from './tree.js';

export { TrackingTaskTree } from './entities/TrackingTaskTree.js';

export { TrackingDependencyGraph } from './entities/TrackingDependencyGraph.js';

export { TASK_IDENTIFIERS } from './tree.js';

// LLM and service exports
export {
  createLLMService,
  createComplexityAnalyzer,
  createComplexityContextService,
  createTaskExpansionService,
  createPRDTaskGenerator,
} from './llm.js';

export type {
  TaskExpansionConfig,
  TaskExpansionResult,
  GenerationError,
} from './llm.js';

// Basic error types - most commonly needed
export {
  AstrotaskError,
  wrapError,
  isAstrotaskError,
  SDKError,
  SDKInitializationError,
  SDKNotInitializedError,
  ServiceError,
  TaskNotFoundError,
  TaskOperationError,
  DependencyValidationError,
} from './errors/index.js';
