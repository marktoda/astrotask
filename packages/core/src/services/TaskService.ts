import type { Store } from '../database/store.js';
import type { TaskDependencyGraph, TaskWithDependencies } from '../schemas/dependency.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import { TaskTree, type TaskTreeData } from '../utils/TaskTree.js';
import { CachedTaskTreeOperations, TaskTreeCache } from '../utils/TaskTreeCache.js';
import { TASK_IDENTIFIERS } from '../utils/TaskTreeConstants.js';
import {
  type ValidationResult,
  validateMoveOperation,
  validateTaskTree,
} from '../utils/TaskTreeValidation.js';
import type { ReconciliationPlan } from '../utils/TrackingTaskTree.js';
import {
  type StatusTransitionResult,
  validateStatusTransition,
} from '../utils/statusTransitions.js';
import { DependencyService } from './DependencyService.js';

/**
 * TaskService - Business logic layer for hierarchical task operations
 * Uses Store for data access but handles complex tree operations and aggregations
 * Now includes dependency-aware operations for task status management
 */

export class TaskService {
  private cache: TaskTreeCache;
  private cachedOps: CachedTaskTreeOperations;
  private dependencyService: DependencyService;

  constructor(
    private store: Store,
    cacheOptions?: Partial<{ maxSize: number; ttlMs: number; maxAge: number }>
  ) {
    this.cache = new TaskTreeCache(cacheOptions);
    this.cachedOps = new CachedTaskTreeOperations(this.cache);
    this.dependencyService = new DependencyService(store);
  }

  /**
   * Get TaskTree instance with ergonomic tree operations (cached)
   * If no rootId provided, returns project tree containing all parentless tasks
   */
  async getTaskTree(rootId?: string, maxDepth?: number): Promise<TaskTree | null> {
    // Special case: project tree for entire task forest
    if (rootId === undefined) {
      return this.cachedOps.getOrBuildTree(TASK_IDENTIFIERS.PROJECT_ROOT, maxDepth, async () => {
        const treeData = await this.buildProjectTreeData(maxDepth);
        return treeData ? new TaskTree(treeData) : null;
      });
    }

    return this.cachedOps.getOrBuildTree(rootId, maxDepth, async () => {
      const treeData = await this.buildTaskTreeData(rootId, maxDepth);
      return treeData ? new TaskTree(treeData) : null;
    });
  }

  /**
   * Internal method to build project tree containing all parentless tasks
   */
  private async buildProjectTreeData(maxDepth?: number): Promise<TaskTreeData | null> {
    // Get all tasks with PROJECT_ROOT as parent (root tasks)
    const rootTasks = await this.store.listTasks({ parentId: TASK_IDENTIFIERS.PROJECT_ROOT });

    // Create project root task - always return this even if no child tasks exist
    const projectRoot: Task = {
      id: TASK_IDENTIFIERS.PROJECT_ROOT,
      parentId: null,
      title: 'Project Tasks',
      description: 'Project root containing all task hierarchies',
      status: 'pending' as const,
      priority: 'medium' as const,
      prd: null,
      contextDigest: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Build tree data for all root tasks (if any exist)
    const children: TaskTreeData[] = [];
    if (rootTasks.length > 0) {
      const adjustedMaxDepth = maxDepth === undefined ? undefined : maxDepth - 1;

      for (const rootTask of rootTasks) {
        const childData = await this.buildTaskTreeData(rootTask.id, adjustedMaxDepth);
        if (childData) {
          children.push(childData);
        }
      }
    }

    return { task: projectRoot, children };
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
   * Get task with full tree context (ancestors + descendants) and dependency information
   */
  async getTaskWithContext(taskId: string): Promise<{
    task: Task;
    ancestors: Task[];
    descendants: TaskTree[];
    root: TaskTree | null;
    dependencies: Task[];
    dependents: Task[];
    isBlocked: boolean;
    blockedBy: Task[];
  } | null> {
    const task = await this.store.getTask(taskId);
    if (!task) return null;

    const [ancestors, descendants, dependencyGraph] = await Promise.all([
      this.getTaskAncestors(taskId),
      this.getTaskDescendants(taskId),
      this.dependencyService.getDependencyGraph(taskId),
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

    // Get dependency and dependent tasks
    const [dependencyTasks, dependentTasks, blockedByTasks] = await Promise.all([
      Promise.all(dependencyGraph.dependencies.map((id) => this.store.getTask(id))),
      Promise.all(dependencyGraph.dependents.map((id) => this.store.getTask(id))),
      Promise.all(dependencyGraph.blockedBy.map((id) => this.store.getTask(id))),
    ]);

    return {
      task,
      ancestors,
      descendants: descendantTrees.filter((tree): tree is TaskTree => tree !== null),
      root,
      dependencies: dependencyTasks.filter((t): t is Task => t !== null),
      dependents: dependentTasks.filter((t): t is Task => t !== null),
      isBlocked: dependencyGraph.isBlocked,
      blockedBy: blockedByTasks.filter((t): t is Task => t !== null),
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
   * Apply a reconciliation plan to the store
   * This is the unified way to persist changes from any source that generates a reconciliation plan
   */
  async applyReconciliationPlan(plan: ReconciliationPlan): Promise<TaskTree> {
    if (plan.operations.length === 0) {
      // No changes to apply, just return current tree
      const currentTree = await this.getTaskTree(plan.treeId);
      if (!currentTree) {
        throw new Error('Task tree not found');
      }
      return currentTree;
    }

    return this.executeReconciliationOperations(plan);
  }

  /**
   * Execute reconciliation operations with rollback support
   */
  private async executeReconciliationOperations(plan: ReconciliationPlan): Promise<TaskTree> {
    const updatedTaskIds = new Set<string>();
    const createdTaskIds: string[] = [];
    const rollbackActions: (() => Promise<void>)[] = [];

    try {
      // Process operations in order
      for (const operation of plan.operations) {
        switch (operation.type) {
          case 'task_update': {
            await this.handleTaskUpdate(operation, updatedTaskIds, rollbackActions);
            break;
          }

          case 'child_add': {
            await this.handleChildAdd(operation, createdTaskIds, rollbackActions);
            break;
          }

          case 'child_remove': {
            await this.handleChildRemove(operation, rollbackActions);
            break;
          }

          default: {
            const unknownOp = operation as { type: string };
            throw new Error(`Unknown operation type: ${unknownOp.type}`);
          }
        }
      }

      return this.finalizeReconciliation(plan.treeId, updatedTaskIds, createdTaskIds);
    } catch (error) {
      await this.rollbackOperations(rollbackActions);
      throw new Error(
        `Failed to apply reconciliation plan: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Finalize reconciliation by clearing cache and returning updated tree
   */
  private async finalizeReconciliation(
    treeId: string,
    updatedTaskIds: Set<string>,
    createdTaskIds: string[]
  ): Promise<TaskTree> {
    // Get the updated tree
    const finalTree = await this.getTaskTree(treeId);
    if (!finalTree) {
      throw new Error('Failed to retrieve updated tree after applying changes');
    }

    // Clear cache for affected tasks
    if (updatedTaskIds.size > 0 || createdTaskIds.length > 0) {
      this.clearCache();
    }

    return finalTree;
  }

  /**
   * Attempt to rollback operations (best effort)
   */
  private async rollbackOperations(rollbackActions: (() => Promise<void>)[]): Promise<void> {
    try {
      for (const rollback of rollbackActions.reverse()) {
        await rollback();
      }
      this.clearCache(); // Clear cache after rollback
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError);
    }
  }

  /**
   * Handle task update operations with proper validation
   */
  private async handleTaskUpdate(
    operation: { taskId?: string; updates?: Record<string, unknown> },
    updatedTaskIds: Set<string>,
    rollbackActions: (() => Promise<void>)[]
  ): Promise<void> {
    if (!operation.taskId) {
      throw new Error('task_update operation missing taskId');
    }

    const taskId = operation.taskId;
    const originalTask = await this.store.getTask(taskId);
    if (!originalTask) {
      throw new Error(`Task ${taskId} not found for update`);
    }

    const updatedTask = await this.store.updateTask(taskId, operation.updates as Partial<Task>);
    if (!updatedTask) {
      throw new Error(`Failed to update task ${taskId}`);
    }
    updatedTaskIds.add(taskId);

    // Add rollback action
    rollbackActions.push(async () => {
      await this.store.updateTask(taskId, {
        title: originalTask.title,
        description: originalTask.description,
        status: originalTask.status,
        priority: originalTask.priority,
        parentId: originalTask.parentId,
        prd: originalTask.prd,
        contextDigest: originalTask.contextDigest,
      });
    });
  }

  /**
   * Handle child add operations with proper validation
   */
  private async handleChildAdd(
    operation: { parentId?: string; childData?: unknown },
    createdTaskIds: string[],
    rollbackActions: (() => Promise<void>)[]
  ): Promise<void> {
    if (!operation.parentId) {
      throw new Error('child_add operation missing parentId');
    }
    if (!operation.childData) {
      throw new Error('child_add operation missing childData');
    }

    const childData = operation.childData as TaskTreeData;
    const createTask: CreateTask = {
      parentId: operation.parentId,
      title: childData.task.title,
      description: childData.task.description || undefined,
      status: childData.task.status,
      priority: childData.task.priority,
      prd: childData.task.prd || undefined,
      contextDigest: childData.task.contextDigest || undefined,
    };

    const createdTask = await this.store.addTask(createTask);
    createdTaskIds.push(createdTask.id);

    // Add rollback action
    rollbackActions.push(async () => {
      await this.store.deleteTask(createdTask.id);
    });

    // Recursively create children if they exist
    if (childData.children && childData.children.length > 0) {
      await this.createChildrenRecursively(childData.children, createdTask.id, rollbackActions);
    }
  }

  /**
   * Handle child remove operations with proper validation
   */
  private async handleChildRemove(
    operation: { childId?: string },
    rollbackActions: (() => Promise<void>)[]
  ): Promise<void> {
    if (!operation.childId) {
      throw new Error('child_remove operation missing childId');
    }

    // Delete the child and all its descendants
    await this.deleteTaskTree(operation.childId, true);

    // Add rollback action (this would be complex, for now just note it)
    rollbackActions.push(async () => {
      // Rollback would require recreating the entire subtree
      // This is complex and may not be worth implementing fully
      console.warn(`Rollback of child_remove for ${operation.childId} not fully implemented`);
    });
  }

  /**
   * Recursively create children tasks with proper parent relationships
   */
  private async createChildrenRecursively(
    childrenData: TaskTreeData[],
    parentId: string,
    rollbackActions?: (() => Promise<void>)[]
  ): Promise<void> {
    for (const childData of childrenData) {
      const createTask: CreateTask = {
        parentId,
        title: childData.task.title,
        description: childData.task.description || undefined,
        status: childData.task.status,
        priority: childData.task.priority,
        prd: childData.task.prd || undefined,
        contextDigest: childData.task.contextDigest || undefined,
      };

      const createdChild = await this.store.addTask(createTask);

      // Add rollback action if provided
      if (rollbackActions) {
        rollbackActions.push(async () => {
          await this.store.deleteTask(createdChild.id);
        });
      }

      // Recursively create grandchildren
      if (childData.children && childData.children.length > 0) {
        await this.createChildrenRecursively(childData.children, createdChild.id, rollbackActions);
      }
    }
  }

  /**
   * Bulk update status for an entire task tree using direct store updates
   */
  async updateTreeStatus(rootId: string, status: TaskStatus): Promise<number> {
    // Get all descendants to update
    const descendants = await this.getTaskDescendants(rootId);
    const allTaskIds = [rootId, ...descendants.map((d) => d.id)];

    // Update all tasks directly in the store
    let updatedCount = 0;
    for (const taskId of allTaskIds) {
      const updated = await this.store.updateTask(taskId, { status });
      if (updated) {
        updatedCount++;
      }
    }

    // Clear cache for affected tasks since we bypassed the tree operations
    if (updatedCount > 0) {
      this.clearCache();
    }

    return updatedCount;
  }

  /**
   * Update task status with dependency validation.
   * Prevents starting tasks that are blocked by incomplete dependencies.
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    options?: { force?: boolean }
  ): Promise<{ success: boolean; blocked?: Task[]; validation?: StatusTransitionResult }> {
    const task = await this.store.getTask(taskId);
    if (!task) {
      return { success: false };
    }

    // Get dependency information
    const dependencyGraph = await this.dependencyService.getDependencyGraph(taskId);

    // Validate the status transition
    const validation = validateStatusTransition(
      task.status,
      status,
      dependencyGraph.isBlocked,
      dependencyGraph.blockedBy
    );

    // If validation fails and force is not enabled, return the validation result
    if (!validation.allowed && !options?.force) {
      const blockedByTasks = validation.blockedBy
        ? await Promise.all(validation.blockedBy.map((id) => this.store.getTask(id)))
        : [];

      return {
        success: false,
        blocked: blockedByTasks.filter((t): t is Task => t !== null),
        validation,
      };
    }

    // Perform the status update
    const updatedTask = await this.store.updateTask(taskId, { status });
    const success = !!updatedTask;

    if (success) {
      // Clear cache for this task and its dependents (status change may unblock them)
      const dependents = await this.dependencyService.getDependents(taskId);
      this.cache.invalidateTreeFamily(taskId, [], dependents);
    }

    return { success, validation };
  }

  /**
   * Get tasks that can be started immediately (no incomplete dependencies).
   */
  async getAvailableTasks(filter?: { status?: TaskStatus; priority?: string }): Promise<Task[]> {
    const executableTasks = await this.dependencyService.getExecutableTasks();

    if (!filter) {
      return executableTasks;
    }

    return executableTasks.filter((task) => {
      if (filter.status && task.status !== filter.status) {
        return false;
      }
      if (filter.priority && task.priority !== filter.priority) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get tasks with their dependency information for enhanced context.
   */
  async getTasksWithDependencies(taskIds: string[]): Promise<TaskWithDependencies[]> {
    const tasks = await Promise.all(taskIds.map((id) => this.store.getTask(id)));
    const validTasks = tasks.filter((t): t is Task => t !== null);

    const tasksWithDeps = await Promise.all(
      validTasks.map(async (task) => {
        const dependencyGraph = await this.dependencyService.getDependencyGraph(task.id);
        return {
          ...task,
          dependencies: dependencyGraph.dependencies,
          dependents: dependencyGraph.dependents,
          isBlocked: dependencyGraph.isBlocked,
          blockedBy: dependencyGraph.blockedBy,
        };
      })
    );

    return tasksWithDeps;
  }

  /**
   * Add a dependency between two tasks with validation.
   */
  async addTaskDependency(dependentId: string, dependencyId: string) {
    return this.dependencyService.addDependency(dependentId, dependencyId);
  }

  /**
   * Remove a dependency between two tasks.
   */
  async removeTaskDependency(dependentId: string, dependencyId: string) {
    return this.dependencyService.removeDependency(dependentId, dependencyId);
  }

  /**
   * Validate if a dependency can be safely added.
   */
  async validateTaskDependency(dependentId: string, dependencyId: string) {
    return this.dependencyService.validateDependency(dependentId, dependencyId);
  }

  /**
   * Get dependency graph information for a task.
   */
  async getTaskDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    return this.dependencyService.getDependencyGraph(taskId);
  }

  /**
   * Get topological order for a set of tasks.
   */
  async getTopologicalOrder(taskIds: string[]): Promise<string[]> {
    return this.dependencyService.getTopologicalOrder(taskIds);
  }

  /**
   * Find cycles in the dependency graph.
   */
  async findDependencyCycles(): Promise<string[][]> {
    return this.dependencyService.findCycles();
  }

  /**
   * Get the next task to work on based on priority, dependencies, and creation order.
   * Returns the highest priority task that has no incomplete dependencies.
   */
  async getNextTask(): Promise<Task | null> {
    // Get all available tasks (no incomplete dependencies)
    const availableTasks = await this.getAvailableTasks({ status: 'pending' });

    if (availableTasks.length === 0) {
      return null;
    }

    // Sort by priority (high > medium > low), then by creation date (oldest first)
    const sortedTasks = availableTasks.sort((a, b) => {
      // Priority order: high = 0, medium = 1, low = 2
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const aPriority = priorityOrder[a.priority] ?? 1; // Default to medium if unknown
      const bPriority = priorityOrder[b.priority] ?? 1; // Default to medium if unknown

      if (aPriority !== bPriority) {
        return aPriority - bPriority; // Higher priority first
      }

      // Same priority, sort by creation date (oldest first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return sortedTasks[0] ?? null;
  }
}
