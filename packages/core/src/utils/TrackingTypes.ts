/**
 * @fileoverview Type definitions for tracking-related service interfaces
 * 
 * This module defines the service interfaces required by TrackingTaskTree
 * and TrackingDependencyGraph for flushing operations to the store.
 */

import type { TaskTree } from './TaskTree.js';
import type { DependencyGraph } from './DependencyGraph.js';
import type { ReconciliationPlan, TrackingTaskTree } from './TrackingTaskTree.js';
import type { DependencyReconciliationPlan, TrackingDependencyGraph } from './TrackingDependencyGraph.js';

/**
 * Task service interface required for TrackingTaskTree flush operations
 */
export interface ITaskReconciliationService {
  /**
   * Execute reconciliation operations and return the updated tree with ID mappings
   * 
   * @param plan - The reconciliation plan containing operations to apply
   * @returns Promise resolving to updated tree and ID mappings
   * @throws {Error} If any operation fails
   */
  executeReconciliationOperations(plan: ReconciliationPlan): Promise<{
    tree: TaskTree;
    idMappings: Map<string, string>;
  }>;
}

/**
 * Dependency service interface required for TrackingDependencyGraph flush operations
 */
export interface IDependencyReconciliationService {
  /**
   * Apply a reconciliation plan to the dependency store
   * 
   * @param plan - The reconciliation plan containing dependency operations
   * @returns Promise resolving to updated dependency graph
   * @throws {Error} If any operation fails
   */
  applyReconciliationPlan(plan: DependencyReconciliationPlan): Promise<DependencyGraph>;
}

/**
 * Result of flushing a TrackingTaskTree
 */
export interface TaskFlushResult {
  updatedTree: TaskTree;
  clearedTrackingTree: TrackingTaskTree;
  idMappings: Map<string, string>;
}

/**
 * Result of flushing a TrackingDependencyGraph
 */
export interface DependencyFlushResult {
  updatedGraph: DependencyGraph;
  clearedTrackingGraph: TrackingDependencyGraph;
}

/**
 * Common metadata for flush operations
 */
export interface FlushMetadata {
  operationsApplied: number;
  startVersion: number;
  endVersion: number;
  timestamp: Date;
  idMappingsCount?: number;
}

// Re-export for convenience
export type { TrackingTaskTree } from './TrackingTaskTree.js';
export type { TrackingDependencyGraph } from './TrackingDependencyGraph.js'; 