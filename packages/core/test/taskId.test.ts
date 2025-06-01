import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import {
  parseTaskId,
  validateTaskId,
  validateSubtaskId,
  generateNextRootTaskId,
  generateNextSubtaskId,
  generateNextTaskId,
  TaskIdGenerationError,
} from '../src/utils/taskId.js';
import { taskId as taskIdSchema } from '../src/schemas/base.js';
import { createDatabase } from '../src/database/index.js';
import { TASK_IDENTIFIERS } from '../src/entities/TaskTreeConstants.js';
import type { Store } from '../src/database/store.js';

describe('Task ID Utilities', () => {
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

    it('should parse single-letter root task IDs', () => {
      const parsed = parseTaskId('A');
      expect(parsed).toEqual({
        rootId: 'A',
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
      const parsed = parseTaskId('ABCD-EFGH-IJKL-MNOP');
      expect(parsed).toEqual({
        rootId: 'ABCD',
        segments: ['EFGH', 'IJKL', 'MNOP'],
        depth: 3,
        isRoot: false,
      });
    });

    it('should handle edge case with empty string', () => {
      const parsed = parseTaskId('');
      expect(parsed).toEqual({
        rootId: '',
        segments: [],
        depth: 0,
        isRoot: true,
      });
    });
  });

  describe('validateTaskId', () => {
    it('should validate root task IDs', () => {
      expect(validateTaskId('A')).toBe(true);
      expect(validateTaskId('Z')).toBe(true);
      expect(validateTaskId('ABCD')).toBe(true);
      expect(validateTaskId('XYZW')).toBe(true);
      expect(validateTaskId('ABCDEFGH')).toBe(true);
    });

    it('should validate subtask IDs', () => {
      expect(validateTaskId('A-BCDE')).toBe(true);
      expect(validateTaskId('ABCD-EFGH')).toBe(true);
      expect(validateTaskId('A-BCDEFGHIJ')).toBe(true);
      expect(validateTaskId('ABCD-EFGH-IJKL')).toBe(true);
      expect(validateTaskId('A-BCDE-FGHI-JKLM-NOPQ')).toBe(true);
    });

    it('should validate PROJECT_ROOT constant', () => {
      expect(validateTaskId(TASK_IDENTIFIERS.PROJECT_ROOT)).toBe(true);
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
      expect(validateTaskId('A-B-c')).toBe(false); // lowercase in nested segment
      expect(validateTaskId('-A')).toBe(false); // leading dash
      expect(validateTaskId('A-')).toBe(false); // trailing dash
      expect(validateTaskId('A-B-')).toBe(false); // trailing dash in nested
    });
  });

  describe('validateSubtaskId', () => {
    it('should validate correct parent-child relationships', () => {
      expect(validateSubtaskId('A-BCDE', 'A')).toBe(true);
      expect(validateSubtaskId('ABCD-EFGH', 'ABCD')).toBe(true);
      expect(validateSubtaskId('A-BCDE-FGHI', 'A-BCDE')).toBe(true);
      expect(validateSubtaskId('ABCD-EFGH-IJKL', 'ABCD-EFGH')).toBe(true);
    });

    it('should reject incorrect parent-child relationships', () => {
      expect(validateSubtaskId('A-BCDE', 'B')).toBe(false); // wrong parent
      expect(validateSubtaskId('ABCD-EFGH', 'XYZW')).toBe(false); // wrong parent
      expect(validateSubtaskId('A-BCDE-FGHI', 'A')).toBe(false); // skipping level
      expect(validateSubtaskId('A', 'A-BCDE')).toBe(false); // parent is child
      expect(validateSubtaskId('A-BCDE', 'A-BCDE')).toBe(false); // same ID
      expect(validateSubtaskId('A-FGHI', 'A-BCDE')).toBe(false); // sibling, not child
    });

    it('should reject invalid task IDs', () => {
      expect(validateSubtaskId('invalid', 'A')).toBe(false);
      expect(validateSubtaskId('A-BCDE', 'invalid')).toBe(false);
    });
  });

  describe('Zod Schema Validation', () => {
    it('should validate root task IDs with schema', () => {
      expect(() => taskIdSchema.parse('A')).not.toThrow();
      expect(() => taskIdSchema.parse('ABCD')).not.toThrow();
      expect(() => taskIdSchema.parse('XYZW')).not.toThrow();
      expect(() => taskIdSchema.parse(TASK_IDENTIFIERS.PROJECT_ROOT)).not.toThrow();
    });

    it('should validate subtask IDs with schema', () => {
      expect(() => taskIdSchema.parse('A-BCDE')).not.toThrow();
      expect(() => taskIdSchema.parse('ABCD-EFGH')).not.toThrow();
      expect(() => taskIdSchema.parse('A-BCDE-FGHI-JKLM')).not.toThrow();
    });

    it('should reject invalid task IDs with schema', () => {
      expect(() => taskIdSchema.parse('a')).toThrow();
      expect(() => taskIdSchema.parse('A-')).toThrow();
      expect(() => taskIdSchema.parse('A--B')).toThrow();
      expect(() => taskIdSchema.parse('')).toThrow();
      expect(() => taskIdSchema.parse('A1')).toThrow();
    });

    it('should have consistent validation between schema and utility function', () => {
      const testIds = [
        'A', 'ABCD', 'XYZW', 'A-BCDE', 'ABCD-EFGH', 'A-BCDE-FGHI',
        'a', 'A-', 'A--B', '', 'A1', 'A-b', '-A'
      ];

      for (const id of testIds) {
        const utilityValid = validateTaskId(id);
        let schemaValid = false;
        try {
          taskIdSchema.parse(id);
          schemaValid = true;
        } catch {
          schemaValid = false;
        }
        
        if (utilityValid !== schemaValid) {
          throw new Error(`Validation mismatch for "${id}": utility=${utilityValid}, schema=${schemaValid}`);
        }
        expect(utilityValid).toBe(schemaValid);
      }
    });
  });
});

describe('Task ID Generation', () => {
  let store: Store;
  let dbPath: string;

  beforeEach(async () => {
    // Create a unique database for each test
    dbPath = join(tmpdir(), `task-id-test-${Date.now()}`);
    store = await createDatabase({ dataDir: dbPath, verbose: false });
  });

  afterEach(async () => {
    if (store) {
      await store.close();
    }
    if (dbPath && existsSync(dbPath)) {
      rmSync(dbPath, { recursive: true, force: true });
    }
  });

  describe('generateNextRootTaskId', () => {
    it('should generate valid root task IDs', async () => {
      const id = await generateNextRootTaskId(store);
      expect(validateTaskId(id)).toBe(true);
      expect(parseTaskId(id).isRoot).toBe(true);
      expect(id).toMatch(/^[A-Z]{4}$/); // Should be 4 uppercase letters
    });

    it('should generate unique root task IDs', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const id = await generateNextRootTaskId(store);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
        
        // Create a task with this ID to ensure collision detection works
        await store.addTaskWithId({
          id,
          title: `Test Task ${i}`,
          description: 'Test task',
          status: 'pending',
          priority: 'medium',
        });
      }
    });

    it('should avoid collisions with existing tasks', async () => {
      // Create a task with a specific ID
      await store.addTaskWithId({
        id: 'AAAA',
        title: 'Existing Task',
        description: 'Test task',
        status: 'pending',
        priority: 'medium',
      });

      // Generate many IDs and ensure none collide with AAAA
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const id = await generateNextRootTaskId(store);
        expect(id).not.toBe('AAAA');
        ids.add(id);
      }
    });
  });

  describe('generateNextSubtaskId', () => {
    it('should generate valid subtask IDs', async () => {
      const parentId = 'ABCD';
      const id = await generateNextSubtaskId(store, parentId);
      
      expect(validateTaskId(id)).toBe(true);
      expect(validateSubtaskId(id, parentId)).toBe(true);
      expect(parseTaskId(id).isRoot).toBe(false);
      expect(parseTaskId(id).depth).toBe(1);
      expect(id).toMatch(/^ABCD-[A-Z]{4}$/);
    });

    it('should generate unique subtask IDs for same parent', async () => {
      const parentId = 'ABCD';
      const ids = new Set<string>();
      
      for (let i = 0; i < 10; i++) {
        const id = await generateNextSubtaskId(store, parentId);
        expect(ids.has(id)).toBe(false);
        expect(id.startsWith(`${parentId}-`)).toBe(true);
        ids.add(id);
        
        // Create a task with this ID to ensure collision detection works
        await store.addTaskWithId({
          id,
          title: `Test Subtask ${i}`,
          description: 'Test subtask',
          status: 'pending',
          priority: 'medium',
        });
      }
    });

    it('should work with nested parent IDs', async () => {
      const parentId = 'ABCD-EFGH-IJKL';
      const id = await generateNextSubtaskId(store, parentId);
      
      expect(validateTaskId(id)).toBe(true);
      expect(validateSubtaskId(id, parentId)).toBe(true);
      expect(parseTaskId(id).depth).toBe(3);
      expect(id).toMatch(/^ABCD-EFGH-IJKL-[A-Z]{4}$/);
    });
  });

  describe('generateNextTaskId', () => {
    it('should generate root ID when no parent provided', async () => {
      const id = await generateNextTaskId(store);
      expect(parseTaskId(id).isRoot).toBe(true);
      expect(validateTaskId(id)).toBe(true);
    });

    it('should generate root ID when parent is undefined', async () => {
      const id = await generateNextTaskId(store, undefined);
      expect(parseTaskId(id).isRoot).toBe(true);
      expect(validateTaskId(id)).toBe(true);
    });

    it('should generate subtask ID when parent provided', async () => {
      const parentId = 'ABCD';
      const id = await generateNextTaskId(store, parentId);
      expect(parseTaskId(id).isRoot).toBe(false);
      expect(validateSubtaskId(id, parentId)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw TaskIdGenerationError when no unique ID can be generated', async () => {
      // Mock the store to always return an existing task
      const mockStore = {
        getTask: async () => ({ id: 'mock', title: 'Mock Task' }),
      } as any;

      await expect(generateNextRootTaskId(mockStore)).rejects.toThrow(TaskIdGenerationError);
      await expect(generateNextSubtaskId(mockStore, 'ABCD')).rejects.toThrow(TaskIdGenerationError);
    });

    it('should include error details in TaskIdGenerationError', async () => {
      const mockStore = {
        getTask: async () => ({ id: 'mock', title: 'Mock Task' }),
      } as any;

      try {
        await generateNextRootTaskId(mockStore);
        throw new Error('Should have thrown TaskIdGenerationError');
      } catch (error) {
        expect(error).toBeInstanceOf(TaskIdGenerationError);
        expect(error.message).toContain('root');
        expect(error.message).toContain('100');
      }
    });
  });

  describe('Integration with PROJECT_ROOT', () => {
    it('should handle PROJECT_ROOT as a valid task ID', () => {
      const projectRootId = TASK_IDENTIFIERS.PROJECT_ROOT;
      expect(validateTaskId(projectRootId)).toBe(true);
      expect(() => taskIdSchema.parse(projectRootId)).not.toThrow();
    });

    it('should not generate PROJECT_ROOT as a random ID', async () => {
      // Generate many IDs and ensure none are PROJECT_ROOT
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const id = await generateNextRootTaskId(store);
        expect(id).not.toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
        ids.add(id);
      }
    });

    it('should allow subtasks of PROJECT_ROOT', async () => {
      const projectRootId = TASK_IDENTIFIERS.PROJECT_ROOT;
      const subtaskId = await generateNextSubtaskId(store, projectRootId);
      
      expect(validateSubtaskId(subtaskId, projectRootId)).toBe(true);
      expect(subtaskId.startsWith(`${projectRootId}-`)).toBe(true);
    });
  });

  describe('PROJECT_ROOT handling', () => {
    it('should generate root-level IDs for tasks with null parent', async () => {
      // Create a task without parent
      const task = await store.addTask({
        title: 'Test Task',
        description: 'Test task with no parent',
        status: 'pending',
        priority: 'medium',
        // parentId omitted - will be undefined/null
      });

      // Should get a root-level task ID (4 uppercase letters)
      expect(task.id).toMatch(/^[A-Z]{4}$/);
      expect(task.parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT); // Restored PROJECT_ROOT system
    });

    it('should generate subtask IDs for tasks with non-null parent', async () => {
      // First create a root task
      const rootTask = await store.addTask({
        title: 'Root Task',
        description: 'Root task',
        status: 'pending',
        priority: 'medium',
      });

      // Then create a subtask
      const subtask = await store.addTask({
        title: 'Subtask',
        description: 'Subtask of root task',
        status: 'pending',
        priority: 'medium',
        parentId: rootTask.id,
      });

      // Should get a subtask ID (parent-XXXX format)
      expect(subtask.id).toMatch(new RegExp(`^${rootTask.id}-[A-Z]{4}$`));
      expect(subtask.parentId).toBe(rootTask.id);
    });

    it('should treat undefined parentId same as null for ID generation', async () => {
      // Create task with undefined parentId
      const task1 = await store.addTask({
        title: 'Task 1',
        description: 'Task with undefined parent',
        status: 'pending',
        priority: 'medium',
        // parentId is undefined
      });

      // Create task with explicit undefined parentId
      const task2 = await store.addTask({
        title: 'Task 2',
        description: 'Task with null parent',
        status: 'pending',
        priority: 'medium',
        parentId: undefined,
      });

      // Both should get root-level task IDs
      expect(task1.id).toMatch(/^[A-Z]{4}$/);
      expect(task2.id).toMatch(/^[A-Z]{4}$/);
      
      // Both should have PROJECT_ROOT as parent in database (restored PROJECT_ROOT system)
      expect(task1.parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
      expect(task2.parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
    });
  });

  describe('Performance and Scalability', () => {
    it('should generate IDs efficiently', async () => {
      const startTime = Date.now();
      const ids = new Set<string>();
      
      // Generate 100 IDs
      for (let i = 0; i < 100; i++) {
        const id = await generateNextRootTaskId(store);
        ids.add(id);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(ids.size).toBe(100); // All unique
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle high collision scenarios gracefully', async () => {
      // Pre-populate database with many tasks to increase collision probability
      const existingIds = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const id = await generateNextRootTaskId(store);
        await store.addTaskWithId({
          id,
          title: `Existing Task ${i}`,
          description: 'Test task',
          status: 'pending',
          priority: 'medium',
        });
        existingIds.add(id);
      }

      // Generate more IDs - should still work despite higher collision probability
      for (let i = 0; i < 10; i++) {
        const id = await generateNextRootTaskId(store);
        expect(existingIds.has(id)).toBe(false);
        existingIds.add(id);
      }
    });
  });
}); 
