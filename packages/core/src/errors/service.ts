/**
 * Service-specific error classes
 * 
 * Errors related to service operations and business logic
 */

import { AstrotaskError } from './base.js';

/**
 * Base class for service-related errors
 */
export abstract class ServiceError extends AstrotaskError {
  constructor(
    message: string,
    service: string,
    operation?: string,
    context?: Record<string, unknown>
  ) {
    super(message, `service.${service}`, operation, context);
  }
}

/**
 * Error thrown when a task is not found
 */
export class TaskNotFoundError extends ServiceError {
  constructor(
    public readonly taskId: string,
    operation?: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Task ${taskId} not found`,
      'task',
      operation,
      { ...context, taskId }
    );
  }
}

/**
 * Error thrown when a task operation fails
 */
export class TaskOperationError extends ServiceError {
  constructor(
    message: string,
    operation: string,
    public readonly taskId?: string,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      'task',
      operation,
      { ...context, taskId }
    );
  }
}

/**
 * Error thrown when dependency validation fails
 */
export class DependencyValidationError extends ServiceError {
  constructor(
    message: string,
    public readonly errors: string[],
    context?: Record<string, unknown>
  ) {
    super(
      message,
      'dependency',
      'validation',
      { ...context, errors }
    );
  }
}

/**
 * Error thrown when a dependency operation fails
 */
export class DependencyOperationError extends ServiceError {
  constructor(
    message: string,
    operation: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'dependency', operation, context);
  }
}

/**
 * Error thrown when LLM service is not configured
 */
export class LLMNotConfiguredError extends ServiceError {
  constructor(
    operation?: string,
    context?: Record<string, unknown>
  ) {
    super(
      'OpenAI API key is required. Set OPENAI_API_KEY environment variable.',
      'llm',
      operation,
      context
    );
  }
}

/**
 * Error thrown when LLM operation fails
 */
export class LLMOperationError extends ServiceError {
  constructor(
    message: string,
    operation: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'llm', operation, context);
  }
}

/**
 * Error thrown when complexity analysis fails
 */
export class ComplexityAnalysisError extends ServiceError {
  constructor(
    message: string,
    operation: string,
    public readonly taskId?: string,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      'complexity',
      operation,
      { ...context, taskId }
    );
  }
}

/**
 * Error thrown when task expansion fails
 */
export class TaskExpansionError extends ServiceError {
  constructor(
    message: string,
    operation: string,
    public readonly taskId?: string,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      'expansion',
      operation,
      { ...context, taskId }
    );
  }
}

/**
 * Error thrown when service registry operation fails
 */
export class RegistryError extends ServiceError {
  constructor(
    message: string,
    public readonly token: string,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      'registry',
      'resolve',
      { ...context, token }
    );
  }
}

/**
 * Error thrown when service initialization fails
 */
export class ServiceInitializationError extends ServiceError {
  constructor(
    message: string,
    service: string,
    context?: Record<string, unknown>
  ) {
    super(message, service, 'initialization', context);
  }
}

/**
 * Error thrown when schema validation fails
 */
export class SchemaValidationError extends ServiceError {
  constructor(
    message: string,
    public readonly validationErrors: Array<{ field: string; message: string; code: string }>,
    context?: Record<string, unknown>
  ) {
    super(
      message,
      'validation',
      'schema',
      { ...context, validationErrors }
    );
  }
} 