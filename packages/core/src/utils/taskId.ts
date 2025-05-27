/**
 * Task ID generation utilities for human-readable, hierarchical task identifiers.
 * 
 * Root tasks use random 4-letter combinations: ABCD, XYZW, QRST, etc.
 * Subtasks use dotted numbers: ABCD.1, ABCD.2, XYZW.1, etc.
 * Sub-subtasks continue the pattern: ABCD.1.1, ABCD.1.2, etc.
 */

import type { Store } from '../database/store.js';

/**
 * Converts a number to a letter-based identifier.
 * 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA, 27 -> AB, etc.
 */
export function numberToLetters(num: number): string {
  let result = '';
  num += 1; // Convert 0-based to 1-based for easier calculation
  
  while (num > 0) {
    num -= 1; // Convert back to 0-based for modulo
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
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
  segments: number[];
  depth: number;
  isRoot: boolean;
} {
  const parts = taskId.split('.');
  const rootId = parts[0] || '';
  const segments = parts.slice(1).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
  
  return {
    rootId,
    segments,
    depth: parts.length - 1,
    isRoot: parts.length === 1
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
  
  // Fallback: if we can't find a unique random ID after many attempts,
  // fall back to sequential generation starting from AAAA
  const rootTasks = await store.listRootTasks();
  const usedNumbers = rootTasks
    .map(task => parseTaskId(task.id).rootId)
    .map(lettersToNumber)
    .sort((a, b) => a - b);
  
  let nextNumber = lettersToNumber('AAAA');
  for (const num of usedNumbers) {
    if (num >= nextNumber && num === nextNumber) {
      nextNumber++;
    }
  }
  
  return numberToLetters(nextNumber);
}

/**
 * Generates the next available subtask ID for a given parent.
 */
export async function generateNextSubtaskId(store: Store, parentId: string): Promise<string> {
  const subtasks = await store.listSubtasks(parentId);
  
  if (subtasks.length === 0) {
    return `${parentId}.1`;
  }
  
  // Extract the last numeric segment from each subtask and find the highest
  const usedNumbers = subtasks
    .map(task => {
      const parsed = parseTaskId(task.id);
      return parsed.segments[parsed.segments.length - 1];
    })
    .filter((num): num is number => num !== undefined)
    .sort((a, b) => a - b);
  
  // Find the next available number
  let nextNumber = 1;
  for (const num of usedNumbers) {
    if (num === nextNumber) {
      nextNumber++;
    } else {
      break;
    }
  }
  
  return `${parentId}.${nextNumber}`;
}

/**
 * Generates the next available task ID based on whether it's a root task or subtask.
 */
export async function generateNextTaskId(store: Store, parentId?: string): Promise<string> {
  if (parentId) {
    return generateNextSubtaskId(store, parentId);
  } else {
    return generateNextRootTaskId(store);
  }
}

/**
 * Validates that a task ID follows the correct format.
 */
export function validateTaskId(taskId: string): boolean {
  // Root task: one or more uppercase letters
  const rootPattern = /^[A-Z]+$/;
  // Subtask: root pattern followed by one or more ".number" segments (no zero)
  const subtaskPattern = /^[A-Z]+(\.[1-9]\d*)+$/;
  
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
  
  // Child must start with parent ID
  const parentPrefix = parentId + '.';
  return taskId.startsWith(parentPrefix);
} 