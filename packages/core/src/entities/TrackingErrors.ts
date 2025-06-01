/**
 * @fileoverview Error types for tracking operations
 *
 * This module defines specific error types for better error handling
 * in TrackingTaskTree and TrackingDependencyGraph operations.
 */

import type { DependencyPendingOperation } from './TrackingDependencyGraph.js';
import type { PendingOperation } from './TrackingTaskTree.js';

/**
 * Base error class for all tracking-related errors
 */
export class TrackingError extends Error {
  constructor(
    message: string,
    public readonly operation?: PendingOperation | DependencyPendingOperation,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TrackingError';

    // Maintain proper stack trace (for V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TrackingError);
    }
  }
}

/**
 * Error thrown when reconciliation operations fail
 */
export class ReconciliationError extends TrackingError {
  constructor(
    message: string,
    public readonly failedOperations: (PendingOperation | DependencyPendingOperation)[],
    public readonly successfulOperations: (PendingOperation | DependencyPendingOperation)[],
    cause?: Error
  ) {
    super(message, undefined, cause);
    this.name = 'ReconciliationError';
  }
}

/**
 * Error thrown when operation consolidation fails
 */
export class OperationConsolidationError extends TrackingError {
  constructor(
    message: string,
    public readonly conflictingOperations: (PendingOperation | DependencyPendingOperation)[],
    cause?: Error
  ) {
    super(message, undefined, cause);
    this.name = 'OperationConsolidationError';
  }
}

/**
 * Error thrown when ID mapping fails
 */
export class IdMappingError extends TrackingError {
  constructor(
    message: string,
    public readonly unmappedIds: string[],
    public readonly availableMappings: Map<string, string>,
    cause?: Error
  ) {
    super(message, undefined, cause);
    this.name = 'IdMappingError';
  }
}

/**
 * Error thrown when tree/graph structure validation fails
 */
export class StructureValidationError extends TrackingError {
  constructor(
    message: string,
    public readonly invalidPath?: string[],
    cause?: Error
  ) {
    super(message, undefined, cause);
    this.name = 'StructureValidationError';
  }
}
