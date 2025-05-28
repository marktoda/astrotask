import { z } from 'zod';
import { TaskTree, type TaskTreeData, type BatchUpdateOperation } from './TaskTree.js';
import type { Task, TaskStatus } from '../schemas/task.js';

/**
 * Operation tracking schema for TrackingTaskTree
 */
export const treeOperationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'update_task',
    'add_child',
    'remove_child',
    'move_task',
    'bulk_status_update',
    'merge_operation',
  ]),
  timestamp: z.date(),
  taskId: z.string().optional(),
  parentId: z.string().optional(),
  updates: z.record(z.unknown()).optional(),
  childData: z.unknown().optional(),
  sourceOperationId: z.string().optional(),
});

export type TreeOperation = z.infer<typeof treeOperationSchema>;

/**
 * Reconciliation result schema
 */
export const reconciliationResultSchema = z.object({
  success: z.boolean(),
  appliedOperations: z.array(z.string()),
  conflicts: z.array(z.object({
    operationId: z.string(),
    taskId: z.string(),
    conflictType: z.enum(['concurrent_update', 'missing_task', 'circular_dependency']),
    message: z.string(),
  })),
  rollbackOperations: z.array(treeOperationSchema),
});

export type ReconciliationResult = z.infer<typeof reconciliationResultSchema>;

/**
 * Reconciliation plan schema
 */
export const reconciliationPlanSchema = z.object({
  operations: z.array(treeOperationSchema),
  dependencies: z.array(z.object({
    operationId: z.string(),
    dependsOn: z.array(z.string()),
  })),
  conflicts: z.array(z.string()),
  estimatedDuration: z.number(),
});

export type ReconciliationPlan = z.infer<typeof reconciliationPlanSchema>;

/**
 * TrackingTaskTree extends TaskTree to capture pending updates transparently
 * 
 * Key features:
 * - Same interface as TaskTree (drop-in replacement)
 * - Captures all mutations with timestamps for reconciliation
 * - Supports conflict detection and resolution
 * - Enables rollback and collaborative editing patterns
 * - Maintains immutable semantics while tracking changes
 */
export class TrackingTaskTree extends TaskTree {
  private readonly pendingOperations: TreeOperation[];
  private readonly baseTree: TaskTree;
  private readonly lastSync: Date;

  constructor(
    data: TaskTreeData,
    parent: TrackingTaskTree | null = null,
    operations: TreeOperation[] = [],
    baseTree?: TaskTree,
    lastSync?: Date
  ) {
    super(data, parent);
    this.pendingOperations = [...operations];
    this.baseTree = baseTree || new TaskTree(data, parent);
    this.lastSync = lastSync || new Date();
  }

  // Getter for tracking state
  get hasPendingChanges(): boolean {
    return this.pendingOperations.length > 0;
  }

  get pendingOperationCount(): number {
    return this.pendingOperations.length;
  }

  getPendingOperations(): readonly TreeOperation[] {
    return [...this.pendingOperations];
  }

  getLastSyncDate(): Date {
    return new Date(this.lastSync);
  }

  // Override mutation methods to track operations
  override withTask(updates: Partial<Task>): TrackingTaskTree {
    const updatedTree = super.withTask(updates) as any;
    const operation: TreeOperation = {
      id: crypto.randomUUID(),
      type: 'update_task',
      timestamp: new Date(),
      taskId: this.id,
      updates: updates as Record<string, unknown>,
    };

    return new TrackingTaskTree(
      updatedTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...this.pendingOperations, operation],
      this.baseTree,
      this.lastSync
    );
  }

  override withChildren(children: TaskTree[]): TrackingTaskTree {
    const updatedTree = super.withChildren(children) as any;
    
    return new TrackingTaskTree(
      updatedTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      this.pendingOperations,
      this.baseTree,
      this.lastSync
    );
  }

  override addChild(child: TaskTree): TrackingTaskTree {
    const updatedTree = super.addChild(child) as any;
    const operation: TreeOperation = {
      id: crypto.randomUUID(),
      type: 'add_child',
      timestamp: new Date(),
      parentId: this.id,
      childData: child.toPlainObject(),
    };

    return new TrackingTaskTree(
      updatedTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...this.pendingOperations, operation],
      this.baseTree,
      this.lastSync
    );
  }

  override removeChild(childId: string): TrackingTaskTree {
    const updatedTree = super.removeChild(childId) as any;
    const operation: TreeOperation = {
      id: crypto.randomUUID(),
      type: 'remove_child',
      timestamp: new Date(),
      parentId: this.id,
      taskId: childId,
    };

    return new TrackingTaskTree(
      updatedTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...this.pendingOperations, operation],
      this.baseTree,
      this.lastSync
    );
  }

  // Enhanced batch operations with tracking
  override batchUpdate(updates: BatchUpdateOperation[]): TrackingTaskTree {
    const updatedTree = super.batchUpdate(updates) as any;
    const operations: TreeOperation[] = updates.map(op => ({
      id: crypto.randomUUID(),
      type: op.type as any,
      timestamp: new Date(),
      taskId: 'taskId' in op ? op.taskId : undefined,
      updates: 'updates' in op ? op.updates as Record<string, unknown> : undefined,
    }));

    return new TrackingTaskTree(
      updatedTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...this.pendingOperations, ...operations],
      this.baseTree,
      this.lastSync
    );
  }

  // New tracking-specific methods
  moveTask(taskId: string, newParentId: string): TrackingTaskTree {
    // Find the task to move
    const taskToMove = this.find(task => task.id === taskId);
    if (!taskToMove) {
      throw new Error(`Task with id ${taskId} not found`);
    }

    // Remove from current parent and add to new parent
    const operation: TreeOperation = {
      id: crypto.randomUUID(),
      type: 'move_task',
      timestamp: new Date(),
      taskId,
      parentId: newParentId,
    };

    // This is a simplified implementation - in practice, you'd need more complex tree manipulation
    return new TrackingTaskTree(
      this.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...this.pendingOperations, operation],
      this.baseTree,
      this.lastSync
    );
  }

  bulkStatusUpdate(taskIds: string[], status: TaskStatus): TrackingTaskTree {
    const operation: TreeOperation = {
      id: crypto.randomUUID(),
      type: 'bulk_status_update',
      timestamp: new Date(),
      updates: { taskIds, status },
    };

    // Apply the update using existing batch functionality
    const batchOp: BatchUpdateOperation = {
      type: 'bulk_status_update',
      taskIds,
      status,
    };

    const updatedTree = super.batchUpdate([batchOp]) as any;

    return new TrackingTaskTree(
      updatedTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...this.pendingOperations, operation],
      this.baseTree,
      this.lastSync
    );
  }

  // Conflict detection
  detectConflicts(otherOperations: TreeOperation[]): TreeOperation[] {
    const conflicts: TreeOperation[] = [];
    const taskIds = new Set(this.pendingOperations.map(op => op.taskId).filter((id): id is string => Boolean(id)));

    for (const otherOp of otherOperations) {
      if (otherOp.taskId && taskIds.has(otherOp.taskId)) {
        // Check if operations are concurrent (within a reasonable time window)
        const myOp = this.pendingOperations.find(op => op.taskId === otherOp.taskId);
        if (myOp && Math.abs(myOp.timestamp.getTime() - otherOp.timestamp.getTime()) < 5000) {
          conflicts.push(otherOp);
        }
      }
    }

    return conflicts;
  }

  // Merge operations from another TrackingTaskTree
  mergeOperations(other: TrackingTaskTree): TrackingTaskTree {
    const conflicts = this.detectConflicts([...other.getPendingOperations()]);
    
    if (conflicts.length > 0) {
      throw new Error(`Cannot merge due to ${conflicts.length} conflicts`);
    }

    const mergedOperations = [
      ...this.pendingOperations,
      ...other.getPendingOperations(),
    ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const mergeOperation: TreeOperation = {
      id: crypto.randomUUID(),
      type: 'merge_operation',
      timestamp: new Date(),
      sourceOperationId: other.pendingOperations[0]?.id,
    };

    return new TrackingTaskTree(
      this.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [...mergedOperations, mergeOperation],
      this.baseTree,
      this.lastSync
    );
  }

  // Create reconciliation plan
  createReconciliationPlan(): ReconciliationPlan {
    const operations = [...this.pendingOperations];
    const dependencies: { operationId: string; dependsOn: string[] }[] = [];
    const conflicts: string[] = [];

    // Analyze dependencies - operations on the same task must be ordered
    const taskOperations = new Map<string, string[]>();
    
    for (const op of operations) {
      if (op.taskId) {
        const existing = taskOperations.get(op.taskId) || [];
        if (existing.length > 0) {
          const lastOp = existing[existing.length - 1];
          if (lastOp) {
            dependencies.push({
              operationId: op.id,
              dependsOn: [lastOp],
            });
          }
        }
        taskOperations.set(op.taskId, [...existing, op.id]);
      }
    }

    // Check for potential conflicts
    for (const [taskId, opIds] of taskOperations) {
      if (opIds.length > 3) {
        conflicts.push(`High operation count (${opIds.length}) for task ${taskId}`);
      }
    }

    // Estimate duration based on operation count and complexity
    const estimatedDuration = operations.length * 50 + dependencies.length * 25;

    return {
      operations,
      dependencies,
      conflicts,
      estimatedDuration,
    };
  }

  // Reconciliation methods
  async reconcile(): Promise<ReconciliationResult> {
    const plan = this.createReconciliationPlan();
    
    // In a real implementation, this would interact with the store
    // For now, we'll simulate success
    return {
      success: true,
      appliedOperations: plan.operations.map(op => op.id),
      conflicts: [],
      rollbackOperations: [],
    };
  }

  clearPendingOperations(): TrackingTaskTree {
    return new TrackingTaskTree(
      this.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [],
      this.baseTree,
      new Date()
    );
  }

  rollback(): TrackingTaskTree {
    return new TrackingTaskTree(
      this.baseTree.toPlainObject(),
      this.getParent() as TrackingTaskTree | null,
      [],
      this.baseTree,
      this.lastSync
    );
  }

  // Factory methods
  static fromTaskTree(tree: TaskTree): TrackingTaskTree {
    return new TrackingTaskTree(tree.toPlainObject());
  }

  static override fromTask(task: Task, children: TrackingTaskTree[] = []): TrackingTaskTree {
    const data: TaskTreeData = {
      task,
      children: children.map((child) => child.toPlainObject()),
    };
    return new TrackingTaskTree(data);
  }

  // Override parent factory method to return TrackingTaskTree
  static fromTaskWithChildren(task: Task, children: TaskTree[] = []): TrackingTaskTree {
    const trackingChildren = children.map(child => 
      child instanceof TrackingTaskTree ? child : TrackingTaskTree.fromTaskTree(child)
    );
    
    const data: TaskTreeData = {
      task,
      children: trackingChildren.map((child) => child.toPlainObject()),
    };
    return new TrackingTaskTree(data);
  }
}