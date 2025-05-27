/**
 * @fileoverview Type definitions for MCP (Model Context Protocol) handler system
 * 
 * This module defines the core types, schemas, and interfaces used throughout
 * the MCP server for handling task management operations. It provides type-safe
 * interfaces for all MCP tool operations and ensures consistent data validation
 * across the entire system.
 * 
 * @module handlers/types
 * @since 1.0.0
 */

import { z } from 'zod';
import type { Store, TaskService } from '@astrolabe/core';

/**
 * Context object passed to all MCP handlers containing shared dependencies
 * and request metadata. This ensures all handlers have access to the same
 * core services and request tracking information.
 * 
 * @interface HandlerContext
 * @example
 * ```typescript
 * const context: HandlerContext = {
 *   store: databaseStore,
 *   taskService: taskServiceInstance,
 *   requestId: 'req_123456',
 *   timestamp: '2024-01-15T10:30:00Z'
 * };
 * ```
 */
export interface HandlerContext {
  /** Database store instance for data persistence operations */
  store: Store;
  /** Task service instance for hierarchical task operations */
  taskService: TaskService;
  /** Unique identifier for the current request (for logging and tracing) */
  requestId: string;
  /** ISO timestamp when the request was initiated */
  timestamp: string;
}

/**
 * Base interface that all MCP handlers must implement.
 * Provides access to the shared handler context.
 * 
 * @interface MCPHandler
 * @example
 * ```typescript
 * class TaskListHandler implements MCPHandler {
 *   constructor(public readonly context: HandlerContext) {}
 *   
 *   async handle(params: ListTasksInput) {
 *     // Implementation using this.context.store and this.context.taskService
 *   }
 * }
 * ```
 */
export interface MCPHandler {
  /** Immutable reference to the handler context */
  readonly context: HandlerContext;
}

/**
 * Task status enumeration that defines all possible states a task can be in.
 * Used consistently across all task-related operations.
 * 
 * @constant
 * @type {z.ZodEnum<['pending', 'in-progress', 'done', 'cancelled', 'archived']>}
 */
const taskStatus = z.enum(['pending', 'in-progress', 'done', 'cancelled', 'archived']);

/**
 * Task priority enumeration for task importance levels.
 * 
 * @constant
 * @type {z.ZodEnum<['low', 'medium', 'high']>}
 */
const taskPriority = z.enum(['low', 'medium', 'high']);

/**
 * Schema for creating new tasks via MCP.
 * Validates input for task creation operations.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * const newTask = {
 *   title: "Implement user authentication",
 *   description: "Add JWT-based authentication system",
 *   status: "pending",
 *   priority: "high"
 * };
 * 
 * const validated = createTaskSchema.parse(newTask);
 * ```
 */
export const createTaskSchema = z.object({
  /** Task title (required) - should be concise and descriptive */
  title: z.string(),
  /** Optional detailed description of the task */
  description: z.string().optional(),
  /** Optional parent task ID for creating subtasks */
  parentId: z.string().optional(),
  /** Task status - defaults to 'pending' if not specified */
  status: taskStatus.default('pending'),
  /** Task priority - defaults to 'medium' if not specified */
  priority: taskPriority.default('medium'),
  /** Optional Product Requirements Document content */
  prd: z.string().optional(),
  /** Optional context digest for AI agents */
  contextDigest: z.string().optional(),
});

/**
 * Schema for updating existing tasks via MCP.
 * All fields except ID are optional to allow partial updates.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * const update = {
 *   id: "task_123",
 *   status: "done",
 *   description: "Updated description"
 * };
 * 
 * const validated = updateTaskSchema.parse(update);
 * ```
 */
export const updateTaskSchema = z.object({
  /** Task ID (required) - identifies which task to update */
  id: z.string(),
  /** Optional new title for the task */
  title: z.string().optional(),
  /** Optional new description for the task */
  description: z.string().optional(),
  /** Optional new status for the task */
  status: taskStatus.optional(),
  /** Optional new priority for the task */
  priority: taskPriority.optional(),
  /** Optional new parent task ID (for moving tasks) */
  parentId: z.string().optional(),
  /** Optional new PRD content */
  prd: z.string().optional(),
  /** Optional new context digest */
  contextDigest: z.string().optional(),
});

/**
 * Schema for deleting tasks via MCP.
 * Supports cascading deletes for parent tasks.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * // Delete single task
 * const simpleDelete = { id: "task_123" };
 * 
 * // Delete task and all its subtasks
 * const cascadeDelete = { id: "task_123", cascade: true };
 * ```
 */
export const deleteTaskSchema = z.object({
  /** Task ID to delete */
  id: z.string(),
  /** Whether to also delete all subtasks (default: false) */
  cascade: z.boolean().default(false),
});

/**
 * Schema for marking tasks as complete via MCP.
 * Simplified interface for the common completion operation.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * const completion = { id: "task_123" };
 * const validated = completeTaskSchema.parse(completion);
 * ```
 */
export const completeTaskSchema = z.object({
  /** Task ID to mark as complete */
  id: z.string(),
});

/**
 * Schema for retrieving task context information via MCP.
 * Allows for flexible context retrieval with depth control.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * // Get task with immediate children only
 * const basic = { id: "task_123" };
 * 
 * // Get task with full hierarchy
 * const detailed = {
 *   id: "task_123",
 *   includeAncestors: true,
 *   includeDescendants: true,
 *   maxDepth: 5
 * };
 * ```
 */
export const getTaskContextSchema = z.object({
  /** Task ID to get context for */
  id: z.string(),
  /** Whether to include parent tasks in the response (default: false) */
  includeAncestors: z.boolean().default(false),
  /** Whether to include child tasks in the response (default: false) */
  includeDescendants: z.boolean().default(false),
  /** Maximum depth for hierarchical inclusion (default: 3) */
  maxDepth: z.number().default(3),
});

/**
 * Schema for listing tasks with filtering via MCP.
 * Supports filtering by status and parent task.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * // List all pending tasks
 * const pendingTasks = { status: "pending" };
 * 
 * // List subtasks of a specific task
 * const subtasks = { parentId: "task_123", includeSubtasks: true };
 * 
 * // List all root tasks
 * const rootTasks = { parentId: null };
 * ```
 */
export const listTasksSchema = z.object({
  /** Optional status filter - only return tasks with this status */
  status: taskStatus.optional(),
  /** Optional parent filter - only return subtasks of this parent, or null for root tasks */
  parentId: z.string().optional(),
  /** Whether to include nested subtasks in the response (default: false) */
  includeSubtasks: z.boolean().default(false),
});

/**
 * Schema for generating tasks from input content via MCP.
 * Supports different generator types and context information.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * // Generate tasks from PRD
 * const prdGeneration = {
 *   type: "prd",
 *   content: "Product requirements document content...",
 *   context: {
 *     parentTaskId: "epic_123",
 *     existingTasks: ["task_1", "task_2"]
 *   }
 * };
 * ```
 */
export const generateTasksSchema = z.object({
  /** Generator type (currently only 'prd' supported) */
  type: z.string(),
  /** Source content to generate tasks from */
  content: z.string().min(1, "Content cannot be empty"),
  /** Optional context information */
  context: z.object({
    /** Parent task ID for generated tasks */
    parentTaskId: z.string().optional(),
    /** Existing task IDs for context */
    existingTasks: z.array(z.string()).optional(),
  }).optional(),
  /** Generator-specific metadata and options */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for listing available task generators via MCP.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * // List generators with metadata
 * const withDetails = { includeMetadata: true };
 * 
 * // List generators without metadata
 * const simple = { includeMetadata: false };
 * ```
 */
export const listGeneratorsSchema = z.object({
  /** Whether to include detailed metadata about generators */
  includeMetadata: z.boolean().default(false),
});

/**
 * Schema for validating generation input via MCP.
 * 
 * @constant
 * @type {z.ZodObject}
 * @example
 * ```typescript
 * // Validate PRD content
 * const validation = {
 *   type: "prd",
 *   content: "Product requirements...",
 *   metadata: { "maxTasks": 10 }
 * };
 * ```
 */
export const validateGenerationInputSchema = z.object({
  /** Generator type to validate against */
  type: z.string(),
  /** Content to validate */
  content: z.string(),
  /** Optional metadata for validation */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * TypeScript types inferred from the Zod schemas above.
 * These provide compile-time type safety for all MCP operations.
 * 
 * @group Input Types
 */

/** Input type for task creation operations */
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Input type for task update operations */
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Input type for task deletion operations */
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;

/** Input type for task completion operations */
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

/** Input type for task context retrieval operations */
export type GetTaskContextInput = z.infer<typeof getTaskContextSchema>;

/** Input type for task listing operations */
export type ListTasksInput = z.infer<typeof listTasksSchema>;

/** Input type for task generation operations */
export type GenerateTasksInput = z.infer<typeof generateTasksSchema>;

/** Input type for listing available generators */
export type ListGeneratorsInput = z.infer<typeof listGeneratorsSchema>;

/** Input type for validating generation input */
export type ValidateGenerationInputInput = z.infer<typeof validateGenerationInputSchema>;
