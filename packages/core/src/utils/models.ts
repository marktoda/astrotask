/**
 * @fileoverview Model registry with static configurations
 *
 * This module defines model-specific configurations including temperature,
 * tokens, timeout, and other model-specific parameters.
 *
 * @module utils/models
 * @since 1.0.0
 */

/**
 * Configuration for a specific model
 */
export interface ModelConfig {
  /** Model identifier */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Model description */
  description: string;
  /** Provider (openai, anthropic, etc.) */
  provider: 'openai';
  /** Optimal temperature for this model */
  temperature: number;
  /** Maximum tokens for this model */
  maxTokens: number;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Whether this model supports function calling */
  supportsFunctionCalling: boolean;
  /** Estimated cost per 1K input tokens (USD) */
  inputCostPer1K: number;
  /** Estimated cost per 1K output tokens (USD) */
  outputCostPer1K: number;
}

/**
 * Registry of available models with their configurations
 */
export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  'gpt-4o': {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Latest GPT-4 model optimized for speed and efficiency',
    provider: 'openai',
    temperature: 0.1,
    maxTokens: 16384,
    timeout: 60000,
    supportsFunctionCalling: true,
    inputCostPer1K: 0.005,
    outputCostPer1K: 0.015,
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Smaller, faster GPT-4o model for simple tasks',
    provider: 'openai',
    temperature: 0.1,
    maxTokens: 8192,
    timeout: 30000,
    supportsFunctionCalling: true,
    inputCostPer1K: 0.00015,
    outputCostPer1K: 0.0006,
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'High-performance GPT-4 model with larger context window',
    provider: 'openai',
    temperature: 0.1,
    maxTokens: 32768,
    timeout: 90000,
    supportsFunctionCalling: true,
    inputCostPer1K: 0.01,
    outputCostPer1K: 0.03,
  },
  'gpt-3.5-turbo': {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and cost-effective model for simple generation tasks',
    provider: 'openai',
    temperature: 0.2,
    maxTokens: 4096,
    timeout: 30000,
    supportsFunctionCalling: true,
    inputCostPer1K: 0.0015,
    outputCostPer1K: 0.002,
  },
} as const;

/**
 * Default model to use when none specified
 */
export const DEFAULT_MODEL_ID = 'gpt-4o';

/**
 * Get model configuration by ID
 *
 * @param modelId - Model identifier
 * @returns Model configuration
 * @throws {Error} When model ID is not found
 */
export function getModelConfig(modelId: string): ModelConfig {
  const config = MODEL_REGISTRY[modelId];
  if (!config) {
    const availableModels = Object.keys(MODEL_REGISTRY).join(', ');
    throw new Error(`Unknown model ID: ${modelId}. Available models: ${availableModels}`);
  }
  return config;
}

/**
 * Get all available model IDs
 *
 * @returns Array of model IDs
 */
export function getAvailableModels(): string[] {
  return Object.keys(MODEL_REGISTRY);
}

/**
 * Get models by provider
 *
 * @param provider - Provider name
 * @returns Array of model configurations for the provider
 */
export function getModelsByProvider(provider: ModelConfig['provider']): ModelConfig[] {
  return Object.values(MODEL_REGISTRY).filter((model) => model.provider === provider);
}

/**
 * Validate if a model ID exists in the registry
 *
 * @param modelId - Model identifier to validate
 * @returns True if model exists, false otherwise
 */
export function isValidModelId(modelId: string): boolean {
  return modelId in MODEL_REGISTRY;
}
