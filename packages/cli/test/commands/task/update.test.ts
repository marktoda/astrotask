import { describe, it, expect } from 'vitest';
import { options } from '../../../source/commands/task/update.js';

describe('Update Task Command', () => {
  describe('options schema', () => {
    it('should validate valid options', () => {
      const validOptions = {
        id: 'TASK-123',
        title: 'Updated Task',
        description: 'Updated description',
        status: 'in-progress' as const,
        priority: 'high' as const,
        parent: 'PARENT-456',
      };

      expect(() => options.parse(validOptions)).not.toThrow();
    });

    it('should require id', () => {
      const invalidOptions = {
        title: 'Updated Task',
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should allow minimal options with just id', () => {
      const minimalOptions = {
        id: 'TASK-123',
      };

      const result = options.parse(minimalOptions);
      expect(result.id).toBe('TASK-123');
      expect(result.title).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.status).toBeUndefined();
      expect(result.priority).toBeUndefined();
      expect(result.parent).toBeUndefined();
    });

    it('should validate status enum values', () => {
      const validStatuses = ['pending', 'in-progress', 'done', 'cancelled', 'archived'];
      
      for (const status of validStatuses) {
        const testOptions = {
          id: 'TASK-123',
          status,
        };
        expect(() => options.parse(testOptions)).not.toThrow();
      }
    });

    it('should reject invalid status values', () => {
      const invalidOptions = {
        id: 'TASK-123',
        status: 'in-progressz', // Invalid status
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate priority enum values', () => {
      const validPriorities = ['low', 'medium', 'high'];
      
      for (const priority of validPriorities) {
        const testOptions = {
          id: 'TASK-123',
          priority,
        };
        expect(() => options.parse(testOptions)).not.toThrow();
      }
    });

    it('should reject invalid priority values', () => {
      const invalidOptions = {
        id: 'TASK-123',
        priority: 'urgent', // Invalid priority
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate id is string', () => {
      const invalidOptions = {
        id: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate title is string when provided', () => {
      const invalidOptions = {
        id: 'TASK-123',
        title: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate description is string when provided', () => {
      const invalidOptions = {
        id: 'TASK-123',
        description: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should validate parent is string when provided', () => {
      const invalidOptions = {
        id: 'TASK-123',
        parent: 123, // Not a string
      };

      expect(() => options.parse(invalidOptions)).toThrow();
    });

    it('should provide helpful error message for invalid status', () => {
      const invalidOptions = {
        id: 'TASK-123',
        status: 'invalid-status',
      };

      try {
        options.parse(invalidOptions);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Invalid enum value');
        expect(error.message).toContain('pending');
        expect(error.message).toContain('in-progress');
        expect(error.message).toContain('done');
        expect(error.message).toContain('cancelled');
        expect(error.message).toContain('archived');
      }
    });

    it('should provide helpful error message for invalid priority', () => {
      const invalidOptions = {
        id: 'TASK-123',
        priority: 'invalid-priority',
      };

      try {
        options.parse(invalidOptions);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Invalid enum value');
        expect(error.message).toContain('low');
        expect(error.message).toContain('medium');
        expect(error.message).toContain('high');
      }
    });
  });
}); 