import type { ChatOpenAI } from '@langchain/openai';
import { createLLM } from '../utils/llm.js';

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
}

/**
 * Default implementation that lazily creates the LLM model when first accessed.
 * This allows overrides to be applied before the model is instantiated.
 */
export class DefaultLLMService implements ILLMService {
  private model?: ChatOpenAI;
  private readonly overrides: Parameters<typeof createLLM>[0];

  constructor(overrides: Parameters<typeof createLLM>[0] = {}) {
    this.overrides = overrides;
  }

  getChatModel(): ChatOpenAI {
    if (!this.model) {
      this.model = createLLM(this.overrides);
    }
    return this.model;
  }
}
