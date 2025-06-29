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
import { DependencyGraph, type IDependencyGraph } from '../entities/DependencyGraph.js';
import type {
  DependencyPendingOperation,
  DependencyReconciliationPlan,
} from '../entities/TrackingDependencyGraph.js';
import type { IDependencyReconciliationService } from '../entities/TrackingTypes.js';
import { DependencyOperationError, DependencyValidationError } from '../errors/service.js';
import type {
  CreateTaskDependency,
  DependencyValidationResult,
  TaskDependency,
  TaskDependencyGraph,
  TaskWithDependencies,
} from '../schemas/dependency.js';
import type { Task } from '../schemas/task.js';
import { validateDependency } from '../validation/dependency-validation.js';

/**
 * Service for managing task dependencies and dependency graphs
 *
 * Provides CRUD operations, validation, and batch reconciliation capabilities
 * for task dependency relationships.
 */
export class DependencyService implements IDependencyReconciliationService {
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
      throw new DependencyValidationError('Cannot add dependency', validation.errors, {
        dependentId,
        dependencyId,
      });
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
   * Get all task IDs that a specific task depends on.
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
      : await this.store.listTasks({ statuses: [] });

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
   * Delegates to centralized validation logic.
   *
   * @param dependentId - ID of the dependent task
   * @param dependencyId - ID of the dependency task
   * @returns Promise resolving to validation result
   */
  async validateDependency(
    dependentId: string,
    dependencyId: string
  ): Promise<DependencyValidationResult> {
    // Get existing dependencies for duplicate check
    const existingDependencies = await this.getDependencies(dependentId);

    // Create dependency graph for cycle detection
    const graph = await this.createDependencyGraph();

    // Use centralized validation
    return validateDependency(dependentId, dependencyId, {
      store: this.store,
      graph,
      existingDependencies,
    });
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
   *
   * @returns Promise resolving to array of tasks with dependency information
   */
  async getBlockedTasks(): Promise<TaskWithDependencies[]> {
    const graph = await this.createDependencyGraph();
    const blockedTaskIds = graph.getBlockedTasks();

    const tasks = await Promise.all(blockedTaskIds.map((id) => this.store.getTask(id)));
    const validTasks = tasks.filter((task): task is Task => task !== null);
    const blockedTasks = validTasks.map((task: Task) => {
      const dependencyGraph = graph.getTaskDependencyGraph(task.id);
      return {
        ...task,
        dependencies: dependencyGraph.dependencies,
        dependents: dependencyGraph.dependents,
        isBlocked: dependencyGraph.isBlocked,
        blockedBy: dependencyGraph.blockedBy,
      } as TaskWithDependencies;
    });

    return blockedTasks;
  }

  /**
   * Get comprehensive dependency graph information for a task.
   *
   * @param taskId - ID of the task to get graph information for
   * @returns Promise resolving to dependency graph information
   */
  async getDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    const graph = await this.createDependencyGraph();
    return graph.getTaskDependencyGraph(taskId);
  }

  /**
   * Get tasks that can be started immediately (no incomplete dependencies).
   *
   * @returns Promise resolving to array of executable tasks
   */
  async getExecutableTasks(): Promise<Task[]> {
    const graph = await this.createDependencyGraph();
    const executableTaskIds = graph.getExecutableTasks();

    const tasks = await Promise.all(executableTaskIds.map((id) => this.store.getTask(id)));
    return tasks.filter((task): task is Task => task !== null);
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
  async applyReconciliationPlan(plan: DependencyReconciliationPlan): Promise<IDependencyGraph> {
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
        throw new DependencyOperationError(
          `Unknown dependency operation type: ${(operation as { type: string }).type}`,
          'applyDependencyOperation'
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
      throw new DependencyOperationError(
        `Failed to add dependency ${operation.dependentTaskId} -> ${operation.dependencyTaskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'applyAddDependencyOperation',
        { dependentTaskId: operation.dependentTaskId, dependencyTaskId: operation.dependencyTaskId }
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
      throw new DependencyOperationError(
        `Failed to remove dependency ${operation.dependentTaskId} -> ${operation.dependencyTaskId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'applyRemoveDependencyOperation',
        { dependentTaskId: operation.dependentTaskId, dependencyTaskId: operation.dependencyTaskId }
      );
    }
  }
}
