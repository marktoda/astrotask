/**
 * @fileoverview Tests for DependencyHandlers MCP functionality
 * 
 * Tests the MCP integration for task dependency management,
 * including adding/removing dependencies, validation, and dependency-aware operations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Store, TaskService } from '@astrolabe/core';
import { DependencyHandlers, type HandlerContext } from '../src/handlers/index.js';
import type { Task } from '@astrolabe/core';

describe('DependencyHandlers - MCP Integration', () => {
  let store: Store;
  let taskService: TaskService;
  let dependencyHandlers: DependencyHandlers;
  let context: HandlerContext;
  let task1: Task;
  let task2: Task;
  let task3: Task;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    store = await createDatabase({ 
      dbPath: ':memory:',
      encrypted: false,
      autoSync: false 
    });
    
    taskService = new TaskService(store);
    
    context = {
      store,
      taskService,
      requestId: 'test-request',
      timestamp: new Date().toISOString(),
    };
    
    dependencyHandlers = new DependencyHandlers(context);

    // Create test tasks
    task1 = await store.addTask({
      title: 'Task 1',
      description: 'First task',
      status: 'pending',
      priority: 'medium',
    });

    task2 = await store.addTask({
      title: 'Task 2', 
      description: 'Second task',
      status: 'pending',
      priority: 'medium',
    });

    task3 = await store.addTask({
      title: 'Task 3',
      description: 'Third task', 
      status: 'done',
      priority: 'medium',
    });
  });

  afterEach(async () => {
    await store.close();
  });

  describe('addTaskDependency', () => {
    it('should add a dependency between two tasks', async () => {
      const result = await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      expect(result).toBeDefined();
      expect(result.dependentTaskId).toBe(task2.id);
      expect(result.dependencyTaskId).toBe(task1.id);
    });

    it('should reject self-dependencies', async () => {
      await expect(dependencyHandlers.addTaskDependency({
        dependentTaskId: task1.id,
        dependencyTaskId: task1.id,
      })).rejects.toThrow();
    });
  });

  describe('removeTaskDependency', () => {
    it('should remove an existing dependency', async () => {
      // First add a dependency
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      // Then remove it
      const result = await dependencyHandlers.removeTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('removed successfully');
    });

    it('should handle removing non-existent dependency', async () => {
      const result = await dependencyHandlers.removeTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('getTaskDependencies', () => {
    it('should return dependency graph for a task', async () => {
      // Add a dependency
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.getTaskDependencies({
        taskId: task2.id,
      });

      expect(result.taskId).toBe(task2.id);
      expect(result.dependencies).toContain(task1.id);
      expect(result.isBlocked).toBe(true); // task1 is pending
      expect(result.blockedBy).toContain(task1.id);
    });

    it('should return empty dependencies for task with no dependencies', async () => {
      const result = await dependencyHandlers.getTaskDependencies({
        taskId: task1.id,
      });

      expect(result.taskId).toBe(task1.id);
      expect(result.dependencies).toHaveLength(0);
      expect(result.dependents).toHaveLength(0);
      expect(result.isBlocked).toBe(false);
    });
  });

  describe('validateTaskDependency', () => {
    it('should validate a valid dependency', async () => {
      const result = await dependencyHandlers.validateTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject self-dependency', async () => {
      const result = await dependencyHandlers.validateTaskDependency({
        dependentTaskId: task1.id,
        dependencyTaskId: task1.id,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A task cannot depend on itself');
    });

    it('should detect potential cycles', async () => {
      // Create a cycle: task1 -> task2 -> task1
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.validateTaskDependency({
        dependentTaskId: task1.id,
        dependencyTaskId: task2.id,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('cycle'))).toBe(true);
    });
  });

  describe('getAvailableTasks', () => {
    it('should return tasks that can be started immediately', async () => {
      // Add a dependency: task2 depends on task1 (pending)
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.getAvailableTasks({});

      // task1 should be available (no dependencies), task2 should not (blocked)
      const availableIds = result.map(t => t.id);
      expect(availableIds).toContain(task1.id);
      expect(availableIds).not.toContain(task2.id);
    });

    it('should filter by status', async () => {
      const result = await dependencyHandlers.getAvailableTasks({
        status: 'pending',
      });

      // Should only return pending tasks that are not blocked
      const availableIds = result.map(t => t.id);
      expect(availableIds).toContain(task1.id);
      expect(availableIds).toContain(task2.id);
      expect(availableIds).not.toContain(task3.id); // task3 is done
    });

    it('should filter by priority', async () => {
      // Create a high priority task
      const highPriorityTask = await store.addTask({
        title: 'High Priority Task',
        description: 'Important task',
        status: 'pending',
        priority: 'high',
      });

      const result = await dependencyHandlers.getAvailableTasks({
        priority: 'high',
      });

      const availableIds = result.map(t => t.id);
      expect(availableIds).toContain(highPriorityTask.id);
      expect(availableIds).not.toContain(task1.id); // medium priority
    });
  });

  describe('updateTaskStatus', () => {
    it('should update status when not blocked', async () => {
      const result = await dependencyHandlers.updateTaskStatus({
        taskId: task1.id,
        status: 'in-progress',
      });

      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('in-progress');
      expect(result.message).toContain('updated successfully');
    });

    it('should prevent starting blocked tasks', async () => {
      // Add a dependency: task2 depends on task1 (pending)
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.updateTaskStatus({
        taskId: task2.id,
        status: 'in-progress',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBeDefined();
      expect(result.blocked!.some(t => t.id === task1.id)).toBe(true);
      expect(result.validation?.allowed).toBe(false);
      expect(result.message).toContain('blocked');
    });

    it('should allow forcing status updates', async () => {
      // Add a dependency: task2 depends on task1 (pending)
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.updateTaskStatus({
        taskId: task2.id,
        status: 'in-progress',
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.task?.status).toBe('in-progress');
    });
  });

  describe('getTasksWithDependencies', () => {
    it('should return tasks with dependency information', async () => {
      // Add dependencies
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.getTasksWithDependencies({
        taskIds: [task1.id, task2.id],
      });

      expect(result).toHaveLength(2);

      const task1WithDeps = result.find(t => t.id === task1.id);
      const task2WithDeps = result.find(t => t.id === task2.id);

      expect(task1WithDeps?.dependencies).toHaveLength(0);
      expect(task1WithDeps?.dependents).toContain(task2.id);

      expect(task2WithDeps?.dependencies).toContain(task1.id);
      expect(task2WithDeps?.isBlocked).toBe(true);
    });
  });

  describe('getTaskContextWithDependencies', () => {
    it('should return enhanced context with dependency information', async () => {
      // Add a dependency
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.getTaskContextWithDependencies({
        taskId: task2.id,
      });

      expect(result.task.id).toBe(task2.id);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].id).toBe(task1.id);
      expect(result.isBlocked).toBe(true);
      expect(result.blockedBy).toHaveLength(1);
      expect(result.metadata.totalDependencies).toBe(1);
    });
  });

  describe('getBlockedTasks', () => {
    it('should return all blocked tasks in the system', async () => {
      // Add dependencies to create blocked tasks
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      const result = await dependencyHandlers.getBlockedTasks();

      expect(result.length).toBeGreaterThan(0);
      const blockedTask2 = result.find(t => t.id === task2.id);
      expect(blockedTask2).toBeDefined();
      expect(blockedTask2!.isBlocked).toBe(true);
    });

    it('should return empty array when no tasks are blocked', async () => {
      const result = await dependencyHandlers.getBlockedTasks();

      // Filter for our test tasks only (there might be other tasks in the system)
      const ourBlockedTasks = result.filter(t => 
        [task1.id, task2.id, task3.id].includes(t.id)
      );
      
      expect(ourBlockedTasks).toHaveLength(0);
    });
  });

  describe('getTopologicalOrder', () => {
    it('should return correct topological order', async () => {
      // Create a dependency chain: task1 -> task2 -> task3
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });

      // Update task3 to pending so it can be part of the ordering
      await store.updateTask(task3.id, { status: 'pending' });
      
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task3.id,
        dependencyTaskId: task2.id,
      });

      const result = await dependencyHandlers.getTopologicalOrder({
        taskIds: [task1.id, task2.id, task3.id],
      });

      expect(result.order).toEqual([task1.id, task2.id, task3.id]);
      expect(result.cycles).toBeUndefined();
    });

    it('should detect cycles in dependency graph', async () => {
      // Create a cycle: task1 -> task2 -> task1
      await dependencyHandlers.addTaskDependency({
        dependentTaskId: task2.id,
        dependencyTaskId: task1.id,
      });
      
      // This should throw an error because it would create a cycle
      await expect(dependencyHandlers.addTaskDependency({
        dependentTaskId: task1.id,
        dependencyTaskId: task2.id,
      })).rejects.toThrow(/cycle/);
    });
  });
}); 