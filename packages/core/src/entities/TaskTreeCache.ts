import type { Task } from '../schemas/task.js';
import type { TaskTree } from './TaskTree.js';
import { CACHE_CONFIG } from './TaskTreeConstants.js';

/**
 * TaskTreeCache - LRU cache for TaskTree instances and computed properties
 *
 * Provides caching for:
 * - TaskTree instances to avoid repeated database queries
 * - Computed tree properties (depth, descendant count, etc.)
 * - Tree operation results
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheOptions {
  maxSize: number;
  ttlMs: number;
  maxAge: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

/**
 * Generic LRU cache with TTL support
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(private options: CacheOptions) {}

  /**
   * Retrieves a value from the cache with LRU and TTL validation
   *
   * @param key - The cache key to retrieve
   * @returns The cached value if found and valid, undefined otherwise
   *
   * @complexity O(1) average case for HashMap lookup, O(n) worst case for access order update
   *
   * @sideEffects
   * - Updates access statistics (hits/misses)
   * - Updates LRU order for accessed entries
   * - Removes expired entries automatically
   * - Modifies entry access metadata (count, timestamp)
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.options.ttlMs) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = now;
    this.updateAccessOrder(key);
    this.stats.hits++;

    return entry.value;
  }

  set(key: K, value: V): void {
    const now = Date.now();
    const entry: CacheEntry<V> = {
      value,
      timestamp: now,
      accessCount: 1,
      lastAccessed: now,
    };

    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict if at capacity
    if (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.accessOrder.push(key);
  }

  delete(key: K): boolean {
    const removed = this.cache.delete(key);
    if (removed) {
      this.accessOrder = this.accessOrder.filter((k) => k !== key);
    }
    return removed;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.options.ttlMs) {
      this.delete(key);
      return false;
    }

    return true;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
    };
  }

  private updateAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }

  /**
   * Evicts the least recently used entry from the cache
   *
   * Uses the access order array to identify the LRU entry and removes it
   * from both the cache map and access tracking array.
   *
   * @complexity O(1) - removes from beginning of access order array
   *
   * @sideEffects
   * - Removes one entry from cache and access order tracking
   * - Increments eviction statistics counter
   * - May trigger garbage collection for evicted objects
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder.shift();
    if (lruKey !== undefined) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
    }
  }
}

/**
 * Specialized cache for TaskTree operations
 */
export class TaskTreeCache {
  private treeCache: LRUCache<string, TaskTree>;
  private metadataCache: LRUCache<string, TaskTreeMetadata>;
  private queryCache: LRUCache<string, Task[]>;

  constructor(options: Partial<CacheOptions> = {}) {
    const cacheOptions: CacheOptions = {
      maxSize: CACHE_CONFIG.DEFAULT_MAX_SIZE,
      ttlMs: CACHE_CONFIG.DEFAULT_TTL_MS,
      maxAge: CACHE_CONFIG.DEFAULT_MAX_AGE_MS,
      ...options,
    };

    this.treeCache = new LRUCache(cacheOptions);
    this.metadataCache = new LRUCache({
      ...cacheOptions,
      maxSize: cacheOptions.maxSize * CACHE_CONFIG.METADATA_CACHE_SIZE_MULTIPLIER,
    });
    this.queryCache = new LRUCache({
      ...cacheOptions,
      maxSize: Math.floor(cacheOptions.maxSize / CACHE_CONFIG.QUERY_CACHE_SIZE_DIVISOR),
    });
  }

  // Tree instance caching
  getTree(key: string): TaskTree | undefined {
    return this.treeCache.get(key);
  }

  setTree(key: string, tree: TaskTree): void {
    this.treeCache.set(key, tree);

    // Cache metadata
    this.setMetadata(key, {
      depth: tree.getDepth(),
      descendantCount: tree.getDescendantCount(),
      childrenCount: tree.getChildren().length,
      status: tree.status,
      hasChildren: tree.getChildren().length > 0,
    });
  }

  // Metadata caching
  getMetadata(key: string): TaskTreeMetadata | undefined {
    return this.metadataCache.get(key);
  }

  setMetadata(key: string, metadata: TaskTreeMetadata): void {
    this.metadataCache.set(key, metadata);
  }

  // Query result caching
  getQueryResult(queryKey: string): Task[] | undefined {
    return this.queryCache.get(queryKey);
  }

  setQueryResult(queryKey: string, results: Task[]): void {
    this.queryCache.set(queryKey, results);
  }

  // Cache invalidation
  invalidateTree(taskId: string): void {
    // Remove the specific tree
    this.treeCache.delete(taskId);
    this.metadataCache.delete(taskId);

    // Invalidate any cached queries that might include this task
    this.queryCache.clear(); // Simple approach - clear all queries
  }

  invalidateTreeFamily(taskId: string, ancestors: string[], descendants: string[]): void {
    // Invalidate the task and all related tasks
    const allRelated = [taskId, ...ancestors, ...descendants];

    for (const id of allRelated) {
      this.treeCache.delete(id);
      this.metadataCache.delete(id);
    }

    // Clear query cache as relationships may have changed
    this.queryCache.clear();
  }

  // Bulk operations
  getTrees(keys: string[]): Map<string, TaskTree> {
    const results = new Map<string, TaskTree>();

    for (const key of keys) {
      const tree = this.getTree(key);
      if (tree) {
        results.set(key, tree);
      }
    }

    return results;
  }

  setTrees(trees: Map<string, TaskTree>): void {
    for (const [key, tree] of trees) {
      this.setTree(key, tree);
    }
  }

  // Cache management
  clear(): void {
    this.treeCache.clear();
    this.metadataCache.clear();
    this.queryCache.clear();
  }

  getStats(): TaskTreeCacheStats {
    return {
      trees: this.treeCache.getStats(),
      metadata: this.metadataCache.getStats(),
      queries: this.queryCache.getStats(),
    };
  }

  // Utility methods for cache key generation
  static generateTreeKey(taskId: string, maxDepth?: number): string {
    return maxDepth !== undefined ? `tree:${taskId}:${maxDepth}` : `tree:${taskId}`;
  }

  static generateQueryKey(operation: string, params: Record<string, unknown>): string {
    // Create a stable key from sorted parameters
    const paramEntries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    const paramString = paramEntries
      .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
      .join('|');
    return `query:${operation}:${paramString}`;
  }

  static generateMetadataKey(taskId: string): string {
    return `meta:${taskId}`;
  }
}

export interface TaskTreeMetadata {
  depth: number;
  descendantCount: number;
  childrenCount: number;
  status: string;
  hasChildren: boolean;
}

export interface TaskTreeCacheStats {
  trees: CacheStats;
  metadata: CacheStats;
  queries: CacheStats;
}

/**
 * Cache-aware TaskTree operations mixin
 */
export class CachedTaskTreeOperations {
  constructor(private cache: TaskTreeCache) {}

  /**
   * Retrieves a TaskTree from cache or builds it using the provided builder function
   *
   * Implements the cache-aside pattern with intelligent cache key generation
   * based on task ID and optional depth limit. Falls back to the builder
   * function if cache miss occurs.
   *
   * @param taskId - The root task ID for the tree
   * @param maxDepth - Optional depth limit for tree traversal
   * @param builder - Async function to build the tree if not cached
   * @returns Promise resolving to TaskTree or null if not found
   *
   * @complexity O(1) for cache hit, O(n*m) for cache miss where n=tree nodes, m=avg depth
   *
   * @sideEffects
   * - Updates cache with newly built trees
   * - Triggers metadata extraction and caching for new trees
   * - May cause cache eviction if at capacity
   */
  async getOrBuildTree(
    taskId: string,
    maxDepth: number | undefined,
    builder: () => Promise<TaskTree | null>
  ): Promise<TaskTree | null> {
    const cacheKey = TaskTreeCache.generateTreeKey(taskId, maxDepth);

    // Try cache first
    const cached = this.cache.getTree(cacheKey);
    if (cached) {
      return cached;
    }

    // Build and cache
    const tree = await builder();
    if (tree) {
      this.cache.setTree(cacheKey, tree);
    }

    return tree;
  }

  // Cached query operations
  async getOrExecuteQuery(queryKey: string, executor: () => Promise<Task[]>): Promise<Task[]> {
    // Try cache first
    const cached = this.cache.getQueryResult(queryKey);
    if (cached) {
      return cached;
    }

    // Execute and cache
    const results = await executor();
    this.cache.setQueryResult(queryKey, results);

    return results;
  }

  // Cache invalidation helpers
  invalidateTaskAndRelated(taskId: string, relatedIds: string[] = []): void {
    this.cache.invalidateTree(taskId);
    for (const id of relatedIds) {
      this.cache.invalidateTree(id);
    }
  }
}