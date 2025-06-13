/**
 * Tree Validation Module
 * 
 * Re-exports tree validation functionality from entities/TaskTreeValidation
 * to provide a centralized validation API.
 */

// Re-export all tree validation functionality
export {
  validateTaskTree,
  validateMoveOperation,
  validateTaskForest,
  validateTaskTreeData,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationOptions,
} from '../entities/TaskTreeValidation.js'; 