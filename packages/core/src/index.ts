/**
 * Astrolabe - A local-first, MCP-compatible task-navigation platform
 * Entry point for the application
 */

import { pathToFileURL } from 'node:url';
// Import centralised configuration
import { cfg } from './config/index.js';
import { createModuleLogger, logShutdown } from './utils/logger.js';

export const APP_VERSION = '0.1.0';
export const APP_NAME = 'Astrolabe';

// Re-export main database functionality for library usage
export { createDatabase } from './database/index.js';
export { DatabaseStore } from './database/store.js';
export type { Store } from './database/store.js';
export type { DatabaseOptions } from './database/index.js';

// Re-export TaskService for hierarchical operations
export { TaskService } from './core/services/TaskService.js';
export type { TaskTree } from './core/services/TaskService.js';

// Re-export task types
export type {
  Task,
  CreateTask as NewTask,
  TaskStatus,
} from './schemas/task.js';
export { taskToApi } from './schemas/task.js';

// Re-export project types
export type {
  Project,
  CreateProject as NewProject,
  ProjectStatus,
} from './schemas/project.js';

// Re-export context slice types
export type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from './schemas/contextSlice.js';

// Create application logger
const logger = createModuleLogger('App');

// Test function to verify TypeScript compilation
export function greet(name: string): string {
  return `Hello, ${name}! Welcome to ${APP_NAME} v${APP_VERSION}`;
}

const isEntrypoint = process.argv && import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isEntrypoint) {
  // Example usage of the logger in development
  if (cfg.NODE_ENV === 'development') {
    logger.info('Starting application in development mode', {
      environment: cfg.NODE_ENV,
      port: cfg.PORT,
      logLevel: cfg.LOG_LEVEL,
    });

    logger.info(greet('Developer'));
    logger.info('Application initialized', { version: APP_VERSION });

    // Set up graceful shutdown handling
    process.on('SIGTERM', () => {
      logShutdown(logger, 'SIGTERM', async () => {
        logger.info('Performing cleanup...');
        // Add any cleanup logic here
      });
    });

    process.on('SIGINT', () => {
      logShutdown(logger, 'SIGINT', async () => {
        logger.info('Performing cleanup...');
        // Add any cleanup logic here
      });
    });
  }
}

// Re-export logger utilities
export { createModuleLogger, logError, startTimer } from './utils/logger.js';
