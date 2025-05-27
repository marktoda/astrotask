/**
 * @fileoverview MCP handlers for task generation operations
 * 
 * This module implements MCP tools for generating tasks from various input sources.
 * Currently supports PRD-based generation with LangChain integration.
 * 
 * @module handlers/TaskGenerationHandlers
 * @since 1.0.0
 */

import type { HandlerContext, MCPHandler } from './types.js';
import { createPRDTaskGenerator, type GenerationError, createModuleLogger } from '@astrolabe/core';
import { taskToApi } from '@astrolabe/core';

/**
 * Input schemas for MCP task generation tools
 */
export interface GenerateTasksInput {
  /** Generator type (currently only 'prd' supported) */
  type: string;
  /** Source content to generate tasks from */
  content: string;
  /** Optional context information */
  context?: {
    /** Parent task ID for generated tasks */
    parentTaskId?: string;
    /** Existing task IDs for context */
    existingTasks?: string[];
  };
  /** Generator-specific metadata and options */
  metadata?: Record<string, unknown>;
}

export interface ListGeneratorsInput {
  /** Whether to include detailed metadata about generators */
  includeMetadata?: boolean;
}

export interface ValidateGenerationInputInput {
  /** Generator type to validate against */
  type: string;
  /** Content to validate */
  content: string;
  /** Optional metadata for validation */
  metadata?: Record<string, unknown>;
}

/**
 * MCP handlers for task generation operations
 * 
 * Provides tools for generating tasks from various sources, validating input,
 * and listing available generator types.
 */
export class TaskGenerationHandlers implements MCPHandler {
  private logger = createModuleLogger('TaskGeneration');

  constructor(public readonly context: HandlerContext) {}

  /**
   * Generate tasks from input content using specified generator
   */
  async generateTasks(params: GenerateTasksInput): Promise<object> {
    // Only support PRD generation for now
    if (params.type !== 'prd') {
      throw new Error(
        `Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`
      );
    }

    try {
      // Create PRD generator
      const prdGenerator = createPRDTaskGenerator(
        this.logger
      );

      // Load existing tasks for context if requested
      let existingTasks: any[] = [];
      if (params.context?.existingTasks) {
        const taskPromises = params.context.existingTasks.map((id) => 
          this.context.store.getTask(id)
        );
        const tasks = await Promise.all(taskPromises);
        existingTasks = tasks.filter(Boolean);
      }

      // Generate tasks
      const createTasks = await prdGenerator.generate(
        {
          content: params.content,
          context: {
            existingTasks,
            parentTaskId: params.context?.parentTaskId,
          },
          metadata: params.metadata,
        },
        params.context?.parentTaskId ?? null
      );

      // Convert to API format
      const apiTasks = createTasks.map((task: any) => taskToApi({
        ...task,
        id: 'generated-' + Math.random().toString(36).substr(2, 9), // Temporary ID
        createdAt: new Date(),
        updatedAt: new Date(),
        parentId: task.parentId ?? null,
        description: task.description ?? null,
        prd: task.prd ?? null,
        contextDigest: task.contextDigest ?? null,
      }));

      return {
        tasks: apiTasks,
        metadata: {
          generator: 'prd',
          tasksGenerated: createTasks.length,
          requestId: this.context.requestId,
          timestamp: this.context.timestamp,
        },
      };

    } catch (error) {
      this.logger.error('Task generation failed', {
        error: error instanceof Error ? error.message : String(error),
        type: params.type,
        contentLength: params.content.length,
        requestId: this.context.requestId,
      });

      if (error instanceof Error && 'type' in error) {
        const genError = error as GenerationError;
        throw new Error(`Generation failed: ${genError.message} (${genError.type})`);
      }

      throw new Error(`Task generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List available task generators
   */
  async listGenerators(params: ListGeneratorsInput = {}): Promise<object> {
    const generators = [
      {
        type: 'prd',
        name: 'Product Requirements Document Generator',
        description: 'Generate tasks from PRD documents using LangChain and OpenAI',
        ...(params.includeMetadata && {
          metadata: {
            model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
            maxInputLength: 50000,
            supportedFormats: ['markdown', 'plain text'],
            estimatedProcessingTime: '30-60 seconds',
            typicalTaskCount: '5-15 tasks',
          },
        }),
      },
    ];

    return {
      generators,
      totalCount: generators.length,
      requestId: this.context.requestId,
      timestamp: this.context.timestamp,
    };
  }

  /**
   * Validate input before generation
   */
  async validateGenerationInput(params: ValidateGenerationInputInput): Promise<object> {
    // Only support PRD validation for now
    if (params.type !== 'prd') {
      throw new Error(
        `Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`
      );
    }

    try {
      // Create PRD generator for validation
      const prdGenerator = createPRDTaskGenerator(
        this.logger
      );

      // Perform validation
      const result = await prdGenerator.validate({
        content: params.content,
        metadata: params.metadata,
      });

      return {
        ...result,
        type: params.type,
        contentLength: params.content.length,
        requestId: this.context.requestId,
        timestamp: this.context.timestamp,
      };

    } catch (error) {
      this.logger.error('Input validation failed', {
        error: error instanceof Error ? error.message : String(error),
        type: params.type,
        contentLength: params.content.length,
        requestId: this.context.requestId,
      });

      throw new Error(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 