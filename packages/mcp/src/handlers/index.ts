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
  addDependencySchema,
  getNextTaskSchema,
  type ParsePRDInput,
  type ExpandTaskInput,
  type AddDependencyInput,
  type GetNextTaskInput,
  type HandlerContext,
  type MCPHandler
} from './types.js';
