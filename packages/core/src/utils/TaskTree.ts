import { z } from 'zod';
import type { Task, TaskStatus } from '../schemas/task.js';

/**
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
export class TaskTree {
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

  // Traversal methods
  walkDepthFirst(visitor: (node: TaskTree) => void): void {
    visitor(this);
    for (const child of this._children) {
      child.walkDepthFirst(visitor);
    }
  }

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
    this.walkDepthFirst(() => count++);
    return count - 1; // Exclude self
  }

  getAllDescendants(): TaskTree[] {
    const descendants: TaskTree[] = [];
    for (const child of this._children) {
      descendants.push(child);
      descendants.push(...child.getAllDescendants());
    }
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

  // Bulk operations
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

  // Enhanced batch operations
  batchUpdate(updates: BatchUpdateOperation[]): TaskTree {
    let current: TaskTree = this;

    for (const operation of updates) {
      current = current.applyBatchOperation(current, operation);
    }

    return current;
  }

  private applyBatchOperation(tree: TaskTree, operation: BatchUpdateOperation): TaskTree {
    switch (operation.type) {
      case 'update_task':
        return operation.taskId === tree.id
          ? tree.withTask(operation.updates)
          : tree.updateDescendants((task) => task.id === operation.taskId, operation.updates);

      case 'update_by_predicate':
        return tree.updateDescendants(operation.predicate, operation.updates);

      case 'add_child':
        return operation.parentId === tree.id
          ? tree.addChild(operation.child)
          : tree.updateDescendants(
              (task) => task.id === operation.parentId,
              {} // No task updates, just structural change
            );

      case 'remove_child':
        return operation.parentId === tree.id
          ? tree.removeChild(operation.childId)
          : tree.updateDescendants(
              (task) => task.id === operation.parentId,
              {} // No task updates, just structural change
            );

      case 'bulk_status_update':
        return tree.updateDescendants((task) => operation.taskIds.includes(task.id), {
          status: operation.status,
        });

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

  // Legacy compatibility - matches existing TaskService.TaskTree interface
  toLegacyFormat(): LegacyTaskTree {
    return {
      ...this._task,
      children: this._children.map((child) => child.toLegacyFormat()),
    };
  }

  // Factory methods
  static fromLegacyFormat(legacyTree: LegacyTaskTree): TaskTree {
    const data: TaskTreeData = {
      task: {
        id: legacyTree.id,
        parentId: legacyTree.parentId,
        title: legacyTree.title,
        description: legacyTree.description,
        status: legacyTree.status,
        priority: legacyTree.priority,
        prd: legacyTree.prd,
        contextDigest: legacyTree.contextDigest,
        createdAt: legacyTree.createdAt,
        updatedAt: legacyTree.updatedAt,
      },
      children: legacyTree.children.map((child) =>
        TaskTree.fromLegacyFormat(child).toPlainObject()
      ),
    };

    return new TaskTree(data);
  }

  static fromTask(task: Task, children: TaskTree[] = []): TaskTree {
    const data: TaskTreeData = {
      task,
      children: children.map((child) => child.toPlainObject()),
    };

    return new TaskTree(data);
  }
}

// Legacy TaskTree interface for backward compatibility
export interface LegacyTaskTree extends Task {
  children: LegacyTaskTree[];
}

// Validation helper
export function validateTaskTree(data: unknown): data is TaskTreeData {
  try {
    taskTreeSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}

// Enhanced batch operation types
export type BatchUpdateOperation =
  | { type: 'update_task'; taskId: string; updates: Partial<Task> }
  | { type: 'update_by_predicate'; predicate: (task: Task) => boolean; updates: Partial<Task> }
  | { type: 'add_child'; parentId: string; child: TaskTree }
  | { type: 'remove_child'; parentId: string; childId: string }
  | { type: 'bulk_status_update'; taskIds: string[]; status: TaskStatus };

export interface TreeMetrics {
  totalTasks: number;
  averageDepth: number;
  maxDepth: number;
  treeCount: number;
  statusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
}
