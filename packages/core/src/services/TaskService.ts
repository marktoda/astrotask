import type { Store } from '../database/store.js';
import type { Task, TaskStatus } from '../schemas/task.js';
import { TaskTree, type TaskTreeData } from '../utils/TaskTree.js';

/**
 * TaskService - Business logic layer for hierarchical task operations
 * Uses Store for data access but handles complex tree operations and aggregations
 */

// Legacy interface for backward compatibility
export interface LegacyTaskTree extends Task {
  children: LegacyTaskTree[];
}

export class TaskService {
  constructor(private store: Store) {}

  /**
   * Get TaskTree instance with ergonomic tree operations
   */
  async getTaskTreeClass(rootId: string, maxDepth?: number): Promise<TaskTree | null> {
    const treeData = await this.buildTaskTreeData(rootId, maxDepth);
    if (!treeData) return null;

    return new TaskTree(treeData);
  }

  /**
   * Recursively build the task tree starting from the provided root task ID
   * @deprecated Use getTaskTreeClass() for new code. This method exists for backward compatibility.
   */
  async getTaskTree(rootId: string, maxDepth?: number): Promise<LegacyTaskTree | null> {
    const rootTask = await this.store.getTask(rootId);
    if (!rootTask) return null;

    const buildTree = async (task: Task, currentDepth: number): Promise<LegacyTaskTree> => {
      const children: LegacyTaskTree[] = [];

      if (maxDepth === undefined || currentDepth < maxDepth) {
        const subtasks = await this.store.listTasks({ parentId: task.id });
        for (const subtask of subtasks) {
          children.push(await buildTree(subtask, currentDepth + 1));
        }
      }

      return { ...task, children };
    };

    return buildTree(rootTask, 0);
  }

  /**
   * Internal method to build TaskTreeData structure
   */
  private async buildTaskTreeData(rootId: string, maxDepth?: number): Promise<TaskTreeData | null> {
    const rootTask = await this.store.getTask(rootId);
    if (!rootTask) return null;

    const buildData = async (task: Task, currentDepth: number): Promise<TaskTreeData> => {
      const children: TaskTreeData[] = [];

      if (maxDepth === undefined || currentDepth < maxDepth) {
        const subtasks = await this.store.listTasks({ parentId: task.id });
        for (const subtask of subtasks) {
          children.push(await buildData(subtask, currentDepth + 1));
        }
      }

      return { task, children };
    };

    return buildData(rootTask, 0);
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
      const children = await this.store.listTasks({ parentId });
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

  /**
   * Get multiple task trees efficiently
   */
  async getTaskTrees(rootIds: string[], maxDepth?: number): Promise<TaskTree[]> {
    const trees = await Promise.all(rootIds.map((id) => this.getTaskTreeClass(id, maxDepth)));

    return trees.filter((tree): tree is TaskTree => tree !== null);
  }

  /**
   * Find tasks matching a predicate within a tree
   */
  async findTasksInTree(rootId: string, predicate: (task: Task) => boolean): Promise<Task[]> {
    const tree = await this.getTaskTreeClass(rootId);
    if (!tree) return [];

    return tree.filter(predicate).map((taskTree) => taskTree.task);
  }

  /**
   * Get task with full tree context (ancestors + descendants)
   */
  async getTaskWithContext(taskId: string): Promise<{
    task: Task;
    ancestors: Task[];
    descendants: TaskTree[];
    root: TaskTree | null;
  } | null> {
    const task = await this.store.getTask(taskId);
    if (!task) return null;

    const [ancestors, descendants] = await Promise.all([
      this.getTaskAncestors(taskId),
      this.getTaskDescendants(taskId),
    ]);

    // Get the root task tree for full context
    const rootId = ancestors.length > 0 && ancestors[0] ? ancestors[0].id : taskId;
    const root = await this.getTaskTreeClass(rootId);

    // Build descendant trees
    const descendantTrees = await Promise.all(
      descendants
        .filter((d) => d.parentId === taskId) // Only immediate children
        .map((d) => this.getTaskTreeClass(d.id))
    );

    return {
      task,
      ancestors,
      descendants: descendantTrees.filter((tree): tree is TaskTree => tree !== null),
      root,
    };
  }
}
