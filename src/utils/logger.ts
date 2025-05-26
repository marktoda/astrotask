import pino from 'pino';
import type { LoggerOptions } from 'pino';
import { cfg } from '../config/index.js';

/**
 * Logger configuration and setup for Astrolabe
 *
 * Features:
 * - Environment-aware configuration (development vs production)
 * - Structured logging with consistent formatting
 * - Pretty-printed output in development
 * - JSON output in production for log aggregation
 * - Performance-optimized with minimal overhead
 */

/**
 * Create logger options based on environment and configuration
 */
function createLoggerOptions(): LoggerOptions {
  const isDevelopment = cfg.NODE_ENV === 'development';
  const isTest = cfg.NODE_ENV === 'test';

  const baseOptions: LoggerOptions = {
    level: cfg.LOG_LEVEL,
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };

  // Test environment: minimal output
  if (isTest) {
    return {
      ...baseOptions,
      level: 'warn', // Reduce noise in tests
    };
  }

  // Development environment: pretty printing
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
          hideObject: false,
        },
      },
    };
  }

  // Production environment: structured JSON output
  return baseOptions;
}

/**
 * Main application logger instance
 */
export const logger = pino.default(createLoggerOptions());

/**
 * Create a child logger with additional context
 *
 * @param context - Context object to include in all log messages
 * @returns Child logger instance
 *
 * @example
 * ```typescript
 * const dbLogger = createLogger({ module: 'database' });
 * dbLogger.info('Connection established');
 * ```
 */
export function createLogger(context: Record<string, unknown>): pino.Logger {
  return logger.child(context);
}

/**
 * Create a module-specific logger
 *
 * @param moduleName - Name of the module/component
 * @returns Logger instance for the specific module
 *
 * @example
 * ```typescript
 * const logger = createModuleLogger('TaskManager');
 * logger.info('Task created', { taskId: '123', title: 'Example' });
 * ```
 */
export function createModuleLogger(moduleName: string): pino.Logger {
  return createLogger({ module: moduleName });
}

/**
 * Create an operation-specific logger
 *
 * @param operation - Name of the operation being performed
 * @param context - Additional context for the operation
 * @returns Logger instance for the specific operation
 *
 * @example
 * ```typescript
 * const logger = createOperationLogger('userAuthentication', { userId: '123' });
 * logger.debug('Starting authentication process');
 * logger.info('Authentication successful');
 * ```
 */
export function createOperationLogger(
  operation: string,
  context: Record<string, unknown> = {}
): pino.Logger {
  return createLogger({ operation, ...context });
}

/**
 * Performance timing logger utility
 *
 * @param logger - Logger instance to use
 * @param operation - Name of the operation being timed
 * @returns Function to call when operation completes
 *
 * @example
 * ```typescript
 * const logger = createModuleLogger('Database');
 * const endTimer = startTimer(logger, 'getUserById');
 * // ... perform operation
 * endTimer({ userId: '123', found: true });
 * ```
 */
export function startTimer(
  logger: pino.Logger,
  operation: string
): (result?: Record<string, unknown>) => void {
  const start = process.hrtime.bigint();

  return (result: Record<string, unknown> = {}) => {
    const duration = Number(process.hrtime.bigint() - start) / 1_000_000; // Convert to milliseconds

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
 *
 * @example
 * ```typescript
 * const logger = createModuleLogger('UserService');
 * try {
 *   // ... some operation
 * } catch (error) {
 *   logError(logger, error, { userId: '123', operation: 'updateProfile' });
 *   throw error; // Re-throw if needed
 * }
 * ```
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

  // Safe access to cause property (ES2022+) with proper type checking
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
 * Request/Response logging middleware helper
 *
 * @param logger - Logger instance to use
 * @param requestId - Unique identifier for the request
 * @returns Object with request/response logging functions
 *
 * @example
 * ```typescript
 * const logger = createModuleLogger('API');
 * const { logRequest, logResponse } = createRequestLogger(logger, 'req-123');
 *
 * logRequest('GET', '/api/users', { userId: '123' });
 * // ... handle request
 * logResponse(200, { users: [] });
 * ```
 */
export function createRequestLogger(logger: pino.Logger, requestId: string) {
  const requestLogger = logger.child({ requestId });

  return {
    logRequest: (method: string, path: string, context: Record<string, unknown> = {}) => {
      requestLogger.info(
        {
          method,
          path,
          ...context,
        },
        `${method} ${path}`
      );
    },

    logResponse: (statusCode: number, context: Record<string, unknown> = {}) => {
      const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
      requestLogger[level](
        {
          statusCode,
          ...context,
        },
        `Response ${statusCode}`
      );
    },
  };
}

/**
 * Database operation logger
 *
 * @param logger - Logger instance to use
 * @returns Object with database logging functions
 *
 * @example
 * ```typescript
 * const logger = createModuleLogger('Database');
 * const db = createDatabaseLogger(logger);
 *
 * db.logQuery('SELECT * FROM users WHERE id = ?', ['123']);
 * db.logTransaction('updateUserProfile', () => {
 *   // ... database operations
 * });
 * ```
 */
export function createDatabaseLogger(logger: pino.Logger) {
  return {
    logQuery: (sql: string, params: unknown[] = [], context: Record<string, unknown> = {}) => {
      if (cfg.LOG_LEVEL === 'debug') {
        logger.debug(
          {
            sql,
            params,
            ...context,
          },
          'Database query'
        );
      }
    },

    logTransaction: <T>(name: string, fn: () => T, context: Record<string, unknown> = {}): T => {
      const endTimer = startTimer(logger, `transaction:${name}`);
      try {
        logger.debug({ transaction: name, ...context }, `Starting transaction: ${name}`);
        const result = fn();
        endTimer({ success: true });
        return result;
      } catch (error) {
        endTimer({ success: false });
        logError(logger, error as Error, { transaction: name, ...context });
        throw error;
      }
    },
  };
}

/**
 * Graceful shutdown logger
 *
 * @param logger - Logger instance to use
 * @param signal - Shutdown signal received
 * @param cleanup - Cleanup function to execute
 *
 * @example
 * ```typescript
 * const logger = createModuleLogger('App');
 *
 * process.on('SIGTERM', () => {
 *   logShutdown(logger, 'SIGTERM', async () => {
 *     await database.close();
 *     await server.close();
 *   });
 * });
 * ```
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
