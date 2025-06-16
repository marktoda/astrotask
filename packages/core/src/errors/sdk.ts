/**
 * SDK-specific error classes
 *
 * Errors related to Astrotask SDK initialization and lifecycle
 */

import { AstrotaskError } from './base.js';

/**
 * Base class for SDK-related errors
 */
export abstract class SDKError extends AstrotaskError {
  constructor(message: string, operation?: string, context?: Record<string, unknown>) {
    super(message, 'sdk', operation, context);
  }
}

/**
 * Error thrown when SDK initialization fails
 */
export class SDKInitializationError extends SDKError {
  constructor(
    message: string,
    public readonly phase?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'initialization', { ...context, phase });
  }
}

/**
 * Error thrown when SDK is not initialized
 */
export class SDKNotInitializedError extends SDKError {
  constructor(operation?: string) {
    super('Astrotask SDK is not initialized. Call init() first.', operation);
  }
}

/**
 * Error thrown when SDK is already initialized
 */
export class SDKAlreadyInitializedError extends SDKError {
  constructor() {
    super('Astrotask SDK is already initialized', 'initialization');
  }
}

/**
 * Error thrown when SDK has been disposed
 */
export class SDKDisposedError extends SDKError {
  constructor(operation?: string) {
    super(
      operation === 'initialization'
        ? 'Astrotask SDK has been disposed and cannot be reinitialized'
        : 'Astrotask SDK has been disposed',
      operation
    );
  }
}

/**
 * Error thrown when a required service is not available
 */
export class ServiceNotAvailableError extends SDKError {
  constructor(
    public readonly serviceName: string,
    operation?: string
  ) {
    super(`${serviceName} not initialized`, operation, { serviceName });
  }
}

/**
 * Error thrown when adapter is not available
 */
export class AdapterNotAvailableError extends SDKError {
  constructor(operation: string, context?: Record<string, unknown>) {
    super(`Adapter not available for ${operation}`, operation, context);
  }
}
