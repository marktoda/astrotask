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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createModuleLogger('mcp-server');

// Load documentation for each tool
const getNextTaskDocs = readFileSync(join(__dirname, '../docs/getNextTask.md'), 'utf8');
const addTasksDocs = readFileSync(join(__dirname, '../docs/addTasks.md'), 'utf8');
const listTasksDocs = readFileSync(join(__dirname, '../docs/listTasks.md'), 'utf8');
const addTaskContextDocs = readFileSync(join(__dirname, '../docs/addTaskContext.md'), 'utf8');
const addDependencyDocs = readFileSync(join(__dirname, '../docs/addDependency.md'), 'utf8');

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

  // Register the 5 essential tools with enhanced documentation
  server.tool('getNextTask', {
    description: 'Get the next available task to work on with optional parent, status, and priority filters',
    docs: getNextTaskDocs,
    parameters: getNextTaskSchema
  }, wrapMCPHandler(async (args) => {
    const parsedArgs = getNextTaskSchema.parse(args);
    return handlers.getNextTask(parsedArgs);
  }));

  server.tool('addTasks', {
    description: 'Create multiple tasks in batch with support for parent-child relationships and dependencies',
    docs: addTasksDocs,
    parameters: addTasksSchema
  }, wrapMCPHandler(async (args) => {
    const parsedArgs = addTasksSchema.parse(args);
    return handlers.addTasks(parsedArgs);
  }));

  server.tool('listTasks', {
    description: 'Return tasks that match optional status, parent, and other filters',
    docs: listTasksDocs,
    parameters: listTasksSchema
  }, wrapMCPHandler(async (args) => {
    const parsedArgs = listTasksSchema.parse(args);
    return handlers.listTasks(parsedArgs);
  }));

  server.tool('addTaskContext', {
    description: 'Add a context slice to an existing task with title, description, and optional type',
    docs: addTaskContextDocs,
    parameters: addTaskContextSchema
  }, wrapMCPHandler(async (args) => {
    const parsedArgs = addTaskContextSchema.parse(args);
    return handlers.addTaskContext(parsedArgs);
  }));

  server.tool('addDependency', {
    description: 'Create a dependency relationship between two tasks for proper work sequencing',
    docs: addDependencyDocs,
    parameters: addDependencySchema
  }, wrapMCPHandler(async (args) => {
    const parsedArgs = addDependencySchema.parse(args);
    return handlers.addDependency(parsedArgs);
  }));

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
