/**
 * Common service utilities and helper functions
 * 
 * This module provides reusable utilities for service operations including
 * task validation, retrieval patterns, and error handling.
 */

import type { Store } from '../database/store.js';
import { TaskNotFoundError } from '../errors/service.js';
import type { Task } from '../schemas/task.js';

/**
 * Validates that a task exists and returns it
 * 
 * @param store - Database store instance
 * @param taskId - ID of the task to validate
 * @param operation - Name of the operation being performed (for error context)
 * @returns Promise resolving to the validated task
 * @throws TaskNotFoundError if task doesn't exist
 */
export async function validateTaskExists(
  store: Store,
  taskId: string,
  operation?: string
): Promise<Task> {
  const task = await store.getTask(taskId);
  if (!task) {
    throw new TaskNotFoundError(taskId, operation);
  }
  return task;
}

/**
 * Validates that multiple tasks exist and returns them
 * 
 * @param store - Database store instance  
 * @param taskIds - Array of task IDs to validate
 * @param operation - Name of the operation being performed (for error context)
 * @returns Promise resolving to array of validated tasks
 * @throws TaskNotFoundError if any task doesn't exist
 */
export async function validateTasksExist(
  store: Store,
  taskIds: string[],
  operation?: string
): Promise<Task[]> {
  const tasks = await Promise.all(
    taskIds.map(async (taskId) => {
      const task = await store.getTask(taskId);
      if (!task) {
        throw new TaskNotFoundError(taskId, operation);
      }
      return task;
    })
  );
  return tasks;
}

/**
 * Gets tasks and filters out null results
 * 
 * @param store - Database store instance
 * @param taskIds - Array of task IDs to retrieve
 * @param filter - Optional filter function to apply to valid tasks
 * @returns Promise resolving to array of existing, filtered tasks
 */
export async function getTasksFiltered<T extends Task = Task>(
  store: Store,
  taskIds: string[],
  filter?: (task: Task) => task is T
): Promise<T[]> {
  const tasks = await Promise.all(taskIds.map((id) => store.getTask(id)));
  const validTasks = tasks.filter((task): task is Task => task !== null);
  
  if (filter) {
    return validTasks.filter(filter);
  }
  
  return validTasks as T[];
}

/**
 * Batch task existence validation with partial failure handling
 * 
 * @param store - Database store instance
 * @param taskIds - Array of task IDs to validate
 * @returns Promise resolving to object with valid tasks and missing IDs
 */
export async function validateTasksBatch(
  store: Store,
  taskIds: string[]
): Promise<{
  validTasks: Task[];
  missingIds: string[];
}> {
  const results = await Promise.all(
    taskIds.map(async (taskId) => {
      const task = await store.getTask(taskId);
      return { taskId, task };
    })
  );

  const validTasks: Task[] = [];
  const missingIds: string[] = [];

  for (const { taskId, task } of results) {
    if (task) {
      validTasks.push(task);
    } else {
      missingIds.push(taskId);
    }
  }

  return { validTasks, missingIds };
}

/**
 * Creates a logger instance with consistent module naming
 * 
 * @param serviceName - Name of the service for logger context
 * @returns Logger instance configured for the service
 */
export function createServiceLogger(serviceName: string) {
  // Re-export the existing logger utility with service-specific naming
  const { createModuleLogger } = require('../utils/logger.js');
  return createModuleLogger(`Service.${serviceName}`);
}

/**
 * Standard error handler for service operations
 * 
 * @param error - The error that occurred
 * @param serviceName - Name of the service where error occurred
 * @param operation - Name of the operation that failed
 * @param context - Additional context for the error
 * @returns Re-thrown error with enhanced context
 */
export function handleServiceError(
  error: unknown,
  serviceName: string,
  operation: string,
  context?: Record<string, unknown>
): never {
  const { wrapError } = require('../errors/base.js');
  throw wrapError(error, `service.${serviceName}`, operation, context);
}