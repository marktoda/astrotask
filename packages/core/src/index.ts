/**
 * Astrolabe - A local-first, MCP-compatible task-navigation platform
 * Entry point for the application
 */

import { pathToFileURL } from 'node:url';
// Import centralised configuration
import { cfg } from './utils/config.js';
import { createModuleLogger, logShutdown } from './utils/logger.js';

export const APP_VERSION = '0.1.0';
export const APP_NAME = 'Astrolabe';

// Core functionality
export * from './database/index.js';
export * from './services/TaskService.js';

// Configuration
export * from './utils/config.js';

// Re-export task types
export type {
  Task,
  CreateTask as NewTask,
  TaskStatus,
  TaskPriority,
} from './schemas/task.js';
export { taskToApi } from './schemas/task.js';

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
