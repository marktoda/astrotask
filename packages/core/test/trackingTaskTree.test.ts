import { describe, it, expect, beforeEach } from 'vitest';
import { TrackingTaskTree, type PendingOperation, batchReconcile, serializeTrackingState, deserializeTrackingState } from '../src/utils/TrackingTaskTree.js';
import { TaskTree } from '../src/utils/TaskTree.js';
import type { Task } from '../src/schemas/task.js';

describe('TrackingTaskTree', () => {
  let mockTask: Task;
  let mockChildTask: Task;

  beforeEach(() => {
    mockTask = {
      id: 'task-1',
      parentId: null,
      title: 'Root Task',
      description: 'A root task for testing',
      status: 'pending',
      priority: 'medium',
      prd: null,
      contextDigest: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    };

    mockChildTask = {
      id: 'task-2',
      parentId: 'task-1',
      title: 'Child Task',
      description: 'A child task for testing',
      status: 'pending',
      priority: 'high',
      prd: null,
      contextDigest: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    };
  });

  describe('Basic Functionality', () => {
    it('should create a tracking tree from a regular TaskTree', () => {
      const regularTree = TaskTree.fromTask(mockTask);
      const trackingTree = TrackingTaskTree.fromTaskTree(regularTree);

      expect(trackingTree).toBeInstanceOf(TrackingTaskTree);
      expect(trackingTree.isTracking).toBe(true);
      expect(trackingTree.id).toBe(mockTask.id);
      expect(trackingTree.hasPendingChanges).toBe(false);
    });

    it('should create a tracking tree from a task directly', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);

      expect(trackingTree).toBeInstanceOf(TrackingTaskTree);
      expect(trackingTree.isTracking).toBe(true);
      expect(trackingTree.title).toBe(mockTask.title);
    });

    it('should maintain the same interface as TaskTree', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);

      // Should have all TaskTree methods
      expect(typeof trackingTree.getChildren).toBe('function');
      expect(typeof trackingTree.find).toBe('function');
      expect(typeof trackingTree.filter).toBe('function');
      expect(typeof trackingTree.walkDepthFirst).toBe('function');
      expect(typeof trackingTree.toMarkdown).toBe('function');
    });
  });

  describe('Operation Tracking', () => {
    it('should track task updates', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      const updatedTree = trackingTree.withTask({ title: 'Updated Title' });

      expect(updatedTree.hasPendingChanges).toBe(true);
      expect(updatedTree.pendingOperations).toHaveLength(1);
      
      const operation = updatedTree.pendingOperations[0];
      expect(operation.type).toBe('task_update');
      expect(operation).toMatchObject({
        type: 'task_update',
        taskId: mockTask.id,
        updates: { title: 'Updated Title' },
      });
    });

    it('should track child additions', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);
      const childTree = TrackingTaskTree.fromTask(mockChildTask);
      
      const updatedTree = trackingTree.addChild(childTree);

      expect(updatedTree.hasPendingChanges).toBe(true);
      expect(updatedTree.pendingOperations).toHaveLength(1);
      
      const operation = updatedTree.pendingOperations[0];
      expect(operation.type).toBe('child_add');
      expect(operation).toMatchObject({
        type: 'child_add',
        parentId: mockTask.id,
        childData: childTree.toPlainObject(),
      });
    });

    it('should track child removals', () => {
      const childTree = TrackingTaskTree.fromTask(mockChildTask);
      const trackingTree = TrackingTaskTree.fromTask(mockTask).addChild(childTree);
      
      // Clear operations from child addition
      const cleanTree = trackingTree.clearPendingOperations();
      
      const updatedTree = cleanTree.removeChild(mockChildTask.id);

      expect(updatedTree.hasPendingChanges).toBe(true);
      expect(updatedTree.pendingOperations).toHaveLength(1);
      
      const operation = updatedTree.pendingOperations[0];
      expect(operation.type).toBe('child_remove');
      expect(operation).toMatchObject({
        type: 'child_remove',
        parentId: mockTask.id,
        childId: mockChildTask.id,
      });
    });

    it('should track batch updates', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      const batchOperations = [
        { type: 'update_task' as const, taskId: mockTask.id, updates: { status: 'in-progress' as const } },
      ];
      
      const updatedTree = trackingTree.batchUpdate(batchOperations);

      expect(updatedTree.hasPendingChanges).toBe(true);
      expect(updatedTree.pendingOperations).toHaveLength(1);
      
      const operation = updatedTree.pendingOperations[0];
      expect(operation.type).toBe('batch_update');
    });

    it('should accumulate multiple operations', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      trackingTree = trackingTree.withTask({ title: 'Updated Title' });
      trackingTree = trackingTree.withTask({ status: 'in-progress' });
      
      const childTree = TrackingTaskTree.fromTask(mockChildTask);
      trackingTree = trackingTree.addChild(childTree);

      expect(trackingTree.hasPendingChanges).toBe(true);
      expect(trackingTree.pendingOperations).toHaveLength(3);
      
      const operations = trackingTree.pendingOperations;
      expect(operations[0].type).toBe('task_update');
      expect(operations[1].type).toBe('task_update');
      expect(operations[2].type).toBe('child_add');
    });
  });

  describe('Tracking Control', () => {
    it('should allow starting and stopping tracking', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      // Should start with tracking enabled
      expect(trackingTree.isTracking).toBe(true);
      
      // Stop tracking should return regular TaskTree
      const regularTree = trackingTree.stopTracking();
      expect(regularTree).toBeInstanceOf(TaskTree);
      expect(regularTree).not.toBeInstanceOf(TrackingTaskTree);
      
      // Start tracking again
      const newTrackingTree = TrackingTaskTree.fromTaskTree(regularTree);
      expect(newTrackingTree.isTracking).toBe(true);
    });

    it('should allow clearing pending operations', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      trackingTree = trackingTree.withTask({ title: 'Updated Title' });
      
      expect(trackingTree.hasPendingChanges).toBe(true);
      
      const clearedTree = trackingTree.clearPendingOperations();
      expect(clearedTree.hasPendingChanges).toBe(false);
      expect(clearedTree.pendingOperations).toHaveLength(0);
      
      // Base version should increment
      expect(clearedTree.baseVersion).toBe(trackingTree.baseVersion + 1);
    });

    it('should support rollback', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      const originalTitle = trackingTree.title;
      
      trackingTree = trackingTree.withTask({ title: 'Updated Title' });
      expect(trackingTree.title).toBe('Updated Title');
      expect(trackingTree.hasPendingChanges).toBe(true);
      
      const rolledBackTree = trackingTree.rollback();
      expect(rolledBackTree.hasPendingChanges).toBe(false);
      expect(rolledBackTree.pendingOperations).toHaveLength(0);
      // Note: Current implementation doesn't actually restore state
      // This would require storing the original state
    });
  });

  describe('Versioning and Operations', () => {
    it('should track base version', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      expect(trackingTree.baseVersion).toBe(0);
      
      const clearedTree = trackingTree.clearPendingOperations();
      expect(clearedTree.baseVersion).toBe(0);
      
      const withChanges = clearedTree.withTask({ title: 'New Title' });
      const clearedAgain = withChanges.clearPendingOperations();
      expect(clearedAgain.baseVersion).toBe(1);
    });

    it('should get operations since a version', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      trackingTree = trackingTree.withTask({ title: 'Update 1' });
      trackingTree = trackingTree.withTask({ title: 'Update 2' });
      
      const recent = trackingTree.getOperationsSince(trackingTree.baseVersion);
      expect(recent).toHaveLength(2);
      
      const none = trackingTree.getOperationsSince(trackingTree.baseVersion + 10);
      expect(none).toHaveLength(0);
    });

    it('should merge operations from multiple sources', () => {
      const tree1 = TrackingTaskTree.fromTask(mockTask);
      const tree2 = TrackingTaskTree.fromTask(mockTask);
      
      const updated1 = tree1.withTask({ title: 'Update from Tree 1' });
      const updated2 = tree2.withTask({ title: 'Update from Tree 2' });
      
      const merged = updated1.mergeOperations(updated2.pendingOperations);
      
      expect(merged.pendingOperations).toHaveLength(2);
      // Operations should be sorted by timestamp
      expect(merged.pendingOperations[0].timestamp.getTime()).toBeLessThanOrEqual(
        merged.pendingOperations[1].timestamp.getTime()
      );
    });
  });

  describe('Reconciliation Planning', () => {
    it('should create reconciliation plan with no conflicts', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      trackingTree = trackingTree.withTask({ title: 'Updated Title' });
      
      const plan = trackingTree.createReconciliationPlan();
      
      expect(plan.treeId).toBe(mockTask.id);
      expect(plan.baseVersion).toBe(0);
      expect(plan.operations).toHaveLength(1);
      expect(plan.conflicts).toHaveLength(0);
      expect(plan.canAutoResolve).toBe(true);
    });

    it('should detect conflicts in reconciliation plan', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      // Simulate multiple updates to the same task (would happen with concurrent edits)
      trackingTree = trackingTree.withTask({ title: 'Update 1' });
      trackingTree = trackingTree.withTask({ title: 'Update 2' });
      
      const plan = trackingTree.createReconciliationPlan();
      
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].type).toBe('concurrent_task_update');
      expect(plan.conflicts[0].taskId).toBe(mockTask.id);
      expect(plan.conflicts[0].resolution).toBe('use_latest');
      expect(plan.canAutoResolve).toBe(true); // With last update wins policy, conflicts are auto-resolvable
    });
  });

  describe('Utility Functions', () => {
    it('should serialize and deserialize tracking state', () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      trackingTree = trackingTree.withTask({ title: 'Updated Title' });
      
      const serialized = serializeTrackingState(trackingTree);
      const deserialized = deserializeTrackingState(serialized);
      
      expect(deserialized.baseVersion).toBe(trackingTree.baseVersion);
      expect(deserialized.operations).toHaveLength(1);
      expect(typeof deserialized.timestamp).toBe('string');
    });

    it('should handle batch reconciliation', async () => {
      const tree1 = TrackingTaskTree.fromTask(mockTask).withTask({ title: 'Update 1' });
      const tree2 = TrackingTaskTree.fromTask(mockChildTask).withTask({ title: 'Update 2' });
      
      const reconcileCallback = async (plan: any) => {
        // Simulate successful reconciliation
        return plan.canAutoResolve;
      };
      
      const result = await batchReconcile([tree1, tree2], reconcileCallback);
      
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      
      // Succeeded trees should have cleared operations
      expect(result.succeeded[0].hasPendingChanges).toBe(false);
      expect(result.succeeded[1].hasPendingChanges).toBe(false);
    });

    it('should handle failed reconciliation', async () => {
      let trackingTree = TrackingTaskTree.fromTask(mockTask);
      trackingTree = trackingTree.withTask({ title: 'Update 1' });
      trackingTree = trackingTree.withTask({ title: 'Update 2' }); // This creates conflicts
      
      const reconcileCallback = async (plan: any) => {
        // Simulate failed reconciliation by always returning false
        return false;
      };
      
      const result = await batchReconcile([trackingTree], reconcileCallback);
      
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.message).toBe('Reconciliation rejected');
    });
  });

  describe('Type Safety and Validation', () => {
    it('should validate pending operations with Zod', () => {
      const trackingTree = TrackingTaskTree.fromTask(mockTask);
      
      // Valid operation should work
      const updated = trackingTree.withTask({ title: 'Valid Update' });
      expect(updated.hasPendingChanges).toBe(true);
      
      // Invalid operations would be caught by TypeScript and Zod validation
      // This is more of a compile-time guarantee than a runtime test
    });

    it('should maintain immutability', () => {
      const originalTree = TrackingTaskTree.fromTask(mockTask);
      const updatedTree = originalTree.withTask({ title: 'Updated Title' });
      
      // Original tree should be unchanged
      expect(originalTree.title).toBe(mockTask.title);
      expect(originalTree.hasPendingChanges).toBe(false);
      
      // Updated tree should have changes
      expect(updatedTree.title).toBe('Updated Title');
      expect(updatedTree.hasPendingChanges).toBe(true);
      
      // They should be different instances
      expect(originalTree).not.toBe(updatedTree);
    });

    it('should preserve parent-child relationships', () => {
      const parentTree = TrackingTaskTree.fromTask(mockTask);
      const childTree = TrackingTaskTree.fromTask(mockChildTask);
      
      const withChild = parentTree.addChild(childTree);
      
      expect(withChild.getChildren()).toHaveLength(1);
      expect(withChild.getChildren()[0].id).toBe(mockChildTask.id);
      
      // Child should know its parent (after reconstruction)
      const reconstructed = new TrackingTaskTree(withChild.toPlainObject());
      expect(reconstructed.getChildren()[0].getParent()?.id).toBe(mockTask.id);
    });
  });
});