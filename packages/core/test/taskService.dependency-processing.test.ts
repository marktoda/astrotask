import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database/index.js';
import type { Store } from '../src/database/store.js';
import { TaskService } from '../src/services/TaskService.js';
import { DependencyService } from '../src/services/DependencyService.js';
import { TrackingTaskTree, type PendingOperation } from '../src/entities/TrackingTaskTree.js';
import { TASK_IDENTIFIERS } from '../src/entities/TaskTreeConstants.js';
import type { Task } from '../src/schemas/task.js';
import type { TaskTreeData } from '../src/entities/TaskTree.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import { TrackingDependencyGraph } from '../src/entities/TrackingDependencyGraph.js';

describe('TaskService Dependency Processing', () => {
  let store: Store;
  let taskService: TaskService;
  let dependencyService: DependencyService;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = join(tmpdir(), `dependency-test-${Date.now()}`);
    store = await createDatabase({ dataDir: dbPath, verbose: false });
    taskService = new TaskService(store);
    dependencyService = new DependencyService(store);
  });

  afterAll(async () => {
    if (store) {
      await store.close();
    }
    if (dbPath && existsSync(dbPath)) {
      rmSync(dbPath, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clear all tasks and dependencies - no more PROJECT_ROOT to filter
    const allTasks = await store.listTasks({});
    for (const task of allTasks) {
      await store.deleteTask(task.id);
    }
  });

  describe('ID Mapping with Dependencies via TaskService', () => {
    it('should handle dependency operations with temporary IDs through integrated processing', async () => {
      // Create tracking tree with temporary IDs
      const baseTree = await taskService.getTaskTree();
      expect(baseTree).toBeDefined();
      
      let trackingTree = TrackingTaskTree.fromTaskTree(baseTree!);
      
      // Create parent task with temporary ID
      const parentTask: Task = {
        id: 'temp-parent-123',
        parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
        title: 'Parent Task',
        description: 'A parent task',
        status: 'pending',
        priority: 'medium',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Create child tasks with temporary IDs
      const child1: Task = {
        id: 'temp-child-456',
        parentId: 'temp-parent-123',
        title: 'Child Task 1',
        description: 'First child',
        status: 'pending',
        priority: 'medium',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const child2: Task = {
        id: 'temp-child-789',
        parentId: 'temp-parent-123',
        title: 'Child Task 2',
        description: 'Second child',
        status: 'pending',
        priority: 'medium',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Add tasks to tracking tree - use direct tree construction to avoid duplicate operations
      const parentTreeData: TaskTreeData = {
        task: parentTask,
        children: [
          { task: child1, children: [] },
          { task: child2, children: [] }
        ]
      };
      const parentTree = new TrackingTaskTree(parentTreeData);
      trackingTree.addChild(parentTree);
      
      // Create tracking dependency graph with temporary IDs
      let trackingGraph = TrackingDependencyGraph.empty('test-dependencies');
      trackingGraph = trackingGraph.withDependency('temp-child-789', 'temp-child-456');
      
      // Verify the tree and graph have pending changes
      expect(trackingTree.hasPendingChanges).toBe(true);
      expect(trackingGraph.hasPendingChanges).toBe(true);
      
      // Step 1: Flush tree first to create tasks and get ID mappings
      const { updatedTree, idMappings } = await trackingTree.flush(taskService);
      
      // Verify tasks were created
      const parentNodes = updatedTree.getChildren();
      expect(parentNodes).toHaveLength(1);
      
      const parentNode = parentNodes[0]!;
      expect(parentNode.task.title).toBe('Parent Task');
      
      const childNodes = parentNode.getChildren();
      expect(childNodes).toHaveLength(2);
      
      // Find the actual child task IDs
      const child1Node = childNodes.find(n => n.task.title === 'Child Task 1')!;
      const child2Node = childNodes.find(n => n.task.title === 'Child Task 2')!;
      
      expect(child1Node).toBeDefined();
      expect(child2Node).toBeDefined();
      
      // Verify ID mappings exist
      expect(idMappings.size).toBeGreaterThan(0);
      expect(idMappings.has('temp-parent-123')).toBe(true);
      expect(idMappings.has('temp-child-456')).toBe(true);
      expect(idMappings.has('temp-child-789')).toBe(true);
      
      // Step 2: Apply ID mappings to dependency graph
      const mappedGraph = trackingGraph.applyIdMappings(idMappings);
      
      // Step 3: Flush dependency graph with resolved IDs
      await mappedGraph.flush(dependencyService);
      
      // Verify dependency was created with real IDs
      const child2Dependencies = await taskService.getTaskDependencyGraph(child2Node.task.id);
      expect(child2Dependencies.dependencies).toContain(child1Node.task.id);
      expect(child2Dependencies.isBlocked).toBe(true);
      
      // Verify dependency shows up in reverse direction
      const child1Dependents = await taskService.getTaskDependencyGraph(child1Node.task.id);
      expect(child1Dependents.dependents).toContain(child2Node.task.id);
    });

    it('should handle complex nested dependencies with ID mapping', async () => {
      const baseTree = await taskService.getTaskTree();
      let trackingTree = TrackingTaskTree.fromTaskTree(baseTree!);
      
      // Create a complex hierarchy with temporary IDs
      const epic: Task = {
        id: 'temp-epic-001',
        parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
        title: 'Epic Task',
        description: 'Epic with dependencies',
        status: 'pending',
        priority: 'high',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const tasks = Array.from({ length: 4 }, (_, i) => ({
        id: `temp-task-${i + 1}`,
        parentId: 'temp-epic-001',
        title: `Task ${i + 1}`,
        description: `Task ${i + 1} description`,
        status: 'pending' as const,
        priority: 'medium' as const,
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      // Build tracking tree - use direct tree construction to avoid duplicate operations
      const epicTreeData: TaskTreeData = {
        task: epic,
        children: tasks.map(task => ({ task, children: [] }))
      };
      const epicTree = new TrackingTaskTree(epicTreeData);
      trackingTree.addChild(epicTree);
      
      // Create dependency graph separately using proper approach
      let trackingGraph = TrackingDependencyGraph.empty('test-dependencies');
      trackingGraph = trackingGraph.withDependency('temp-task-2', 'temp-task-1');
      trackingGraph = trackingGraph.withDependency('temp-task-3', 'temp-task-2');
      trackingGraph = trackingGraph.withDependency('temp-task-4', 'temp-task-3');
      
      // Flush tree first to create tasks and get ID mappings
      const { updatedTree, idMappings } = await trackingTree.flush(taskService);
      
      // Apply ID mappings to dependency graph and flush it
      const mappedGraph = trackingGraph.applyIdMappings(idMappings);
      await mappedGraph.flush(dependencyService);
      
      // Verify the dependency chain was created correctly
      const epicNode = updatedTree.getChildren()[0]!;
      const taskNodes = epicNode.getChildren();
      
      expect(taskNodes).toHaveLength(4);
      
      // Find actual task IDs by title
      const actualTasks = taskNodes.map(node => ({
        id: node.task.id,
        title: node.task.title
      }));
      
      const task1 = actualTasks.find(t => t.title === 'Task 1')!;
      const task2 = actualTasks.find(t => t.title === 'Task 2')!;
      const task3 = actualTasks.find(t => t.title === 'Task 3')!;
      const task4 = actualTasks.find(t => t.title === 'Task 4')!;
      
      // Verify dependency chain
      const task2Deps = await taskService.getTaskDependencyGraph(task2.id);
      expect(task2Deps.dependencies).toContain(task1.id);
      
      const task3Deps = await taskService.getTaskDependencyGraph(task3.id);
      expect(task3Deps.dependencies).toContain(task2.id);
      
      const task4Deps = await taskService.getTaskDependencyGraph(task4.id);
      expect(task4Deps.dependencies).toContain(task3.id);
      
      // Verify topological order
      const allTaskIds = actualTasks.map(t => t.id);
      const topologicalOrder = await taskService.getTopologicalOrder(allTaskIds);
      
      const task1Index = topologicalOrder.indexOf(task1.id);
      const task2Index = topologicalOrder.indexOf(task2.id);
      const task3Index = topologicalOrder.indexOf(task3.id);
      const task4Index = topologicalOrder.indexOf(task4.id);
      
      expect(task1Index).toBeLessThan(task2Index);
      expect(task2Index).toBeLessThan(task3Index);
      expect(task3Index).toBeLessThan(task4Index);
    });

    it('should handle dependency removal with ID mapping', async () => {
      const baseTree = await taskService.getTaskTree();
      let trackingTree = TrackingTaskTree.fromTaskTree(baseTree!);
      
      // Create tasks
      const taskA: Task = {
        id: 'temp-a',
        parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
        title: 'Task A',
        description: 'Task A',
        status: 'pending',
        priority: 'medium',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const taskB: Task = {
        id: 'temp-b',
        parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
        title: 'Task B',
        description: 'Task B',
        status: 'pending',
        priority: 'medium',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      trackingTree.addChild(TrackingTaskTree.fromTask(taskA));
      trackingTree.addChild(TrackingTaskTree.fromTask(taskB));
      
      // Create dependency graph with add and remove operations
      let trackingGraph = TrackingDependencyGraph.empty('test-dependencies');
      trackingGraph = trackingGraph.withDependency('temp-b', 'temp-a');
      trackingGraph = trackingGraph.withoutDependency('temp-b', 'temp-a');
      
      // Flush tree first to create tasks and get ID mappings
      const { idMappings } = await trackingTree.flush(taskService);
      
      // Apply ID mappings to dependency graph and flush it
      const mappedGraph = trackingGraph.applyIdMappings(idMappings);
      await mappedGraph.flush(dependencyService);
      
      // Get actual task IDs
      const finalTree = await taskService.getTaskTree();
      const taskNodes = finalTree!.getChildren();
      const actualTaskA = taskNodes.find(n => n.task.title === 'Task A')!;
      const actualTaskB = taskNodes.find(n => n.task.title === 'Task B')!;
      
      // Verify no dependency exists (add was cancelled by remove)
      const taskBDeps = await taskService.getTaskDependencyGraph(actualTaskB.task.id);
      expect(taskBDeps.dependencies).not.toContain(actualTaskA.task.id);
      expect(taskBDeps.isBlocked).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid dependency IDs gracefully', async () => {
      const baseTree = await taskService.getTaskTree();
      let trackingTree = TrackingTaskTree.fromTaskTree(baseTree!);
      
      // Create valid task
      const validTask: Task = {
        id: 'temp-valid',
        parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
        title: 'Valid Task',
        description: 'A valid task',
        status: 'pending',
        priority: 'medium',
        prd: null,
        contextDigest: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      trackingTree.addChild(TrackingTaskTree.fromTask(validTask));
      
      // Create dependency graph with dependency to non-existent ID
      let trackingGraph = TrackingDependencyGraph.empty('test-dependencies');
      trackingGraph = trackingGraph.withDependency('temp-valid', 'non-existent-id');
      
      // Flush tree first to create tasks and get ID mappings
      const { idMappings } = await trackingTree.flush(taskService);
      
      // Apply ID mappings to dependency graph
      const mappedGraph = trackingGraph.applyIdMappings(idMappings);
      
      // Flush dependency graph - this should handle invalid IDs gracefully
      // (DependencyService should validate that both tasks exist and reject invalid dependencies)
      await expect(mappedGraph.flush(dependencyService)).rejects.toThrow();
      
      // Verify valid task exists but no invalid dependency was created
      const finalTree = await taskService.getTaskTree();
      const taskNode = finalTree!.getChildren().find(n => n.task.title === 'Valid Task')!;
      const deps = await taskService.getTaskDependencyGraph(taskNode.task.id);
      expect(deps.dependencies).toHaveLength(0);
    });
  });
}); 
