/**
 * @fileoverview Tests for TrackingDependencyGraph utility class
 * 
 * Tests the tracking functionality and reconciliation capabilities
 * of the TrackingDependencyGraph implementation for dependency operations only.
 */

import { describe, it, expect } from 'vitest';
import { 
  TrackingDependencyGraph, 
  type DependencyPendingOperation, 
  type DependencyReconciliationPlan,
  serializeDependencyTrackingState, 
  deserializeDependencyTrackingState 
} from '../src/utils/TrackingDependencyGraph.js';
import { DependencyGraph, type DependencyGraphData, type TaskData } from '../src/utils/DependencyGraph.js';

describe('TrackingDependencyGraph', () => {
  // Test data
  const testTasks: TaskData[] = [
    { id: 'task1', status: 'done' },
    { id: 'task2', status: 'pending' },
    { id: 'task3', status: 'pending' },
    { id: 'task4', status: 'in-progress' },
    { id: 'task5', status: 'pending' },
  ];

  const testDependencies = [
    { dependentTaskId: 'task2', dependencyTaskId: 'task1' },
    { dependentTaskId: 'task3', dependencyTaskId: 'task1' },
    { dependentTaskId: 'task4', dependencyTaskId: 'task2' },
    { dependentTaskId: 'task5', dependencyTaskId: 'task3' },
  ];

  const createTestData = (): DependencyGraphData => ({
    dependencies: testDependencies,
    tasks: testTasks,
  });

  const createTestTrackingGraph = (): TrackingDependencyGraph => {
    return TrackingDependencyGraph.fromData(createTestData(), { graphId: 'test-graph' });
  };

  describe('Construction and Basic Functionality', () => {
    it('creates a TrackingDependencyGraph from data', () => {
      const graph = createTestTrackingGraph();
      expect(graph).toBeDefined();
      expect(graph.isTracking).toBe(true);
      expect(graph.graphId).toBe('test-graph');
      expect(graph.hasPendingChanges).toBe(false);
    });

    it('creates a TrackingDependencyGraph from an existing DependencyGraph', () => {
      const regularGraph = new DependencyGraph(createTestData());
      const trackingGraph = TrackingDependencyGraph.fromDependencyGraph(regularGraph, 'converted-graph');

      expect(trackingGraph).toBeInstanceOf(TrackingDependencyGraph);
      expect(trackingGraph.isTracking).toBe(true);
      expect(trackingGraph.graphId).toBe('converted-graph');
      expect(trackingGraph.getAllTaskIds()).toEqual(regularGraph.getAllTaskIds());
    });

    it('creates an empty TrackingDependencyGraph', () => {
      const graph = TrackingDependencyGraph.empty('empty-graph');

      expect(graph.isTracking).toBe(true);
      expect(graph.graphId).toBe('empty-graph');
      expect(graph.getAllTaskIds()).toEqual([]);
      expect(graph.hasPendingChanges).toBe(false);
    });

    it('maintains the same interface as DependencyGraph', () => {
      const trackingGraph = createTestTrackingGraph();

      // Should have all DependencyGraph methods
      expect(typeof trackingGraph.getDependencies).toBe('function');
      expect(typeof trackingGraph.getDependents).toBe('function');
      expect(typeof trackingGraph.getBlockedTasks).toBe('function');
      expect(typeof trackingGraph.getExecutableTasks).toBe('function');
      expect(typeof trackingGraph.findCycles).toBe('function');
      expect(typeof trackingGraph.getTopologicalOrder).toBe('function');
    });
  });

  describe('Dependency Tracking', () => {
    it('tracks dependency additions', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      expect(trackingGraph.hasPendingChanges).toBe(true);
      expect(trackingGraph.pendingOperations).toHaveLength(1);

      const operation = trackingGraph.pendingOperations[0];
      expect(operation.type).toBe('dependency_add');
      expect(operation.dependentTaskId).toBe('task5');
      expect(operation.dependencyTaskId).toBe('task4');
      expect(operation.timestamp).toBeInstanceOf(Date);

      // Should also update the graph state
      expect(trackingGraph.getDependencies('task5')).toEqual(
        expect.arrayContaining(['task3', 'task4'])
      );
    });

    it('tracks dependency removals', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withoutDependency('task2', 'task1');

      expect(trackingGraph.hasPendingChanges).toBe(true);
      expect(trackingGraph.pendingOperations).toHaveLength(1);

      const operation = trackingGraph.pendingOperations[0];
      expect(operation.type).toBe('dependency_remove');
      expect(operation.dependentTaskId).toBe('task2');
      expect(operation.dependencyTaskId).toBe('task1');

      // Should also update the graph state
      expect(trackingGraph.getDependencies('task2')).toEqual([]);
    });

    it('tracks multiple operations in sequence', () => {
      let trackingGraph = createTestTrackingGraph();
      
      trackingGraph = trackingGraph
        .withDependency('task5', 'task4')
        .withDependency('task5', 'task2')
        .withoutDependency('task3', 'task1');

      expect(trackingGraph.pendingOperations).toHaveLength(3);
      expect(trackingGraph.pendingOperations[0].type).toBe('dependency_add');
      expect(trackingGraph.pendingOperations[1].type).toBe('dependency_add');
      expect(trackingGraph.pendingOperations[2].type).toBe('dependency_remove');
    });
  });

  describe('Tracking Control', () => {
    it('allows starting and stopping tracking', () => {
      const trackingGraph = createTestTrackingGraph();
      
      // Should start with tracking enabled
      expect(trackingGraph.isTracking).toBe(true);
      
      // Stop tracking should return regular DependencyGraph
      const regularGraph = trackingGraph.stopTracking();
      expect(regularGraph).toBeInstanceOf(DependencyGraph);
      expect(regularGraph).not.toBeInstanceOf(TrackingDependencyGraph);
      
      // Start tracking again
      const newTrackingGraph = TrackingDependencyGraph.fromDependencyGraph(regularGraph);
      expect(newTrackingGraph.isTracking).toBe(true);
    });

    it('allows clearing pending operations', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');
      
      expect(trackingGraph.hasPendingChanges).toBe(true);
      
      const clearedGraph = trackingGraph.clearPendingOperations();
      expect(clearedGraph.hasPendingChanges).toBe(false);
      expect(clearedGraph.pendingOperations).toHaveLength(0);
      
      // Base version should increment
      expect(clearedGraph.baseVersion).toBe(trackingGraph.baseVersion + 1);
    });

    it('preserves graph state when clearing operations', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');
      
      const clearedGraph = trackingGraph.clearPendingOperations();
      
      // Graph state should be preserved
      expect(clearedGraph.getDependencies('task5')).toEqual(
        trackingGraph.getDependencies('task5')
      );
    });
  });

  describe('Reconciliation Plan Creation', () => {
    it('creates reconciliation plan with pending operations', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph
        .withDependency('task5', 'task4')
        .withDependency('task5', 'task2');

      const plan = trackingGraph.createReconciliationPlan();

      expect(plan.graphId).toBe('test-graph');
      expect(plan.baseVersion).toBe(0);
      expect(plan.operations).toHaveLength(2);
      expect(plan.operations[0].type).toBe('dependency_add');
      expect(plan.operations[1].type).toBe('dependency_add');
    });

    it('consolidates conflicting operations', () => {
      let trackingGraph = createTestTrackingGraph();
      
      // Add multiple operations on the same dependency
      trackingGraph = trackingGraph
        .withDependency('task5', 'task4')
        .withoutDependency('task5', 'task4')
        .withDependency('task5', 'task4');

      const plan = trackingGraph.createReconciliationPlan();

      // Should consolidate to just the latest operation
      expect(plan.operations).toHaveLength(1);
      expect(plan.operations[0].type).toBe('dependency_add');
    });

    it('preserves operation order after consolidation', () => {
      let trackingGraph = createTestTrackingGraph();
      
      // Create operations with different timestamps
      const firstTime = new Date('2025-01-01T10:00:00Z');
      const secondTime = new Date('2025-01-01T11:00:00Z');
      
      // Manually create operations to control timestamps
      trackingGraph = new TrackingDependencyGraph(trackingGraph.toPlainObject(), {
        isTracking: true,
        baseVersion: 0,
        pendingOperations: [
          {
            type: 'dependency_remove',
            dependentTaskId: 'task2',
            dependencyTaskId: 'task1',
            timestamp: secondTime,
          },
          {
            type: 'dependency_add',
            dependentTaskId: 'task5',
            dependencyTaskId: 'task4',
            timestamp: firstTime,
          },
        ],
        graphId: 'test-graph',
      });

      const plan = trackingGraph.createReconciliationPlan();

      // Should be sorted by timestamp
      expect(plan.operations[0].timestamp.getTime()).toBeLessThan(
        plan.operations[1].timestamp.getTime()
      );
    });
  });

  describe('Operation Management', () => {
    it('gets operations since a specific version', () => {
      let trackingGraph = createTestTrackingGraph();
      
      // Add some operations
      trackingGraph = trackingGraph
        .withDependency('task5', 'task4')
        .withDependency('task5', 'task2');

      const recentOps = trackingGraph.getOperationsSince(0);
      expect(recentOps).toHaveLength(2);

      const veryRecentOps = trackingGraph.getOperationsSince(1);
      expect(veryRecentOps).toHaveLength(1);
    });

    it('merges operations from another tracking graph', () => {
      let trackingGraph1 = createTestTrackingGraph();
      let trackingGraph2 = createTestTrackingGraph();

      trackingGraph1 = trackingGraph1.withDependency('task5', 'task4');
      trackingGraph2 = trackingGraph2.withDependency('task5', 'task2');

      const mergedGraph = trackingGraph1.mergeOperations(trackingGraph2.pendingOperations);

      expect(mergedGraph.pendingOperations).toHaveLength(2);
      expect(mergedGraph.pendingOperations.every(op => op.type === 'dependency_add')).toBe(true);
    });

    it('sorts merged operations by timestamp', () => {
      const trackingGraph = createTestTrackingGraph();
      
      const olderOp: DependencyPendingOperation = {
        type: 'dependency_add',
        dependentTaskId: 'task5',
        dependencyTaskId: 'task4',
        timestamp: new Date('2025-01-01T10:00:00Z'),
      };

      const newerOp: DependencyPendingOperation = {
        type: 'dependency_remove',
        dependentTaskId: 'task2',
        dependencyTaskId: 'task1',
        timestamp: new Date('2025-01-01T11:00:00Z'),
      };

      const mergedGraph = trackingGraph.mergeOperations([newerOp, olderOp]);

      expect(mergedGraph.pendingOperations[0].timestamp.getTime()).toBeLessThan(
        mergedGraph.pendingOperations[1].timestamp.getTime()
      );
    });
  });

  describe('Service Integration', () => {
    it('applies changes to a dependency service', async () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      const mockService = {
        applyReconciliationPlan: async (plan: DependencyReconciliationPlan) => {
          expect(plan.graphId).toBe('test-graph');
          expect(plan.operations).toHaveLength(1);
          return new DependencyGraph(trackingGraph.toPlainObject());
        },
      };

      const result = await trackingGraph.apply(mockService);

      expect(result.updatedGraph).toBeInstanceOf(DependencyGraph);
      expect(result.clearedTrackingGraph.hasPendingChanges).toBe(false);
    });

    it('handles service errors gracefully', async () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      const mockService = {
        applyReconciliationPlan: async () => {
          throw new Error('Service error');
        },
      };

      await expect(trackingGraph.apply(mockService)).rejects.toThrow(
        'Failed to apply tracking dependency graph changes: Service error'
      );

      // Should preserve pending operations on failure
      expect(trackingGraph.hasPendingChanges).toBe(true);
    });

    it('handles empty operations gracefully', async () => {
      const trackingGraph = createTestTrackingGraph();

      const mockService = {
        applyReconciliationPlan: async (plan: DependencyReconciliationPlan) => {
          expect(plan.operations).toHaveLength(0);
          return new DependencyGraph(trackingGraph.toPlainObject());
        },
      };

      const result = await trackingGraph.apply(mockService);

      expect(result.updatedGraph).toBeInstanceOf(DependencyGraph);
      expect(result.clearedTrackingGraph).toBe(trackingGraph);
    });

    it('provides flush alias for apply method', async () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      const mockService = {
        applyReconciliationPlan: async () => {
          return new DependencyGraph(trackingGraph.toPlainObject());
        },
      };

      const result = await trackingGraph.flush(mockService);

      expect(result.updatedGraph).toBeInstanceOf(DependencyGraph);
      expect(result.clearedTrackingGraph.hasPendingChanges).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('serializes tracking state', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      const serialized = serializeDependencyTrackingState(trackingGraph);
      const parsed = JSON.parse(serialized);

      expect(parsed.graphId).toBe('test-graph');
      expect(parsed.baseVersion).toBe(0);
      expect(parsed.operations).toHaveLength(1);
      expect(parsed.timestamp).toBeDefined();
    });

    it('deserializes tracking state', () => {
      const serializedData = JSON.stringify({
        graphId: 'test-graph',
        baseVersion: 5,
        operations: [
          {
            type: 'dependency_add',
            dependentTaskId: 'task5',
            dependencyTaskId: 'task4',
            timestamp: '2025-01-01T10:00:00.000Z',
          },
        ],
        timestamp: '2025-01-01T10:00:00.000Z',
      });

      const deserialized = deserializeDependencyTrackingState(serializedData);

      expect(deserialized.graphId).toBe('test-graph');
      expect(deserialized.baseVersion).toBe(5);
      expect(deserialized.operations).toHaveLength(1);
      expect(deserialized.operations[0].type).toBe('dependency_add');
    });
  });

  describe('Non-tracking Mode', () => {
    it('does not track operations when tracking is disabled', () => {
      const trackingGraph = new TrackingDependencyGraph(createTestData(), {
        isTracking: false,
        graphId: 'test-graph',
      });

      const updatedGraph = trackingGraph.withDependency('task5', 'task4');

      expect(updatedGraph.hasPendingChanges).toBe(false);
      expect(updatedGraph.pendingOperations).toHaveLength(0);
    });

    it('can enable tracking on a non-tracking graph', () => {
      const nonTrackingGraph = new TrackingDependencyGraph(createTestData(), {
        isTracking: false,
        graphId: 'test-graph',
      });

      const trackingGraph = nonTrackingGraph.startTracking();

      expect(trackingGraph.isTracking).toBe(true);
      expect(trackingGraph.pendingOperations).toHaveLength(0);

      const updatedGraph = trackingGraph.withDependency('task5', 'task4');
      expect(updatedGraph.hasPendingChanges).toBe(true);
    });
  });

  describe('Graph State Consistency', () => {
    it('maintains graph functionality while tracking', () => {
      let trackingGraph = createTestTrackingGraph();
      
      // Perform operations that should affect graph analysis
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      // Graph analysis should work with the updated state
      expect(trackingGraph.getDependencies('task5')).toEqual(
        expect.arrayContaining(['task3', 'task4'])
      );
      
      const executableTasks = trackingGraph.getExecutableTasks();
      expect(executableTasks).toContain('task2'); // task2 should be executable since task1 is done
      
      const blockedTasks = trackingGraph.getBlockedTasks();
      expect(blockedTasks).toContain('task5'); // task5 should be blocked by task4 (in-progress)
    });

    it('detects cycles in modified graph', () => {
      let trackingGraph = TrackingDependencyGraph.empty();
      
      // Create a cycle: task1 -> task2 -> task3 -> task1
      trackingGraph = trackingGraph
        .withDependency('task2', 'task1')
        .withDependency('task3', 'task2')
        .withDependency('task1', 'task3');

      const cycleResult = trackingGraph.findCycles();
      expect(cycleResult.hasCycles).toBe(true);
      expect(cycleResult.cycles.length).toBeGreaterThan(0);
    });

    it('calculates correct topological order', () => {
      let trackingGraph = createTestTrackingGraph();
      trackingGraph = trackingGraph.withDependency('task5', 'task4');

      const order = trackingGraph.getTopologicalOrder();
      
      // task1 should come before task2 and task3
      const task1Index = order.indexOf('task1');
      const task2Index = order.indexOf('task2');
      const task3Index = order.indexOf('task3');
      
      expect(task1Index).toBeLessThan(task2Index);
      expect(task1Index).toBeLessThan(task3Index);
      
      // task4 should come after task2
      const task4Index = order.indexOf('task4');
      expect(task2Index).toBeLessThan(task4Index);
    });
  });
}); 