/**
 * @fileoverview Entities module - Task tree and dependency graph management
 *
 * This module provides the core entity classes for managing task hierarchies
 * and dependency relationships in Astrolabe. It includes both basic immutable
 * data structures and tracking variants for optimistic updates.
 *
 * @module entities
 * @since 1.0.0
 */

// Task Tree exports
export { TaskTree, type TaskTreeData, type BatchUpdateOperation, type TreeMetrics } from './TaskTree.js';
export { 
  TrackingTaskTree, 
  type PendingOperation as TaskPendingOperation, 
  type ReconciliationPlan as TaskReconciliationPlan,
  serializeTrackingState,
  deserializeTrackingState
} from './TrackingTaskTree.js';
export { 
  TaskTreeCache, 
  LRUCache, 
  CachedTaskTreeOperations,
  type CacheEntry,
  type CacheOptions,
  type CacheStats,
  type TaskTreeMetadata,
  type TaskTreeCacheStats
} from './TaskTreeCache.js';
export {
  validateTaskTree,
  validateMoveOperation,
  validateTaskForest,
  validateTaskTreeData,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationOptions
} from './TaskTreeValidation.js';
export {
  TASK_IDENTIFIERS,
  CACHE_CONFIG,
  VALIDATION_CONFIG,
  TRAVERSAL_CONFIG
} from './TaskTreeConstants.js';

// Dependency Graph exports
export { 
  DependencyGraph, 
  type DependencyGraphData,
  type TaskData,
  type DependencyNode,
  type CycleDetectionResult,
  type DependencyGraphMetrics
} from './DependencyGraph.js';
export {
  TrackingDependencyGraph,
  type DependencyPendingOperation,
  type DependencyReconciliationPlan,
  serializeDependencyTrackingState,
  deserializeDependencyTrackingState
} from './TrackingDependencyGraph.js';
export { DependencyService } from './DependencyService.js';