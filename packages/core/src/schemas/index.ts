/**
 * Schema exports - Single source of truth for all Zod schemas and types
 */

// ===== SCHEMA & TYPE EXPORTS =====
export {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  taskStatus,
  validateTask,
  taskToApi,
  type Task,
  type CreateTask,
  type UpdateTask,
  type TaskStatus,
  type TaskApi,
  type CreateTaskApi,
} from './task.js';

export {
  projectSchema,
  createProjectSchema,
  updateProjectSchema,
  projectStatus,
  validateProject,
  type Project,
  type CreateProject,
  type UpdateProject,
  type ProjectStatus,
} from './project.js';

export {
  contextSliceSchema,
  createContextSliceSchema,
  updateContextSliceSchema,
  validateContextSlice,
  type ContextSlice,
  type CreateContextSlice,
  type UpdateContextSlice,
} from './contextSlice.js';

export {
  uuid,
  optionalUuid,
  title,
  description,
  uuidPattern,
} from './base.js';

export { CONSTRAINTS, type Priority } from './types.js';

// ===== VALIDATION UTILITIES =====
import { z } from 'zod';
// Import for local use
import { uuidPattern } from './base.js';
import { CONSTRAINTS } from './types.js';

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Safe parsing utility with standardized error format
 */
export function safeParseSchema<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationError[] = result.error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
    value: err.path.length > 0 ? getNestedValue(data, err.path) : data,
  }));

  return { success: false, errors };
}

/**
 * Validation with detailed error formatting
 */
export function validateWithErrors<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = safeParseSchema(schema, data);

  if (!result.success) {
    const errorMessages =
      result.errors?.map((err) => `${err.field}: ${err.message}`).join(', ') ||
      'Unknown validation error';
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  return result.data as T;
}

// ===== SCHEMA REGISTRY =====
import {
  type CreateTask,
  type Task,
  type UpdateTask,
  createTaskSchema,
  taskSchema,
  updateTaskSchema,
} from './task.js';

import {
  type CreateProject,
  type Project,
  type UpdateProject,
  createProjectSchema,
  projectSchema,
  updateProjectSchema,
} from './project.js';

import {
  type ContextSlice,
  type CreateContextSlice,
  type UpdateContextSlice,
  contextSliceSchema,
  createContextSliceSchema,
  updateContextSliceSchema,
} from './contextSlice.js';

export const schemaRegistry = {
  task: taskSchema,
  createTask: createTaskSchema,
  updateTask: updateTaskSchema,
  project: projectSchema,
  createProject: createProjectSchema,
  updateProject: updateProjectSchema,
  contextSlice: contextSliceSchema,
  createContextSlice: createContextSliceSchema,
  updateContextSlice: updateContextSliceSchema,
} as const;

export type SchemaReturnTypeMap = {
  task: Task;
  createTask: CreateTask;
  updateTask: UpdateTask;
  project: Project;
  createProject: CreateProject;
  updateProject: UpdateProject;
  contextSlice: ContextSlice;
  createContextSlice: CreateContextSlice;
  updateContextSlice: UpdateContextSlice;
};

export type SchemaKey = keyof typeof schemaRegistry;

/**
 * Type-safe dynamic validation utility
 */
export function validateBySchemaKey<K extends SchemaKey>(
  key: K,
  data: unknown
): SchemaReturnTypeMap[K] {
  const schema = schemaRegistry[key];

  try {
    return schema.parse(data) as SchemaReturnTypeMap[K];
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

// ===== TYPE GUARDS =====
export function isTask(data: unknown): data is Task {
  return taskSchema.safeParse(data).success;
}

export function isProject(data: unknown): data is Project {
  return projectSchema.safeParse(data).success;
}

export function isContextSlice(data: unknown): data is ContextSlice {
  return contextSliceSchema.safeParse(data).success;
}

// ===== HELPER UTILITIES =====
function getNestedValue(obj: unknown, path: (string | number)[]): unknown {
  return path.reduce((current: unknown, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string | number, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// Common validation patterns as utilities
export const validationUtils = {
  // Check if string is valid UUID
  isValidUuid: (value: string): boolean => uuidPattern.test(value),

  // Validate datetime string
  isValidDateTime: (value: string): boolean => {
    try {
      return !Number.isNaN(new Date(value).getTime()) && value.includes('T');
    } catch {
      return false;
    }
  },

  // Check if value meets title constraints
  isValidTitle: (value: string): boolean => {
    return (
      value.length >= CONSTRAINTS.TITLE.MIN_LENGTH && value.length <= CONSTRAINTS.TITLE.MAX_LENGTH
    );
  },

  // Check if value meets description constraints
  isValidDescription: (value: string): boolean => {
    return value.length <= CONSTRAINTS.DESCRIPTION.MAX_LENGTH;
  },
} as const;

// Export all validation utilities as a single object
export const validation = {
  safeParseSchema,
  validateWithErrors,
  validateBySchemaKey,
  isTask,
  isProject,
  isContextSlice,
  ...validationUtils,
} as const;
