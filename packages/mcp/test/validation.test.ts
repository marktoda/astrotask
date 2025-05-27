import { describe, it, expect } from 'vitest';
import {
  sanitizedString,
  uuidSchema,
  taskStatusSchema,
  prioritySchema,
  paginationSchema,
  createTaskSchema,
  updateTaskSchema,
  listTasksSchema,
  deleteTaskSchema,
  completeTaskSchema,
  getTaskContextSchema,
  validateInput,
  validateInputAsync,
  safeValidateInput,
} from '../src/validation/index.js';
import { z } from 'zod';
import { ValidationError } from '../src/errors/index.js';

describe('Validation Module', () => {
  describe('sanitizedString', () => {
    it('should validate basic strings', () => {
      const schema = sanitizedString();
      
      expect(schema.parse('hello world')).toBe('hello world');
      expect(schema.parse('  trimmed  ')).toBe('trimmed');
    });

    it('should reject script tags', () => {
      const schema = sanitizedString();
      
      expect(() => schema.parse('<script>alert("xss")</script>')).toThrow('Script tags are not allowed');
      expect(() => schema.parse('safe<script>unsafe</script>text')).toThrow('Script tags are not allowed');
    });

    it('should reject javascript protocols', () => {
      const schema = sanitizedString();
      
      expect(() => schema.parse('javascript:alert("xss")')).toThrow('JavaScript protocols are not allowed');
      expect(() => schema.parse('some text javascript: malicious')).toThrow('JavaScript protocols are not allowed');
    });

    it('should enforce length constraints', () => {
      const schema = sanitizedString({ min: 5, max: 10 });
      
      expect(() => schema.parse('abc')).toThrow('Must be at least 5 characters');
      expect(() => schema.parse('this is too long for the limit')).toThrow('Must be at most 10 characters');
      expect(schema.parse('perfect')).toBe('perfect');
    });

    it('should handle empty strings with allowEmpty option', () => {
      const schema = sanitizedString({ allowEmpty: true });
      
      expect(schema.parse('')).toBe('');
      expect(schema.parse('   ')).toBe('');
    });

    it('should reject empty strings by default', () => {
      const schema = sanitizedString();
      
      expect(() => schema.parse('')).toThrow('Must be at least 1 characters');
      expect(() => schema.parse('   ')).toThrow('Cannot be empty after trimming');
    });

    it('should enforce pattern matching', () => {
      const schema = sanitizedString({ pattern: /^[a-z]+$/ });
      
      expect(schema.parse('lowercase')).toBe('lowercase');
      expect(() => schema.parse('UPPERCASE')).toThrow('Must match the required pattern');
      expect(() => schema.parse('with123numbers')).toThrow('Must match the required pattern');
    });
  });

  describe('uuidSchema', () => {
    it('should validate proper UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(uuidSchema.parse(validUuid)).toBe(validUuid);
    });

    it('should reject invalid UUIDs', () => {
      expect(() => uuidSchema.parse('not-a-uuid')).toThrow('Must be a valid UUID');
      expect(() => uuidSchema.parse('550e8400-e29b-41d4-a716')).toThrow('Must be a valid UUID');
    });
  });

  describe('taskStatusSchema', () => {
    it('should validate allowed task statuses', () => {
      expect(taskStatusSchema.parse('pending')).toBe('pending');
      expect(taskStatusSchema.parse('in-progress')).toBe('in-progress');
      expect(taskStatusSchema.parse('done')).toBe('done');
      expect(taskStatusSchema.parse('cancelled')).toBe('cancelled');
    });

    it('should reject invalid task statuses', () => {
      expect(() => taskStatusSchema.parse('invalid-status')).toThrow();
      expect(() => taskStatusSchema.parse('completed')).toThrow();
    });
  });

  describe('prioritySchema', () => {
    it('should validate allowed priorities', () => {
      expect(prioritySchema.parse('low')).toBe('low');
      expect(prioritySchema.parse('medium')).toBe('medium');
      expect(prioritySchema.parse('high')).toBe('high');
    });

    it('should reject invalid priorities', () => {
      expect(() => prioritySchema.parse('critical')).toThrow();
      expect(() => prioritySchema.parse('urgent')).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('should provide default values', () => {
      const result = paginationSchema.parse({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should calculate offset from page and limit', () => {
      const result = paginationSchema.parse({ page: 3, limit: 10 });
      
      expect(result.offset).toBe(20);
    });

    it('should use explicit offset when provided', () => {
      const result = paginationSchema.parse({ page: 2, limit: 10, offset: 50 });
      
      expect(result.offset).toBe(50);
    });

    it('should enforce positive page numbers', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
      expect(() => paginationSchema.parse({ page: -1 })).toThrow();
    });

    it('should enforce limit boundaries', () => {
      expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('createTaskSchema', () => {
    it('should validate minimal task creation', () => {
      const task = {
        title: 'Test Task',
      };
      
      const result = createTaskSchema.parse(task);
      expect(result.title).toBe('Test Task');
      expect(result.status).toBe('pending');
      expect(result.priority).toBe('medium');
    });

    it('should validate complete task creation', () => {
      const task = {
        title: 'Complete Task',
        description: 'A detailed description',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'in-progress',
        priority: 'high',
        tags: ['important', 'frontend'],
      };
      
      const result = createTaskSchema.parse(task);
      expect(result.title).toBe('Complete Task');
      expect(result.description).toBe('A detailed description');
      expect(result.status).toBe('in-progress');
      expect(result.priority).toBe('high');
      expect(result.tags).toEqual(['important', 'frontend']);
    });

    it('should reject invalid task creation data', () => {
      expect(() => createTaskSchema.parse({})).toThrow(); // Missing title
      expect(() => createTaskSchema.parse({ title: '' })).toThrow(); // Empty title
      expect(() => createTaskSchema.parse({ 
        title: 'Test',
        parentId: 'not-a-uuid' 
      })).toThrow(); // Invalid UUID
    });
  });

  describe('updateTaskSchema', () => {
    it('should validate task updates', () => {
      const update = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Updated Title',
        status: 'done',
      };
      
      const result = updateTaskSchema.parse(update);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.title).toBe('Updated Title');
      expect(result.status).toBe('done');
    });

    it('should require valid ID', () => {
      expect(() => updateTaskSchema.parse({
        id: 'invalid-uuid',
        title: 'Test'
      })).toThrow();
    });
  });

  describe('listTasksSchema', () => {
    it('should validate task listing with defaults', () => {
      const result = listTasksSchema.parse({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.includeSubtasks).toBe(false);
      expect(result.offset).toBe(0);
    });

    it('should validate task listing with filters', () => {
      const query = {
        status: 'pending',
        priority: 'high',
        search: 'test query',
        tags: ['urgent'],
        page: 2,
        limit: 50,
      };
      
      const result = listTasksSchema.parse(query);
      expect(result.status).toBe('pending');
      expect(result.priority).toBe('high');
      expect(result.search).toBe('test query');
      expect(result.tags).toEqual(['urgent']);
      expect(result.offset).toBe(50);
    });
  });

  describe('deleteTaskSchema', () => {
    it('should validate task deletion', () => {
      const deletion = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };
      
      const result = deleteTaskSchema.parse(deletion);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.cascade).toBe(true);
    });

    it('should allow disabling cascade', () => {
      const deletion = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        cascade: false,
      };
      
      const result = deleteTaskSchema.parse(deletion);
      expect(result.cascade).toBe(false);
    });
  });

  describe('completeTaskSchema', () => {
    it('should validate task completion', () => {
      const completion = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };
      
      const result = completeTaskSchema.parse(completion);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('getTaskContextSchema', () => {
    it('should validate context retrieval with defaults', () => {
      const context = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };
      
      const result = getTaskContextSchema.parse(context);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.includeAncestors).toBe(true);
      expect(result.includeDescendants).toBe(true);
      expect(result.maxDepth).toBe(5);
    });

    it('should validate context retrieval with custom options', () => {
      const context = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        includeAncestors: false,
        maxDepth: 2,
      };
      
      const result = getTaskContextSchema.parse(context);
      expect(result.includeAncestors).toBe(false);
      expect(result.maxDepth).toBe(2);
    });
  });

  describe('validation utility functions', () => {
    describe('validateInput', () => {
      it('should validate valid input', () => {
        const schema = z.object({ name: z.string() });
        const input = { name: 'John' };
        
        const result = validateInput(schema, input);
        expect(result.name).toBe('John');
      });

      it('should throw ValidationError for invalid input', () => {
        const schema = z.object({ name: z.string() });
        const input = { name: 123 };
        
        expect(() => validateInput(schema, input)).toThrow(ValidationError);
      });
    });

    describe('validateInputAsync', () => {
      it('should validate valid input asynchronously', async () => {
        const schema = z.object({ name: z.string() });
        const input = { name: 'John' };
        
        const result = await validateInputAsync(schema, input);
        expect(result.name).toBe('John');
      });

      it('should reject invalid input asynchronously', async () => {
        const schema = z.object({ name: z.string() });
        const input = { name: 123 };
        
        await expect(validateInputAsync(schema, input)).rejects.toThrow(ValidationError);
      });
    });

    describe('safeValidateInput', () => {
      it('should return success result for valid input', () => {
        const schema = z.object({ name: z.string() });
        const input = { name: 'John' };
        
        const result = safeValidateInput(schema, input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe('John');
        }
      });

      it('should return error result for invalid input', () => {
        const schema = z.object({ name: z.string() });
        const input = { name: 123 };
        
        const result = safeValidateInput(schema, input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(ValidationError);
        }
      });
    });
  });
}); 