/**
 * Ultra-Minimal Handler modules for MCP Server operations
 *
 * Provides only the 5 essential MCP tools:
 * - getNextTask: Get next available task to work on (with optional parent)
 * - addTasks: Create tasks in batch (with dependencies and hierarchies)
 * - addTaskContext: Add context slice to a task
 * - addDependency: Add dependency relationships
 * - listTasks: List tasks with optional filters
 */

export { MinimalHandlers } from './MinimalHandlers.js';
export { 
  getNextTaskSchema,
  addTaskSchema,
  addTasksSchema,
  listTasksSchema,
  addTaskContextSchema,
  addDependencySchema,
  type GetNextTaskInput,
  type AddTaskInput,
  type AddTasksInput,
  type ListTasksInput,
  type AddTaskContextInput,
  type AddDependencyInput,
  type HandlerContext,
  type MCPHandler
} from './types.js';
