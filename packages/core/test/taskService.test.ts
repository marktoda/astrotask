import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../src/services/TaskService.js';
import { createDatabase } from '../src/database/index.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import type { Task, CreateTask as NewTask } from '../src/schemas/task.js';
import type { Store } from '../src/database/store.js';
import { TASK_IDENTIFIERS } from '../src/utils/TaskTreeConstants.js';

/**
 * Helper to create a NewTask object for insertion during tests.
 */
function createTask(data: Partial<NewTask> & { title: string }): NewTask {
  return {
    parentId: data.parentId,
    title: data.title,
    description: data.description ?? undefined,
    status: data.status ?? 'pending',
    priority: data.priority ?? 'medium',
    prd: undefined,
    contextDigest: undefined,
  };
}

// Re-define scoped variables to use the real Store
let store: Store;
let service: TaskService;
let dbPath: string;

beforeEach(async () => {
  // Use a unique file in temporary directory for each test run
  dbPath = join(tmpdir(), `taskservice-test-${Date.now()}`);
  store = await createDatabase({ dataDir: dbPath, verbose: false });

  // Seed a small task hierarchy - create them one by one to get the auto-generated IDs
  const taskA = await store.addTask(createTask({ title: 'Task A' }));
  const taskA1 = await store.addTask(createTask({ title: 'Task A.1', parentId: taskA.id }));
  const taskA2 = await store.addTask(createTask({ title: 'Task A.2', parentId: taskA.id }));
  const taskA11 = await store.addTask(createTask({ title: 'Task A.1.1', parentId: taskA1.id }));
  const taskB = await store.addTask(createTask({ title: 'Task B' })); // Root task for project tree tests

  // Store the IDs for use in tests
  (global as any).testTaskIds = {
    A: taskA.id,
    A1: taskA1.id,
    A2: taskA2.id,
    A11: taskA11.id,
    B: taskB.id,
  };

  service = new TaskService(store);
});

afterEach(async () => {
  if (store) {
    await store.close();
  }
  if (dbPath && existsSync(dbPath)) {
    // PGlite creates a directory per database, so remove recursively
    rmSync(dbPath, { recursive: true, force: true });
  }
});

describe('TaskService', () => {
  it('builds a complete task tree', async () => {
    const { A } = (global as any).testTaskIds;
    const tree = await service.getTaskTree(A);
    expect(tree).not.toBeNull();
    if (!tree) return;
    expect(tree.task.id).toBe(A);
    const children = tree.getChildren();
    expect(children.length).toBe(2);
    const childA1 = children.find(c => c.task.title === 'Task A.1');
    const childA2 = children.find(c => c.task.title === 'Task A.2');
    expect(childA1).toBeTruthy();
    expect(childA2).toBeTruthy();
    const grandchildren = childA1!.getChildren();
    expect(grandchildren.length).toBe(1);
    expect(grandchildren[0].task.title).toBe('Task A.1.1');
  });

  it('honours maxDepth when building tree', async () => {
    const { A } = (global as any).testTaskIds;
    const tree = await service.getTaskTree(A, 1);
    const children = tree!.getChildren();
    expect(children.length).toBe(2);
    expect(children[0].getChildren().length).toBe(0); // depth limited – grandchildren excluded
  });

  it('returns ordered ancestors (root first)', async () => {
    const { A11, A, A1 } = (global as any).testTaskIds;
    const ancestors = await service.getTaskAncestors(A11);
    // Should return ancestors in order from root to immediate parent
    expect(ancestors.map((a) => a.id)).toEqual([A, A1]);
  });

  it('lists all descendants', async () => {
    const { A, A1, A2, A11 } = (global as any).testTaskIds;
    const descendants = await service.getTaskDescendants(A);
    const ids = descendants.map((d) => d.id).sort();
    expect(ids).toEqual([A1, A11, A2].sort());
  });

  it('calculates correct task depth', async () => {
    const { A, A1, A11 } = (global as any).testTaskIds;
    // Depths start from 0 for root tasks
    expect(await service.getTaskDepth(A)).toBe(0);
    expect(await service.getTaskDepth(A1)).toBe(1);
    expect(await service.getTaskDepth(A11)).toBe(2);
  });

  it('moves task subtree to a new parent', async () => {
    const { A2, A1 } = (global as any).testTaskIds;
    const result = await service.moveTaskTree(A2, A1);
    expect(result.success).toBe(true);
    const updated = await store.getTask(A2);
    expect(updated?.parentId).toBe(A1);
  });

  it('prevents moving a task under its own descendant (circular)', async () => {
    const { A, A1 } = (global as any).testTaskIds;
    const result = await service.moveTaskTree(A, A1); // would create circular reference
    expect(result.success).toBe(false);
  });

  it('deletes a task subtree with cascade', async () => {
    const { A1, A11 } = (global as any).testTaskIds;
    const deleted = await service.deleteTaskTree(A1, true);
    expect(deleted).toBe(true);
    expect(await store.getTask(A1)).toBeNull();
    expect(await store.getTask(A11)).toBeNull();
  });

  it('updates status across entire subtree', async () => {
    const { A, A1, A2, A11 } = (global as any).testTaskIds;
    const updatedCount = await service.updateTreeStatus(A, 'done');
    expect(updatedCount).toBe(4); // root + 3 descendants
    const statuses = (
      await Promise.all([A, A1, A11, A2].map((id) => store.getTask(id)))
    ).map((t) => t!.status);
    expect(new Set(statuses)).toEqual(new Set(['done']));
  });

  // Commented out - PROJECT_ROOT functionality was removed in simplification
  /*
  describe('Project Tree functionality', () => {
    it('returns project tree with all parentless tasks when no ID provided', async () => {
      const projectTree = await service.getTaskTree();
      expect(projectTree).toBeTruthy();

      // Verify project root properties
      expect(projectTree!.task.id).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
      expect(projectTree!.task.title).toBe('Project Tasks');
      expect(projectTree!.task.parentId).toBe(null);

      // Should contain all root tasks as children
      const children = projectTree!.getChildren();
      expect(children).toHaveLength(2); // Task A and Task B
    });

    it('project tree contains complete task hierarchy', async () => {
      // Get the project tree (all tasks)
      const projectTree = await service.getTaskTree();

      // Should find all tasks in the project tree
      const foundA = projectTree!.find(task => task.title === 'Task A');
      const foundA1 = projectTree!.find(task => task.title === 'Task A.1');
      const foundA2 = projectTree!.find(task => task.title === 'Task A.2');
      const foundA11 = projectTree!.find(task => task.title === 'Task A.1.1');

      expect(foundA).toBeTruthy();
      expect(foundA1).toBeTruthy();
      expect(foundA2).toBeTruthy();
      expect(foundA11).toBeTruthy();

      // Verify descendant count (5 real tasks + 1 project root = 6 total, 5 descendants)
      expect(projectTree!.getDescendantCount()).toBe(5);
    });

    it('honours maxDepth with project tree', async () => {
      const projectTree = await service.getTaskTree(undefined, 2);
      expect(projectTree).toBeTruthy();

      // Should find tasks up to depth 2 from project root
      // Depth 0: project root
      // Depth 1: Task A, Task B (children of project root)
      // Depth 2: Task A.1, Task A.2 (children of Task A)
      // Should NOT find Task A.1.1 (depth 3)
      const foundA11 = projectTree!.find(task => task.title === 'Task A.1.1');
      expect(foundA11).toBe(null);

      const foundA1 = projectTree!.find(task => task.title === 'Task A.1');
      const foundA2 = projectTree!.find(task => task.title === 'Task A.2');
      expect(foundA1).toBeTruthy();
      expect(foundA2).toBeTruthy();
    });

    it('handles empty tasks with multiple parentless tasks correctly', async () => {
      // Create another task at root level
      await store.addTask({
        title: 'Task C',
        description: 'Another root task',
        status: 'pending',
        priority: 'low',
      });

      const projectTree = await service.getTaskTree();
      expect(projectTree).toBeTruthy();

      // Should have 3 children now (Task A, Task B, Task C)
      const children = projectTree!.getChildren();
      expect(children).toHaveLength(3);

      // Should find all root tasks
      const foundC = projectTree!.find(task => task.title === 'Task C');
      expect(foundC).toBeTruthy();
    });

    it('returns project tree even when database has no user tasks', async () => {
      // Delete all tasks in proper order (children before parents to avoid foreign key constraints)
      const { A, A1, A2, A11, B } = (global as any).testTaskIds;
      await store.deleteTask(A11); // Child first
      await store.deleteTask(A1);  // Then parent
      await store.deleteTask(A2);  // Other child
      await store.deleteTask(A);   // Then root parent
      await store.deleteTask(B);   // Independent root task

      const projectTree = await service.getTaskTree();
      // Should still return a project tree with PROJECT_ROOT, even with no child tasks
      expect(projectTree).toBeTruthy();
      expect(projectTree!.task.id).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);
      expect(projectTree!.task.title).toBe('Project Tasks');
      expect(projectTree!.getChildren()).toHaveLength(0); // No child tasks
    });
  });
  */

  describe('Store operations', () => {
    it('should list all tasks', async () => {
      const tasks = await store.listTasks();
      // Should have 5 tasks: Task A, A1, A2, A11, and B
      expect(tasks).toHaveLength(5);
    });

    it('should list root tasks', async () => {
      const rootTasks = await store.listRootTasks();
      expect(rootTasks).toHaveLength(2); // Task A and Task B
      const titles = rootTasks.map(t => t.title).sort();
      expect(titles).toEqual(['Task A', 'Task B']);
    });

    it('should list subtasks for a given parent', async () => {
      const { A } = (global as any).testTaskIds;
      const subtasks = await store.listSubtasks(A);
      expect(subtasks).toHaveLength(2);
      expect(subtasks.map(t => t.title)).toEqual(expect.arrayContaining(['Task A.1', 'Task A.2']));
    });

    it('should add a new root task', async () => {
      const data = createTask({ title: 'New Task' });
      const newTask = await store.addTask(data);

      expect(newTask.id).toBeDefined();
      expect(newTask.title).toBe('New Task');
      expect(newTask.parentId).toBe(null); // Root tasks have null parentId
      expect(newTask.status).toBe('pending');
    });

    it('should update an existing task', async () => {
      const { A } = (global as any).testTaskIds;
      const updatedTask = await store.updateTask(A, {
        title: 'Updated Task A',
        status: 'done',
      });

      expect(updatedTask).toBeTruthy();
      expect(updatedTask?.title).toBe('Updated Task A');
      expect(updatedTask?.status).toBe('done');
    });

    it('should delete an existing task', async () => {
      const { A11 } = (global as any).testTaskIds;
      const deleted = await store.deleteTask(A11);
      expect(deleted).toBe(true);

      // Verify it's actually deleted
      const task = await store.getTask(A11);
      expect(task).toBeNull();
    });
  });
}); 