/**
 * @fileoverview PRD-based task generator implementation
 *
 * This module implements task generation from Product Requirements Documents
 * using LangChain and OpenAI for intelligent task breakdown and creation.
 *
 * @module services/generators/PRDTaskGenerator
 * @since 1.0.0
 */

import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { RunnableSequence } from '@langchain/core/runnables';
import type { ChatOpenAI } from '@langchain/openai';
import type { Logger } from 'pino';

import type { Store } from '../../database/store.js';
import type { TaskTree } from '../../entities/TaskTree.js';
import { TASK_IDENTIFIERS } from '../../entities/TaskTreeConstants.js';
import { TrackingDependencyGraph } from '../../entities/TrackingDependencyGraph.js';
import { TrackingTaskTree } from '../../entities/TrackingTaskTree.js';
import type { CreateTask, Task } from '../../schemas/task.js';
import { TaskService } from '../../services/TaskService.js';
import { PRD_SYSTEM_PROMPT, generatePRDPrompt } from '../../utils/prompts.js';
import type { ILLMService } from '../LLMService.js';
import type { GenerationResult, TaskGenerator } from './TaskGenerator.js';
import type {
  GenerationInput,
  LLMChainInput,
  LLMChainResult,
  ValidationResult,
} from './schemas.js';

/**
 * Error types specific to task generation
 */
export enum GenerationErrorType {
  INVALID_INPUT = 'invalid_input',
  LLM_ERROR = 'llm_error',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  PARSING_ERROR = 'parsing_error',
  VALIDATION_ERROR = 'validation_error',
}

/**
 * Custom error class for generation operations
 */
export class GenerationError extends Error {
  constructor(
    public type: GenerationErrorType,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/**
 * PRD-based task generator using LangChain and OpenAI
 *
 * This generator analyzes Product Requirements Documents and creates
 * actionable implementation tasks using AI-powered analysis.
 */
export class PRDTaskGenerator implements TaskGenerator {
  readonly type = 'prd';
  private chain: RunnableSequence<{ formattedPrompt: string }, LLMChainResult> | null = null;
  private pendingDependencies: {
    dependencies: Array<{
      dependentTaskIndex: number;
      dependencyTaskIndex: number;
      reason?: string | undefined;
    }>;
    childTaskIds: string[];
  } | null = null;
  private llm: ChatOpenAI;
  private taskService: TaskService;

  constructor(
    private logger: Logger,
    store: Store,
    llmService?: ILLMService
  ) {
    if (!llmService) {
      throw new Error(
        'LLMService is required for PRDTaskGenerator. Please provide an ILLMService instance.'
      );
    }
    this.llm = llmService.getChatModel();
    this.taskService = new TaskService(store);
    this.initializeChain();
  }

  /**
   * Initialize the LangChain processing chain
   */
  private initializeChain(): void {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', PRD_SYSTEM_PROMPT],
      ['human', '{formattedPrompt}'],
    ]);

    const parser = new JsonOutputParser();

    this.chain = prompt.pipe(this.llm).pipe(parser) as RunnableSequence<
      { formattedPrompt: string },
      LLMChainResult
    >;
  }

  /**
   * Generate both task tree and dependency graph from PRD input
   *
   * This is the primary generation method that creates a complete task hierarchy
   * with dependency relationships and returns both as tracking structures that
   * can be applied to any compatible store.
   *
   * @param input - The input content and context for generation
   * @returns Promise resolving to GenerationResult with both tree and graph
   * @throws {Error} When generation fails due to invalid input or processing errors
   */
  async generate(input: GenerationInput): Promise<GenerationResult> {
    return this.withErrorHandling('generate', input, async () => {
      // Generate the task tree first
      const trackingTree = await this.generateTaskTree(input);

      // Create tracking dependency graph with any pending dependencies
      let trackingGraph = TrackingDependencyGraph.empty('generated-dependencies');

      // If we have pending dependencies, add them to the tracking graph
      if (this.pendingDependencies) {
        const { dependencies, childTaskIds } = this.pendingDependencies;

        this.logger.info('Adding dependencies to tracking graph', {
          dependenciesCount: dependencies.length,
          childTasksCount: childTaskIds.length,
        });

        // Convert dependency indices to actual task IDs and add to tracking graph
        for (const dep of dependencies) {
          if (this.areIndicesValid(dep, childTaskIds.length)) {
            const dependentTaskId = childTaskIds[dep.dependentTaskIndex];
            const dependencyTaskId = childTaskIds[dep.dependencyTaskIndex];

            if (dependentTaskId && dependencyTaskId) {
              trackingGraph = trackingGraph.withDependency(dependentTaskId, dependencyTaskId);

              this.logger.debug('Added dependency to tracking graph', {
                dependentTaskId,
                dependencyTaskId,
                reason: dep.reason,
              });
            }
          }
        }

        // Clear pending dependencies since they're now in the tracking graph
        this.pendingDependencies = null;
      }

      this.logger.info('Generation completed successfully', {
        generator: this.type,
        inputSize: input.content.length,
        model: this.llm.modelName,
        treeOperations: trackingTree.pendingOperations.length,
        dependencyOperations: trackingGraph.pendingOperations.length,
        ...input.metadata,
      });

      return {
        tree: trackingTree,
        graph: trackingGraph,
      };
    });
  }

  /**
   * Validate PRD input before generation
   */
  async validate(input: GenerationInput): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check content length
    if (input.content.length === 0) {
      errors.push('Empty content provided');
    }

    if (input.content.length > 50000) {
      errors.push('Content too large (max 50KB)');
      suggestions.push('Split into smaller documents or focus on specific features');
    }

    // Check content quality
    if (input.content.length < 100) {
      warnings.push('Content is very short - may not generate comprehensive tasks');
      suggestions.push('Provide more detailed requirements for better task generation');
    }

    // Check for common PRD sections
    const hasRequirements = /requirements?|features?|functionality/i.test(input.content);
    const hasUserStories = /user story|user stories|as a|given when then/i.test(input.content);
    const hasTechnical = /technical|architecture|implementation|api|database/i.test(input.content);

    if (!hasRequirements && !hasUserStories) {
      warnings.push('Content may not contain clear requirements or user stories');
      suggestions.push('Include specific requirements or user stories for better task generation');
    }

    if (!hasTechnical) {
      warnings.push('No technical details found - tasks may be high-level');
      suggestions.push('Include technical requirements or constraints for more specific tasks');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Generate a hierarchical task tree from PRD input
   */
  private async generateTaskTree(input: GenerationInput): Promise<TrackingTaskTree> {
    return this.withErrorHandling('generateTaskTree', input, async () => {
      // Validate input first
      await this.validateInput(input);

      // Prepare chain input
      const chainInput: LLMChainInput = {
        content: input.content,
        existingTasks: input.context?.existingTasks || [],
        metadata: input.metadata || {},
      };

      this.logger.info('Starting PRD task tree generation', {
        contentLength: input.content.length,
        existingTasksCount: chainInput.existingTasks.length,
        parentTaskId: input.context?.parentTaskId,
      });

      // Get the existing task tree from the database
      // If parentTaskId is provided, use that specific task as the root
      // If not provided, use the project root (undefined gets the project root)
      const existingTree = await this.taskService.getTaskTree(input.context?.parentTaskId);

      // The database initialization ensures there's always a project root,
      // so existingTree should never be null
      if (!existingTree) {
        throw new GenerationError(
          GenerationErrorType.VALIDATION_ERROR,
          `Parent task not found: ${input.context?.parentTaskId || 'project root'}`
        );
      }

      // Execute the LLM chain to get flat tasks and dependencies
      if (!this.chain) {
        throw new GenerationError(GenerationErrorType.LLM_ERROR, 'LLM chain not initialized');
      }

      // Format the prompt using the helper function
      const formattedPrompt = generatePRDPrompt(
        chainInput.content,
        chainInput.existingTasks,
        chainInput.metadata
      );

      const result = await this.chain.invoke({ formattedPrompt });
      const flatTasks = this.validateLLMResult(result);

      this.logger.info('LLM generated tasks', {
        count: flatTasks.length,
        dependenciesCount: result.dependencies?.length || 0,
      });

      // Create the PRD epic task as the root of our generated tree
      const prdEpic = this.createRootTask(input);

      // Convert flat tasks to full Task objects
      const childTasks = flatTasks.map((createTask, index) =>
        this.createTaskToTask(createTask, prdEpic.id, index + 1)
      );

      // Build the tracking tree with the PRD epic and its children
      const trackingTree = this.buildTrackingTree(existingTree, prdEpic, childTasks);

      // Store dependency information for later processing
      // We'll store this in the generator instance for post-processing
      if (result.dependencies && result.dependencies.length > 0) {
        this.logger.info('Storing dependency plan for post-processing', {
          dependenciesCount: result.dependencies.length,
        });

        // Store dependency plan for later creation after persistence
        this.pendingDependencies = {
          dependencies: result.dependencies,
          childTaskIds: childTasks.map((task) => task.id),
        };
      }

      return trackingTree;
    });
  }

  /**
   * Common error handling wrapper for generation operations
   */
  private async withErrorHandling<T>(
    operation: string,
    input: GenerationInput,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    try {
      return await fn();
    } catch (error) {
      this.logger.error(`${operation} failed`, {
        error: error instanceof Error ? error.message : String(error),
        contentLength: input.content.length,
        processingTime: Date.now() - startTime,
      });

      if (error instanceof GenerationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new GenerationError(
        GenerationErrorType.LLM_ERROR,
        `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }

  /**
   * Validate input and throw on failure
   */
  private async validateInput(input: GenerationInput): Promise<void> {
    const validation = await this.validate(input);
    if (!validation.valid) {
      throw new GenerationError(
        GenerationErrorType.INVALID_INPUT,
        `Invalid input: ${validation.errors?.join(', ')}`,
        { validation }
      );
    }
  }

  /**
   * Create root task from PRD input
   */
  private createRootTask(input: GenerationInput): Task {
    const now = new Date();
    return {
      id: `root-${Date.now()}`, // Temporary ID, will be replaced during persistence
      parentId: null,
      title: this.extractTitleFromContent(input.content),
      description: this.extractSummaryFromContent(input.content),
      status: 'pending',
      priorityScore: 75, // High priority = 75
      prd: input.content,
      contextDigest: `Generated from PRD at ${now.toISOString()}`,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Validate LLM result and extract tasks
   */
  private validateLLMResult(result: LLMChainResult): CreateTask[] {
    if (!result.tasks || result.tasks.length === 0) {
      throw new GenerationError(
        GenerationErrorType.PARSING_ERROR,
        'No tasks were generated from the input'
      );
    }
    return result.tasks;
  }

  /**
   * Convert CreateTask to Task with proper hierarchy
   */
  private createTaskToTask(createTask: CreateTask, parentId: string, index: number): Task {
    return {
      id: `${parentId}.${index}`,
      parentId,
      title: createTask.title,
      description: createTask.description || null,
      status: createTask.status,
      priorityScore: createTask.priorityScore ?? 50, // Use provided score or default to 50
      prd: createTask.prd || null,
      contextDigest: createTask.contextDigest || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract title from PRD content
   */
  private extractTitleFromContent(content: string): string {
    // Look for markdown headers or title patterns
    const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/title:\s*(.+)/i);
    if (titleMatch?.[1]) {
      return titleMatch[1].trim();
    }

    // Fall back to first line or generic title
    const firstLine = content.split('\n')[0]?.trim();
    if (firstLine && firstLine.length > 0 && firstLine.length < 100) {
      return firstLine;
    }

    return 'Generated Epic from PRD';
  }

  /**
   * Extract summary from PRD content
   */
  private extractSummaryFromContent(content: string): string {
    // Look for summary or overview sections
    const summaryMatch = content.match(/(?:summary|overview|description):\s*(.+?)(?:\n\n|\n#|$)/i);
    if (summaryMatch?.[1]) {
      return summaryMatch[1].trim();
    }

    // Fall back to first paragraph
    const firstParagraph = content.split('\n\n')[0]?.trim();
    if (firstParagraph && firstParagraph.length > 20 && firstParagraph.length < 500) {
      return firstParagraph;
    }

    return 'Epic task generated from Product Requirements Document';
  }

  /**
   * Build tracking tree with PRD epic and its children
   */
  private buildTrackingTree(
    existingTree: TaskTree,
    prdEpic: Task,
    childTasks: Task[]
  ): TrackingTaskTree {
    // Start with the existing tree (which should be PROJECT_ROOT)
    let trackingTree = TrackingTaskTree.fromTaskTree(existingTree);

    // Update the PRD epic to have the correct parent ID (PROJECT_ROOT)
    const prdEpicWithCorrectParent = {
      ...prdEpic,
      parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
    };

    // Create PRD epic tree and add it to the project root
    const prdEpicTree = TrackingTaskTree.fromTask(prdEpicWithCorrectParent);
    trackingTree = trackingTree.addChild(prdEpicTree);

    // Add child tasks to the PRD epic tree
    // The child tasks will reference the temporary PRD epic ID,
    // but this will be resolved during flush via ID mapping
    for (const childTask of childTasks) {
      const childTree = TrackingTaskTree.fromTask(childTask);
      // Find the PRD epic in the tracking tree and add children to it
      const prdEpicInTree = trackingTree.find((task) => task.id === prdEpic.id);
      if (prdEpicInTree) {
        prdEpicInTree.addChild(childTree);
      }
    }

    this.logger.info('Task tree built successfully', {
      prdEpicTitle: prdEpic.title,
      childTasksCount: childTasks.length,
      existingTreeId: existingTree.id,
      operationsCount: trackingTree.pendingOperations.length,
    });

    return trackingTree;
  }

  /**
   * Validate that dependency indices are within bounds
   */
  private areIndicesValid(
    dep: { dependentTaskIndex: number; dependencyTaskIndex: number },
    childTasksCount: number
  ): boolean {
    if (dep.dependentTaskIndex >= childTasksCount || dep.dependencyTaskIndex >= childTasksCount) {
      this.logger.warn('Dependency indices out of bounds', {
        dependentIndex: dep.dependentTaskIndex,
        dependencyIndex: dep.dependencyTaskIndex,
        childTasksCount,
      });
      return false;
    }
    return true;
  }
}

/**
 * Factory function to create a PRDTaskGenerator instance
 *
 * @param logger - Logger instance for operation tracking
 * @param store - Database store instance for task operations
 * @param llmService - Optional LLMService instance for task generation
 * @returns Configured PRDTaskGenerator instance
 */
export function createPRDTaskGenerator(
  logger: Logger,
  store: Store,
  llmService?: ILLMService
): PRDTaskGenerator {
  if (!llmService) {
    throw new Error(
      'LLMService is required for PRDTaskGenerator. Please provide an ILLMService instance.'
    );
  }
  return new PRDTaskGenerator(logger, store, llmService);
}
