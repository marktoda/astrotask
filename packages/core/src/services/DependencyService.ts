/**
 * @fileoverview DependencyService for managing task dependencies
 *
 * This service provides operations for managing task dependency relationships,
 * including CRUD operations, validation, and graph analysis. It implements
 * the core dependency management functionality for Astrolabe's task system.
 *
 * @module services/DependencyService
 * @since 1.0.0
 */

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { taskDependencies } from '../database/schema.js';
import type { Store } from '../database/store.js';
import type {
  CreateTaskDependency,
  DependencyValidationResult,
  TaskDependency,
  TaskDependencyGraph,
  TaskWithDependencies,
} from '../schemas/dependency.js';
import type { Task } from '../schemas/task.js';
import { DependencyGraph } from '../utils/DependencyGraph.js';
import type {
  DependencyPendingOperation,
  DependencyReconciliationPlan,
} from '../utils/TrackingDependencyGraph.js';

/**
 * Service for managing task dependency relationships.
 * Provides CRUD operations, validation, and graph analysis for task dependencies.
 */
export class DependencyService {
  constructor(private store: Store) {}

  // ---------------------------------------------------------------------------
  // Core CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * Add a new dependency relationship between two tasks.
   *
   * @param dependentId - ID of the task that depends on another
   * @param dependencyId - ID of the task that must be completed first
   * @returns Promise resolving to the created dependency
   * @throws Error if validation fails or dependency already exists
   */
  async addDependency(dependentId: string, dependencyId: string): Promise<TaskDependency> {
    // Validate the dependency before adding
    const validation = await this.validateDependency(dependentId, dependencyId);
    if (!validation.valid) {
      throw new Error(`Cannot add dependency: ${validation.errors.join(', ')}`);
    }

    const dependency: CreateTaskDependency = {
      dependentTaskId: dependentId,
      dependencyTaskId: dependencyId,
    };

    const id = randomUUID();
    const now = new Date();

    await this.store.sql.insert(taskDependencies).values({
      id,
      ...dependency,
      createdAt: now,
    });

    return {
      id,
      ...dependency,
      createdAt: now,
    };
  }

  /**
   * Remove a dependency relationship between two tasks.
   *
   * @param dependentId - ID of the dependent task
   * @param dependencyId - ID of the dependency task
   * @returns Promise resolving to true if dependency was removed, false if not found
   */
  async removeDependency(dependentId: string, dependencyId: string): Promise<boolean> {
    const result = await this.store.sql
      .delete(taskDependencies)
      .where(
        and(
          eq(taskDependencies.dependentTaskId, dependentId),
          eq(taskDependencies.dependencyTaskId, dependencyId)
        )
      )
      .returning();

    return result.length > 0;
  }

  /**
   * Get all task IDs that a specific task depends on (direct dependencies only).
   *
   * @param taskId - ID of the task to get dependencies for
   * @returns Promise resolving to array of dependency task IDs
   */
  async getDependencies(taskId: string): Promise<string[]> {
    const dependencies = await this.store.sql
      .select({ dependencyTaskId: taskDependencies.dependencyTaskId })
      .from(taskDependencies)
      .where(eq(taskDependencies.dependentTaskId, taskId));

    return dependencies.map((d: { dependencyTaskId: string }) => d.dependencyTaskId);
  }

  /**
   * Get all task IDs that a specific task effectively depends on, including inherited dependencies.
   * This includes direct dependencies and all dependencies inherited from parent tasks.
   *
   * @param taskId - ID of the task to get effective dependencies for
   * @returns Promise resolving to array of effective dependency task IDs
   */
  async getEffectiveDependencies(taskId: string): Promise<string[]> {
    const visited = new Set<string>();
    const effectiveDependencies = new Set<string>();

    const collectDependencies = async (currentTaskId: string): Promise<void> => {
      if (visited.has(currentTaskId)) return;
      visited.add(currentTaskId);

      // Get direct dependencies for this task
      const directDependencies = await this.getDependencies(currentTaskId);
      for (const depId of directDependencies) {
        effectiveDependencies.add(depId);
      }

      // Get parent task and inherit its dependencies
      const task = await this.store.getTask(currentTaskId);
      if (task?.parentId) {
        await collectDependencies(task.parentId);
      }
    };

    await collectDependencies(taskId);
    return Array.from(effectiveDependencies);
  }

  /**
   * Get all task IDs that depend on a specific task.
   *
   * @param taskId - ID of the task to get dependents for
   * @returns Promise resolving to array of dependent task IDs
   */
  async getDependents(taskId: string): Promise<string[]> {
    const dependents = await this.store.sql
      .select({ dependentTaskId: taskDependencies.dependentTaskId })
      .from(taskDependencies)
      .where(eq(taskDependencies.dependencyTaskId, taskId));

    return dependents.map((d: { dependentTaskId: string }) => d.dependentTaskId);
  }

  // ---------------------------------------------------------------------------
  // Graph Operations (using DependencyGraph utility)
  // ---------------------------------------------------------------------------

  /**
   * Create a DependencyGraph instance from current database state.
   * This provides access to advanced graph analysis operations.
   *
   * @param taskIds - Optional array of task IDs to include (defaults to all tasks)
   * @returns Promise resolving to DependencyGraph instance
   */
  async createDependencyGraph(taskIds?: string[]): Promise<DependencyGraph> {
    // Get all dependencies
    const allDependencies = taskIds
      ? await this.store.sql
          .select()
          .from(taskDependencies)
          .where(
            and(
              inArray(taskDependencies.dependentTaskId, taskIds),
              inArray(taskDependencies.dependencyTaskId, taskIds)
            )
          )
      : await this.store.sql.select().from(taskDependencies);

    // Get task data for status checking
    const tasks = taskIds
      ? await Promise.all(taskIds.map((id) => this.store.getTask(id)))
      : await this.store.listTasks();

    const validTasks = tasks.filter((t): t is Task => t !== null);
    const taskData = validTasks.map((task) => ({
      id: task.id,
      status: task.status,
    }));

    return DependencyGraph.fromDependencies(allDependencies, taskData);
  }

  // ---------------------------------------------------------------------------
  // Validation and Analysis (delegated to DependencyGraph)
  // ---------------------------------------------------------------------------

  /**
   * Validate whether a dependency can be safely added.
   * Checks for self-dependencies, duplicates, task existence, cycles, and hierarchy constraints.
   * Dependencies are only allowed between sibling tasks (same parent).
   *
   * @param dependentId - ID of the dependent task
   * @param dependencyId - ID of the dependency task
   * @returns Promise resolving to validation result
   */
  async validateDependency(
    dependentId: string,
    dependencyId: string
  ): Promise<DependencyValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for self-dependency
    if (dependentId === dependencyId) {
      errors.push('A task cannot depend on itself');
    }

    // Check if both tasks exist
    const [dependentTask, dependencyTask] = await Promise.all([
      this.store.getTask(dependentId),
      this.store.getTask(dependencyId),
    ]);

    if (!dependentTask) {
      errors.push(`Dependent task ${dependentId} does not exist`);
    }
    if (!dependencyTask) {
      errors.push(`Dependency task ${dependencyId} does not exist`);
    }

    // Check sibling constraint: tasks must have the same parent
    if (dependentTask && dependencyTask) {
      if (dependentTask.parentId !== dependencyTask.parentId) {
        errors.push(
          'Dependencies can only be created between sibling tasks (tasks with the same parent)'
        );
      }

      // Check for duplicate dependency
      const existingDependencies = await this.getDependencies(dependentId);
      if (existingDependencies.includes(dependencyId)) {
        errors.push('Dependency already exists');
      }
    }

    // Check for cycles using DependencyGraph (only if basic validation passes)
    let cycles: string[][] = [];
    if (errors.length === 0) {
      const graph = await this.createDependencyGraph();
      const cycleResult = graph.wouldCreateCycle(dependentId, dependencyId);
      cycles = cycleResult.cycles;

      if (cycleResult.hasCycles && cycles[0]) {
        errors.push(`Adding this dependency would create a cycle: ${cycles[0].join(' -> ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      cycles,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Find cycles in the dependency graph.
   *
   * @param taskIds - Optional array of task IDs to check (defaults to all tasks)
   * @returns Promise resolving to array of cycles (each cycle is an array of task IDs)
   */
  async findCycles(taskIds?: string[]): Promise<string[][]> {
    const graph = await this.createDependencyGraph(taskIds);
    const result = graph.findCycles();
    return result.cycles;
  }

  /**
   * Get tasks that are currently blocked by incomplete dependencies.
   * Uses the original graph-based approach for direct dependencies only.
   *
   * @returns Promise resolving to array of tasks with dependency information
   */
  async getBlockedTasks(): Promise<TaskWithDependencies[]> {
    const graph = await this.createDependencyGraph();
    const blockedTaskIds = graph.getBlockedTasks();

    const blockedTasks: TaskWithDependencies[] = [];
    for (const taskId of blockedTaskIds) {
      const task = await this.store.getTask(taskId);
      if (task) {
        const dependencyGraph = graph.getTaskDependencyGraph(taskId);
        blockedTasks.push({
          ...task,
          dependencies: dependencyGraph.dependencies,
          dependents: dependencyGraph.dependents,
          isBlocked: dependencyGraph.isBlocked,
          blockedBy: dependencyGraph.blockedBy,
        });
      }
    }

    return blockedTasks;
  }

  /**
   * Get tasks that are currently blocked considering hierarchical dependency inheritance.
   * This method considers both direct dependencies and inherited dependencies from parent tasks.
   *
   * @returns Promise resolving to array of tasks with hierarchical dependency information
   */
  async getHierarchicallyBlockedTasks(): Promise<TaskWithDependencies[]> {
    const allTasks = await this.store.listTasks();
    const blockedTasks: TaskWithDependencies[] = [];

    for (const task of allTasks) {
      const effectiveDependencies = await this.getEffectiveDependencies(task.id);
      const blockedBy: string[] = [];

      // Check which effective dependencies are incomplete
      for (const depId of effectiveDependencies) {
        const depTask = await this.store.getTask(depId);
        if (!depTask || depTask.status !== 'done') {
          blockedBy.push(depId);
        }
      }

      if (blockedBy.length > 0) {
        const dependents = await this.getDependents(task.id);

        blockedTasks.push({
          ...task,
          dependencies: effectiveDependencies,
          dependents,
          isBlocked: true,
          blockedBy,
        });
      }
    }

    return blockedTasks;
  }

  /**
   * Get comprehensive dependency graph information for a task.
   * Uses the original graph-based approach for direct dependencies only.
   *
   * @param taskId - ID of the task to get graph information for
   * @returns Promise resolving to dependency graph information
   */
  async getDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    const graph = await this.createDependencyGraph();
    return graph.getTaskDependencyGraph(taskId);
  }

  /**
   * Get comprehensive dependency graph information for a task considering hierarchical inheritance.
   * This includes both direct dependencies and inherited dependencies from parent tasks.
   *
   * @param taskId - ID of the task to get hierarchical graph information for
   * @returns Promise resolving to hierarchical dependency graph information
   */
  async getHierarchicalDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    const effectiveDependencies = await this.getEffectiveDependencies(taskId);
    const dependents = await this.getDependents(taskId);
    const blockedBy: string[] = [];

    // Check which effective dependencies are incomplete
    for (const depId of effectiveDependencies) {
      const depTask = await this.store.getTask(depId);
      if (!depTask || depTask.status !== 'done') {
        blockedBy.push(depId);
      }
    }

    return {
      taskId,
      dependencies: effectiveDependencies,
      dependents,
      isBlocked: blockedBy.length > 0,
      blockedBy,
    };
  }

  /**
   * Get tasks that can be started immediately (no incomplete dependencies).
   * Uses the original graph-based approach for direct dependencies only.
   *
   * @returns Promise resolving to array of executable tasks
   */
  async getExecutableTasks(): Promise<Task[]> {
    const graph = await this.createDependencyGraph();
    const executableTaskIds = graph.getExecutableTasks();

    const executableTasks: Task[] = [];
    for (const taskId of executableTaskIds) {
      const task = await this.store.getTask(taskId);
      if (task) {
        executableTasks.push(task);
      }
    }

    return executableTasks;
  }

  /**
   * Get tasks that can be started immediately considering hierarchical dependency inheritance.
   * This method considers both direct dependencies and inherited dependencies from parent tasks.
   *
   * @returns Promise resolving to array of hierarchically executable tasks
   */
  async getHierarchicallyExecutableTasks(): Promise<Task[]> {
    const allTasks = await this.store.listTasks();
    const executableTasks: Task[] = [];

    for (const task of allTasks) {
      // Skip tasks that are already done or in progress
      if (task.status === 'done' || task.status === 'in-progress') {
        continue;
      }

      const effectiveDependencies = await this.getEffectiveDependencies(task.id);
      let isBlocked = false;

      // Check if any effective dependencies are incomplete
      for (const depId of effectiveDependencies) {
        const depTask = await this.store.getTask(depId);
        if (!depTask || depTask.status !== 'done') {
          isBlocked = true;
          break;
        }
      }

      if (!isBlocked) {
        executableTasks.push(task);
      }
    }

    return executableTasks;
  }

  /**
   * Get topological order of tasks based on dependencies.
   *
   * @param taskIds - Array of task IDs to order
   * @returns Promise resolving to array of task IDs in topological order
   */
  async getTopologicalOrder(taskIds: string[]): Promise<string[]> {
    const graph = await this.createDependencyGraph(taskIds);
    return graph.getTopologicalOrderForTasks(taskIds);
  }

  // ---------------------------------------------------------------------------
  // Reconciliation Plan Operations
  // ---------------------------------------------------------------------------

  /**
   * Apply a dependency reconciliation plan to the database.
   * This method processes all dependency operations in the plan and applies them atomically.
   *
   * @param plan - The reconciliation plan containing dependency operations
   * @returns Promise resolving to updated DependencyGraph reflecting the changes
   * @throws Error if any operation in the plan fails
   */
  async applyReconciliationPlan(plan: DependencyReconciliationPlan): Promise<DependencyGraph> {
    // If no operations, just return current graph
    if (plan.operations.length === 0) {
      return this.createDependencyGraph();
    }

    // Process operations in order
    for (const operation of plan.operations) {
      await this.applyDependencyOperation(operation);
    }

    // Return updated dependency graph
    return this.createDependencyGraph();
  }

  /**
   * Apply a single dependency operation.
   *
   * @param operation - The dependency operation to apply
   * @throws Error if the operation fails
   */
  private async applyDependencyOperation(operation: DependencyPendingOperation): Promise<void> {
    switch (operation.type) {
      case 'dependency_add':
        await this.applyAddDependencyOperation(operation);
        break;

      case 'dependency_remove':
        await this.applyRemoveDependencyOperation(operation);
        break;

      default:
        // TypeScript should ensure this never happens, but just in case
        throw new Error(
          `Unknown dependency operation type: ${(operation as { type: string }).type}`
        );
    }
  }

  /**
   * Apply an add dependency operation.
   *
   * @param operation - The add dependency operation
   * @throws Error if the operation fails
   */
  private async applyAddDependencyOperation(
    operation: DependencyPendingOperation & { type: 'dependency_add' }
  ): Promise<void> {
    try {
      await this.addDependency(operation.dependentTaskId, operation.dependencyTaskId);
    } catch (error) {
      // If dependency already exists, that's okay - just log and continue
      if (error instanceof Error && error.message.includes('already exists')) {
        // Dependency already exists, skip
        return;
      }
      throw new Error(
        `Failed to add dependency ${operation.dependentTaskId} -> ${operation.dependencyTaskId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Apply a remove dependency operation.
   *
   * @param operation - The remove dependency operation
   * @throws Error if the operation fails
   */
  private async applyRemoveDependencyOperation(
    operation: DependencyPendingOperation & { type: 'dependency_remove' }
  ): Promise<void> {
    try {
      await this.removeDependency(operation.dependentTaskId, operation.dependencyTaskId);
    } catch (error) {
      throw new Error(
        `Failed to remove dependency ${operation.dependentTaskId} -> ${operation.dependencyTaskId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
