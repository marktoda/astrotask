/**
 * @fileoverview Ultra-minimal type definitions for MCP handler system
 * 
 * This module defines only the essential types and schemas needed for
 * the 4 core MCP tools: parsePRD, expandTask, addDependency, getNextTask
 * 
 * @module handlers/types
 * @since 2.0.0
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
 * Schema for parsing PRD to generate initial tasks
 */
export const parsePRDSchema = z.object({
  /** PRD content to parse */
  content: z.string().min(1, "Content cannot be empty"),
  /** Optional parent task ID for generated tasks */
  parentTaskId: z.string().optional(),
  /** Maximum number of tasks to generate */
  maxTasks: z.number().min(1).max(100).optional(),
});

/**
 * Schema for expanding a task into subtasks
 */
export const expandTaskSchema = z.object({
  /** Task ID to expand */
  taskId: z.string(),
  /** Optional context or instructions for expansion */
  context: z.string().optional(),
  /** Number of subtasks to create */
  numSubtasks: z.number().min(1).max(20).optional(),
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
 * Schema for getting the next available task
 */
export const getNextTaskSchema = z.object({
  /** Optional status filter */
  status: taskStatus.optional(),
  /** Optional priority filter */
  priority: taskPriority.optional(),
});

/**
 * TypeScript types inferred from the schemas
 */
export type ParsePRDInput = z.infer<typeof parsePRDSchema>;
export type ExpandTaskInput = z.infer<typeof expandTaskSchema>;
export type AddDependencyInput = z.infer<typeof addDependencySchema>;
export type GetNextTaskInput = z.infer<typeof getNextTaskSchema>;
