import {
  type DatabaseStore,
  type Task,
  TaskService,
  createDatabase,
  taskToApi,
} from '@astrolabe/core';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  ConflictError,
  DatabaseError,
  MCPError,
  NotFoundError,
  ValidationError,
} from './errors/index.js';
import { TaskHandlers, ResponseBuilder, type HandlerContext, type TaskContext } from './handlers/index.js';

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

// ---------------------------------------------------------------------------
// Local utility types
// ---------------------------------------------------------------------------

export class TaskMCPServer {
  private store!: DatabaseStore;
  private taskService!: TaskService;
  private taskHandlers!: TaskHandlers;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize database connection
      const store = await createDatabase({ dbPath: './data/mcp-server.db' });
      this.store = store as DatabaseStore;
      this.taskService = new TaskService(this.store);
      
      // Initialize handlers with context
      const context: HandlerContext = {
        store: this.store,
        taskService: this.taskService,
        requestId: '', // Will be set per request
        timestamp: '', // Will be set per request
      };
      this.taskHandlers = new TaskHandlers(context);
      
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
        description:
          'List tasks with optional filtering by status and project, includes pagination support',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'done', 'cancelled'],
              description: 'Filter tasks by status',
            },
            projectId: {
              type: 'string',
              description: 'Filter tasks by project ID',
            },
            parentId: {
              type: 'string',
              description: 'Filter tasks by parent ID (for subtasks)',
            },
            includeSubtasks: {
              type: 'boolean',
              description: 'Include subtasks in the response',
              default: false,
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'createTask',
        description: 'Create a new task',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Task description',
            },
            parentId: {
              type: 'string',
              description: 'Parent task ID (for subtasks)',
            },
            projectId: {
              type: 'string',
              description: 'Project ID',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'done', 'cancelled'],
              default: 'pending',
              description: 'Initial task status',
            },
            prd: {
              type: 'string',
              description: 'Product Requirements Document content',
            },
            contextDigest: {
              type: 'string',
              description: 'Context digest for the task',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      {
        name: 'updateTask',
        description: 'Update an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to update',
            },
            title: {
              type: 'string',
              description: 'New task title',
            },
            description: {
              type: 'string',
              description: 'New task description',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in-progress', 'done', 'cancelled'],
              description: 'New task status',
            },
            parentId: {
              type: 'string',
              description: 'New parent task ID',
            },
            prd: {
              type: 'string',
              description: 'Product Requirements Document content',
            },
            contextDigest: {
              type: 'string',
              description: 'Context digest for the task',
            },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: 'deleteTask',
        description: 'Delete a task and optionally its subtasks',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to delete',
            },
            cascade: {
              type: 'boolean',
              description: 'Delete all subtasks as well',
              default: true,
            },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: 'completeTask',
        description: 'Mark a task as complete',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to complete',
            },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
      {
        name: 'getTaskContext',
        description: 'Get a task with its full context including ancestors and descendants',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Task ID to get context for',
            },
            includeAncestors: {
              type: 'boolean',
              description: 'Include ancestor tasks',
              default: true,
            },
            includeDescendants: {
              type: 'boolean',
              description: 'Include descendant tasks',
              default: true,
            },
            maxDepth: {
              type: 'number',
              description: 'Maximum depth for descendants',
            },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
    ];
  }

  /**
   * Handle MCP tool calls
   */
  // biome-ignore lint/suspicious/noExplicitAny: MCP interface requires any for tool args
  async callTool(name: string, args: any): Promise<any> {
    this.ensureInitialized();

    try {
      // Update request context
      this.taskHandlers.context.requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      this.taskHandlers.context.timestamp = new Date().toISOString();

      switch (name) {
        case 'listTasks':
          return await this.taskHandlers.listTasks(args);
        case 'createTask':
          return await this.taskHandlers.createTask(args);
        case 'updateTask':
          return await this.taskHandlers.updateTask(args);
        case 'deleteTask':
          return await this.taskHandlers.deleteTask(args);
        case 'completeTask':
          return await this.taskHandlers.completeTask(args);
        case 'getTaskContext':
          return await this.taskHandlers.getTaskContext(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return ResponseBuilder.error(
        error instanceof Error ? error.message : String(error),
        error instanceof MCPError ? error.constructor.name : 'UnknownError',
        error instanceof Error ? { stack: error.stack } : undefined
      );
    }
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
   * Register MCP tools with a high-level McpServer instance
   */
  register(mcp: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer): void {
    // Ensure server is ready before registering tools
    this.ensureInitialized();

    // listTasks tool
    const listTasksShape = {
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).optional(),
      projectId: z.string().uuid().optional(),
      parentId: z.string().uuid().optional(),
      includeSubtasks: z.boolean().default(false),
    } as const;
    // biome-ignore lint/suspicious/noExplicitAny: MCP SDK tool registration requires any for schema shapes
    mcp.tool('listTasks', listTasksShape as any, async (args, _extra) => {
      return (await this.taskHandlers.listTasks(args)) as any;
    });

    // createTask tool
    const createTaskShape = {
      title: z.string().min(1).max(200),
      description: z.string().optional(),
      parentId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).default('pending'),
      prd: z.string().optional(),
      contextDigest: z.string().optional(),
    } as const;
    mcp.tool('createTask', createTaskShape as any, async (args, _extra) => {
      return (await this.taskHandlers.createTask(args)) as any;
    });

    // updateTask tool
    const updateTaskShape = {
      id: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      status: z.enum(['pending', 'in-progress', 'done', 'cancelled']).optional(),
      parentId: z.string().uuid().optional(),
      prd: z.string().optional(),
      contextDigest: z.string().optional(),
    } as const;
    mcp.tool('updateTask', updateTaskShape as any, async (args, _extra) => {
      return (await this.taskHandlers.updateTask(args)) as any;
    });

    // deleteTask tool
    const deleteTaskShape = {
      id: z.string().uuid(),
      cascade: z.boolean().default(true),
    } as const;
    mcp.tool('deleteTask', deleteTaskShape as any, async (args, _extra) => {
      return (await this.taskHandlers.deleteTask(args)) as any;
    });

    // completeTask tool
    const completeTaskShape = {
      id: z.string().uuid(),
    } as const;
    mcp.tool('completeTask', completeTaskShape as any, async (args, _extra) => {
      return (await this.taskHandlers.completeTask(args)) as any;
    });

    // getTaskContext tool
    const getTaskContextShape = {
      id: z.string().uuid(),
      includeAncestors: z.boolean().default(true),
      includeDescendants: z.boolean().default(true),
      maxDepth: z.number().optional(),
    } as const;
    mcp.tool('getTaskContext', getTaskContextShape as any, async (args, _extra) => {
      return (await this.taskHandlers.getTaskContext(args)) as any;
    });
  }
}
