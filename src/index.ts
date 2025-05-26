/**
 * Astrolabe - A local-first, MCP-compatible task-navigation platform
 * Entry point for the application
 */

// Import centralised configuration
import { cfg } from './config/index.js';
import { createModuleLogger, logShutdown } from './utils/logger.js';

export const APP_VERSION = '0.1.0';
export const APP_NAME = 'Astrolabe';

// Create application logger
const logger = createModuleLogger('App');

// Test function to verify TypeScript compilation
export function greet(name: string): string {
  return `Hello, ${name}! Welcome to ${APP_NAME} v${APP_VERSION}`;
}

// Simple test to verify everything compiles
if (import.meta.url === new URL(import.meta.url).href) {
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
