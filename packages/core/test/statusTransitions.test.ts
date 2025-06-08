/**
 * @fileoverview Tests for status transition validation
 * 
 * Tests the status transition validation functions that consider both
 * basic status transitions and dependency blocking.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidStatusTransition,
  canTransitionStatus,
  getTransitionRejectionReason,
  validateStatusTransition,
  taskStatusTransitions,
} from '../src/utils/statusTransitions.js';
import type { TaskStatus } from '../src/schemas/task.js';

describe('Status Transitions', () => {
  describe('taskStatusTransitions', () => {
    it('should define valid transitions for each status', () => {
      expect(taskStatusTransitions.pending).toEqual(['in-progress', 'blocked', 'cancelled']);
      expect(taskStatusTransitions['in-progress']).toEqual(['done', 'pending', 'blocked', 'cancelled']);
      expect(taskStatusTransitions.blocked).toEqual(['pending', 'in-progress']);
      expect(taskStatusTransitions.done).toEqual(['in-progress']);
      expect(taskStatusTransitions.cancelled).toEqual(['pending', 'blocked']);
      expect(taskStatusTransitions.archived).toEqual([]);
    });
  });

  describe('isValidStatusTransition', () => {
    it('should allow valid transitions', () => {
      expect(isValidStatusTransition('pending', 'in-progress')).toBe(true);
      expect(isValidStatusTransition('pending', 'cancelled')).toBe(true);
      expect(isValidStatusTransition('in-progress', 'done')).toBe(true);
      expect(isValidStatusTransition('in-progress', 'pending')).toBe(true);
      expect(isValidStatusTransition('in-progress', 'cancelled')).toBe(true);
      expect(isValidStatusTransition('done', 'in-progress')).toBe(true);
      expect(isValidStatusTransition('cancelled', 'pending')).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(isValidStatusTransition('pending', 'done')).toBe(false);
      expect(isValidStatusTransition('done', 'pending')).toBe(false);
      expect(isValidStatusTransition('done', 'cancelled')).toBe(false);
      expect(isValidStatusTransition('archived', 'pending')).toBe(false);
      expect(isValidStatusTransition('archived', 'in-progress')).toBe(false);
    });
  });

  describe('canTransitionStatus', () => {
    it('should allow valid transitions when not blocked', () => {
      expect(canTransitionStatus('pending', 'in-progress', false)).toBe(true);
      expect(canTransitionStatus('in-progress', 'done', false)).toBe(true);
      expect(canTransitionStatus('in-progress', 'done', true)).toBe(true); // blocking doesn't affect done transition
    });

    it('should reject starting blocked tasks', () => {
      expect(canTransitionStatus('pending', 'in-progress', true)).toBe(false);
    });

    it('should reject invalid transitions regardless of blocking', () => {
      expect(canTransitionStatus('pending', 'done', false)).toBe(false);
      expect(canTransitionStatus('pending', 'done', true)).toBe(false);
    });
  });

  describe('getTransitionRejectionReason', () => {
    it('should return null for valid transitions', () => {
      expect(getTransitionRejectionReason('pending', 'in-progress', false)).toBeNull();
      expect(getTransitionRejectionReason('in-progress', 'done', true)).toBeNull();
    });

    it('should return reason for invalid status transitions', () => {
      const reason = getTransitionRejectionReason('pending', 'done', false);
      expect(reason).toContain("Cannot transition from 'pending' to 'done'");
      expect(reason).toContain('Allowed transitions: in-progress, blocked, cancelled');
    });

    it('should return reason for blocked tasks', () => {
      const reason = getTransitionRejectionReason('pending', 'in-progress', true);
      expect(reason).toContain('Cannot start task because it is blocked by incomplete dependencies');
    });

    it('should include blocking task IDs in reason', () => {
      const reason = getTransitionRejectionReason('pending', 'in-progress', true, ['task1', 'task2']);
      expect(reason).toContain('blocked by: task1, task2');
    });
  });

  describe('validateStatusTransition', () => {
    it('should return success for valid transitions', () => {
      const result = validateStatusTransition('pending', 'in-progress', false);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.blockedBy).toBeUndefined();
    });

    it('should return failure for invalid status transitions', () => {
      const result = validateStatusTransition('pending', 'done', false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Cannot transition from 'pending' to 'done'");
      expect(result.blockedBy).toBeUndefined();
    });

    it('should return failure for blocked tasks', () => {
      const result = validateStatusTransition('pending', 'in-progress', true, ['task1']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked by incomplete dependencies');
      expect(result.blockedBy).toEqual(['task1']);
    });

    it('should not include blockedBy when not blocked', () => {
      const result = validateStatusTransition('pending', 'done', false, ['task1']);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Cannot transition from 'pending' to 'done'");
      expect(result.blockedBy).toBeUndefined();
    });
  });
}); 