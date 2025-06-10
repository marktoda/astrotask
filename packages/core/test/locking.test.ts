import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { DatabaseLock, DatabaseLockError, withDatabaseLock, createLockedDatabase, createDatabase, LockingStore } from '../src/database/index.js';

describe('Cooperative Database Locking', () => {
  const testDbDir = join(tmpdir(), 'astrotask-locking-test');
  const testDbPath = join(testDbDir, 'test.db');

  beforeEach(() => {
    // Clean up any existing test database directory
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

  describe('DatabaseLock Basic Functionality', () => {
    it('should acquire and release lock successfully', async () => {
      const lock = new DatabaseLock(testDbPath, {
        processType: 'test',
        maxRetries: 10,
        retryDelay: 50
      });

      // Initially should not be locked
      const initialStatus = await lock.isLocked();
      expect(initialStatus.locked).toBe(false);

      // Acquire lock
      await lock.acquire();
      const lockInfo = lock.getLockInfo();
      expect(lockInfo).toBeDefined();
      expect(lockInfo?.process).toBe('test');
      expect(lockInfo?.pid).toBe(process.pid);

      // Should now be locked
      const lockedStatus = await lock.isLocked();
      expect(lockedStatus.locked).toBe(true);
      expect(lockedStatus.info?.process).toBe('test');

      // Release lock
      await lock.release();
      expect(lock.getLockInfo()).toBeNull();

      // Should no longer be locked
      const releasedStatus = await lock.isLocked();
      expect(releasedStatus.locked).toBe(false);
    });

    it('should handle concurrent lock attempts with retries', async () => {
      const lock1 = new DatabaseLock(testDbPath, {
        processType: 'test-1',
        maxRetries: 5,
        retryDelay: 100
      });

      const lock2 = new DatabaseLock(testDbPath, {
        processType: 'test-2',
        maxRetries: 5,
        retryDelay: 100
      });

      // Lock 1 acquires lock
      await lock1.acquire();

      // Lock 2 should fail to acquire lock within timeout
      await expect(lock2.acquire()).rejects.toThrow(DatabaseLockError);

      // Release lock 1
      await lock1.release();

      // Now lock 2 should be able to acquire
      await lock2.acquire();
      expect(lock2.getLockInfo()).toBeDefined();

      await lock2.release();
    });

    it('should detect and remove stale locks', async () => {
      const lock1 = new DatabaseLock(testDbPath, {
        processType: 'test-1',
        staleTimeout: 100 // Very short timeout for testing
      });

      const lock2 = new DatabaseLock(testDbPath, {
        processType: 'test-2',
        staleTimeout: 100,
        maxRetries: 10,
        retryDelay: 50
      });

      // Acquire lock 1
      await lock1.acquire();

      // Wait for lock to become stale
      await new Promise(resolve => setTimeout(resolve, 150));

      // Lock 2 should detect stale lock and acquire successfully
      await lock2.acquire();
      expect(lock2.getLockInfo()?.process).toBe('test-2');

      await lock2.release();
    });

    it('should handle corrupted lock files gracefully', async () => {
      const { writeFile } = await import('fs/promises');
      const { dirname } = await import('path');
      const { mkdirSync } = await import('fs');

      // Create directory if it doesn't exist
      mkdirSync(dirname(testDbPath), { recursive: true });

      // Create a corrupted lock file
      const lockPath = join(dirname(testDbPath), '.astrotask.lock');
      await writeFile(lockPath, 'invalid json content');

      const lock = new DatabaseLock(testDbPath, {
        processType: 'test',
        maxRetries: 5,
        retryDelay: 50
      });

      // Should handle corrupted file and acquire lock
      await lock.acquire();
      expect(lock.getLockInfo()).toBeDefined();

      await lock.release();
    });

    it('should provide proper force unlock functionality', async () => {
      const lock = new DatabaseLock(testDbPath, {
        processType: 'test'
      });

      await lock.acquire();
      expect(lock.getLockInfo()).toBeDefined();

      // Force unlock should work even with active lock
      await lock.forceUnlock();

      // Should be able to acquire again
      await lock.acquire();
      expect(lock.getLockInfo()).toBeDefined();

      await lock.release();
    });
  });

  describe('withDatabaseLock Utility', () => {
    it('should automatically acquire and release lock around operation', async () => {
      let operationExecuted = false;

      await withDatabaseLock(
        testDbPath,
        { processType: 'test' },
        async () => {
          operationExecuted = true;
          return 'success';
        }
      );

      expect(operationExecuted).toBe(true);

      // Lock should be released after operation
      const lock = new DatabaseLock(testDbPath);
      const status = await lock.isLocked();
      expect(status.locked).toBe(false);
    });

    it('should release lock even if operation throws', async () => {
      await expect(
        withDatabaseLock(
          testDbPath,
          { processType: 'test' },
          async () => {
            throw new Error('Operation failed');
          }
        )
      ).rejects.toThrow('Operation failed');

      // Lock should still be released
      const lock = new DatabaseLock(testDbPath);
      const status = await lock.isLocked();
      expect(status.locked).toBe(false);
    });
  });

  describe('Database Store Locking Integration', () => {
    it('should create locked database store successfully', async () => {
      const store = await createLockedDatabase(testDbPath, {
        processType: 'test-store',
        maxRetries: 10,
        retryDelay: 50
      });

      expect(store).toBeDefined();
      // Cast to LockingStore to access locking-specific methods
      expect(typeof (store as LockingStore).isLocked).toBe('function');

      // Should be able to perform operations
      const tasks = await store.listTasks();
      expect(tasks).toBeDefined();

      await store.close();
    });

    it('should handle database operations with locking', async () => {
      const store = await createLockedDatabase(testDbPath, {
        processType: 'test-store',
        maxRetries: 20,
        retryDelay: 100
      });

      // Should be able to add and retrieve tasks
      const task = await store.addTask({
        title: 'Test Task with Locking',
        description: 'Test task',
        status: 'pending',
        priorityScore: 50
      });

      expect(task.title).toBe('Test Task with Locking');

      const retrievedTask = await store.getTask(task.id);
      expect(retrievedTask?.title).toBe('Test Task with Locking');

      await store.close();
    });

    it('should provide user-friendly error messages for lock conflicts', async () => {
      // Create a lock that will hold for a short time
      const lock = new DatabaseLock(testDbPath, {
        processType: 'long-running-process',
        maxRetries: 10,
        retryDelay: 100
      });

      // Acquire lock directly
      await lock.acquire();

      try {
        // Try to create a store that should fail quickly
        const store = await createLockedDatabase(testDbPath, {
          processType: 'quick-process',
          maxRetries: 2, // Very quick failure
          retryDelay: 50
        });

        // This should fail with user-friendly error
        let caughtError: Error | null = null;
        try {
          await store.listTasks();
        } catch (error) {
          caughtError = error as Error;
        }
        
        // We expect the error to be caught
        expect(caughtError).toBeTruthy();
        if (caughtError) {
          expect(caughtError.message).toMatch(/Database is currently in use by/);
          expect(caughtError.message).toMatch(/long-running-process/);
        }
        
        await store.close();
      } catch (storeCreationError) {
        // If the error happens during store creation, that's also valid
        const error = storeCreationError as Error;
        expect(error.message).toMatch(/Database is currently in use by/);
        expect(error.message).toMatch(/long-running-process/);
      } finally {
        // Always release the lock
        await lock.release();
      }
    });
  });

  describe('Process Type Identification', () => {
    it('should identify different process types correctly', async () => {
      const cliStore = await createDatabase({
        dataDir: testDbPath,
        enableLocking: true,
        lockOptions: {
          processType: 'cli'
        }
      });

      // Add task from CLI process type
      const cliTask = await cliStore.addTask({
        title: 'CLI Task',
        description: 'From CLI',
        status: 'pending',
        priorityScore: 50
      });

      expect(cliTask.title).toBe('CLI Task');
      await cliStore.close();

      // Now test MCP process type (after CLI is closed)
      const mcpStore = await createDatabase({
        dataDir: testDbPath,
        enableLocking: true,
        lockOptions: {
          processType: 'mcp-server'
        }
      });

      const mcpTask = await mcpStore.addTask({
        title: 'MCP Task',
        description: 'From MCP Server',
        status: 'pending',
        priorityScore: 50
      });

      expect(mcpTask.title).toBe('MCP Task');
      await mcpStore.close();
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should recover from process crashes leaving stale locks', async () => {
      const { writeFile } = await import('fs/promises');
      const { dirname } = await import('path');
      const { mkdirSync } = await import('fs');

      // Create directory if it doesn't exist
      mkdirSync(dirname(testDbPath), { recursive: true });

      // Simulate a crashed process by creating a stale lock
      const staleLockData = {
        pid: 99999, // Non-existent PID
        timestamp: Date.now() - 60000, // 1 minute old
        host: 'test-host',
        process: 'crashed-process'
      };

      const lockPath = join(dirname(testDbPath), '.astrotask.lock');
      await writeFile(lockPath, JSON.stringify(staleLockData, null, 2));

      // New process should detect and remove stale lock
      const store = await createLockedDatabase(testDbPath, {
        processType: 'recovery-test',
        staleTimeout: 30000, // 30 seconds
        maxRetries: 10,
        retryDelay: 50
      });

      // Should successfully create tasks despite stale lock
      const task = await store.addTask({
        title: 'Recovery Task',
        description: 'Created after lock recovery',
        status: 'pending',
        priorityScore: 50
      });

      expect(task.title).toBe('Recovery Task');

      await store.close();
    });

    it('should handle multiple sequential lock operations', async () => {
      const numOperations = 3;
      const taskTitles: string[] = [];

      // Perform multiple operations sequentially
      for (let i = 0; i < numOperations; i++) {
        const store = await createLockedDatabase(testDbPath, {
          processType: `sequential-test-${i}`,
          maxRetries: 20,
          retryDelay: 50
        });

        const taskTitle = `Sequential Task ${i}`;
        taskTitles.push(taskTitle);
        
        const task = await store.addTask({
          title: taskTitle,
          description: `Task from sequential test ${i}`,
          status: 'pending',
          priorityScore: 50
        });

        expect(task.title).toBe(taskTitle);
        await store.close();
      }

      // Verify all tasks exist
      const finalStore = await createLockedDatabase(testDbPath, {
        processType: 'verification',
        maxRetries: 20,
        retryDelay: 50
      });

      const allTasks = await finalStore.listTasks();
      expect(allTasks.length).toBeGreaterThanOrEqual(numOperations);
      
      await finalStore.close();
    });
  });
}); 
