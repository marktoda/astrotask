#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, type DatabaseOptions, TaskService, createModuleLogger, logShutdown } from '@astrolabe/core';
import {
  TaskHandlers,
  TaskGenerationHandlers,
  listTasksSchema,
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  completeTaskSchema,
  getTaskContextSchema,
  generateTasksSchema,
  listGeneratorsSchema,
  validateGenerationInputSchema
} from './handlers/index.js';

const logger = createModuleLogger('mcp-server');

/**
 * Wraps handler responses in the standard MCP response format
 */
function wrapMCPResponse<T>(data: T, isError: boolean = false) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
      }
    ],
    isError
  };
}

/**
 * Wraps error information in the standard MCP response format
 */
function wrapMCPError(error: unknown, context?: string) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: fullMessage }, null, 2)
      }
    ],
    isError: true
  };
}

/**
 * Generic wrapper for MCP tool handlers that adds error handling and response formatting
 */
function wrap<T extends any[], R>(handler: (...args: T) => Promise<R>) {
  return async (...args: T) => {
    try {
      const result = await handler(...args);
      return wrapMCPResponse(result);
    } catch (error) {
      return wrapMCPError(error);
    }
  };
}

/**
 * Main entry point for the Astrolabe MCP Server
 * Provides task management capabilities over MCP protocol
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrolabe-mcp-server',
    version: '0.1.0',
  });

  // Initialize database and services - createDatabase returns a Store directly
  const dbOptions: DatabaseOptions = { dbPath: 'mcp.db' };
  const store = await createDatabase(dbOptions);

  // Create TaskService with the store
  const taskService = new TaskService(store);

  // Create handler context
  const handlerContext = {
    store,
    taskService,
    requestId: 'main',
    timestamp: new Date().toISOString(),
  };

  // Create task handlers with context
  const taskHandlers = new TaskHandlers(handlerContext);
  const taskGenerationHandlers = new TaskGenerationHandlers(handlerContext);

  // Register core task management tools
  server.tool('listTasks',
    listTasksSchema.shape,
    wrap(async (args) => {
      return taskHandlers.listTasks(args);
    })
  );

  server.tool('createTask',
    createTaskSchema.shape,
    wrap(async (args) => {
      return taskHandlers.createTask(args);
    })
  );

  server.tool('updateTask',
    updateTaskSchema.shape,
    wrap(async (args) => {
      return taskHandlers.updateTask(args);
    })
  );

  server.tool('deleteTask',
    deleteTaskSchema.shape,
    wrap(async (args) => {
      return taskHandlers.deleteTask(args);
    })
  );

  server.tool('completeTask',
    completeTaskSchema.shape,
    wrap(async (args) => {
      return taskHandlers.completeTask(args);
    })
  );

  server.tool('getTaskContext',
    getTaskContextSchema.shape,
    wrap(async (args) => {
      return taskHandlers.getTaskContext(args);
    })
  );

  // Register task generation tools
  server.tool('generateTasks',
    generateTasksSchema.shape,
    wrap(async (args) => {
      return taskGenerationHandlers.generateTasks(args);
    })
  );

  server.tool('listGenerators',
    listGeneratorsSchema.shape,
    wrap(async (args) => {
      return taskGenerationHandlers.listGenerators(args);
    })
  );

  server.tool('validateGenerationInput',
    validateGenerationInputSchema.shape,
    wrap(async (args) => {
      return taskGenerationHandlers.validateGenerationInput(args);
    })
  );

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Astrolabe MCP Server started successfully with task generation support');
}

// Handle cleanup on process termination
process.on('SIGINT', async () => {
  await logShutdown(logger, 'SIGINT');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await logShutdown(logger, 'SIGTERM');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  logger.fatal({ error }, 'Fatal error starting Astrolabe MCP Server');
  process.exit(1);
});
