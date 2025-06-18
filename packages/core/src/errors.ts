/**
 * Error Handling
 *
 * Comprehensive error handling utilities for Astrotask including:
 * - All error classes and types
 * - Error wrapping and utilities
 * - Domain-specific error handling
 */

// All error types
export * from './errors/index.js';

// Tracking error types
export {
  TrackingError,
  ReconciliationError,
  OperationConsolidationError,
  IdMappingError,
  StructureValidationError,
} from './entities/TrackingErrors.js';
