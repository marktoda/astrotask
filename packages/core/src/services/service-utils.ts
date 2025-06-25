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
