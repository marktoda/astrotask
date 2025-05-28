/**
 * Schema exports - Single source of truth for all Zod schemas and types
 */

// ===== SCHEMA & TYPE EXPORTS =====
export {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  taskStatus,
  taskPriority,
  validateTask,
  taskToApi,
  type Task,
  type CreateTask,
  type UpdateTask,
  type TaskStatus,
  type TaskPriority,
  type TaskApi,
  type CreateTaskApi,
} from './task.js';

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
  taskDependencySchema,
  createTaskDependencySchema,
  taskDependencyGraphSchema,
  taskWithDependenciesSchema,
  dependencyValidationResultSchema,
  taskDependencyApiSchema,
  createTaskDependencyApiSchema,
  taskDependencyToApi,
  taskDependencyFromApi,
  type TaskDependency,
  type CreateTaskDependency,
  type TaskDependencyGraph,
  type TaskWithDependencies,
  type DependencyValidationResult,
  type TaskDependencyApi,
  type CreateTaskDependencyApi,
} from './dependency.js';

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
  contextSlice: contextSliceSchema,
  createContextSlice: createContextSliceSchema,
  updateContextSlice: updateContextSliceSchema,
} as const;

export type SchemaReturnTypeMap = {
  task: Task;
  createTask: CreateTask;
  updateTask: UpdateTask;
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

/**
 * Check if a string is a valid UUID format
 */
export function isValidUuid(value: string): boolean {
  return uuidPattern.test(value);
}

/**
 * Check if a value meets basic string constraints
 */
export function validateStringConstraints(
  value: string,
  type: 'title' | 'description'
): ValidationResult<string> {
  if (type === 'title') {
    const constraints = CONSTRAINTS.TITLE;

    if (value.length < constraints.MIN_LENGTH) {
      return {
        success: false,
        errors: [
          {
            field: type,
            message: `${type} must be at least ${constraints.MIN_LENGTH} characters`,
            code: 'too_small',
            value,
          },
        ],
      };
    }

    if (value.length > constraints.MAX_LENGTH) {
      return {
        success: false,
        errors: [
          {
            field: type,
            message: `${type} must be at most ${constraints.MAX_LENGTH} characters`,
            code: 'too_big',
            value,
          },
        ],
      };
    }
  } else {
    const constraints = CONSTRAINTS.DESCRIPTION;

    if (value.length > constraints.MAX_LENGTH) {
      return {
        success: false,
        errors: [
          {
            field: type,
            message: `${type} must be at most ${constraints.MAX_LENGTH} characters`,
            code: 'too_big',
            value,
          },
        ],
      };
    }
  }

  return { success: true, data: value };
}
