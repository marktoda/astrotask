import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MinimalHandlers } from '../../src/handlers/MinimalHandlers.js';
import { createTestAstrotask, type Astrotask, TASK_IDENTIFIERS } from '@astrotask/core';

describe('MCP Handler Task Validation', () => {
  let astrotask: Astrotask;
  let handlers: MinimalHandlers;

  beforeEach(async () => {
    // Create test Astrotask instance without LLM services
    astrotask = await createTestAstrotask();
    
    // Create handler context
    const context = {
      astrotask,
      requestId: 'test',
      timestamp: new Date().toISOString(),
    };
    
    handlers = new MinimalHandlers(context);
  });

  afterEach(async () => {
    // Clean up
    await astrotask.dispose();
  });

  describe('addTasks validation', () => {
    it('should reject tasks with __PROJECT_ROOT__ in the ID', async () => {
      await expect(
        handlers.addTasks({
          tasks: [{
            title: 'Test Task',
            parentTaskId: '__PROJECT_ROOT__-ABCD',
            priority: 'medium',
            status: 'pending',
          }]
        })
      ).rejects.toThrow(/invalid parent ID containing PROJECT_ROOT/);
    });

    it('should convert __PROJECT_ROOT__ parent to root task', async () => {
      const result = await handlers.addTasks({
        tasks: [{
          title: 'Test Task',
          parentTaskId: TASK_IDENTIFIERS.PROJECT_ROOT,
          priority: 'medium',
          status: 'pending',
        }]
      });
      
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
      // The task ID should be a root-level ID (4 letters)
      expect(result.tasks[0].id).toMatch(/^[A-Z]{4}$/);
    });

    it('should reject empty task titles', async () => {
      await expect(
        handlers.addTasks({
          tasks: [{
            title: '',
            description: 'Test description',
            priority: 'medium',
            status: 'pending',
          }]
        })
      ).rejects.toThrow(/empty or missing title/);
    });

    it('should reject overly long task titles', async () => {
      const longTitle = 'A'.repeat(201);
      await expect(
        handlers.addTasks({
          tasks: [{
            title: longTitle,
            description: 'Test description',
            priority: 'medium',
            status: 'pending',
          }]
        })
      ).rejects.toThrow(/title is too long/);
    });

    it('should reject overly long descriptions', async () => {
      const longDescription = 'A'.repeat(1001);
      await expect(
        handlers.addTasks({
          tasks: [{
            title: 'Test Task',
            description: longDescription,
            priority: 'medium',
            status: 'pending',
          }]
        })
      ).rejects.toThrow(/description is too long/);
    });

    it('should reject invalid parent task IDs', async () => {
      await expect(
        handlers.addTasks({
          tasks: [{
            title: 'Test Task',
            parentTaskId: 'invalid-id-123',
            priority: 'medium',
            status: 'pending',
          }]
        })
      ).rejects.toThrow(/invalid parent ID format/);
    });

    it('should accept valid task hierarchies', async () => {
      const result = await handlers.addTasks({
        tasks: [
          {
            title: 'Parent Task',
            description: 'A parent task',
            priority: 'medium',
            status: 'pending',
          },
          {
            title: 'Child Task',
            description: 'A child task',
            parentIndex: 0,
            priority: 'medium',
            status: 'pending',
          }
        ]
      });
      
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
      expect(result.tasks[1].parentId).toBe(result.tasks[0].id);
    });

    it('should validate all tasks before creating any', async () => {
      // This should fail validation and not create any tasks
      await expect(
        handlers.addTasks({
          tasks: [
            {
              title: 'Valid Task 1',
              description: 'Valid description',
              priority: 'medium',
              status: 'pending',
            },
            {
              title: 'Valid Task 2',
              description: 'Valid description',
              priority: 'medium',
              status: 'pending',
            },
            {
              title: '', // Invalid - empty title
              description: 'Valid description',
              priority: 'medium',
              status: 'pending',
            }
          ]
        })
      ).rejects.toThrow(/empty or missing title/);
      
      // Verify no tasks were created
      const tasks = await astrotask.store.listTasks();
      // Should only have PROJECT_ROOT
      expect(tasks.filter(t => t.id !== TASK_IDENTIFIERS.PROJECT_ROOT)).toHaveLength(0);
    });
  });
}); 
