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
import { createPRDTaskGenerator, type GenerationError, createModuleLogger, getCurrentModelConfig, type Task, TaskService } from '@astrolabe/core';
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

export interface GenerateTaskTreeInput {
  /** Generator type (currently only 'prd' supported) */
  type: string;
  /** Source content to generate task tree from */
  content: string;
  /** Optional metadata and options */
  metadata?: Record<string, unknown>;
  /** Whether to persist the generated tree to database */
  persist?: boolean;
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
      let existingTasks: Task[] = [];
      if (params.context?.existingTasks) {
        const taskPromises = params.context.existingTasks.map((id) => 
          this.context.store.getTask(id)
        );
        const tasks = await Promise.all(taskPromises);
        existingTasks = tasks.filter((task): task is Task => task !== null);
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

      // Convert to API format by creating complete Task objects with required fields
      const apiTasks = createTasks.map((task) => taskToApi({
        ...task,
        id: 'generated-' + Math.random().toString(36).substring(2, 11), // Temporary ID
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
    const currentModel = getCurrentModelConfig();
    
    const generators = [
      {
        type: 'prd',
        name: 'Product Requirements Document Generator',
        description: 'Generate tasks from PRD documents using LangChain and OpenAI',
        ...(params.includeMetadata && {
          metadata: {
            model: currentModel.name,
            modelId: currentModel.id,
            provider: currentModel.provider,
            maxInputLength: 50000,
            supportedFormats: ['markdown', 'plain text'],
            estimatedProcessingTime: '30-60 seconds',
            typicalTaskCount: '5-15 tasks',
            maxTokens: currentModel.maxTokens,
            temperature: currentModel.temperature,
            inputCostPer1K: currentModel.inputCostPer1K,
            outputCostPer1K: currentModel.outputCostPer1K,
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

  /**
   * Generate a hierarchical task tree and optionally persist it
   */
  async generateTaskTree(params: GenerateTaskTreeInput): Promise<object> {
    // Only support PRD generation for now
    if (params.type !== 'prd') {
      throw new Error(
        `Unsupported generator type: ${params.type}. Only 'prd' is currently supported.`
      );
    }

    try {
      // Create PRD generator
      const prdGenerator = createPRDTaskGenerator(this.logger);

      // Generate tracking task tree
      const trackingTree = await prdGenerator.generateTaskTree({
        content: params.content,
        metadata: params.metadata,
      });

      if (params.persist) {
        // Create TaskService and persist the tree
        const taskService = new TaskService(this.context.store);
        const persistedTree = await taskService.createTaskTree(trackingTree);

        // Return persisted tree with real IDs
        return {
          tree: {
            id: persistedTree.id,
            title: persistedTree.task.title,
            description: persistedTree.task.description,
            status: persistedTree.task.status,
            priority: persistedTree.task.priority,
            childCount: persistedTree.getChildren().length,
            children: persistedTree.getChildren().map(child => ({
              id: child.id,
              title: child.task.title,
              description: child.task.description,
              status: child.task.status,
              priority: child.task.priority,
            })),
          },
          metadata: {
            generator: 'prd',
            persisted: true,
            rootTaskId: persistedTree.id,
            totalTasks: 1 + persistedTree.getChildren().length,
            requestId: this.context.requestId,
            timestamp: this.context.timestamp,
          },
        };
      } else {
        // Return unpersisted tree with temporary IDs
        return {
          tree: {
            id: trackingTree.id,
            title: trackingTree.task.title,
            description: trackingTree.task.description,
            status: trackingTree.task.status,
            priority: trackingTree.task.priority,
            childCount: trackingTree.getChildren().length,
            pendingOperations: trackingTree.pendingOperations.length,
            children: trackingTree.getChildren().map(child => ({
              id: child.id,
              title: child.task.title,
              description: child.task.description,
              status: child.task.status,
              priority: child.task.priority,
            })),
          },
          metadata: {
            generator: 'prd',
            persisted: false,
            totalTasks: 1 + trackingTree.getChildren().length,
            hasPendingOperations: trackingTree.hasPendingChanges,
            requestId: this.context.requestId,
            timestamp: this.context.timestamp,
          },
        };
      }

    } catch (error) {
      this.logger.error('Task tree generation failed', {
        error: error instanceof Error ? error.message : String(error),
        type: params.type,
        contentLength: params.content.length,
        persist: params.persist,
        requestId: this.context.requestId,
      });

      if (error instanceof Error && 'type' in error) {
        const genError = error as GenerationError;
        throw new Error(`Tree generation failed: ${genError.message} (${genError.type})`);
      }

      throw new Error(`Task tree generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 