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
 * Default implementation that simply wraps the existing `createLLM` helper.
 * It preserves all current behaviour (env-var checks, model selection, etc.).
 */
export class DefaultLLMService implements ILLMService {
  private readonly model: ChatOpenAI;

  constructor(overrides: Parameters<typeof createLLM>[0] = {}) {
    this.model = createLLM(overrides);
  }

  getChatModel(): ChatOpenAI {
    return this.model;
  }
}
