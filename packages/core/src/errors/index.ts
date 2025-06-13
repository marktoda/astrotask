/**
 * Centralized error handling for Astrotask
 * 
 * This module exports all error classes and utilities for consistent
 * error handling across the application.
 */

// Base error classes and utilities
export {
  AstrotaskError,
  wrapError,
  isAstrotaskError,
  extractErrorDetails,
} from './base.js';

// SDK errors
export {
  SDKError,
  SDKInitializationError,
  SDKNotInitializedError,
  SDKAlreadyInitializedError,
  SDKDisposedError,
  ServiceNotAvailableError,
  AdapterNotAvailableError,
} from './sdk.js';

// Service errors
export {
  ServiceError,
  TaskNotFoundError,
  TaskOperationError,
  DependencyValidationError,
  DependencyOperationError,
  LLMNotConfiguredError,
  LLMOperationError,
  ComplexityAnalysisError,
  TaskExpansionError,
  RegistryError,
  ServiceInitializationError,
  SchemaValidationError,
} from './service.js';

// Re-export database errors for convenience
export {
  DatabaseError,
  DatabaseConnectionError,
  DatabaseMigrationError,
  DatabaseQueryError,
  DatabaseTransactionError,
  DatabaseUrlError,
  DatabaseAdapterError,
  DatabaseUnsupportedError,
  wrapDatabaseError,
} from '../database/errors.js'; 