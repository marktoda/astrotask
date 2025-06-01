/**
 * Connection Manager for PGLite in MCP Server
 * 
 * Provides utilities for better connection lifecycle management,
 * particularly useful for PGLite which has single connection limitations.
 * Now enhanced with cooperative locking support for better concurrency.
 */

import { createDatabase, type DatabaseOptions, type Store, createModuleLogger } from '@astrolabe/core';

const logger = createModuleLogger('ConnectionManager');

export interface ConnectionManagerOptions {
  /** Database options for creating new connections */
  dbOptions: DatabaseOptions;
  /** Whether to close connection after each operation (more aggressive) */
  closeAfterOperation?: boolean;
  /** Timeout before closing idle connections (in ms) */
  idleTimeout?: number;
  /** Whether to force unlock locks when closing connections */
  forceUnlockOnClose?: boolean;
}

/**
 * Enhanced connection manager for better PGLite lifecycle management with cooperative locking
 */
export class ConnectionManager {
  private store: Store | null = null;
  private options: ConnectionManagerOptions;
  private idleTimer: NodeJS.Timeout | null = null;
  private operationCount = 0;
  private lastOperationTime = 0;

  constructor(options: ConnectionManagerOptions) {
    this.options = options;
  }

  /**
   * Check if the current store connection is still valid
   */
  private async isConnectionValid(store: Store): Promise<boolean> {
    try {
      // Try a simple query to check if the connection is still alive
      await store.pgLite.query('SELECT 1');
      return true;
    } catch (error) {
      // If the query fails, the connection is likely closed
      logger.debug('Connection validation failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get or create a database connection
   */
  async getConnection(): Promise<Store> {
    // Check if we have an existing store and if it's still valid
    if (this.store) {
      const isValid = await this.isConnectionValid(this.store);
      if (isValid) {
        logger.debug('Reusing existing valid database connection');
        // Clear any existing idle timer since we're using the connection
        if (this.idleTimer) {
          clearTimeout(this.idleTimer);
          this.idleTimer = null;
        }
        this.lastOperationTime = Date.now();
        return this.store;
      } else {
        logger.debug('Existing connection is invalid, creating new one');
        // Connection is invalid, clear it and create a new one
        this.store = null;
      }
    }

    // Create a fresh connection
    logger.debug('Creating new database connection with locking support');
    this.store = await createDatabase(this.options.dbOptions);
    
    // Clear any existing idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    this.lastOperationTime = Date.now();
    return this.store;
  }

  /**
   * Execute an operation with connection management and smart locking
   */
  async withConnection<T>(operation: (store: Store) => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.operationCount++;
    const opId = this.operationCount;
    
    logger.debug('Starting operation with cooperative locking', { operationId: opId });
    
    try {
      const store = await this.getConnection();
      const result = await operation(store);
      
      const duration = Date.now() - startTime;
      logger.debug('Operation completed successfully', { 
        operationId: opId, 
        duration: `${duration}ms`,
        lockingEnabled: !!(store as any).isLocked
      });
      
      // Schedule smart cleanup
      this.scheduleSmartCleanup();
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Operation failed', {
        operationId: opId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Don't force close on operational errors - let normal cleanup handle it
      // Only force close if it's a critical database connection error
      if (error instanceof Error && error.message.includes('PGLite is closed')) {
        logger.warn('Database connection appears closed, forcing cleanup');
        await this.forceClose();
      }
      
      throw error;
    }
  }

  /**
   * Schedule smart cleanup that considers MCP server usage patterns
   */
  private scheduleSmartCleanup(): void {
    if (this.options.closeAfterOperation) {
      // Close immediately after operation (most aggressive)
      setImmediate(() => this.forceClose());
    } else if (this.options.idleTimeout && this.options.idleTimeout > 0) {
      // Schedule cleanup after idle timeout with smart detection
      this.idleTimer = setTimeout(() => {
        const timeSinceLastOp = Date.now() - this.lastOperationTime;
        if (timeSinceLastOp >= this.options.idleTimeout!) {
          logger.debug('Closing idle connection and releasing locks', {
            idleTime: `${timeSinceLastOp}ms`,
            threshold: `${this.options.idleTimeout}ms`
          });
          this.forceClose();
        } else {
          // Reschedule for the remaining time
          const remainingTime = this.options.idleTimeout! - timeSinceLastOp;
          logger.debug('Rescheduling cleanup', { remainingTime: `${remainingTime}ms` });
          this.scheduleSmartCleanup();
        }
      }, this.options.idleTimeout);
    }
  }

  /**
   * Force close the current connection and release any locks
   */
  async forceClose(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    if (this.store) {
      try {
        logger.debug('Closing database connection and releasing locks');
        
        // If the store supports lock management, try to release locks
        if (this.options.forceUnlockOnClose && 'forceUnlock' in this.store) {
          try {
            await (this.store as any).forceUnlock();
            logger.debug('Force unlocked database before closing');
          } catch (unlockError) {
            logger.warn('Failed to force unlock before closing', {
              error: unlockError instanceof Error ? unlockError.message : String(unlockError)
            });
          }
        }
        
        await this.store.close();
        logger.debug('Database connection closed successfully');
      } catch (error) {
        logger.error('Failed to close database connection', {
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        this.store = null;
      }
    }
  }

  /**
   * Get connection statistics for monitoring
   */
  getStats(): {
    connected: boolean;
    operationCount: number;
    lastOperationTime: number;
    idleTime: number;
  } {
    return {
      connected: this.store !== null,
      operationCount: this.operationCount,
      lastOperationTime: this.lastOperationTime,
      idleTime: this.lastOperationTime ? Date.now() - this.lastOperationTime : 0,
    };
  }

  /**
   * Check if the connection has been idle for longer than the threshold
   */
  isIdle(thresholdMs: number = 5000): boolean {
    if (!this.lastOperationTime) return true;
    return (Date.now() - this.lastOperationTime) > thresholdMs;
  }
}

/**
 * Create a connection manager with sensible defaults for MCP usage
 */
export function createConnectionManager(dbOptions: DatabaseOptions): ConnectionManager {
  return new ConnectionManager({
    dbOptions,
    // For MCP servers, we should be less aggressive about closing connections
    // since the server should stay alive and handle multiple requests
    closeAfterOperation: process.env.MCP_AGGRESSIVE_CONNECTION_CLEANUP === 'true',
    idleTimeout: parseInt(process.env.MCP_IDLE_TIMEOUT || '30000', 10), // 30 seconds default - less aggressive
    forceUnlockOnClose: process.env.MCP_FORCE_UNLOCK_ON_CLOSE === 'true',
  });
} 