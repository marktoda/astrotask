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
import { eq, and, inArray } from 'drizzle-orm';
import type { Store } from '../database/store.js';
import { taskDependencies } from '../database/schema.js';
import type { 
  TaskDependency, 
  CreateTaskDependency, 
  TaskDependencyGraph,
  DependencyValidationResult,
  TaskWithDependencies 
} from '../schemas/dependency.js';
import type { Task } from '../schemas/task.js';

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
  // Validation and Analysis
  // ---------------------------------------------------------------------------

  /**
   * Validate whether a dependency can be safely added.
   * Checks for self-dependencies, duplicates, task existence, and cycles.
   * 
   * @param dependentId - ID of the dependent task
   * @param dependencyId - ID of the dependency task
   * @returns Promise resolving to validation result
   */
  async validateDependency(dependentId: string, dependencyId: string): Promise<DependencyValidationResult> {
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

    // Check for duplicate dependency
    if (dependentTask && dependencyTask) {
      const existingDependencies = await this.getDependencies(dependentId);
      if (existingDependencies.includes(dependencyId)) {
        errors.push('Dependency already exists');
      }
    }

    // Check for cycles (only if basic validation passes)
    let cycles: string[][] = [];
    if (errors.length === 0) {
      cycles = await this.findCyclesIfAdded(dependentId, dependencyId);
      if (cycles.length > 0 && cycles[0]) {
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
    // Get all dependencies
    const allDependencies = await this.store.sql
      .select()
      .from(taskDependencies);

    // Build adjacency list
    const graph = new Map<string, string[]>();
    for (const dep of allDependencies) {
      if (!graph.has(dep.dependentTaskId)) {
        graph.set(dep.dependentTaskId, []);
      }
      graph.get(dep.dependentTaskId)!.push(dep.dependencyTaskId);
    }

    // Use DFS to detect cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }
      }

      recursionStack.delete(node);
    };

    const nodesToCheck = taskIds || Array.from(graph.keys());
    for (const node of nodesToCheck) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Check if adding a dependency would create a cycle.
   * 
   * @param dependentId - ID of the dependent task
   * @param dependencyId - ID of the dependency task
   * @returns Promise resolving to array of cycles that would be created
   */
  private async findCyclesIfAdded(dependentId: string, dependencyId: string): Promise<string[][]> {
    // Temporarily add the dependency to check for cycles
    const allDependencies = await this.store.sql
      .select()
      .from(taskDependencies);

    // Add the proposed dependency
    const testDependencies = [
      ...allDependencies,
      { dependentTaskId: dependentId, dependencyTaskId: dependencyId }
    ];

    // Build adjacency list with the test dependency
    const graph = new Map<string, string[]>();
    for (const dep of testDependencies) {
      if (!graph.has(dep.dependentTaskId)) {
        graph.set(dep.dependentTaskId, []);
      }
      graph.get(dep.dependentTaskId)!.push(dep.dependencyTaskId);
    }

    // Check for cycles starting from the dependent task
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), neighbor]);
          }
        }
      }

      recursionStack.delete(node);
    };

    if (!visited.has(dependentId)) {
      dfs(dependentId, []);
    }

    return cycles;
  }

  /**
   * Get tasks that are currently blocked by incomplete dependencies.
   * 
   * @returns Promise resolving to array of tasks with dependency information
   */
  async getBlockedTasks(): Promise<TaskWithDependencies[]> {
    // Get all tasks and their dependencies
    const allTasks = await this.store.listTasks();
    const blockedTasks: TaskWithDependencies[] = [];

    for (const task of allTasks) {
      const dependencyGraph = await this.getDependencyGraph(task.id);
      if (dependencyGraph.isBlocked) {
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

  // ---------------------------------------------------------------------------
  // Graph Operations
  // ---------------------------------------------------------------------------

  /**
   * Get comprehensive dependency graph information for a task.
   * 
   * @param taskId - ID of the task to get graph information for
   * @returns Promise resolving to dependency graph information
   */
  async getDependencyGraph(taskId: string): Promise<TaskDependencyGraph> {
    const [dependencies, dependents] = await Promise.all([
      this.getDependencies(taskId),
      this.getDependents(taskId),
    ]);

    // Check if task is blocked by getting status of dependencies
    const blockedBy: string[] = [];
    if (dependencies.length > 0) {
      const dependencyTasks = await Promise.all(
        dependencies.map(id => this.store.getTask(id))
      );

      for (let i = 0; i < dependencyTasks.length; i++) {
        const depTask = dependencyTasks[i];
        const dependencyId = dependencies[i];
        if (depTask && depTask.status !== 'done' && dependencyId) {
          blockedBy.push(dependencyId);
        }
      }
    }

    return {
      taskId,
      dependencies,
      dependents,
      isBlocked: blockedBy.length > 0,
      blockedBy,
    };
  }

  /**
   * Get tasks that can be started immediately (no incomplete dependencies).
   * 
   * @returns Promise resolving to array of executable tasks
   */
  async getExecutableTasks(): Promise<Task[]> {
    const allTasks = await this.store.listTasks();
    const executableTasks: Task[] = [];

    for (const task of allTasks) {
      // Skip tasks that are already done or in progress
      if (task.status === 'done' || task.status === 'in-progress') {
        continue;
      }

      const dependencyGraph = await this.getDependencyGraph(task.id);
      if (!dependencyGraph.isBlocked) {
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
    // Get dependencies for the specified tasks
    const dependencies = await this.store.sql
      .select()
      .from(taskDependencies)
      .where(
        and(
          inArray(taskDependencies.dependentTaskId, taskIds),
          inArray(taskDependencies.dependencyTaskId, taskIds)
        )
      );

    // Build adjacency list and in-degree count
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize all tasks
    for (const taskId of taskIds) {
      graph.set(taskId, []);
      inDegree.set(taskId, 0);
    }

    // Build graph
    for (const dep of dependencies) {
      graph.get(dep.dependencyTaskId)!.push(dep.dependentTaskId);
      inDegree.set(dep.dependentTaskId, (inDegree.get(dep.dependentTaskId) || 0) + 1);
    }

    // Kahn's algorithm for topological sorting
    const queue: string[] = [];
    const result: string[] = [];

    // Start with tasks that have no dependencies
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      // Process all dependents
      for (const dependent of graph.get(current) || []) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);
        
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    return result;
  }
} 