import { z } from 'zod';

// ===== SCHEMA IMPORTS & EXPORTS =====
export {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
  taskStatus,
  validateTask,
} from './task.js';

export {
  projectSchema,
  createProjectSchema,
  updateProjectSchema,
  projectStatus,
  validateProject,
} from './project.js';

export {
  contextSliceSchema,
  createContextSliceSchema,
  updateContextSliceSchema,
  validateContextSlice,
} from './contextSlice.js';

export {
  uuid,
  optionalUuid,
  title,
  description,
  uuidPattern,
} from './base.js';

export { CONSTRAINTS } from './types.js';

// ===== TYPE EXPORTS =====
export type {
  Task,
  CreateTask,
  UpdateTask,
  TaskStatus,
} from './task.js';

export type {
  Project,
  CreateProject,
  UpdateProject,
  ProjectStatus,
} from './project.js';

export type {
  ContextSlice,
  CreateContextSlice,
  UpdateContextSlice,
} from './contextSlice.js';

export type { Priority } from './types.js';

// ===== ENHANCED VALIDATION UTILITIES =====

// Enhanced error handling types
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

// Safe parsing utility with standardized error format
export function safeParseSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors: ValidationError[] = result.error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
    value: err.path.length > 0 ? getNestedValue(data, err.path) : data,
  }));

  return {
    success: false,
    errors,
  };
}

// Validation with detailed error formatting
export function validateWithErrors<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  const result = safeParseSchema(schema, data);
  
  if (!result.success) {
    const errorMessages = result.errors!.map(
      (err) => `${err.field}: ${err.message}`
    ).join(', ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }
  
  return result.data!;
}

// Import schemas for use in registry
import {
  taskSchema,
  createTaskSchema,
  updateTaskSchema,
} from './task.js';

import {
  projectSchema,
  createProjectSchema,
  updateProjectSchema,
} from './project.js';

import {
  contextSliceSchema,
  createContextSliceSchema,
  updateContextSliceSchema,
} from './contextSlice.js';

import { uuidPattern } from './base.js';
import { CONSTRAINTS } from './types.js';

// Import types directly from source files
import type { Task, CreateTask, UpdateTask } from './task.js';
import type { Project, CreateProject, UpdateProject } from './project.js';
import type { ContextSlice, CreateContextSlice, UpdateContextSlice } from './contextSlice.js';

// Schema registry with proper typing
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

// Type mapping for schema keys to their return types
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

// Type-safe dynamic validation utility
export function validateBySchemaKey<K extends SchemaKey>(
  key: K,
  data: unknown
): SchemaReturnTypeMap[K] {
  const schema = schemaRegistry[key];
  
  // Use the schema's parse method directly to maintain proper typing
  try {
    const result = schema.parse(data);
    return result as SchemaReturnTypeMap[K];
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

// Batch validation utility with strict typing
export function validateBatch<T>(
  schema: z.ZodSchema<T>,
  items: unknown[]
): ValidationResult<T[]> {
  const results: T[] = [];
  const errors: ValidationError[] = [];

  items.forEach((item, index) => {
    const result = safeParseSchema(schema, item);
    if (result.success) {
      results.push(result.data!);
    } else {
      errors.push(
        ...result.errors!.map((err) => ({
          ...err,
          field: `[${index}].${err.field}`,
        }))
      );
    }
  });

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: results,
  };
}

// Type guards for runtime type checking
export function isTask(data: unknown): data is Task {
  return safeParseSchema(taskSchema, data).success;
}

export function isProject(data: unknown): data is Project {
  return safeParseSchema(projectSchema, data).success;
}

export function isContextSlice(data: unknown): data is ContextSlice {
  return safeParseSchema(contextSliceSchema, data).success;
}

// Utility function to get nested value from object with proper typing
function getNestedValue(obj: unknown, path: (string | number)[]): unknown {
  return path.reduce((current: unknown, key: string | number) => {
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
      return !isNaN(new Date(value).getTime()) && value.includes('T');
    } catch {
      return false;
    }
  },
  
  // Check if value meets title constraints
  isValidTitle: (value: string): boolean => {
    return value.length >= CONSTRAINTS.TITLE.MIN_LENGTH && 
           value.length <= CONSTRAINTS.TITLE.MAX_LENGTH;
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
  validateBatch,
  isTask,
  isProject,
  isContextSlice,
  ...validationUtils,
} as const; 