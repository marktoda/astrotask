/**
 * @fileoverview DependencyGraph utility for in-memory dependency analysis
 *
 * This utility provides an immutable, ergonomic interface for analyzing task
 * dependency relationships. It works as an in-memory representation similar
 * to how TaskTree works with TaskService, allowing complex graph operations
 * without repeated database queries.
 *
 * @module utils/DependencyGraph
 * @since 1.0.0
 */

import { z } from 'zod';
import type { TaskDependency, TaskDependencyGraph } from '../schemas/dependency.js';

/**
 * Common interface for all DependencyGraph implementations
 * This ensures both immutable (DependencyGraph) and mutable (TrackingDependencyGraph) versions
 * maintain the same public API
 */
export interface IDependencyGraph {
  // Basic Graph Queries
  getDependencies(taskId: string): string[];
  getDependents(taskId: string): string[];
  getTaskDependencyGraph(taskId: string): TaskDependencyGraph;
  getAllTaskDependencyGraphs(): Map<string, TaskDependencyGraph>;
  getAllTaskIds(): string[];
  hasTask(taskId: string): boolean;
  getBlockedTasks(): string[];
  getExecutableTasks(): string[];

  // Cycle Detection
  findCycles(): CycleDetectionResult;
  wouldCreateCycle(dependentId: string, dependencyId: string): CycleDetectionResult;

  // Topological Sorting
  getTopologicalOrder(): string[];
  getTopologicalOrderForTasks(taskIds: string[]): string[];

  // Graph Traversal
  walkDepthFirst(startTaskId: string, visitor: (taskId: string, depth: number) => void): void;
  walkBreadthFirst(startTaskId: string, visitor: (taskId: string, depth: number) => void): void;
  findShortestPath(fromTaskId: string, toTaskId: string): string[] | null;

  // Graph Metrics and Analysis
  getMetrics(): DependencyGraphMetrics;
  calculateTaskDepth(taskId: string): number;

  // Transformation Methods
  withDependency(dependentId: string, dependencyId: string): IDependencyGraph;
  withoutDependency(dependentId: string, dependencyId: string): IDependencyGraph;

  // Serialization
  toPlainObject(): DependencyGraphData;
}

/**
 * Schema for dependency graph data structure
 */
export const dependencyGraphDataSchema = z.object({
  /** All dependency relationships in the graph */
  dependencies: z.array(
    z.object({
      dependentTaskId: z.string(),
      dependencyTaskId: z.string(),
    })
  ),
  /** All tasks in the graph (for status checking) */
  tasks: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(['pending', 'in-progress', 'done', 'cancelled', 'archived']),
      })
    )
    .optional(),
});

export type DependencyGraphData = z.infer<typeof dependencyGraphDataSchema>;

/**
 * Schema for task data used in dependency analysis
 */
export const taskDataSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'in-progress', 'done', 'cancelled', 'archived']),
});

export type TaskData = z.infer<typeof taskDataSchema>;

/**
 * Represents a node in the dependency graph with its relationships
 */
export interface DependencyNode {
  /** Task ID */
  taskId: string;
  /** Tasks this node depends on (prerequisites) */
  dependencies: string[];
  /** Tasks that depend on this node */
  dependents: string[];
  /** Whether this task is blocked by incomplete dependencies */
  isBlocked: boolean;
  /** Specific dependencies that are blocking this task */
  blockedBy: string[];
}

/**
 * Result of cycle detection in the dependency graph
 */
export interface CycleDetectionResult {
  /** Whether any cycles were found */
  hasCycles: boolean;
  /** Array of detected cycles (each cycle is an array of task IDs) */
  cycles: string[][];
}

/**
 * Metrics about the dependency graph structure
 */
export interface DependencyGraphMetrics {
  /** Total number of tasks in the graph */
  totalTasks: number;
  /** Total number of dependency relationships */
  totalDependencies: number;
  /** Number of tasks with no dependencies (can start immediately) */
  rootTasks: number;
  /** Number of tasks with no dependents (leaf tasks) */
  leafTasks: number;
  /** Maximum dependency depth in the graph */
  maxDepth: number;
  /** Average number of dependencies per task */
  averageDependencies: number;
  /** Whether the graph contains cycles */
  hasCycles: boolean;
  /** Number of strongly connected components */
  stronglyConnectedComponents: number;
}

/**
 * Immutable DependencyGraph class providing ergonomic graph operations
 *
 * Key principles:
 * - Immutable API: All operations return new instances or computed results
 * - Type-safe: Full TypeScript coverage with Zod validation
 * - Performance: Efficient graph algorithms and caching
 * - Separation of concerns: Pure graph logic separate from database operations
 */
export class DependencyGraph implements IDependencyGraph {
  private readonly _dependencies: Map<string, string[]>; // dependentId -> [dependencyIds]
  private readonly _dependents: Map<string, string[]>; // dependencyId -> [dependentIds]
  private readonly _tasks: Map<string, TaskData>;
  private readonly _adjacencyList: Map<string, string[]>; // for graph traversal

  constructor(data: DependencyGraphData) {
    // Validate input data
    dependencyGraphDataSchema.parse(data);

    this._dependencies = new Map();
    this._dependents = new Map();
    this._tasks = new Map();
    this._adjacencyList = new Map();

    // Build task map
    if (data.tasks) {
      for (const task of data.tasks) {
        this._tasks.set(task.id, task);
      }
    }

    // Build dependency maps
    for (const dep of data.dependencies) {
      // Dependencies map: dependent -> [dependencies]
      if (!this._dependencies.has(dep.dependentTaskId)) {
        this._dependencies.set(dep.dependentTaskId, []);
      }
      const dependentList = this._dependencies.get(dep.dependentTaskId);
      if (dependentList) {
        dependentList.push(dep.dependencyTaskId);
      }

      // Dependents map: dependency -> [dependents]
      if (!this._dependents.has(dep.dependencyTaskId)) {
        this._dependents.set(dep.dependencyTaskId, []);
      }
      const dependentsList = this._dependents.get(dep.dependencyTaskId);
      if (dependentsList) {
        dependentsList.push(dep.dependentTaskId);
      }

      // Adjacency list for graph traversal (dependency -> dependent)
      if (!this._adjacencyList.has(dep.dependencyTaskId)) {
        this._adjacencyList.set(dep.dependencyTaskId, []);
      }
      const adjacencyList = this._adjacencyList.get(dep.dependencyTaskId);
      if (adjacencyList) {
        adjacencyList.push(dep.dependentTaskId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Basic Graph Queries
  // ---------------------------------------------------------------------------

  /**
   * Get all task IDs that a specific task depends on
   */
  getDependencies(taskId: string): string[] {
    return [...(this._dependencies.get(taskId) || [])];
  }

  /**
   * Get all task IDs that depend on a specific task
   */
  getDependents(taskId: string): string[] {
    return [...(this._dependents.get(taskId) || [])];
  }

  /**
   * Get comprehensive dependency information for a task
   */
  getTaskDependencyGraph(taskId: string): TaskDependencyGraph {
    const dependencies = this.getDependencies(taskId);
    const dependents = this.getDependents(taskId);
    const blockedBy = this.getBlockingDependencies(taskId);

    return {
      taskId,
      dependencies,
      dependents,
      isBlocked: blockedBy.length > 0,
      blockedBy,
    };
  }

  /**
   * Get dependency information for all tasks in the graph
   */
  getAllTaskDependencyGraphs(): Map<string, TaskDependencyGraph> {
    const result = new Map<string, TaskDependencyGraph>();
    const allTaskIds = this.getAllTaskIds();

    for (const taskId of allTaskIds) {
      result.set(taskId, this.getTaskDependencyGraph(taskId));
    }

    return result;
  }

  /**
   * Get all unique task IDs in the graph
   */
  getAllTaskIds(): string[] {
    const taskIds = new Set<string>();

    // Add all tasks from the tasks array first (includes standalone tasks)
    for (const task of this._tasks.values()) {
      taskIds.add(task.id);
    }

    // Add all tasks from dependencies
    for (const [dependent, dependencies] of this._dependencies) {
      taskIds.add(dependent);
      for (const dep of dependencies) {
        taskIds.add(dep);
      }
    }

    // Add any tasks that only appear as dependencies
    for (const dependency of this._dependents.keys()) {
      taskIds.add(dependency);
    }

    return Array.from(taskIds);
  }

  /**
   * Check if a task exists in the graph
   */
  hasTask(taskId: string): boolean {
    return (
      this._dependencies.has(taskId) || this._dependents.has(taskId) || this._tasks.has(taskId)
    );
  }

  /**
   * Get tasks that are currently blocked by incomplete dependencies
   */
  getBlockedTasks(): string[] {
    const blockedTasks: string[] = [];
    const allTaskIds = this.getAllTaskIds();

    for (const taskId of allTaskIds) {
      const blockedBy = this.getBlockingDependencies(taskId);
      if (blockedBy.length > 0) {
        blockedTasks.push(taskId);
      }
    }

    return blockedTasks;
  }

  /**
   * Get tasks that can be started immediately (no incomplete dependencies)
   */
  getExecutableTasks(): string[] {
    const executableTasks: string[] = [];
    const allTaskIds = this.getAllTaskIds();

    for (const taskId of allTaskIds) {
      const task = this._tasks.get(taskId);

      // Skip tasks that are already done or in progress
      if (task && (task.status === 'done' || task.status === 'in-progress')) {
        continue;
      }

      const blockedBy = this.getBlockingDependencies(taskId);
      if (blockedBy.length === 0) {
        executableTasks.push(taskId);
      }
    }

    return executableTasks;
  }

  /**
   * Get specific dependencies that are blocking a task
   */
  private getBlockingDependencies(taskId: string): string[] {
    const dependencies = this.getDependencies(taskId);
    const blockedBy: string[] = [];

    for (const depId of dependencies) {
      const depTask = this._tasks.get(depId);
      if (!depTask || depTask.status !== 'done') {
        blockedBy.push(depId);
      }
    }

    return blockedBy;
  }

  // ---------------------------------------------------------------------------
  // Cycle Detection
  // ---------------------------------------------------------------------------

  /**
   * Find all cycles in the dependency graph
   */
  findCycles(): CycleDetectionResult {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this._adjacencyList.get(node) || [];
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

    const allTaskIds = this.getAllTaskIds();
    for (const taskId of allTaskIds) {
      if (!visited.has(taskId)) {
        dfs(taskId, []);
      }
    }

    return {
      hasCycles: cycles.length > 0,
      cycles,
    };
  }

  /**
   * Check if adding a dependency would create a cycle
   */
  wouldCreateCycle(dependentId: string, dependencyId: string): CycleDetectionResult {
    // Create a temporary graph with the new dependency
    const tempDependencies = [...this._getAllDependencyPairs()];
    tempDependencies.push({ dependentTaskId: dependentId, dependencyTaskId: dependencyId });

    const tempGraph = new DependencyGraph({
      dependencies: tempDependencies,
      tasks: Array.from(this._tasks.values()),
    });

    return tempGraph.findCycles();
  }

  /**
   * Get all dependency pairs in the graph
   */
  private _getAllDependencyPairs(): Array<{ dependentTaskId: string; dependencyTaskId: string }> {
    const pairs: Array<{ dependentTaskId: string; dependencyTaskId: string }> = [];

    for (const [dependentId, dependencies] of this._dependencies) {
      for (const dependencyId of dependencies) {
        pairs.push({ dependentTaskId: dependentId, dependencyTaskId: dependencyId });
      }
    }

    return pairs;
  }

  // ---------------------------------------------------------------------------
  // Topological Sorting
  // ---------------------------------------------------------------------------

  /**
   * Get topological order of all tasks based on dependencies
   */
  getTopologicalOrder(): string[] {
    const allTaskIds = this.getAllTaskIds();
    return this.getTopologicalOrderForTasks(allTaskIds);
  }

  /**
   * Get topological order for a specific set of tasks
   */
  getTopologicalOrderForTasks(taskIds: string[]): string[] {
    const { graph, inDegree } = this.buildTopologicalGraph(taskIds);
    return this.performTopologicalSort(graph, inDegree);
  }

  /**
   * Build adjacency list and in-degree count for topological sorting
   */
  private buildTopologicalGraph(taskIds: string[]): {
    graph: Map<string, string[]>;
    inDegree: Map<string, number>;
  } {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const taskIdSet = new Set(taskIds);

    // Initialize all tasks
    for (const taskId of taskIds) {
      graph.set(taskId, []);
      inDegree.set(taskId, 0);
    }

    // Build graph with only dependencies between the specified tasks
    for (const [dependentId, dependencies] of this._dependencies) {
      if (!taskIdSet.has(dependentId)) continue;

      for (const dependencyId of dependencies) {
        if (!taskIdSet.has(dependencyId)) continue;

        graph.get(dependencyId)?.push(dependentId);
        inDegree.set(dependentId, (inDegree.get(dependentId) || 0) + 1);
      }
    }

    return { graph, inDegree };
  }

  /**
   * Perform Kahn's algorithm for topological sorting
   */
  private performTopologicalSort(
    graph: Map<string, string[]>,
    inDegree: Map<string, number>
  ): string[] {
    const queue: string[] = [];
    const result: string[] = [];

    // Start with tasks that have no dependencies
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(taskId);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
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

  // ---------------------------------------------------------------------------
  // Graph Traversal
  // ---------------------------------------------------------------------------

  /**
   * Perform depth-first traversal starting from a task
   */
  walkDepthFirst(startTaskId: string, visitor: (taskId: string, depth: number) => void): void {
    const visited = new Set<string>();

    const dfs = (taskId: string, depth: number): void => {
      if (visited.has(taskId)) return;

      visited.add(taskId);
      visitor(taskId, depth);

      const dependents = this.getDependents(taskId);
      for (const dependent of dependents) {
        dfs(dependent, depth + 1);
      }
    };

    dfs(startTaskId, 0);
  }

  /**
   * Perform breadth-first traversal starting from a task
   */
  walkBreadthFirst(startTaskId: string, visitor: (taskId: string, depth: number) => void): void {
    const visited = new Set<string>();
    const queue: Array<{ taskId: string; depth: number }> = [{ taskId: startTaskId, depth: 0 }];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { taskId, depth } = item;

      if (visited.has(taskId)) continue;

      visited.add(taskId);
      visitor(taskId, depth);

      const dependents = this.getDependents(taskId);
      for (const dependent of dependents) {
        if (!visited.has(dependent)) {
          queue.push({ taskId: dependent, depth: depth + 1 });
        }
      }
    }
  }

  /**
   * Find the shortest path between two tasks in the dependency graph
   */
  findShortestPath(fromTaskId: string, toTaskId: string): string[] | null {
    if (fromTaskId === toTaskId) return [fromTaskId];

    const visited = new Set<string>();
    const queue: Array<{ taskId: string; path: string[] }> = [
      { taskId: fromTaskId, path: [fromTaskId] },
    ];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { taskId, path } = item;

      if (visited.has(taskId)) continue;
      visited.add(taskId);

      const dependents = this.getDependents(taskId);
      for (const dependent of dependents) {
        const newPath = [...path, dependent];

        if (dependent === toTaskId) {
          return newPath;
        }

        if (!visited.has(dependent)) {
          queue.push({ taskId: dependent, path: newPath });
        }
      }
    }

    return null; // No path found
  }

  // ---------------------------------------------------------------------------
  // Graph Metrics and Analysis
  // ---------------------------------------------------------------------------

  /**
   * Calculate comprehensive metrics about the dependency graph
   */
  getMetrics(): DependencyGraphMetrics {
    const allTaskIds = this.getAllTaskIds();
    const cycleResult = this.findCycles();

    let totalDependencies = 0;
    let rootTasks = 0;
    let leafTasks = 0;
    let maxDepth = 0;

    for (const taskId of allTaskIds) {
      const dependencies = this.getDependencies(taskId);
      const dependents = this.getDependents(taskId);

      totalDependencies += dependencies.length;

      if (dependencies.length === 0) rootTasks++;
      if (dependents.length === 0) leafTasks++;

      // Calculate depth for this task
      const depth = this.calculateTaskDepth(taskId);
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      totalTasks: allTaskIds.length,
      totalDependencies,
      rootTasks,
      leafTasks,
      maxDepth,
      averageDependencies: allTaskIds.length > 0 ? totalDependencies / allTaskIds.length : 0,
      hasCycles: cycleResult.hasCycles,
      stronglyConnectedComponents: this.countStronglyConnectedComponents(),
    };
  }

  /**
   * Calculate the dependency depth for a specific task
   */
  calculateTaskDepth(taskId: string): number {
    const visited = new Set<string>();

    const dfs = (currentTaskId: string): number => {
      if (visited.has(currentTaskId)) return 0; // Avoid infinite loops

      visited.add(currentTaskId);
      const dependencies = this.getDependencies(currentTaskId);

      if (dependencies.length === 0) return 0;

      let maxDepth = 0;
      for (const depId of dependencies) {
        maxDepth = Math.max(maxDepth, dfs(depId) + 1);
      }

      visited.delete(currentTaskId);
      return maxDepth;
    };

    return dfs(taskId);
  }

  /**
   * Count strongly connected components in the graph
   */
  private countStronglyConnectedComponents(): number {
    // Simplified implementation - in a DAG, each node is its own SCC
    // unless there are cycles
    const cycleResult = this.findCycles();
    if (!cycleResult.hasCycles) {
      return this.getAllTaskIds().length;
    }

    // For graphs with cycles, we'd need Tarjan's or Kosaraju's algorithm
    // For now, return a conservative estimate
    return this.getAllTaskIds().length - cycleResult.cycles.length;
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new DependencyGraph with an additional dependency
   */
  withDependency(dependentId: string, dependencyId: string): IDependencyGraph {
    const dependencies = this._getAllDependencyPairs();
    dependencies.push({ dependentTaskId: dependentId, dependencyTaskId: dependencyId });

    return new DependencyGraph({
      dependencies,
      tasks: Array.from(this._tasks.values()),
    });
  }

  /**
   * Create a new DependencyGraph without a specific dependency
   */
  withoutDependency(dependentId: string, dependencyId: string): IDependencyGraph {
    const dependencies = this._getAllDependencyPairs().filter(
      (dep) => !(dep.dependentTaskId === dependentId && dep.dependencyTaskId === dependencyId)
    );

    return new DependencyGraph({
      dependencies,
      tasks: Array.from(this._tasks.values()),
    });
  }

  /**
   * Convert the graph to a plain object for serialization
   */
  toPlainObject(): DependencyGraphData {
    return {
      dependencies: this._getAllDependencyPairs(),
      tasks: Array.from(this._tasks.values()),
    };
  }

  /**
   * Create a DependencyGraph from task dependencies and optional task data
   */
  static fromDependencies(dependencies: TaskDependency[], tasks?: TaskData[]): DependencyGraph {
    const data: DependencyGraphData = {
      dependencies: dependencies.map((dep) => ({
        dependentTaskId: dep.dependentTaskId,
        dependencyTaskId: dep.dependencyTaskId,
      })),
      tasks,
    };

    return new DependencyGraph(data);
  }

  /**
   * Create an empty DependencyGraph
   */
  static empty(): DependencyGraph {
    return new DependencyGraph({ dependencies: [] });
  }
}
