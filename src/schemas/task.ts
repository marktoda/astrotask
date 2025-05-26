import { z } from 'zod';
import { description, optionalUuid, title, uuid } from './base.js';

// Simple task status enum
export const taskStatus = z
  .enum(['pending', 'in-progress', 'done', 'cancelled'])
  .default('pending');

// Core Task schema - simple and focused
export const taskSchema = z.object({
  id: uuid,
  parentId: optionalUuid,
  title: title,
  description: description.optional(),
  status: taskStatus,

  // Core content fields from design doc
  prd: z.string().optional(),
  contextDigest: z.string().optional(),

  // Simple timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Task creation schema (excludes generated fields)
export const createTaskSchema = taskSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
  });

// Task update schema (all fields optional except id)
export const updateTaskSchema = taskSchema.partial().extend({
  id: uuid, // ID is required for updates
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

// Type inference
export type Task = z.infer<typeof taskSchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type TaskStatus = z.infer<typeof taskStatus>;
