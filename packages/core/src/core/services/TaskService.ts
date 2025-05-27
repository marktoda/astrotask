import type { Store } from '../../database/store.js';
import type { Task, TaskStatus } from '../../schemas/task.js';

/**
 * TaskService - Business logic layer for hierarchical task operations
 * Uses Store for data access but handles complex tree operations and aggregations
 */
export interface TaskTree extends Task {
  children: TaskTree[];
}

export class TaskService {
  constructor(private store: Store) {}

  /**
   * Recursively build the task tree starting from the provided root task ID
   */
  async getTaskTree(rootId: string, maxDepth?: number): Promise<TaskTree | null> {
    const rootTask = await this.store.getTask(rootId);
    if (!rootTask) return null;

    const buildTree = async (task: Task, currentDepth: number): Promise<TaskTree> => {
      const children: TaskTree[] = [];

      if (maxDepth === undefined || currentDepth < maxDepth) {
        const subtasks = await this.store.listSubtasks(task.id);
        for (const subtask of subtasks) {
          children.push(await buildTree(subtask, currentDepth + 1));
        }
      }

      return { ...task, children };
    };

    return buildTree(rootTask, 0);
  }

  /**
   * Return all ancestor tasks up to the root (closest first, root last)
   */
  async getTaskAncestors(taskId: string): Promise<Task[]> {
    const ancestors: Task[] = [];
    let current = await this.store.getTask(taskId);

    while (current?.parentId) {
      const parent = await this.store.getTask(current.parentId);
      if (!parent) break;
      ancestors.unshift(parent); // root first ordering
      current = parent;
    }

    return ancestors;
  }

  /**
   * Return every descendant (children, grandchildren, etc.) of a task
   */
  async getTaskDescendants(taskId: string): Promise<Task[]> {
    const descendants: Task[] = [];

    const collectDescendants = async (parentId: string): Promise<void> => {
      const children = await this.store.listSubtasks(parentId);
      for (const child of children) {
        descendants.push(child);
        await collectDescendants(child.id);
      }
    };

    await collectDescendants(taskId);
    return descendants;
  }

  /**
   * Return depth (distance from root) of the task in its hierarchy
   */
  async getTaskDepth(taskId: string): Promise<number> {
    const ancestors = await this.getTaskAncestors(taskId);
    return ancestors.length;
  }

  /**
   * Move an entire task subtree to a new parent
   */
  async moveTaskTree(taskId: string, newParentId: string | null): Promise<boolean> {
    const task = await this.store.getTask(taskId);
    if (!task) return false;

    // Validate new parent exists (unless moving to root)
    if (newParentId) {
      const newParent = await this.store.getTask(newParentId);
      if (!newParent) return false;

      // Prevent circular references
      const ancestors = await this.getTaskAncestors(newParentId);
      if (ancestors.some((ancestor) => ancestor.id === taskId)) {
        return false;
      }
    }

    // Update the parent reference
    const updatedTask = await this.store.updateTask(taskId, { parentId: newParentId });
    return !!updatedTask;
  }

  /**
   * Delete a task and all its descendants
   */
  async deleteTaskTree(taskId: string, cascade = true): Promise<boolean> {
    if (cascade) {
      const descendants = await this.getTaskDescendants(taskId);
      // Delete from leaves up to avoid foreign key conflicts (children before parent)
      for (const descendant of descendants.slice().reverse()) {
        await this.store.deleteTask(descendant.id);
      }
    }

    return this.store.deleteTask(taskId);
  }

  /**
   * Bulk update status for an entire task tree
   */
  async updateTreeStatus(rootId: string, status: TaskStatus): Promise<number> {
    const descendants = await this.getTaskDescendants(rootId);
    const allTasks = [rootId, ...descendants.map((d) => d.id)];

    let updatedCount = 0;
    for (const taskId of allTasks) {
      const updated = await this.store.updateTask(taskId, { status });
      if (updated) updatedCount++;
    }

    return updatedCount;
  }
}
