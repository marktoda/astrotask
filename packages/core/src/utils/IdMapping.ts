/**
 * @fileoverview Centralized ID mapping utilities
 * 
 * This module provides utilities for handling temporary ID to real ID mappings
 * during tracking operations, particularly useful for operations with hierarchical
 * dependencies.
 */

import { IdMappingError } from './TrackingErrors.js';
import type { PendingOperation } from './TrackingTaskTree.js';
import type { DependencyPendingOperation } from './TrackingDependencyGraph.js';

/**
 * Centralized ID mapper with validation and error handling
 */
export class IdMapper {
  private readonly mappings = new Map<string, string>();

  /**
   * Add a mapping from temporary ID to real ID
   */
  addMapping(tempId: string, realId: string): void {
    if (!tempId || !realId) {
      throw new IdMappingError('Invalid ID mapping: both tempId and realId must be non-empty', [], this.mappings);
    }
    this.mappings.set(tempId, realId);
  }

  /**
   * Resolve a temporary ID to its real ID, returning the original if no mapping exists
   */
  resolve(id: string): string {
    return this.mappings.get(id) ?? id;
  }

  /**
   * Check if an ID has a mapping
   */
  hasMapping(id: string): boolean {
    return this.mappings.has(id);
  }

  /**
   * Get all mappings (read-only)
   */
  getAllMappings(): ReadonlyMap<string, string> {
    return this.mappings;
  }

  /**
   * Apply ID mappings to a task operation
   */
  applyToTaskOperation(operation: PendingOperation): PendingOperation {
    switch (operation.type) {
      case 'task_update':
        return {
          ...operation,
          taskId: this.resolve(operation.taskId),
        };
      
      case 'child_add':
        return {
          ...operation,
          parentId: this.resolve(operation.parentId),
          childData: this.applyToTaskTreeData(operation.childData as any), // Type assertion for now
        };
      
      case 'child_remove':
        return {
          ...operation,
          parentId: this.resolve(operation.parentId),
          childId: this.resolve(operation.childId),
        };
    }
  }

  /**
   * Apply ID mappings to a dependency operation
   */
  applyToDependencyOperation(operation: DependencyPendingOperation): DependencyPendingOperation {
    return {
      ...operation,
      dependentTaskId: this.resolve(operation.dependentTaskId),
      dependencyTaskId: this.resolve(operation.dependencyTaskId),
    };
  }

  /**
   * Apply ID mappings to task tree data recursively
   */
  private applyToTaskTreeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const result = { ...data };
    
    // Apply to task ID if present
    if (result.task?.id) {
      result.task = {
        ...result.task,
        id: this.resolve(result.task.id),
      };
      
      // Also update parentId if present
      if (result.task.parentId) {
        result.task.parentId = this.resolve(result.task.parentId);
      }
    }

    // Apply to children recursively
    if (Array.isArray(result.children)) {
      result.children = result.children.map((child: any) => this.applyToTaskTreeData(child));
    }

    return result;
  }

  /**
   * Validate that all required IDs have mappings
   */
  validateMappings(requiredIds: string[]): void {
    const unmappedIds = requiredIds.filter(id => !this.hasMapping(id) && !this.isRealId(id));
    
    if (unmappedIds.length > 0) {
      throw new IdMappingError(
        `Missing ID mappings for: ${unmappedIds.join(', ')}`,
        unmappedIds,
        this.mappings
      );
    }
  }

  /**
   * Check if an ID appears to be a real ID (heuristic: not temporary)
   * This is a simple heuristic - you might want to make this more sophisticated
   */
  private isRealId(id: string): boolean {
    // Temporary IDs often start with 'temp-' or contain specific patterns
    return !id.startsWith('temp-') && !id.includes('temp') && !id.includes('draft');
  }
}

/**
 * Create an ID mapper from a Map of mappings
 */
export function createIdMapper(mappings: Map<string, string>): IdMapper {
  const mapper = new IdMapper();
  for (const [tempId, realId] of mappings) {
    mapper.addMapping(tempId, realId);
  }
  return mapper;
}

/**
 * Apply ID mappings to a list of task operations
 */
export function applyIdMappingsToTaskOperations(
  operations: PendingOperation[],
  mappings: Map<string, string>
): PendingOperation[] {
  const mapper = createIdMapper(mappings);
  return operations.map(op => mapper.applyToTaskOperation(op));
}

/**
 * Apply ID mappings to a list of dependency operations
 */
export function applyIdMappingsToDependencyOperations(
  operations: DependencyPendingOperation[],
  mappings: Map<string, string>
): DependencyPendingOperation[] {
  const mapper = createIdMapper(mappings);
  return operations.map(op => mapper.applyToDependencyOperation(op));
} 