import { z } from 'zod';
import { CONSTRAINTS } from './types.js';

// Task ID patterns for human-readable IDs
export const taskIdPattern = /^[A-Z]+(\.[1-9]\d*)*$/;

// Task ID validator
export const taskId = z
  .string()
  .regex(
    taskIdPattern,
    'Invalid task ID format (must be 4 letters like ABCD, XYZW or dotted numbers like ABCD.1, XYZW.2.1)'
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
