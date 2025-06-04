import type { ChatOpenAI } from '@langchain/openai';
import { ChatOpenAI as ChatOpenAIImpl } from '@langchain/openai';
import { cfg } from '../utils/config.js';
import { type ModelConfig, getModelConfig } from '../utils/models.js';

/**
 * Configuration options for LLM instances
 */
export interface LLMConfig {
  /** OpenAI API key */
  apiKey?: string;
  /** Model name to use */
  modelName?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Minimal interface that exposes the LLM chat model used by services that need it.
 * Having a single surface area makes mocking trivial in unit-tests and allows
 * alternative providers (Anthropic, local models, etc.) without touching business logic.
 */
export interface ILLMService {
  /**
   * Obtain a ChatOpenAI-compatible instance.
   */
  getChatModel(): ChatOpenAI;

  /**
   * Get current LLM configuration
   */
  getConfig(): Required<LLMConfig>;

  /**
   * Validate the current configuration
   */
  validateConfig(): string[];

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean;

  /**
   * Get current model configuration from registry
   */
  getModelConfig(): ModelConfig;
}

/**
 * Enhanced LLM service that handles all configuration, validation, and model creation.
 * This service is self-contained and includes all logic previously in utils/llm.ts
 */
export class DefaultLLMService implements ILLMService {
  private model?: ChatOpenAI;
  private readonly overrides: Partial<LLMConfig>;
  private cachedConfig?: Required<LLMConfig>;

  constructor(overrides: Partial<LLMConfig> = {}) {
    this.overrides = overrides;
  }

  getChatModel(): ChatOpenAI {
    if (!this.model) {
      this.model = this.createLLM();
    }
    return this.model;
  }

  getConfig(): Required<LLMConfig> {
    if (!this.cachedConfig) {
      this.cachedConfig = this.buildConfig();
    }
    return this.cachedConfig;
  }

  validateConfig(): string[] {
    const config = this.getConfig();
    const errors: string[] = [];

    if (!config.apiKey || config.apiKey.trim() === '') {
      errors.push('API key is required');
    }

    if (config.temperature < 0 || config.temperature > 1) {
      errors.push('Temperature must be between 0 and 1');
    }

    if (config.maxTokens <= 0) {
      errors.push('Max tokens must be positive');
    }

    if (config.timeout <= 0) {
      errors.push('Timeout must be positive');
    }

    return errors;
  }

  isConfigured(): boolean {
    try {
      const errors = this.validateConfig();
      return errors.length === 0;
    } catch {
      return false;
    }
  }

  getModelConfig(): ModelConfig {
    const config = this.getConfig();
    return getModelConfig(config.modelName);
  }

  /**
   * Build complete configuration from defaults, model config, and overrides
   */
  private buildConfig(): Required<LLMConfig> {
    const modelConfig = getModelConfig(this.overrides.modelName ?? cfg.LLM_MODEL);

    return {
      apiKey: this.overrides.apiKey ?? cfg.OPENAI_API_KEY,
      modelName: this.overrides.modelName ?? modelConfig.id,
      temperature: this.overrides.temperature ?? modelConfig.temperature,
      maxTokens: this.overrides.maxTokens ?? modelConfig.maxTokens,
      timeout: this.overrides.timeout ?? modelConfig.timeout,
    };
  }

  /**
   * Create a configured OpenAI LLM instance
   */
  private createLLM(): ChatOpenAI {
    const config = this.getConfig();

    if (!config.apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
    }

    return new ChatOpenAIImpl({
      openAIApiKey: config.apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeout: config.timeout,
    });
  }
}

/**
 * Factory function to create an LLM service with configuration
 * 
 * @param config - Optional configuration overrides
 * @returns Configured LLM service instance
 */
export function createLLMService(config: Partial<LLMConfig> = {}): ILLMService {
  return new DefaultLLMService(config);
}

/**
 * Default LLM configuration using centralized config and model registry
 * @deprecated Use DefaultLLMService.getConfig() instead
 */
export function getLLMConfig(overrides: Partial<LLMConfig> = {}): Required<LLMConfig> {
  const service = new DefaultLLMService(overrides);
  return service.getConfig();
}

/**
 * Create a configured OpenAI LLM instance
 * @deprecated Use DefaultLLMService.getChatModel() instead  
 */
export function createLLM(config: Partial<LLMConfig> = {}): ChatOpenAI {
  const service = new DefaultLLMService(config);
  return service.getChatModel();
}

/**
 * Validate LLM configuration
 * @deprecated Use DefaultLLMService.validateConfig() instead
 */
export function validateLLMConfig(config: LLMConfig): string[] {
  const service = new DefaultLLMService(config);
  return service.validateConfig();
}

/**
 * Check if LLM is properly configured
 * @deprecated Use DefaultLLMService.isConfigured() instead
 */
export function isLLMConfigured(): boolean {
  const service = new DefaultLLMService();
  return service.isConfigured();
}
