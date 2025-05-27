/**
 * Type definitions for MCP handler system
 */

import type { DatabaseStore, TaskService } from '@astrolabe/core';

/**
 * Context passed to all handlers containing shared dependencies
 */
export interface HandlerContext {
  store: DatabaseStore;
  taskService: TaskService;
  requestId: string;
  timestamp: string;
}

/**
 * Standard MCP response format
 */
export interface MCPResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Base interface for all MCP handlers
 */
export interface MCPHandler {
  readonly context: HandlerContext;
}

/**
 * Input types for task operations
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  parentId?: string;
  projectId?: string;
  status?: 'pending' | 'in-progress' | 'done' | 'cancelled';
  prd?: string;
  contextDigest?: string;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  status?: 'pending' | 'in-progress' | 'done' | 'cancelled';
  parentId?: string;
  prd?: string;
  contextDigest?: string;
}

export interface DeleteTaskInput {
  id: string;
  cascade?: boolean;
}

export interface CompleteTaskInput {
  id: string;
}

export interface GetTaskContextInput {
  id: string;
  includeAncestors?: boolean;
  includeDescendants?: boolean;
  maxDepth?: number;
}

export interface ListTasksInput {
  status?: 'pending' | 'in-progress' | 'done' | 'cancelled';
  projectId?: string;
  parentId?: string;
  includeSubtasks?: boolean;
} 