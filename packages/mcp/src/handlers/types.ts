/**
 * @fileoverview Ultra-minimal type definitions for MCP handler system
 * 
 * This module defines only the essential types and schemas needed for
 * the 5 core MCP tools: getNextTask, addTasks, addTaskContext, addDependency, listTasks
 * 
 * @module handlers/types
 * @since 3.0.0
 */

import { z } from 'zod';
import { 
  taskStatus, 
  taskPriority, 
  type TaskStatus,
  type TaskPriority
} from '@astrolabe/core';
import type { Store, TaskService, DependencyService } from '@astrolabe/core';

/**
 * Context object passed to all MCP handlers containing shared dependencies
 * and request metadata.
 */
export interface HandlerContext {
  /** Database store instance for data persistence operations */
  store: Store;
  /** Task service instance for hierarchical task operations */
  taskService: TaskService;
  /** Dependency service instance for dependency management operations */
  dependencyService: DependencyService;
  /** Unique identifier for the current request (for logging and tracing) */
  requestId: string;
  /** ISO timestamp when the request was initiated */
  timestamp: string;
}

/**
 * Base interface that all MCP handlers must implement.
 */
export interface MCPHandler {
  /** Immutable reference to the handler context */
  readonly context: HandlerContext;
}

/**
 * Schema for getting the next available task
 */
export const getNextTaskSchema = z.object({
  /** Optional parent task ID to get next subtask within */
  parentTaskId: z.string().optional(),
  /** Optional status filter */
  status: taskStatus.optional(),
  /** Optional priority filter */
  priority: taskPriority.optional(),
});

/**
 * Schema for adding a single task (used in batch operations)
 */
export const addTaskSchema = z.object({
  /** Task title */
  title: z.string().min(1, "Title cannot be empty"),
  /** Task description */
  description: z.string().optional(),
  /** Optional parent task ID for creating subtasks */
  parentTaskId: z.string().optional(),
  /** Task priority */
  priority: taskPriority.optional().default('medium'),
  /** Task status */
  status: taskStatus.optional().default('pending'),
  /** Task details/instructions */
  details: z.string().optional(),
});

/**
 * Schema for batch task creation with local referencing
 */
export const addTasksSchema = z.object({
  /** Array of tasks to create */
  tasks: z.array(
    addTaskSchema.extend({
      /** Reference to parent by array index */
      parentIndex: z.number().int().min(0).optional(),
      /** Array of indices this task depends on */
      dependsOn: z.array(z.number().int().min(0)).optional(),
    })
  ).min(1, "At least one task required"),
});

/**
 * Schema for listing tasks with filters
 */
export const listTasksSchema = z.object({
  /** Optional status filter */
  status: z.string().optional(),
  /** Optional parent ID filter */
  parentId: z.string().optional(),
  /** Whether to include project root task */
  includeProjectRoot: z.boolean().optional(),
});

/**
 * Schema for adding a context slice to a task
 */
export const addTaskContextSchema = z.object({
  /** Task ID to add context to */
  taskId: z.string(),
  /** Context slice title */
  title: z.string().min(1, "Title cannot be empty"),
  /** Context slice description/content */
  description: z.string().min(1, "Description cannot be empty"),
  /** Context type (e.g., 'implementation', 'research', 'complexity') */
  contextType: z.string().optional().default('general'),
});

/**
 * Schema for adding a dependency between tasks
 */
export const addDependencySchema = z.object({
  /** Task that depends on another */
  dependentTaskId: z.string(),
  /** Task that must be completed first */
  dependencyTaskId: z.string(),
});

/**
 * TypeScript types inferred from the schemas
 */
export type GetNextTaskInput = z.infer<typeof getNextTaskSchema>;
export type AddTaskInput = z.infer<typeof addTaskSchema>;
export type AddTasksInput = z.infer<typeof addTasksSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type AddTaskContextInput = z.infer<typeof addTaskContextSchema>;
export type AddDependencyInput = z.infer<typeof addDependencySchema>;
