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
import { 
  taskStatus, 
  taskPriority, 
  createTaskSchema as coreCreateTaskSchema,
  updateTaskSchema as coreUpdateTaskSchema,
  taskSchema
} from '@astrolabe/core/dist/schemas/index.js';
import type { Store, TaskService } from '@astrolabe/core';

/**
 * Supported generator types for task generation
 */
export type GeneratorType = 'prd';

/**
 * Supported metadata keys for different generators
 */
export interface PRDMetadata {
  /** Maximum number of tasks to generate */
  maxTasks?: number;
  /** Target complexity level */
  complexity?: 'simple' | 'moderate' | 'complex';
  /** Include implementation details */
  includeDetails?: boolean;
  /** Preferred task priority */
  defaultPriority?: 'low' | 'medium' | 'high';
}

/**
 * Union type for all supported metadata types
 */
export type GeneratorMetadata = PRDMetadata;

/**
 * Logging context for operations
 */
export interface LoggingContext {
  /** Operation being performed */
  operation: string;
  /** Request identifier */
  requestId: string;
  /** Task ID if applicable */
  taskId?: string;
  /** User ID if applicable */
  userId?: string;
  /** Additional operation-specific data */
  operationData?: Record<string, string | number | boolean>;
}

/**
 * Operation result metadata
 */
export interface OperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Number of items affected */
  itemsAffected?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Additional result-specific data */
  resultData?: Record<string, string | number | boolean>;
}

/**
 * Task tree node structure for API responses
 */
export interface TaskTreeNode {
  /** Task identifier */
  id: string;
  /** Task title */
  title: string;
  /** Task description */
  description?: string | null;
  /** Task status */
  status: 'pending' | 'in-progress' | 'done' | 'cancelled' | 'archived';
  /** Task priority */
  priority: 'low' | 'medium' | 'high';
  /** Number of child tasks */
  childCount?: number;
  /** Child task nodes */
  children?: TaskTreeNode[];
  /** Parent task ID */
  parentId?: string | null;
}

/**
 * Generation metadata for API responses
 */
export interface GenerationMetadata {
  /** Generator type used */
  generator: GeneratorType;
  /** Whether tasks were persisted to database */
  persisted: boolean;
  /** Whether hierarchical structure was used */
  hierarchical: boolean;
  /** Total number of tasks generated */
  totalTasks: number;
  /** Root task ID if persisted */
  rootTaskId?: string;
  /** Whether there are pending operations */
  hasPendingOperations?: boolean;
  /** Number of operations applied */
  operationsApplied?: number;
  /** Request identifier */
  requestId: string;
  /** Generation timestamp */
  timestamp: string;
}

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

// Re-export core schemas to maintain API compatibility while eliminating duplication
export const createTaskSchema = coreCreateTaskSchema;
export const updateTaskSchema = coreUpdateTaskSchema;

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
 * Improved schema for generating tasks with proper metadata typing
 */
export const generateTasksSchema = z.object({
  /** Generator type (currently only 'prd' supported) */
  type: z.literal('prd'),
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
  metadata: z.object({
    /** Maximum number of tasks to generate */
    maxTasks: z.number().min(1).max(100).optional(),
    /** Target complexity level */
    complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
    /** Include implementation details */
    includeDetails: z.boolean().optional(),
    /** Preferred task priority */
    defaultPriority: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
  /** Whether to persist the generated tree to database */
  persist: z.boolean().default(false),
  /** Whether to return hierarchical structure (default: true) */
  hierarchical: z.boolean().default(true),
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
 * Improved schema for validating generation input with proper metadata typing
 */
export const validateGenerationInputSchema = z.object({
  /** Generator type to validate against */
  type: z.literal('prd'),
  /** Content to validate */
  content: z.string(),
  /** Optional metadata for validation */
  metadata: z.object({
    /** Maximum number of tasks to generate */
    maxTasks: z.number().min(1).max(100).optional(),
    /** Target complexity level */
    complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
    /** Include implementation details */
    includeDetails: z.boolean().optional(),
    /** Preferred task priority */
    defaultPriority: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
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
