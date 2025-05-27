import { z } from 'zod';
import { description, optionalUuid, title, uuid } from './base.js';

// Database ContextSlice schema - matches what Drizzle returns (Date objects, nullable fields)
export const contextSliceSchema = z.object({
  id: uuid,
  title: title,
  description: description.nullable(), // Database returns null, not undefined

  taskId: optionalUuid.nullable(), // Database returns null, not undefined
  contextDigest: z.string().nullable(),

  // Timestamps as Date objects (matches database return type)
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ContextSlice creation schema (for database insertion, nullable fields optional)
export const createContextSliceSchema = contextSliceSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
    description: description.optional(), // API uses optional, transform to null for DB
    taskId: optionalUuid.optional(), // API uses optional, transform to null for DB
    contextDigest: z.string().optional(),
  });

// ContextSlice update schema (all fields optional except id)
export const updateContextSliceSchema = contextSliceSchema.partial().extend({
  id: uuid, // ID is required for updates
});

// API ContextSlice schema - for serialization (ISO string timestamps, optional fields)
export const contextSliceApiSchema = contextSliceSchema.extend({
  description: description.optional(), // API uses optional instead of null
  taskId: optionalUuid.optional(), // API uses optional instead of null
  contextDigest: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createContextSliceApiSchema = createContextSliceSchema.extend({
  description: description.optional(),
  taskId: optionalUuid.optional(),
  contextDigest: z.string().optional(),
});

// Transformation utilities for database <-> API compatibility
export function contextSliceToApi(contextSlice: ContextSlice): ContextSliceApi {
  return {
    ...contextSlice,
    description: contextSlice.description ?? undefined, // null -> undefined
    taskId: contextSlice.taskId ?? undefined, // null -> undefined
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
    contextDigest: apiContextSlice.contextDigest ?? null, // undefined -> null
  };
}

// Basic context slice validation - just schema validation
export function validateContextSlice(contextSlice: ContextSlice): boolean {
  contextSliceSchema.parse(contextSlice);
  return true;
}

// Derived types
export type ContextSlice = z.infer<typeof contextSliceSchema>;
export type CreateContextSlice = z.infer<typeof createContextSliceSchema>;
export type UpdateContextSlice = z.infer<typeof updateContextSliceSchema>;
export type ContextSliceApi = z.infer<typeof contextSliceApiSchema>;
export type CreateContextSliceApi = z.infer<typeof createContextSliceApiSchema>;
