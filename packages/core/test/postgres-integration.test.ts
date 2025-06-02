import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/database/index.js';
import type { Store } from '../src/database/store.js';

describe('PostgreSQL Integration', () => {
  // Skip these tests if no PostgreSQL connection string is provided
  const postgresUrl = process.env.POSTGRES_TEST_URL;
  const skipTests = !postgresUrl;

  if (skipTests) {
    it.skip('PostgreSQL tests require POSTGRES_TEST_URL environment variable', () => {});
    return;
  }

  let store: Store;

  beforeAll(async () => {
    // Create a PostgreSQL connection
    store = await createDatabase({
      dataDir: postgresUrl,
      verbose: false,
    });
  });

  afterAll(async () => {
    if (store) {
      await store.close();
    }
  });

  it('should connect to PostgreSQL and perform basic operations', async () => {
    // Test basic task creation
    const task = await store.addTask({
      title: 'PostgreSQL Test Task',
      description: 'Testing PostgreSQL integration',
      status: 'pending',
      priority: 'medium',
    });

    expect(task).toBeDefined();
    expect(task.id).toBeTruthy();
    expect(task.title).toBe('PostgreSQL Test Task');

    // Test task retrieval
    const retrievedTask = await store.getTask(task.id);
    expect(retrievedTask).toBeDefined();
    expect(retrievedTask?.title).toBe('PostgreSQL Test Task');

    // Test task listing
    const tasks = await store.listTasks();
    expect(tasks.some(t => t.id === task.id)).toBe(true);

    // Clean up
    await store.deleteTask(task.id);
  });

  it('should handle PostgreSQL-specific queries', async () => {
    // Test raw SQL query through pgLite compatibility layer
    const result = await store.pgLite.query('SELECT version()');
    expect(result.rows).toBeDefined();
    expect(result.rows[0]).toBeDefined();
    expect(result.rows[0].version).toMatch(/PostgreSQL/);
  });
}); 