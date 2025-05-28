/**
 * @fileoverview Zod schemas for task generation system
 *
 * This module defines validation schemas for all task generation operations.
 * Used by generators and MCP handlers to ensure type safety and input validation.
 *
 * @module services/generators/schemas
 * @since 1.0.0
 */

import { z } from 'zod';
import { createTaskSchema, taskSchema } from '../../schemas/task.js';

/**
 * Input data for task generation
 */
export const generationInputSchema = z.object({
  /** The source content to generate tasks from */
  content: z.string().min(1, 'Content cannot be empty'),
  /** Optional context information */
  context: z
    .object({
      /** Existing tasks for context (full Task objects) */
      existingTasks: z.array(taskSchema).optional(),
      /** Parent task ID for generated tasks */
      parentTaskId: z.string().optional(),
      /** Additional metadata */
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
  /** Generator-specific metadata and options */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Context information for task generation
 */
export const generationContextSchema = z.object({
  /** Existing tasks for context awareness */
  existingTasks: z.array(taskSchema).optional(),
  /** Parent task ID if generating subtasks */
  parentTaskId: z.string().nullable().optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Result of task generation
 */
export const generationResultSchema = z.object({
  /** Generated tasks ready for database insertion */
  tasks: z.array(createTaskSchema),
  /** Optional metadata about the generation process */
  metadata: z.record(z.unknown()).optional(),
  /** Any warnings from the generation process */
  warnings: z.array(z.string()).optional(),
});

/**
 * Validation result for input content
 */
export const validationResultSchema = z.object({
  /** Whether the input is valid */
  valid: z.boolean(),
  /** Validation errors if any */
  errors: z.array(z.string()).optional(),
  /** Validation warnings if any */
  warnings: z.array(z.string()).optional(),
  /** Suggestions for improvement */
  suggestions: z.array(z.string()).optional(),
});

/**
 * LLM chain input structure
 */
export const llmChainInputSchema = z.object({
  /** Content to analyze */
  content: z.string(),
  /** Existing tasks for context */
  existingTasks: z.array(taskSchema),
  /** Additional metadata */
  metadata: z.record(z.unknown()),
});

/**
 * LLM chain result structure
 */
export const llmChainResultSchema = z.object({
  /** Generated tasks without parentId */
  tasks: z.array(createTaskSchema.omit({ parentId: true })),
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Any warnings from the LLM */
  warnings: z.array(z.string()).optional(),
});

// Exported types
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationContext = z.infer<typeof generationContextSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type LLMChainInput = z.infer<typeof llmChainInputSchema>;
export type LLMChainResult = z.infer<typeof llmChainResultSchema>;
