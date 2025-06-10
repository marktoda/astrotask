import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database/index.js';
import type { Store } from '../src/database/store.js';
import { TaskService } from '../src/services/TaskService.js';
import { TrackingTaskTree } from '../src/entities/TrackingTaskTree.js';
import { TASK_IDENTIFIERS } from '../src/entities/TaskTreeConstants.js';
import type { Task } from '../src/schemas/task.js';
import type { TaskTreeData } from '../src/entities/TaskTree.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';

describe('Simple Flush Test', () => {
  let store: Store;
  let taskService: TaskService;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = join(tmpdir(), `simple-flush-test-${Date.now()}`);
    store = await createDatabase({ dataDir: dbPath, verbose: false });
    taskService = new TaskService(store);
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
    // Clear all tasks - no more PROJECT_ROOT to filter
    const allTasks = await store.listTasks({});
    for (const task of allTasks) {
      await store.deleteTask(task.id);
    }
  });

  it('should flush a single task with temporary ID', async () => {
    // Get base tree
    const baseTree = await taskService.getTaskTree();
    expect(baseTree).toBeDefined();
    
    // Create tracking tree
    let trackingTree = TrackingTaskTree.fromTaskTree(baseTree!);
    
    // Create a simple task with temporary ID
    const tempTask: Task = {
      id: 'temp-task-123',
      parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
      title: 'Test Task',
      description: 'A test task',
      status: 'pending',
      priorityScore: 50,
      prd: null,
      contextDigest: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Add to tracking tree
    trackingTree.addChild(TrackingTaskTree.fromTask(tempTask));
    
    console.log('Pending operations before flush:', trackingTree.pendingOperations.length);
    for (const op of trackingTree.pendingOperations) {
      console.log('  Operation:', op.type, op);
    }
    
    // Flush
    const { updatedTree, idMappings } = await trackingTree.flush(taskService);
    
    console.log('ID mappings after flush:');
    for (const [tempId, realId] of idMappings.entries()) {
      console.log(`  ${tempId} -> ${realId}`);
    }
    
    // Debug: check what's actually in the database
    const allTasks = await store.listTasks({});
    console.log('All tasks in database:');
    for (const task of allTasks) {
      console.log(`  ${task.id} - ${task.title} (parent: ${task.parentId})`);
    }
    
    // Debug: try to get the tree directly 
    const freshTree = await taskService.getTaskTree();
    console.log('Fresh tree children:', freshTree?.getChildren().length);
    if (freshTree) {
      for (const child of freshTree.getChildren()) {
        console.log(`  Fresh child: ${child.task.id} - ${child.task.title}`);
      }
    }
    
    // Verify
    const children = updatedTree.getChildren();
    console.log('Children after flush:', children.length);
    for (const child of children) {
      console.log(`  Child: ${child.task.id} - ${child.task.title}`);
    }
    
    expect(children).toHaveLength(1);
    expect(children[0]!.task.title).toBe('Test Task');
    expect(idMappings.has('temp-task-123')).toBe(true);
  });

  it('should flush parent and child tasks with temporary IDs', async () => {
    // Get base tree
    const baseTree = await taskService.getTaskTree();
    let trackingTree = TrackingTaskTree.fromTaskTree(baseTree!);
    
    // Create parent task
    const parentTask: Task = {
      id: 'temp-parent-456',
      parentId: TASK_IDENTIFIERS.PROJECT_ROOT,
      title: 'Parent Task',
      description: 'A parent task',
      status: 'pending',
      priorityScore: 50,
      prd: null,
      contextDigest: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Create child task
    const childTask: Task = {
      id: 'temp-child-789',
      parentId: 'temp-parent-456', // References temporary parent ID
      title: 'Child Task',
      description: 'A child task',
      status: 'pending',
      priorityScore: 50,
      prd: null,
      contextDigest: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Build tree structure - avoid double operations by constructing the tree data directly
    const parentTreeData: TaskTreeData = {
      task: parentTask,
      children: [{ task: childTask, children: [] }]
    };
    const parentTree = new TrackingTaskTree(parentTreeData);
    trackingTree.addChild(parentTree);
    
    console.log('Pending operations before flush:', trackingTree.pendingOperations.length);
    
    // Flush
    const { updatedTree, idMappings } = await trackingTree.flush(taskService);
    
    console.log('ID mappings after flush:');
    for (const [tempId, realId] of idMappings.entries()) {
      console.log(`  ${tempId} -> ${realId}`);
    }
    
    // Debug: check what's actually in the database
    const allTasks = await store.listTasks({});
    console.log('All tasks in database:');
    for (const task of allTasks) {
      console.log(`  ${task.id} - ${task.title} (parent: ${task.parentId})`);
    }
    
    // Debug: try to get the tree directly 
    const freshTree = await taskService.getTaskTree();
    console.log('Fresh tree children:', freshTree?.getChildren().length);
    if (freshTree) {
      for (const child of freshTree.getChildren()) {
        console.log(`  Fresh child: ${child.task.id} - ${child.task.title}`);
      }
    }
    
    // Verify structure
    const children = updatedTree.getChildren();
    expect(children).toHaveLength(1);
    
    const parentNode = children[0]!;
    expect(parentNode.task.title).toBe('Parent Task');
    
    const grandchildren = parentNode.getChildren();
    expect(grandchildren).toHaveLength(1);
    expect(grandchildren[0]!.task.title).toBe('Child Task');
    
    // Verify ID mappings
    expect(idMappings.has('temp-parent-456')).toBe(true);
    expect(idMappings.has('temp-child-789')).toBe(true);
    
    // Verify parent-child relationship in database
    const realChildId = idMappings.get('temp-child-789')!;
    const realParentId = idMappings.get('temp-parent-456')!;
    const childFromDb = await store.getTask(realChildId);
    expect(childFromDb?.parentId).toBe(realParentId);
  });
}); 
