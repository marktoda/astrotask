/**
 * @fileoverview TrackingDependencyGraph utility for tracking dependency changes
 *
 * This utility implements IDependencyGraph to capture all mutations for later reconciliation.
 * It provides a mutable interface for dependency operations while tracking changes that
 * can be applied to a store in batches.
 *
 * @module utils/TrackingDependencyGraph
 * @since 1.0.0
 */

import { z } from 'zod';
import type { TaskDependencyGraph } from '../schemas/dependency.js';
import {
  type CycleDetectionResult,
  DependencyGraph,
  type DependencyGraphData,
  type DependencyGraphMetrics,
  type IDependencyGraph,
  type TaskData,
} from './DependencyGraph.js';
import { ReconciliationError } from './TrackingErrors.js';
import type { DependencyFlushResult, IDependencyReconciliationService } from './TrackingTypes.js';

/**
 * Pending operations that can be applied to a DependencyGraph
 */
export const dependencyPendingOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dependency_add'),
    dependentTaskId: z.string(),
    dependencyTaskId: z.string(),
    timestamp: z.date(),
  }),
  z.object({
    type: z.literal('dependency_remove'),
    dependentTaskId: z.string(),
    dependencyTaskId: z.string(),
    timestamp: z.date(),
  }),
]);

export type DependencyPendingOperation = z.infer<typeof dependencyPendingOperationSchema>;

/**
 * Reconciliation plan containing dependency operations to apply to the store
 */
export interface DependencyReconciliationPlan {
  graphId: string;
  baseVersion: number;
  operations: DependencyPendingOperation[];
}

/**
 * Mutable TrackingDependencyGraph that records operations in place for later reconciliation.
 *
 * Key features:
 * - Mutable operations that update the graph in place (consistent with TrackingTaskTree)
 * - Automatic operation recording for all mutations
 * - Optimistic updates with conflict resolution
 * - Batch reconciliation to store
 * - Maintains operation ordering for conflict resolution
 * - Implements IDependencyGraph interface directly (no inheritance complications)
 */
export class TrackingDependencyGraph implements IDependencyGraph {
  private _pendingOperations: DependencyPendingOperation[] = [];
  private _isTracking: boolean;
  private _baseVersion: number;
  private readonly _graphId: string;

  // Core graph state - we manage this directly
  private _dependencies: Map<string, string[]> = new Map(); // dependentId -> [dependencyIds]
  private _dependents: Map<string, string[]> = new Map(); // dependencyId -> [dependentIds]
  private _tasks: Map<string, TaskData> = new Map();
  private _adjacencyList: Map<string, string[]> = new Map(); // for graph traversal

  constructor(
    data: DependencyGraphData,
    options: {
      isTracking?: boolean;
      baseVersion?: number;
      pendingOperations?: DependencyPendingOperation[];
      graphId?: string;
    } = {}
  ) {
    this._isTracking = options.isTracking ?? true;
    this._baseVersion = options.baseVersion ?? 0;
    this._pendingOperations = [...(options.pendingOperations ?? [])];
    this._graphId = options.graphId ?? 'default';

    this.rebuildFromData(data);
  }

  /**
   * Rebuild internal state from dependency graph data
   */
  private rebuildFromData(data: DependencyGraphData): void {
    this._dependencies.clear();
    this._dependents.clear();
    this._tasks.clear();
    this._adjacencyList.clear();

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

  // Getters for tracking state
  get isTracking(): boolean {
    return this._isTracking;
  }

  get pendingOperations(): readonly DependencyPendingOperation[] {
    return this._pendingOperations;
  }

  get hasPendingChanges(): boolean {
    return this._pendingOperations.length > 0;
  }

  get baseVersion(): number {
    return this._baseVersion;
  }

  get graphId(): string {
    return this._graphId;
  }

  /**
   * Add a dependency in place and record the operation
   */
  withDependency(dependentId: string, dependencyId: string): this {
    // Check if dependency already exists
    const exists =
      this._dependencies.has(dependentId) &&
      this._dependencies.get(dependentId)?.includes(dependencyId);

    if (!exists) {
      // Add to our internal maps
      if (!this._dependencies.has(dependentId)) {
        this._dependencies.set(dependentId, []);
      }
      const dependentList = this._dependencies.get(dependentId);
      if (dependentList) {
        dependentList.push(dependencyId);
      }

      // Update dependents map
      if (!this._dependents.has(dependencyId)) {
        this._dependents.set(dependencyId, []);
      }
      const dependentsList = this._dependents.get(dependencyId);
      if (dependentsList) {
        dependentsList.push(dependentId);
      }

      // Update adjacency list
      if (!this._adjacencyList.has(dependencyId)) {
        this._adjacencyList.set(dependencyId, []);
      }
      const adjacencyList = this._adjacencyList.get(dependencyId);
      if (adjacencyList) {
        adjacencyList.push(dependentId);
      }
    }

    // Record operation if tracking is enabled
    if (this._isTracking) {
      this._pendingOperations.push({
        type: 'dependency_add',
        dependentTaskId: dependentId,
        dependencyTaskId: dependencyId,
        timestamp: new Date(),
      });
    }

    return this;
  }

  /**
   * Remove a dependency in place and record the operation
   */
  withoutDependency(dependentId: string, dependencyId: string): this {
    // Remove from dependencies map
    const dependentList = this._dependencies.get(dependentId);
    if (dependentList) {
      const filteredList = dependentList.filter((id) => id !== dependencyId);
      if (filteredList.length === 0) {
        this._dependencies.delete(dependentId);
      } else {
        this._dependencies.set(dependentId, filteredList);
      }
    }

    // Remove from dependents map
    const dependentsList = this._dependents.get(dependencyId);
    if (dependentsList) {
      const filteredList = dependentsList.filter((id) => id !== dependentId);
      if (filteredList.length === 0) {
        this._dependents.delete(dependencyId);
      } else {
        this._dependents.set(dependencyId, filteredList);
      }
    }

    // Remove from adjacency list
    const adjacencyList = this._adjacencyList.get(dependencyId);
    if (adjacencyList) {
      const filteredList = adjacencyList.filter((id) => id !== dependentId);
      if (filteredList.length === 0) {
        this._adjacencyList.delete(dependencyId);
      } else {
        this._adjacencyList.set(dependencyId, filteredList);
      }
    }

    // Record operation if tracking is enabled
    if (this._isTracking) {
      this._pendingOperations.push({
        type: 'dependency_remove',
        dependentTaskId: dependentId,
        dependencyTaskId: dependencyId,
        timestamp: new Date(),
      });
    }

    return this;
  }

  /**
   * Start tracking changes (if not already tracking)
   */
  startTracking(): this {
    this._isTracking = true;
    return this;
  }

  /**
   * Stop tracking and return a regular DependencyGraph
   */
  stopTracking(): DependencyGraph {
    return new DependencyGraph(this.toPlainObject());
  }

  /**
   * Clear all pending operations (usually after successful reconciliation)
   */
  clearPendingOperations(): this {
    if (this._pendingOperations.length > 0) {
      this._baseVersion += this._pendingOperations.length;
      this._pendingOperations.length = 0; // Clear in place
    }
    return this;
  }

  /**
   * Flush all pending operations to a DependencyService and clear them on success
   * This is the primary way to persist changes from a TrackingDependencyGraph
   *
   * @param dependencyService - The service to apply changes to
   * @returns Promise of the updated DependencyGraph from the store and this TrackingDependencyGraph (cleared)
   */
  async flush(dependencyService: IDependencyReconciliationService): Promise<DependencyFlushResult> {
    if (!this.hasPendingChanges) {
      // No changes to apply, just return current state
      const currentGraph = await dependencyService.applyReconciliationPlan({
        graphId: this._graphId,
        baseVersion: this._baseVersion,
        operations: [],
      });

      return {
        updatedGraph: currentGraph,
        clearedTrackingGraph: this,
      };
    }

    // Create reconciliation plan
    const plan = this.createReconciliationPlan();

    try {
      // Apply the plan to the dependency service
      const updatedGraph = await dependencyService.applyReconciliationPlan(plan);

      // Clear pending operations on success
      this.clearPendingOperations();

      return {
        updatedGraph,
        clearedTrackingGraph: this,
      };
    } catch (error) {
      // Don't clear pending operations on failure - preserve them for retry
      throw new ReconciliationError(
        `Failed to flush tracking dependency graph changes: ${error instanceof Error ? error.message : String(error)}`,
        this._pendingOperations,
        [], // No successful operations since we failed
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Apply all pending operations to a DependencyService and clear them on success
   * @deprecated Use flush() instead for consistency with TrackingTaskTree
   */
  async apply(dependencyService: IDependencyReconciliationService): Promise<DependencyFlushResult> {
    return this.flush(dependencyService);
  }

  /**
   * Get operations that occurred after a specific version
   */
  getOperationsSince(version: number): DependencyPendingOperation[] {
    return this._pendingOperations.slice(version - this._baseVersion);
  }

  /**
   * Merge operations from another source (for collaborative editing)
   */
  mergeOperations(otherOperations: readonly DependencyPendingOperation[]): this {
    // Simple merge - in practice, this would need conflict resolution
    const mergedOperations = [...this._pendingOperations, ...otherOperations].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    this._pendingOperations = mergedOperations;
    return this;
  }

  /**
   * Creates a reconciliation plan for resolving pending operations with conflict detection
   *
   * Analyzes all pending operations to detect conflicts (multiple operations on the same dependency)
   * and generates a reconciled set of operations using the "last update wins" strategy.
   * This is essential for optimistic UI updates that need to be synchronized with the backend.
   *
   * @returns DependencyReconciliationPlan containing resolved operations and metadata
   *
   * @complexity O(n log n) where n = number of pending operations (due to timestamp sorting)
   * @space O(n) for operation grouping and conflict detection data structures
   *
   * @sideEffects
   * - Logs conflict warnings for observability
   * - Does not modify the graph state (read-only analysis)
   *
   * @algorithm
   * 1. Group operations by dependency pairs
   * 2. Detect conflicts within dependency operations
   * 3. Apply last-update-wins resolution for conflicting operations
   * 4. Preserve all non-conflicting operations in original order
   *
   * @conflictResolution
   * - Dependency operations: Use latest timestamp for same dependency pair
   */
  createReconciliationPlan(): DependencyReconciliationPlan {
    const consolidatedOperations = this.consolidateOperations([...this._pendingOperations]);

    return {
      graphId: this._graphId,
      baseVersion: this._baseVersion,
      operations: consolidatedOperations,
    };
  }

  /**
   * Consolidate operations, keeping only the latest operation for each dependency
   */
  private consolidateOperations(
    operations: DependencyPendingOperation[]
  ): DependencyPendingOperation[] {
    const dependencyOps = new Map<string, DependencyPendingOperation>();

    // Consolidate dependency operations
    for (const op of operations) {
      // For dependency operations, use dependency pair as key
      const key = `${op.dependentTaskId}->${op.dependencyTaskId}`;
      const existing = dependencyOps.get(key);
      if (!existing || op.timestamp >= existing.timestamp) {
        dependencyOps.set(key, op);
      }
    }

    // Sort by timestamp to maintain operation order
    return Array.from(dependencyOps.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
  }

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): DependencyGraphData {
    const dependencies: Array<{ dependentTaskId: string; dependencyTaskId: string }> = [];

    for (const [dependentId, dependencyIds] of this._dependencies) {
      for (const dependencyId of dependencyIds) {
        dependencies.push({
          dependentTaskId: dependentId,
          dependencyTaskId: dependencyId,
        });
      }
    }

    return {
      dependencies,
      tasks: Array.from(this._tasks.values()),
    };
  }

  // Factory methods

  /**
   * Create a TrackingDependencyGraph from an existing DependencyGraph
   */
  static fromDependencyGraph(graph: DependencyGraph, graphId?: string): TrackingDependencyGraph {
    return new TrackingDependencyGraph(graph.toPlainObject(), {
      isTracking: true,
      baseVersion: 0,
      pendingOperations: [],
      graphId: graphId ?? 'default',
    });
  }

  /**
   * Create a TrackingDependencyGraph from dependencies and tasks
   */
  static fromData(
    data: DependencyGraphData,
    options: {
      graphId?: string;
      isTracking?: boolean;
    } = {}
  ): TrackingDependencyGraph {
    return new TrackingDependencyGraph(data, {
      isTracking: options.isTracking ?? true,
      baseVersion: 0,
      pendingOperations: [],
      graphId: options.graphId ?? 'default',
    });
  }

  /**
   * Create an empty TrackingDependencyGraph
   */
  static empty(graphId?: string): TrackingDependencyGraph {
    return new TrackingDependencyGraph(
      { dependencies: [], tasks: [] },
      {
        isTracking: true,
        baseVersion: 0,
        pendingOperations: [],
        graphId: graphId ?? 'default',
      }
    );
  }

  /**
   * Apply ID mappings to resolve temporary IDs in dependency operations
   * This modifies pending operations in place to use real database IDs.
   */
  applyIdMappings(idMappings: Map<string, string>): this {
    if (this._pendingOperations.length === 0) {
      return this; // No operations to map
    }

    // Update operations in place
    for (let i = 0; i < this._pendingOperations.length; i++) {
      const op = this._pendingOperations[i];
      if (op) {
        const resolvedDependentId = idMappings.get(op.dependentTaskId) || op.dependentTaskId;
        const resolvedDependencyId = idMappings.get(op.dependencyTaskId) || op.dependencyTaskId;

        this._pendingOperations[i] = {
          ...op,
          dependentTaskId: resolvedDependentId,
          dependencyTaskId: resolvedDependencyId,
        };
      }
    }

    return this;
  }

  // ---------------------------------------------------------------------------
  // IDependencyGraph Implementation
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

    // Add all tasks from the tasks map first (includes standalone tasks)
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
    const tempGraph = new TrackingDependencyGraph(this.toPlainObject(), { isTracking: false });
    tempGraph.withDependency(dependentId, dependencyId);
    return tempGraph.findCycles();
  }

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
}

/**
 * Serialize tracking state for persistence
 */
export function serializeDependencyTrackingState(graph: TrackingDependencyGraph): string {
  return JSON.stringify({
    graphId: graph.graphId,
    baseVersion: graph.baseVersion,
    operations: graph.pendingOperations,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Deserialize tracking state from persistence
 */
export function deserializeDependencyTrackingState(data: string): {
  graphId: string;
  baseVersion: number;
  operations: DependencyPendingOperation[];
  timestamp: string;
} {
  return JSON.parse(data);
}
