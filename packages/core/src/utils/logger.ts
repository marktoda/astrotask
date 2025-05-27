import pino from 'pino';
import type { LoggerOptions } from 'pino';
import { cfg } from '../utils/config.js';

/**
 * Logger configuration and setup for Astrolabe
 *
 * Features:
 * - Environment-aware configuration
 * - Structured logging with consistent formatting
 * - Pretty-printed output in development
 * - JSON output in production
 */

/**
 * Create logger options based on environment
 */
function createLoggerOptions(): LoggerOptions {
  const isDevelopment = cfg.NODE_ENV === 'development';
  const isTest = cfg.NODE_ENV === 'test';

  const baseOptions: LoggerOptions = {
    level: isTest ? 'warn' : cfg.LOG_LEVEL,
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };

  // Development: pretty printing
  if (isDevelopment) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    };
  }

  // Production: structured JSON
  return baseOptions;
}

/**
 * Main application logger instance
 */
export const logger = pino.default(createLoggerOptions());

/**
 * Create a module-specific logger
 *
 * @param moduleName - Name of the module/component
 * @returns Logger instance for the specific module
 */
export function createModuleLogger(moduleName: string): pino.Logger {
  return logger.child({ module: moduleName });
}

/**
 * Performance timing utility
 *
 * @param logger - Logger instance to use
 * @param operation - Name of the operation being timed
 * @returns Function to call when operation completes
 */
export function startTimer(
  logger: pino.Logger,
  operation: string
): (result?: Record<string, unknown>) => void {
  const start = process.hrtime.bigint();

  return (result: Record<string, unknown> = {}) => {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000;

    logger.info(
      {
        operation,
        duration: `${duration.toFixed(2)}ms`,
        ...result,
      },
      `${operation} completed in ${duration.toFixed(2)}ms`
    );
  };
}

/**
 * Error logging utility with stack trace handling
 *
 * @param logger - Logger instance to use
 * @param error - Error object or message
 * @param context - Additional context about the error
 */
export function logError(
  logger: pino.Logger,
  error: Error | string,
  context: Record<string, unknown> = {}
): void {
  if (typeof error === 'string') {
    logger.error(context, error);
    return;
  }

  const errorInfo: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // Include error cause if present
  if ('cause' in error && error.cause !== undefined) {
    errorInfo.cause = error.cause;
  }

  logger.error(
    {
      ...context,
      error: errorInfo,
    },
    error.message
  );
}

/**
 * Graceful shutdown logger
 *
 * @param logger - Logger instance to use
 * @param signal - Shutdown signal received
 * @param cleanup - Optional cleanup function to execute
 */
export async function logShutdown(
  logger: pino.Logger,
  signal: string,
  cleanup?: () => Promise<void> | void
): Promise<void> {
  logger.info({ signal }, `Received ${signal}, starting graceful shutdown`);

  if (cleanup) {
    try {
      await cleanup();
      logger.info('Cleanup completed successfully');
    } catch (error) {
      logError(logger, error as Error, { phase: 'cleanup' });
    }
  }

  logger.info('Shutdown complete');

  // Give pino time to flush logs before exit
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// Export the default logger for convenience
export default logger;
