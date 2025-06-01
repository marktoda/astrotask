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
  addDependencySchema,
  updateStatusSchema
} from './handlers/index.js';
import { wrapMCPHandler } from './utils/response.js';

const logger = createModuleLogger('mcp-server');

/**
 * Ultra-Minimal Astrolabe MCP Server
 * Provides only 6 essential tools for AI agent task management
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrolabe-mcp-server',
    version: '0.3.0',
  });

  // Initialize database and services
  const dbOptions: DatabaseOptions = { 
    dataDir: process.env.DATABASE_PATH || './data/astrolabe.db',
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

  // Register the 5 essential tools with enhanced schema documentation
  // The schemas now include comprehensive .describe() calls for better AI agent understanding
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

  server.tool('updateStatus',
    updateStatusSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.updateStatus(args);
    })
  );

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Astrolabe MCP Server started with 6 enhanced tools: getNextTask, addTasks, listTasks, addTaskContext, addDependency, updateStatus');

  // Set up graceful shutdown with database cleanup
  const setupShutdownHandlers = () => {
    const handleShutdown = async (signal: string) => {
      await logShutdown(logger, signal, async () => {
        logger.info('Closing database connection...');
        try {
          await store.close();
          logger.info('Database connection closed successfully');
        } catch (error) {
          logger.error('Failed to close database connection', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      });
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception, shutting down');
      handleShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      logger.fatal({ reason }, 'Unhandled rejection, shutting down');
      handleShutdown('unhandledRejection');
    });
  };

  setupShutdownHandlers();
}

// Start the server
main().catch((error) => {
  logger.fatal({ error }, 'Fatal error starting Astrolabe Minimal MCP Server');
  process.exit(1);
});
