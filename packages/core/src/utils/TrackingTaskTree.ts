import { z } from 'zod';
import type { Task } from '../schemas/task.js';
import { type BatchUpdateOperation, TaskTree, type TaskTreeData } from './TaskTree.js';

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
  z.object({
    type: z.literal('batch_update'),
    operations: z.array(
      z.object({
        type: z.string(),
        taskId: z.string().optional(),
        taskIds: z.array(z.string()).optional(),
        updates: z.record(z.unknown()).optional(),
        status: z.string().optional(),
      })
    ),
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

  override batchUpdate(operations: BatchUpdateOperation[]): TrackingTaskTree {
    const result = super.batchUpdate(operations);

    const newOperations = this._isTracking
      ? [
          ...this._pendingOperations,
          {
            type: 'batch_update' as const,
            operations: operations.map((op) => ({
              type: op.type,
              ...op, // Spread all operation properties
            })),
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
   * Rollback to the base state (discard all pending operations)
   */
  rollback(): TrackingTaskTree {
    // This would require storing the original state, which we could add
    // For now, return a new tracking tree with cleared operations
    return new TrackingTaskTree(this.toPlainObject(), this.getParent() as TrackingTaskTree, {
      isTracking: this._isTracking,
      baseVersion: this._baseVersion,
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
   * Create a reconciliation plan for pending operations
   */
  createReconciliationPlan(): ReconciliationPlan {
    const plan: ReconciliationPlan = {
      treeId: this.id,
      baseVersion: this._baseVersion,
      operations: this._pendingOperations,
      conflicts: [], // Would detect conflicts here
      canAutoResolve: true,
    };

    // Detect potential conflicts (simplified)
    const taskUpdates = new Map<string, PendingOperation[]>();
    for (const op of this._pendingOperations) {
      if (op.type === 'task_update') {
        const existing = taskUpdates.get(op.taskId) || [];
        existing.push(op);
        taskUpdates.set(op.taskId, existing);
      }
    }

    // Flag conflicts where multiple operations affect the same task
    for (const [taskId, ops] of taskUpdates) {
      if (ops.length > 1) {
        plan.conflicts.push({
          type: 'concurrent_task_update',
          taskId,
          operations: ops,
        });
        plan.canAutoResolve = false;
      }
    }

    return plan;
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
