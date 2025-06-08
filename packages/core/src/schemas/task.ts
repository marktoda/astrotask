import { z } from 'zod';
import { description, optionalTaskId, taskId, title } from './base.js';

// Enhanced task status enum for Astrolabe TUI redesign
// Supports both legacy statuses and new simplified taxonomy:
// - pending (PEN): Created, waiting to be started
// - in-progress (ACT): Actively worked on
// - blocked (BLK): Waiting on prerequisite - NEW STATUS
// - done (DONE): Work finished
// - cancelled, archived: Legacy statuses maintained for compatibility
export const taskStatus = z
  .enum(['pending', 'in-progress', 'blocked', 'done', 'cancelled', 'archived'])
  .default('pending');

// Task priority enum (moved from project schema)
export const taskPriority = z.enum(['low', 'medium', 'high']).default('medium');

// Database Task schema - matches what Drizzle returns (Date objects, nullable fields)
export const taskSchema = z.object({
  id: taskId,
  parentId: optionalTaskId.nullable(), // Database returns null, not undefined
  title: title,
  description: description.nullable(), // Database returns null, not undefined
  status: taskStatus,
  priority: taskPriority,

  // Core content fields from design doc
  prd: z.string().nullable(),
  contextDigest: z.string().nullable(),

  // Timestamps as Date objects (matches database return type)
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Task creation schema (for database insertion, nullable fields optional)
export const createTaskSchema = taskSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    parentId: optionalTaskId.optional(), // API uses optional, transform to null for DB
    description: description.optional(), // API uses optional, transform to null for DB
    prd: z.string().optional(),
    contextDigest: z.string().optional(),
  });

// Task update schema (all fields optional except id)
export const updateTaskSchema = taskSchema.partial().extend({
  id: taskId, // ID is required for updates
});

// API Task schema - for serialization (ISO string timestamps, optional fields)
export const taskApiSchema = taskSchema.extend({
  parentId: optionalTaskId.optional(), // API uses optional instead of null
  description: description.optional(), // API uses optional instead of null
  prd: z.string().optional(),
  contextDigest: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTaskApiSchema = createTaskSchema.extend({
  parentId: optionalTaskId.optional(),
  description: description.optional(),
  prd: z.string().optional(),
  contextDigest: z.string().optional(),
});

// Basic transformation functions for database <-> API compatibility
export function taskToApi(task: Task): TaskApi {
  return {
    ...task,
    parentId: task.parentId ?? undefined,
    description: task.description ?? undefined,
    prd: task.prd ?? undefined,
    contextDigest: task.contextDigest ?? undefined,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function taskFromApi(apiTask: TaskApi): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...apiTask,
    parentId: apiTask.parentId ?? null,
    description: apiTask.description ?? null,
    prd: apiTask.prd ?? null,
    contextDigest: apiTask.contextDigest ?? null,
  };
}

// Basic task validation - just schema validation
export function validateTask(task: Task): boolean {
  taskSchema.parse(task);
  return true;
}

// Derived types
export type Task = z.infer<typeof taskSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type TaskApi = z.infer<typeof taskApiSchema>;
export type CreateTaskApi = z.infer<typeof createTaskApiSchema>;
export type TaskStatus = z.infer<typeof taskStatus>;
export type TaskPriority = z.infer<typeof taskPriority>;

// Legacy alias for backward compatibility (can be removed later)
/** @deprecated Use CreateTask instead */
export type NewTask = CreateTask;
