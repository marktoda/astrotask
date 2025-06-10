import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/database/index.js';
import type { Store } from '../src/database/store.js';
import { existsSync } from 'fs';

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
      priorityScore: 50,
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

  it('should not create directories when using PostgreSQL URLs with explicit locking', async () => {
    // This test ensures the bug fix for XRBK is working
    const testPostgresUrl = 'postgres://test:password@127.0.0.1:5432/testdb';
    
    // Record current directory state
    const beforeDirectories = new Set();
    try {
      const fs = await import('fs');
      const files = fs.readdirSync('.');
      files.forEach(file => {
        if (fs.statSync(file).isDirectory()) {
          beforeDirectories.add(file);
        }
      });
    } catch (error) {
      // Ignore errors in directory listing
    }

    // Try to create database with explicit locking enabled
    // This should NOT create any postgres: directories
    try {
      const testStore = await createDatabase({
        dataDir: testPostgresUrl,
        enableLocking: true, // This was the problematic case
        verbose: false,
      });
      await testStore.close();
    } catch (error) {
      // Connection failure is expected if postgres isn't running
      // We only care that no directories were created
    }

    // Verify no postgres: directories were created
    expect(existsSync('postgres:')).toBe(false);
    expect(existsSync('postgres:/')).toBe(false);
    expect(existsSync('postgres://test:password@127.0.0.1:5432')).toBe(false);
    
    // Check that no new directories starting with 'postgres' were created
    try {
      const fs = await import('fs');
      const files = fs.readdirSync('.');
      const newDirectories = files.filter(file => {
        return fs.statSync(file).isDirectory() && 
               !beforeDirectories.has(file) && 
               file.startsWith('postgres');
      });
      expect(newDirectories).toHaveLength(0);
    } catch (error) {
      // Ignore errors in directory listing
    }
  });
}); 