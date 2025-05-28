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
      const parsed = parseTaskId('ABCD');
      expect(parsed).toEqual({
        rootId: 'ABCD',
        segments: [],
        depth: 0,
        isRoot: true,
      });
    });

    it('should parse subtask IDs correctly', () => {
      const parsed = parseTaskId('ABCD-EFGH');
      expect(parsed).toEqual({
        rootId: 'ABCD',
        segments: ['EFGH'],
        depth: 1,
        isRoot: false,
      });
    });

    it('should parse nested subtask IDs correctly', () => {
      const parsed = parseTaskId('ABCD-EFGH-IJKL');
      expect(parsed).toEqual({
        rootId: 'ABCD',
        segments: ['EFGH', 'IJKL'],
        depth: 2,
        isRoot: false,
      });
    });
  });

  describe('validateTaskId', () => {
    it('should validate root task IDs', () => {
      expect(validateTaskId('ABCD')).toBe(true);
      expect(validateTaskId('ZYXW')).toBe(true);
      expect(validateTaskId('QRST')).toBe(true);
    });

    it('should validate subtask IDs', () => {
      expect(validateTaskId('ABCD-EFGH')).toBe(true);
      expect(validateTaskId('ABCD-EFGH-IJKL')).toBe(true);
      expect(validateTaskId('ABCD-EFGH-IJKL-MNOP')).toBe(true);
    });

    it('should reject invalid task IDs', () => {
      expect(validateTaskId('abc')).toBe(false); // lowercase
      expect(validateTaskId('1234')).toBe(false); // numbers
      expect(validateTaskId('A')).toBe(false); // too short
      expect(validateTaskId('ABCDE')).toBe(false); // too long
      expect(validateTaskId('ABCD-')).toBe(false); // trailing dash
      expect(validateTaskId('ABCD-EFG')).toBe(false); // short segment
      expect(validateTaskId('ABCD--EFGH')).toBe(false); // double dash
      expect(validateTaskId('ABCD-EFGH-')).toBe(false); // trailing dash
      expect(validateTaskId('')).toBe(false); // empty
      expect(validateTaskId('ABCD.EFGH')).toBe(false); // dot instead of dash
    });
  });

  describe('validateSubtaskId', () => {
    it('should validate correct parent-child relationships', () => {
      expect(validateSubtaskId('ABCD-EFGH', 'ABCD')).toBe(true);
      expect(validateSubtaskId('ABCD-EFGH-IJKL', 'ABCD-EFGH')).toBe(true);
      expect(validateSubtaskId('ABCD-EFGH-IJKL-MNOP', 'ABCD-EFGH-IJKL')).toBe(true);
    });

    it('should reject incorrect parent-child relationships', () => {
      expect(validateSubtaskId('ABCD-EFGH', 'ZYXW')).toBe(false); // wrong parent
      expect(validateSubtaskId('ABCD-EFGH-IJKL', 'ABCD')).toBe(false); // skipping level
      expect(validateSubtaskId('ABCD', 'ABCD-EFGH')).toBe(false); // parent is child
      expect(validateSubtaskId('ABCD-EFGH', 'ABCD-EFGH')).toBe(false); // same ID
      expect(validateSubtaskId('ABCD-IJKL', 'ABCD-EFGH')).toBe(false); // sibling, not child
    });
  });
}); 