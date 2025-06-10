/**
 * Ultra-Minimal Handler modules for MCP Server operations
 *
 * Provides only the 6 essential MCP tools:
 * - getNextTask: Get next available task to work on (with optional parent)
 * - addTasks: Create tasks in batch (with dependencies and hierarchies)
 * - addTaskContext: Add context slice to a task
 * - addDependency: Add dependency relationships
 * - updateStatus: Update task status (pending, in-progress, done, etc.)
 * - listTasks: List tasks with optional filters
 */

export { MinimalHandlers } from './MinimalHandlers.js';
export { 
  getNextTaskSchema,
  getTaskSchema,
  addTaskSchema,
  addTasksSchema,
  listTasksSchema,
  addTaskContextSchema,
  addDependencySchema,
  updateStatusSchema,
  deleteTaskSchema,
  type GetNextTaskInput,
  type GetTaskInput,
  type AddTaskInput,
  type AddTasksInput,
  type ListTasksInput,
  type AddTaskContextInput,
  type AddDependencyInput,
  type UpdateStatusInput,
  type DeleteTaskInput,
  type HandlerContext,
  type MCPHandler
} from './types.js';
