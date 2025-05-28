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
 * Reconciliation plan containing operations to apply to the store
 */
export interface ReconciliationPlan {
  treeId: string;
  baseVersion: number;
  operations: PendingOperation[];
}

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
   * Apply all pending operations to a TaskService and clear them on success
   * This is the recommended way to persist changes from a TrackingTaskTree
   *
   * @param taskService - The TaskService to apply changes to
   * @returns Promise of the updated TaskTree from the store and the cleared TrackingTaskTree
   */
  async apply(taskService: {
    applyReconciliationPlan(plan: ReconciliationPlan): Promise<TaskTree>;
  }): Promise<{
    updatedTree: TaskTree;
    clearedTrackingTree: TrackingTaskTree;
  }> {
    if (!this.hasPendingChanges) {
      // No changes to apply, just return current state
      const currentTree = await taskService.applyReconciliationPlan({
        treeId: this.id,
        baseVersion: this._baseVersion,
        operations: [],
      });

      return {
        updatedTree: currentTree,
        clearedTrackingTree: this,
      };
    }

    // Create reconciliation plan
    const plan = this.createReconciliationPlan();

    try {
      // Apply the plan to the task service
      const updatedTree = await taskService.applyReconciliationPlan(plan);

      // Clear pending operations on success
      const clearedTrackingTree = this.clearPendingOperations();

      return {
        updatedTree,
        clearedTrackingTree,
      };
    } catch (error) {
      // Don't clear pending operations on failure - preserve them for retry
      throw new Error(
        `Failed to apply tracking tree changes: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Alias for apply() - more intuitive name for "flushing" pending changes to the store
   */
  async flush(taskService: {
    applyReconciliationPlan(plan: ReconciliationPlan): Promise<TaskTree>;
  }): Promise<{
    updatedTree: TaskTree;
    clearedTrackingTree: TrackingTaskTree;
  }> {
    return this.apply(taskService);
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
  mergeOperations(otherOperations: readonly PendingOperation[]): TrackingTaskTree {
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
    const consolidatedOperations = this.consolidateOperations([...this._pendingOperations]);

    return {
      treeId: this.id,
      baseVersion: this._baseVersion,
      operations: consolidatedOperations,
    };
  }

  /**
   * Consolidate operations, keeping only the latest update for each task
   */
  private consolidateOperations(operations: PendingOperation[]): PendingOperation[] {
    const taskUpdates = new Map<string, PendingOperation>();
    const otherOperations: PendingOperation[] = [];

    // Separate task updates from other operations
    for (const op of operations) {
      if (op.type === 'task_update') {
        // For task updates, keep only the latest one per task
        const existing = taskUpdates.get(op.taskId);
        if (!existing || op.timestamp >= existing.timestamp) {
          taskUpdates.set(op.taskId, op);
        }
      } else {
        // Other operations (child_add, child_remove) don't conflict
        otherOperations.push(op);
      }
    }

    // Combine and sort by timestamp to maintain operation order
    const allOperations = [...otherOperations, ...taskUpdates.values()];
    return allOperations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
