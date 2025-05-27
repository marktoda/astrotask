/**
 * Task operation handlers for MCP Server
 * 
 * Extracted from the main server class to improve separation of concerns
 * and reduce file size. Provides clean, focused handlers for each task operation.
 */

import {
  type DatabaseStore,
  type Task,
  TaskService,
  taskToApi,
} from '@astrolabe/core';
import { z } from 'zod';
import {
  ConflictError,
  DatabaseError,
  MCPError,
  NotFoundError,
  ValidationError,
} from '../errors/index.js';
import {
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  getTaskContextSchema,
  listTasksSchema,
  updateTaskSchema,
  validateInput,
} from '../validation/index.js';
import { ResponseBuilder } from './ResponseBuilder.js';
import type {
  CompleteTaskInput,
  CreateTaskInput,
  DeleteTaskInput,
  GetTaskContextInput,
  HandlerContext,
  ListTasksInput,
  MCPHandler,
  MCPResponse,
  UpdateTaskInput,
} from './types.js';

/**
 * Task context interface for getTaskContext operation
 */
export interface TaskContext {
  task: Task;
  ancestors: Task[];
  descendants: Task[];
  relatedTasks: {
    dependencies: Task[];
    dependents: Task[];
    references: Task[];
  };
  metadata: {
    depth: number;
    totalDescendants: number;
    isRoot: boolean;
    hasChildren: boolean;
    retrievalTimestamp?: string;
    maxDepthApplied?: number | undefined;
  };
}

export class TaskHandlers implements MCPHandler {
  readonly context: HandlerContext;

  constructor(context: HandlerContext) {
    this.context = context;
  }

  /**
   * List tasks with filtering and pagination
   */
  async listTasks(args: unknown): Promise<MCPResponse> {
    const params = validateInput(listTasksSchema, args) as ListTasksInput;
    let tasks: Task[];

    if (params.parentId) {
      // Get subtasks of a specific parent
      tasks = await this.context.store.listSubtasks(params.parentId);
    } else if (params.status) {
      // Filter by status
      tasks = await this.context.store.listTasksByStatus(params.status, params.projectId);
    } else {
      // Get all tasks or filter by project
      tasks = await this.context.store.listTasks(params.projectId);
    }

    // If including subtasks, get the task trees
    let result = tasks;
    if (params.includeSubtasks) {
      const taskTrees = await Promise.all(
        tasks.map((task) => this.context.taskService.getTaskTree(task.id))
      );
      // Filter out null values and convert TaskTree to Task by extracting base properties
      result = taskTrees
        .filter((tree): tree is NonNullable<typeof tree> => tree !== null)
        .map((tree) => {
          // Extract Task properties from TaskTree (excluding children)
          const { children, ...taskProps } = tree;
          return taskProps;
        });
    }

    // Convert to API format
    const apiTasks = result.map(taskToApi);
    return ResponseBuilder.taskListSuccess(apiTasks);
  }

  /**
   * Create a new task
   */
  async createTask(args: unknown): Promise<MCPResponse> {
    const params = validateInput(createTaskSchema, args) as CreateTaskInput;
    
    // Ensure status has a default value
    const taskData = {
      ...params,
      status: params.status ?? 'pending' as const,
    };
    
    const task = await this.context.store.addTask(taskData);
    const apiTask = taskToApi(task);

    return ResponseBuilder.taskSuccess(apiTask);
  }

  /**
   * Update an existing task
   */
  async updateTask(args: unknown): Promise<MCPResponse> {
    const params = validateInput(updateTaskSchema, args) as UpdateTaskInput;
    const { id, ...updates } = params;

    // Filter out undefined values to avoid TypeScript issues
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    ) as Partial<Omit<Task, 'id' | 'createdAt'>>;

    const task = await this.context.store.updateTask(id, filteredUpdates);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    const apiTask = taskToApi(task);
    return ResponseBuilder.taskSuccess(apiTask);
  }

  /**
   * Delete a task (with optional cascade to subtasks)
   */
  async deleteTask(args: unknown): Promise<MCPResponse> {
    const validatedInput = validateInput(deleteTaskSchema, args) as DeleteTaskInput;

    try {
      let success: boolean;
      if (validatedInput.cascade) {
        success = await this.context.taskService.deleteTaskTree(validatedInput.id, true);
      } else {
        success = await this.context.store.deleteTask(validatedInput.id);
      }

      if (!success) {
        throw new NotFoundError('Task', validatedInput.id);
      }

      return ResponseBuilder.deleteSuccess(validatedInput.id, validatedInput.cascade);
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      // Convert database errors to appropriate MCP errors
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Task', validatedInput.id);
        }
        if (error.message.includes('constraint') || error.message.includes('foreign key')) {
          throw new ConflictError('Task', 'dependencies', validatedInput.id, {
            reason: 'Cannot delete task due to existing dependencies',
          });
        }
        throw new DatabaseError('task deletion', error);
      }

      throw new DatabaseError('task deletion');
    }
  }

  /**
   * Mark a task as complete
   */
  async completeTask(args: unknown): Promise<MCPResponse> {
    const validatedInput = validateInput(completeTaskSchema, args) as CompleteTaskInput;

    try {
      const task = await this.context.store.updateTaskStatus(validatedInput.id, 'done');

      if (!task) {
        throw new NotFoundError('Task', validatedInput.id);
      }

      const apiTask = taskToApi(task);
      return ResponseBuilder.taskSuccess(apiTask);
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      // Convert database errors to appropriate MCP errors
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Task', validatedInput.id);
        }
        if (error.message.includes('constraint') || error.message.includes('foreign key')) {
          throw new ConflictError('Task', 'status', 'done', {
            reason: 'Cannot complete task due to existing constraints',
            taskId: validatedInput.id,
          });
        }
        throw new DatabaseError('task completion', error);
      }

      throw new DatabaseError('task completion');
    }
  }

  /**
   * Get comprehensive task context including ancestors, descendants, and related tasks
   */
  async getTaskContext(args: unknown): Promise<MCPResponse> {
    try {
      const validatedArgs = validateInput(getTaskContextSchema, args) as GetTaskContextInput;
      const { id, includeAncestors, includeDescendants, maxDepth } = validatedArgs;

      // Check if task exists first
      const task = await this.context.store.getTask(id);
      if (!task) {
        throw new NotFoundError('Task', id);
      }

      // Initialize context with the target task
      const context: TaskContext = {
        task,
        ancestors: [],
        descendants: [],
        relatedTasks: {
          dependencies: [], // Tasks this task depends on
          dependents: [], // Tasks that depend on this task
          references: [], // Tasks that reference this task
        },
        metadata: {
          depth: 0,
          totalDescendants: 0,
          isRoot: !task.parentId,
          hasChildren: false,
        },
      };

      // Circular dependency detection set
      const visitedIds = new Set<string>();
      visitedIds.add(id);

      // Get ancestors if requested
      if (includeAncestors) {
        try {
          context.ancestors = await this.context.taskService.getTaskAncestors(id);
          context.metadata.depth = context.ancestors.length;
          context.metadata.isRoot = context.ancestors.length === 0;
        } catch (error) {
          console.warn(`Failed to retrieve ancestors for task ${id}:`, error);
          // Continue with empty ancestors rather than failing
        }
      }

      // Get descendants if requested
      if (includeDescendants) {
        try {
          // Use TaskService with maxDepth support for performance
          const taskTree = await this.context.taskService.getTaskTree(id, maxDepth);
          if (taskTree) {
            // Flatten the tree structure to get all descendants
            const flattenDescendants = (tree: Task & { children?: Task[] }): Task[] => {
              const descendants: Task[] = [];
              const stack = [...((tree.children ?? []) as Task[])];

              while (stack.length > 0) {
                const current = stack.pop() as Task & { children?: Task[] };
                // Check for circular references
                if (!visitedIds.has(current.id)) {
                  visitedIds.add(current.id);
                  descendants.push(current);
                  // Add children to stack for further processing
                  if (current.children && current.children.length > 0) {
                    stack.push(...(current.children as Task[]));
                  }
                } else {
                  console.warn(`Circular reference detected: task ${current.id} already visited`);
                }
              }

              return descendants;
            };

            context.descendants = flattenDescendants(taskTree);
            context.metadata.totalDescendants = context.descendants.length;
            context.metadata.hasChildren = (taskTree.children ?? []).length > 0;
          }
        } catch (error) {
          console.warn(`Failed to retrieve descendants for task ${id}:`, error);
          // Continue with empty descendants rather than failing
        }
      }

      // Get related tasks through dependencies
      try {
        // TODO: Implement when dependency schema is available
        console.info(`Dependency relationships not yet implemented for task ${id}`);

        context.relatedTasks = {
          dependencies: [],
          dependents: [],
          references: [],
        };
      } catch (error) {
        console.warn(`Failed to retrieve related tasks for task ${id}:`, error);
        context.relatedTasks = {
          dependencies: [],
          dependents: [],
          references: [],
        };
      }

      // Add performance metadata
      context.metadata.retrievalTimestamp = new Date().toISOString();
      context.metadata.maxDepthApplied = maxDepth;

      return ResponseBuilder.contextSuccess(context);
    } catch (error) {
      // Use proper error handling instead of generic Error
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error; // Re-throw known MCP errors
      }

      // Convert unexpected errors to DatabaseError
      console.error('Unexpected error in getTaskContext:', error);
      throw new DatabaseError(
        `Failed to retrieve context for task: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
} 