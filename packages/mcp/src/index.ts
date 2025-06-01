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
import { createConnectionManager } from './utils/connectionManager.js';

const logger = createModuleLogger('mcp-server');

/**
 * Ultra-Minimal Astrolabe MCP Server
 * Provides only 6 essential tools for AI agent task management
 * Now with enhanced cooperative locking for better concurrent access
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrolabe-mcp-server',
    version: '0.3.0',
  });

  // Initialize database options with cooperative locking
  const dbOptions: DatabaseOptions = { 
    dataDir: process.env.DATABASE_PATH || './data/astrolabe.db',
    verbose: process.env.DB_VERBOSE === 'true',
    enableLocking: true,
    lockOptions: {
      processType: 'mcp-server',
      // MCP servers can use shorter timeouts since operations are typically brief
      maxRetries: 30,  // 3 seconds total timeout (30 * 100ms)
      retryDelay: 100,
      staleTimeout: 45000,  // 45 seconds - longer for server processes
    }
  };

  // Create connection manager for smart resource management
  const connectionManager = createConnectionManager(dbOptions);

  // Create services that will use the connection manager
  let taskService: TaskService;
  let dependencyService: DependencyService;

  // Initialize services with initial connection
  const initialStore = await connectionManager.getConnection();
  taskService = new TaskService(initialStore);
  dependencyService = new DependencyService(initialStore);

  // Create handler context factory that uses connection manager
  const createHandlerContext = () => ({
    store: initialStore, // This will be replaced by connection manager in handlers
    taskService,
    dependencyService,
    requestId: 'main',
    timestamp: new Date().toISOString(),
    connectionManager, // Add connection manager to context
  });

  // Create minimal handlers
  const handlers = new MinimalHandlers(createHandlerContext());

  // Register the 5 essential tools with enhanced schema documentation
  // The schemas now include comprehensive .describe() calls for better AI agent understanding
  server.tool('getNextTask',
    getNextTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return connectionManager.withConnection(async (store) => {
        const context = createHandlerContext();
        context.store = store;
        const handlersWithContext = new MinimalHandlers(context);
        return handlersWithContext.getNextTask(args);
      });
    })
  );

  server.tool('addTasks',
    addTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return connectionManager.withConnection(async (store) => {
        const context = createHandlerContext();
        context.store = store;
        const handlersWithContext = new MinimalHandlers(context);
        return handlersWithContext.addTasks(args);
      });
    })
  );

  server.tool('listTasks',
    listTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return connectionManager.withConnection(async (store) => {
        const context = createHandlerContext();
        context.store = store;
        const handlersWithContext = new MinimalHandlers(context);
        return handlersWithContext.listTasks(args);
      });
    })
  );

  server.tool('addTaskContext',
    addTaskContextSchema.shape,
    wrapMCPHandler(async (args) => {
      return connectionManager.withConnection(async (store) => {
        const context = createHandlerContext();
        context.store = store;
        const handlersWithContext = new MinimalHandlers(context);
        return handlersWithContext.addTaskContext(args);
      });
    })
  );

  server.tool('addDependency',
    addDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      return connectionManager.withConnection(async (store) => {
        const context = createHandlerContext();
        context.store = store;
        const handlersWithContext = new MinimalHandlers(context);
        return handlersWithContext.addDependency(args);
      });
    })
  );

  server.tool('updateStatus',
    updateStatusSchema.shape,
    wrapMCPHandler(async (args) => {
      return connectionManager.withConnection(async (store) => {
        const context = createHandlerContext();
        context.store = store;
        const handlersWithContext = new MinimalHandlers(context);
        return handlersWithContext.updateStatus(args);
      });
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
        logger.info('Closing database connections...');
        try {
          // Force close connection manager and release locks
          await connectionManager.forceClose();
          logger.info('Connection manager closed successfully');
        } catch (error) {
          logger.error('Failed to close connection manager', { 
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
