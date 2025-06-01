import { describe, it, expect, vi } from 'vitest';
import { createDatabase, createLocalDatabase, createSyncedDatabase } from '../src/database/index.js';

describe('Electric SQL Sync', () => {
  // Use .sequential to run tests one by one to avoid conflicts
  describe.sequential('Database creation', () => {
    it('should create a local database without sync', async () => {
      const store = await createLocalDatabase('memory://test1');
      
      expect(store).toBeDefined();
      expect(store.electricSyncActive).toBe(false);
      expect(store.shapes).toBeUndefined();
      expect(store.multiTableSync).toBeUndefined();
      
      await store.close();
    });

    it('should create a database with sync disabled when no Electric URL', async () => {
      const store = await createDatabase({
        dataDir: 'memory://test2',
        enableSync: true,
        electricUrl: undefined,
      });
      
      expect(store).toBeDefined();
      expect(store.electricSyncActive).toBe(false);
      
      await store.close();
    });

    it('should create a database with Electric sync configuration', async () => {
      const store = await createDatabase({
        dataDir: 'memory://test3',
        enableSync: true,
        electricUrl: 'http://localhost:3000',
        // Disable verbose logging for tests
        verbose: false,
      });
      
      expect(store).toBeDefined();
      // The store is created successfully regardless of whether Electric is reachable
      // This ensures offline-first functionality
      
      await store.close();
    });

    it('should stop sync when store is closed', async () => {
      const store = await createLocalDatabase('memory://test4');
      
      // Mock sync objects
      const mockShape = {
        isUpToDate: true,
        shapeId: 'test',
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      };
      
      const mockMultiSync = {
        isUpToDate: true,
        unsubscribe: vi.fn(),
      };
      
      store.shapes = { test: mockShape };
      store.multiTableSync = mockMultiSync;
      store.electricSyncActive = true;
      
      await store.close();
      
      expect(mockShape.unsubscribe).toHaveBeenCalled();
      expect(mockMultiSync.unsubscribe).toHaveBeenCalled();
      expect(store.electricSyncActive).toBe(false);
    });

    it('should fallback to local database when Electric URL is not provided', async () => {
      const store = await createSyncedDatabase('memory://test5', '');
      
      expect(store).toBeDefined();
      expect(store.electricSyncActive).toBe(false);
      // It should create a local-only database
      
      await store.close();
    });

    it('should accept custom sync table configuration', async () => {
      const store = await createDatabase({
        dataDir: 'memory://test6',
        enableSync: false,
        syncTables: ['tasks'],
      });
      
      expect(store).toBeDefined();
      expect(store.electricSyncActive).toBe(false);
      
      await store.close();
    });
  });
}); 