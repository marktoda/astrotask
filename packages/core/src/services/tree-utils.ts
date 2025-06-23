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
 * Calculate the depth of a task in its hierarchy
 *
 * @param store - Database store instance
 * @param taskId - ID of the task to calculate depth for
 * @returns Promise resolving to the depth (0 for root tasks)
 */
export async function calculateTaskDepth(store: Store, taskId: string): Promise<number> {
  const ancestors = await collectAncestors(store, taskId);
  return ancestors.length;
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

/**
 * Generic tree walker that applies a function to each node
 *
 * @param store - Database store instance
 * @param rootId - ID of the root task to start walking from
 * @param visitor - Function to call for each task
 * @param options - Options for the walk
 */
export async function walkTaskTree(
  store: Store,
  rootId: string,
  visitor: (task: Task, depth: number) => void | Promise<void>,
  options?: {
    maxDepth?: number;
    statuses?: TaskStatus[];
    preOrder?: boolean; // true for pre-order (parent first), false for post-order
  }
): Promise<void> {
  const { maxDepth, statuses, preOrder = true } = options || {};

  const walk = async (taskId: string, depth: number): Promise<void> => {
    const task = await store.getTask(taskId);
    if (!task) return;

    // Pre-order: visit parent before children
    if (preOrder) {
      await visitor(task, depth);
    }

    // Recurse into children if not at max depth
    if (maxDepth === undefined || depth < maxDepth) {
      const children = await store.listTasks({
        parentId: taskId,
        statuses: statuses || [],
      });

      for (const child of children) {
        await walk(child.id, depth + 1);
      }
    }

    // Post-order: visit parent after children
    if (!preOrder) {
      await visitor(task, depth);
    }
  };

  await walk(rootId, 0);
}

/**
 * Find all leaf tasks (tasks with no children) in a tree
 *
 * @param store - Database store instance
 * @param rootId - ID of the root task to search from
 * @param options - Options for filtering
 * @returns Promise resolving to array of leaf tasks
 */
export async function findLeafTasks(
  store: Store,
  rootId: string,
  options?: {
    maxDepth?: number;
    statuses?: TaskStatus[];
  }
): Promise<Task[]> {
  const leafTasks: Task[] = [];

  await walkTaskTree(
    store,
    rootId,
    async (task) => {
      const children = await store.listTasks({
        parentId: task.id,
        statuses: options?.statuses || [],
      });

      if (children.length === 0) {
        leafTasks.push(task);
      }
    },
    options
  );

  return leafTasks;
}

/**
 * Count total tasks in a tree hierarchy
 *
 * @param store - Database store instance
 * @param rootId - ID of the root task
 * @param options - Options for filtering
 * @returns Promise resolving to the total task count
 */
export async function countTasksInTree(
  store: Store,
  rootId: string,
  options?: {
    maxDepth?: number;
    statuses?: TaskStatus[];
  }
): Promise<number> {
  let count = 0;

  await walkTaskTree(
    store,
    rootId,
    () => {
      count++;
    },
    options
  );

  return count;
}
