/**
 * Task ID generation utilities for human-readable, hierarchical task identifiers.
 *
 * Root tasks use random 4-letter combinations: ABCD, XYZW, QRST, etc.
 * Subtasks use dash-separated random 4-letter suffixes: ABCD-EFGH, ABCD-IJKL, etc.
 * Sub-subtasks continue the pattern: ABCD-EFGH-MNOP, ABCD-EFGH-QRST, etc.
 *
 * ID generation is purely random with collision detection. If a unique ID cannot be
 * generated after reasonable attempts, the operation fails to maintain consistency.
 */

import type { Store } from '../database/store.js';
import { TASK_IDENTIFIERS } from './TaskTreeConstants.js';

/**
 * Error thrown when a unique task ID cannot be generated after reasonable attempts.
 */
export class TaskIdGenerationError extends Error {
  constructor(type: 'root' | 'subtask', attempts: number) {
    super(`Failed to generate unique ${type} task ID after ${attempts} attempts`);
    this.name = 'TaskIdGenerationError';
  }
}

/**
 * Generates a random 4-letter combination.
 */
function generateRandomLetters(): string {
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  }
  return result;
}

/**
 * Parses a task ID to extract its components.
 */
export function parseTaskId(taskId: string): {
  rootId: string;
  segments: string[];
  depth: number;
  isRoot: boolean;
} {
  const parts = taskId.split('-');
  const rootId = parts[0] || '';
  const segments = parts.slice(1);

  return {
    rootId,
    segments,
    depth: parts.length - 1,
    isRoot: parts.length === 1,
  };
}

/**
 * Generates a random 4-letter root task ID.
 * Uses collision detection to ensure uniqueness.
 * Throws TaskIdGenerationError if no unique ID can be generated.
 */
export async function generateNextRootTaskId(store: Store): Promise<string> {
  const maxAttempts = 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = generateRandomLetters();

    // Check if this ID already exists
    const existingTask = await store.getTask(id);
    if (!existingTask) {
      return id;
    }
  }

  throw new TaskIdGenerationError('root', maxAttempts);
}

/**
 * Generates the next available subtask ID for a given parent.
 * Uses random 4-letter suffixes to avoid async collisions.
 * Throws TaskIdGenerationError if no unique ID can be generated.
 */
export async function generateNextSubtaskId(store: Store, parentId: string): Promise<string> {
  const maxAttempts = 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const suffix = generateRandomLetters();
    const candidateId = `${parentId}-${suffix}`;

    // Check if this ID already exists
    const existingTask = await store.getTask(candidateId);
    if (!existingTask) {
      return candidateId;
    }
  }

  throw new TaskIdGenerationError('subtask', maxAttempts);
}

/**
 * Generates the next available task ID based on whether it's a root task or subtask.
 */
export async function generateNextTaskId(store: Store, parentId?: string): Promise<string> {
  if (parentId) {
    return generateNextSubtaskId(store, parentId);
  }
  return generateNextRootTaskId(store);
}

/**
 * Validates that a task ID follows the correct format.
 * Handles both regular task IDs and special system task IDs.
 */
export function validateTaskId(taskId: string): boolean {
  // Handle special system task IDs
  if (taskId === TASK_IDENTIFIERS.PROJECT_ROOT) {
    return true;
  }

  // Handle subtasks of PROJECT_ROOT (e.g., __PROJECT_ROOT__-ABCD)
  const projectRootPrefix = `${TASK_IDENTIFIERS.PROJECT_ROOT}-`;
  if (taskId.startsWith(projectRootPrefix)) {
    const suffix = taskId.substring(projectRootPrefix.length);
    // The suffix should follow normal task ID patterns
    const rootPattern = /^[A-Z]+$/;
    const subtaskPattern = /^[A-Z]+(-[A-Z]+)+$/;
    return rootPattern.test(suffix) || subtaskPattern.test(suffix);
  }

  // Root task: one or more uppercase letters
  const rootPattern = /^[A-Z]+$/;
  // Subtask: root pattern followed by one or more "-LETTERS" segments
  const subtaskPattern = /^[A-Z]+(-[A-Z]+)+$/;

  return rootPattern.test(taskId) || subtaskPattern.test(taskId);
}

/**
 * Validates that a subtask ID is valid for the given parent.
 * Handles both regular task IDs and special system task IDs.
 */
export function validateSubtaskId(taskId: string, parentId: string): boolean {
  if (!validateTaskId(taskId)) {
    return false;
  }

  // Special handling for PROJECT_ROOT parent
  if (parentId === TASK_IDENTIFIERS.PROJECT_ROOT) {
    // Child of PROJECT_ROOT should start with PROJECT_ROOT- and be a valid task ID
    const expectedPrefix = `${TASK_IDENTIFIERS.PROJECT_ROOT}-`;
    if (!taskId.startsWith(expectedPrefix)) {
      return false;
    }

    // The suffix after PROJECT_ROOT- should be a valid root task pattern
    const suffix = taskId.substring(expectedPrefix.length);
    const rootPattern = /^[A-Z]+$/;
    return rootPattern.test(suffix);
  }

  const parsed = parseTaskId(taskId);
  const parentParsed = parseTaskId(parentId);

  // Child must have exactly one more segment than parent
  if (parsed.depth !== parentParsed.depth + 1) {
    return false;
  }

  // Child must start with parent ID
  const parentPrefix = `${parentId}-`;
  return taskId.startsWith(parentPrefix);
}
