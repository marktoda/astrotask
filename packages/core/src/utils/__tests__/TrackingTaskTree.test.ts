import { describe, expect, test, beforeEach } from 'vitest';
import { TrackingTaskTree } from '../TrackingTaskTree.js';
import { TaskTree } from '../TaskTree.js';
import type { Task } from '../../schemas/task.js';

describe('TrackingTaskTree', () => {
  let sampleTask: Task;
  let childTask: Task;

  beforeEach(() => {
    sampleTask = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      parentId: null,
      title: 'Sample Task',
      description: 'A sample task for testing',
      status: 'pending',
      priority: 'medium',
      prd: null,
      contextDigest: null,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    };

    childTask = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      parentId: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Child Task',
      description: 'A child task for testing',
      status: 'pending',
      priority: 'low',
      prd: null,
      contextDigest: null,
      createdAt: new Date('2023-01-02'),
      updatedAt: new Date('2023-01-02'),
    };
  });

  describe('Basic functionality', () => {
    test('should create a TrackingTaskTree from a task', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      
      expect(tree.task).toEqual(sampleTask);
      expect(tree.id).toBe(sampleTask.id);
      expect(tree.title).toBe(sampleTask.title);
      expect(tree.status).toBe(sampleTask.status);
      expect(tree.hasPendingChanges).toBe(false);
      expect(tree.pendingOperationCount).toBe(0);
    });

    test('should create from existing TaskTree', () => {
      const regularTree = TaskTree.fromTask(sampleTask);
      const trackingTree = TrackingTaskTree.fromTaskTree(regularTree);
      
      expect(trackingTree.task).toEqual(sampleTask);
      expect(trackingTree.hasPendingChanges).toBe(false);
    });

    test('should maintain immutability like TaskTree', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated Title' });
      
      expect(tree.title).toBe('Sample Task');
      expect(updated.title).toBe('Updated Title');
      expect(tree !== updated).toBe(true);
    });
  });

  describe('Operation tracking', () => {
    test('should track task updates', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated Title' });
      
      expect(updated.hasPendingChanges).toBe(true);
      expect(updated.pendingOperationCount).toBe(1);
      
      const operations = updated.getPendingOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.type).toBe('update_task');
      expect(operations[0]?.taskId).toBe(sampleTask.id);
      expect(operations[0]?.updates).toEqual({ title: 'Updated Title' });
    });

    test('should track child additions', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const childTree = TrackingTaskTree.fromTask(childTask);
      const updated = tree.addChild(childTree);
      
      expect(updated.hasPendingChanges).toBe(true);
      expect(updated.pendingOperationCount).toBe(1);
      
      const operations = updated.getPendingOperations();
      expect(operations[0]?.type).toBe('add_child');
      expect(operations[0]?.parentId).toBe(sampleTask.id);
    });

    test('should track child removals', () => {
      const childTree = TrackingTaskTree.fromTask(childTask);
      const tree = TrackingTaskTree.fromTask(sampleTask, [childTree]);
      const updated = tree.removeChild(childTask.id);
      
      expect(updated.hasPendingChanges).toBe(true);
      const operations = updated.getPendingOperations();
      expect(operations[0]?.type).toBe('remove_child');
      expect(operations[0]?.taskId).toBe(childTask.id);
    });

    test('should track bulk status updates', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.bulkStatusUpdate([sampleTask.id], 'done');
      
      expect(updated.hasPendingChanges).toBe(true);
      const operations = updated.getPendingOperations();
      expect(operations[0]?.type).toBe('bulk_status_update');
      expect(operations[0]?.updates).toEqual({
        taskIds: [sampleTask.id],
        status: 'done'
      });
    });

    test('should accumulate multiple operations', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree
        .withTask({ title: 'Updated Title' })
        .withTask({ status: 'in-progress' });
      
      expect(updated.pendingOperationCount).toBe(2);
      const operations = updated.getPendingOperations();
      expect(operations[0]?.updates).toEqual({ title: 'Updated Title' });
      expect(operations[1]?.updates).toEqual({ status: 'in-progress' });
    });
  });

  describe('Reconciliation', () => {
    test('should create reconciliation plan', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree
        .withTask({ title: 'Updated Title' })
        .withTask({ status: 'in-progress' });
      
      const plan = updated.createReconciliationPlan();
      
      expect(plan.operations).toHaveLength(2);
      expect(plan.dependencies).toHaveLength(1); // Second operation depends on first
      expect(plan.dependencies[0]?.dependsOn).toHaveLength(1);
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });

    test('should clear pending operations', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated Title' });
      const cleared = updated.clearPendingOperations();
      
      expect(updated.hasPendingChanges).toBe(true);
      expect(cleared.hasPendingChanges).toBe(false);
      expect(cleared.title).toBe('Updated Title'); // State preserved
    });

    test('should support rollback', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated Title' });
      const rolledBack = updated.rollback();
      
      expect(updated.title).toBe('Updated Title');
      expect(rolledBack.title).toBe('Sample Task');
      expect(rolledBack.hasPendingChanges).toBe(false);
    });

    test('should support async reconciliation', async () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated Title' });
      
      const result = await updated.reconcile();
      
      expect(result.success).toBe(true);
      expect(result.appliedOperations).toHaveLength(1);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('Conflict detection', () => {
    test('should detect concurrent operations on same task', () => {
      const tree1 = TrackingTaskTree.fromTask(sampleTask);
      const tree2 = TrackingTaskTree.fromTask(sampleTask);
      
      const updated1 = tree1.withTask({ title: 'Title 1' });
      const updated2 = tree2.withTask({ title: 'Title 2' });
      
      const conflicts = updated1.detectConflicts([...updated2.getPendingOperations()]);
      expect(conflicts).toHaveLength(1);
    });

    test('should merge non-conflicting operations', () => {
      const task2 = { ...childTask, id: 'different-task-id' };
      const tree1 = TrackingTaskTree.fromTask(sampleTask);
      const tree2 = TrackingTaskTree.fromTask(task2);
      
      const updated1 = tree1.withTask({ title: 'Title 1' });
      const updated2 = tree2.withTask({ title: 'Title 2' });
      
      const merged = updated1.mergeOperations(updated2);
      expect(merged.pendingOperationCount).toBe(3); // 2 original + 1 merge operation
    });

    test('should throw error when merging conflicting operations', () => {
      const tree1 = TrackingTaskTree.fromTask(sampleTask);
      const tree2 = TrackingTaskTree.fromTask(sampleTask);
      
      const updated1 = tree1.withTask({ title: 'Title 1' });
      const updated2 = tree2.withTask({ title: 'Title 2' });
      
      expect(() => updated1.mergeOperations(updated2)).toThrow('Cannot merge due to 1 conflicts');
    });
  });

  describe('Collaborative editing', () => {
    test('should track last sync date', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const syncDate = tree.getLastSyncDate();
      
      expect(syncDate).toBeInstanceOf(Date);
      expect(syncDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('should update sync date when clearing operations', async () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated' });
      
      const originalSync = updated.getLastSyncDate();
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const cleared = updated.clearPendingOperations();
      const newSync = cleared.getLastSyncDate();
      
      expect(newSync.getTime()).toBeGreaterThan(originalSync.getTime());
    });
  });

  describe('Type safety and validation', () => {
    test('should validate operation schemas', () => {
      const tree = TrackingTaskTree.fromTask(sampleTask);
      const updated = tree.withTask({ title: 'Updated Title' });
      
      const operations = updated.getPendingOperations();
      expect(operations[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(operations[0]?.timestamp).toBeInstanceOf(Date);
      expect(operations[0]?.type).toBe('update_task');
    });

    test('should maintain TaskTree interface compatibility', () => {
      const regularTree = TaskTree.fromTask(sampleTask);
      const trackingTree = TrackingTaskTree.fromTask(sampleTask);
      
      // Should have same basic methods
      expect(typeof trackingTree.find).toBe('function');
      expect(typeof trackingTree.filter).toBe('function');
      expect(typeof trackingTree.walkDepthFirst).toBe('function');
      expect(typeof trackingTree.toPlainObject).toBe('function');
      expect(typeof trackingTree.toMarkdown).toBe('function');
      
      // Should return same data structure
      expect(trackingTree.toPlainObject()).toEqual(regularTree.toPlainObject());
    });
  });
});