import { z } from 'zod';
import { description, title, uuid } from './base.js';

// Simple project status
export const projectStatus = z.enum(['active', 'completed', 'archived']).default('active');

// Database Project schema - matches what Drizzle returns (Date objects, nullable fields)
export const projectSchema = z.object({
  id: uuid,
  title: title,
  description: description.nullable(), // Database returns null, not undefined
  status: projectStatus,
  priority: z.enum(['low', 'medium', 'high']).default('medium'),

  // Timestamps as Date objects (matches database return type)
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Project creation schema (for database insertion, nullable fields optional)
export const createProjectSchema = projectSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
    description: description.optional(), // API uses optional, transform to null for DB
  });

// Project update schema (all fields optional except id)
export const updateProjectSchema = projectSchema.partial().extend({
  id: uuid, // ID is required for updates
});

// API Project schema - for serialization (ISO string timestamps, optional fields)
export const projectApiSchema = projectSchema.extend({
  description: description.optional(), // API uses optional instead of null
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createProjectApiSchema = createProjectSchema.extend({
  description: description.optional(),
});

// Transformation utilities for database <-> API compatibility
export function projectToApi(project: Project): ProjectApi {
  return {
    ...project,
    description: project.description ?? undefined, // null -> undefined
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function projectFromApi(
  apiProject: ProjectApi
): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...apiProject,
    description: apiProject.description ?? null, // undefined -> null
  };
}

// Basic project validation - just schema validation
export function validateProject(project: Project): boolean {
  projectSchema.parse(project);
  return true;
}

// Type inference
export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type ProjectStatus = z.infer<typeof projectStatus>;

// API types for serialization
export type ProjectApi = z.infer<typeof projectApiSchema>;
export type CreateProjectApi = z.infer<typeof createProjectApiSchema>;
