import { z } from 'zod';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import { CONSTRAINTS } from './types.js';

// Task ID patterns for human-readable IDs
// Root tasks: 4+ uppercase letters (ABCD, XYZW, etc.)
// Subtasks: dash-separated 4+ letter segments (ABCD-EFGH, ABCD-EFGH-IJKL, etc.)
// Special system IDs: __PROJECT_ROOT__ and similar
export const taskIdPattern = /^[A-Z]+(-[A-Z]+)*$/;

// Custom validation function that handles both regular and special task IDs
function validateTaskIdFormat(taskId: string): boolean {
  // Handle special system task IDs
  if (taskId === TASK_IDENTIFIERS.PROJECT_ROOT) {
    return true;
  }

  // Handle subtasks of PROJECT_ROOT (e.g., __PROJECT_ROOT__-ABCD)
  const projectRootPrefix = `${TASK_IDENTIFIERS.PROJECT_ROOT}-`;
  if (taskId.startsWith(projectRootPrefix)) {
    const suffix = taskId.substring(projectRootPrefix.length);
    // The suffix should follow normal task ID patterns
    return taskIdPattern.test(suffix);
  }

  // Regular task ID validation
  return taskIdPattern.test(taskId);
}

// Task ID validator
export const taskId = z
  .string()
  .refine(
    validateTaskIdFormat,
    'Invalid task ID format (must be uppercase letters like ABCD, XYZW or dash-separated like ABCD-EFGH, XYZW-IJKL-MNOP, or a special system ID)'
  );
export const optionalTaskId = taskId.optional();

// UUID patterns and validators (for context slices and other non-task entities)
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuid = z.string().regex(uuidPattern, 'Invalid UUID format');
export const optionalUuid = uuid.optional();

// Common field validators
export const title = z
  .string()
  .min(CONSTRAINTS.TITLE.MIN_LENGTH, 'Title cannot be empty')
  .max(CONSTRAINTS.TITLE.MAX_LENGTH, 'Title too long');

export const description = z
  .string()
  .max(CONSTRAINTS.DESCRIPTION.MAX_LENGTH, 'Description too long');
