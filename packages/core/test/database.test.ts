import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { createDatabase, createLocalDatabase } from '../src/database/index';
import { TASK_IDENTIFIERS } from '../src/entities/TaskTreeConstants';
import { cfg } from '../src/utils/config';

describe('Database Configuration', () => {
  const testDbDir = join(tmpdir(), 'astrotask-test');
  const testDbPath = join(testDbDir, 'test.db');

  beforeEach(() => {
    // Clean up any existing test database directory (PGLite uses directories)
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test database directory after each test
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('Database Initialization', () => {
    it('should create and initialize database without sync', async () => {
      const store = await createLocalDatabase(testDbPath);

      expect(store).toBeDefined();
      expect(store.rawClient).toBeDefined();
      expect(store.sql).toBeDefined();
      expect(store.isEncrypted).toBe(false);
      expect(typeof store.close).toBe('function');

      // Test basic database operation
      const result = await store.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await store.close();
    });

    it('should create database with custom options', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      expect(store).toBeDefined();

      await store.close();
    });

    it('should create database with encryption disabled', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      expect(store).toBeDefined();

      await store.close();
    });

    it('should create database with local-only configuration', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      expect(store).toBeDefined();

      await store.close();
    });

    it('should create database with local configuration', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      expect(store).toBeDefined();

      await store.close();
    });

    it('should handle database directory creation', async () => {
      const nestedTestDbPath = join(testDbDir, 'nested', 'deep', 'test.db');

      const store = await createLocalDatabase(nestedTestDbPath);

      expect(store).toBeDefined();

      await store.close();

      // Clean up nested directories
      rmSync(join(testDbDir, 'nested'), { recursive: true, force: true });
    });
  });

  describe('Simplified Database API', () => {
    it('should create database store with all features', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      expect(store).toBeDefined();
      expect(store.rawClient).toBeDefined();
      expect(store.sql).toBeDefined();
      expect(store.isEncrypted).toBe(false);
      expect(typeof store.close).toBe('function');

      // Test basic database operation
      const result = await store.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await store.close();
    });

    it('should auto-migrate on database creation', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      // Verify tables were created by migration
      // Use a simple query that works across all database types
      await expect(store.query('SELECT COUNT(*) FROM tasks')).resolves.toBeDefined();
      await expect(store.query('SELECT COUNT(*) FROM context_slices')).resolves.toBeDefined();
      await expect(store.query('SELECT COUNT(*) FROM task_dependencies')).resolves.toBeDefined();

      await store.close();
    });

    it('should provide business methods for tasks', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      // Test task business methods
      const tasks = await store.listTasks();
      expect(tasks).toEqual([]);

      const newTask = await store.addTask({
        title: 'Test Task',
        description: 'A test task',
        status: 'pending',
        priorityScore: 50,
      });

      expect(newTask).toBeDefined();
      expect(newTask.title).toBe('Test Task');
      expect(newTask.priorityScore).toBe(50);

      const foundTask = await store.getTask(newTask.id);
      expect(foundTask).toBeDefined();
      expect(foundTask?.id).toBe(newTask.id);
      expect(foundTask?.title).toBe(newTask.title);
      expect(foundTask?.description).toBe(newTask.description);
      expect(foundTask?.status).toBe(newTask.status);
      expect(foundTask?.priorityScore).toBe(newTask.priorityScore);

      // Test status update
      const updatedTask = await store.updateTaskStatus(newTask.id, 'done');
      expect(updatedTask?.status).toBe('done');

      // Test filtering by status
      const doneTasks = await store.listTasksByStatus('done');
      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].status).toBe('done');

      // Test root tasks filtering
      const rootTasks = await store.listRootTasks();
      expect(rootTasks).toHaveLength(1);
      expect(rootTasks[0].parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);

      // Test delete
      const deleted = await store.deleteTask(newTask.id);
      expect(deleted).toBe(true);

      const deletedTask = await store.getTask(newTask.id);
      expect(deletedTask).toBeNull();

      await store.close();
    });

    it('should provide business methods for task hierarchy', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      // Create a parent task
      const parentTask = await store.addTask({
        title: 'Parent Task',
        description: 'A parent task',
        status: 'pending',
        priorityScore: 80,
      });

      // Create a subtask
      const subtask = await store.addTask({
        parentId: parentTask.id,
        title: 'Subtask 1',
        description: 'A subtask',
        status: 'pending',
        priorityScore: 50,
      });

      expect(subtask.parentId).toBe(parentTask.id);

      // Test subtask filtering
      const subtasks = await store.listSubtasks(parentTask.id);
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].id).toBe(subtask.id);

      // Test that root tasks don't include subtasks
      const rootTasks = await store.listRootTasks();
      expect(rootTasks).toHaveLength(1);
      expect(rootTasks[0].id).toBe(parentTask.id);

      await store.close();
    });

    it('should provide context slice methods', async () => {
      const store = await createDatabase({
        dataDir: testDbPath,
        verbose: false,
      });

      // Create a task first
      const task = await store.addTask({
        title: 'Task with Context',
        description: 'A task that will have context',
        status: 'pending',
        priorityScore: 50,
      });

      // Add a context slice
      const contextSlice = await store.addContextSlice({
        title: 'Context 1',
        description: 'Some context',
        contextType: 'general',
        taskId: task.id,
      });

      expect(contextSlice).toBeDefined();
      expect(contextSlice.title).toBe('Context 1');
      expect(contextSlice.taskId).toBe(task.id);

      // List context slices
      const slices = await store.listContextSlices(task.id);
      expect(slices).toHaveLength(1);
      expect(slices[0].id).toBe(contextSlice.id);

      await store.close();
    });
  });

  describe('Factory Functions', () => {
    it('should create local database with createLocalDatabase', async () => {
      const store = await createLocalDatabase(testDbPath);
      
      expect(store).toBeDefined();
      
      await store.close();
    });


  });

  describe('Database Configuration Constants', () => {
    it('should have correct default configuration', () => {
      // DATABASE_URI is now dynamically determined based on git root
      expect(typeof cfg.DATABASE_URI).toBe('string');
      expect(cfg.DATABASE_URI).toBeTruthy();
      expect(cfg.DATABASE_URI).toMatch(/astrotask\.db$/);
      expect(cfg.DB_VERBOSE).toBe(false);
      expect(cfg.DB_TIMEOUT).toBe(5000);
    });
  });
});
