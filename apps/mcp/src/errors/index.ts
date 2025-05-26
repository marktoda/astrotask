/**
 * Error handling and validation framework for MCP Server
 * 
 * Provides:
 * - Custom error types for different scenarios
 * - Proper HTTP status codes
 * - Structured error responses
 * - Security-aware error messages
 */

import { z } from 'zod';

/**
 * Base error class for all MCP server errors
 */
export abstract class MCPError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  abstract readonly isUserError: boolean;
  
  public readonly timestamp: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Get sanitized error message for client response
   */
  public getClientMessage(): string {
    return this.isUserError ? this.message : 'An internal server error occurred';
  }

  /**
   * Convert error to MCP response format
   */
  public toMCPResponse() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: {
              code: this.errorCode,
              message: this.getClientMessage(),
              timestamp: this.timestamp,
              ...(this.isUserError && this.context && { details: this.context })
            }
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}

/**
 * Validation errors for input validation failures
 */
export class ValidationError extends MCPError {
  readonly statusCode = 400;
  readonly errorCode = 'VALIDATION_ERROR';
  readonly isUserError = true;

  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, {
      field,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      ...context
    });
  }

  static fromZodError(error: z.ZodError): ValidationError {
    const firstIssue = error.issues[0];
    const fieldPath = firstIssue?.path.join('.') || 'unknown';
    const received = firstIssue && 'received' in firstIssue ? firstIssue.received : undefined;
    
    return new ValidationError(
      `Validation failed for field '${fieldPath}': ${firstIssue?.message || 'Invalid input'}`,
      fieldPath,
      received,
      {
        issues: error.issues.map(issue => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
          ...('received' in issue && { received: issue.received })
        }))
      }
    );
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends MCPError {
  readonly statusCode = 404;
  readonly errorCode = 'NOT_FOUND';
  readonly isUserError = true;

  constructor(resource: string, id: string, context?: Record<string, unknown>) {
    super(`${resource} with ID '${id}' not found`, {
      resource,
      resourceId: id,
      ...context
    });
  }
}

/**
 * Authorization/permission errors
 */
export class ForbiddenError extends MCPError {
  readonly statusCode = 403;
  readonly errorCode = 'FORBIDDEN';
  readonly isUserError = true;

  constructor(operation: string, resource?: string, context?: Record<string, unknown>) {
    super(
      resource 
        ? `Access denied: Cannot ${operation} ${resource}`
        : `Access denied: Cannot ${operation}`,
      { operation, resource, ...context }
    );
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends MCPError {
  readonly statusCode = 429;
  readonly errorCode = 'RATE_LIMIT_EXCEEDED';
  readonly isUserError = true;

  constructor(
    public readonly retryAfter: number,
    context?: Record<string, unknown>
  ) {
    super(`Rate limit exceeded. Try again after ${retryAfter} seconds`, {
      retryAfter,
      ...context
    });
  }
}

/**
 * Conflict errors (e.g., duplicate resources)
 */
export class ConflictError extends MCPError {
  readonly statusCode = 409;
  readonly errorCode = 'CONFLICT';
  readonly isUserError = true;

  constructor(resource: string, conflictField: string, value: string, context?: Record<string, unknown>) {
    super(`${resource} with ${conflictField} '${value}' already exists`, {
      resource,
      conflictField,
      conflictValue: value,
      ...context
    });
  }
}

/**
 * Database/storage errors
 */
export class DatabaseError extends MCPError {
  readonly statusCode = 500;
  readonly errorCode = 'DATABASE_ERROR';
  readonly isUserError = false;

  constructor(operation: string, cause?: Error, context?: Record<string, unknown>) {
    super(`Database error during ${operation}`, {
      operation,
      cause: cause?.message,
      ...context
    });
  }
}

/**
 * Internal server errors
 */
export class InternalServerError extends MCPError {
  readonly statusCode = 500;
  readonly errorCode = 'INTERNAL_ERROR';
  readonly isUserError = false;

  constructor(operation: string, cause?: Error, context?: Record<string, unknown>) {
    super(`Internal error during ${operation}`, {
      operation,
      cause: cause?.message,
      ...context
    });
  }
}

/**
 * Tool/method not found errors
 */
export class ToolNotFoundError extends MCPError {
  readonly statusCode = 404;
  readonly errorCode = 'TOOL_NOT_FOUND';
  readonly isUserError = true;

  constructor(toolName: string, availableTools?: string[], context?: Record<string, unknown>) {
    super(`Tool '${toolName}' not found`, {
      requestedTool: toolName,
      availableTools,
      ...context
    });
  }
}

/**
 * Initialization errors
 */
export class InitializationError extends MCPError {
  readonly statusCode = 503;
  readonly errorCode = 'SERVICE_UNAVAILABLE';
  readonly isUserError = false;

  constructor(service: string, cause?: Error, context?: Record<string, unknown>) {
    super(`Service ${service} not properly initialized`, {
      service,
      cause: cause?.message,
      ...context
    });
  }
} 