/**
 * @fileoverview Status transition validation with dependency support
 *
 * This module provides validation for task status transitions, ensuring that
 * tasks cannot be started if they are blocked by incomplete dependencies.
 * Updated for Astrolabe TUI redesign with enhanced 'blocked' status support.
 *
 * @module utils/statusTransitions
 * @since 1.0.0
 */

import type { TaskStatus } from '../schemas/task.js';

/**
 * Valid status transitions for tasks.
 * Defines which status changes are allowed from each current status.
 * Updated for Astrolabe TUI redesign with blocked status support.
 */
export const taskStatusTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in-progress', 'blocked', 'cancelled'], // Can start or be blocked
  'in-progress': ['done', 'pending', 'blocked', 'cancelled'], // Can complete, pause, or be blocked
  blocked: ['pending', 'in-progress'], // Can be unblocked to previous state
  done: ['in-progress'], // Can reopen, which may block dependents
  cancelled: ['pending', 'blocked'], // Can be reopened
  archived: [], // Terminal state - no transitions allowed
} as const;

/**
 * Check if a status transition is valid based on current status only.
 * This does not consider dependencies - use canTransitionStatus for full validation.
 *
 * @param currentStatus - Current task status
 * @param newStatus - Desired new status
 * @returns Whether the transition is allowed by the state machine
 */
export function isValidStatusTransition(currentStatus: TaskStatus, newStatus: TaskStatus): boolean {
  return taskStatusTransitions[currentStatus].includes(newStatus);
}

/**
 * Enhanced validation function that considers both status transitions and dependencies.
 *
 * @param currentStatus - Current task status
 * @param newStatus - Desired new status
 * @param isBlocked - Whether the task is blocked by incomplete dependencies
 * @returns Whether the transition is allowed
 */
export function canTransitionStatus(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
  isBlocked: boolean
): boolean {
  // First check if the basic status transition is valid
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    return false;
  }

  // Additional check: cannot start blocked tasks
  if (newStatus === 'in-progress' && isBlocked) {
    return false;
  }

  return true;
}

/**
 * Get the reason why a status transition is not allowed.
 *
 * @param currentStatus - Current task status
 * @param newStatus - Desired new status
 * @param isBlocked - Whether the task is blocked by incomplete dependencies
 * @param blockedBy - Array of task IDs that are blocking this task
 * @returns Human-readable reason for rejection, or null if transition is valid
 */
export function getTransitionRejectionReason(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
  isBlocked: boolean,
  blockedBy?: string[]
): string | null {
  // Check basic status transition validity
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    const allowedTransitions = taskStatusTransitions[currentStatus];
    return `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowedTransitions.join(', ')}`;
  }

  // Check dependency blocking
  if (newStatus === 'in-progress' && isBlocked) {
    const blockingTasks =
      blockedBy && blockedBy.length > 0 ? ` (blocked by: ${blockedBy.join(', ')})` : '';
    return `Cannot start task because it is blocked by incomplete dependencies${blockingTasks}`;
  }

  return null; // Transition is valid
}

/**
 * Status transition result with detailed information.
 */
export interface StatusTransitionResult {
  /** Whether the transition is allowed */
  allowed: boolean;
  /** Human-readable reason if transition is rejected */
  reason?: string;
  /** Task IDs that are blocking this transition (if applicable) */
  blockedBy?: string[];
}

/**
 * Comprehensive status transition validation with detailed result.
 *
 * @param currentStatus - Current task status
 * @param newStatus - Desired new status
 * @param isBlocked - Whether the task is blocked by incomplete dependencies
 * @param blockedBy - Array of task IDs that are blocking this task
 * @returns Detailed validation result
 */
export function validateStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus,
  isBlocked: boolean,
  blockedBy?: string[]
): StatusTransitionResult {
  const reason = getTransitionRejectionReason(currentStatus, newStatus, isBlocked, blockedBy);

  if (reason === null) {
    return { allowed: true };
  }

  const result: StatusTransitionResult = {
    allowed: false,
    reason,
  };

  if (isBlocked && blockedBy) {
    result.blockedBy = blockedBy;
  }

  return result;
}
