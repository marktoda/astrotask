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
import type { CreateTask, Task } from '../../schemas/task.js';
import { TaskService } from '../../services/TaskService.js';
import type { TaskTree } from '../../utils/TaskTree.js';
import { type ReconciliationPlan, TrackingTaskTree } from '../../utils/TrackingTaskTree.js';
import { createLLM } from '../../utils/llm.js';
import { PRD_SYSTEM_PROMPT, generatePRDPrompt } from '../../utils/prompts.js';
import type { TaskGenerator } from './TaskGenerator.js';
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

  constructor(
    private llm: ChatOpenAI,
    private logger: Logger,
    private taskService: TaskService
  ) {
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
   * Generate a reconciliation plan representing the task hierarchy from PRD content
   */
  async generate(input: GenerationInput): Promise<ReconciliationPlan> {
    return this.withErrorHandling('generate', input, async () => {
      // Generate the task tree first
      const trackingTree = await this.generateTaskTree(input);

      // Create the reconciliation plan from the tracking tree
      // The TrackingTaskTree will handle root task creation if needed
      const plan = trackingTree.createReconciliationPlan();

      this.logger.info('Reconciliation plan generated successfully', {
        generator: this.type,
        inputSize: input.content.length,
        model: this.llm.modelName,
        treeId: plan.treeId,
        operationsCount: plan.operations.length,
        ...input.metadata,
      });

      return plan;
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
  async generateTaskTree(input: GenerationInput): Promise<TrackingTaskTree> {
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

      // Execute the LLM chain to get flat tasks
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

      this.logger.info('LLM generated tasks', { count: flatTasks.length });

      // Create the PRD epic task as the root of our generated tree
      const prdEpic = this.createRootTask(input);

      // Convert flat tasks to full Task objects
      const childTasks = flatTasks.map((createTask, index) =>
        this.createTaskToTask(createTask, prdEpic.id, index + 1)
      );

      // Build the tracking tree with the PRD epic and its children
      return this.buildTrackingTree(existingTree, prdEpic, childTasks);
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
      title: (input.metadata?.title as string) || this.extractTitleFromContent(input.content),
      description: this.extractSummaryFromContent(input.content),
      status: 'pending',
      priority: 'high',
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
      priority: createTask.priority,
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
    // Start with the existing tree
    let trackingTree = TrackingTaskTree.fromTaskTree(existingTree);

    // Create PRD epic tree
    let prdEpicTree = TrackingTaskTree.fromTask(prdEpic);

    // Add all child tasks to the PRD epic
    for (const childTask of childTasks) {
      const childTree = TrackingTaskTree.fromTask(childTask);
      prdEpicTree = prdEpicTree.addChild(childTree);
    }

    // Add the PRD epic (with its children) to the existing tree
    trackingTree = trackingTree.addChild(prdEpicTree);

    this.logger.info('Task tree built successfully', {
      prdEpicTitle: prdEpic.title,
      childTasksCount: childTasks.length,
      existingTreeId: existingTree.id,
    });

    return trackingTree;
  }
}

/**
 * Factory function to create a PRDTaskGenerator instance
 *
 * @param llm - Configured ChatOpenAI instance for task generation
 * @param logger - Logger instance for operation tracking
 * @param taskService - TaskService instance for task operations
 * @returns Configured PRDTaskGenerator instance
 */
export function createPRDTaskGeneratorWithDeps(
  llm: ChatOpenAI,
  logger: Logger,
  taskService: TaskService
): PRDTaskGenerator {
  return new PRDTaskGenerator(llm, logger, taskService);
}

/**
 * Factory function to create a PRDTaskGenerator instance with automatic dependency creation
 *
 * @param logger - Logger instance for operation tracking
 * @param store - Database store instance for task operations
 * @returns Configured PRDTaskGenerator instance
 */
export function createPRDTaskGenerator(logger: Logger, store: Store): PRDTaskGenerator {
  // Create LLM instance using default configuration
  const llm = createLLM();

  // Create TaskService instance
  const taskService = new TaskService(store);

  return new PRDTaskGenerator(llm, logger, taskService);
}
