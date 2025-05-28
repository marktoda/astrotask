/**
 * Task ID generation utilities for human-readable, hierarchical task identifiers.
 *
 * Root tasks use random 4-letter combinations: ABCD, XYZW, QRST, etc.
 * Subtasks use dash-separated random 4-letter suffixes: ABCD-EFGH, ABCD-IJKL, etc.
 * Sub-subtasks continue the pattern: ABCD-EFGH-MNOP, ABCD-EFGH-QRST, etc.
 */

import type { Store } from '../database/store.js';

/**
 * Converts a number to a letter-based identifier.
 * 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA, 27 -> AB, etc.
 */
export function numberToLetters(num: number): string {
  let result = '';
  let current = num + 1; // Convert 0-based to 1-based for easier calculation

  while (current > 0) {
    current -= 1; // Convert back to 0-based for modulo
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }

  return result;
}

/**
 * Converts a letter-based identifier back to a number.
 * A -> 0, B -> 1, ..., Z -> 25, AA -> 26, AB -> 27, etc.
 */
export function lettersToNumber(letters: string): number {
  let result = 0;
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 64);
  }
  return result - 1; // Convert back to 0-based
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
 */
export async function generateNextRootTaskId(store: Store): Promise<string> {
  const maxAttempts = 100; // Prevent infinite loops

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random 4-letter ID
    let id = '';
    for (let i = 0; i < 4; i++) {
      id += String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
    }

    // Check if this ID already exists
    const existingTask = await store.getTask(id);
    if (!existingTask) {
      return id;
    }
  }

  // If we can't find a unique random ID after many attempts, fail
  throw new Error(`Failed to generate unique root task ID after ${maxAttempts} attempts`);
}

/**
 * Generates a random 4-letter suffix for a subtask.
 */
function generateRandomSuffix(): string {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  }
  return suffix;
}

/**
 * Generates the next available subtask ID for a given parent.
 * Uses randomized 4-letter suffixes to prevent async collisions.
 */
export async function generateNextSubtaskId(store: Store, parentId: string): Promise<string> {
  const maxAttempts = 100; // Prevent infinite loops
  const subtasks = await store.listSubtasks(parentId);
  const existingIds = new Set(subtasks.map((task) => task.id));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const suffix = generateRandomSuffix();
    const newId = `${parentId}-${suffix}`;

    // Check if this ID already exists
    if (!existingIds.has(newId)) {
      return newId;
    }
  }

  // If we can't find a unique random ID after many attempts, fail
  throw new Error(
    `Failed to generate unique subtask ID for parent ${parentId} after ${maxAttempts} attempts`
  );
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
 */
export function validateTaskId(taskId: string): boolean {
  // Root task: exactly 4 uppercase letters
  const rootPattern = /^[A-Z]{4}$/;
  // Subtask: root pattern followed by one or more "-XXXX" segments (4 letters each)
  const subtaskPattern = /^[A-Z]{4}(-[A-Z]{4})+$/;

  return rootPattern.test(taskId) || subtaskPattern.test(taskId);
}

/**
 * Validates that a subtask ID is valid for the given parent.
 */
export function validateSubtaskId(taskId: string, parentId: string): boolean {
  if (!validateTaskId(taskId)) {
    return false;
  }

  const parsed = parseTaskId(taskId);
  const parentParsed = parseTaskId(parentId);

  // Child must have exactly one more segment than parent
  if (parsed.depth !== parentParsed.depth + 1) {
    return false;
  }

  // Child must start with parent ID followed by dash
  const parentPrefix = `${parentId}-`;
  return taskId.startsWith(parentPrefix);
}
