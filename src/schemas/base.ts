import { z } from 'zod';
import { CONSTRAINTS } from './types.js';

// Common validation patterns
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UUID validator
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
