/**
 * Dependency Validation Module
 * 
 * Consolidates dependency-specific validation logic including:
 * - Self-dependency checks
 * - Duplicate dependency checks
 * - Task existence validation
 * - Cycle detection
 */

import type { Store } from '../database/store.js';
import type { DependencyValidationResult } from '../schemas/dependency.js';
import type { IDependencyGraph } from '../entities/DependencyGraph.js';

/**
 * Validate whether a dependency can be safely added.
 * Checks for self-dependencies, duplicates, task existence, and cycles.
 *
 * @param dependentId - ID of the dependent task
 * @param dependencyId - ID of the dependency task
 * @param context - Validation context with store and graph access
 * @returns Promise resolving to validation result
 */
export async function validateDependency(
  dependentId: string,
  dependencyId: string,
  context: {
    store: Store;
    graph?: IDependencyGraph;
    existingDependencies?: string[];
  }
): Promise<DependencyValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for self-dependency
  if (dependentId === dependencyId) {
    errors.push('A task cannot depend on itself');
  }

  // Check if both tasks exist
  const [dependentTask, dependencyTask] = await Promise.all([
    context.store.getTask(dependentId),
    context.store.getTask(dependencyId),
  ]);

  if (!dependentTask) {
    errors.push(`Dependent task ${dependentId} does not exist`);
  }
  if (!dependencyTask) {
    errors.push(`Dependency task ${dependencyId} does not exist`);
  }

  // Check for duplicate dependency
  if (dependentTask && dependencyTask && context.existingDependencies) {
    if (context.existingDependencies.includes(dependencyId)) {
      errors.push('Dependency already exists');
    }
  }

  // Check for cycles using DependencyGraph (only if basic validation passes)
  let cycles: string[][] = [];
  if (errors.length === 0 && context.graph) {
    const cycleResult = context.graph.wouldCreateCycle(dependentId, dependencyId);
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
 * Validate multiple dependencies at once
 */
export async function validateDependencies(
  dependencies: Array<{ dependentId: string; dependencyId: string }>,
  context: {
    store: Store;
    graph?: IDependencyGraph;
  }
): Promise<Map<string, DependencyValidationResult>> {
  const results = new Map<string, DependencyValidationResult>();
  
  for (const dep of dependencies) {
    const key = `${dep.dependentId}->${dep.dependencyId}`;
    const result = await validateDependency(
      dep.dependentId,
      dep.dependencyId,
      context
    );
    results.set(key, result);
  }
  
  return results;
}

/**
 * Check if adding a dependency would create a cycle
 */
export function wouldCreateCycle(
  dependentId: string,
  dependencyId: string,
  graph: IDependencyGraph
): { hasCycles: boolean; cycles: string[][] } {
  return graph.wouldCreateCycle(dependentId, dependencyId);
}

/**
 * Find all cycles in the dependency graph
 */
export function findAllCycles(graph: IDependencyGraph): string[][] {
  const result = graph.findCycles();
  return result.cycles;
}

/**
 * Validate that a task can be started based on its dependencies
 */
export async function validateTaskCanStart(
  _taskId: string,
  context: {
    store: Store;
    getBlockingTasks: () => Promise<string[]>;
  }
): Promise<{ canStart: boolean; blockedBy: string[]; reason?: string }> {
  const blockingTasks = await context.getBlockingTasks();
  
  if (blockingTasks.length > 0) {
    return {
      canStart: false,
      blockedBy: blockingTasks,
      reason: `Task is blocked by ${blockingTasks.length} incomplete dependencies`,
    };
  }
  
  return {
    canStart: true,
    blockedBy: [],
  };
} 