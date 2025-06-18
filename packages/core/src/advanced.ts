/**
 * Advanced Astrotask APIs
 *
 * This module exports advanced functionality for power users who need
 * lower-level control over the Astrotask system. This includes:
 * - Direct database access and adapters
 * - Advanced data structures (TaskTree, DependencyGraph)
 * - Dependency injection system
 * - Complex tracking and synchronization utilities
 * - Task generation and complexity analysis
 */

// Database layer - direct adapter access
export * from './database/index.js';

// Advanced data structures
export { DependencyGraph } from './entities/DependencyGraph.js';
export {
  TaskTree,
  type TaskTreeData,
  type BatchUpdateOperation,
  type TreeMetrics,
} from './entities/TaskTree.js';

// Tracking and synchronization
export {
  TrackingTaskTree,
  type PendingOperation,
  type ReconciliationPlan,
  serializeTrackingState,
  deserializeTrackingState,
} from './entities/TrackingTaskTree.js';

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

// ID mapping for synchronization
export {
  IdMapper,
  createIdMapper,
  applyIdMappingsToTaskOperations,
  applyIdMappingsToDependencyOperations,
} from './entities/IdMapping.js';

// Tree adapters
export {
  TaskTreeAdapter,
  TrackingTaskTreeAdapter,
  TreeAdapterUtils,
} from './entities/tree-adapters.js';

// Dependency injection system
export { Registry, type Provider } from './services/registry.js';
export { DependencyType } from './services/dependency-type.js';

// Advanced services
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

export {
  TaskExpansionService,
  createTaskExpansionService,
  type TaskExpansionConfig,
  type TaskExpansionInput,
  type TaskExpansionResult,
} from './services/TaskExpansionService.js';

// Task generation
export type {
  TaskGenerator,
  GenerationResult,
} from './services/generators/TaskGenerator.js';
export * from './services/generators/PRDTaskGenerator.js';
export * from './services/generators/schemas.js';

// Caching systems (for performance optimization)
export {
  TaskTreeCache,
  CachedTaskTreeOperations,
  LRUCache,
  type CacheStats,
  type TaskTreeCacheStats,
  type TaskTreeMetadata,
} from './entities/TaskTreeCache.js';
