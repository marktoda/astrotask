import pino from 'pino';
import type { LoggerOptions } from 'pino';
import { cfg } from '../utils/config.js';
import type { AppConfig } from './config.js';

/**
 * Logger configuration and setup for Astrolabe
 *
 * Features:
 * - Environment-aware configuration
 * - Structured logging with consistent formatting
 * - Pretty-printed output in development
 * - JSON output in production
 * - CLI mode support for reduced verbosity
 */

/**
 * Logger factory for creating configured logger instances
 */
export class LoggerFactory {
  private readonly appConfig: AppConfig;
  private readonly mainLogger: pino.Logger;

  constructor(appConfig: AppConfig) {
    this.appConfig = appConfig;
    this.mainLogger = pino.default(this.createLoggerOptions(), process.stderr);
  }

  /**
   * Create logger options based on environment
   */
  private createLoggerOptions(): LoggerOptions {
    const isDevelopment = this.appConfig.NODE_ENV === 'development';
    const isTest = this.appConfig.NODE_ENV === 'test';
    const isCLIMode = this.appConfig.CLI_MODE;

    // Determine log level based on context
    let logLevel: string;
    if (isTest) {
      logLevel = 'warn';
    } else if (isCLIMode) {
      // In CLI mode, only show important messages (warn/error)
      logLevel = 'warn';
    } else {
      logLevel = this.appConfig.LOG_LEVEL;
    }

    const baseOptions: LoggerOptions = {
      level: logLevel,
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
            destination: 2, // stderr
          },
        },
      };
    }

    // Production: structured JSON
    return baseOptions;
  }

  /**
   * Get the main logger instance
   */
  getLogger(): pino.Logger {
    return this.mainLogger;
  }

  /**
   * Create a module-specific logger
   *
   * @param moduleName - Name of the module/component
   * @returns Logger instance for the specific module
   */
  createModuleLogger(moduleName: string): pino.Logger {
    return this.mainLogger.child({ module: moduleName });
  }
}

// Default factory instance using global config for backward compatibility
// We need to ensure all required fields have defaults
const defaultConfig: AppConfig = {
  NODE_ENV: cfg.NODE_ENV ?? 'development',
  PORT: cfg.PORT ?? 3000,
  LOG_LEVEL: cfg.LOG_LEVEL ?? 'info',
  CLI_MODE: cfg.CLI_MODE ?? false,
  DATABASE_URI: cfg.DATABASE_URI ?? '',
  DB_VERBOSE: cfg.DB_VERBOSE ?? false,
  DB_TIMEOUT: cfg.DB_TIMEOUT ?? 5000,
  OPENAI_API_KEY: cfg.OPENAI_API_KEY ?? '',
  LLM_MODEL: cfg.LLM_MODEL ?? 'gpt-4',
  DEV_SERVER_HOST: cfg.DEV_SERVER_HOST ?? 'localhost',
  DEV_SERVER_PORT: cfg.DEV_SERVER_PORT ?? 5173,
  COMPLEXITY_THRESHOLD: cfg.COMPLEXITY_THRESHOLD ?? 7,
  COMPLEXITY_RESEARCH: cfg.COMPLEXITY_RESEARCH ?? false,
  COMPLEXITY_BATCH_SIZE: cfg.COMPLEXITY_BATCH_SIZE ?? 10,
  EXPANSION_USE_COMPLEXITY_ANALYSIS: cfg.EXPANSION_USE_COMPLEXITY_ANALYSIS ?? true,
  EXPANSION_RESEARCH: cfg.EXPANSION_RESEARCH ?? false,
  EXPANSION_COMPLEXITY_THRESHOLD: cfg.EXPANSION_COMPLEXITY_THRESHOLD ?? 7,
  EXPANSION_DEFAULT_SUBTASKS: cfg.EXPANSION_DEFAULT_SUBTASKS ?? 5,
  EXPANSION_MAX_SUBTASKS: cfg.EXPANSION_MAX_SUBTASKS ?? 10,
  EXPANSION_FORCE_REPLACE: cfg.EXPANSION_FORCE_REPLACE ?? false,
  EXPANSION_CREATE_CONTEXT_SLICES: cfg.EXPANSION_CREATE_CONTEXT_SLICES ?? true,
  STORE_IS_ENCRYPTED: cfg.STORE_IS_ENCRYPTED ?? false,
};

const defaultFactory = new LoggerFactory(defaultConfig);

/**
 * Create a new logger factory with custom configuration
 *
 * @param appConfig - Application configuration
 * @returns LoggerFactory instance
 */
export function createLoggerFactory(appConfig: AppConfig): LoggerFactory {
  return new LoggerFactory(appConfig);
}

/**
 * Main application logger instance
 * Always outputs to stderr to avoid polluting stdout (important for MCP servers)
 */
export const logger = defaultFactory.getLogger();

/**
 * Create a module-specific logger
 *
 * @param moduleName - Name of the module/component
 * @returns Logger instance for the specific module
 */
export function createModuleLogger(moduleName: string): pino.Logger {
  return defaultFactory.createModuleLogger(moduleName);
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
