import { describe, it, expect } from 'vitest';
import {
  numberToLetters,
  lettersToNumber,
  parseTaskId,
  validateTaskId,
  validateSubtaskId,
} from '../src/utils/taskId.js';

describe('Task ID Utilities', () => {
  describe('numberToLetters', () => {
    it('should convert numbers to letters correctly', () => {
      expect(numberToLetters(0)).toBe('A');
      expect(numberToLetters(1)).toBe('B');
      expect(numberToLetters(25)).toBe('Z');
      expect(numberToLetters(26)).toBe('AA');
      expect(numberToLetters(27)).toBe('AB');
      expect(numberToLetters(51)).toBe('AZ');
      expect(numberToLetters(52)).toBe('BA');
      expect(numberToLetters(701)).toBe('ZZ');
      expect(numberToLetters(702)).toBe('AAA');
    });
  });

  describe('lettersToNumber', () => {
    it('should convert letters to numbers correctly', () => {
      expect(lettersToNumber('A')).toBe(0);
      expect(lettersToNumber('B')).toBe(1);
      expect(lettersToNumber('Z')).toBe(25);
      expect(lettersToNumber('AA')).toBe(26);
      expect(lettersToNumber('AB')).toBe(27);
      expect(lettersToNumber('AZ')).toBe(51);
      expect(lettersToNumber('BA')).toBe(52);
      expect(lettersToNumber('ZZ')).toBe(701);
      expect(lettersToNumber('AAA')).toBe(702);
    });

    it('should be inverse of numberToLetters', () => {
      const testNumbers = [0, 1, 25, 26, 27, 51, 52, 100, 701, 702];
      testNumbers.forEach(num => {
        expect(lettersToNumber(numberToLetters(num))).toBe(num);
      });
    });
  });

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
      const parsed = parseTaskId('A.1');
      expect(parsed).toEqual({
        rootId: 'A',
        segments: [1],
        depth: 1,
        isRoot: false,
      });
    });

    it('should parse nested subtask IDs correctly', () => {
      const parsed = parseTaskId('BB.5.2.1');
      expect(parsed).toEqual({
        rootId: 'BB',
        segments: [5, 2, 1],
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
      expect(validateTaskId('A.1')).toBe(true);
      expect(validateTaskId('A.10')).toBe(true);
      expect(validateTaskId('BB.1.2')).toBe(true);
      expect(validateTaskId('A.1.2.3.4')).toBe(true);
    });

    it('should reject invalid task IDs', () => {
      expect(validateTaskId('a')).toBe(false); // lowercase
      expect(validateTaskId('1')).toBe(false); // starts with number
      expect(validateTaskId('A.')).toBe(false); // trailing dot
      expect(validateTaskId('A.0')).toBe(false); // zero segment
      expect(validateTaskId('A..1')).toBe(false); // double dot
      expect(validateTaskId('A.1.')).toBe(false); // trailing dot
      expect(validateTaskId('')).toBe(false); // empty
      expect(validateTaskId('A1')).toBe(false); // mixed letters and numbers without dot
    });
  });

  describe('validateSubtaskId', () => {
    it('should validate correct parent-child relationships', () => {
      expect(validateSubtaskId('A.1', 'A')).toBe(true);
      expect(validateSubtaskId('A.1.2', 'A.1')).toBe(true);
      expect(validateSubtaskId('BB.5.2', 'BB.5')).toBe(true);
    });

    it('should reject incorrect parent-child relationships', () => {
      expect(validateSubtaskId('A.1', 'B')).toBe(false); // wrong parent
      expect(validateSubtaskId('A.1.2', 'A')).toBe(false); // skipping level
      expect(validateSubtaskId('A', 'A.1')).toBe(false); // parent is child
      expect(validateSubtaskId('A.1', 'A.1')).toBe(false); // same ID
      expect(validateSubtaskId('A.2', 'A.1')).toBe(false); // sibling, not child
    });
  });
}); 