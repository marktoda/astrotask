#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, type DatabaseOptions, TaskService, DependencyService, createModuleLogger, logShutdown } from '@astrolabe/core';
import {
  MinimalHandlers,
  parsePRDSchema,
  expandTaskSchema,
  expandTasksBatchSchema,
  expandHighComplexityTasksSchema,
  addDependencySchema,
  getNextTaskSchema,
  analyzeNodeComplexitySchema,
  analyzeComplexitySchema,
  complexityReportSchema
} from './handlers/index.js';
import { wrapMCPHandler } from './utils/response.js';

const logger = createModuleLogger('mcp-server');

/**
 * Ultra-Minimal Astrolabe MCP Server
 * Provides only 4 essential tools for AI agent task management
 */
async function main() {
  // Create the high-level MCP server instance
  const server = new McpServer({
    name: 'astrolabe-mcp-server',
    version: '0.2.0',
  });

  // Initialize database and services
  const dbOptions: DatabaseOptions = { dbPath: process.env.DATABASE_PATH || 'astrolabe.db' };
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

  // Register the 4 essential tools
  server.tool('parsePRD',
    parsePRDSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.parsePRD(args);
    })
  );

  server.tool('expandTask',
    expandTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.expandTask(args);
    })
  );

  server.tool('expandTasksBatch',
    expandTasksBatchSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.expandTasksBatch(args);
    })
  );

  server.tool('expandHighComplexityTasks',
    expandHighComplexityTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.expandHighComplexityTasks(args);
    })
  );

  server.tool('addDependency',
    addDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.addDependency(args);
    })
  );

  server.tool('getNextTask',
    getNextTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.getNextTask(args);
    })
  );

  server.tool('analyze_node_complexity',
    analyzeNodeComplexitySchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.analyzeNodeComplexity(args);
    })
  );

  server.tool('analyze_project_complexity',
    analyzeComplexitySchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.analyzeComplexity(args);
    })
  );

  server.tool('complexity_report',
    complexityReportSchema.shape,
    wrapMCPHandler(async (args) => {
      return handlers.complexityReport(args);
    })
  );

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Astrolabe MCP Server started with 9 tools: parsePRD, expandTask, expandTasksBatch, expandHighComplexityTasks, addDependency, getNextTask, analyze_node_complexity, analyze_project_complexity, complexity_report');
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
