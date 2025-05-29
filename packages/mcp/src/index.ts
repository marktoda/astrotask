#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, type DatabaseOptions, TaskService, DependencyService, createModuleLogger, logShutdown } from '@astrolabe/core';
import {
  TaskHandlers,
  TaskGenerationHandlers,
  DependencyHandlers,
  listTasksSchema,
  createTaskSchema,
  updateTaskSchema,
  deleteTaskSchema,
  completeTaskSchema,
  getTaskContextSchema,
  generateTasksSchema,
  listGeneratorsSchema,
  validateGenerationInputSchema,
  addTaskDependencySchema,
  removeTaskDependencySchema,
  getTaskDependenciesSchema,
  validateTaskDependencySchema,
  getAvailableTasksSchema,
  updateTaskStatusSchema,
  getTasksWithDependenciesSchema,
  getTopologicalOrderSchema,
  getNextTaskSchema,
  getOrderedTasksSchema
} from './handlers/index.js';
import { wrapMCPHandler } from './utils/response.js';

const logger = createModuleLogger('mcp-server');

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

  // Create DependencyService with the store
  const dependencyService = new DependencyService(store);

  // Create handler context
  const handlerContext = {
    store,
    taskService,
    dependencyService,
    requestId: 'main',
    timestamp: new Date().toISOString(),
  };

  // Create task handlers with context
  const taskHandlers = new TaskHandlers(handlerContext);
  const taskGenerationHandlers = new TaskGenerationHandlers(handlerContext);
  const dependencyHandlers = new DependencyHandlers(handlerContext);

  // Register core task management tools
  server.tool('listTasks',
    listTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskHandlers.listTasks(args);
    })
  );

  server.tool('createTask',
    createTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskHandlers.createTask(args);
    })
  );

  server.tool('updateTask',
    updateTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskHandlers.updateTask(args);
    })
  );

  server.tool('deleteTask',
    deleteTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskHandlers.deleteTask(args);
    })
  );

  server.tool('completeTask',
    completeTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskHandlers.completeTask(args);
    })
  );

  server.tool('getTaskContext',
    getTaskContextSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskHandlers.getTaskContext(args);
    })
  );

  // Register dependency management tools
  server.tool('addTaskDependency',
    addTaskDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.addTaskDependency(args);
    })
  );

  server.tool('removeTaskDependency',
    removeTaskDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.removeTaskDependency(args);
    })
  );

  server.tool('getTaskDependencies',
    getTaskDependenciesSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getTaskDependencies(args);
    })
  );

  server.tool('validateTaskDependency',
    validateTaskDependencySchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.validateTaskDependency(args);
    })
  );

  server.tool('getAvailableTasks',
    getAvailableTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getAvailableTasks(args);
    })
  );

  server.tool('updateTaskStatus',
    updateTaskStatusSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.updateTaskStatus(args);
    })
  );

  server.tool('getTasksWithDependencies',
    getTasksWithDependenciesSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getTasksWithDependencies(args);
    })
  );

  server.tool('getTaskContextWithDependencies',
    getTaskDependenciesSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getTaskContextWithDependencies(args);
    })
  );

  server.tool('getBlockedTasks',
    {},
    wrapMCPHandler(async () => {
      return dependencyHandlers.getBlockedTasks();
    })
  );

  server.tool('getTopologicalOrder',
    getTopologicalOrderSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getTopologicalOrder(args);
    })
  );

  server.tool('getNextTask',
    getNextTaskSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getNextTask(args);
    })
  );

  server.tool('getOrderedTasks',
    getOrderedTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return dependencyHandlers.getOrderedTasks(args);
    })
  );

  // Register task generation tools
  server.tool('generateTasks',
    generateTasksSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskGenerationHandlers.generateTasks(args);
    })
  );

  server.tool('listGenerators',
    listGeneratorsSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskGenerationHandlers.listGenerators(args);
    })
  );

  server.tool('validateGenerationInput',
    validateGenerationInputSchema.shape,
    wrapMCPHandler(async (args) => {
      return taskGenerationHandlers.validateGenerationInput(args);
    })
  );

  // Begin listening on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Astrolabe MCP Server started successfully with task generation and dependency management support');
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
