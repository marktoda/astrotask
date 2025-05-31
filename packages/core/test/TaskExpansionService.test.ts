/**
 * @fileoverview Tests for TaskExpansionService
 * 
 * Tests the enhanced task expansion workflow that integrates
 * complexity analysis with task expansion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../src/database/index.js';
import { TaskService } from '../src/services/TaskService.js';
import { createTaskExpansionService, type TaskExpansionService } from '../src/services/TaskExpansionService.js';
import { createModuleLogger } from '../src/utils/logger.js';
import type { Store } from '../src/database/store.js';
import type { Task } from '../src/schemas/task.js';

describe('TaskExpansionService', () => {
  let store: Store;
  let taskService: TaskService;
  let expansionService: TaskExpansionService;
  let logger = createModuleLogger('test');

  beforeEach(async () => {
    // Create in-memory database for testing
    store = await createDatabase({ dataDir: ':memory:' });
    taskService = new TaskService(store);
    
    // Create expansion service with test configuration
    expansionService = createTaskExpansionService(logger, store, taskService, {
      useComplexityAnalysis: true,
      research: false,
      complexityThreshold: 5,
      defaultSubtasks: 3,
      maxSubtasks: 10,
      forceReplace: false,
      createContextSlices: true,
      projectName: 'Test Project',
    });
  });

  afterEach(async () => {
    await store.close();
  });

  describe('expandTask', () => {
    it('should expand a task using complexity analysis', async () => {
      // Create a test task
      const parentTask = await store.addTask({
        title: 'Implement User Authentication System',
        description: 'Build a complete user authentication system with login, registration, password reset, and session management',
        status: 'pending',
        priority: 'high',
        prd: 'The system should support OAuth, JWT tokens, and multi-factor authentication',
      });

      // Expand the task
      const result = await expansionService.expandTask({
        taskId: parentTask.id,
        context: 'Focus on security best practices and scalability',
      });

      // Verify the expansion result
      expect(result.parentTask.id).toBe(parentTask.id);
      expect(result.subtasks.length).toBeGreaterThan(0);
      expect(result.usedComplexityAnalysis).toBe(true);
      expect(result.metadata.expansionMethod).toBe('complexity-guided');
      expect(result.message).toContain('complexity-guided analysis');

      // Verify subtasks were created in the database
      const storedSubtasks = await store.listTasks({ parentId: parentTask.id });
      expect(storedSubtasks.length).toBe(result.subtasks.length);
    });

    it('should use manual subtask count when specified', async () => {
      const parentTask = await store.addTask({
        title: 'Simple Configuration Update',
        description: 'Update configuration file',
        status: 'pending',
        priority: 'low',
      });

      const result = await expansionService.expandTask({
        taskId: parentTask.id,
        numSubtasks: 5,
      });

      expect(result.subtasks.length).toBe(5);
      expect(result.metadata.expansionMethod).toBe('manual');
      expect(result.metadata.actualSubtasks).toBe(5);
    });

    it('should handle force replacement of existing subtasks', async () => {
      const parentTask = await store.addTask({
        title: 'Task with Existing Subtasks',
        description: 'A task that already has subtasks',
        status: 'pending',
        priority: 'medium',
      });

      // Create existing subtasks
      await store.addTask({
        title: 'Existing Subtask 1',
        description: 'First existing subtask',
        status: 'pending',
        priority: 'medium',
        parentId: parentTask.id,
      });

      await store.addTask({
        title: 'Existing Subtask 2',
        description: 'Second existing subtask',
        status: 'pending',
        priority: 'medium',
        parentId: parentTask.id,
      });

      // Verify existing subtasks
      const existingSubtasks = await store.listTasks({ parentId: parentTask.id });
      expect(existingSubtasks.length).toBe(2);

      // Expand with force replacement
      const result = await expansionService.expandTask({
        taskId: parentTask.id,
        numSubtasks: 4,
        force: true,
      });

      expect(result.metadata.forcedReplacement).toBe(true);
      expect(result.subtasks.length).toBe(4);

      // Verify old subtasks were replaced
      const newSubtasks = await store.listTasks({ parentId: parentTask.id });
      expect(newSubtasks.length).toBe(4);
      
      // Verify none of the old subtask IDs exist
      for (const oldSubtask of existingSubtasks) {
        const stillExists = await store.getTask(oldSubtask.id);
        expect(stillExists).toBeNull();
      }
    });
  });

  describe('expandTasksBatch', () => {
    it('should expand multiple tasks in batch', async () => {
      // Create multiple test tasks
      const task1 = await store.addTask({
        title: 'Database Schema Design',
        description: 'Design database schema for the application',
        status: 'pending',
        priority: 'high',
      });

      const task2 = await store.addTask({
        title: 'API Endpoint Implementation',
        description: 'Implement REST API endpoints',
        status: 'pending',
        priority: 'medium',
      });

      const task3 = await store.addTask({
        title: 'Frontend Component Development',
        description: 'Develop React components',
        status: 'pending',
        priority: 'medium',
      });

      // Expand tasks in batch
      const results = await expansionService.expandTasksBatch(
        [task1.id, task2.id, task3.id],
        { numSubtasks: 3 }
      );

      expect(results.length).toBe(3);
      expect(results.every(result => result.subtasks.length === 3)).toBe(true);
      expect(results.every(result => result.metadata.expansionMethod === 'manual')).toBe(true);

      // Verify all subtasks were created in database
      for (const result of results) {
        const storedSubtasks = await store.listTasks({ parentId: result.parentTask.id });
        expect(storedSubtasks.length).toBe(3);
      }
    });

    it('should handle partial failures in batch expansion', async () => {
      const validTask = await store.addTask({
        title: 'Valid Task',
        description: 'A valid task for expansion',
        status: 'pending',
        priority: 'medium',
      });

      // Try to expand with one valid and one invalid task ID
      const results = await expansionService.expandTasksBatch(
        [validTask.id, 'invalid-task-id'],
        { numSubtasks: 2 }
      );

      // Should succeed for the valid task only
      expect(results.length).toBe(1);
      expect(results[0].parentTask.id).toBe(validTask.id);
      expect(results[0].subtasks.length).toBe(2);
    });
  });

  describe('expandHighComplexityTasks', () => {
    it('should identify and expand high-complexity tasks', async () => {
      // Create tasks with varying complexity
      const simpleTask = await store.addTask({
        title: 'Update README',
        description: 'Update the README file with new information',
        status: 'pending',
        priority: 'low',
      });

      const complexTask = await store.addTask({
        title: 'Implement Distributed Caching System',
        description: 'Design and implement a distributed caching system with Redis clustering, cache invalidation strategies, performance monitoring, and failover mechanisms',
        status: 'pending',
        priority: 'high',
        prd: 'The system must handle 100k+ requests per second, provide sub-millisecond response times, and maintain 99.99% availability',
      });

      const moderateTask = await store.addTask({
        title: 'Create User Dashboard',
        description: 'Build a user dashboard with charts and data visualization',
        status: 'pending',
        priority: 'medium',
      });

      // Run high-complexity expansion with threshold of 6
      const result = await expansionService.expandHighComplexityTasks(6);

      expect(result.summary.tasksAnalyzed).toBe(3);
      expect(result.summary.highComplexityTasks).toBeGreaterThan(0);
      expect(result.complexityReport.complexityAnalysis.length).toBe(3);

      // Verify that high-complexity tasks were identified
      const highComplexityAnalysis = result.complexityReport.complexityAnalysis
        .filter(analysis => analysis.complexityScore >= 6);
      
      expect(highComplexityAnalysis.length).toBeGreaterThan(0);
      
      // The complex task should have high complexity
      const complexTaskAnalysis = result.complexityReport.complexityAnalysis
        .find(analysis => analysis.taskId === complexTask.id);
      
      expect(complexTaskAnalysis).toBeDefined();
      expect(complexTaskAnalysis!.complexityScore).toBeGreaterThanOrEqual(6);
    });

    it('should skip tasks that already have subtasks unless force is enabled', async () => {
      const complexTask = await store.addTask({
        title: 'Complex System Architecture',
        description: 'Design a complex microservices architecture with service mesh, API gateway, and distributed tracing',
        status: 'pending',
        priority: 'high',
      });

      // Add existing subtask
      await store.addTask({
        title: 'Existing Subtask',
        description: 'An existing subtask',
        status: 'pending',
        priority: 'medium',
        parentId: complexTask.id,
      });

      // Run expansion without force
      const result = await expansionService.expandHighComplexityTasks(5);

      // Should skip the task with existing subtasks
      const expandedTaskIds = result.expansionResults.map(r => r.parentTask.id);
      expect(expandedTaskIds).not.toContain(complexTask.id);
    });
  });

  describe('configuration options', () => {
    it('should respect maxSubtasks configuration', async () => {
      const limitedService = createTaskExpansionService(logger, store, taskService, {
        useComplexityAnalysis: false,
        research: false,
        complexityThreshold: 5,
        defaultSubtasks: 3,
        maxSubtasks: 5, // Limit to 5 subtasks
        forceReplace: false,
        createContextSlices: false,
      });

      const task = await store.addTask({
        title: 'Test Task',
        description: 'A test task',
        status: 'pending',
        priority: 'medium',
      });

      // Try to create 10 subtasks but should be limited to 5
      const result = await limitedService.expandTask({
        taskId: task.id,
        numSubtasks: 10,
      });

      expect(result.subtasks.length).toBe(5);
      expect(result.metadata.actualSubtasks).toBe(5);
    });

    it('should use default subtasks when complexity analysis is disabled', async () => {
      const basicService = createTaskExpansionService(logger, store, taskService, {
        useComplexityAnalysis: false,
        research: false,
        complexityThreshold: 5,
        defaultSubtasks: 4, // Default to 4 subtasks
        maxSubtasks: 10,
        forceReplace: false,
        createContextSlices: false,
      });

      const task = await store.addTask({
        title: 'Test Task',
        description: 'A test task',
        status: 'pending',
        priority: 'medium',
      });

      const result = await basicService.expandTask({
        taskId: task.id,
      });

      expect(result.subtasks.length).toBe(4);
      expect(result.usedComplexityAnalysis).toBe(false);
      expect(result.metadata.expansionMethod).toBe('default');
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent task', async () => {
      await expect(
        expansionService.expandTask({
          taskId: 'non-existent-task-id',
        })
      ).rejects.toThrow('Task non-existent-task-id not found');
    });

    it('should handle complexity analysis failures gracefully', async () => {
      // Create a task that might cause complexity analysis to fail
      const task = await store.addTask({
        title: '',
        description: '',
        status: 'pending',
        priority: 'medium',
      });

      // Should fall back to default behavior if complexity analysis fails
      const result = await expansionService.expandTask({
        taskId: task.id,
      });

      expect(result.subtasks.length).toBeGreaterThan(0);
      // Should still create subtasks even if complexity analysis fails
    });
  });
}); 