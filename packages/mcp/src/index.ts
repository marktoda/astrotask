#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, type DatabaseOptions, TaskService, DependencyService, createModuleLogger, logShutdown } from '@astrolabe/core';
import {
  MinimalHandlers,
  getNextTaskSchema,
  addTasksSchema,
  listTasksSchema,
  addTaskContextSchema,
  addDependencySchema
} from './handlers/index.js';
import { wrapMCPHandler } from './utils/response.js';

const logger = createModuleLogger('mcp-server');

/**
 * Ultra-Minimal Astrolabe MCP Server
 * Provides only 5 essential tools for AI agent task management
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrolabe-mcp-server',
    version: '0.3.0',
  });

  // Initialize database and services
  const dbOptions: DatabaseOptions = { 
    dataDir: process.env.DATABASE_PATH || 'astrolabe.db',
    verbose: process.env.DB_VERBOSE === 'true'
  };
  const store = await createDatabase(dbOptions);
  const taskService = new TaskService(store);
  const dependencyService = new DependencyService(store);

  // Create handler context
  const handlerContext = {
    store,
    taskService,
    dependencyService,
    requestId: 'main',
    timestamp: new Date().toISOString(),
  };

  // Create minimal handlers
  const handlers = new MinimalHandlers(handlerContext);

  // Register the 5 essential tools
  server.tool('getNextTask',
    getNextTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.getNextTask(args);
    })
  );

  server.tool('addTasks',
    addTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.addTasks(args);
    })
  );

  server.tool('listTasks',
    listTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.listTasks(args);
    })
  );

  server.tool('addTaskContext',
    addTaskContextSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.addTaskContext(args);
    })
  );

  server.tool('addDependency',
    addDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.addDependency(args);
    })
  );

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Astrolabe MCP Server started with 5 tools: getNextTask, addTasks, listTasks, addTaskContext, addDependency');
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
  logger.fatal({ error }, 'Fatal error starting Astrolabe Minimal MCP Server');
  process.exit(1);
});
