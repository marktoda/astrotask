import type { Store } from '../database/store.js';
import type { Task, TaskStatus } from '../schemas/task.js';
import { type BatchUpdateOperation, TaskTree, type TaskTreeData } from '../utils/TaskTree.js';
import { CachedTaskTreeOperations, TaskTreeCache } from '../utils/TaskTreeCache.js';
import {
  type ValidationResult,
  validateMoveOperation,
  validateTaskTree,
} from '../utils/TaskTreeValidation.js';

/**
 * TaskService - Business logic layer for hierarchical task operations
 * Uses Store for data access but handles complex tree operations and aggregations
 */

export class TaskService {
  private cache: TaskTreeCache;
  private cachedOps: CachedTaskTreeOperations;

  constructor(
    private store: Store,
    cacheOptions?: Partial<{ maxSize: number; ttlMs: number; maxAge: number }>
  ) {
    this.cache = new TaskTreeCache(cacheOptions);
    this.cachedOps = new CachedTaskTreeOperations(this.cache);
  }

  /**
   * Get TaskTree instance with ergonomic tree operations (cached)
   * If no rootId provided, returns synthetic root containing all parentless tasks
   */
  async getTaskTree(rootId?: string, maxDepth?: number): Promise<TaskTree | null> {
    // Special case: synthetic root for entire task forest
    if (rootId === undefined) {
      return this.cachedOps.getOrBuildTree('__SYNTHETIC_ROOT__', maxDepth, async () => {
        const treeData = await this.buildSyntheticRootTreeData(maxDepth);
        return treeData ? new TaskTree(treeData) : null;
      });
    }

    return this.cachedOps.getOrBuildTree(rootId, maxDepth, async () => {
      const treeData = await this.buildTaskTreeData(rootId, maxDepth);
      return treeData ? new TaskTree(treeData) : null;
    });
  }

  /**
   * Internal method to build synthetic root containing all parentless tasks
   */
  private async buildSyntheticRootTreeData(maxDepth?: number): Promise<TaskTreeData | null> {
    // Get all tasks with no parent (root tasks)
    const rootTasks = await this.store.listTasks({ parentId: null });

    if (rootTasks.length === 0) {
      return null; // No tasks exist
    }

    // Create synthetic root task
    const syntheticRoot: Task = {
      id: '__SYNTHETIC_ROOT__',
      parentId: null,
      title: 'All Tasks',
      description: 'Synthetic root containing all task hierarchies',
      status: 'pending' as const,
      priority: 'medium' as const,
      prd: null,
      contextDigest: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Build tree data for all root tasks
    const children: TaskTreeData[] = [];
    const adjustedMaxDepth = maxDepth === undefined ? undefined : maxDepth - 1;

    for (const rootTask of rootTasks) {
      const childData = await this.buildTaskTreeData(rootTask.id, adjustedMaxDepth);
      if (childData) {
        children.push(childData);
      }
    }

    return { task: syntheticRoot, children };
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
   * Move an entire task subtree to a new parent (with validation)
   */
  async moveTaskTree(
    taskId: string,
    newParentId: string | null
  ): Promise<{ success: boolean; validation?: ValidationResult }> {
    const task = await this.store.getTask(taskId);
    if (!task) return { success: false };

    // Get the root tree for validation context
    const rootId = await this.findRootTask(taskId);
    const rootTree = rootId ? await this.getTaskTree(rootId) : null;

    if (rootTree) {
      // Validate the move operation
      const validation = validateMoveOperation(taskId, newParentId, rootTree);
      if (!validation.isValid) {
        return { success: false, validation };
      }
    }

    // Validate new parent exists (unless moving to root)
    if (newParentId) {
      const newParent = await this.store.getTask(newParentId);
      if (!newParent) return { success: false };
    }

    // Update the parent reference
    const updatedTask = await this.store.updateTask(taskId, { parentId: newParentId });
    const success = !!updatedTask;

    if (success) {
      // Invalidate cache for affected tasks
      const ancestors = await this.getTaskAncestors(taskId);
      const descendants = await this.getTaskDescendants(taskId);
      this.cache.invalidateTreeFamily(
        taskId,
        ancestors.map((a) => a.id),
        descendants.map((d) => d.id)
      );
    }

    return { success };
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
    const trees = await Promise.all(rootIds.map((id) => this.getTaskTree(id, maxDepth)));

    return trees.filter((tree): tree is TaskTree => tree !== null);
  }

  /**
   * Find tasks matching a predicate within a tree
   */
  async findTasksInTree(rootId: string, predicate: (task: Task) => boolean): Promise<Task[]> {
    const tree = await this.getTaskTree(rootId);
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
    const root = await this.getTaskTree(rootId);

    // Build descendant trees
    const descendantTrees = await Promise.all(
      descendants
        .filter((d) => d.parentId === taskId) // Only immediate children
        .map((d) => this.getTaskTree(d.id))
    );

    return {
      task,
      ancestors,
      descendants: descendantTrees.filter((tree): tree is TaskTree => tree !== null),
      root,
    };
  }

  /**
   * Find the root task for a given task ID
   */
  private async findRootTask(taskId: string): Promise<string | null> {
    const ancestors = await this.getTaskAncestors(taskId);
    return ancestors.length > 0 && ancestors[0] ? ancestors[0].id : taskId;
  }

  /**
   * Enhanced batch operations with caching
   */
  async batchUpdateTasks(
    operations: BatchUpdateOperation[]
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const operationsByRoot = await this.groupOperationsByRoot(operations);
      await this.applyGroupedOperations(operationsByRoot, errors);

      return { success: errors.length === 0, errors };
    } catch (error) {
      return { success: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
    }
  }

  private async groupOperationsByRoot(
    operations: BatchUpdateOperation[]
  ): Promise<Map<string, BatchUpdateOperation[]>> {
    const operationsByRoot = new Map<string, BatchUpdateOperation[]>();

    for (const op of operations) {
      const rootId = await this.getRootIdForOperation(op);

      if (rootId) {
        if (!operationsByRoot.has(rootId)) {
          operationsByRoot.set(rootId, []);
        }
        const rootOps = operationsByRoot.get(rootId);
        if (rootOps) {
          rootOps.push(op);
        }
      }
    }

    return operationsByRoot;
  }

  private async getRootIdForOperation(op: BatchUpdateOperation): Promise<string | null> {
    switch (op.type) {
      case 'update_task':
        return this.findRootTask(op.taskId);
      case 'bulk_status_update':
        if (op.taskIds.length > 0 && op.taskIds[0]) {
          return this.findRootTask(op.taskIds[0]);
        }
        return null;
      default:
        return null;
    }
  }

  private async applyGroupedOperations(
    operationsByRoot: Map<string, BatchUpdateOperation[]>,
    errors: string[]
  ): Promise<void> {
    for (const [rootId, rootOperations] of operationsByRoot) {
      const tree = await this.getTaskTree(rootId);
      if (!tree) {
        errors.push(`Root tree not found: ${rootId}`);
        continue;
      }

      tree.batchUpdate(rootOperations);
      this.cache.invalidateTree(rootId);
    }
  }

  /**
   * Validate a task tree structure
   */
  async validateTree(
    rootId: string,
    options?: { maxDepth?: number; checkStatusConsistency?: boolean }
  ): Promise<ValidationResult> {
    const tree = await this.getTaskTree(rootId);
    if (!tree) {
      return {
        isValid: false,
        errors: [{ type: 'malformed_tree', taskId: rootId, message: 'Tree not found' }],
        warnings: [],
      };
    }

    return validateTaskTree(tree, options);
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear the task tree cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get aggregated metrics across multiple trees
   */
  async getTreeMetrics(rootIds: string[]): Promise<{
    totalTasks: number;
    averageDepth: number;
    maxDepth: number;
    treeCount: number;
    statusDistribution: Record<string, number>;
    priorityDistribution: Record<string, number>;
  }> {
    const trees = await this.getTaskTrees(rootIds);
    return TaskTree.aggregateMetrics(trees);
  }
}
