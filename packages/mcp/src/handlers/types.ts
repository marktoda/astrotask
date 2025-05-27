/**
 * Type definitions for MCP handler system
 */

import { z } from 'zod';
import type { Store, TaskService } from '@astrolabe/core';

/**
 * Context passed to all handlers containing shared dependencies
 */
export interface HandlerContext {
  store: Store;
  taskService: TaskService;
  requestId: string;
  timestamp: string;
}

/**
 * Base interface for all MCP handlers
 */
export interface MCPHandler {
  readonly context: HandlerContext;
}

// Task status enum for consistency
const taskStatus = z.enum(['pending', 'in-progress', 'done', 'cancelled']);

export const createTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  parentId: z.string().optional(),
  status: taskStatus.default('pending'),
  prd: z.string().optional(),
  contextDigest: z.string().optional(),
});

export const updateTaskSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: taskStatus.optional(),
  parentId: z.string().optional(),
  prd: z.string().optional(),
  contextDigest: z.string().optional(),
});

export const deleteTaskSchema = z.object({
  id: z.string(),
  cascade: z.boolean().default(false),
});

export const completeTaskSchema = z.object({
  id: z.string(),
});

export const getTaskContextSchema = z.object({
  id: z.string(),
  includeAncestors: z.boolean().default(false),
  includeDescendants: z.boolean().default(false),
  maxDepth: z.number().default(3),
});

export const listTasksSchema = z.object({
  status: taskStatus.optional(),
  projectId: z.string().optional(),
  parentId: z.string().optional(),
  includeSubtasks: z.boolean().default(false),
});

/**
 * Input types for task operations
 */
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type DeleteTaskInput = z.infer<typeof deleteTaskSchema>;
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;
export type GetTaskContextInput = z.infer<typeof getTaskContextSchema>;
export type ListTasksInput = z.infer<typeof listTasksSchema>;
