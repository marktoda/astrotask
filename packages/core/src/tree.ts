/**
 * Tree Operations and Utilities
 *
 * Comprehensive tree manipulation toolkit including:
 * - Tree traversal and search operations
 * - Tree analysis and transformation
 * - Tree validation utilities
 * - Batch operations
 */

// Core tree data structures
export {
  TaskTree,
  type TaskTreeData,
  type BatchUpdateOperation,
  type TreeMetrics,
} from './entities/TaskTree.js';

// Tree operations
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

// Tree adapters
export {
  TaskTreeAdapter,
  TrackingTaskTreeAdapter,
  TreeAdapterUtils,
} from './entities/tree-adapters.js';

// Tree validation
export {
  validateTaskTree,
  validateTaskTreeData,
  validateMoveOperation,
  validateTaskForest,
  type ValidationWarning,
  type ValidationOptions,
} from './entities/TaskTreeValidation.js';

// Tree constants
export { TASK_IDENTIFIERS } from './entities/TaskTreeConstants.js';

// Tree caching (for performance)
export {
  TaskTreeCache,
  CachedTaskTreeOperations,
  LRUCache,
  type CacheStats,
  type TaskTreeCacheStats,
  type TaskTreeMetadata,
} from './entities/TaskTreeCache.js';
