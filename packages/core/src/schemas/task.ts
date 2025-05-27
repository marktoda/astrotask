import { z } from 'zod';
import { description, optionalUuid, title, uuid } from './base.js';

// Simple task status enum
export const taskStatus = z
  .enum(['pending', 'in-progress', 'done', 'cancelled'])
  .default('pending');

// Database Task schema - matches what Drizzle returns (Date objects, nullable fields)
export const taskSchema = z.object({
  id: uuid,
  parentId: optionalUuid.nullable(), // Database returns null, not undefined
  title: title,
  description: description.nullable(), // Database returns null, not undefined
  status: taskStatus,

  // Core content fields from design doc
  prd: z.string().nullable(),
  contextDigest: z.string().nullable(),

  // Foreign references (matches database)
  projectId: optionalUuid.nullable(), // Database returns null, not undefined

  // Timestamps as Date objects (matches database return type)
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Task creation schema - for database insertion, nullable fields optional
export const createTaskSchema = taskSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
    createdAt: z.date().optional(), // Allow optional timestamps for database insertion
    updatedAt: z.date().optional(),
    // Transform API optionals to database nullables
    parentId: optionalUuid.optional(),
    description: description.optional(),
    prd: z.string().optional(),
    contextDigest: z.string().optional(),
    projectId: optionalUuid.optional(),
  });

// Task update schema (all fields optional except id)
export const updateTaskSchema = taskSchema.partial().extend({
  id: uuid, // ID is required for updates
});

// API-safe schemas for serialization (timestamps as ISO strings, optional fields)
export const taskApiSchema = taskSchema.extend({
  parentId: optionalUuid.optional(), // API uses optional instead of null
  description: description.optional(), // API uses optional instead of null
  prd: z.string().optional(), // API uses optional instead of null
  contextDigest: z.string().optional(), // API uses optional instead of null
  projectId: optionalUuid.optional(), // API uses optional instead of null
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTaskApiSchema = createTaskSchema.extend({
  parentId: optionalUuid.optional(),
  description: description.optional(),
  prd: z.string().optional(),
  contextDigest: z.string().optional(),
  projectId: optionalUuid.optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// Basic task validation - just ensure it can't be its own parent
export function validateTask(task: Task): boolean {
  // Schema validation
  taskSchema.parse(task);

  // Basic business rule: cannot be its own parent
  if (task.parentId === task.id) {
    throw new Error('Task cannot be its own parent');
  }

  return true;
}

// Transformation utilities for database <-> API compatibility
export function taskToApi(task: Task): TaskApi {
  return {
    ...task,
    parentId: task.parentId ?? undefined, // null -> undefined
    description: task.description ?? undefined, // null -> undefined
    prd: task.prd ?? undefined, // null -> undefined
    contextDigest: task.contextDigest ?? undefined, // null -> undefined
    projectId: task.projectId ?? undefined, // null -> undefined
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function taskFromApi(apiTask: TaskApi): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...apiTask,
    parentId: apiTask.parentId ?? null, // undefined -> null
    description: apiTask.description ?? null, // undefined -> null
    prd: apiTask.prd ?? null, // undefined -> null
    contextDigest: apiTask.contextDigest ?? null, // undefined -> null
    projectId: apiTask.projectId ?? null, // undefined -> null
  };
}

// Type inference
export type Task = z.infer<typeof taskSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type TaskStatus = z.infer<typeof taskStatus>;

// API types for serialization
export type TaskApi = z.infer<typeof taskApiSchema>;
export type CreateTaskApi = z.infer<typeof createTaskApiSchema>;

// Legacy alias for backward compatibility (can be removed later)
/** @deprecated Use CreateTask instead */
export type NewTask = CreateTask;
