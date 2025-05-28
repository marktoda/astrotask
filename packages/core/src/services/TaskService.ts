import type { Store } from '../database/store.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import { TaskTree, type TaskTreeData } from '../utils/TaskTree.js';
import { CachedTaskTreeOperations, TaskTreeCache } from '../utils/TaskTreeCache.js';
import {
  type ValidationResult,
  validateMoveOperation,
  validateTaskTree,
} from '../utils/TaskTreeValidation.js';
import { type ReconciliationPlan, TrackingTaskTree } from '../utils/TrackingTaskTree.js';

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

  /**
   * Create a complete task tree atomically (storage layer interface)
   */
  async createTaskTree(trackingTree: TrackingTaskTree): Promise<TaskTree> {
    // Create reconciliation plan
    const plan = trackingTree.createReconciliationPlan();

    // Execute the reconciliation plan atomically
    const persistedTree = await this.reconcileTaskTree(plan, trackingTree);

    // Clear cache since we've added new tasks
    this.clearCache();

    return persistedTree;
  }

  /**
   * Reconcile a TrackingTaskTree with the store based on a reconciliation plan
   */
  private async reconcileTaskTree(
    _plan: ReconciliationPlan,
    trackingTree: TrackingTaskTree
  ): Promise<TaskTree> {
    // For this implementation, we'll create all tasks from the tree
    // In the future, this could be more sophisticated with partial updates

    const createdTasks: Task[] = [];
    const taskMap = new Map<string, string>(); // temp ID -> real ID

    try {
      // Create root task first
      const rootTaskData = this.convertToCreateTask(trackingTree.task);
      const rootTask = await this.store.addTask(rootTaskData);
      if (!rootTask) {
        throw new Error('Failed to create root task');
      }

      createdTasks.push(rootTask);
      taskMap.set(trackingTree.id, rootTask.id);

      // Create children recursively
      await this.createChildrenRecursively(trackingTree, rootTask.id, taskMap, createdTasks);

      // Build the final tree from persisted tasks
      const finalTree = await this.getTaskTree(rootTask.id);
      if (!finalTree) {
        throw new Error('Failed to retrieve created tree');
      }

      return finalTree;
    } catch (error) {
      // Rollback - delete any created tasks
      for (const task of createdTasks.reverse()) {
        try {
          await this.store.deleteTask(task.id);
        } catch (deleteError) {
          // Log but don't throw - we're already in error state
          console.error('Failed to rollback task during reconciliation error:', deleteError);
        }
      }

      throw new Error(
        `Task tree reconciliation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Recursively create children tasks with proper parent relationships
   */
  private async createChildrenRecursively(
    parentTree: TrackingTaskTree | TaskTree,
    realParentId: string,
    taskMap: Map<string, string>,
    createdTasks: Task[]
  ): Promise<void> {
    for (const child of parentTree.getChildren()) {
      // Convert child to CreateTask format
      const childTaskData = this.convertToCreateTask(child.task);
      childTaskData.parentId = realParentId; // Set correct parent ID

      // Create the child task
      const childTask = await this.store.addTask(childTaskData);
      if (!childTask) {
        throw new Error(`Failed to create child task: ${child.task.title}`);
      }

      createdTasks.push(childTask);
      taskMap.set(child.id, childTask.id);

      // Recursively create grandchildren
      if (child.getChildren().length > 0) {
        await this.createChildrenRecursively(child, childTask.id, taskMap, createdTasks);
      }
    }
  }

  /**
   * Convert a Task to CreateTask format for persistence
   */
  private convertToCreateTask(task: Task): CreateTask {
    return {
      parentId: task.parentId ?? undefined,
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      priority: task.priority,
      prd: task.prd ?? undefined,
      contextDigest: task.contextDigest ?? undefined,
    };
  }

  /**
   * Get a TrackingTaskTree for making optimistic updates
   */
  async getTrackingTaskTree(rootId: string, maxDepth?: number): Promise<TrackingTaskTree | null> {
    const tree = await this.getTaskTree(rootId, maxDepth);
    if (!tree) return null;

    return TrackingTaskTree.fromTaskTree(tree);
  }

  /**
   * Apply pending operations from a TrackingTaskTree to the store
   */
  async applyTrackingTreeChanges(trackingTree: TrackingTaskTree): Promise<TaskTree> {
    if (!trackingTree.hasPendingChanges) {
      // No changes to apply, just return current tree
      const currentTree = await this.getTaskTree(trackingTree.id);
      if (!currentTree) {
        throw new Error('Task tree not found');
      }
      return currentTree;
    }

    const plan = trackingTree.createReconciliationPlan();
    return this.reconcileTaskTree(plan, trackingTree);
  }
}
