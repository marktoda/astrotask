import { describe, it, expect } from 'vitest';
import { options } from '../../../source/commands/task/expand.js';

describe('Expand Task Command', () => {
  describe('options schema', () => {
    it('should validate valid options with root only', () => {
      const validOptions = {
        root: 'ABCD-1234',
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should validate valid options with all parameters', () => {
      const validOptions = {
        root: 'ABCD-1234',
        context: 'Additional context for expansion',
        force: true,
        threshold: 7,
        verbose: true,
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should validate valid options with root expansion', () => {
      const validOptions = {
        root: 'PARENT-TASK-ID',
        force: false,
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should require root', () => {
      const invalidOptions = {
        context: 'Some context',
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate root is string', () => {
      const invalidOptions = {
        root: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate context is string when provided', () => {
      const invalidOptions = {
        root: 'ABCD-1234',
        context: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate threshold is number when provided', () => {
      const invalidOptions = {
        root: 'ABCD-1234',
        threshold: 'high', // Not a number
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate threshold is within range', () => {
      const invalidOptionsLow = {
        root: 'ABCD-1234',
        threshold: 0, // Below minimum
      };

      const invalidOptionsHigh = {
        root: 'ABCD-1234',
        threshold: 11, // Above maximum
      };

      expect(() => options.parse(invalidOptionsLow)).toThrow();
      expect(() => options.parse(invalidOptionsHigh)).toThrow();
    });

    it('should validate boolean fields', () => {
      const invalidOptions = {
        root: 'ABCD-1234',
        force: 'true', // Not a boolean
        verbose: 'false', // Not a boolean
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should apply default values correctly', () => {
      const minimalOptions = {
        root: 'ABCD-1234',
      };

      const result = options.parse(minimalOptions);
      expect(result.root).toBe('ABCD-1234');
      expect(result.force).toBe(false);
      expect(result.threshold).toBe(5);
      expect(result.verbose).toBe(false);
      expect(result.context).toBeUndefined();
    });

    it('should preserve provided values over defaults', () => {
      const customOptions = {
        root: 'ABCD-1234',
        force: true,
        threshold: 8,
        verbose: true,
      };

      const result = options.parse(customOptions);
      expect(result.force).toBe(true);
      expect(result.threshold).toBe(8);
      expect(result.verbose).toBe(true);
    });

    it('should handle edge case values', () => {
      const edgeCaseOptions = {
        root: 'ABCD-1234',
        threshold: 10, // Maximum value
      };

      expect(() => options.parse(edgeCaseOptions)).not.toThrow();
      const result = options.parse(edgeCaseOptions);
      expect(result.threshold).toBe(10);
    });

    it('should handle long context strings', () => {
      const longContext = 'A'.repeat(1000); // Very long context
      const optionsWithLongContext = {
        root: 'ABCD-1234',
        context: longContext,
      };

      expect(() => options.parse(optionsWithLongContext)).not.toThrow();
      const result = options.parse(optionsWithLongContext);
      expect(result.context).toBe(longContext);
    });

    it('should handle special characters in root', () => {
      const specialRootIds = [
        'TASK-123',
        'TASK_456',
        'TASK.789',
        'TASK@ABC',
        'TASK#DEF',
      ];

      for (const rootId of specialRootIds) {
        const options_with_special_id = {
          root: rootId,
        };

        expect(() => options.parse(options_with_special_id)).not.toThrow();
        const result = options.parse(options_with_special_id);
        expect(result.root).toBe(rootId);
      }
    });

    it('should handle root with special characters', () => {
      const validOptions = {
        root: 'PARENT-TASK_ID.123',
      };

      expect(() => options.parse(validOptions)).not.toThrow();
      const result = options.parse(validOptions);
      expect(result.root).toBe('PARENT-TASK_ID.123');
    });
  });
}); 