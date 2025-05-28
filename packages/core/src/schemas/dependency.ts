/**
 * @fileoverview Task dependency schemas and types
 *
 * This module defines the Zod schemas and TypeScript types for task dependencies,
 * enabling tasks to specify prerequisite relationships where certain tasks must
 * be completed before others can begin.
 *
 * @module schemas/dependency
 * @since 1.0.0
 */

import { z } from 'zod';
import { taskId } from './base.js';
import { taskSchema } from './task.js';

/**
 * Schema for a task dependency relationship in the database.
 * Represents a directed edge in the dependency graph where dependentTaskId
 * cannot start until dependencyTaskId is completed.
 */
export const taskDependencySchema = z.object({
  /** Unique identifier for this dependency relationship */
  id: z.string(),
  /** Task that depends on another (cannot start until dependency completes) */
  dependentTaskId: taskId,
  /** Task that must be completed first (the prerequisite) */
  dependencyTaskId: taskId,
  /** When this dependency relationship was created */
  createdAt: z.date(),
});

/**
 * Schema for creating a new task dependency.
 * Omits auto-generated fields (id, createdAt).
 */
export const createTaskDependencySchema = taskDependencySchema.omit({
  id: true,
  createdAt: true,
});

/**
 * Schema for dependency graph information for a specific task.
 * Provides comprehensive dependency context including blocking status.
 */
export const taskDependencyGraphSchema = z.object({
  /** The task this graph information is for */
  taskId: taskId,
  /** Array of task IDs this task depends on (prerequisites) */
  dependencies: z.array(taskId),
  /** Array of task IDs that depend on this task */
  dependents: z.array(taskId),
  /** Whether this task is currently blocked by incomplete dependencies */
  isBlocked: z.boolean(),
  /** Array of incomplete dependency task IDs that are blocking this task */
  blockedBy: z.array(taskId),
});

/**
 * Extended task schema that includes dependency information.
 * Used for API responses that need to include dependency context.
 */
export const taskWithDependenciesSchema = taskSchema.extend({
  /** Array of task IDs this task depends on (optional for backward compatibility) */
  dependencies: z.array(taskId).optional(),
  /** Array of task IDs that depend on this task (optional for backward compatibility) */
  dependents: z.array(taskId).optional(),
  /** Whether this task is currently blocked (optional for backward compatibility) */
  isBlocked: z.boolean().optional(),
  /** Array of incomplete dependencies blocking this task (optional for backward compatibility) */
  blockedBy: z.array(taskId).optional(),
});

/**
 * Schema for dependency validation results.
 * Used when checking if a dependency can be safely added.
 */
export const dependencyValidationResultSchema = z.object({
  /** Whether the dependency is valid and can be added */
  valid: z.boolean(),
  /** Array of detected cycles (each cycle is an array of task IDs) */
  cycles: z.array(z.array(taskId)),
  /** Array of error messages explaining why the dependency is invalid */
  errors: z.array(z.string()),
  /** Array of warning messages about potential issues */
  warnings: z.array(z.string()).optional(),
});

/**
 * API schema for task dependencies (with ISO string timestamps).
 * Used for serialization in API responses.
 */
export const taskDependencyApiSchema = taskDependencySchema.extend({
  createdAt: z.string().datetime(),
});

/**
 * API schema for creating task dependencies.
 * Used for API request validation.
 */
export const createTaskDependencyApiSchema = createTaskDependencySchema;

// Transformation functions for database <-> API compatibility
export function taskDependencyToApi(dependency: TaskDependency): TaskDependencyApi {
  return {
    ...dependency,
    createdAt: dependency.createdAt.toISOString(),
  };
}

export function taskDependencyFromApi(
  apiDependency: TaskDependencyApi
): Omit<TaskDependency, 'id' | 'createdAt'> {
  return {
    dependentTaskId: apiDependency.dependentTaskId,
    dependencyTaskId: apiDependency.dependencyTaskId,
  };
}

// Derived TypeScript types
export type TaskDependency = z.infer<typeof taskDependencySchema>;
export type CreateTaskDependency = z.infer<typeof createTaskDependencySchema>;
export type TaskDependencyGraph = z.infer<typeof taskDependencyGraphSchema>;
export type TaskWithDependencies = z.infer<typeof taskWithDependenciesSchema>;
export type DependencyValidationResult = z.infer<typeof dependencyValidationResultSchema>;
export type TaskDependencyApi = z.infer<typeof taskDependencyApiSchema>;
export type CreateTaskDependencyApi = z.infer<typeof createTaskDependencyApiSchema>;
