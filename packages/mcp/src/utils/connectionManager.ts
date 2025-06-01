/**
 * Connection Manager for PGLite in MCP Server
 * 
 * Provides utilities for better connection lifecycle management,
 * particularly useful for PGLite which has single connection limitations.
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
}

/**
 * Enhanced connection manager for better PGLite lifecycle management
 */
export class ConnectionManager {
  private store: Store | null = null;
  private options: ConnectionManagerOptions;
  private idleTimer: NodeJS.Timeout | null = null;
  private operationCount = 0;

  constructor(options: ConnectionManagerOptions) {
    this.options = options;
  }

  /**
   * Get or create a database connection
   */
  async getConnection(): Promise<Store> {
    if (!this.store) {
      logger.debug('Creating new database connection');
      this.store = await createDatabase(this.options.dbOptions);
    }
    
    // Clear any existing idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    return this.store;
  }

  /**
   * Execute an operation with connection management
   */
  async withConnection<T>(operation: (store: Store) => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.operationCount++;
    const opId = this.operationCount;
    
    logger.debug('Starting operation', { operationId: opId });
    
    try {
      const store = await this.getConnection();
      const result = await operation(store);
      
      const duration = Date.now() - startTime;
      logger.debug('Operation completed', { 
        operationId: opId, 
        duration: `${duration}ms`,
        success: true 
      });
      
      // Schedule connection cleanup if configured
      this.scheduleCleanup();
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Operation failed', {
        operationId: opId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Force cleanup on error to ensure clean state
      await this.forceClose();
      throw error;
    }
  }

  /**
   * Schedule connection cleanup based on configuration
   */
  private scheduleCleanup(): void {
    if (this.options.closeAfterOperation) {
      // Close immediately after operation
      setImmediate(() => this.forceClose());
    } else if (this.options.idleTimeout && this.options.idleTimeout > 0) {
      // Schedule cleanup after idle timeout
      this.idleTimer = setTimeout(() => {
        logger.debug('Closing idle connection');
        this.forceClose();
      }, this.options.idleTimeout);
    }
  }

  /**
   * Force close the current connection
   */
  async forceClose(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    if (this.store) {
      try {
        logger.debug('Closing database connection');
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
   * Get connection status information
   */
  getStatus(): {
    connected: boolean;
    operationCount: number;
    hasIdleTimer: boolean;
  } {
    return {
      connected: this.store !== null,
      operationCount: this.operationCount,
      hasIdleTimer: this.idleTimer !== null,
    };
  }
}

/**
 * Create a connection manager with sensible defaults for MCP usage
 */
export function createConnectionManager(dbOptions: DatabaseOptions): ConnectionManager {
  return new ConnectionManager({
    dbOptions,
    // For MCP servers, we can be more aggressive about closing connections
    // since operations are typically infrequent and independent
    closeAfterOperation: process.env.MCP_AGGRESSIVE_CONNECTION_CLEANUP === 'true',
    idleTimeout: parseInt(process.env.MCP_IDLE_TIMEOUT || '5000', 10), // 5 seconds default
  });
} 