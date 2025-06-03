/**
 * Store wrapper that automatically handles database locking
 *
 * Provides transparent locking for all database operations by wrapping
 * the underlying Store implementation. Each operation acquires the lock,
 * performs the operation, and releases the lock.
 */

import type { ContextSlice, CreateContextSlice } from '../schemas/contextSlice.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import { createModuleLogger } from '../utils/logger.js';
import type { DatabaseClient, DrizzleOps } from './adapters/types.js';
import { DatabaseLock, DatabaseLockError, type LockInfo, type LockOptions } from './lock.js';
import type { Store } from './store.js';

const logger = createModuleLogger('LockingStore');

/**
 * Store wrapper that automatically handles database locking for all operations
 */
export class LockingStore implements Store {
  private readonly lock: DatabaseLock;
  private readonly innerStore: Store;

  constructor(innerStore: Store, databasePath: string, lockOptions?: LockOptions) {
    this.innerStore = innerStore;
    this.lock = new DatabaseLock(databasePath, {
      processType: 'store-wrapper',
      ...lockOptions,
    });
  }

  // Expose underlying properties
  get pgLite(): DatabaseClient {
    return this.innerStore.pgLite;
  }

  get sql(): DrizzleOps {
    return this.innerStore.sql;
  }

  get isEncrypted(): boolean {
    return this.innerStore.isEncrypted;
  }

  /**
   * Execute an operation with automatic locking
   */
  private async withLock<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    try {
      await this.lock.acquire();
      logger.debug(`Lock acquired for ${operationName}`);

      const result = await operation();

      logger.debug(`Operation ${operationName} completed successfully`);
      return result;
    } catch (error) {
      if (error instanceof DatabaseLockError) {
        logger.warn(`Lock acquisition failed for ${operationName}`, {
          error: error.message,
          lockInfo: error.lockInfo,
        });

        // Provide user-friendly error message
        const lockHolder = error.lockInfo
          ? `${error.lockInfo.process} (PID: ${error.lockInfo.pid})`
          : 'another process';

        throw new Error(
          `Database is currently in use by ${lockHolder}. Please try again in a moment.`
        );
      }

      logger.error(`Operation ${operationName} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      try {
        if (this.lock.getLockInfo()) {
          await this.lock.release();
          logger.debug(`Lock released for ${operationName}`);
        }
      } catch (releaseError) {
        logger.warn(`Failed to release lock after ${operationName}`, {
          error: releaseError instanceof Error ? releaseError.message : String(releaseError),
        });
      }
    }
  }

  // Task operations with locking
  async listTasks(filters?: {
    statuses?: TaskStatus[];
    parentId?: string | null;
    includeProjectRoot?: boolean;
  }): Promise<Task[]> {
    return this.withLock(() => this.innerStore.listTasks(filters), 'listTasks');
  }

  async addTask(data: CreateTask): Promise<Task> {
    return this.withLock(() => this.innerStore.addTask(data), 'addTask');
  }

  async addTaskWithId(data: CreateTask & { id: string }): Promise<Task> {
    return this.withLock(() => this.innerStore.addTaskWithId(data), 'addTaskWithId');
  }

  async getTask(id: string): Promise<Task | null> {
    return this.withLock(() => this.innerStore.getTask(id), 'getTask');
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task | null> {
    return this.withLock(() => this.innerStore.updateTask(id, updates), 'updateTask');
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.withLock(() => this.innerStore.deleteTask(id), 'deleteTask');
  }

  // Convenience methods with locking
  async listTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.withLock(() => this.innerStore.listTasksByStatus(status), 'listTasksByStatus');
  }

  async listRootTasks(): Promise<Task[]> {
    return this.withLock(() => this.innerStore.listRootTasks(), 'listRootTasks');
  }

  async listSubtasks(parentId: string): Promise<Task[]> {
    return this.withLock(() => this.innerStore.listSubtasks(parentId), 'listSubtasks');
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    return this.withLock(() => this.innerStore.updateTaskStatus(id, status), 'updateTaskStatus');
  }

  // Context slice operations with locking
  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return this.withLock(() => this.innerStore.listContextSlices(taskId), 'listContextSlices');
  }

  async addContextSlice(data: CreateContextSlice): Promise<ContextSlice> {
    return this.withLock(() => this.innerStore.addContextSlice(data), 'addContextSlice');
  }

  // System operations with locking
  async close(): Promise<void> {
    return this.withLock(() => this.innerStore.close(), 'close');
  }

  /**
   * Check if the database is currently locked
   */
  async isLocked(): Promise<{ locked: boolean; info?: LockInfo }> {
    return this.lock.isLocked();
  }

  /**
   * Force unlock the database (use with caution)
   */
  async forceUnlock(): Promise<void> {
    await this.lock.forceUnlock();
  }

  /**
   * Get the underlying store (for advanced operations that need direct access)
   * WARNING: Operations on the inner store bypass locking!
   */
  getInnerStore(): Store {
    return this.innerStore;
  }

  /**
   * Get lock information
   */
  getLockInfo() {
    return {
      path: this.lock.getLockPath(),
      current: this.lock.getLockInfo(),
    };
  }
}
