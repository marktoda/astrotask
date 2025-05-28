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
import { RunnableSequence } from '@langchain/core/runnables';
import type { ChatOpenAI } from '@langchain/openai';
import type { Logger } from 'pino';

import type { CreateTask } from '../../schemas/task.js';
import { TrackingTaskTree } from '../../utils/TrackingTaskTree.js';
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
  private chain: RunnableSequence<LLMChainInput, LLMChainResult> | null = null;

  constructor(
    private llm: ChatOpenAI,
    private logger: Logger
  ) {
    this.initializeChain();
  }

  /**
   * Generate tasks from PRD content
   */
  async generate(input: GenerationInput, parentId?: string | null): Promise<CreateTask[]> {
    const startTime = Date.now();

    try {
      // Validate input first
      const validation = await this.validate(input);
      if (!validation.valid) {
        throw new GenerationError(
          GenerationErrorType.INVALID_INPUT,
          `Invalid input: ${validation.errors?.join(', ')}`,
          { validation }
        );
      }

      // Prepare chain input
      const chainInput: LLMChainInput = {
        content: input.content,
        existingTasks: input.context?.existingTasks || [],
        metadata: input.metadata || {},
      };

      this.logger.info('Starting PRD task generation', {
        contentLength: input.content.length,
        existingTasksCount: chainInput.existingTasks.length,
        parentId,
      });

      // Execute the LLM chain
      if (!this.chain) {
        throw new GenerationError(GenerationErrorType.LLM_ERROR, 'LLM chain not initialized');
      }

      const result: LLMChainResult = await this.chain.invoke(chainInput);

      // Add parentId to all generated tasks
      const createTasks: CreateTask[] = result.tasks.map((task) => ({
        ...task,
        parentId: parentId ?? undefined, // Convert null to undefined for CreateTask compatibility
      }));

      // Log successful generation
      const metadata = {
        generator: this.type,
        inputSize: input.content.length,
        processingTime: Date.now() - startTime,
        model: this.llm.modelName,
        confidence: result.confidence,
        tasksGenerated: createTasks.length,
        warnings: result.warnings,
        ...input.metadata,
      };

      this.logger.info('Tasks generated successfully', metadata);

      return createTasks;
    } catch (error) {
      this.logger.error('Task generation failed', {
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
        `Task generation failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
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
    const startTime = Date.now();

    try {
      // Validate input first
      const validation = await this.validate(input);
      if (!validation.valid) {
        throw new GenerationError(
          GenerationErrorType.INVALID_INPUT,
          `Validation failed: ${validation.errors?.join(', ') ?? 'Unknown error'}`,
          { validation }
        );
      }

      // Generate flat tasks using existing method
      const createTasks = await this.generate(input);

      if (createTasks.length === 0) {
        throw new GenerationError(
          GenerationErrorType.PARSING_ERROR,
          'No tasks were generated from the input',
          { input: input.content.substring(0, 200) }
        );
      }

      // Create root task representing the PRD/epic
      const rootTaskData: CreateTask = {
        title: (input.metadata?.title as string) || this.extractTitleFromContent(input.content),
        description: this.extractSummaryFromContent(input.content),
        status: 'pending',
        priority: 'high',
        prd: input.content,
        contextDigest: `Generated from PRD at ${new Date().toISOString()}`,
      };

      // Create root task tree
      const rootTask = {
        id: `root-${Date.now()}`, // Temporary ID, will be replaced during persistence
        parentId: null,
        title: rootTaskData.title,
        description: rootTaskData.description ?? null,
        status: rootTaskData.status,
        priority: rootTaskData.priority,
        prd: rootTaskData.prd ?? null,
        contextDigest: rootTaskData.contextDigest ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create child trees from generated tasks
      const childTrees = createTasks.map((task) => {
        const childTask = {
          id: `child-${Date.now()}-${Math.random()}`, // Temporary ID
          parentId: null, // Will be set when added as child
          title: task.title,
          description: task.description ?? null,
          status: task.status,
          priority: task.priority,
          prd: task.prd ?? null,
          contextDigest: task.contextDigest ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return TrackingTaskTree.fromTask(childTask);
      });

      // Create root tracking tree
      let trackingTree = TrackingTaskTree.fromTask(rootTask);

      // Add all children to the root
      for (const childTree of childTrees) {
        trackingTree = trackingTree.addChild(childTree);
      }

      // Log successful generation
      const metadata = {
        generator: this.type,
        inputSize: input.content.length,
        processingTime: Date.now() - startTime,
        model: this.llm.modelName,
        rootTitle: rootTask.title,
        childrenGenerated: childTrees.length,
        ...input.metadata,
      };

      this.logger.info('Task tree generated successfully', metadata);

      return trackingTree;
    } catch (error) {
      this.logger.error('Task tree generation failed', {
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
        `Task tree generation failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
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

    return `Epic generated from PRD content (${Math.round(content.length / 1000)}k chars)`;
  }

  /**
   * Initialize the LangChain processing chain
   */
  private initializeChain(): void {
    try {
      // Create the prompt template
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', PRD_SYSTEM_PROMPT],
        ['human', '{userPrompt}'],
      ]);

      // Create output parser for structured JSON
      const outputParser = new JsonOutputParser();

      // Create the processing chain
      this.chain = RunnableSequence.from([
        {
          userPrompt: (input: LLMChainInput) =>
            generatePRDPrompt(input.content, input.existingTasks, input.metadata),
        },
        prompt,
        this.llm,
        outputParser,
      ]) as RunnableSequence<LLMChainInput, LLMChainResult>;

      this.logger.info('LangChain processing chain initialized', {
        model: this.llm.modelName,
        temperature: this.llm.temperature,
      });
    } catch (error) {
      this.logger.error('Failed to initialize LLM chain', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GenerationError(
        GenerationErrorType.LLM_ERROR,
        'Failed to initialize LLM processing chain',
        { originalError: error }
      );
    }
  }
}

/**
 * Factory function to create a PRD task generator
 */
export function createPRDTaskGenerator(
  logger: Logger,
  llmConfig?: Parameters<typeof createLLM>[0]
): PRDTaskGenerator {
  const llm = createLLM(llmConfig);
  return new PRDTaskGenerator(llm, logger);
}
