/**
 * @fileoverview Complexity Context Service
 *
 * This service integrates the ComplexityAnalyzer with the context slice system,
 * automatically generating complexity analysis context slices for tasks.
 *
 * @module services/ComplexityContextService
 * @since 1.0.0
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Store } from '../database/store.js';
import type { ContextSlice, CreateContextSlice, Task } from '../schemas/index.js';
import {
  type ComplexityAnalysisConfig,
  type ComplexityAnalyzer,
  type TaskComplexity,
  createComplexityAnalyzer,
} from './ComplexityAnalyzer.js';
import type { ILLMService } from './LLMService.js';

/**
 * Configuration for complexity context service
 */
export interface ComplexityContextConfig extends Partial<ComplexityAnalysisConfig> {
  /** Whether to automatically update context slices when tasks change */
  autoUpdate?: boolean;
  /** Whether to include subtask recommendations in the context */
  includeRecommendations?: boolean;
}

/**
 * Service for generating and managing complexity analysis context slices
 */
export class ComplexityContextService {
  private analyzer: ComplexityAnalyzer;

  constructor(
    private logger: Logger,
    private store: Store,
    llmService?: ILLMService,
    private config: ComplexityContextConfig = {}
  ) {
    if (!llmService) {
      throw new Error(
        'LLMService is required for ComplexityContextService. Please provide an ILLMService instance.'
      );
    }
    this.analyzer = createComplexityAnalyzer(
      logger,
      {
        threshold: config.threshold || 5,
        research: config.research || false,
        batchSize: config.batchSize || 5,
        ...(config.projectName && { projectName: config.projectName }),
      },
      llmService
    );
  }

  /**
   * Generate or update complexity context slice for a task
   */
  async generateComplexityContext(taskId: string): Promise<ContextSlice> {
    this.logger.info('Generating complexity context for task', { taskId });

    // Get the task
    const task = await this.store.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Analyze task complexity
    const complexity = await this.analyzer.analyzeTask(task);

    // Check if complexity context slice already exists
    const existingContextSlices = await this.store.listContextSlices(taskId);
    const existingComplexitySlice = existingContextSlices.find((slice) =>
      slice.title.toLowerCase().includes('complexity')
    );

    if (existingComplexitySlice) {
      // For now, we'll create a new slice since Store doesn't have update method
      // In a future version, we could add updateContextSlice to the Store interface
      this.logger.info('Complexity context already exists, creating new version', {
        taskId,
        existingId: existingComplexitySlice.id,
      });
    }

    const contextSliceData: CreateContextSlice = {
      id: randomUUID(),
      title: `Complexity Analysis: ${task.title}`,
      description: this.formatComplexityDescription(complexity),
      taskId,
      contextDigest: this.generateComplexityDigest(complexity),
    };

    // Create new slice
    return await this.store.addContextSlice(contextSliceData);
  }

  /**
   * Generate complexity context for multiple tasks
   */
  async generateComplexityContextBatch(taskIds: string[]): Promise<ContextSlice[]> {
    this.logger.info('Generating complexity context for task batch', {
      taskCount: taskIds.length,
    });

    const results: ContextSlice[] = [];

    // Process in smaller batches to avoid overwhelming the system
    const batchSize = this.config.batchSize || 5;
    for (let i = 0; i < taskIds.length; i += batchSize) {
      const batch = taskIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((taskId) => this.generateComplexityContext(taskId))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate complexity context for a task and all its children
   */
  async generateComplexityContextForNodeAndChildren(nodeId: string): Promise<{
    contexts: ContextSlice[];
    report: {
      nodeId: string;
      totalTasks: number;
      averageComplexity: number;
      highComplexityTasks: number;
    };
  }> {
    this.logger.info('Generating complexity context for node and children', { nodeId });

    // Get all tasks
    const allTasks = await this.store.listTasks();

    // Find target node and children
    const targetNode = allTasks.find((task) => task.id === nodeId);
    if (!targetNode) {
      throw new Error(`Task with ID ${nodeId} not found`);
    }

    // Get all children recursively
    const tasksToProcess = this.getNodeAndAllChildren(targetNode, allTasks);
    const taskIds = tasksToProcess.map((task) => task.id);

    // Generate complexity contexts
    const contexts = await this.generateComplexityContextBatch(taskIds);

    // Calculate report statistics
    const complexities = await Promise.all(
      tasksToProcess.map((task) => this.analyzer.analyzeTask(task))
    );

    const averageComplexity =
      complexities.reduce((sum, c) => sum + c.complexityScore, 0) / complexities.length;
    const highComplexityTasks = complexities.filter(
      (c) => c.complexityScore >= (this.config.threshold || 5)
    ).length;

    return {
      contexts,
      report: {
        nodeId,
        totalTasks: tasksToProcess.length,
        averageComplexity,
        highComplexityTasks,
      },
    };
  }

  /**
   * Get complexity context slice for a task (if it exists)
   */
  async getComplexityContext(taskId: string): Promise<ContextSlice | null> {
    const contextSlices = await this.store.listContextSlices(taskId);
    return contextSlices.find((slice) => slice.title.toLowerCase().includes('complexity')) || null;
  }

  /**
   * Get a node and all its children recursively
   */
  private getNodeAndAllChildren(targetNode: Task, allTasks: Task[]): Task[] {
    const result: Task[] = [targetNode];
    const children = allTasks.filter((task) => task.parentId === targetNode.id);

    for (const child of children) {
      result.push(...this.getNodeAndAllChildren(child, allTasks));
    }

    return result;
  }

  /**
   * Format complexity analysis into a readable description
   */
  private formatComplexityDescription(complexity: TaskComplexity): string {
    const lines: string[] = [];

    // Use plain text instead of markdown to avoid blessed tag parsing issues
    lines.push(`Complexity Score: ${complexity.complexityScore}/10`);
    lines.push(`Recommended Subtasks: ${complexity.recommendedSubtasks}`);
    lines.push('');
    lines.push('Analysis:');
    lines.push(complexity.reasoning);

    if (this.config.includeRecommendations !== false) {
      lines.push('');
      lines.push('Expansion Guidance:');
      lines.push(complexity.expansionPrompt);

      if (complexity.complexityScore >= (this.config.threshold || 5)) {
        lines.push('');
        lines.push('⚠️ High Complexity Warning:');
        lines.push('This task is recommended for breakdown into subtasks before implementation.');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate a digest for complexity analysis for change detection
   */
  private generateComplexityDigest(complexity: TaskComplexity): string {
    const data = {
      score: complexity.complexityScore,
      subtasks: complexity.recommendedSubtasks,
      reasoning: complexity.reasoning.substring(0, 100), // First 100 chars
    };
    return JSON.stringify(data);
  }
}

/**
 * Factory function to create a ComplexityContextService instance
 */
export function createComplexityContextService(
  logger: Logger,
  store: Store,
  llmService?: ILLMService,
  config: ComplexityContextConfig = {}
): ComplexityContextService {
  if (!llmService) {
    throw new Error(
      'LLMService is required for ComplexityContextService. Please provide an ILLMService instance.'
    );
  }
  return new ComplexityContextService(logger, store, llmService, config);
}
