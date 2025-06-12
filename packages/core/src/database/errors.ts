/**
 * Database error classes with adapter-specific context
 */

/**
 * Base database error with common context
 */
export abstract class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly adapter: string,
    public readonly operation?: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  /**
   * Create error with additional context
   */
  withContext(context: Record<string, unknown>): this {
    return new (this.constructor as any)(
      this.message,
      this.adapter,
      this.operation,
      { ...this.context, ...context }
    );
  }
}

/**
 * Connection-related errors
 */
export class DatabaseConnectionError extends DatabaseError {
  constructor(
    message: string,
    adapter: string,
    public readonly url?: string,
    context?: Record<string, unknown>
  ) {
    super(message, adapter, 'connection', context);
  }
}

/**
 * Migration-related errors
 */
export class DatabaseMigrationError extends DatabaseError {
  constructor(
    message: string,
    adapter: string,
    public readonly migrationDir?: string,
    context?: Record<string, unknown>
  ) {
    super(message, adapter, 'migration', context);
  }
}

/**
 * Query execution errors
 */
export class DatabaseQueryError extends DatabaseError {
  constructor(
    message: string,
    adapter: string,
    public readonly sql?: string,
    public readonly params?: unknown[],
    context?: Record<string, unknown>
  ) {
    super(message, adapter, 'query', context);
  }
}

/**
 * Transaction-related errors
 */
export class DatabaseTransactionError extends DatabaseError {
  constructor(
    message: string,
    adapter: string,
    context?: Record<string, unknown>
  ) {
    super(message, adapter, 'transaction', context);
  }
}

/**
 * URL parsing errors
 */
export class DatabaseUrlError extends DatabaseError {
  constructor(
    message: string,
    public readonly url?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'url-parser', 'parse', context);
  }
}

/**
 * Adapter configuration errors
 */
export class DatabaseAdapterError extends DatabaseError {
  constructor(
    message: string,
    adapter: string,
    public readonly adapterType?: string,
    context?: Record<string, unknown>
  ) {
    super(message, adapter, 'configuration', context);
  }
}

/**
 * Unsupported operation errors
 */
export class DatabaseUnsupportedError extends DatabaseError {
  constructor(
    message: string,
    adapter: string,
    public readonly feature?: string,
    context?: Record<string, unknown>
  ) {
    super(message, adapter, 'unsupported', context);
  }
}

/**
 * Helper function to create adapter-specific error
 */
export function createAdapterError(
  ErrorClass: new (...args: any[]) => DatabaseError,
  message: string,
  adapter: string,
  ...args: any[]
): DatabaseError {
  return new ErrorClass(message, adapter, ...args);
}

/**
 * Generic database error for wrapping unknown errors
 */
class GenericDatabaseError extends DatabaseError {}

/**
 * Helper function to wrap unknown errors with database context
 */
export function wrapDatabaseError(
  error: unknown,
  adapter: string,
  operation: string,
  context?: Record<string, unknown>
): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new GenericDatabaseError(message, adapter, operation, context);
} 