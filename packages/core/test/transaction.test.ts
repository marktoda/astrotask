/**
 * Tests for transaction support across all database adapters
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createLocalDatabase } from '../src/database/index.js';
import type { Store } from '../src/database/store.js';

describe('Transaction Support', () => {
  let store: Store;
  const testDbDir = join(tmpdir(), 'astrotask-transaction-test');
  const testDbPath = join(testDbDir, 'test.db');

  beforeEach(async () => {
    // Clean up any existing test database directory
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
    
    // Create test database
    store = await createLocalDatabase(testDbPath);
  });

  afterEach(async () => {
    // Close database and clean up
    if (store) {
      await store.close();
    }
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  it('should execute operations within a transaction successfully', async () => {
    const parentTaskId = randomUUID();
    const childTaskId = randomUUID();

    // Execute operations within a transaction
    const result = await store.transaction(async (tx) => {
      // Create parent task
      const parentTask = await tx.addTaskWithId({
        id: parentTaskId,
        title: 'Parent Task',
        description: 'Parent task for transaction test',
        status: 'pending',
        priorityScore: 75,
      });

      // Create child task
      const childTask = await tx.addTaskWithId({
        id: childTaskId,
        title: 'Child Task',
        description: 'Child task for transaction test',
        status: 'pending',
        parentId: parentTask.id,
        priorityScore: 50,
      });

      // Add dependency
      await tx.addTaskDependency(childTaskId, parentTaskId);

      return { parent: parentTask, child: childTask };
    });

    // Verify all operations were committed
    const parentTask = await store.getTask(parentTaskId);
    const childTask = await store.getTask(childTaskId);
    const dependencies = await store.getTaskDependencies(childTaskId);

    expect(parentTask).toBeTruthy();
    expect(childTask).toBeTruthy();
    expect(childTask?.parentId).toBe(parentTaskId);
    expect(dependencies).toContain(parentTaskId);
    expect(result.parent.id).toBe(parentTaskId);
    expect(result.child.id).toBe(childTaskId);
  });

  it('should rollback transaction on error', async () => {
    const taskId = randomUUID();

    // Attempt transaction that should fail
    await expect(
      store.transaction(async (tx) => {
        // Create a task
        await tx.addTaskWithId({
          id: taskId,
          title: 'Test Task',
          description: 'This should be rolled back',
          status: 'pending',
          priorityScore: 50,
        });

        // Throw an error to trigger rollback
        throw new Error('Intentional error for rollback test');
      })
    ).rejects.toThrow('Intentional error for rollback test');

    // Verify the task was not created due to rollback
    const task = await store.getTask(taskId);
    expect(task).toBeNull();
  });

  it('should handle explicit rollback', async () => {
    const taskId = randomUUID();

    // Execute transaction with explicit rollback
    const result = await store.transaction(async (tx) => {
      // Create a task
      await tx.addTaskWithId({
        id: taskId,
        title: 'Test Task',
        description: 'This should be rolled back',
        status: 'pending',
        priorityScore: 50,
      });

      // Explicitly request rollback
      tx.rollback();

      return 'completed';
    });

    // Verify the task was not created due to explicit rollback
    const task = await store.getTask(taskId);
    expect(task).toBeNull();
    expect(result).toBe('completed');
  });

  it('should support nested operations with context slices', async () => {
    const taskId = randomUUID();
    const contextId = randomUUID();

    await store.transaction(async (tx) => {
      // Create task
      await tx.addTaskWithId({
        id: taskId,
        title: 'Task with Context',
        description: 'Task that will have context added',
        status: 'pending',
        priorityScore: 60,
      });

      // Add context slice
      await tx.addContextSlice({
        id: contextId,
        title: 'Implementation Notes',
        description: 'Some important implementation details',
        contextType: 'implementation',
        taskId: taskId,
      });
    });

    // Verify both task and context were created
    const task = await store.getTask(taskId);
    const contextSlices = await store.listContextSlices(taskId);

    expect(task).toBeTruthy();
    expect(contextSlices).toHaveLength(1);
    expect(contextSlices[0].id).toBe(contextId);
    expect(contextSlices[0].title).toBe('Implementation Notes');
  });

  it('should create tasks with multiple dependencies atomically', async () => {
    const mainTaskId = randomUUID();
    const dep1TaskId = randomUUID();
    const dep2TaskId = randomUUID();

    // This test demonstrates the acceptance criteria use case:
    // "Create task with multiple dependencies atomically"
    await store.transaction(async (tx) => {
      // Create dependency tasks first
      await tx.addTaskWithId({
        id: dep1TaskId,
        title: 'Dependency 1',
        description: 'First dependency task',
        status: 'done',
        priorityScore: 30,
      });

      await tx.addTaskWithId({
        id: dep2TaskId,
        title: 'Dependency 2', 
        description: 'Second dependency task',
        status: 'done',
        priorityScore: 40,
      });

      // Create main task
      await tx.addTaskWithId({
        id: mainTaskId,
        title: 'Main Task',
        description: 'Task that depends on multiple others',
        status: 'pending',
        priorityScore: 80,
      });

      // Add multiple dependencies atomically
      await tx.addTaskDependency(mainTaskId, dep1TaskId);
      await tx.addTaskDependency(mainTaskId, dep2TaskId);
    });

    // Verify all tasks and dependencies were created
    const mainTask = await store.getTask(mainTaskId);
    const dep1Task = await store.getTask(dep1TaskId);
    const dep2Task = await store.getTask(dep2TaskId);
    const dependencies = await store.getTaskDependencies(mainTaskId);

    expect(mainTask).toBeTruthy();
    expect(dep1Task).toBeTruthy();
    expect(dep2Task).toBeTruthy();
    expect(dependencies).toHaveLength(2);
    expect(dependencies).toContain(dep1TaskId);
    expect(dependencies).toContain(dep2TaskId);
  });
}); 