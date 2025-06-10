#!/usr/bin/env node

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createAstrotask, createModuleLogger, logShutdown, cfg } from '@astrotask/core';
import {
  MinimalHandlers,
  getNextTaskSchema,
  addTasksSchema,
  listTasksSchema,
  addTaskContextSchema,
  addDependencySchema,
  updateStatusSchema,
  deleteTaskSchema
} from './handlers/index.js';
import { wrapMCPHandler } from './utils/response.js';

const logger = createModuleLogger('mcp-server-http');

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Lazy-loaded Astrotask instance
let astrotaskInstance: Awaited<ReturnType<typeof createAstrotask>> | null = null;

/**
 * Lazy-load the Astrotask SDK instance
 * This ensures configuration errors don't prevent the server from starting
 */
async function getAstrotaskInstance() {
  if (!astrotaskInstance) {
    try {
      // Use Smithery configuration if available, fall back to defaults
      const databaseUrl = process.env.databaseUrl || cfg.DATABASE_URI;
      const debug = process.env.debug === 'true' || cfg.DB_VERBOSE;
      
      astrotaskInstance = await createAstrotask({
        databaseUrl,
        debug,
      });
      
      logger.info('Astrotask SDK initialized successfully', { databaseUrl, debug });
    } catch (error) {
      logger.error('Failed to initialize Astrotask SDK', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
  return astrotaskInstance;
}

/**
 * Astrotask MCP Server with Streamable HTTP Transport
 * Provides 6 essential tools for AI agent task management via HTTP
 * Designed for hosted deployment and web-based clients
 */
async function createMCPServer(): Promise<McpServer> {
  // Create handler context factory with lazy loading
  const createHandlerContext = async () => {
    const astrotask = await getAstrotaskInstance();
    return {
      astrotask,
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
    };
  };

  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrotask-mcp-server',
    version: '0.3.0',
  });

  // Register the 6 essential tools with enhanced schema documentation
  server.tool('getNextTask',
    getNextTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.getNextTask(args);
    })
  );

  server.tool('addTasks',
    addTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.addTasks(args);
    })
  );

  server.tool('listTasks',
    listTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.listTasks(args);
    })
  );

  server.tool('addTaskContext',
    addTaskContextSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.addTaskContext(args);
    })
  );

  server.tool('addDependency',
    addDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.addDependency(args);
    })
  );

  server.tool('updateStatus',
    updateStatusSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.updateStatus(args);
    })
  );

  server.tool('deleteTask',
    deleteTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      const context = await createHandlerContext();
      const handlers = new MinimalHandlers(context);
      return handlers.deleteTask(args);
    })
  );

  return server;
}

async function main() {
  const app = express();
  app.use(express.json());

  // Handle POST requests for client-to-server communication
  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
            logger.info(`New MCP session initialized: ${sessionId}`);
          }
        });

        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            logger.info(`MCP session closed: ${transport.sessionId}`);
            delete transports[transport.sessionId];
          }
        };

        // Create and connect MCP server (lazy loading happens inside handlers)
        const server = await createMCPServer();
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined 
      });
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
        },
        id: null,
      });
    }
  });

  // Reusable handler for GET and DELETE requests
  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', handleSessionRequest);

  // Handle DELETE requests for session termination
  app.delete('/mcp', handleSessionRequest);

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      server: 'astrotask-mcp-server',
      version: '0.3.0',
      activeSessions: Object.keys(transports).length
    });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info(`Astrotask MCP Server (http) started on port ${port} with 7 enhanced tools: getNextTask, addTasks, listTasks, addTaskContext, addDependency, updateStatus, deleteTask`);
  });

  // Set up graceful shutdown with Astrotask SDK cleanup
  const setupShutdownHandlers = () => {
    const handleShutdown = async (signal: string) => {
      await logShutdown(logger, signal, async () => {
        if (astrotaskInstance) {
          logger.info('Disposing Astrotask SDK...');
          try {
            await astrotaskInstance.dispose();
            logger.info('Astrotask SDK disposed successfully');
          } catch (error) {
            logger.error('Failed to dispose Astrotask SDK', { 
              error: error instanceof Error ? error.message : String(error) 
            });
          }
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
  logger.fatal({ error }, 'Fatal error starting Astrotask MCP Server (http)');
  process.exit(1);
}); 