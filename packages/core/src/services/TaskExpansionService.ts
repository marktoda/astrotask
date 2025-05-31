/**
 * @fileoverview Task Expansion Service
 *
 * This service provides an enhanced task expansion workflow that integrates
 * with complexity analysis to create well-structured subtasks based on
 * complexity assessment and research-backed expansion strategies.
 *
 * @module services/TaskExpansionService
 * @since 1.0.0
 */

import type { Logger } from 'pino';
import type { Store } from '../database/store.js';
import type { Task } from '../schemas/task.js';
import {
  type ComplexityAnalyzer,
  type ComplexityReport,
  type TaskComplexity,
  createComplexityAnalyzer,
} from './ComplexityAnalyzer.js';
import {
  type ComplexityContextService,
  createComplexityContextService,
} from './ComplexityContextService.js';
import type { TaskService } from './TaskService.js';
import { type PRDTaskGenerator, createPRDTaskGenerator } from './generators/PRDTaskGenerator.js';

/**
 * Configuration for task expansion
 */
export interface TaskExpansionConfig {
  /** Whether to use complexity analysis for expansion recommendations */
  useComplexityAnalysis: boolean;
  /** Whether to enable research mode for more informed expansion */
  research: boolean;
  /** Complexity threshold for automatic expansion recommendations */
  complexityThreshold: number;
  /** Default number of subtasks when no complexity analysis is available */
  defaultSubtasks: number;
  /** Maximum number of subtasks to create */
  maxSubtasks: number;
  /** Whether to force clear existing subtasks before expansion */
  forceReplace: boolean;
  /** Whether to create context slices for complexity analysis */
  createContextSlices: boolean;
  /** Project name for complexity analysis metadata */
  projectName?: string;
}

/**
 * Input parameters for task expansion
 */
export interface TaskExpansionInput {
  /** Task ID to expand */
  taskId: string;
  /** Optional number of subtasks to create (overrides complexity recommendations) */
  numSubtasks?: number;
  /** Optional additional context for expansion */
  context?: string;
  /** Whether to use research mode for this expansion */
  research?: boolean;
  /** Whether to force replace existing subtasks */
  force?: boolean;
}

/**
 * Result of task expansion operation
 */
export interface TaskExpansionResult {
  /** The parent task that was expanded */
  parentTask: Task;
  /** The generated subtasks */
  subtasks: Task[];
  /** Complexity analysis used for expansion (if available) */
  complexityAnalysis?: TaskComplexity;
  /** Whether complexity analysis was used */
  usedComplexityAnalysis: boolean;
  /** Number of context slices created */
  contextSlicesCreated: number;
  /** Detailed message about the expansion process */
  message: string;
  /** Additional expansion metadata */
  metadata: {
    expansionMethod: 'complexity-guided' | 'manual' | 'default';
    recommendedSubtasks?: number;
    actualSubtasks: number;
    researchEnabled: boolean;
    forcedReplacement: boolean;
  };
}

/**
 * Enhanced Task Expansion Service
 */
export class TaskExpansionService {
  private complexityAnalyzer: ComplexityAnalyzer;
  private complexityContextService: ComplexityContextService;
  private prdGenerator: PRDTaskGenerator;

  constructor(
    private logger: Logger,
    private store: Store,
    private taskService: TaskService,
    private config: TaskExpansionConfig
  ) {
    // Initialize complexity analyzer
    this.complexityAnalyzer = createComplexityAnalyzer(logger, {
      threshold: config.complexityThreshold,
      research: config.research,
      batchSize: 5,
      ...(config.projectName && { projectName: config.projectName }),
    });

    // Initialize complexity context service
    this.complexityContextService = createComplexityContextService(logger, store, {
      threshold: config.complexityThreshold,
      research: config.research,
      autoUpdate: true,
      includeRecommendations: true,
      ...(config.projectName && { projectName: config.projectName }),
    });

    // Initialize PRD task generator
    this.prdGenerator = createPRDTaskGenerator(logger, store);
  }

  /**
   * Expand a task using complexity-guided workflow
   */
  async expandTask(input: TaskExpansionInput): Promise<TaskExpansionResult> {
    this.logger.info('Starting task expansion', {
      taskId: input.taskId,
      useComplexityAnalysis: this.config.useComplexityAnalysis,
      numSubtasks: input.numSubtasks,
      research: input.research ?? this.config.research,
    });

    // Get the parent task
    const parentTask = await this.store.getTask(input.taskId);
    if (!parentTask) {
      throw new Error(`Task ${input.taskId} not found`);
    }

    // Check if we should force replace existing subtasks
    const shouldForceReplace = input.force ?? this.config.forceReplace;
    if (shouldForceReplace) {
      await this.clearExistingSubtasks(input.taskId);
    }

    let complexityAnalysis: TaskComplexity | undefined;
    let usedComplexityAnalysis = false;
    let expansionMethod: 'complexity-guided' | 'manual' | 'default' = 'default';
    let recommendedSubtasks: number | undefined;
    let actualNumSubtasks: number;

    // Determine number of subtasks and expansion strategy
    if (input.numSubtasks) {
      // Manual override - user specified exact number
      actualNumSubtasks = Math.min(input.numSubtasks, this.config.maxSubtasks);
      expansionMethod = 'manual';
      this.logger.info('Using manual subtask count', {
        requested: input.numSubtasks,
        actual: actualNumSubtasks,
      });
    } else if (this.config.useComplexityAnalysis) {
      // Use complexity analysis to determine optimal subtask count
      try {
        complexityAnalysis = await this.complexityAnalyzer.analyzeTask(parentTask);
        recommendedSubtasks = complexityAnalysis.recommendedSubtasks;
        actualNumSubtasks = Math.min(recommendedSubtasks, this.config.maxSubtasks);
        usedComplexityAnalysis = true;
        expansionMethod = 'complexity-guided';

        this.logger.info('Using complexity-guided expansion', {
          complexityScore: complexityAnalysis.complexityScore,
          recommended: recommendedSubtasks,
          actual: actualNumSubtasks,
        });
      } catch (error) {
        this.logger.warn('Complexity analysis failed, falling back to default', {
          error: error instanceof Error ? error.message : String(error),
        });
        actualNumSubtasks = this.config.defaultSubtasks;
      }
    } else {
      // Use default number of subtasks
      actualNumSubtasks = this.config.defaultSubtasks;
    }

    // Create expansion content with complexity insights
    const expansionContent = this.createExpansionPrompt(
      parentTask,
      actualNumSubtasks,
      input.context,
      complexityAnalysis
    );

    // Determine if research should be enabled
    const researchEnabled = input.research ?? this.config.research;

    // Generate subtasks using PRD generator
    const generationResult = await this.prdGenerator.generate({
      content: expansionContent,
      context: {
        parentTaskId: input.taskId,
        existingTasks: await this.getContextualTasks(input.taskId),
      },
      metadata: {
        maxTasks: actualNumSubtasks,
        // Note: Additional metadata like research mode, expansion method, and complexity score
        // are not part of the standard PRDMetadata schema. These could be added in future
        // versions or handled through alternative mechanisms.
      },
    });

    // Apply the generated subtasks
    const { updatedTree } = await generationResult.tree.flush(this.taskService);
    const subtasks = updatedTree.getChildren().map((child) => child.task);

    // Create complexity context slice if enabled
    let contextSlicesCreated = 0;
    if (this.config.createContextSlices && complexityAnalysis) {
      try {
        await this.complexityContextService.generateComplexityContext(input.taskId);
        contextSlicesCreated = 1;
        this.logger.info('Created complexity context slice', { taskId: input.taskId });
      } catch (error) {
        this.logger.warn('Failed to create complexity context slice', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Create detailed result message
    const message = this.createExpansionMessage(
      parentTask,
      subtasks.length,
      expansionMethod,
      complexityAnalysis,
      researchEnabled
    );

    const result: TaskExpansionResult = {
      parentTask,
      subtasks,
      ...(complexityAnalysis && { complexityAnalysis }),
      usedComplexityAnalysis,
      contextSlicesCreated,
      message,
      metadata: {
        expansionMethod,
        ...(recommendedSubtasks !== undefined && { recommendedSubtasks }),
        actualSubtasks: subtasks.length,
        researchEnabled,
        forcedReplacement: shouldForceReplace,
      },
    };

    this.logger.info('Task expansion completed', {
      taskId: input.taskId,
      subtasksCreated: subtasks.length,
      expansionMethod,
      usedComplexityAnalysis,
      contextSlicesCreated,
    });

    return result;
  }

  /**
   * Expand multiple tasks based on complexity analysis
   */
  async expandTasksBatch(
    taskIds: string[],
    options: Partial<TaskExpansionInput> = {}
  ): Promise<TaskExpansionResult[]> {
    this.logger.info('Starting batch task expansion', {
      taskCount: taskIds.length,
      options,
    });

    const results: TaskExpansionResult[] = [];

    // Process tasks sequentially to avoid overwhelming the system
    for (const taskId of taskIds) {
      try {
        const result = await this.expandTask({
          taskId,
          ...options,
        });
        results.push(result);
      } catch (error) {
        this.logger.error('Failed to expand task in batch', {
          taskId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other tasks rather than failing the entire batch
      }
    }

    this.logger.info('Batch task expansion completed', {
      totalTasks: taskIds.length,
      successfulExpansions: results.length,
      failedExpansions: taskIds.length - results.length,
    });

    return results;
  }

  /**
   * Analyze and expand high-complexity tasks automatically
   */
  async expandHighComplexityTasks(complexityThreshold?: number): Promise<{
    complexityReport: ComplexityReport;
    expansionResults: TaskExpansionResult[];
    summary: {
      tasksAnalyzed: number;
      highComplexityTasks: number;
      tasksExpanded: number;
      totalSubtasksCreated: number;
    };
  }> {
    const threshold = complexityThreshold ?? this.config.complexityThreshold;

    this.logger.info('Starting automatic expansion of high-complexity tasks', {
      threshold,
    });

    // Get all tasks and analyze complexity
    const allTasks = await this.store.listTasks();
    const complexityReport = await this.complexityAnalyzer.analyzeTasks(allTasks);

    // Identify high-complexity tasks that should be expanded
    const highComplexityTasks = complexityReport.complexityAnalysis
      .filter((analysis) => analysis.complexityScore >= threshold)
      .sort((a, b) => b.complexityScore - a.complexityScore); // Highest complexity first

    this.logger.info('Identified high-complexity tasks for expansion', {
      totalTasks: allTasks.length,
      highComplexityCount: highComplexityTasks.length,
      threshold,
    });

    // Expand high-complexity tasks
    const expansionResults: TaskExpansionResult[] = [];
    for (const taskAnalysis of highComplexityTasks) {
      try {
        // Check if task already has subtasks
        const existingSubtasks = await this.store.listTasks({ parentId: taskAnalysis.taskId });
        if (existingSubtasks.length > 0 && !this.config.forceReplace) {
          this.logger.info('Skipping task that already has subtasks', {
            taskId: taskAnalysis.taskId,
            existingSubtasksCount: existingSubtasks.length,
          });
          continue;
        }

        const result = await this.expandTask({
          taskId: taskAnalysis.taskId,
          numSubtasks: taskAnalysis.recommendedSubtasks,
          research: this.config.research,
          force: this.config.forceReplace,
        });

        expansionResults.push(result);
      } catch (error) {
        this.logger.error('Failed to expand high-complexity task', {
          taskId: taskAnalysis.taskId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const summary = {
      tasksAnalyzed: allTasks.length,
      highComplexityTasks: highComplexityTasks.length,
      tasksExpanded: expansionResults.length,
      totalSubtasksCreated: expansionResults.reduce(
        (sum, result) => sum + result.subtasks.length,
        0
      ),
    };

    this.logger.info('Automatic expansion of high-complexity tasks completed', summary);

    return {
      complexityReport,
      expansionResults,
      summary,
    };
  }

  /**
   * Clear existing subtasks for a task
   */
  private async clearExistingSubtasks(taskId: string): Promise<void> {
    const existingSubtasks = await this.store.listTasks({ parentId: taskId });

    if (existingSubtasks.length > 0) {
      this.logger.info('Clearing existing subtasks', {
        taskId,
        subtaskCount: existingSubtasks.length,
      });

      // Delete existing subtasks
      for (const subtask of existingSubtasks) {
        await this.taskService.deleteTaskTree(subtask.id, true);
      }
    }
  }

  /**
   * Get contextual tasks for better subtask generation
   */
  private async getContextualTasks(taskId: string): Promise<Task[]> {
    try {
      // Get sibling tasks (same parent) for context
      const task = await this.store.getTask(taskId);
      if (!task?.parentId) {
        return [];
      }

      const siblingTasks = await this.store.listTasks({ parentId: task.parentId });
      return siblingTasks.filter((t) => t.id !== taskId);
    } catch (error) {
      this.logger.warn('Failed to get contextual tasks', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Create expansion prompt with complexity insights
   */
  private createExpansionPrompt(
    task: Task,
    numSubtasks: number,
    userContext?: string,
    complexityAnalysis?: TaskComplexity
  ): string {
    const sections: string[] = [];

    sections.push(`Expand this task into ${numSubtasks} concrete, actionable subtasks:`);
    sections.push('');
    sections.push(`**Task Title:** ${task.title}`);
    sections.push(`**Description:** ${task.description || 'No description provided'}`);
    sections.push(`**Priority:** ${task.priority}`);
    sections.push(`**Status:** ${task.status}`);

    if (task.prd) {
      sections.push('');
      sections.push('**PRD Context:**');
      sections.push(task.prd);
    }

    if (complexityAnalysis) {
      sections.push('');
      sections.push('**Complexity Analysis:**');
      sections.push(`- Complexity Score: ${complexityAnalysis.complexityScore}/10`);
      sections.push(`- Reasoning: ${complexityAnalysis.reasoning}`);
      sections.push(`- Recommended Subtasks: ${complexityAnalysis.recommendedSubtasks}`);

      if (complexityAnalysis.expansionPrompt) {
        sections.push('');
        sections.push('**Expansion Guidance:**');
        sections.push(complexityAnalysis.expansionPrompt);
      }
    }

    if (userContext) {
      sections.push('');
      sections.push('**Additional Context:**');
      sections.push(userContext);
    }

    sections.push('');
    sections.push('**Requirements:**');
    sections.push('- Each subtask should be specific and actionable');
    sections.push('- Subtasks should be well-scoped and implementable');
    sections.push('- Include clear acceptance criteria where applicable');
    sections.push('- Consider dependencies between subtasks');
    sections.push('- Focus on implementation details and technical requirements');

    return sections.join('\n');
  }

  /**
   * Create detailed expansion result message
   */
  private createExpansionMessage(
    parentTask: Task,
    subtaskCount: number,
    expansionMethod: string,
    complexityAnalysis?: TaskComplexity,
    researchEnabled?: boolean
  ): string {
    const parts: string[] = [];

    parts.push(`Successfully expanded task "${parentTask.title}" into ${subtaskCount} subtasks`);

    if (complexityAnalysis) {
      parts.push(
        `using complexity-guided analysis (score: ${complexityAnalysis.complexityScore}/10)`
      );
    } else {
      parts.push(`using ${expansionMethod} expansion strategy`);
    }

    if (researchEnabled) {
      parts.push('with research-enhanced generation');
    }

    return parts.join(' ');
  }
}

/**
 * Factory function to create TaskExpansionService with default configuration
 */
export function createTaskExpansionService(
  logger: Logger,
  store: Store,
  taskService: TaskService,
  config: Partial<TaskExpansionConfig> = {}
): TaskExpansionService {
  const defaultConfig: TaskExpansionConfig = {
    useComplexityAnalysis: true,
    research: false,
    complexityThreshold: 5,
    defaultSubtasks: 3,
    maxSubtasks: 15,
    forceReplace: false,
    createContextSlices: true,
    ...config,
  };

  return new TaskExpansionService(logger, store, taskService, defaultConfig);
}
