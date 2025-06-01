/**
 * File-based cooperative locking for PGLite database access coordination
 * 
 * Implements a simple file-locking mechanism to coordinate database access
 * between CLI and MCP server processes. Uses exclusive file creation with
 * retry logic and stale lock detection.
 */

import { writeFile, unlink, readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('DatabaseLock');

export interface LockInfo {
  /** Process ID of the lock holder */
  pid: number;
  /** Timestamp when lock was acquired */
  timestamp: number;
  /** Hostname where lock was acquired */
  host: string;
  /** Process type (mcp-server or cli) */
  process: string;
}

export interface LockOptions {
  /** Maximum number of retry attempts (default: 50) */
  maxRetries?: number;
  /** Delay between retry attempts in milliseconds (default: 100) */
  retryDelay?: number;
  /** Lock timeout in milliseconds - locks older than this are considered stale (default: 30000) */
  staleTimeout?: number;
  /** Process type identifier for debugging (default: 'unknown') */
  processType?: string;
}

export class DatabaseLockError extends Error {
  constructor(message: string, public readonly lockInfo?: LockInfo) {
    super(message);
    this.name = 'DatabaseLockError';
  }
}

export class DatabaseLock {
  private readonly lockPath: string;
  private readonly options: Required<LockOptions>;
  private lockInfo: LockInfo | null = null;

  constructor(databasePath: string, options: LockOptions = {}) {
    // Create lock file path in same directory as database
    const dbDir = dirname(resolve(databasePath));
    this.lockPath = resolve(dbDir, '.astrolabe.lock');
    
    this.options = {
      maxRetries: options.maxRetries ?? 50,
      retryDelay: options.retryDelay ?? 100,
      staleTimeout: options.staleTimeout ?? 30000,
      processType: options.processType ?? 'unknown',
    };
  }

  /**
   * Ensure lock directory exists
   */
  private async ensureLockDir(): Promise<void> {
    try {
      await mkdir(dirname(this.lockPath), { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        logger.warn('Failed to create lock directory', {
          error,
          lockDir: dirname(this.lockPath)
        });
      }
    }
  }

  /**
   * Acquire the database lock with retry logic
   * @throws {DatabaseLockError} If lock cannot be acquired within timeout
   */
  async acquire(): Promise<void> {
    // Ensure lock directory exists first
    await this.ensureLockDir();

    const lockInfo: LockInfo = {
      pid: process.pid,
      timestamp: Date.now(),
      host: hostname(),
      process: this.options.processType,
    };

    let attempt = 0;
    while (attempt < this.options.maxRetries) {
      try {
        // Try to create lock file exclusively (fails if exists)
        await writeFile(this.lockPath, JSON.stringify(lockInfo, null, 2), { 
          flag: 'wx' // Exclusive create - fails if file exists
        });
        
        this.lockInfo = lockInfo;
        logger.debug(`Database lock acquired on attempt ${attempt + 1}`, {
          lockPath: this.lockPath,
          processType: this.options.processType,
          pid: process.pid
        });
        return;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock file exists, check if it's stale
          try {
            const existingLockData = await readFile(this.lockPath, 'utf-8');
            const existingLock: LockInfo = JSON.parse(existingLockData);
            
            const lockAge = Date.now() - existingLock.timestamp;
            if (lockAge > this.options.staleTimeout) {
              logger.warn(`Removing stale lock (age: ${lockAge}ms)`, {
                existingLock,
                lockPath: this.lockPath
              });
              
              try {
                await unlink(this.lockPath);
                // Continue to next iteration to try acquiring lock
                attempt--;
              } catch (unlinkError) {
                logger.warn('Failed to remove stale lock', { 
                  error: unlinkError,
                  lockPath: this.lockPath 
                });
              }
            } else {
              // Lock is not stale, wait and retry
              if (attempt === 0) {
                logger.debug(`Database is locked by ${existingLock.process} (PID: ${existingLock.pid})`, {
                  lockAge,
                  existingLock
                });
              }
            }
          } catch (parseError) {
            // Invalid lock file, try to remove it
            logger.warn('Invalid lock file detected, attempting to remove', {
              parseError,
              lockPath: this.lockPath
            });
            
            try {
              await unlink(this.lockPath);
              attempt--; // Don't count this as a retry attempt
            } catch (unlinkError) {
              logger.warn('Failed to remove invalid lock file', {
                unlinkError,
                lockPath: this.lockPath
              });
            }
          }
          
          attempt++;
          if (attempt < this.options.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
          }
        } else if (error.code === 'ENOENT') {
          // Directory doesn't exist, ensure it and retry
          await this.ensureLockDir();
          // Don't increment attempt for this case
        } else {
          // Unexpected error
          throw new DatabaseLockError(`Failed to acquire database lock: ${error.message}`);
        }
      }
    }

    // Failed to acquire lock within retry limit
    let existingLock: LockInfo | undefined;
    try {
      const existingLockData = await readFile(this.lockPath, 'utf-8');
      existingLock = JSON.parse(existingLockData);
    } catch {
      // Ignore errors reading existing lock for error message
    }

    const timeoutSeconds = (this.options.maxRetries * this.options.retryDelay) / 1000;
    throw new DatabaseLockError(
      `Failed to acquire database lock after ${timeoutSeconds}s timeout (${this.options.maxRetries} retries)`,
      existingLock
    );
  }

  /**
   * Release the database lock
   * @throws {Error} If lock was not acquired by this instance
   */
  async release(): Promise<void> {
    if (!this.lockInfo) {
      throw new Error('Cannot release lock that was not acquired by this instance');
    }

    try {
      await unlink(this.lockPath);
      logger.debug('Database lock released', {
        lockPath: this.lockPath,
        processType: this.options.processType,
        pid: process.pid
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.warn('Lock file was already removed', { lockPath: this.lockPath });
      } else {
        logger.error('Failed to release database lock', {
          error,
          lockPath: this.lockPath
        });
        throw error;
      }
    } finally {
      this.lockInfo = null;
    }
  }

  /**
   * Check if a lock is currently held (by any process)
   */
  async isLocked(): Promise<{ locked: boolean; info?: LockInfo }> {
    try {
      const lockData = await readFile(this.lockPath, 'utf-8');
      const lockInfo: LockInfo = JSON.parse(lockData);
      
      const lockAge = Date.now() - lockInfo.timestamp;
      if (lockAge > this.options.staleTimeout) {
        return { locked: false }; // Stale lock doesn't count
      }
      
      return { locked: true, info: lockInfo };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { locked: false };
      }
      
      // If we can't read the lock file, assume it's corrupted and not locked
      logger.warn('Failed to read lock file, assuming not locked', {
        error,
        lockPath: this.lockPath
      });
      return { locked: false };
    }
  }

  /**
   * Get information about this lock instance
   */
  getLockInfo(): LockInfo | null {
    return this.lockInfo;
  }

  /**
   * Get the lock file path
   */
  getLockPath(): string {
    return this.lockPath;
  }

  /**
   * Force remove the lock file (use with caution)
   */
  async forceUnlock(): Promise<void> {
    try {
      await unlink(this.lockPath);
      logger.warn('Lock file forcibly removed', { lockPath: this.lockPath });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info('Lock file does not exist', { lockPath: this.lockPath });
      } else {
        throw error;
      }
    }
  }
}

/**
 * Utility function to execute a function with database lock protection
 */
export async function withDatabaseLock<T>(
  databasePath: string,
  options: LockOptions,
  fn: () => Promise<T>
): Promise<T> {
  const lock = new DatabaseLock(databasePath, options);
  
  try {
    await lock.acquire();
    return await fn();
  } finally {
    if (lock.getLockInfo()) {
      await lock.release();
    }
  }
} 