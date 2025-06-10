import { describe, it, expect, beforeEach } from 'vitest';
import { LRUCache, TaskTreeCache } from '../src/entities/TaskTreeCache.js';
import { TaskTree } from '../src/entities/TaskTree.js';
import type { Task } from '../src/schemas/task.js';

function createMockTask(id: string, title: string): Task {
  return {
    id,
    parentId: null,
    title,
    description: null,
    status: 'pending',
    priorityScore: 50,
    prd: null,
    contextDigest: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('LRUCache', () => {
  let cache: LRUCache<string, string>;

  beforeEach(() => {
    cache = new LRUCache({
      maxSize: 3,
      ttlMs: 1000,
      maxAge: 5000,
    });
  });

  it('stores and retrieves values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('evicts LRU items when at capacity', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    cache.set('key4', 'value4'); // Should evict key1
    
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('updates access order on get', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    
    // Access key1 to make it most recently used
    cache.get('key1');
    
    cache.set('key4', 'value4'); // Should evict key2 (not key1)
    
    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('respects TTL', async () => {
    const shortTtlCache = new LRUCache({
      maxSize: 10,
      ttlMs: 50, // 50ms TTL
      maxAge: 1000,
    });
    
    shortTtlCache.set('key1', 'value1');
    expect(shortTtlCache.get('key1')).toBe('value1');
    
    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(shortTtlCache.get('key1')).toBeUndefined();
  });

  it('tracks statistics correctly', () => {
    cache.set('key1', 'value1');
    
    cache.get('key1'); // hit
    cache.get('key2'); // miss
    cache.get('key1'); // hit
    
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.67, 2);
  });

  it('clears all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    
    cache.clear();
    
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });
});

describe('TaskTreeCache', () => {
  let cache: TaskTreeCache;
  let tree1: TaskTree;
  let tree2: TaskTree;

  beforeEach(() => {
    cache = new TaskTreeCache({ maxSize: 5, ttlMs: 1000, maxAge: 5000 });
    tree1 = TaskTree.fromTask(createMockTask('1', 'Task 1'));
    tree2 = TaskTree.fromTask(createMockTask('2', 'Task 2'));
  });

  describe('tree caching', () => {
    it('stores and retrieves trees', () => {
      cache.setTree('key1', tree1);
      const retrieved = cache.getTree('key1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('1');
      expect(retrieved?.title).toBe('Task 1');
    });

    it('automatically caches metadata when setting tree', () => {
      cache.setTree('key1', tree1);
      const metadata = cache.getMetadata('key1');
      
      expect(metadata).toBeDefined();
      expect(metadata?.depth).toBe(0);
      expect(metadata?.childrenCount).toBe(0);
      expect(metadata?.hasChildren).toBe(false);
    });
  });

  describe('bulk operations', () => {
    it('gets multiple trees efficiently', () => {
      cache.setTree('key1', tree1);
      cache.setTree('key2', tree2);
      
      const trees = cache.getTrees(['key1', 'key2', 'key3']);
      
      expect(trees.size).toBe(2);
      expect(trees.get('key1')?.id).toBe('1');
      expect(trees.get('key2')?.id).toBe('2');
      expect(trees.has('key3')).toBe(false);
    });

    it('sets multiple trees', () => {
      const treesMap = new Map([
        ['key1', tree1],
        ['key2', tree2],
      ]);
      
      cache.setTrees(treesMap);
      
      expect(cache.getTree('key1')?.id).toBe('1');
      expect(cache.getTree('key2')?.id).toBe('2');
    });
  });

  describe('cache invalidation', () => {
    it('invalidates single tree', () => {
      cache.setTree('key1', tree1);
      cache.setMetadata('key1', { depth: 0, descendantCount: 0, childrenCount: 0, status: 'pending', hasChildren: false });
      
      cache.invalidateTree('key1');
      
      expect(cache.getTree('key1')).toBeUndefined();
      expect(cache.getMetadata('key1')).toBeUndefined();
    });

    it('invalidates tree family', () => {
      cache.setTree('parent', tree1);
      cache.setTree('child', tree2);
      cache.setTree('unrelated', tree1);
      
      cache.invalidateTreeFamily('parent', [], ['child']);
      
      expect(cache.getTree('parent')).toBeUndefined();
      expect(cache.getTree('child')).toBeUndefined();
      expect(cache.getTree('unrelated')).toBeDefined(); // Should remain
    });
  });

  describe('cache key generation', () => {
    it('generates tree keys correctly', () => {
      expect(TaskTreeCache.generateTreeKey('123')).toBe('tree:123');
      expect(TaskTreeCache.generateTreeKey('123', 5)).toBe('tree:123:5');
    });

    it('generates query keys correctly', () => {
      const key = TaskTreeCache.generateQueryKey('findTasks', { status: 'done', priorityScore: 80 });
      expect(key).toMatch(/^query:findTasks:/);
      expect(key).toContain('priorityScore:80');
      expect(key).toContain('status:"done"');
    });

    it('generates metadata keys correctly', () => {
      expect(TaskTreeCache.generateMetadataKey('123')).toBe('meta:123');
    });
  });

  describe('cache statistics', () => {
    it('provides comprehensive statistics', () => {
      cache.setTree('key1', tree1);
      cache.getTree('key1'); // hit
      cache.getTree('key2'); // miss
      
      const stats = cache.getStats();
      
      expect(stats.trees).toBeDefined();
      expect(stats.metadata).toBeDefined();
      expect(stats.queries).toBeDefined();
      
      expect(stats.trees.hits).toBe(1);
      expect(stats.trees.misses).toBe(1);
    });
  });
});
