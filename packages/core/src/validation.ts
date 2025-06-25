/**
 * Validation Toolkit
 *
 * Comprehensive validation utilities for Astrotask including:
 * - All Zod schemas and validation functions
 * - Task tree validation
 * - Status transition validation
 * - String constraint validation
 * - Type guards and validation helpers
 */

// Complete schema exports
export * from './schemas/index.js';

// Task tree validation (minimal subset - main tree exports are in tree.js)
export { validateTaskTree } from './entities/TaskTreeValidation.js';

// Status transition validation
export {
  isValidStatusTransition,
  canTransitionStatus,
  getTransitionRejectionReason,
  validateStatusTransition,
  taskStatusTransitions,
  type StatusTransitionResult,
} from './utils/statusTransitions.js';

// Task and dependency validation (avoiding duplicate exports)
export { validateDependency } from './validation/dependency-validation.js';
