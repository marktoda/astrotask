/**
 * Tree operation utilities
 *
 * This module provides common tree traversal and manipulation utilities
 * that can be used across different services and entities.
 */

import type { Store } from '../database/store.js';
import type { Task, TaskStatus } from '../schemas/task.js';

/**
 * Recursively collect all descendant tasks from a given parent
 *
 * @param store - Database store instance
 * @param parentId - ID of the parent task
 * @param statuses - Optional array of statuses to filter by
 * @returns Promise resolving to array of descendant tasks
 */
export async function collectDescendants(
  store: Store,
  parentId: string,
  statuses?: TaskStatus[]
): Promise<Task[]> {
  const descendants: Task[] = [];

  const collectRecursive = async (currentParentId: string): Promise<void> => {
    const children = await store.listTasks({
      parentId: currentParentId,
      statuses: statuses || [],
    });

    for (const child of children) {
      descendants.push(child);
      await collectRecursive(child.id);
    }
  };

  await collectRecursive(parentId);
  return descendants;
}

/**
 * Collect all ancestor tasks up to the root
 *
 * @param store - Database store instance
 * @param taskId - ID of the task to get ancestors for
 * @returns Promise resolving to array of ancestor tasks (root first)
 */
export async function collectAncestors(store: Store, taskId: string): Promise<Task[]> {
  const ancestors: Task[] = [];
  let current = await store.getTask(taskId);

  while (current?.parentId) {
    const parent = await store.getTask(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent); // root first ordering
    current = parent;
  }

  return ancestors;
}

/**
 * Find the root task of a hierarchy
 *
 * @param store - Database store instance
 * @param taskId - ID of the task to find root for
 * @returns Promise resolving to the root task ID, or the original task ID if already root
 */
export async function findRootTaskId(store: Store, taskId: string): Promise<string> {
  const ancestors = await collectAncestors(store, taskId);
  return ancestors.length > 0 && ancestors[0] ? ancestors[0].id : taskId;
}
