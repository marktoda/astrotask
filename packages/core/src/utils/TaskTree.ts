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
