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
  /** Whether to use research mode for expansion */
  research: z.boolean().optional().default(false),
  /** Whether to force replace existing subtasks */
  force: z.boolean().optional().default(false),
});

/**
 * Schema for batch task expansion
 */
export const expandTasksBatchSchema = z.object({
  /** Array of task IDs to expand */
  taskIds: z.array(z.string()).min(1, "At least one task ID required"),
  /** Optional context or instructions for expansion */
  context: z.string().optional(),
  /** Number of subtasks to create per task */
  numSubtasks: z.number().min(1).max(20).optional(),
  /** Whether to use research mode for expansion */
  research: z.boolean().optional().default(false),
  /** Whether to force replace existing subtasks */
  force: z.boolean().optional().default(false),
});

/**
 * Schema for automatically expanding high-complexity tasks
 */
export const expandHighComplexityTasksSchema = z.object({
  /** Complexity threshold for automatic expansion */
  complexityThreshold: z.number().min(1).max(10).optional().default(5),
  /** Whether to use research mode for expansion */
  research: z.boolean().optional().default(false),
  /** Whether to force replace existing subtasks */
  force: z.boolean().optional().default(false),
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
 * Schema for complexity analysis input (for specific node)
 */
export const analyzeNodeComplexitySchema = z.object({
  /** Node ID to analyze (includes all children) */
  nodeId: z.string().min(1, "Node ID cannot be empty"),
  /** Minimum complexity score threshold for expansion recommendations */
  threshold: z.number().min(1).max(10).optional().default(5),
  /** Enable research mode for more accurate analysis */
  research: z.boolean().optional().default(false),
});

/**
 * Schema for complexity analysis input
 */
export const analyzeComplexitySchema = z.object({
  /** Path to tasks file (optional, auto-detected if not provided) */
  file: z.string().optional(),
  /** Minimum complexity score threshold for expansion recommendations */
  threshold: z.number().min(1).max(10).optional().default(5),
  /** Enable research mode for more accurate analysis */
  research: z.boolean().optional().default(false),
});

/**
 * Schema for complexity report viewing input
 */
export const complexityReportSchema = z.object({
  // No parameters needed since we read from database
});

/**
 * TypeScript types inferred from the schemas
 */
export type ParsePRDInput = z.infer<typeof parsePRDSchema>;
export type ExpandTaskInput = z.infer<typeof expandTaskSchema>;
export type ExpandTasksBatchInput = z.infer<typeof expandTasksBatchSchema>;
export type ExpandHighComplexityTasksInput = z.infer<typeof expandHighComplexityTasksSchema>;
export type AddDependencyInput = z.infer<typeof addDependencySchema>;
export type GetNextTaskInput = z.infer<typeof getNextTaskSchema>;
export type AnalyzeNodeComplexityInput = z.infer<typeof analyzeNodeComplexitySchema>;
export type AnalyzeComplexityInput = z.infer<typeof analyzeComplexitySchema>;
export type ComplexityReportInput = z.infer<typeof complexityReportSchema>;
