/**
 * @fileoverview Tests for TaskService dependency-aware functionality
 * 
 * Tests the enhanced TaskService methods that integrate with DependencyService
 * for dependency-aware task management and status transitions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Store } from '../src/database/index.js';
import { TaskService } from '../src/services/TaskService.js';
import type { Task } from '../src/schemas/task.js';

describe('TaskService - Dependency Integration', () => {
  let store: Store;
  let taskService: TaskService;
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

  describe('Enhanced getTaskWithContext', () => {
    it('should include dependency information in task context', async () => {
      // Add a dependency: task2 depends on task1
      await taskService.addTaskDependency(task2.id, task1.id);

      const context = await taskService.getTaskWithContext(task2.id);
      
      expect(context).toBeDefined();
      expect(context!.task.id).toBe(task2.id);
      expect(context!.dependencies).toHaveLength(1);
      expect(context!.dependencies[0].id).toBe(task1.id);
      expect(context!.isBlocked).toBe(true); // task1 is pending, so task2 is blocked
      expect(context!.blockedBy).toHaveLength(1);
      expect(context!.blockedBy[0].id).toBe(task1.id);
    });

    it('should show unblocked status when dependencies are complete', async () => {
      // Add a dependency: task2 depends on task3 (which is done)
      await taskService.addTaskDependency(task2.id, task3.id);

      const context = await taskService.getTaskWithContext(task2.id);
      
      expect(context).toBeDefined();
      expect(context!.dependencies).toHaveLength(1);
      expect(context!.dependencies[0].id).toBe(task3.id);
      expect(context!.isBlocked).toBe(false); // task3 is done, so task2 is not blocked
      expect(context!.blockedBy).toHaveLength(0);
    });

    it('should show dependents information', async () => {
      // Add a dependency: task2 depends on task1
      await taskService.addTaskDependency(task2.id, task1.id);

      const context = await taskService.getTaskWithContext(task1.id);
      
      expect(context).toBeDefined();
      expect(context!.dependents).toHaveLength(1);
      expect(context!.dependents[0].id).toBe(task2.id);
    });
  });

  describe('Dependency-aware status updates', () => {
    it('should prevent starting blocked tasks', async () => {
      // Add a dependency: task2 depends on task1 (pending)
      await taskService.addTaskDependency(task2.id, task1.id);

      const result = await taskService.updateTaskStatus(task2.id, 'in-progress');
      
      expect(result.success).toBe(false);
      expect(result.blocked).toBeDefined();
      expect(result.blocked!).toHaveLength(1);
      expect(result.blocked![0].id).toBe(task1.id);
      expect(result.validation).toBeDefined();
      expect(result.validation!.allowed).toBe(false);
      expect(result.validation!.reason).toContain('blocked by incomplete dependencies');
    });

    it('should allow starting tasks with completed dependencies', async () => {
      // Add a dependency: task2 depends on task3 (done)
      await taskService.addTaskDependency(task2.id, task3.id);

      const result = await taskService.updateTaskStatus(task2.id, 'in-progress');
      
      expect(result.success).toBe(true);
      expect(result.validation).toBeDefined();
      expect(result.validation!.allowed).toBe(true);
    });

    it('should allow forcing status updates even when blocked', async () => {
      // Add a dependency: task2 depends on task1 (pending)
      await taskService.addTaskDependency(task2.id, task1.id);

      const result = await taskService.updateTaskStatus(task2.id, 'in-progress', { force: true });
      
      expect(result.success).toBe(true);
    });

    it('should allow valid status transitions that are not blocked', async () => {
      const result = await taskService.updateTaskStatus(task1.id, 'in-progress');
      
      expect(result.success).toBe(true);
      expect(result.validation!.allowed).toBe(true);
    });

    it('should prevent invalid status transitions regardless of dependencies', async () => {
      const result = await taskService.updateTaskStatus(task1.id, 'done'); // pending -> done is invalid
      
      expect(result.success).toBe(false);
      expect(result.validation!.allowed).toBe(false);
      expect(result.validation!.reason).toContain('Cannot transition from');
    });
  });

  describe('Available tasks functionality', () => {
    it('should return tasks that can be started immediately', async () => {
      // Add dependencies: task2 depends on task1 (pending), task3 is done
      await taskService.addTaskDependency(task2.id, task1.id);

      const availableTasks = await taskService.getAvailableTasks();
      
      // task1 should be available (no dependencies), task2 should not (blocked by task1)
      // task3 is done so shouldn't be in available tasks
      const availableIds = availableTasks.map(t => t.id);
      expect(availableIds).toContain(task1.id);
      expect(availableIds).not.toContain(task2.id);
      expect(availableIds).not.toContain(task3.id);
    });

    it('should filter available tasks by status', async () => {
      const availableTasks = await taskService.getAvailableTasks({ status: 'pending' });
      
      // Should only return pending tasks that are not blocked
      const availableIds = availableTasks.map(t => t.id);
      expect(availableIds).toContain(task1.id);
      expect(availableIds).toContain(task2.id);
      expect(availableIds).not.toContain(task3.id); // task3 is done
    });

    it('should filter available tasks by priority', async () => {
      // Create a high priority task
      const highPriorityTask = await store.addTask({
        title: 'High Priority Task',
        description: 'Important task',
        status: 'pending',
        priority: 'high',
      });

      const availableTasks = await taskService.getAvailableTasks({ priority: 'high' });
      
      const availableIds = availableTasks.map(t => t.id);
      expect(availableIds).toContain(highPriorityTask.id);
      expect(availableIds).not.toContain(task1.id); // medium priority
    });
  });

  describe('Tasks with dependencies', () => {
    it('should return tasks with their dependency information', async () => {
      // Add dependencies
      await taskService.addTaskDependency(task2.id, task1.id);
      await taskService.addTaskDependency(task3.id, task2.id);

      const tasksWithDeps = await taskService.getTasksWithDependencies([task1.id, task2.id, task3.id]);
      
      expect(tasksWithDeps).toHaveLength(3);
      
      // task1 should have no dependencies but have task2 as dependent
      const task1WithDeps = tasksWithDeps.find(t => t.id === task1.id);
      expect(task1WithDeps!.dependencies).toHaveLength(0);
      expect(task1WithDeps!.dependents).toContain(task2.id);
      
      // task2 should depend on task1 and have task3 as dependent
      const task2WithDeps = tasksWithDeps.find(t => t.id === task2.id);
      expect(task2WithDeps!.dependencies).toContain(task1.id);
      expect(task2WithDeps!.dependents).toContain(task3.id);
      expect(task2WithDeps!.isBlocked).toBe(true); // task1 is pending
      
      // task3 should depend on task2 but have no dependents
      const task3WithDeps = tasksWithDeps.find(t => t.id === task3.id);
      expect(task3WithDeps!.dependencies).toContain(task2.id);
      expect(task3WithDeps!.dependents).toHaveLength(0);
    });
  });

  describe('Dependency management methods', () => {
    it('should add dependencies through TaskService', async () => {
      const dependency = await taskService.addTaskDependency(task2.id, task1.id);
      
      expect(dependency).toBeDefined();
      expect(dependency.dependentTaskId).toBe(task2.id);
      expect(dependency.dependencyTaskId).toBe(task1.id);
    });

    it('should remove dependencies through TaskService', async () => {
      await taskService.addTaskDependency(task2.id, task1.id);
      
      const removed = await taskService.removeTaskDependency(task2.id, task1.id);
      expect(removed).toBe(true);
    });

    it('should validate dependencies through TaskService', async () => {
      const validation = await taskService.validateTaskDependency(task1.id, task1.id);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('A task cannot depend on itself');
    });

    it('should get dependency graph through TaskService', async () => {
      await taskService.addTaskDependency(task2.id, task1.id);
      
      const graph = await taskService.getTaskDependencyGraph(task2.id);
      
      expect(graph.taskId).toBe(task2.id);
      expect(graph.dependencies).toContain(task1.id);
      expect(graph.isBlocked).toBe(true);
    });
  });
}); 