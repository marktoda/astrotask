/**
 * Database Cleanup Utilities for PGLite Connection Management
 * 
 * Simple utilities to improve PGLite connection handling in MCP server,
 * particularly after write operations.
 */

import { createModuleLogger, type Store } from '@astrolabe/core';

const logger = createModuleLogger('DBCleanup');

/**
 * Force a database checkpoint and optimize after write operations
 * This can help ensure data is written to disk and potentially
 * improve connection behavior for PGLite
 */
export async function optimizeAfterWrite(store: Store): Promise<void> {
  try {
    // Execute VACUUM to optimize the database file
    // This forces PGLite to clean up and compact the database
    await store.pgLite.query('VACUUM;');
    
    // Execute CHECKPOINT to ensure data is written to disk
    await store.pgLite.query('CHECKPOINT;');
    
    logger.debug('Database optimized after write operation');
  } catch (error) {
    // Don't throw errors for cleanup operations
    logger.warn('Failed to optimize database after write', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Perform aggressive cleanup after write operations
 * This includes optimization plus attempting to release locks
 */
export async function aggressiveCleanupAfterWrite(store: Store): Promise<void> {
  try {
    // First do the standard optimization
    await optimizeAfterWrite(store);
    
    // Execute PRAGMA optimize to analyze and optimize
    await store.pgLite.query('PRAGMA optimize;');
    
    // Force WAL checkpoint if in WAL mode
    await store.pgLite.query('PRAGMA wal_checkpoint(FULL);');
    
    logger.debug('Aggressive database cleanup completed');
  } catch (error) {
    logger.warn('Failed to perform aggressive database cleanup', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Quick cleanup after read operations
 * Less aggressive, mainly just ensures any pending writes are flushed
 */
export async function quickCleanupAfterRead(store: Store): Promise<void> {
  try {
    // Just ensure any pending writes are flushed
    await store.pgLite.query('PRAGMA wal_checkpoint(PASSIVE);');
    
    logger.debug('Quick cleanup completed after read');
  } catch (error) {
    logger.warn('Failed to perform quick cleanup', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Get database connection info for debugging
 */
export async function getDatabaseInfo(store: Store): Promise<{
  dataDir: string;
  walMode: boolean;
  cacheSize: string;
  pageCount: string;
}> {
  try {
    const walResult = await store.pgLite.query('PRAGMA journal_mode;');
    const cacheResult = await store.pgLite.query('PRAGMA cache_size;');
    const pageResult = await store.pgLite.query('PRAGMA page_count;');
    
    return {
      dataDir: store.pgLite.dataDir || 'memory',
      walMode: (walResult.rows[0] as any)?.journal_mode === 'wal',
      cacheSize: (cacheResult.rows[0] as any)?.cache_size?.toString() || 'unknown',
      pageCount: (pageResult.rows[0] as any)?.page_count?.toString() || 'unknown',
    };
  } catch (error) {
    logger.warn('Failed to get database info', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      dataDir: store.pgLite.dataDir || 'memory',
      walMode: false,
      cacheSize: 'unknown',
      pageCount: 'unknown',
    };
  }
}

/**
 * Wrapper function to automatically clean up after write operations
 */
export async function withWriteCleanup<T>(
  store: Store,
  operation: () => Promise<T>,
  aggressive = false
): Promise<T> {
  const result = await operation();
  
  // Perform cleanup after successful write
  if (aggressive) {
    await aggressiveCleanupAfterWrite(store);
  } else {
    await optimizeAfterWrite(store);
  }
  
  return result;
}

/**
 * Wrapper function to automatically clean up after read operations
 */
export async function withReadCleanup<T>(
  store: Store,
  operation: () => Promise<T>
): Promise<T> {
  const result = await operation();
  
  // Light cleanup after read
  await quickCleanupAfterRead(store);
  
  return result;
} 