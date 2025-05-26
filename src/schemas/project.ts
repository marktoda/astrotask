import { z } from 'zod';
import { description, title, uuid } from './base.js';

// Simple project status
export const projectStatus = z.enum(['active', 'completed', 'archived']).default('active');

// Core Project schema - simple and focused
export const projectSchema = z.object({
  id: uuid,
  title: title,
  description: description.optional(),
  status: projectStatus,
  priority: z.enum(['low', 'medium', 'high']).default('medium'),

  // Simple timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Project creation schema (excludes generated fields)
export const createProjectSchema = projectSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    id: uuid.optional(), // Allow optional ID for creation
  });

// Project update schema (all fields optional except id)
export const updateProjectSchema = projectSchema.partial().extend({
  id: uuid, // ID is required for updates
});

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
