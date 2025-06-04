/**
 * @fileoverview LLM configuration utilities for task generation
 *
 * ⚠️  DEPRECATION NOTICE:
 * This module is deprecated. Use the enhanced LLMService instead:
 *
 * ```typescript
 * import { createLLMService, DefaultLLMService } from './services/LLMService.js';
 *
 * // Instead of createLLM(config)
 * const service = createLLMService(config);
 * const llm = service.getChatModel();
 *
 * // Access additional features
 * const config = service.getConfig();
 * const modelInfo = service.getModelConfig();
 * const isValid = service.isConfigured();
 * ```
 *
 * The LLMService provides better dependency injection support, enhanced
 * configuration management, validation, and is more testable.
 *
 * @module utils/llm
 * @since 1.0.0
 * @deprecated Use LLMService instead
 */

import { ChatOpenAI } from '@langchain/openai';
import { cfg } from './config.js';
import { type ModelConfig, getModelConfig } from './models.js';

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
 * Get LLM configuration for the currently selected model
 *
 * @param overrides - Optional configuration overrides
 * @returns Complete LLM configuration
 */
export function getLLMConfig(overrides: Partial<LLMConfig> = {}): Required<LLMConfig> {
  const modelConfig = getModelConfig(cfg.LLM_MODEL);

  return {
    apiKey: overrides.apiKey ?? cfg.OPENAI_API_KEY,
    modelName: overrides.modelName ?? modelConfig.id,
    temperature: overrides.temperature ?? modelConfig.temperature,
    maxTokens: overrides.maxTokens ?? modelConfig.maxTokens,
    timeout: overrides.timeout ?? modelConfig.timeout,
  };
}

/**
 * Default LLM configuration using centralized config and model registry
 */
export const DEFAULT_LLM_CONFIG: Required<LLMConfig> = getLLMConfig();

/**
 * Create a configured OpenAI LLM instance
 *
 * @param config - Optional configuration overrides
 * @returns Configured ChatOpenAI instance
 *
 * @throws {Error} When API key is missing or invalid
 * @throws {Error} When model ID is not found in registry
 */
export function createLLM(config: Partial<LLMConfig> = {}): ChatOpenAI {
  const finalConfig = getLLMConfig(config);

  if (!finalConfig.apiKey) {
    throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
  }

  return new ChatOpenAI({
    openAIApiKey: finalConfig.apiKey,
    modelName: finalConfig.modelName,
    temperature: finalConfig.temperature,
    maxTokens: finalConfig.maxTokens,
    timeout: finalConfig.timeout,
  });
}

/**
 * Validate LLM configuration
 *
 * @param config - Configuration to validate
 * @returns Array of validation errors, empty if valid
 */
export function validateLLMConfig(config: LLMConfig): string[] {
  const errors: string[] = [];

  if (!config.apiKey || config.apiKey.trim() === '') {
    errors.push('API key is required');
  }

  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 1)) {
    errors.push('Temperature must be between 0 and 1');
  }

  if (config.maxTokens !== undefined && config.maxTokens <= 0) {
    errors.push('Max tokens must be positive');
  }

  if (config.timeout !== undefined && config.timeout <= 0) {
    errors.push('Timeout must be positive');
  }

  return errors;
}

/**
 * Check if LLM is properly configured
 *
 * @returns True if LLM can be created with current environment
 */
export function isLLMConfigured(): boolean {
  try {
    const errors = validateLLMConfig(DEFAULT_LLM_CONFIG);
    return errors.length === 0;
  } catch {
    return false;
  }
}

/**
 * Get current model configuration
 *
 * @returns Current model configuration from registry
 */
export function getCurrentModelConfig(): ModelConfig {
  return getModelConfig(cfg.LLM_MODEL);
}
