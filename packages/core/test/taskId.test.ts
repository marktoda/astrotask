import { describe, it, expect } from 'vitest';
import {
  parseTaskId,
  validateTaskId,
  validateSubtaskId,
} from '../src/utils/taskId.js';

describe('Task ID Utilities', () => {
  describe('parseTaskId', () => {
    it('should parse root task IDs correctly', () => {
      const parsed = parseTaskId('A');
      expect(parsed).toEqual({
        rootId: 'A',
        segments: [],
        depth: 0,
        isRoot: true,
      });
    });

    it('should parse subtask IDs correctly', () => {
      const parsed = parseTaskId('A-BCDE');
      expect(parsed).toEqual({
        rootId: 'A',
        segments: ['BCDE'],
        depth: 1,
        isRoot: false,
      });
    });

    it('should parse nested subtask IDs correctly', () => {
      const parsed = parseTaskId('BB-CDEF-GHIJ-KLMN');
      expect(parsed).toEqual({
        rootId: 'BB',
        segments: ['CDEF', 'GHIJ', 'KLMN'],
        depth: 3,
        isRoot: false,
      });
    });
  });

  describe('validateTaskId', () => {
    it('should validate root task IDs', () => {
      expect(validateTaskId('A')).toBe(true);
      expect(validateTaskId('Z')).toBe(true);
      expect(validateTaskId('AA')).toBe(true);
      expect(validateTaskId('ZZ')).toBe(true);
      expect(validateTaskId('AAA')).toBe(true);
    });

    it('should validate subtask IDs', () => {
      expect(validateTaskId('A-BCDE')).toBe(true);
      expect(validateTaskId('A-BCDEFGHIJ')).toBe(true);
      expect(validateTaskId('BB-CDEF-GHIJ')).toBe(true);
      expect(validateTaskId('A-BCDE-FGHI-JKLM-NOPQ')).toBe(true);
    });

    it('should reject invalid task IDs', () => {
      expect(validateTaskId('a')).toBe(false); // lowercase
      expect(validateTaskId('1')).toBe(false); // starts with number
      expect(validateTaskId('A-')).toBe(false); // trailing dash
      expect(validateTaskId('A-1')).toBe(false); // number segment
      expect(validateTaskId('A--B')).toBe(false); // double dash
      expect(validateTaskId('A-B-')).toBe(false); // trailing dash
      expect(validateTaskId('')).toBe(false); // empty
      expect(validateTaskId('A1')).toBe(false); // mixed letters and numbers without dash
      expect(validateTaskId('A-b')).toBe(false); // lowercase in segment
    });
  });

  describe('validateSubtaskId', () => {
    it('should validate correct parent-child relationships', () => {
      expect(validateSubtaskId('A-BCDE', 'A')).toBe(true);
      expect(validateSubtaskId('A-BCDE-FGHI', 'A-BCDE')).toBe(true);
      expect(validateSubtaskId('BB-CDEF-GHIJ', 'BB-CDEF')).toBe(true);
    });

    it('should reject incorrect parent-child relationships', () => {
      expect(validateSubtaskId('A-BCDE', 'B')).toBe(false); // wrong parent
      expect(validateSubtaskId('A-BCDE-FGHI', 'A')).toBe(false); // skipping level
      expect(validateSubtaskId('A', 'A-BCDE')).toBe(false); // parent is child
      expect(validateSubtaskId('A-BCDE', 'A-BCDE')).toBe(false); // same ID
      expect(validateSubtaskId('A-FGHI', 'A-BCDE')).toBe(false); // sibling, not child
    });
  });
}); 