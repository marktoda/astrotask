/**
 * Handler modules for MCP Server operations
 *
 * Provides organized handler classes for different MCP operations:
 * - TaskHandlers: Core task CRUD operations
 * - TaskGenerationHandlers: Task generation from various input sources
 * - DependencyHandlers: Task dependency management operations
 */

export { TaskHandlers, type TaskContext } from './TaskHandlers.js';
export { TaskGenerationHandlers } from './TaskGenerationHandlers.js';
export { 
  DependencyHandlers, 
  type TaskContextWithDependencies,
  type AddTaskDependencyInput,
  type RemoveTaskDependencyInput,
  type GetTaskDependenciesInput,
  type ValidateTaskDependencyInput,
  type GetAvailableTasksInput,
  type UpdateTaskStatusInput,
  type GetTasksWithDependenciesInput
} from './DependencyHandlers.js';
export * from './types.js';
export { 
  createTaskSchema, 
  updateTaskSchema, 
  deleteTaskSchema, 
  completeTaskSchema, 
  getTaskContextSchema, 
  listTasksSchema,
  generateTasksSchema,
  listGeneratorsSchema,
  validateGenerationInputSchema,
  addTaskDependencySchema,
  removeTaskDependencySchema,
  getTaskDependenciesSchema,
  validateTaskDependencySchema,
  getAvailableTasksSchema,
  updateTaskStatusSchema,
  getTasksWithDependenciesSchema,
  getTopologicalOrderSchema,
  getEffectiveTaskDependenciesSchema,
  getHierarchicalTaskDependenciesSchema,
  getHierarchicallyAvailableTasksSchema
} from './types.js';
