/**
 * @fileoverview Tests for DependencyGraph utility class
 * 
 * Tests the graph analysis and traversal functionality
 * of the DependencyGraph implementation.
 */

import { describe, it, expect } from 'vitest';
import { DependencyGraph, type DependencyGraphData, type TaskData } from '../src/utils/DependencyGraph.js';

describe('DependencyGraph', () => {
  // Test data
  const testTasks: TaskData[] = [
    { id: 'task1', status: 'done' },
    { id: 'task2', status: 'pending' },
    { id: 'task3', status: 'pending' },
    { id: 'task4', status: 'in-progress' },
    { id: 'task5', status: 'pending' },
  ];

  const testDependencies = [
    { dependentTaskId: 'task2', dependencyTaskId: 'task1' }, // task2 depends on task1
    { dependentTaskId: 'task3', dependencyTaskId: 'task1' }, // task3 depends on task1
    { dependentTaskId: 'task4', dependencyTaskId: 'task2' }, // task4 depends on task2
    { dependentTaskId: 'task5', dependencyTaskId: 'task3' }, // task5 depends on task3
  ];

  const createTestGraph = (): DependencyGraph => {
    return new DependencyGraph({
      dependencies: testDependencies,
      tasks: testTasks,
    });
  };

  describe('Construction and Basic Queries', () => {
    it('creates a DependencyGraph from data', () => {
      const graph = createTestGraph();
      expect(graph).toBeDefined();
    });

    it('validates input data with Zod schema', () => {
      expect(() => {
        new DependencyGraph({
          dependencies: [{ dependentTaskId: 'a', dependencyTaskId: 'b' }],
        });
      }).not.toThrow();

      expect(() => {
        new DependencyGraph({
          dependencies: [{ dependentTaskId: 'a' } as any],
        });
      }).toThrow();
    });

    it('gets dependencies for a task', () => {
      const graph = createTestGraph();
      
      expect(graph.getDependencies('task1')).toEqual([]);
      expect(graph.getDependencies('task2')).toEqual(['task1']);
      expect(graph.getDependencies('task4')).toEqual(['task2']);
    });

    it('gets dependents for a task', () => {
      const graph = createTestGraph();
      
      expect(graph.getDependents('task1')).toEqual(expect.arrayContaining(['task2', 'task3']));
      expect(graph.getDependents('task2')).toEqual(['task4']);
      expect(graph.getDependents('task5')).toEqual([]);
    });

    it('gets all task IDs in the graph', () => {
      const graph = createTestGraph();
      const allIds = graph.getAllTaskIds();
      
      expect(allIds).toHaveLength(5);
      expect(allIds).toEqual(expect.arrayContaining(['task1', 'task2', 'task3', 'task4', 'task5']));
    });

    it('checks if a task exists in the graph', () => {
      const graph = createTestGraph();
      
      expect(graph.hasTask('task1')).toBe(true);
      expect(graph.hasTask('task5')).toBe(true);
      expect(graph.hasTask('nonexistent')).toBe(false);
    });
  });

  describe('Task Dependency Graph Information', () => {
    it('gets comprehensive dependency information for a task', () => {
      const graph = createTestGraph();
      const taskGraph = graph.getTaskDependencyGraph('task2');
      
      expect(taskGraph).toEqual({
        taskId: 'task2',
        dependencies: ['task1'],
        dependents: ['task4'],
        isBlocked: false, // task1 is done
        blockedBy: [],
      });
    });

    it('identifies blocked tasks correctly', () => {
      const graph = createTestGraph();
      const taskGraph = graph.getTaskDependencyGraph('task4');
      
      expect(taskGraph.isBlocked).toBe(true); // task2 is pending
      expect(taskGraph.blockedBy).toEqual(['task2']);
    });

    it('gets dependency information for all tasks', () => {
      const graph = createTestGraph();
      const allGraphs = graph.getAllTaskDependencyGraphs();
      
      expect(allGraphs.size).toBe(5);
      expect(allGraphs.has('task1')).toBe(true);
      expect(allGraphs.get('task1')?.dependencies).toEqual([]);
    });
  });

  describe('Blocked and Executable Tasks', () => {
    it('identifies blocked tasks', () => {
      const graph = createTestGraph();
      const blockedTasks = graph.getBlockedTasks();
      
      // task4 is blocked by task2 (pending), task5 is blocked by task3 (pending)
      expect(blockedTasks).toEqual(expect.arrayContaining(['task4', 'task5']));
    });

    it('identifies executable tasks', () => {
      const graph = createTestGraph();
      const executableTasks = graph.getExecutableTasks();
      
      // task1 is done, task4 is in-progress, so task2 and task3 should be executable
      expect(executableTasks).toEqual(expect.arrayContaining(['task2', 'task3']));
      expect(executableTasks).not.toContain('task1'); // already done
      expect(executableTasks).not.toContain('task4'); // in progress
    });
  });

  describe('Cycle Detection', () => {
    it('detects no cycles in acyclic graph', () => {
      const graph = createTestGraph();
      const result = graph.findCycles();
      
      expect(result.hasCycles).toBe(false);
      expect(result.cycles).toEqual([]);
    });

    it('detects cycles in cyclic graph', () => {
      const cyclicDependencies = [
        { dependentTaskId: 'task1', dependencyTaskId: 'task2' },
        { dependentTaskId: 'task2', dependencyTaskId: 'task3' },
        { dependentTaskId: 'task3', dependencyTaskId: 'task1' }, // creates cycle
      ];

      const graph = new DependencyGraph({
        dependencies: cyclicDependencies,
        tasks: testTasks.slice(0, 3),
      });

      const result = graph.findCycles();
      expect(result.hasCycles).toBe(true);
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('checks if adding a dependency would create a cycle', () => {
      const graph = createTestGraph();
      
      // Adding task1 -> task4 would create a cycle: task1 -> task4 -> task2 -> task1
      const result = graph.wouldCreateCycle('task1', 'task4');
      expect(result.hasCycles).toBe(true);
      
      // Adding task5 -> task1 would not create a cycle
      const result2 = graph.wouldCreateCycle('task5', 'task1');
      expect(result2.hasCycles).toBe(false);
    });
  });

  describe('Topological Sorting', () => {
    it('gets topological order for all tasks', () => {
      const graph = createTestGraph();
      const order = graph.getTopologicalOrder();
      
      expect(order).toHaveLength(5);
      
      // task1 should come before task2 and task3
      const task1Index = order.indexOf('task1');
      const task2Index = order.indexOf('task2');
      const task3Index = order.indexOf('task3');
      
      expect(task1Index).toBeLessThan(task2Index);
      expect(task1Index).toBeLessThan(task3Index);
    });

    it('gets topological order for specific tasks', () => {
      const graph = createTestGraph();
      const order = graph.getTopologicalOrderForTasks(['task1', 'task2', 'task4']);
      
      expect(order).toHaveLength(3);
      expect(order.indexOf('task1')).toBeLessThan(order.indexOf('task2'));
      expect(order.indexOf('task2')).toBeLessThan(order.indexOf('task4'));
    });
  });

  describe('Graph Traversal', () => {
    it('performs depth-first traversal', () => {
      const graph = createTestGraph();
      const visited: Array<{ taskId: string; depth: number }> = [];
      
      graph.walkDepthFirst('task1', (taskId, depth) => {
        visited.push({ taskId, depth });
      });
      
      expect(visited.length).toBeGreaterThan(0);
      expect(visited[0]).toEqual({ taskId: 'task1', depth: 0 });
    });

    it('performs breadth-first traversal', () => {
      const graph = createTestGraph();
      const visited: Array<{ taskId: string; depth: number }> = [];
      
      graph.walkBreadthFirst('task1', (taskId, depth) => {
        visited.push({ taskId, depth });
      });
      
      expect(visited.length).toBeGreaterThan(0);
      expect(visited[0]).toEqual({ taskId: 'task1', depth: 0 });
    });

    it('finds shortest path between tasks', () => {
      const graph = createTestGraph();
      
      const path = graph.findShortestPath('task1', 'task4');
      expect(path).toEqual(['task1', 'task2', 'task4']);
      
      const noPath = graph.findShortestPath('task4', 'task1');
      expect(noPath).toBeNull();
      
      const samePath = graph.findShortestPath('task1', 'task1');
      expect(samePath).toEqual(['task1']);
    });
  });

  describe('Graph Metrics', () => {
    it('calculates comprehensive graph metrics', () => {
      const graph = createTestGraph();
      const metrics = graph.getMetrics();
      
      expect(metrics.totalTasks).toBe(5);
      expect(metrics.totalDependencies).toBe(4);
      expect(metrics.rootTasks).toBe(1); // only task1 has no dependencies
      expect(metrics.leafTasks).toBe(2); // task4 and task5 have no dependents
      expect(metrics.hasCycles).toBe(false);
      expect(metrics.averageDependencies).toBe(0.8); // 4 dependencies / 5 tasks
    });

    it('calculates task depth correctly', () => {
      const graph = createTestGraph();
      
      expect(graph.calculateTaskDepth('task1')).toBe(0);
      expect(graph.calculateTaskDepth('task2')).toBe(1);
      expect(graph.calculateTaskDepth('task4')).toBe(2);
    });
  });

  describe('Immutable Operations', () => {
    it('creates new graph with additional dependency', () => {
      const graph = createTestGraph();
      const newGraph = graph.withDependency('task5', 'task4');
      
      // Original graph unchanged
      expect(graph.getDependencies('task5')).toEqual(['task3']);
      
      // New graph has additional dependency
      expect(newGraph.getDependencies('task5')).toEqual(expect.arrayContaining(['task3', 'task4']));
    });

    it('creates new graph without specific dependency', () => {
      const graph = createTestGraph();
      const newGraph = graph.withoutDependency('task2', 'task1');
      
      // Original graph unchanged
      expect(graph.getDependencies('task2')).toEqual(['task1']);
      
      // New graph has dependency removed
      expect(newGraph.getDependencies('task2')).toEqual([]);
    });
  });

  describe('Static Factory Methods', () => {
    it('creates graph from dependencies', () => {
      const dependencies = [
        {
          id: 'dep1',
          dependentTaskId: 'task2',
          dependencyTaskId: 'task1',
          createdAt: new Date(),
        },
      ];

      const graph = DependencyGraph.fromDependencies(dependencies, testTasks);
      expect(graph.getDependencies('task2')).toEqual(['task1']);
    });

    it('creates empty graph', () => {
      const graph = DependencyGraph.empty();
      expect(graph.getAllTaskIds()).toEqual([]);
      expect(graph.getMetrics().totalTasks).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('converts graph to plain object', () => {
      const graph = createTestGraph();
      const plainObject = graph.toPlainObject();
      
      expect(plainObject.dependencies).toHaveLength(4);
      expect(plainObject.tasks).toHaveLength(5);
      
      // Should be able to recreate graph from plain object
      const recreatedGraph = new DependencyGraph(plainObject);
      expect(recreatedGraph.getAllTaskIds()).toEqual(graph.getAllTaskIds());
    });
  });
}); 