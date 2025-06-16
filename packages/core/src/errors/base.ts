/**
 * Base error classes for Astrotask
 *
 * This module provides the foundation for consistent error handling across
 * all Astrotask modules, following the pattern established by database errors.
 */

/**
 * Base error class for all Astrotask errors
 * Provides consistent structure and context handling
 */
export abstract class AstrotaskError extends Error {
  /**
   * Module where the error originated
   */
  public readonly module: string;

  /**
   * Operation being performed when error occurred
   */
  public readonly operation?: string | undefined;

  /**
   * Additional context information
   */
  public readonly context?: Record<string, unknown> | undefined;

  /**
   * Timestamp when error occurred
   */
  public readonly timestamp: Date;

  constructor(
    message: string,
    module: string,
    operation?: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.module = module;
    this.operation = operation;
    this.context = context;
    this.timestamp = new Date();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Create a new error instance with additional context
   */
  withContext(additionalContext: Record<string, unknown>): this {
    const ErrorClass = this.constructor as new (
      message: string,
      module: string,
      operation?: string,
      context?: Record<string, unknown>
    ) => this;

    return new ErrorClass(this.message, this.module, this.operation, {
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Convert error to a structured object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      module: this.module,
      operation: this.operation,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Helper function to wrap unknown errors with module context
 */
export function wrapError(
  error: unknown,
  module: string,
  operation: string,
  context?: Record<string, unknown>
): AstrotaskError {
  // If it's already an AstrotaskError, add context if provided
  if (error instanceof AstrotaskError) {
    return context ? error.withContext(context) : error;
  }

  // Convert to GenericError with proper context
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  return new GenericError(message, module, operation, { ...context, cause });
}

/**
 * Generic error for wrapping unknown errors
 */
class GenericError extends AstrotaskError {}

/**
 * Type guard to check if an error is an AstrotaskError
 */
export function isAstrotaskError(error: unknown): error is AstrotaskError {
  return error instanceof AstrotaskError;
}

/**
 * Extract error details for logging
 */
export function extractErrorDetails(error: unknown): {
  message: string;
  module?: string | undefined;
  operation?: string | undefined;
  context?: Record<string, unknown> | undefined;
  stack?: string | undefined;
} {
  if (error instanceof AstrotaskError) {
    return {
      message: error.message,
      module: error.module,
      operation: error.operation,
      context: error.context,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}
