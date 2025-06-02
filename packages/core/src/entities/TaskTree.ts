import { z } from 'zod';
import type { Task, TaskStatus } from '../schemas/task.js';

/**
 * Common interface for all TaskTree implementations
 * This ensures both immutable (TaskTree) and mutable (TrackingTaskTree) versions
 * maintain the same public API
 */
export interface ITaskTree {
  // Core properties
  readonly task: Task;
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;

  // Navigation methods
  getParent(): ITaskTree | null;
  getChildren(): readonly ITaskTree[];
  getSiblings(): ITaskTree[];
  getRoot(): ITaskTree;

  // Traversal methods
  // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional here for callbacks that don't need to return
  walkDepthFirst(visitor: (node: ITaskTree) => void | false): void;
  walkBreadthFirst(visitor: (node: ITaskTree) => void): void;
  find(predicate: (task: Task) => boolean): ITaskTree | null;
  filter(predicate: (task: Task) => boolean): ITaskTree[];

  // Query methods
  getPath(): ITaskTree[];
  getDepth(): number;
  getDescendantCount(): number;
  getAllDescendants(): ITaskTree[];
  isAncestorOf(other: ITaskTree): boolean;
  isDescendantOf(other: ITaskTree): boolean;
  isSiblingOf(other: ITaskTree): boolean;

  // Hierarchical status methods
  getEffectiveStatus(): TaskStatus;
  hasAncestorWithStatus(status: TaskStatus): boolean;
  getAncestorWithStatus(status: TaskStatus): ITaskTree | null;

  // Transformation methods
  withTask(updates: Partial<Task>): ITaskTree;
  addChild(child: ITaskTree): ITaskTree;
  removeChild(childId: string): ITaskTree;

  // Serialization methods
  toPlainObject(): TaskTreeData;
  toTaskTree?(): TaskTree; // Optional - for TrackingTaskTree to convert to immutable
}

/*
 * TaskTree Schema - Recursive task structure with children
 */
export const taskTreeSchema: z.ZodType<TaskTreeData> = z.lazy(() =>
  z.object({
    task: z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled', 'archived']),
      priority: z.enum(['low', 'medium', 'high']),
      prd: z.string().nullable(),
      contextDigest: z.string().nullable(),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
    children: z.array(taskTreeSchema),
  })
);

export type TaskTreeData = {
  task: Task;
  children: TaskTreeData[];
};

/**
 * Immutable TaskTree class providing ergonomic tree operations
 *
 * Key principles:
 * - Immutable API: All operations return new instances
 * - Type-safe: Full TypeScript coverage with Zod validation
 * - Performance: Lazy loading and caching where possible
 * - Backward compatible: Works with existing TaskService interface
 */
export class TaskTree implements ITaskTree {
  private readonly _task: Task;
  private readonly _children: TaskTree[];
  private readonly _parent: TaskTree | null;

  constructor(data: TaskTreeData, parent: TaskTree | null = null) {
    // Validate input data
    taskTreeSchema.parse(data);

    this._task = data.task;
    this._parent = parent;
    this._children = data.children.map((childData) => new TaskTree(childData, this));
  }

  // Core getters
  get task(): Task {
    return this._task;
  }

  get id(): string {
    return this._task.id;
  }

  get title(): string {
    return this._task.title;
  }

  get status(): TaskStatus {
    return this._task.status;
  }

  // Navigation methods
  getParent(): TaskTree | null {
    return this._parent;
  }

  getChildren(): readonly TaskTree[] {
    return this._children;
  }

  getSiblings(): TaskTree[] {
    if (!this._parent) return [];
    return this._parent.getChildren().filter((child) => child.id !== this.id);
  }

  getRoot(): TaskTree {
    let current: TaskTree = this;
    while (current._parent) {
      current = current._parent;
    }
    return current;
  }

  /**
   * Traverses the tree using depth-first search (DFS) pre-order
   *
   * Visits current node first, then recursively visits all children.
   * This traversal order is useful for operations that need to process
   * parent nodes before their children (e.g., validation, aggregation).
   *
   * @param visitor - Function called for each node during traversal. Return false to stop traversal.
   *
   * @complexity O(n) where n = total number of nodes in subtree
   * @space O(h) where h = height of tree (due to recursion stack)
   *
   * @sideEffects
   * - Calls visitor function for each node (may have side effects)
   * - Uses recursion which consumes call stack space
   *
   * @algorithm Pre-order DFS: Node → Left subtrees → Right subtrees
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: void is intentional here for callbacks that don't need to return
  walkDepthFirst(visitor: (node: TaskTree) => void | false): void {
    const shouldContinue = visitor(this);
    if (shouldContinue === false) return;

    for (const child of this._children) {
      child.walkDepthFirst(visitor);
    }
  }

  /**
   * Traverses the tree using breadth-first search (BFS) level-order
   *
   * Visits all nodes at the current level before moving to the next level.
   * This traversal is useful for level-based operations (e.g., finding
   * shortest path, level-wise processing, tree visualization).
   *
   * @param visitor - Function called for each node during traversal
   *
   * @complexity O(n) where n = total number of nodes in subtree
   * @space O(w) where w = maximum width of tree (queue size)
   *
   * @sideEffects
   * - Calls visitor function for each node (may have side effects)
   * - Allocates queue array that grows with tree width
   *
   * @algorithm BFS using queue: Level 0 → Level 1 → Level 2 → ...
   */
  walkBreadthFirst(visitor: (node: TaskTree) => void): void {
    const queue: TaskTree[] = [this];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      visitor(current);
      queue.push(...current._children);
    }
  }

  find(predicate: (task: Task) => boolean): TaskTree | null {
    if (predicate(this._task)) return this;

    for (const child of this._children) {
      const found = child.find(predicate);
      if (found) return found;
    }

    return null;
  }

  filter(predicate: (task: Task) => boolean): TaskTree[] {
    const results: TaskTree[] = [];

    this.walkDepthFirst((node) => {
      if (predicate(node._task)) {
        results.push(node);
      }
    });

    return results;
  }

  // Query methods
  getPath(): TaskTree[] {
    const path: TaskTree[] = [];
    let current: TaskTree | null = this;

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
      // Explicitly return undefined to satisfy the visitor signature
      return undefined;
    });
    return count - 1; // Exclude self
  }

  getAllDescendants(): TaskTree[] {
    const descendants: TaskTree[] = [];
    this.walkDepthFirst((node) => {
      if (node !== this) {
        descendants.push(node);
      }
    });
    return descendants;
  }

  isAncestorOf(other: TaskTree): boolean {
    return other.getPath().some((ancestor) => ancestor.id === this.id);
  }

  isDescendantOf(other: TaskTree): boolean {
    return other.isAncestorOf(this);
  }

  isSiblingOf(other: TaskTree): boolean {
    return this._parent?.id === other._parent?.id && this.id !== other.id;
  }

  // Hierarchical status methods
  getEffectiveStatus(): TaskStatus {
    // Check ancestors for overriding statuses
    const doneAncestor = this.getAncestorWithStatus('done');
    if (doneAncestor) return 'done';
    
    const cancelledAncestor = this.getAncestorWithStatus('cancelled');
    if (cancelledAncestor) return 'cancelled';
    
    const archivedAncestor = this.getAncestorWithStatus('archived');
    if (archivedAncestor) return 'archived';
    
    // No overriding ancestor status, return actual status
    return this.status;
  }

  hasAncestorWithStatus(status: TaskStatus): boolean {
    return this.getAncestorWithStatus(status) !== null;
  }

  getAncestorWithStatus(status: TaskStatus): ITaskTree | null {
    let current = this.getParent();
    
    while (current) {
      if (current.status === status) {
        return current;
      }
      current = current.getParent();
    }
    
    return null;
  }

  // Immutable transformation methods
  withTask(updates: Partial<Task>): TaskTree {
    const updatedTask = { ...this._task, ...updates };
    const data: TaskTreeData = {
      task: updatedTask,
      children: this._children.map((child) => child.toPlainObject()),
    };
    return new TaskTree(data, this._parent);
  }

  withChildren(children: TaskTree[]): TaskTree {
    const data: TaskTreeData = {
      task: this._task,
      children: children.map((child) => child.toPlainObject()),
    };
    return new TaskTree(data, this._parent);
  }

  addChild(child: TaskTree): TaskTree {
    return this.withChildren([...this._children, child]);
  }

  removeChild(childId: string): TaskTree {
    const filteredChildren = this._children.filter((child) => child.id !== childId);
    return this.withChildren(filteredChildren);
  }

  /**
   * Updates all descendant nodes matching the given predicate with immutable semantics
   *
   * Performs a recursive tree transformation where nodes matching the predicate
   * receive the specified updates. Returns a new tree instance with all changes
   * applied, preserving immutability throughout the tree structure.
   *
   * @param predicate - Function to determine which tasks should be updated
   * @param updates - Partial task updates to apply to matching nodes
   * @returns New TaskTree instance with updates applied
   *
   * @complexity O(n) where n = total number of nodes in subtree
   * @space O(n) for creating new tree instances (structural sharing not implemented)
   *
   * @sideEffects None - pure function returning new instances
   *
   * @immutability
   * - Original tree remains unchanged
   * - Creates new TaskTree instances for modified paths
   * - Maintains referential integrity of parent-child relationships
   */
  updateDescendants(predicate: (task: Task) => boolean, updates: Partial<Task>): TaskTree {
    const updateTree = (node: TaskTree): TaskTree => {
      const shouldUpdate = predicate(node._task);
      const updatedTask = shouldUpdate ? { ...node._task, ...updates } : node._task;

      const updatedChildren = node._children.map(updateTree);

      const data: TaskTreeData = {
        task: updatedTask,
        children: updatedChildren.map((child) => child.toPlainObject()),
      };

      return new TaskTree(data, node._parent);
    };

    return updateTree(this);
  }

  /**
   * Applies multiple update operations to the tree in sequence with immutable semantics
   *
   * Processes an array of batch operations sequentially, where each operation
   * is applied to the result of the previous operation. This enables complex
   * tree transformations to be expressed as a series of atomic operations.
   *
   * @param updates - Array of batch operations to apply in sequence
   * @returns New TaskTree instance with all operations applied
   *
   * @complexity O(k*n) where k = number of operations, n = nodes affected per operation
   * @space O(n) for intermediate tree instances created during processing
   *
   * @sideEffects None - pure function with immutable operations
   *
   * @operationTypes
   * - update_task: Updates a specific task by ID
   * - bulk_status_update: Updates status for multiple tasks by ID list
   * - Future: move_task, delete_task, etc.
   */
  batchUpdate(updates: BatchUpdateOperation[]): TaskTree {
    let current: TaskTree = this;

    for (const operation of updates) {
      current = current.applyBatchOperation(current, operation);
    }

    return current;
  }

  private applyBatchOperation(tree: TaskTree, operation: BatchUpdateOperation): TaskTree {
    switch (operation.type) {
      case 'update_task': {
        const predicate = (task: Task) => task.id === operation.taskId;
        return operation.taskId === tree.id
          ? tree.withTask(operation.updates)
          : tree.updateDescendants(predicate, operation.updates);
      }
      case 'bulk_status_update': {
        const predicate = (task: Task) => operation.taskIds.includes(task.id);
        return tree.updateDescendants(predicate, { status: operation.status });
      }
      default:
        return tree;
    }
  }

  // Batch query operations
  static batchFind(trees: TaskTree[], predicate: (task: Task) => boolean): Map<string, TaskTree[]> {
    const results = new Map<string, TaskTree[]>();

    for (const tree of trees) {
      const found = tree.filter(predicate);
      if (found.length > 0) {
        results.set(tree.id, found);
      }
    }

    return results;
  }

  static batchTransform(trees: TaskTree[], transformer: (tree: TaskTree) => TaskTree): TaskTree[] {
    return trees.map(transformer);
  }

  // Tree aggregation operations
  static aggregateMetrics(trees: TaskTree[]): TreeMetrics {
    let totalTasks = 0;
    let totalDepth = 0;
    let maxDepth = 0;
    const statusCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();

    for (const tree of trees) {
      tree.walkDepthFirst((node) => {
        totalTasks++;
        const depth = node.getDepth();
        totalDepth += depth;
        maxDepth = Math.max(maxDepth, depth);

        // Count statuses
        const statusCount = statusCounts.get(node.status) || 0;
        statusCounts.set(node.status, statusCount + 1);

        // Count priorities
        const priorityCount = priorityCounts.get(node.task.priority) || 0;
        priorityCounts.set(node.task.priority, priorityCount + 1);
      });
    }

    return {
      totalTasks,
      averageDepth: totalTasks > 0 ? totalDepth / totalTasks : 0,
      maxDepth,
      treeCount: trees.length,
      statusDistribution: Object.fromEntries(statusCounts),
      priorityDistribution: Object.fromEntries(priorityCounts),
    };
  }

  // Serialization methods
  toPlainObject(): TaskTreeData {
    return {
      task: this._task,
      children: this._children.map((child) => child.toPlainObject()),
    };
  }

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

  // Factory methods

  static fromTask(task: Task, children: TaskTree[] = []): TaskTree {
    const data: TaskTreeData = {
      task,
      children: children.map((child) => child.toPlainObject()),
    };

    return new TaskTree(data);
  }
}

// Core batch operation types - simplified for common use cases
export type BatchUpdateOperation =
  | { type: 'update_task'; taskId: string; updates: Partial<Task> }
  | { type: 'bulk_status_update'; taskIds: string[]; status: TaskStatus };

export interface TreeMetrics {
  totalTasks: number;
  averageDepth: number;
  maxDepth: number;
  treeCount: number;
  statusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
}
