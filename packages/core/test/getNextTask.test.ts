import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import { createDatabase } from '../src/database/index.js';
import { TaskService } from '../src/services/TaskService.js';
import type { Task } from '../src/schemas/task.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import type { Store } from '../src/database/store.js';

describe('TaskService.getNextTask', () => {
  let taskService: TaskService;
  let store: Store;
  let dbPath: string;
  let task1: Task, task2: Task, task3: Task;

  beforeEach(async () => {
    // Use a unique file in temporary directory for each test run
    dbPath = join(tmpdir(), `getNextTask-test-${Date.now()}.db`);
    store = await createDatabase({ dbPath, verbose: false });
    taskService = new TaskService(store);

    // Create test tasks with different priorities
    task1 = await store.addTask({
      title: 'Low priority task',
      priority: 'low',
      status: 'pending',
    });

    task2 = await store.addTask({
      title: 'High priority task',
      priority: 'high',
      status: 'pending',
    });

    task3 = await store.addTask({
      title: 'Medium priority task',
      priority: 'medium',
      status: 'pending',
    });
  });

  afterEach(async () => {
    // Clean up the temporary database file
    if (existsSync(dbPath)) {
      rmSync(dbPath, { recursive: true, force: true });
    }
  });

  it('should return highest priority task', async () => {
    const nextTask = await taskService.getNextTask();
    
    expect(nextTask).not.toBeNull();
    expect(nextTask?.id).toBe(task2.id); // High priority task
    expect(nextTask?.priority).toBe('high');
  });

  it('should return null when no pending tasks available', async () => {
    // Mark all tasks as done
    await store.updateTask(task1.id, { status: 'done' });
    await store.updateTask(task2.id, { status: 'done' });
    await store.updateTask(task3.id, { status: 'done' });

    const nextTask = await taskService.getNextTask();
    expect(nextTask).toBeNull();
  });

  it('should prioritize by priority then by creation date', async () => {
    // Mark the high priority task as done, so medium should be next
    await store.updateTask(task2.id, { status: 'done' });

    const nextTask = await taskService.getNextTask();
    
    expect(nextTask).not.toBeNull();
    expect(nextTask?.priority).toBe('medium'); // Next highest available priority
    expect(nextTask?.id).toBe(task3.id);
  });

  it('should not return tasks that are blocked by dependencies', async () => {
    // Add a dependency: task2 depends on task1
    await taskService.addTaskDependency(task2.id, task1.id);

    const nextTask = await taskService.getNextTask();
    
    // Should return task3 (medium) or task1 (low), not task2 (high) which is blocked
    expect(nextTask).not.toBeNull();
    expect(nextTask?.id).not.toBe(task2.id);
  });
});