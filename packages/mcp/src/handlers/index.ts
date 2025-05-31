/**
 * Ultra-Minimal Handler modules for MCP Server operations
 *
 * Provides only the 4 essential MCP tools:
 * - parsePRD: Bootstrap project from requirements
 * - expandTask: Break down tasks into subtasks  
 * - addDependency: Add dependency relationships
 * - getNextTask: Get next available task to work on
 */

export { MinimalHandlers } from './MinimalHandlers.js';
export { 
  parsePRDSchema,
  expandTaskSchema,
  expandTasksBatchSchema,
  expandHighComplexityTasksSchema,
  addDependencySchema,
  getNextTaskSchema,
  analyzeNodeComplexitySchema,
  analyzeComplexitySchema,
  complexityReportSchema,
  type ParsePRDInput,
  type ExpandTaskInput,
  type ExpandTasksBatchInput,
  type ExpandHighComplexityTasksInput,
  type AddDependencyInput,
  type GetNextTaskInput,
  type AnalyzeNodeComplexityInput,
  type AnalyzeComplexityInput,
  type ComplexityReportInput,
  type HandlerContext,
  type MCPHandler
} from './types.js';
