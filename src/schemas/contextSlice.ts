import { z } from 'zod';
import { description, optionalUuid, title, uuid } from './base.js';

// Simple context for task navigation and AI context resolution
export const contextSliceSchema = z.object({
  id: uuid,
  title: title,
  description: description.optional(),

  // Core context fields for AI context resolution
  taskId: optionalUuid, // Primary task this context relates to
  projectId: optionalUuid, // Project scope

  // Context digest for AI agents (from design doc)
  contextDigest: z.string().optional(),

  // Simple timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Context creation schema (excludes generated fields)
export const createContextSliceSchema = contextSliceSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
  });

// Context update schema (all fields optional except id)
export const updateContextSliceSchema = contextSliceSchema.partial().extend({
  id: uuid, // ID is required for updates
});

// Basic context validation - just schema validation
export function validateContextSlice(context: ContextSlice): boolean {
  contextSliceSchema.parse(context);
  return true;
}

// Type inference
export type ContextSlice = z.infer<typeof contextSliceSchema>;
export type CreateContextSlice = z.infer<typeof createContextSliceSchema>;
export type UpdateContextSlice = z.infer<typeof updateContextSliceSchema>;
