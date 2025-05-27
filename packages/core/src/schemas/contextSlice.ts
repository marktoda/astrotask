import { z } from 'zod';
import { description, optionalUuid, title, uuid } from './base.js';

// Database ContextSlice schema - matches what Drizzle returns (Date objects, nullable fields)
export const contextSliceSchema = z.object({
  id: uuid,
  title: title,
  description: description.nullable(), // Database returns null, not undefined

  // Core context fields for AI context resolution
  taskId: optionalUuid.nullable(), // Database returns null, not undefined
  projectId: optionalUuid.nullable(), // Database returns null, not undefined

  // Context digest for AI agents (from design doc)
  contextDigest: z.string().nullable(),

  // Timestamps as Date objects (matches database return type)
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Context creation schema (for database insertion, nullable fields optional)
export const createContextSliceSchema = contextSliceSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
    // Transform API optionals to database nullables
    description: description.optional(),
    taskId: optionalUuid.optional(),
    projectId: optionalUuid.optional(),
    contextDigest: z.string().optional(),
  });

// Context update schema (all fields optional except id)
export const updateContextSliceSchema = contextSliceSchema.partial().extend({
  id: uuid, // ID is required for updates
});

// API ContextSlice schema - for serialization (ISO string timestamps, optional fields)
export const contextSliceApiSchema = contextSliceSchema.extend({
  description: description.optional(), // API uses optional instead of null
  taskId: optionalUuid.optional(), // API uses optional instead of null
  projectId: optionalUuid.optional(), // API uses optional instead of null
  contextDigest: z.string().optional(), // API uses optional instead of null
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createContextSliceApiSchema = createContextSliceSchema.extend({
  description: description.optional(),
  taskId: optionalUuid.optional(),
  projectId: optionalUuid.optional(),
  contextDigest: z.string().optional(),
});

// Transformation utilities for database <-> API compatibility
export function contextSliceToApi(contextSlice: ContextSlice): ContextSliceApi {
  return {
    ...contextSlice,
    description: contextSlice.description ?? undefined, // null -> undefined
    taskId: contextSlice.taskId ?? undefined, // null -> undefined
    projectId: contextSlice.projectId ?? undefined, // null -> undefined
    contextDigest: contextSlice.contextDigest ?? undefined, // null -> undefined
    createdAt: contextSlice.createdAt.toISOString(),
    updatedAt: contextSlice.updatedAt.toISOString(),
  };
}

export function contextSliceFromApi(
  apiContextSlice: ContextSliceApi
): Omit<ContextSlice, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...apiContextSlice,
    description: apiContextSlice.description ?? null, // undefined -> null
    taskId: apiContextSlice.taskId ?? null, // undefined -> null
    projectId: apiContextSlice.projectId ?? null, // undefined -> null
    contextDigest: apiContextSlice.contextDigest ?? null, // undefined -> null
  };
}

// Basic context validation - just schema validation
export function validateContextSlice(context: ContextSlice): boolean {
  contextSliceSchema.parse(context);
  return true;
}

// Type inference
export type ContextSlice = z.infer<typeof contextSliceSchema>;
export type CreateContextSlice = z.infer<typeof createContextSliceSchema>;
export type UpdateContextSlice = z.infer<typeof updateContextSliceSchema>;

// API types for serialization
export type ContextSliceApi = z.infer<typeof contextSliceApiSchema>;
export type CreateContextSliceApi = z.infer<typeof createContextSliceApiSchema>;
