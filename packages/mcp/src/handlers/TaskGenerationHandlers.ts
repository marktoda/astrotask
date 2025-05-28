/**
 * @fileoverview MCP handlers for task generation operations
 * 
 * This module implements MCP tools for generating tasks from various input sources.
 * Currently supports PRD-based generation with LangChain integration.
 * 
 * @module handlers/TaskGenerationHandlers
 * @since 1.0.0
 */

import type { 
  HandlerContext, 
  MCPHandler, 
  GenerateTasksInput,
  ListGeneratorsInput,
  ValidateGenerationInputInput,
  TaskTreeNode,
  GenerationMetadata,
  GeneratorType
} from './types.js';
import { createPRDTaskGenerator, type GenerationError, createModuleLogger, getCurrentModelConfig, type Task, TaskService, TrackingTaskTree, TaskTree } from '@astrolabe/core';
import { taskToApi } from '@astrolabe/core';

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
   * Converts a TaskTree node to TaskTreeNode interface
   */
  private taskTreeToNode(tree: TaskTree): TaskTreeNode {
    return {
      id: tree.id,
      title: tree.task.title,
      description: tree.task.description,
      status: tree.task.status,
      priority: tree.task.priority,
      childCount: tree.getChildren().length,
      children: tree.getChildren().map(child => this.taskTreeToNode(child)),
      parentId: tree.getParent()?.id ?? null,
    };
  }

  /**
   * Converts a TrackingTaskTree node to TaskTreeNode interface
   */
  private trackingTreeToNode(tree: TrackingTaskTree): TaskTreeNode {
    return {
      id: tree.id,
      title: tree.task.title,
      description: tree.task.description,
      status: tree.task.status,
      priority: tree.task.priority,
      childCount: tree.getChildren().length,
      children: tree.getChildren().map(child => this.taskTreeToNode(child)),
      parentId: tree.getParent()?.id ?? null,
    };
  }

  /**
   * Generate tasks from input content using specified generator
   * Now supports both hierarchical (default) and flat task generation
   */
  async generateTasks(params: GenerateTasksInput): Promise<{
    tree?: TaskTreeNode;
    tasks?: ReturnType<typeof taskToApi>[];
    metadata: GenerationMetadata;
  }> {
    // Type-safe generator validation
    const generatorType: GeneratorType = params.type;
    
    const useHierarchical = params.hierarchical !== false; // Default to true

    try {
      // Create PRD generator
      const prdGenerator = createPRDTaskGenerator(this.logger, this.context.store);

      if (useHierarchical) {
        // Generate hierarchical task tree
        const trackingTree = await prdGenerator.generateTaskTree({
          content: params.content,
          context: {
            parentTaskId: params.context?.parentTaskId,
          },
          metadata: params.metadata,
        });

        if (params.persist) {
          // Apply the reconciliation plan directly using taskService
          const plan = trackingTree.createReconciliationPlan();
          const updatedTree = await this.context.taskService.applyReconciliationPlan(plan);
          
          // Process dependencies if they were generated
          if (prdGenerator.processPendingDependencies) {
            // Extract child task IDs from the updated tree
            const childTaskIds = updatedTree.getChildren().map(child => child.id);
            await prdGenerator.processPendingDependencies(childTaskIds);
          }
          
          // Return persisted tree with real IDs
          const metadata: GenerationMetadata = {
            generator: generatorType,
            persisted: true,
            hierarchical: true,
            rootTaskId: updatedTree.id,
            totalTasks: 1 + updatedTree.getChildren().length,
            requestId: this.context.requestId,
            timestamp: this.context.timestamp,
          };

          return {
            tree: this.taskTreeToNode(updatedTree),
            metadata,
          };
        } else {
          // Return unpersisted tree with temporary IDs
          const metadata: GenerationMetadata = {
            generator: generatorType,
            persisted: false,
            hierarchical: true,
            totalTasks: 1 + trackingTree.getChildren().length,
            hasPendingOperations: trackingTree.hasPendingChanges,
            requestId: this.context.requestId,
            timestamp: this.context.timestamp,
          };

          return {
            tree: this.trackingTreeToNode(trackingTree),
            metadata,
          };
        }
      } else {
        // Generate reconciliation plan and apply it directly
        // Load existing tasks for context if requested
        let existingTasks: Task[] = [];
        if (params.context?.existingTasks) {
          const taskPromises = params.context.existingTasks.map((id) => 
            this.context.store.getTask(id)
          );
          const tasks = await Promise.all(taskPromises);
          existingTasks = tasks.filter((task): task is Task => task !== null);
        }

        // Generate reconciliation plan
        const plan = await prdGenerator.generate({
          content: params.content,
          context: {
            existingTasks,
            parentTaskId: params.context?.parentTaskId,
          },
          metadata: params.metadata,
        });

        // Apply the reconciliation plan directly using taskService
        const updatedTree = await this.context.taskService.applyReconciliationPlan(plan);

        // Get all tasks from the updated tree (root + children)
        const allTasks = [updatedTree.task];
        const addChildrenRecursively = (tree: TaskTree): void => {
          for (const child of tree.getChildren()) {
            allTasks.push(child.task);
            addChildrenRecursively(child);
          }
        };
        addChildrenRecursively(updatedTree);

        // Convert applied tasks to API format
        const apiTasks = allTasks.map(taskToApi);

        const metadata: GenerationMetadata = {
          generator: generatorType,
          persisted: true,
          hierarchical: false,
          totalTasks: apiTasks.length,
          operationsApplied: plan.operations.length,
          requestId: this.context.requestId,
          timestamp: this.context.timestamp,
        };

        return {
          tasks: apiTasks,
          metadata,
        };
      }
    } catch (error) {
      this.logger.error('Task generation failed', {
        error: error instanceof Error ? error.message : String(error),
        generatorType,
        requestId: this.context.requestId,
      });

      // Re-throw the original error without trying to cast it
      throw error;
    }
  }

  /**
   * List available task generators and their capabilities
   */
  async listGenerators(params: ListGeneratorsInput = { includeMetadata: false }): Promise<{
    generators: Array<{
      type: GeneratorType;
      name: string;
      description: string;
      supportedFormats: string[];
      metadata?: {
        modelConfig: any;
        capabilities: string[];
        limitations: string[];
      };
    }>;
  }> {
    const generators = [
      {
        type: 'prd' as GeneratorType,
        name: 'PRD Task Generator',
        description: 'Generates hierarchical task structures from Product Requirements Documents',
        supportedFormats: ['text', 'markdown'],
        ...(params.includeMetadata && {
          metadata: {
            modelConfig: getCurrentModelConfig(),
            capabilities: [
              'Hierarchical task generation',
              'Context-aware task creation',
              'Automatic priority assignment',
              'Implementation detail extraction'
            ],
            limitations: [
              'English language only',
              'Maximum 100 tasks per generation',
              'Requires structured input'
            ]
          }
        })
      }
    ];

    return { generators };
  }

  /**
   * Validate input content for task generation
   */
  async validateGenerationInput(params: ValidateGenerationInputInput): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
    estimatedTasks: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Content validation
    if (!params.content || params.content.trim().length === 0) {
      errors.push('Content cannot be empty');
    }

    if (params.content.length < 50) {
      warnings.push('Content is very short, may result in limited task generation');
    }

    if (params.content.length > 10000) {
      warnings.push('Content is very long, consider breaking it into smaller sections');
    }

    // Metadata validation
    if (params.metadata?.maxTasks && params.metadata.maxTasks > 100) {
      errors.push('Maximum tasks cannot exceed 100');
    }

    // Estimate number of tasks based on content length and complexity
    const wordCount = params.content.split(/\s+/).length;
    const complexity = params.metadata?.complexity || 'moderate';
    
    let estimatedTasks = Math.ceil(wordCount / 100); // Base estimate
    
    switch (complexity) {
      case 'simple':
        estimatedTasks = Math.max(1, Math.ceil(estimatedTasks * 0.5));
        break;
      case 'complex':
        estimatedTasks = Math.ceil(estimatedTasks * 1.5);
        break;
      default: // moderate
        break;
    }

    // Cap the estimate
    estimatedTasks = Math.min(estimatedTasks, params.metadata?.maxTasks || 50);

    // Suggestions
    if (wordCount < 100) {
      suggestions.push('Consider adding more detail to generate more comprehensive tasks');
    }

    if (!params.content.includes('requirement') && !params.content.includes('feature')) {
      suggestions.push('Include specific requirements or features for better task generation');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      estimatedTasks,
    };
  }
} 