import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskService } from '../src/core/services/TaskService.js';
import { createDatabase } from '../src/database/index.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';
import type { Task, CreateTask as NewTask } from '../src/schemas/task.js';
import type { Store } from '../src/database/store.js';

/**
 * Helper to create a NewTask object for insertion during tests.
 */
function createTask(data: Partial<NewTask> & { id: string }): NewTask {
  return {
    id: data.id,
    parentId: data.parentId,
    title: data.title ?? `Task ${data.id}`,
    description: data.description ?? undefined,
    status: data.status ?? 'pending',
    prd: undefined,
    contextDigest: undefined,
    projectId: undefined,
  };
}

// Re-define scoped variables to use the real Store
let store: Store;
let service: TaskService;
let dbPath: string;

beforeEach(async () => {
  // Use a unique file in temporary directory for each test run
  dbPath = join(tmpdir(), `taskservice-test-${Date.now()}.db`);
  store = await createDatabase({ dbPath, verbose: false });

  // Seed a small task hierarchy:
  //   1
  //   ├─ 1.1
  //   │   └─ 1.1.1
  //   └─ 1.2
  const tasks = [
    createTask({ id: '1' }),
    createTask({ id: '1.1', parentId: '1' }),
    createTask({ id: '1.2', parentId: '1' }),
    createTask({ id: '1.1.1', parentId: '1.1' }),
  ];
  for (const t of tasks) {
    await store.addTask(t);
  }

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
    const tree = await service.getTaskTree('1');
    expect(tree).not.toBeNull();
    if (!tree) return;
    expect(tree.id).toBe('1');
    expect(tree.children.length).toBe(2);
    const childIds = tree.children.map((c) => c.id).sort();
    expect(childIds).toEqual(['1.1', '1.2']);
    const grandchildNode = tree.children.find((c) => c.id === '1.1')!;
    expect(grandchildNode.children[0].id).toBe('1.1.1');
  });

  it('honours maxDepth when building tree', async () => {
    const tree = await service.getTaskTree('1', 1);
    expect(tree!.children.length).toBe(2);
    expect(tree!.children[0].children.length).toBe(0); // depth limited – grandchildren excluded
  });

  it('returns ordered ancestors (root first)', async () => {
    const ancestors = await service.getTaskAncestors('1.1.1');
    expect(ancestors.map((a) => a.id)).toEqual(['1', '1.1']);
  });

  it('lists all descendants', async () => {
    const descendants = await service.getTaskDescendants('1');
    const ids = descendants.map((d) => d.id).sort();
    expect(ids).toEqual(['1.1', '1.1.1', '1.2']);
  });

  it('calculates correct task depth', async () => {
    expect(await service.getTaskDepth('1')).toBe(0);
    expect(await service.getTaskDepth('1.1')).toBe(1);
    expect(await service.getTaskDepth('1.1.1')).toBe(2);
  });

  it('moves task subtree to a new parent', async () => {
    const moved = await service.moveTaskTree('1.2', '1.1');
    expect(moved).toBe(true);
    const updated = await store.getTask('1.2');
    expect(updated?.parentId).toBe('1.1');
  });

  it('prevents moving a task under its own descendant (circular)', async () => {
    const moved = await service.moveTaskTree('1', '1.1'); // would create circular reference
    expect(moved).toBe(false);
  });

  it('deletes a task subtree with cascade', async () => {
    const deleted = await service.deleteTaskTree('1.1', true);
    expect(deleted).toBe(true);
    expect(await store.getTask('1.1')).toBeNull();
    expect(await store.getTask('1.1.1')).toBeNull();
  });

  it('updates status across entire subtree', async () => {
    const updatedCount = await service.updateTreeStatus('1', 'done');
    expect(updatedCount).toBe(4); // root + 3 descendants
    const statuses = (
      await Promise.all(['1', '1.1', '1.1.1', '1.2'].map((id) => store.getTask(id)))
    ).map((t) => t!.status);
    expect(new Set(statuses)).toEqual(new Set(['done']));
  });
}); 