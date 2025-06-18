/**
 * Utility Functions
 *
 * Collection of utility functions for Astrotask including:
 * - Logging utilities
 * - Task ID generation and validation
 * - Project root detection
 * - Configuration management
 * - Acceptance criteria utilities
 */

// Logging utilities
export { createModuleLogger, logError, logShutdown, startTimer } from './utils/logger.js';

// Task ID utilities
export {
  generateNextTaskId,
  generateNextRootTaskId,
  generateNextSubtaskId,
  validateTaskId,
  validateSubtaskId,
  parseTaskId,
  TaskIdGenerationError,
} from './utils/taskId.js';

// Project utilities
export {
  findGitRoot,
  findExistingDatabase,
  getDefaultDatabaseUri,
} from './utils/find-project-root.js';

// Configuration
export * from './utils/config.js';
export * from './utils/models.js';

// Acceptance criteria utilities
export * from './utils/acceptanceCriteria.js';

// Status transitions
export {
  isValidStatusTransition,
  canTransitionStatus,
  getTransitionRejectionReason,
  validateStatusTransition,
  taskStatusTransitions,
  type StatusTransitionResult,
} from './utils/statusTransitions.js';
