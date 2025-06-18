/**
 * LLM and AI Services
 *
 * AI-powered functionality for Astrotask including:
 * - LLM service interfaces and implementations
 * - Task generation from PRDs
 * - Complexity analysis
 * - Task expansion services
 */

// LLM service interfaces and implementations
export {
  type ILLMService,
  type LLMConfig,
  DefaultLLMService,
  createLLMService,
} from './services/LLMService.js';

// Complexity analysis
export {
  ComplexityAnalyzer,
  createComplexityAnalyzer,
  taskComplexitySchema,
  complexityReportSchema,
  type TaskComplexity,
  type ComplexityReport,
  type ComplexityAnalysisConfig,
} from './services/ComplexityAnalyzer.js';

export {
  ComplexityContextService,
  createComplexityContextService,
  type ComplexityContextConfig,
} from './services/ComplexityContextService.js';

// Task expansion
export {
  TaskExpansionService,
  createTaskExpansionService,
  type TaskExpansionConfig,
  type TaskExpansionInput,
  type TaskExpansionResult,
} from './services/TaskExpansionService.js';

// Task generation
export type {
  TaskGenerator,
  GenerationResult,
} from './services/generators/TaskGenerator.js';
export * from './services/generators/PRDTaskGenerator.js';
export * from './services/generators/schemas.js';
