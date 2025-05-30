import { z } from 'zod';
import type { Task } from '../schemas/task.js';
import { type ITaskTree, TaskTree, type TaskTreeData } from './TaskTree.js';
import { ReconciliationError } from './TrackingErrors.js';
import type { ITaskReconciliationService, TaskFlushResult } from './TrackingTypes.js';

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
    childData: z.unknown(), // Use unknown instead of any for better type safety
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
 * Result of flushing operations to the task service
 * @deprecated Use TaskFlushResult from TrackingTypes instead
 */
export interface FlushResult {
  updatedTree: TaskTree;
  clearedTrackingTree: TrackingTaskTree;
  idMappings: Map<string, string>;
}

/**
 * Mutable TrackingTaskTree that records operations in place for later reconciliation.
 *
 * Key features:
 * - Mutable operations that update the tree in place
 * - Automatic operation recording for all mutations
 * - Tree-wide operation collection and flushing
 * - Optimistic updates with conflict resolution
 * - Compatible interface with TaskTree via ITaskTree
 *
 * NOTE: This class uses a mutable approach while TrackingDependencyGraph uses
 * an immutable approach. Consider aligning these patterns for consistency.
 */
export class TrackingTaskTree implements ITaskTree {
  private _pendingOperations: PendingOperation[] = [];
  private _baseVersion = 0;
  private _children: TrackingTaskTree[] = [];
  private readonly _parent: TrackingTaskTree | null = null;
  private _task: Task;

  constructor(
    data: TaskTreeData,
    parent: TrackingTaskTree | null = null,
    options: {
      baseVersion?: number;
    } = {}
  ) {
    this._parent = parent;
    this._baseVersion = options.baseVersion ?? 0;
    this._task = { ...data.task }; // Make a copy for mutation

    // Convert children to TrackingTaskTree instances
    this._children = data.children.map(
      (childData) => new TrackingTaskTree(childData, this, options)
    );
  }

  // Core getters (compatible with TaskTree)
  get task(): Task {
    return this._task;
  }

  get id(): string {
    return this._task.id;
  }

  get title(): string {
    return this._task.title;
  }

  get status(): Task['status'] {
    return this._task.status;
  }

  // Navigation methods (compatible with TaskTree)
  getParent(): TrackingTaskTree | null {
    return this._parent;
  }

  getChildren(): TrackingTaskTree[] {
    return this._children;
  }

  getSiblings(): TrackingTaskTree[] {
    if (!this._parent) return [];
    return this._parent.getChildren().filter((child) => child.id !== this.id);
  }

  getRoot(): TrackingTaskTree {
    let current: TrackingTaskTree = this;
    while (current._parent) {
      current = current._parent;
    }
    return current;
  }

  // Traversal methods (compatible with TaskTree)
  // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional here for callbacks that don't need to return
  walkDepthFirst(visitor: (node: TrackingTaskTree) => void | false): void {
    const shouldContinue = visitor(this);
    if (shouldContinue === false) return;

    for (const child of this._children) {
      child.walkDepthFirst(visitor);
    }
  }

  walkBreadthFirst(visitor: (node: TrackingTaskTree) => void): void {
    const queue: TrackingTaskTree[] = [this];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      visitor(current);
      queue.push(...current._children);
    }
  }

  find(predicate: (task: Task) => boolean): TrackingTaskTree | null {
    if (predicate(this._task)) return this;

    for (const child of this._children) {
      const found = child.find(predicate);
      if (found) return found;
    }

    return null;
  }

  filter(predicate: (task: Task) => boolean): TrackingTaskTree[] {
    const results: TrackingTaskTree[] = [];

    this.walkDepthFirst((node) => {
      if (predicate(node._task)) {
        results.push(node);
      }
    });

    return results;
  }

  // Query methods (compatible with TaskTree)
  getPath(): TrackingTaskTree[] {
    const path: TrackingTaskTree[] = [];
    let current: TrackingTaskTree | null = this;

    while (current) {
      path.unshift(current);
      current = current._parent;
    }

    return path;
  }

  getDepth(): number {
    return this.getPath().length - 1;
  }

  getDescendantCount(): number {
    let count = 0;
    this.walkDepthFirst(() => {
      count++;
    });
    return count - 1; // Exclude self
  }

  getAllDescendants(): TrackingTaskTree[] {
    const descendants: TrackingTaskTree[] = [];
    this.walkDepthFirst((node) => {
      if (node !== this) {
        descendants.push(node);
      }
    });
    return descendants;
  }

  isAncestorOf(other: TrackingTaskTree): boolean {
    return other.getPath().some((ancestor) => ancestor.id === this.id);
  }

  isDescendantOf(other: TrackingTaskTree): boolean {
    return other.isAncestorOf(this);
  }

  isSiblingOf(other: TrackingTaskTree): boolean {
    return this._parent?.id === other._parent?.id && this.id !== other.id;
  }

  /**
   * Update this task in place and record the operation
   */
  withTask(updates: Partial<Task>): this {
    const operation: PendingOperation = {
      type: 'task_update',
      taskId: this.id,
      updates: updates as Record<string, unknown>,
      timestamp: new Date(),
    };

    // Add operation to this node
    this._pendingOperations.push(operation);

    // Update task data in place
    Object.assign(this._task, updates);

    return this;
  }

  /**
   * Add child in place and record the operation
   */
  addChild(child: TaskTree | TrackingTaskTree): this {
    const trackingChild =
      child instanceof TrackingTaskTree ? child : TrackingTaskTree.fromTaskTree(child);

    const operation: PendingOperation = {
      type: 'child_add',
      parentId: this.id,
      childData: trackingChild.toPlainObject(),
      timestamp: new Date(),
    };

    this._pendingOperations.push(operation);

    // Add child to actual tree structure
    this._children.push(trackingChild);

    return this;
  }

  /**
   * Remove child in place and record the operation
   */
  removeChild(childId: string): this {
    const operation: PendingOperation = {
      type: 'child_remove',
      parentId: this.id,
      childId,
      timestamp: new Date(),
    };

    this._pendingOperations.push(operation);

    // Remove from actual tree structure
    this._children = this._children.filter((child) => child.id !== childId);

    return this;
  }

  /**
   * Check if any node in the tree has pending changes
   */
  get hasPendingChanges(): boolean {
    let hasChanges = this._pendingOperations.length > 0;

    if (!hasChanges) {
      this.walkDepthFirst((node) => {
        if (node._pendingOperations?.length > 0) {
          hasChanges = true;
          return false; // Stop traversal
        }
        // Explicitly return undefined (continue traversal)
        return undefined;
      });
    }

    return hasChanges;
  }

  /**
   * Flush all operations from the entire tree and return both the updated tree and ID mappings
   */
  async flush(taskService: ITaskReconciliationService): Promise<TaskFlushResult> {
    // Collect operations from all nodes
    const allOperations = this.collectAllOperations();

    if (allOperations.length === 0) {
      return {
        updatedTree: await taskService
          .executeReconciliationOperations({
            treeId: this.id,
            baseVersion: this._baseVersion,
            operations: [],
          })
          .then((result) => result.tree),
        clearedTrackingTree: this,
        idMappings: new Map<string, string>(),
      };
    }

    // Create reconciliation plan from all operations
    const reconciliationPlan: ReconciliationPlan = {
      treeId: this.id,
      baseVersion: this._baseVersion,
      operations: this.consolidateOperations(allOperations),
    };

    try {
      // Use the method that returns ID mappings
      const result = await taskService.executeReconciliationOperations(reconciliationPlan);

      // Clear all operations from all nodes
      this.clearAllOperations();

      // Update base version
      this._baseVersion += allOperations.length;

      return {
        updatedTree: result.tree,
        clearedTrackingTree: this,
        idMappings: result.idMappings,
      };
    } catch (error) {
      // Don't clear operations on failure - preserve for retry
      throw new ReconciliationError(
        `Failed to flush operations: ${error instanceof Error ? error.message : String(error)}`,
        allOperations,
        [], // No successful operations since we failed
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Collect operations from all nodes in the tree
   */
  private collectAllOperations(): PendingOperation[] {
    const operations: PendingOperation[] = [];

    this.walkDepthFirst((node) => {
      if (node._pendingOperations) {
        operations.push(...node._pendingOperations);
      }
    });

    // Sort by timestamp to maintain operation order
    return operations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Clear operations from all nodes in the tree
   */
  private clearAllOperations(): void {
    this.walkDepthFirst((node) => {
      if (node._pendingOperations) {
        node._pendingOperations.length = 0; // Clear in place
      }
    });
  }

  /**
   * Consolidate operations (e.g., merge multiple updates to same task)
   * and ensure proper ordering for database constraints
   */
  private consolidateOperations(operations: PendingOperation[]): PendingOperation[] {
    const taskUpdates = new Map<string, PendingOperation>();
    const childAddOperations: PendingOperation[] = [];
    const childRemoveOperations: PendingOperation[] = [];

    for (const op of operations) {
      if (op.type === 'task_update') {
        // Keep only the latest update for each task
        const existing = taskUpdates.get(op.taskId);
        if (!existing || op.timestamp >= existing.timestamp) {
          // Merge updates if there's an existing one
          if (existing && existing.type === 'task_update') {
            const mergedOp: PendingOperation = {
              ...op,
              updates: { ...existing.updates, ...op.updates },
            };
            taskUpdates.set(op.taskId, mergedOp);
          } else {
            taskUpdates.set(op.taskId, op);
          }
        }
      } else if (op.type === 'child_add') {
        childAddOperations.push(op);
      } else if (op.type === 'child_remove') {
        childRemoveOperations.push(op);
      }
    }

    // Sort child_add operations by depth to ensure parents are created before children
    const sortedChildAdds = this.sortChildAddOperationsByDepth(childAddOperations);

    // Sort child_remove operations by reverse depth to ensure children are removed before parents
    const sortedChildRemoves = childRemoveOperations.sort((a, b) => {
      const depthA = this.getOperationDepth(a);
      const depthB = this.getOperationDepth(b);
      return depthB - depthA; // Reverse order: deeper children first
    });

    // Final order: task updates first, then child additions (parents before children), then child removals (children before parents)
    return [
      ...Array.from(taskUpdates.values()).sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      ),
      ...sortedChildAdds,
      ...sortedChildRemoves,
    ];
  }

  /**
   * Sort child_add operations by depth to ensure parent tasks are created before child tasks
   */
  private sortChildAddOperationsByDepth(operations: PendingOperation[]): PendingOperation[] {
    return operations.sort((a, b) => {
      const depthA = this.getOperationDepth(a);
      const depthB = this.getOperationDepth(b);

      if (depthA !== depthB) {
        return depthA - depthB; // Shallower (parents) first
      }

      // Same depth, sort by timestamp
      return a.timestamp.getTime() - b.timestamp.getTime();
    });
  }

  /**
   * Get the depth of an operation by finding the corresponding node in the tree
   */
  private getOperationDepth(operation: PendingOperation): number {
    if (operation.type === 'child_add') {
      // Find the parent node to determine depth
      const parentNode = this.getRoot().find((task) => task.id === operation.parentId);
      return parentNode ? parentNode.getDepth() + 1 : 0;
    }
    if (operation.type === 'child_remove' || operation.type === 'task_update') {
      // Find the target node to determine depth
      const targetId = operation.type === 'child_remove' ? operation.childId : operation.taskId;
      const targetNode = this.getRoot().find((task) => task.id === targetId);
      return targetNode ? targetNode.getDepth() : 0;
    }
    return 0;
  }

  /**
   * Convert to plain TaskTreeData for serialization
   */
  toPlainObject(): TaskTreeData {
    return {
      task: this._task,
      children: this._children.map((child) => child.toPlainObject()),
    };
  }

  /**
   * Convert to regular TaskTree
   */
  toTaskTree(): TaskTree {
    return new TaskTree(this.toPlainObject(), null);
  }

  /**
   * Factory method to create TrackingTaskTree from regular TaskTree
   */
  static fromTaskTree(tree: TaskTree): TrackingTaskTree {
    return new TrackingTaskTree(tree.toPlainObject());
  }

  /**
   * Factory method to create TrackingTaskTree from Task
   */
  static fromTask(task: Task, children: TrackingTaskTree[] = []): TrackingTaskTree {
    const data: TaskTreeData = {
      task,
      children: children.map((child) => child.toPlainObject()),
    };
    return new TrackingTaskTree(data);
  }

  /**
   * Access to pending operations (read-only)
   */
  get pendingOperations(): readonly PendingOperation[] {
    return this._pendingOperations;
  }

  /**
   * Access to base version (for serialization)
   */
  get baseVersion(): number {
    return this._baseVersion;
  }

  /**
   * Check if tracking is enabled (always true for TrackingTaskTree)
   */
  get isTracking(): boolean {
    return true;
  }

  /**
   * Stop tracking and return a regular TaskTree
   */
  stopTracking(): TaskTree {
    return this.toTaskTree();
  }

  /**
   * Clear all pending operations
   * Note: In mutable approach, this modifies the tree in place
   */
  clearPendingOperations(): this {
    if (this._pendingOperations.length > 0) {
      this._baseVersion += this._pendingOperations.length;
      this._pendingOperations.length = 0;
    }
    return this;
  }

  /**
   * Get operations since a specific version
   */
  getOperationsSince(version: number): PendingOperation[] {
    // Simple implementation: if asking for operations since a version
    // less than or equal to our base version, return all pending operations
    // If asking for operations since a future version, return none
    return version <= this._baseVersion ? [...this._pendingOperations] : [];
  }

  /**
   * Merge operations from another source
   */
  mergeOperations(otherOperations: readonly PendingOperation[]): this {
    this._pendingOperations.push(...otherOperations);
    return this;
  }

  /**
   * Create a reconciliation plan from pending operations
   */
  createReconciliationPlan(): ReconciliationPlan {
    return {
      treeId: this.id,
      baseVersion: this._baseVersion,
      operations: this.consolidateOperations(this._pendingOperations),
    };
  }

  /**
   * Convert tree to markdown format
   */
  toMarkdown(indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);
    const status = this._task.status === 'done' ? '[x]' : '[ ]';
    const priority = this._task.priority !== 'medium' ? ` (${this._task.priority})` : '';

    let markdown = `${indent}- ${status} ${this._task.title}${priority}\n`;

    if (this._task.description) {
      markdown += `${indent}  ${this._task.description}\n`;
    }

    for (const child of this._children) {
      markdown += child.toMarkdown(indentLevel + 1);
    }

    return markdown;
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
