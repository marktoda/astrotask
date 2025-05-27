/**
 * Validation framework for MCP Server
 *
 * Provides:
 * - Input validation schemas
 * - Request sanitization
 * - Security validation
 * - Type-safe parameter parsing
 */

import { z } from 'zod';
import { ValidationError } from '../errors/index.js';

/**
 * Security-aware string validation with sanitization
 */
export const sanitizedString = (
  options: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
  } = {}
) => {
  const { min = 0, max = 1000, pattern, allowEmpty = false } = options;

  return z
    .string()
    .min(
      allowEmpty ? 0 : Math.max(min, 1),
      `Must be at least ${allowEmpty ? 0 : Math.max(min, 1)} characters`
    )
    .max(max, `Must be at most ${max} characters`)
    .transform((str) => str.trim()) // Remove leading/trailing whitespace
    .refine((str) => allowEmpty || str.length > 0, 'Cannot be empty after trimming')
    .refine((str) => {
      // Basic security checks
      if (str.includes('<script>') || str.includes('</script>')) {
        throw new Error('Script tags are not allowed');
      }
      if (str.includes('javascript:')) {
        throw new Error('JavaScript protocols are not allowed');
      }
      return true;
    }, 'Contains potentially malicious content')
    .refine((str) => !pattern || pattern.test(str), `Must match the required pattern`);
};

/**
 * UUID validation with proper format checking
 */
export const uuidSchema = z.string().uuid('Must be a valid UUID').describe('UUID identifier');

/**
 * Task status enum with validation
 */
export const taskStatusSchema = z
  .enum(['pending', 'in-progress', 'done', 'cancelled'])
  .describe('Task status');

/**
 * Priority level validation
 */
export const prioritySchema = z.enum(['low', 'medium', 'high']).describe('Priority level');

/**
 * Pagination parameters
 */
export const paginationSchema = z
  .object({
    page: z.number().int().min(1).default(1).describe('Page number (1-based)'),
    limit: z.number().int().min(1).max(100).default(20).describe('Items per page'),
    offset: z.number().int().min(0).optional().describe('Number of items to skip'),
  })
  .transform((data) => ({
    ...data,
    offset: data.offset ?? (data.page - 1) * data.limit,
  }));

/**
 * Base pagination fields for extending other schemas
 */
export const paginationFields = {
  page: z.number().int().min(1).default(1).describe('Page number (1-based)'),
  limit: z.number().int().min(1).max(100).default(20).describe('Items per page'),
  offset: z.number().int().min(0).optional().describe('Number of items to skip'),
};

/**
 * Task creation validation schema
 */
export const createTaskSchema = z.object({
  title: sanitizedString({ min: 1, max: 200 }).describe('Task title'),
  description: sanitizedString({ max: 2000, allowEmpty: true })
    .optional()
    .describe('Task description'),
  parentId: uuidSchema.optional().describe('Parent task ID for subtasks'),
  projectId: uuidSchema.optional().describe('Project ID'),
  status: taskStatusSchema.default('pending').describe('Initial task status'),
  priority: prioritySchema.default('medium').describe('Task priority'),
  prd: sanitizedString({ max: 10000, allowEmpty: true })
    .optional()
    .describe('Product Requirements Document content'),
  contextDigest: sanitizedString({ max: 1000, allowEmpty: true })
    .optional()
    .describe('Context digest for the task'),
  tags: z
    .array(sanitizedString({ min: 1, max: 50 }))
    .max(10)
    .optional()
    .describe('Task tags (max 10)'),
});

/**
 * Task update validation schema
 */
export const updateTaskSchema = z.object({
  id: uuidSchema.describe('Task ID to update'),
  title: sanitizedString({ min: 1, max: 200 }).optional().describe('New task title'),
  description: sanitizedString({ max: 2000, allowEmpty: true })
    .optional()
    .describe('New task description'),
  status: taskStatusSchema.optional().describe('New task status'),
  parentId: uuidSchema.optional().describe('New parent task ID'),
  priority: prioritySchema.optional().describe('New task priority'),
  prd: sanitizedString({ max: 10000, allowEmpty: true })
    .optional()
    .describe('Product Requirements Document content'),
  contextDigest: sanitizedString({ max: 1000, allowEmpty: true })
    .optional()
    .describe('Context digest for the task'),
  tags: z
    .array(sanitizedString({ min: 1, max: 50 }))
    .max(10)
    .optional()
    .describe('Task tags (max 10)'),
});

/**
 * Task listing/filtering validation schema
 */
export const listTasksSchema = z
  .object({
    status: taskStatusSchema.optional().describe('Filter tasks by status'),
    projectId: uuidSchema.optional().describe('Filter tasks by project ID'),
    parentId: uuidSchema.optional().describe('Filter tasks by parent ID (for subtasks)'),
    includeSubtasks: z.boolean().default(false).describe('Include subtasks in the response'),
    priority: prioritySchema.optional().describe('Filter tasks by priority'),
    tags: z
      .array(sanitizedString({ min: 1, max: 50 }))
      .max(5)
      .optional()
      .describe('Filter tasks by tags (max 5)'),
    search: sanitizedString({ max: 100, allowEmpty: true })
      .optional()
      .describe('Search term for title/description'),
    ...paginationFields,
  })
  .transform((data) => ({
    ...data,
    offset: data.offset ?? (data.page - 1) * data.limit,
  }));

/**
 * Task deletion validation schema
 */
export const deleteTaskSchema = z.object({
  id: uuidSchema.describe('Task ID to delete'),
  cascade: z.boolean().default(true).describe('Delete all subtasks as well'),
});

/**
 * Task completion validation schema
 */
export const completeTaskSchema = z.object({
  id: uuidSchema.describe('Task ID to complete'),
});

/**
 * Task context retrieval validation schema
 */
export const getTaskContextSchema = z.object({
  id: uuidSchema.describe('Task ID to get context for'),
  includeAncestors: z.boolean().default(true).describe('Include ancestor tasks'),
  includeDescendants: z.boolean().default(true).describe('Include descendant tasks'),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe('Maximum depth for context retrieval'),
});

/**
 * Generic validation function with enhanced error handling
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context?: Record<string, unknown>
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError.fromZodError(error);
    }
    throw new ValidationError('Invalid input format', undefined, input, context);
  }
}

/**
 * Async validation function for schemas with async transforms
 */
export async function validateInputAsync<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await schema.parseAsync(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw ValidationError.fromZodError(error);
    }
    throw new ValidationError('Invalid input format', undefined, input, context);
  }
}

/**
 * Safe parsing that returns a result object instead of throwing
 */
export function safeValidateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: ValidationError.fromZodError(error) };
    }
    return {
      success: false,
      error: new ValidationError('Invalid input format', undefined, input),
    };
  }
}

/**
 * Rate limiting validation schema
 */
export const rateLimitSchema = z.object({
  windowMs: z.number().int().min(1000).max(3600000).default(60000), // 1 second to 1 hour
  maxRequests: z.number().int().min(1).max(1000).default(100),
  skipSuccessfulRequests: z.boolean().default(false),
  skipFailedRequests: z.boolean().default(false),
});

/**
 * Configuration validation schema
 */
export const configSchema = z.object({
  server: z.object({
    port: z.number().int().min(1).max(65535).default(3000),
    host: z.string().default('localhost'),
    timeout: z.number().int().min(1000).max(300000).default(30000), // 1s to 5min
  }),
  database: z.object({
    path: sanitizedString({ min: 1, max: 500 }),
    timeout: z.number().int().min(1000).max(60000).default(5000),
    maxConnections: z.number().int().min(1).max(100).default(10),
  }),
  rateLimit: rateLimitSchema,
  security: z.object({
    enableCors: z.boolean().default(true),
    corsOrigins: z.array(z.string()).default(['*']),
    enableHelmet: z.boolean().default(true),
    maxRequestSize: z.string().default('10mb'),
  }),
});

/**
 * Environment variable validation
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MCP_SERVER_PORT: z
    .string()
    .transform((val) => Number.parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535))
    .default('3000'),
  MCP_SERVER_HOST: z.string().default('localhost'),
  DATABASE_PATH: z.string().default('./data/mcp-server.db'),
});

/**
 * Tool name validation
 */
export const toolNameSchema = z
  .enum(['listTasks', 'createTask', 'updateTask', 'deleteTask', 'completeTask', 'getTaskContext'])
  .describe('Valid MCP tool name');
