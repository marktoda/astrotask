/**
 * Task Validation Module
 *
 * Consolidates task-specific validation logic including:
 * - Status transition validation
 * - Task hierarchy validation
 * - Business rule validation
 */

import type { Task, TaskStatus } from '../schemas/index.js';
import {
  type StatusTransitionResult,
  validateStatusTransition,
} from '../utils/statusTransitions.js';

/**
 * Validate a status transition with dependency checking
 */
export async function validateTaskStatusTransition(
  task: Task,
  newStatus: TaskStatus,
  options: {
    getDependentTasks?: () => Promise<Task[]>;
    getBlockingTasks?: () => Promise<Task[]>;
    force?: boolean;
  } = {}
): Promise<StatusTransitionResult> {
  // Check if task is blocked by dependencies
  let isBlocked = false;
  let blockedBy: string[] = [];

  if (options.getBlockingTasks) {
    const blockingTasks = await options.getBlockingTasks();
    isBlocked = blockingTasks.length > 0;
    blockedBy = blockingTasks.map((t) => t.id);
  }

  // Use existing status transition validation
  const result = validateStatusTransition(task.status, newStatus, isBlocked, blockedBy);

  // If transition is not allowed and force is not enabled, return early
  if (!result.allowed && !options.force) {
    return result;
  }

  // Additional validation for status-specific rules
  if (newStatus === 'done' && options.getDependentTasks) {
    const dependents = await options.getDependentTasks();
    const incompleteDependents = dependents.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled'
    );

    if (incompleteDependents.length > 0) {
      return {
        allowed: false,
        reason: `Cannot complete task with ${incompleteDependents.length} incomplete dependent tasks`,
        blockedBy: incompleteDependents.map((t) => t.id),
      };
    }
  }

  return result;
}

/**
 * Validate task hierarchy rules
 */
export function validateTaskHierarchy(
  task: Task,
  parent: Task | null,
  children: Task[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate parent-child relationship
  if (parent && task.parentId !== parent.id) {
    errors.push(`Task parentId (${task.parentId}) does not match parent.id (${parent.id})`);
  }

  if (!parent && task.parentId) {
    errors.push(`Task has parentId (${task.parentId}) but no parent found`);
  }

  // Validate children relationships
  for (const child of children) {
    if (child.parentId !== task.id) {
      errors.push(
        `Child ${child.id} has incorrect parentId (${child.parentId}), expected ${task.id}`
      );
    }
  }

  // Validate status consistency
  if (
    task.status === 'done' &&
    children.some((c) => c.status !== 'done' && c.status !== 'cancelled')
  ) {
    errors.push('Parent task marked as done but has incomplete children');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate task priority rules
 */
export function validateTaskPriority(
  task: Task,
  parent: Task | null
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Warn if child has higher priority than parent
  if (parent && task.priorityScore > parent.priorityScore) {
    warnings.push(
      `Child task has higher priority (${task.priorityScore}) than parent (${parent.priorityScore})`
    );
  }

  return {
    valid: true, // Priority mismatches are warnings, not errors
    warnings,
  };
}

/**
 * Validate task dates
 */
export function validateTaskDates(task: Task): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Ensure createdAt <= updatedAt
  if (task.createdAt > task.updatedAt) {
    errors.push('Task createdAt is after updatedAt');
  }

  // Ensure dates are not in the future
  const now = new Date();
  if (task.createdAt > now) {
    errors.push('Task createdAt is in the future');
  }

  if (task.updatedAt > now) {
    errors.push('Task updatedAt is in the future');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Comprehensive task validation
 */
export async function validateTask(
  task: Task,
  context: {
    parent?: Task | null;
    children?: Task[];
    getDependentTasks?: () => Promise<Task[]>;
  } = {}
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Date validation
  const dateValidation = validateTaskDates(task);
  errors.push(...dateValidation.errors);

  // Hierarchy validation if context provided
  if (context.parent !== undefined && context.children) {
    const hierarchyValidation = validateTaskHierarchy(task, context.parent, context.children);
    errors.push(...hierarchyValidation.errors);
  }

  // Priority validation if parent provided
  if (context.parent !== undefined) {
    const priorityValidation = validateTaskPriority(task, context.parent);
    warnings.push(...priorityValidation.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
