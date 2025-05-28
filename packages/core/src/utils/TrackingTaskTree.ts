import { z } from 'zod';
import type { Task } from '../schemas/task.js';
import { TaskTree, type TaskTreeData } from './TaskTree.js';

/**
 * Pending operations that can be applied to a TaskTree
 */
export const pendingOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task_update'),
    taskId: z.string(),
    updates: z.record(z.unknown()),
    timestamp: z.date(),
  }),
  z.object({
    type: z.literal('child_add'),
    parentId: z.string(),
    childData: z.any(), // Use any for TaskTreeData to avoid recursive type issues
    timestamp: z.date(),
  }),
  z.object({
    type: z.literal('child_remove'),
    parentId: z.string(),
    childId: z.string(),
    timestamp: z.date(),
  }),
]);

export type PendingOperation = z.infer<typeof pendingOperationSchema>;

/**
 * TrackingTaskTree extends TaskTree to capture all mutations for later reconciliation.
 *
 * Key features:
 * - Same interface as TaskTree (transparent drop-in replacement)
 * - Captures all mutations as pending operations
 * - Supports optimistic updates with rollback capability
 * - Enables batch reconciliation to store
 * - Maintains operation ordering for conflict resolution
 */
export class TrackingTaskTree extends TaskTree {
  private readonly _pendingOperations: PendingOperation[] = [];
  private readonly _isTracking: boolean;
  private readonly _baseVersion: number;

  constructor(
    data: TaskTreeData,
    parent: TrackingTaskTree | null = null,
    options: {
      isTracking?: boolean;
      baseVersion?: number;
      pendingOperations?: PendingOperation[];
    } = {}
  ) {
    super(data, parent);

    this._isTracking = options.isTracking ?? true;
    this._baseVersion = options.baseVersion ?? 0;
    this._pendingOperations = [...(options.pendingOperations ?? [])];
  }

  // Getters for tracking state
  get isTracking(): boolean {
    return this._isTracking;
  }

  get pendingOperations(): readonly PendingOperation[] {
    return this._pendingOperations;
  }

  get hasPendingChanges(): boolean {
    return this._pendingOperations.length > 0;
  }

  get baseVersion(): number {
    return this._baseVersion;
  }

  // Override core mutation methods to capture operations
  override withTask(updates: Partial<Task>): TrackingTaskTree {
    const result = super.withTask(updates);

    const newOperations = this._isTracking
      ? [
          ...this._pendingOperations,
          {
            type: 'task_update' as const,
            taskId: this.id,
            updates: updates as Record<string, unknown>,
            timestamp: new Date(),
          },
        ]
      : this._pendingOperations;

    return new TrackingTaskTree(result.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: newOperations,
    });
  }

  override addChild(child: TaskTree | TrackingTaskTree): TrackingTaskTree {
    const result = super.addChild(child);

    const newOperations = this._isTracking
      ? [
          ...this._pendingOperations,
          {
            type: 'child_add' as const,
            parentId: this.id,
            childData: child.toPlainObject(),
            timestamp: new Date(),
          },
        ]
      : this._pendingOperations;

    return new TrackingTaskTree(result.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: newOperations,
    });
  }

  override removeChild(childId: string): TrackingTaskTree {
    const result = super.removeChild(childId);

    const newOperations = this._isTracking
      ? [
          ...this._pendingOperations,
          {
            type: 'child_remove' as const,
            parentId: this.id,
            childId,
            timestamp: new Date(),
          },
        ]
      : this._pendingOperations;

    return new TrackingTaskTree(result.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: newOperations,
    });
  }

  // Tracking-specific methods

  /**
   * Start tracking changes (if not already tracking)
   */
  startTracking(): TrackingTaskTree {
    if (this._isTracking) return this;

    return new TrackingTaskTree(this.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: true,
      baseVersion: this._baseVersion,
      pendingOperations: [],
    });
  }

  /**
   * Stop tracking changes and return a regular TaskTree
   */
  stopTracking(): TaskTree {
    return new TaskTree(this.toPlainObject(), this.getParent());
  }

  /**
   * Clear all pending operations (usually after successful reconciliation)
   */
  clearPendingOperations(): TrackingTaskTree {
    return new TrackingTaskTree(this.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion + this._pendingOperations.length,
      pendingOperations: [],
    });
  }

  /**
   * Get operations since a specific version
   */
  getOperationsSince(version: number): PendingOperation[] {
    const sinceIndex = version - this._baseVersion;
    return this._pendingOperations.slice(Math.max(0, sinceIndex));
  }

  /**
   * Merge operations from another tracking tree (for collaborative editing)
   */
  mergeOperations(otherOperations: PendingOperation[]): TrackingTaskTree {
    // Simple merge - in practice, this would need conflict resolution
    const mergedOperations = [...this._pendingOperations, ...otherOperations].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    return new TrackingTaskTree(this.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
      pendingOperations: mergedOperations,
    });
  }

  /**
   * Creates a reconciliation plan for resolving pending operations with conflict detection
   * 
   * Analyzes all pending operations to detect conflicts (multiple updates to the same task)
   * and generates a reconciled set of operations using the "last update wins" strategy.
   * This is essential for optimistic UI updates that need to be synchronized with the backend.
   * 
   * @returns ReconciliationPlan containing resolved operations and metadata
   * 
   * @complexity O(n log n) where n = number of pending operations (due to timestamp sorting)
   * @space O(n) for operation grouping and conflict detection data structures
   * 
   * @sideEffects 
   * - Logs conflict warnings for observability
   * - Does not modify the tree state (read-only analysis)
   * 
   * @algorithm
   * 1. Group operations by type (task updates vs structural changes)
   * 2. Detect conflicts within task update groups
   * 3. Apply last-update-wins resolution for conflicting operations
   * 4. Preserve all non-conflicting operations in original order
   * 
   * @conflictResolution
   * - Task updates: Use latest timestamp (last update wins)
   * - Structural operations: No conflicts possible, preserve all
   * - Cross-type conflicts: Not currently detected/resolved
   */
  createReconciliationPlan(): ReconciliationPlan {
    const { taskUpdates, nonTaskOperations } = this.groupOperationsByType();
    const finalOperations = this.resolveConflictsWithLastUpdateWins(taskUpdates, nonTaskOperations);

    return {
      treeId: this.id,
      baseVersion: this._baseVersion,
      operations: finalOperations,
      conflicts: [], // Don't store conflicts, just log them
      canAutoResolve: true, // Always auto-resolvable with last update wins
    };
  }

  /**
   * Group operations by type for conflict detection
   */
  private groupOperationsByType(): {
    taskUpdates: Map<string, PendingOperation[]>;
    nonTaskOperations: PendingOperation[];
  } {
    const taskUpdates = new Map<string, PendingOperation[]>();
    const nonTaskOperations: PendingOperation[] = [];

    for (const op of this._pendingOperations) {
      if (op.type === 'task_update') {
        const existing = taskUpdates.get(op.taskId) || [];
        existing.push(op);
        taskUpdates.set(op.taskId, existing);
      } else {
        // Non-task-update operations don't conflict, include as-is
        nonTaskOperations.push(op);
      }
    }

    return { taskUpdates, nonTaskOperations };
  }

  /**
   * Resolves conflicts between multiple operations using "last update wins" strategy
   * 
   * Implements automatic conflict resolution for optimistic updates by choosing
   * the most recent operation for each conflicting task based on timestamps.
   * This provides predictable behavior for concurrent modifications in collaborative scenarios.
   * 
   * @param taskUpdates - Map of task IDs to their conflicting update operations
   * @param nonTaskOperations - Non-conflicting structural operations to preserve
   * @returns Resolved list of operations with conflicts eliminated
   * 
   * @complexity O(k log k) where k = max operations per task (for timestamp sorting)
   * @space O(n) where n = total number of operations
   * 
   * @sideEffects
   * - Logs conflict warnings to console for debugging/monitoring
   * - May discard earlier operations when conflicts are detected
   * 
   * @resolutionPolicy Last Update Wins (LUW):
   * - Sort conflicting operations by timestamp ascending
   * - Select the operation with the latest timestamp
   * - Preserve operation ordering semantics for replay
   * - Log conflicts for observability and debugging
   * 
   * @alternatives
   * - First update wins: Simpler but potentially loses user intent
   * - Manual resolution: More accurate but requires user intervention
   * - Operational transform: Complex but preserves all user intent
   */
  private resolveConflictsWithLastUpdateWins(
    taskUpdates: Map<string, PendingOperation[]>,
    nonTaskOperations: PendingOperation[]
  ): PendingOperation[] {
    const finalOperations: PendingOperation[] = [...nonTaskOperations];

    for (const [taskId, ops] of taskUpdates) {
      if (ops.length > 1) {
        this.logConflict(taskId, ops.length);
        const latestOp = this.getLatestOperation(ops);
        if (latestOp) {
          finalOperations.push(latestOp);
        }
      } else if (ops.length === 1) {
        const singleOp = ops[0];
        if (singleOp) {
          finalOperations.push(singleOp);
        }
      }
    }

    return finalOperations;
  }

  /**
   * Log conflict for observability
   */
  private logConflict(taskId: string, conflictCount: number): void {
    console.warn(
      `Conflict detected for task ${taskId}: ${conflictCount} concurrent updates. Using last update wins policy.`
    );
  }

  /**
   * Get the latest operation from a list based on timestamp
   */
  private getLatestOperation(ops: PendingOperation[]): PendingOperation | undefined {
    const sortedOps = ops.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return sortedOps[sortedOps.length - 1];
  }

  // Factory methods

  /**
   * Create a TrackingTaskTree from an existing TaskTree
   */
  static fromTaskTree(tree: TaskTree): TrackingTaskTree {
    return new TrackingTaskTree(tree.toPlainObject(), null, {
      isTracking: true,
      baseVersion: 0,
      pendingOperations: [],
    });
  }

  /**
   * Create a TrackingTaskTree from a plain task
   */
  static override fromTask(task: Task, children: TrackingTaskTree[] = []): TrackingTaskTree {
    const data: TaskTreeData = {
      task,
      children: children.map((child) => child.toPlainObject()),
    };

    return new TrackingTaskTree(data, null, {
      isTracking: true,
      baseVersion: 0,
      pendingOperations: [],
    });
  }
}

// Supporting types

export interface ReconciliationPlan {
  treeId: string;
  baseVersion: number;
  operations: PendingOperation[];
  conflicts: ConflictDescriptor[];
  canAutoResolve: boolean;
}

export interface ConflictDescriptor {
  type: 'concurrent_task_update' | 'parent_child_conflict' | 'status_conflict';
  taskId: string;
  operations: PendingOperation[];
  resolution?: 'merge' | 'use_latest' | 'manual';
}

/**
 * Batch reconcile multiple tracking trees
 */
export async function batchReconcile(
  trees: TrackingTaskTree[],
  reconcileCallback: (plan: ReconciliationPlan) => Promise<boolean>
): Promise<{
  succeeded: TrackingTaskTree[];
  failed: { tree: TrackingTaskTree; error: Error }[];
}> {
  const succeeded: TrackingTaskTree[] = [];
  const failed: { tree: TrackingTaskTree; error: Error }[] = [];

  for (const tree of trees) {
    try {
      const plan = tree.createReconciliationPlan();
      const success = await reconcileCallback(plan);

      if (success) {
        succeeded.push(tree.clearPendingOperations());
      } else {
        failed.push({ tree, error: new Error('Reconciliation rejected') });
      }
    } catch (error) {
      failed.push({ tree, error: error as Error });
    }
  }

  return { succeeded, failed };
}

/**
 * Serialize tracking state for persistence
 */
export function serializeTrackingState(tree: TrackingTaskTree): string {
  return JSON.stringify({
    baseVersion: tree.baseVersion,
    operations: tree.pendingOperations,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Deserialize tracking state from persistence
 */
export function deserializeTrackingState(data: string): {
  baseVersion: number;
  operations: PendingOperation[];
  timestamp: string;
} {
  return JSON.parse(data);
}
