/**
 * @fileoverview Ultra-minimal type definitions for MCP handler system
 *
 * This module defines only the essential types and schemas needed for
 * the 6 core MCP tools: getNextTask, addTasks, addTaskContext, addDependency, updateStatus, listTasks
 *
 * @module handlers/types
 * @since 3.0.0
 */

import { z } from 'zod';
import {
  taskStatus,
  priorityScore,
  type TaskStatus,
  type PriorityScore,
  Astrotask
} from '@astrotask/core';

/**
 * Context object passed to all MCP handlers containing shared dependencies
 * and request metadata.
 */
export interface HandlerContext {
  /** Astrotask SDK instance providing unified access to all services */
  astrotask: Astrotask;
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
 * Schema for getting the next available task to work on.
 * This tool intelligently filters for dependency-free tasks that are ready for execution.
 */
export const getNextTaskSchema = z.object({
  parentTaskId: z
    .string()
    .optional()
    .describe("Optional parent task ID to limit search to direct children of this task. Use this to focus on a specific project or feature area."),
  status: taskStatus
    .optional()
    .describe("Filter by task status. Options: 'pending' (not started), 'in-progress' (currently active), 'done' (completed), 'cancelled' (abandoned), 'archived' (stored). Most commonly used with 'pending' to find unstarted work."),
  priorityScore: priorityScore
    .optional()
    .describe("Filter by minimum priority score (0-100). Tasks with scores >= this value will be included. Higher scores indicate higher priority.")
}).describe("Get the next available task that is ready to work on, automatically excluding tasks with unresolved dependencies");

/**
 * Schema for a single task object used in batch operations.
 * Defines the core properties needed to create a well-structured task.
 */
export const addTaskSchema = z.object({
  title: z
    .string()
    .min(1, "Title cannot be empty")
    .max(200, "Title cannot exceed 200 characters")
    .describe("Brief, descriptive title for the task. Should clearly convey what needs to be accomplished."),
  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional()
    .describe("Detailed description of the task, including context, requirements, or implementation notes. Optional but recommended for complex tasks."),
  parentTaskId: z
    .string()
    .optional()
    .describe("ID of an existing parent task to create this as a subtask. Use this to organize tasks hierarchically under projects or features."),
  priorityScore: priorityScore
    .optional()
    .describe("Priority score (0-100). Higher numbers indicate higher priority. Defaults to 50 if not provided. Maps to levels: <20=low, 20-70=medium, >70=high."),
  status: taskStatus
    .optional()
    .default('pending')
    .describe("Initial task status. Options: 'pending' (default, not started), 'in-progress' (currently active), 'done' (completed). Usually left as default 'pending'."),
  details: z
    .string()
    .optional()
    .describe("Additional implementation details, technical notes, or specific instructions for completing this task.")
}).describe("Individual task specification with all properties needed for creation");

/**
 * Schema for batch task creation with support for hierarchies and cross-references.
 * Enables creating multiple related tasks in a single atomic operation.
 */
export const addTasksSchema = z.object({
  tasks: z
    .array(
      addTaskSchema.extend({
        parentIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Zero-based array index of the parent task within this same batch. Use this instead of parentTaskId when the parent is being created in the same operation."),
        dependsOn: z
          .array(z.number().int().min(0))
          .optional()
          .describe("Array of zero-based indices of tasks within this batch that must be completed before this task can begin. Creates dependency relationships.")
      })
    )
    .min(1, "At least one task required")
    .max(50, "Cannot create more than 50 tasks in a single batch")
    .describe("Array of task specifications to create. Tasks are processed in order, allowing later tasks to reference earlier ones by index.")
}).describe("Create multiple tasks in a single operation with support for parent-child relationships and dependencies");

/**
 * Schema for listing tasks with various filtering options.
 * Provides flexible querying capabilities for project oversight and task discovery.
 */
export const listTasksSchema = z.object({
  statuses: z
    .array(taskStatus)
    .optional()
    .describe("Filter tasks by status array. Common values: 'pending' (unstarted), 'in-progress' (active), 'done' (completed), 'cancelled' (abandoned), 'archived' (stored). Leave empty to show pending and in-progress tasks only."),
  parentId: z
    .string()
    .optional()
    .describe("Filter to show only direct children of this parent task ID. Use this to explore a specific project or feature branch. Leave empty to include tasks at all levels."),
  includeProjectRoot: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include project root tasks in the results. Set to true when you want to see top-level project containers.")
}).describe("List tasks with optional filtering by status, hierarchy, and project scope");

/**
 * Schema for adding contextual information to an existing task.
 * Enables incremental enrichment of tasks with research, implementation notes, or clarifications.
 */
export const addTaskContextSchema = z.object({
  taskId: z
    .string()
    .describe("ID of the existing task to add context information to. The task must already exist in the system."),
  title: z
    .string()
    .min(1, "Title cannot be empty")
    .max(100, "Title cannot exceed 100 characters")
    .describe("Brief title for this context slice that summarizes the type of information being added (e.g., 'Implementation Approach', 'Research Findings')."),
  description: z
    .string()
    .min(1, "Description cannot be empty")
    .max(2000, "Description cannot exceed 2000 characters")
    .describe("Detailed content of the context slice. Can include research findings, implementation notes, complexity assessments, links, or any relevant information."),
  contextType: z
    .string()
    .optional()
    .default('general')
    .describe("Category of context being added. Common types: 'implementation' (technical details), 'research' (findings/links), 'complexity' (assessment/risks), 'requirements' (clarifications), 'testing' (strategies), 'acceptance' (criteria for completion), 'general' (miscellaneous notes).")
}).describe("Add a context slice to an existing task, providing additional information or clarifications");

/**
 * Schema for creating dependency relationships between tasks.
 * Establishes execution order by specifying which tasks must complete before others can begin.
 */
export const addDependencySchema = z.object({
  dependentTaskId: z
    .string()
    .describe("ID of the task that depends on another task. This task will be blocked until its dependency is completed."),
  dependencyTaskId: z
    .string()
    .describe("ID of the task that must be completed first. This task must finish before the dependent task can begin.")
}).describe("Create a dependency relationship where one task must complete before another can begin");

/**
 * Schema for updating the status of an existing task.
 * Provides a simple way to change task status with validation and proper error handling.
 */
export const updateStatusSchema = z.object({
  taskId: z
    .string()
    .describe("ID of the existing task to update. The task must already exist in the system."),
  status: taskStatus
    .describe("New status for the task. Options: 'pending' (not started), 'in-progress' (currently active), 'done' (completed), 'cancelled' (abandoned), 'archived' (stored)."),
  cascade: z
    .boolean()
    .optional()
    .describe("Whether to cascade the status update to all descendant tasks. Only applies to final statuses like 'done', 'cancelled', or 'archived'.")
}).describe("Update the status of an existing task, commonly used to mark tasks as done or in-progress");

/**
 * Schema for deleting an existing task with optional cascading to children.
 * Provides safe task deletion with confirmation and impact assessment.
 */
export const deleteTaskSchema = z.object({
  taskId: z
    .string()
    .describe("ID of the existing task to delete. The task must already exist in the system."),
  cascade: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to delete all descendant tasks along with the target task. When false, only the specified task is deleted (children become orphaned). When true, all children and grandchildren are also deleted.")
}).describe("Delete an existing task with optional cascading to all descendant tasks");

/**
 * Schema for getting a specific task by its ID.
 * Returns the task with full context including ancestors, descendants, dependencies, and context slices.
 */
export const getTaskSchema = z.object({
  taskId: z
    .string()
    .describe("ID of the task to retrieve. The task must exist in the system.")
}).describe("Get a specific task by ID with full context information, similar to getNextTask but for a specific task");

/**
 * TypeScript types inferred from the schemas
 */
export type GetNextTaskInput = z.infer<typeof getNextTaskSchema>;
export type GetTaskInput = z.infer<typeof getTaskSchema>;
export type AddTaskInput = z.infer<typeof addTaskSchema>;
export type AddTasksInput = z.infer<typeof addTasksSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
export type AddTaskContextInput = z.infer<typeof addTaskContextSchema>;
export type AddDependencyInput = z.infer<typeof addDependencySchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;
