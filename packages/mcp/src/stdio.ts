#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAstrotask, createModuleLogger, logShutdown, cfg } from '@astrotask/core';
import {
  MinimalHandlers,
  getNextTaskSchema,
  getTaskSchema,
  addTasksSchema,
  listTasksSchema,
  addTaskContextSchema,
  addDependencySchema,
  updateStatusSchema,
  deleteTaskSchema
} from './handlers/index.js';
import { wrapMCPHandler } from './utils/response.js';

const logger = createModuleLogger('mcp-server-stdio');

/**
 * Astrotask MCP Server with Stdio Transport
 * Provides 6 essential tools for AI agent task management via stdio
 * Designed for local development and direct process communication
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrotask-mcp-server',
    version: '0.3.0',
  });

  // Create Astrotask SDK instance with configuration
  const databaseUrl = cfg.DATABASE_URI;
  const debug = cfg.DB_VERBOSE;
  
  const astrotask = await createAstrotask({
    databaseUrl,
    debug,
  });
  
  logger.info('Astrotask SDK initialized successfully', { databaseUrl, debug });

  // Create handler context factory
  const createHandlerContext = () => ({
    astrotask,
    requestId: 'stdio',
    timestamp: new Date().toISOString(),
  });

  // Register the 7 essential tools with enhanced schema documentation
  server.tool('getNextTask',
    getNextTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.getNextTask(args);
    })
  );

  server.tool('getTask',
    getTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.getTask(args);
    })
  );

  server.tool('addTasks',
    addTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.addTasks(args);
    })
  );

  server.tool('listTasks',
    listTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.listTasks(args);
    })
  );

  server.tool('addTaskContext',
    addTaskContextSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.addTaskContext(args);
    })
  );

  server.tool('addDependency',
    addDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.addDependency(args);
    })
  );

  server.tool('updateStatus',
    updateStatusSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.updateStatus(args);
    })
  );

  server.tool('deleteTask',
    deleteTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.deleteTask(args);
    })
  );

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Astrotask MCP Server (stdio) started with 8 enhanced tools: getNextTask, getTask, addTasks, listTasks, addTaskContext, addDependency, updateStatus, deleteTask');

  // Set up graceful shutdown with Astrotask SDK cleanup
  const setupShutdownHandlers = () => {
    const handleShutdown = async (signal: string) => {
      await logShutdown(logger, signal, async () => {
        logger.info('Disposing Astrotask SDK...');
        try {
          await astrotask.dispose();
          logger.info('Astrotask SDK disposed successfully');
        } catch (error) {
          logger.error('Failed to dispose Astrotask SDK', { 
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
  logger.fatal({ error }, 'Fatal error starting Astrotask MCP Server (stdio)');
  process.exit(1);
}); 