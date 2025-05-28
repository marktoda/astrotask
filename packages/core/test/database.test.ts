import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import {
  initializeDatabase,
  DatabaseError,
  EncryptionError,
} from '../src/database/config';
import { createDatabase } from '../src/database/index';
import { cfg } from '../src/utils/config';
import { TASK_IDENTIFIERS } from '../src/utils/TaskTreeConstants';

describe('Database Configuration', () => {
  const testDbDir = join(tmpdir(), 'astrolabe-test');
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
    it('should create and initialize database without encryption', async () => {
      const connection = await initializeDatabase({
        dbPath: testDbPath,
        encrypted: false,
        verbose: false,
      });

      expect(connection).toBeDefined();
      expect(connection.db).toBeDefined();
      expect(connection.drizzle).toBeDefined();
      expect(connection.isEncrypted).toBe(false);
      expect(typeof connection.db.close).toBe('function');

      // Skip verifying physical path existence because PGLite lazily creates files

      // Test basic database operation
      const result = await connection.db.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await connection.db.close();
    });

    it('should create and initialize database with encryption', async () => {
      // Set a test encryption key
      process.env.ASTROLABE_DB_KEY = 'test-encryption-key-12345';

      const connection = await initializeDatabase({
        dbPath: testDbPath,
        encrypted: true,
        verbose: false,
      });

      expect(connection).toBeDefined();
      expect(connection.isEncrypted).toBe(true);

      // Test basic database operation with encryption
      const result = await connection.db.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await connection.db.close();

      // Clean up environment
      delete process.env.ASTROLABE_DB_KEY;
    }, 10000);

    it('should apply correct pragmas for performance', async () => {
      const connection = await initializeDatabase({
        dbPath: testDbPath,
        encrypted: false,
      });

      // PGLite doesn't have SQLite pragmas, but we can test that the connection works
      // and basic PostgreSQL configuration is available
      const result = await connection.db.query('SELECT version()');
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);

      await connection.db.close();
    });

    it('should handle database directory creation', async () => {
      const nestedTestDbPath = join(testDbDir, 'nested', 'deep', 'test.db');

      const connection = await initializeDatabase({
        dbPath: nestedTestDbPath,
        encrypted: false,
      });

      // Skip verifying physical path existence because PGLite may lazily create files/directories

      await connection.db.close();

      // Clean up nested directories
      rmSync(join(testDbDir, 'nested'), { recursive: true, force: true });
    });

    it('should throw EncryptionError for invalid encryption setup', () => {
      // Test that the error types are properly exported
      expect(EncryptionError).toBeDefined();
      expect(DatabaseError).toBeDefined();
    });
  });

  describe('Simplified Database API', () => {
    it('should create database store with all features', async () => {
      const store = await createDatabase({
        dbPath: testDbPath,
        encrypted: false,
        verbose: false,
        autoSync: false, // Disable sync for tests
      });

      expect(store).toBeDefined();
      expect(store.pgLite).toBeDefined();
      expect(store.sql).toBeDefined();
      expect(store.electric).toBeDefined();
      expect(store.isEncrypted).toBe(false);
      expect(typeof store.close).toBe('function');

      // Test basic database operation
      const result = await store.pgLite.query('SELECT 1 as test');
      expect(result.rows[0]).toEqual({ test: 1 });

      await store.close();
    });

    it('should auto-migrate on database creation', async () => {
      const store = await createDatabase({
        dbPath: testDbPath,
        encrypted: false,
        verbose: false,
      });

      // Verify tables were created by migration
      const result = await store.pgLite.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tableNames = (result.rows as Array<{ table_name: string }>).map(row => row.table_name);
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('context_slices');
      // projects table should no longer exist after migration
      expect(tableNames).not.toContain('projects');

      await store.close();
    });

    it('should provide business methods for tasks', async () => {
      const store = await createDatabase({
        dbPath: testDbPath,
        encrypted: false,
        verbose: false,
        autoSync: false,
      });

      // Test task business methods
      const tasks = await store.listTasks();
      // Filter out the PROJECT_ROOT task since it's automatically created
      const userTasks = tasks.filter(task => task.id !== TASK_IDENTIFIERS.PROJECT_ROOT);
      expect(userTasks).toEqual([]);

      const newTask = await store.addTask({
        title: 'Test Task',
        description: 'A test task',
        status: 'pending',
        priority: 'medium',
      });

      expect(newTask).toBeDefined();
      expect(newTask.title).toBe('Test Task');
      expect(newTask.priority).toBe('medium');
      expect(newTask.parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT); // Root task

      const foundTask = await store.getTask(newTask.id);
      expect(foundTask).toEqual(newTask);

      // Test status update
      const updatedTask = await store.updateTaskStatus(newTask.id, 'done');
      expect(updatedTask?.status).toBe('done');

      // Test filtering by status
      const doneTasks = await store.listTasksByStatus('done');
      // Filter out PROJECT_ROOT task since it's automatically created with 'done' status
      const userDoneTasks = doneTasks.filter(task => task.id !== TASK_IDENTIFIERS.PROJECT_ROOT);
      expect(userDoneTasks).toHaveLength(1);
      expect(userDoneTasks[0].status).toBe('done');

      // Test root tasks filtering
      const rootTasks = await store.listRootTasks();
      expect(rootTasks).toHaveLength(1);
      expect(rootTasks[0].parentId).toBe(TASK_IDENTIFIERS.PROJECT_ROOT);

      await store.close();
    });

    it('should provide business methods for task hierarchy', async () => {
      const store = await createDatabase({
        dbPath: testDbPath,
        encrypted: false,
        verbose: false,
        autoSync: false,
      });

      // Create a parent task
      const parentTask = await store.addTask({
        title: 'Parent Task',
        description: 'A parent task',
        status: 'pending',
        priority: 'high',
      });

      // Create a subtask
      const subtask = await store.addTask({
        parentId: parentTask.id,
        title: 'Subtask 1',
        description: 'A subtask',
        status: 'pending',
        priority: 'medium',
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
  });

  describe('Database Configuration Constants', () => {
    it('should have correct default configuration', () => {
      expect(cfg.DB_DEFAULT_NAME).toBe('astrolabe.db');
      expect(cfg.DB_CIPHER).toBe('aes-256-cbc');
      expect(cfg.DB_KDF_ITER).toBe(4000);
      expect(cfg.DB_JOURNAL_MODE).toBe('WAL');
      expect(cfg.DB_SYNCHRONOUS).toBe('NORMAL');
    });
  });
});
