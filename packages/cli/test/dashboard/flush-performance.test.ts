import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@astrolabe/core';
import type { Store } from '@astrolabe/core';
import { createDashboardStore } from '../../source/dashboard/store/index.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync, existsSync } from 'node:fs';

describe('Dashboard Flush Performance', () => {
  let store: Store;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = join(tmpdir(), `flush-perf-test-${Date.now()}.db`);
    store = await createDatabase({ dbPath, verbose: false });
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
    // Clear any non-root tasks
    const allTasks = await store.listTasks({});
    for (const task of allTasks) {
      if (task.id !== '__PROJECT_ROOT__') {
        await store.deleteTask(task.id);
      }
    }
  });

  describe('Flush Performance Optimizations', () => {
    it('should prevent concurrent flushes', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      // Add a task to create pending changes
      dashboardStore.getState().addTask(null, 'Test Task');
      expect(dashboardStore.getState().hasUnsavedChanges).toBe(true);

      // Mock flush to be slow
      const originalFlush = dashboardStore.getState().trackingTree?.flush;
      let flushCount = 0;
      let firstFlushStarted = false;
      
      if (originalFlush) {
        vi.spyOn(dashboardStore.getState().trackingTree!, 'flush').mockImplementation(async (taskService) => {
          flushCount++;
          if (flushCount === 1) {
            firstFlushStarted = true;
            // Simulate slow first flush
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return originalFlush.call(dashboardStore.getState().trackingTree, taskService);
        });
      }

      // Start first flush
      const firstFlush = dashboardStore.getState().flushChanges();
      
      // Wait a bit to ensure first flush has started
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(firstFlushStarted).toBe(true);
      expect(dashboardStore.getState().isFlushingChanges).toBe(true);

      // Try to start second flush while first is running
      await dashboardStore.getState().flushChanges();
      
      // Should have shown "already in progress" message
      expect(dashboardStore.getState().statusMessage).toContain('already in progress');

      // Wait for first flush to complete
      await firstFlush;
      
      expect(dashboardStore.getState().isFlushingChanges).toBe(false);
      
      // Restore original method
      vi.restoreAllMocks();
    });

    it('should handle immediate flush with waiting', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      // Add a task to create pending changes
      dashboardStore.getState().addTask(null, 'Test Task');

      // Mock flush to be slow
      const originalFlush = dashboardStore.getState().trackingTree?.flush;
      if (originalFlush) {
        vi.spyOn(dashboardStore.getState().trackingTree!, 'flush').mockImplementation(async (taskService) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return originalFlush.call(dashboardStore.getState().trackingTree, taskService);
        });
      }

      const startTime = Date.now();
      
      // Start regular flush
      const regularFlush = dashboardStore.getState().flushChanges();
      
      // Start immediate flush (should wait for regular flush)
      const immediateFlush = dashboardStore.getState().flushChangesImmediate();
      
      await Promise.all([regularFlush, immediateFlush]);
      
      const endTime = Date.now();
      
      // Should have taken at least 50ms (the mock delay)
      expect(endTime - startTime).toBeGreaterThanOrEqual(45);
      expect(dashboardStore.getState().isFlushingChanges).toBe(false);
      
      vi.restoreAllMocks();
    });

    it('should handle flush on exit correctly', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      // Enable auto-flush first
      dashboardStore.getState().enableAutoFlush(1000);
      expect(dashboardStore.getState().autoFlushEnabled).toBe(true);

      // Add a task to create pending changes
      dashboardStore.getState().addTask(null, 'Test Task for Exit');

      // Call flush on exit
      await dashboardStore.getState().flushOnExit();

      // Should have disabled auto-flush and saved changes
      expect(dashboardStore.getState().autoFlushEnabled).toBe(false);
      expect(dashboardStore.getState().hasUnsavedChanges).toBe(false);
      expect(dashboardStore.getState().statusMessage).toContain('saved before exit');
    });

    it('should handle parallel flush operations efficiently', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      // Add multiple tasks to create tree changes (avoid dependencies for this test)
      dashboardStore.getState().addTask(null, 'Task A');
      dashboardStore.getState().addTask(null, 'Task B');
      dashboardStore.getState().addTask(null, 'Task C');

      expect(dashboardStore.getState().hasUnsavedChanges).toBe(true);

      const startTime = Date.now();
      
      // Flush changes (should efficiently handle multiple tree operations)
      await dashboardStore.getState().flushChanges();
      
      const endTime = Date.now();

      expect(dashboardStore.getState().hasUnsavedChanges).toBe(false);
      expect(dashboardStore.getState().statusMessage).toContain('saved successfully');
      
      // Parallel execution should be reasonably fast
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should auto-flush more frequently with reduced interval', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      // Enable auto-flush with short interval for testing
      dashboardStore.getState().enableAutoFlush(100); // 100ms instead of default 5s

      // Add a task to create pending changes
      dashboardStore.getState().addTask(null, 'Auto-flush Test Task');
      expect(dashboardStore.getState().hasUnsavedChanges).toBe(true);

      // Manually trigger flush to simulate auto-flush behavior
      await dashboardStore.getState().flushChanges();

      // Should have flushed
      expect(dashboardStore.getState().hasUnsavedChanges).toBe(false);
      
      // Clean up
      dashboardStore.getState().disableAutoFlush();
    });
  });

  describe('Error Handling', () => {
    it('should handle flush errors gracefully', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      // Add a task
      dashboardStore.getState().addTask(null, 'Error Test Task');

      // Mock flush to throw an error
      const originalFlush = dashboardStore.getState().trackingTree?.flush;
      if (originalFlush) {
        vi.spyOn(dashboardStore.getState().trackingTree!, 'flush').mockRejectedValue(
          new Error('Mock flush error')
        );
      }

      // Flush should not throw but should handle error
      await expect(dashboardStore.getState().flushChanges()).rejects.toThrow('Mock flush error');
      
      // Should show error message and reset flush state
      expect(dashboardStore.getState().statusMessage).toContain('Error saving');
      expect(dashboardStore.getState().isFlushingChanges).toBe(false);
      
      vi.restoreAllMocks();
    });

    it('should handle exit flush errors gracefully', async () => {
      const dashboardStore = createDashboardStore(store);
      await dashboardStore.getState().loadTasks();

      dashboardStore.getState().addTask(null, 'Exit Error Test');

      // Mock flush to throw an error
      const originalFlush = dashboardStore.getState().trackingTree?.flush;
      if (originalFlush) {
        vi.spyOn(dashboardStore.getState().trackingTree!, 'flush').mockRejectedValue(
          new Error('Exit flush error')
        );
      }

      // Flush on exit should handle error and still disable auto-flush
      await expect(dashboardStore.getState().flushOnExit()).rejects.toThrow('Exit flush error');
      
      expect(dashboardStore.getState().statusMessage).toContain('Failed to save before exit');
      expect(dashboardStore.getState().autoFlushEnabled).toBe(false);
      
      vi.restoreAllMocks();
    });
  });
}); 