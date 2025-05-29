/**
 * @fileoverview TrackingDependencyGraph utility for tracking dependency changes
 *
 * This utility extends DependencyGraph to capture all mutations for later reconciliation.
 * It provides an immutable, ergonomic interface for dependency operations while tracking
 * changes that can be applied to a store in batches.
 *
 * @module utils/TrackingDependencyGraph
 * @since 1.0.0
 */

import { z } from 'zod';
import { DependencyGraph, type DependencyGraphData } from './DependencyGraph.js';

/**
 * Pending operations that can be applied to a DependencyGraph
 */
export const dependencyPendingOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dependency_add'),
    dependentTaskId: z.string(),
    dependencyTaskId: z.string(),
    timestamp: z.date(),
  }),
  z.object({
    type: z.literal('dependency_remove'),
    dependentTaskId: z.string(),
    dependencyTaskId: z.string(),
    timestamp: z.date(),
  }),
]);

export type DependencyPendingOperation = z.infer<typeof dependencyPendingOperationSchema>;

/**
 * Reconciliation plan containing dependency operations to apply to the store
 */
export interface DependencyReconciliationPlan {
  graphId: string;
  baseVersion: number;
  operations: DependencyPendingOperation[];
}

/**
 * TrackingDependencyGraph extends DependencyGraph to capture all mutations for later reconciliation.
 *
 * Key features:
 * - Same interface as DependencyGraph (transparent drop-in replacement)
 * - Captures all mutations as pending operations
 * - Supports optimistic updates with rollback capability
 * - Enables batch reconciliation to store
 * - Maintains operation ordering for conflict resolution
 */
export class TrackingDependencyGraph extends DependencyGraph {
  private readonly _pendingOperations: DependencyPendingOperation[] = [];
  private readonly _isTracking: boolean;
  private readonly _baseVersion: number;
  private readonly _graphId: string;

  constructor(
    data: DependencyGraphData,
    options: {
      isTracking?: boolean;
      baseVersion?: number;
      pendingOperations?: DependencyPendingOperation[];
      graphId?: string;
    } = {}
  ) {
    super(data);

    this._isTracking = options.isTracking ?? true;
    this._baseVersion = options.baseVersion ?? 0;
    this._pendingOperations = [...(options.pendingOperations ?? [])];
    this._graphId = options.graphId ?? 'default';
  }

  // Getters for tracking state
  get isTracking(): boolean {
    return this._isTracking;
  }

  get pendingOperations(): readonly DependencyPendingOperation[] {
    return this._pendingOperations;
  }

  get hasPendingChanges(): boolean {
    return this._pendingOperations.length > 0;
  }

  get baseVersion(): number {
    return this._baseVersion;
  }

  get graphId(): string {
    return this._graphId;
  }

  // Override core mutation methods to capture operations
  override withDependency(dependentId: string, dependencyId: string): TrackingDependencyGraph {
    const result = super.withDependency(dependentId, dependencyId);

    const newOperations = this._isTracking
      ? [
          ...this._pendingOperations,
          {
            type: 'dependency_add' as const,
            dependentTaskId: dependentId,
            dependencyTaskId: dependencyId,
            timestamp: new Date(),
          },
        ]
      : this._pendingOperations;

    return new TrackingDependencyGraph(result.toPlainObject(), {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: newOperations,
      graphId: this._graphId,
    });
  }

  override withoutDependency(dependentId: string, dependencyId: string): TrackingDependencyGraph {
    const result = super.withoutDependency(dependentId, dependencyId);

    const newOperations = this._isTracking
      ? [
          ...this._pendingOperations,
          {
            type: 'dependency_remove' as const,
            dependentTaskId: dependentId,
            dependencyTaskId: dependencyId,
            timestamp: new Date(),
          },
        ]
      : this._pendingOperations;

    return new TrackingDependencyGraph(result.toPlainObject(), {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: newOperations,
      graphId: this._graphId,
    });
  }

  // Tracking-specific methods

  /**
   * Start tracking changes (if not already tracking)
   */
  startTracking(): TrackingDependencyGraph {
    if (this._isTracking) return this;

    return new TrackingDependencyGraph(this.toPlainObject(), {
      isTracking: true,
      baseVersion: this._baseVersion,
      pendingOperations: [],
      graphId: this._graphId,
    });
  }

  /**
   * Stop tracking changes and return a regular DependencyGraph
   */
  stopTracking(): DependencyGraph {
    return new DependencyGraph(this.toPlainObject());
  }

  /**
   * Clear all pending operations (usually after successful reconciliation)
   */
  clearPendingOperations(): TrackingDependencyGraph {
    return new TrackingDependencyGraph(this.toPlainObject(), {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion + this._pendingOperations.length,
      pendingOperations: [],
      graphId: this._graphId,
    });
  }

  /**
   * Apply all pending operations to a DependencyService and clear them on success
   * This is the recommended way to persist changes from a TrackingDependencyGraph
   *
   * @param dependencyService - The service to apply changes to
   * @returns Promise of the updated DependencyGraph from the store and the cleared TrackingDependencyGraph
   */
  async apply(dependencyService: {
    applyReconciliationPlan(plan: DependencyReconciliationPlan): Promise<DependencyGraph>;
  }): Promise<{
    updatedGraph: DependencyGraph;
    clearedTrackingGraph: TrackingDependencyGraph;
  }> {
    if (!this.hasPendingChanges) {
      // No changes to apply, just return current state
      const currentGraph = await dependencyService.applyReconciliationPlan({
        graphId: this._graphId,
        baseVersion: this._baseVersion,
        operations: [],
      });

      return {
        updatedGraph: currentGraph,
        clearedTrackingGraph: this,
      };
    }

    // Create reconciliation plan
    const plan = this.createReconciliationPlan();

    try {
      // Apply the plan to the dependency service
      const updatedGraph = await dependencyService.applyReconciliationPlan(plan);

      // Clear pending operations on success
      const clearedTrackingGraph = this.clearPendingOperations();

      return {
        updatedGraph,
        clearedTrackingGraph,
      };
    } catch (error) {
      // Don't clear pending operations on failure - preserve them for retry
      throw new Error(
        `Failed to apply tracking dependency graph changes: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Alias for apply() method for consistency with TrackingTaskTree
   */
  async flush(dependencyService: {
    applyReconciliationPlan(plan: DependencyReconciliationPlan): Promise<DependencyGraph>;
  }): Promise<{
    updatedGraph: DependencyGraph;
    clearedTrackingGraph: TrackingDependencyGraph;
  }> {
    return this.apply(dependencyService);
  }

  /**
   * Get operations that occurred after a specific version
   */
  getOperationsSince(version: number): DependencyPendingOperation[] {
    return this._pendingOperations.slice(version - this._baseVersion);
  }

  /**
   * Merge operations from another tracking graph (for collaborative editing)
   */
  mergeOperations(otherOperations: readonly DependencyPendingOperation[]): TrackingDependencyGraph {
    // Simple merge - in practice, this would need conflict resolution
    const mergedOperations = [...this._pendingOperations, ...otherOperations].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    return new TrackingDependencyGraph(this.toPlainObject(), {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: mergedOperations,
      graphId: this._graphId,
    });
  }

  /**
   * Creates a reconciliation plan for resolving pending operations with conflict detection
   *
   * Analyzes all pending operations to detect conflicts (multiple operations on the same dependency)
   * and generates a reconciled set of operations using the "last update wins" strategy.
   * This is essential for optimistic UI updates that need to be synchronized with the backend.
   *
   * @returns DependencyReconciliationPlan containing resolved operations and metadata
   *
   * @complexity O(n log n) where n = number of pending operations (due to timestamp sorting)
   * @space O(n) for operation grouping and conflict detection data structures
   *
   * @sideEffects
   * - Logs conflict warnings for observability
   * - Does not modify the graph state (read-only analysis)
   *
   * @algorithm
   * 1. Group operations by dependency pairs
   * 2. Detect conflicts within dependency operations
   * 3. Apply last-update-wins resolution for conflicting operations
   * 4. Preserve all non-conflicting operations in original order
   *
   * @conflictResolution
   * - Dependency operations: Use latest timestamp for same dependency pair
   */
  createReconciliationPlan(): DependencyReconciliationPlan {
    const consolidatedOperations = this.consolidateOperations([...this._pendingOperations]);

    return {
      graphId: this._graphId,
      baseVersion: this._baseVersion,
      operations: consolidatedOperations,
    };
  }

  /**
   * Consolidate operations, keeping only the latest operation for each dependency
   */
  private consolidateOperations(
    operations: DependencyPendingOperation[]
  ): DependencyPendingOperation[] {
    const dependencyOps = new Map<string, DependencyPendingOperation>();

    // Consolidate dependency operations
    for (const op of operations) {
      // For dependency operations, use dependency pair as key
      const key = `${op.dependentTaskId}->${op.dependencyTaskId}`;
      const existing = dependencyOps.get(key);
      if (!existing || op.timestamp >= existing.timestamp) {
        dependencyOps.set(key, op);
      }
    }

    // Sort by timestamp to maintain operation order
    return Array.from(dependencyOps.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  // Factory methods

  /**
   * Create a TrackingDependencyGraph from an existing DependencyGraph
   */
  static fromDependencyGraph(graph: DependencyGraph, graphId?: string): TrackingDependencyGraph {
    return new TrackingDependencyGraph(graph.toPlainObject(), {
      isTracking: true,
      baseVersion: 0,
      pendingOperations: [],
      graphId: graphId ?? 'default',
    });
  }

  /**
   * Create a TrackingDependencyGraph from dependencies and tasks
   */
  static fromData(
    data: DependencyGraphData,
    options: {
      graphId?: string;
      isTracking?: boolean;
    } = {}
  ): TrackingDependencyGraph {
    return new TrackingDependencyGraph(data, {
      isTracking: options.isTracking ?? true,
      baseVersion: 0,
      pendingOperations: [],
      graphId: options.graphId ?? 'default',
    });
  }

  /**
   * Create an empty TrackingDependencyGraph
   */
  static override empty(graphId?: string): TrackingDependencyGraph {
    return new TrackingDependencyGraph(
      { dependencies: [], tasks: [] },
      {
        isTracking: true,
        baseVersion: 0,
        pendingOperations: [],
        graphId: graphId ?? 'default',
      }
    );
  }

  /**
   * Apply ID mappings to resolve temporary IDs in dependency operations
   * This allows dependencies created with temporary IDs to be resolved to real database IDs
   * before flushing to the dependency service.
   */
  applyIdMappings(idMappings: Map<string, string>): TrackingDependencyGraph {
    if (this._pendingOperations.length === 0) {
      return this; // No operations to map
    }

    const mappedOperations: DependencyPendingOperation[] = this._pendingOperations.map(op => {
      const resolvedDependentId = idMappings.get(op.dependentTaskId) || op.dependentTaskId;
      const resolvedDependencyId = idMappings.get(op.dependencyTaskId) || op.dependencyTaskId;

      return {
        ...op,
        dependentTaskId: resolvedDependentId,
        dependencyTaskId: resolvedDependencyId,
      };
    });

    // Create a new tracking graph with mapped operations
    const mappedGraph = new TrackingDependencyGraph(this.toPlainObject(), {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: mappedOperations,
      graphId: this._graphId,
    });
    return mappedGraph;
  }
}

/**
 * Serialize tracking state for persistence
 */
export function serializeDependencyTrackingState(graph: TrackingDependencyGraph): string {
  return JSON.stringify({
    graphId: graph.graphId,
    baseVersion: graph.baseVersion,
    operations: graph.pendingOperations,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Deserialize tracking state from persistence
 */
export function deserializeDependencyTrackingState(data: string): {
  graphId: string;
  baseVersion: number;
  operations: DependencyPendingOperation[];
  timestamp: string;
} {
  return JSON.parse(data);
}
