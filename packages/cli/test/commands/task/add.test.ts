import { describe, it, expect } from 'vitest';
import { options } from '../../../source/commands/task/add.js';

describe('Add Task Command', () => {
  describe('options schema', () => {
    it('should validate valid options', () => {
      const validOptions = {
        title: 'Test Task',
        description: 'A test task description',
        parent: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should require title', () => {
      const invalidOptions = {
        description: 'A task without title',
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should allow optional description and parent', () => {
      const minimalOptions = {
        title: 'Minimal Task',
      };

      const result = options.parse(minimalOptions);
      expect(result.title).toBe('Minimal Task');
      expect(result.description).toBeUndefined();
      expect(result.parent).toBeUndefined();
    });

    it('should validate title is string', () => {
      const invalidOptions = {
        title: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate description is string when provided', () => {
      const invalidOptions = {
        title: 'Valid Title',
        description: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate parent is string when provided', () => {
      const invalidOptions = {
        title: 'Valid Title',
        parent: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });
  });
}); 