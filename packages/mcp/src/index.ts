#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, type DatabaseOptions, TaskService } from '@astrolabe/core';
import {
  TaskHandlers,
  listTasksSchema,
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  completeTaskSchema,
  getTaskContextSchema
} from './handlers/index.js';

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

  // Create task handlers with context
  const taskHandlers = new TaskHandlers({
    store,
    taskService,
    requestId: 'main',
    timestamp: new Date().toISOString(),
  });

  // Register tools using simple object notation as shown in MCP docs
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

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Astrolabe MCP Server started successfully');
}

// Handle cleanup on process termination
process.on('SIGINT', async () => {
  console.error('Shutting down Astrolabe MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down Astrolabe MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Fatal error starting Astrolabe MCP Server:', error);
  process.exit(1);
});
