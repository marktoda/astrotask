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
