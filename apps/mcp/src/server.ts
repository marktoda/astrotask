import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { DatabaseStore } from '../../../src/database/store.js';
import { TaskService } from '../../../src/core/services/TaskService.js';
import { createDatabase } from '../../../src/database/index.js';
import type { Task, TaskStatus } from '../../../src/schemas/task.js';
import { taskToApi } from '../../../src/schemas/task.js';
import { 
  MCPError, 
  ValidationError, 
  NotFoundError, 
  ConflictError, 
  DatabaseError 
} from './errors/index.js';
import { 
  validateInput, 
  deleteTaskSchema, 
  completeTaskSchema 
} from './validation/index.js';
import { 
  createStandardMiddlewareStack, 
  type RequestContext 
} from './middleware/index.js';

/**
 * TaskMCPServer - Core implementation of the MCP server for Astrolabe task management
 * 
 * Provides the following capabilities:
 * - listTasks: List tasks with filtering and pagination
 * - createTask: Create new tasks
 * - updateTask: Update existing tasks
 * - deleteTask: Delete tasks
 * - completeTask: Mark tasks as complete
 * - getTaskContext: Get task with ancestry information
 */
export class TaskMCPServer {
  private store!: DatabaseStore;
  private taskService!: TaskService;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize database connection
      const store = await createDatabase({ dbPath: './data/mcp-server.db' });
      this.store = store as DatabaseStore;
      this.taskService = new TaskService(this.store);
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize TaskMCPServer: ${error}`);
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('TaskMCPServer not initialized. Call initialize() first.');
    }
  }

  /**
   * Get all available MCP tools/functions
   */
  async getTools(): Promise<Tool[]> {
    return [
      {
        name: 'listTasks',
        description: 'List tasks with optional filtering by status and project, includes pagination support',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'done', 'cancelled'],
              description: 'Filter tasks by status'
            },
            projectId: {
              type: 'string',
              description: 'Filter tasks by project ID'
            },
            parentId: {
              type: 'string',
              description: 'Filter tasks by parent ID (for subtasks)'
            },
            includeSubtasks: {
              type: 'boolean',
              description: 'Include subtasks in the response',
              default: false
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'createTask',
        description: 'Create a new task',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title'
            },
            description: {
              type: 'string',
              description: 'Task description'
            },
            parentId: {
              type: 'string',
              description: 'Parent task ID (for subtasks)'
            },
            projectId: {
              type: 'string',
              description: 'Project ID'
            },
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'done', 'cancelled'],
              default: 'pending',
              description: 'Initial task status'
            },
            prd: {
              type: 'string',
              description: 'Product Requirements Document content'
            },
            contextDigest: {
              type: 'string',
              description: 'Context digest for the task'
            }
          },
          required: ['title'],
          additionalProperties: false
        }
      },
      {
        name: 'updateTask',
        description: 'Update an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to update'
            },
            title: {
              type: 'string',
              description: 'New task title'
            },
            description: {
              type: 'string',
              description: 'New task description'
            },
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'done', 'cancelled'],
              description: 'New task status'
            },
            parentId: {
              type: 'string',
              description: 'New parent task ID'
            },
            prd: {
              type: 'string',
              description: 'Product Requirements Document content'
            },
            contextDigest: {
              type: 'string',
              description: 'Context digest for the task'
            }
          },
          required: ['id'],
          additionalProperties: false
        }
      },
      {
        name: 'deleteTask',
        description: 'Delete a task and optionally its subtasks',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to delete'
            },
            cascade: {
              type: 'boolean',
              description: 'Delete all subtasks as well',
              default: true
            }
          },
          required: ['id'],
          additionalProperties: false
        }
      },
      {
        name: 'completeTask',
        description: 'Mark a task as complete',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to complete'
            }
          },
          required: ['id'],
          additionalProperties: false
        }
      },
      {
        name: 'getTaskContext',
        description: 'Get a task with its full context including ancestors and descendants',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to get context for'
            },
            includeAncestors: {
              type: 'boolean',
              description: 'Include ancestor tasks',
              default: true
            },
            includeDescendants: {
              type: 'boolean',
              description: 'Include descendant tasks',
              default: true
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth for descendants'
            }
          },
          required: ['id'],
          additionalProperties: false
        }
      }
    ];
  }

  /**
   * Handle MCP tool calls
   */
  async callTool(name: string, args: any): Promise<any> {
    this.ensureInitialized();

    try {
      switch (name) {
        case 'listTasks':
          return await this.handleListTasks(args);
        case 'createTask':
          return await this.handleCreateTask(args);
        case 'updateTask':
          return await this.handleUpdateTask(args);
        case 'deleteTask':
          return await this.handleDeleteTask(args);
        case 'completeTask':
          return await this.handleCompleteTask(args);
        case 'getTaskContext':
          return await this.handleGetTaskContext(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * List tasks with filtering and pagination
   */
  private async handleListTasks(args: any) {
    const schema = z.object({
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).optional(),
      projectId: z.string().uuid().optional(),
      parentId: z.string().uuid().optional(),
      includeSubtasks: z.boolean().default(false)
    });

    const params = schema.parse(args);
    let tasks: Task[];

    if (params.parentId) {
      // Get subtasks of a specific parent
      tasks = await this.store.listSubtasks(params.parentId);
    } else if (params.status) {
      // Filter by status
      tasks = await this.store.listTasksByStatus(params.status, params.projectId);
    } else {
      // Get all tasks or filter by project
      tasks = await this.store.listTasks(params.projectId);
    }

    // If including subtasks, get the task trees
    let result = tasks;
    if (params.includeSubtasks) {
      const taskTrees = await Promise.all(
        tasks.map(task => this.taskService.getTaskTree(task.id))
      );
      result = taskTrees.filter(tree => tree !== null) as Task[];
    }

    // Convert to API format
    const apiTasks = result.map(taskToApi);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            tasks: apiTasks,
            count: apiTasks.length
          }, null, 2)
        }
      ]
    };
  }

  /**
   * Create a new task
   */
  private async handleCreateTask(args: any) {
    const schema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      parentId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).default('pending'),
      prd: z.string().optional(),
      contextDigest: z.string().optional()
    });

    const params = schema.parse(args);
    const task = await this.store.addTask(params);
    const apiTask = taskToApi(task);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            task: apiTask
          }, null, 2)
        }
      ]
    };
  }

  /**
   * Update an existing task
   */
  private async handleUpdateTask(args: any) {
    const schema = z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).optional(),
      parentId: z.string().uuid().optional(),
      prd: z.string().optional(),
      contextDigest: z.string().optional()
    });

    const params = schema.parse(args);
    const { id, ...updates } = params;
    
    // Filter out undefined values to avoid TypeScript issues
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    ) as Partial<Omit<Task, 'id' | 'createdAt'>>;
    
    const task = await this.store.updateTask(id, filteredUpdates);
    if (!task) {
      throw new Error(`Task with ID ${id} not found`);
    }

    const apiTask = taskToApi(task);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            task: apiTask
          }, null, 2)
        }
      ]
    };
  }

  /**
   * Delete a task (with optional cascade to subtasks)
   */
  private async handleDeleteTask(args: any) {
    // Use new validation framework
    const validatedInput = validateInput(deleteTaskSchema, args);
    
    try {
      let success: boolean;
      if (validatedInput.cascade) {
        success = await this.taskService.deleteTaskTree(validatedInput.id, true);
      } else {
        success = await this.store.deleteTask(validatedInput.id);
      }

      if (!success) {
        throw new NotFoundError('Task', validatedInput.id);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Task ${validatedInput.id} deleted${validatedInput.cascade ? ' with all subtasks' : ''}`
            }, null, 2)
          }
        ]
      };
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
            reason: 'Cannot delete task due to existing dependencies' 
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
  private async handleCompleteTask(args: any) {
    // Use new validation framework
    const validatedInput = validateInput(completeTaskSchema, args);
    
    try {
      const task = await this.store.updateTaskStatus(validatedInput.id, 'done');
      
      if (!task) {
        throw new NotFoundError('Task', validatedInput.id);
      }

      const apiTask = taskToApi(task);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              task: apiTask
            }, null, 2)
          }
        ]
      };
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
            taskId: validatedInput.id 
          });
        }
        throw new DatabaseError('task completion', error);
      }
      
      throw new DatabaseError('task completion');
    }
  }

  /**
   * Get task with full context (ancestors and descendants)
   */
  private async handleGetTaskContext(args: any) {
    const schema = z.object({
      id: z.string().uuid(),
      includeAncestors: z.boolean().default(true),
      includeDescendants: z.boolean().default(true),
      maxDepth: z.number().optional()
    });

    const params = schema.parse(args);
    
    const task = await this.store.getTask(params.id);
    if (!task) {
      throw new Error(`Task with ID ${params.id} not found`);
    }

    const context: any = {
      task: taskToApi(task)
    };

    if (params.includeAncestors) {
      const ancestors = await this.taskService.getTaskAncestors(params.id);
      context.ancestors = ancestors.map(taskToApi);
    }

    if (params.includeDescendants) {
      const taskTree = await this.taskService.getTaskTree(params.id, params.maxDepth);
      if (taskTree) {
        context.descendants = taskTree.children;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(context, null, 2)
        }
      ]
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.store) {
      await this.store.close();
    }
  }

  /**
   * Register this TaskMCPServer's tools with a high-level `McpServer` instance
   * from `@modelcontextprotocol/sdk`. This bridges our internal business logic
   * (implemented in the `handle*` methods) with the convenience API exposed by
   * the SDK so that callers can invoke the tools directly over the MCP
   * protocol without us having to manually handle the low-level request
   * schemas.
   *
   * NOTE: You must call `initialize()` before invoking this method so the
   * underlying database service is ready.
   */
  register(mcp: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer): void {
    // Ensure server is ready before registering tools
    this.ensureInitialized();

    // listTasks tool
    const listTasksShape = {
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).optional(),
      projectId: z.string().uuid().optional(),
      parentId: z.string().uuid().optional(),
      includeSubtasks: z.boolean().default(false)
    } as const;

    mcp.tool('listTasks', listTasksShape as any, async (args, _extra) => {
      return (await this.handleListTasks(args)) as any;
    });

    // createTask tool
    const createTaskShape = {
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      parentId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).default('pending'),
      prd: z.string().optional(),
      contextDigest: z.string().optional()
    } as const;

    mcp.tool('createTask', createTaskShape as any, async (args, _extra) => {
      return (await this.handleCreateTask(args)) as any;
    });

    // updateTask tool
    const updateTaskShape = {
      id: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).optional(),
      parentId: z.string().uuid().optional(),
      prd: z.string().optional(),
      contextDigest: z.string().optional()
    } as const;

    mcp.tool('updateTask', updateTaskShape as any, async (args, _extra) => {
      return (await this.handleUpdateTask(args)) as any;
    });

    // deleteTask tool
    const deleteTaskShape = {
      id: z.string().uuid(),
      cascade: z.boolean().default(true)
    } as const;

    mcp.tool('deleteTask', deleteTaskShape as any, async (args, _extra) => {
      return (await this.handleDeleteTask(args)) as any;
    });

    // completeTask tool
    const completeTaskShape = {
      id: z.string().uuid()
    } as const;

    mcp.tool('completeTask', completeTaskShape as any, async (args, _extra) => {
      return (await this.handleCompleteTask(args)) as any;
    });

    // getTaskContext tool
    const getTaskContextShape = {
      id: z.string().uuid(),
      includeAncestors: z.boolean().default(true),
      includeDescendants: z.boolean().default(true),
      maxDepth: z.number().optional()
    } as const;

    mcp.tool('getTaskContext', getTaskContextShape as any, async (args, _extra) => {
      return (await this.handleGetTaskContext(args)) as any;
    });
  }
} 