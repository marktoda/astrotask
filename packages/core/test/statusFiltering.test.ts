import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'fs';
import { join } from 'path';
import { createDatabase } from '../src/database/index.js';
import type { DatabaseStore } from '../src/database/store.js';

describe('Status Filtering', () => {
  let store: DatabaseStore;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = join(process.cwd(), 'test-data', `test-status-filtering-${Date.now()}`);
    store = await createDatabase({
      dataDir: testDbPath,
      verbose: false,
    });
  });

  afterEach(async () => {
    await store.close();
    rmSync(testDbPath, { recursive: true, force: true });
  });

  describe('listTasks with statuses parameter', () => {
    beforeEach(async () => {
      // Create tasks with different statuses
      await store.addTask({
        title: 'Pending Task 1',
        status: 'pending',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Pending Task 2',
        status: 'pending',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'In Progress Task',
        status: 'in-progress',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Done Task 1',
        status: 'done',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Done Task 2',
        status: 'done',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Archived Task',
        status: 'archived',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Cancelled Task',
        status: 'cancelled',
        priorityScore: 50,
      });
    });

    it('should return all tasks when statuses is empty array', async () => {
      const tasks = await store.listTasks({ statuses: [] });
      expect(tasks).toHaveLength(7);
    });

    it('should return only active tasks when statuses is undefined (default behavior)', async () => {
      const tasks = await store.listTasks({});
      expect(tasks).toHaveLength(3); // 2 pending + 1 in-progress
      expect(tasks.every(task => 
        task.status === 'pending' || task.status === 'in-progress'
      )).toBe(true);
    });

    it('should filter by single status', async () => {
      const pendingTasks = await store.listTasks({ statuses: ['pending'] });
      expect(pendingTasks).toHaveLength(2);
      expect(pendingTasks.every(task => task.status === 'pending')).toBe(true);

      const doneTasks = await store.listTasks({ statuses: ['done'] });
      expect(doneTasks).toHaveLength(2);
      expect(doneTasks.every(task => task.status === 'done')).toBe(true);
    });

    it('should filter by multiple statuses', async () => {
      const activeTasks = await store.listTasks({ statuses: ['pending', 'in-progress'] });
      expect(activeTasks).toHaveLength(3);
      expect(activeTasks.every(task => 
        task.status === 'pending' || task.status === 'in-progress'
      )).toBe(true);

      const completedTasks = await store.listTasks({ statuses: ['done', 'archived'] });
      expect(completedTasks).toHaveLength(3);
      expect(completedTasks.every(task => 
        task.status === 'done' || task.status === 'archived'
      )).toBe(true);
    });

    it('should return empty array for non-existent status', async () => {
      const tasks = await store.listTasks({ statuses: ['non-existent' as any] });
      expect(tasks).toHaveLength(0);
    });

    it('should handle mixed valid and invalid statuses', async () => {
      const tasks = await store.listTasks({ statuses: ['pending', 'invalid' as any] });
      expect(tasks).toHaveLength(2);
      expect(tasks.every(task => task.status === 'pending')).toBe(true);
    });
  });

  describe('CLI default behavior simulation', () => {
    beforeEach(async () => {
      // Create tasks simulating real CLI usage
      await store.addTask({
        title: 'Active Task 1',
        status: 'pending',
        priorityScore: 80,
      });

      await store.addTask({
        title: 'Active Task 2',
        status: 'in-progress',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Completed Task 1',
        status: 'done',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Completed Task 2',
        status: 'done',
        priorityScore: 10,
      });

      await store.addTask({
        title: 'Old Task',
        status: 'archived',
        priorityScore: 50,
      });
    });

    it('should show only active tasks by default (pending + in-progress)', async () => {
      // Simulate CLI default behavior: show only pending and in-progress
      const activeTasks = await store.listTasks({ statuses: ['pending', 'in-progress'] });
      
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.some(task => task.title === 'Active Task 1')).toBe(true);
      expect(activeTasks.some(task => task.title === 'Active Task 2')).toBe(true);
      expect(activeTasks.every(task => 
        task.status === 'pending' || task.status === 'in-progress'
      )).toBe(true);
    });

    it('should show all tasks when --show-all is used', async () => {
      // Simulate CLI --show-all behavior: empty statuses array
      const allTasks = await store.listTasks({ statuses: [] });
      
      expect(allTasks).toHaveLength(5);
      expect(allTasks.some(task => task.status === 'pending')).toBe(true);
      expect(allTasks.some(task => task.status === 'in-progress')).toBe(true);
      expect(allTasks.some(task => task.status === 'done')).toBe(true);
      expect(allTasks.some(task => task.status === 'archived')).toBe(true);
    });

    it('should show only specific status when --status is used', async () => {
      // Simulate CLI --status done behavior
      const doneTasks = await store.listTasks({ statuses: ['done'] });
      
      expect(doneTasks).toHaveLength(2);
      expect(doneTasks.every(task => task.status === 'done')).toBe(true);
      expect(doneTasks.some(task => task.title === 'Completed Task 1')).toBe(true);
      expect(doneTasks.some(task => task.title === 'Completed Task 2')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty database', async () => {
      const tasks = await store.listTasks({ statuses: ['pending'] });
      expect(tasks).toHaveLength(0);
    });

    it('should handle null/undefined statuses gracefully', async () => {
      await store.addTask({
        title: 'Test Task',
        status: 'pending',
        priorityScore: 50,
      });

      await store.addTask({
        title: 'Done Task',
        status: 'done',
        priorityScore: 50,
      });

      // When no statuses provided, should show only active tasks (pending + in-progress)
      const activeTasks = await store.listTasks({});
      const activeTasksUndefined = await store.listTasks({ statuses: undefined });
      
      expect(activeTasks).toHaveLength(1); // Only the pending task
      expect(activeTasksUndefined).toHaveLength(1); // Only the pending task
      expect(activeTasks[0].id).toBe(activeTasksUndefined[0].id);
      expect(activeTasks[0].status).toBe('pending');

      // When empty array provided, should show all tasks
      const allTasks = await store.listTasks({ statuses: [] });
      expect(allTasks).toHaveLength(2); // Both pending and done
    });

    it('should maintain other filtering when using status filters', async () => {
      // Create parent and child tasks
      const parentTask = await store.addTask({
        title: 'Parent Task',
        status: 'pending',
        priorityScore: 80,
      });

      await store.addTask({
        parentId: parentTask.id,
        title: 'Child Task',
        status: 'done',
        priorityScore: 50,
      });

      // Test that status filtering works with hierarchy
      const pendingTasks = await store.listTasks({ statuses: ['pending'] });
      expect(pendingTasks).toHaveLength(1);
      expect(pendingTasks[0].title).toBe('Parent Task');

      const doneTasks = await store.listTasks({ statuses: ['done'] });
      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].title).toBe('Child Task');
    });
  });
}); 