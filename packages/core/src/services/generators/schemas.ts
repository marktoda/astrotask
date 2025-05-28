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
 * Metadata schema for PRD generation
 */
export const prdMetadataSchema = z.object({
  /** Maximum number of tasks to generate */
  maxTasks: z.number().min(1).max(100).optional(),
  /** Target complexity level */
  complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  /** Include implementation details */
  includeDetails: z.boolean().optional(),
  /** Preferred task priority */
  defaultPriority: z.enum(['low', 'medium', 'high']).optional(),
  /** Source document type */
  sourceType: z.enum(['prd', 'requirements', 'specification']).optional(),
  /** Language of the content */
  language: z.string().optional(),
  /** Source of the generation request (e.g., 'cli', 'mcp', 'web') */
  source: z.string().optional(),
  /** Source file path if applicable */
  file: z.string().optional(),
  /** Generator type used */
  generator: z.string().optional(),
});

/**
 * Generation metadata for tracking and analytics
 */
export const generationMetadataSchema = z.object({
  /** Generation timestamp */
  timestamp: z.date().optional(),
  /** Model used for generation */
  model: z.string().optional(),
  /** Processing time in milliseconds */
  processingTime: z.number().optional(),
  /** Token usage statistics */
  tokenUsage: z
    .object({
      input: z.number(),
      output: z.number(),
      total: z.number(),
    })
    .optional(),
  /** Confidence score */
  confidence: z.number().min(0).max(1).optional(),
});

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
      /** Additional context metadata */
      metadata: prdMetadataSchema.optional(),
    })
    .optional(),
  /** Generator-specific metadata and options */
  metadata: prdMetadataSchema.optional(),
});

/**
 * Context information for task generation
 */
export const generationContextSchema = z.object({
  /** Existing tasks for context awareness */
  existingTasks: z.array(taskSchema).optional(),
  /** Parent task ID if generating subtasks */
  parentTaskId: z.string().nullable().optional(),
  /** Additional context metadata */
  metadata: prdMetadataSchema.optional(),
});

/**
 * Result of task generation
 */
export const generationResultSchema = z.object({
  /** Generated tasks ready for database insertion */
  tasks: z.array(createTaskSchema),
  /** Generation metadata and analytics */
  metadata: generationMetadataSchema.optional(),
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
  /** Estimated number of tasks that would be generated */
  estimatedTasks: z.number().optional(),
});

/**
 * LLM chain input structure
 */
export const llmChainInputSchema = z.object({
  /** Content to analyze */
  content: z.string(),
  /** Existing tasks for context */
  existingTasks: z.array(taskSchema),
  /** Generation metadata */
  metadata: prdMetadataSchema,
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
  /** Generation metadata */
  metadata: generationMetadataSchema.optional(),
});

// Exported types
export type PRDMetadata = z.infer<typeof prdMetadataSchema>;
export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationContext = z.infer<typeof generationContextSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type LLMChainInput = z.infer<typeof llmChainInputSchema>;
export type LLMChainResult = z.infer<typeof llmChainResultSchema>;
