/**
 * @fileoverview Tests for DependencyService
 * 
 * Tests the basic CRUD operations and validation functionality
 * of the DependencyService implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Store } from '../src/database/index.js';
import { DependencyService } from '../src/services/DependencyService.js';
import type { Task } from '../src/schemas/task.js';

describe('DependencyService', () => {
  let store: Store;
  let dependencyService: DependencyService;
  let task1: Task;
  let task2: Task;
  let task3: Task;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    store = await createDatabase({ 
      dataDir: 'memory://',
      verbose: false,
      enableLocking: false 
    });
    
    dependencyService = new DependencyService(store);

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
    if (store) {
      try {
        await store.close();
      } catch (error) {
        // Ignore cleanup errors in tests
        console.warn('Test cleanup error:', error);
      }
    }
  });

  describe('Basic CRUD Operations', () => {
    it('should add a dependency between two tasks', async () => {
      const dependency = await dependencyService.addDependency(task2.id, task1.id);
      
      expect(dependency).toBeDefined();
      expect(dependency.dependentTaskId).toBe(task2.id);
      expect(dependency.dependencyTaskId).toBe(task1.id);
      expect(dependency.id).toBeDefined();
      expect(dependency.createdAt).toBeInstanceOf(Date);
    });

    it('should get dependencies for a task', async () => {
      await dependencyService.addDependency(task2.id, task1.id);
      await dependencyService.addDependency(task2.id, task3.id);

      const dependencies = await dependencyService.getDependencies(task2.id);
      
      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(task1.id);
      expect(dependencies).toContain(task3.id);
    });

    it('should get dependents for a task', async () => {
      await dependencyService.addDependency(task2.id, task1.id);
      await dependencyService.addDependency(task3.id, task1.id);

      const dependents = await dependencyService.getDependents(task1.id);
      
      expect(dependents).toHaveLength(2);
      expect(dependents).toContain(task2.id);
      expect(dependents).toContain(task3.id);
    });

    it('should remove a dependency', async () => {
      await dependencyService.addDependency(task2.id, task1.id);
      
      const removed = await dependencyService.removeDependency(task2.id, task1.id);
      expect(removed).toBe(true);

      const dependencies = await dependencyService.getDependencies(task2.id);
      expect(dependencies).toHaveLength(0);
    });

    it('should return false when removing non-existent dependency', async () => {
      const removed = await dependencyService.removeDependency(task2.id, task1.id);
      expect(removed).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should prevent self-dependencies', async () => {
      const validation = await dependencyService.validateDependency(task1.id, task1.id);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('A task cannot depend on itself');
    });

    it('should prevent duplicate dependencies', async () => {
      await dependencyService.addDependency(task2.id, task1.id);
      
      const validation = await dependencyService.validateDependency(task2.id, task1.id);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Dependency already exists');
    });

    it('should prevent dependencies on non-existent tasks', async () => {
      const validation = await dependencyService.validateDependency(task1.id, 'NONEXISTENT');
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Dependency task NONEXISTENT does not exist');
    });

    it('should prevent circular dependencies', async () => {
      // Create a chain: task1 -> task2 -> task3
      await dependencyService.addDependency(task2.id, task1.id);
      await dependencyService.addDependency(task3.id, task2.id);
      
      // Try to create a cycle: task1 -> task3 (which would create task1 -> task2 -> task3 -> task1)
      const validation = await dependencyService.validateDependency(task1.id, task3.id);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(error => error.includes('cycle'))).toBe(true);
    });
  });

  describe('Dependency Graph Operations', () => {
    it('should get dependency graph for a task', async () => {
      await dependencyService.addDependency(task2.id, task1.id);
      await dependencyService.addDependency(task3.id, task2.id);

      const graph = await dependencyService.getDependencyGraph(task2.id);
      
      expect(graph.taskId).toBe(task2.id);
      expect(graph.dependencies).toContain(task1.id);
      expect(graph.dependents).toContain(task3.id);
      expect(graph.isBlocked).toBe(true); // task1 is pending, so task2 is blocked
      expect(graph.blockedBy).toContain(task1.id);
    });

    it('should identify unblocked tasks', async () => {
      await dependencyService.addDependency(task2.id, task3.id); // task2 depends on task3 (done)

      const graph = await dependencyService.getDependencyGraph(task2.id);
      
      expect(graph.isBlocked).toBe(false); // task3 is done, so task2 is not blocked
      expect(graph.blockedBy).toHaveLength(0);
    });

    it('should get executable tasks', async () => {
      await dependencyService.addDependency(task2.id, task1.id); // task2 depends on task1 (pending)
      
      const executableTasks = await dependencyService.getExecutableTasks();
      
      // task1 and task3 should be executable (no dependencies), task2 should not (blocked by task1)
      const executableIds = executableTasks.map(t => t.id);
      expect(executableIds).toContain(task1.id);
      expect(executableIds).not.toContain(task2.id); // blocked by task1
      // task3 is done, so it shouldn't be in executable tasks
      expect(executableIds).not.toContain(task3.id);
    });

    it('should get topological order', async () => {
      // Create dependencies: task1 -> task2 -> task3
      await dependencyService.addDependency(task2.id, task1.id);
      await dependencyService.addDependency(task3.id, task2.id);

      const order = await dependencyService.getTopologicalOrder([task1.id, task2.id, task3.id]);
      
      // task1 should come before task2, task2 should come before task3
      const task1Index = order.indexOf(task1.id);
      const task2Index = order.indexOf(task2.id);
      const task3Index = order.indexOf(task3.id);
      
      expect(task1Index).toBeLessThan(task2Index);
      expect(task2Index).toBeLessThan(task3Index);
    });
  });

  describe('Blocked Tasks', () => {
    it('should get blocked tasks', async () => {
      await dependencyService.addDependency(task2.id, task1.id); // task2 depends on task1 (pending)
      
      const blockedTasks = await dependencyService.getBlockedTasks();
      
      // Find our specific test task in the blocked tasks
      const blockedTask2 = blockedTasks.find(task => task.id === task2.id);
      
      expect(blockedTask2).toBeDefined();
      expect(blockedTask2!.isBlocked).toBe(true);
      expect(blockedTask2!.blockedBy).toContain(task1.id);
    });
  });
}); 