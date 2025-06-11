/**
 * Locking wrapper for database stores
 *
 * Provides cooperative locking around all store operations to ensure data consistency
 * when multiple processes or workers might access the same database file.
 */

import type {
  ContextSlice,
  CreateTask,
  CreateContextSlice as NewContextSlice,
  Task,
  TaskStatus,
} from '../schemas/index.js';
import type { DrizzleOps } from './adapters/types.js';
import type { LockOptions } from './lock.js';
import { withDatabaseLock } from './lock.js';
import type { Store, TransactionStore } from './store.js';

/**
 * Locking wrapper for database stores
 */
export class LockingStore<TDrizzle extends DrizzleOps = DrizzleOps> implements Store<TDrizzle> {
  constructor(
    private readonly store: Store<TDrizzle>,
    private readonly lockPath: string,
    private readonly lockOptions: LockOptions = {}
  ) {}

  // Pass-through properties
  get rawClient(): unknown {
    return this.store.rawClient;
  }

  get sql(): TDrizzle {
    return this.store.sql;
  }

  get isEncrypted(): boolean {
    return this.store.isEncrypted;
  }

  // Wrapped operations
  async listTasks(filters?: {
    statuses?: TaskStatus[];
    parentId?: string | null;
    includeProjectRoot?: boolean;
  }): Promise<Task[]> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.listTasks(filters)
    );
  }

  async addTask(data: CreateTask): Promise<Task> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.addTask(data)
    );
  }

  async addTaskWithId(data: CreateTask & { id: string }): Promise<Task> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.addTaskWithId(data)
    );
  }

  async getTask(id: string): Promise<Task | null> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.getTask(id)
    );
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task | null> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.updateTask(id, updates)
    );
  }

  async deleteTask(id: string): Promise<boolean> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.deleteTask(id)
    );
  }

  async listTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.listTasksByStatus(status)
    );
  }

  async listRootTasks(): Promise<Task[]> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.listRootTasks()
    );
  }

  async listSubtasks(parentId: string): Promise<Task[]> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.listSubtasks(parentId)
    );
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.updateTaskStatus(id, status)
    );
  }

  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.listContextSlices(taskId)
    );
  }

  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.addContextSlice(data)
    );
  }

  async addTaskDependency(dependentTaskId: string, dependencyTaskId: string): Promise<void> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.addTaskDependency(dependentTaskId, dependencyTaskId)
    );
  }

  async getTaskDependencies(taskId: string): Promise<string[]> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.getTaskDependencies(taskId)
    );
  }

  async close(): Promise<void> {
    // No lock needed for close operation
    return await this.store.close();
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }> {
    return await withDatabaseLock(this.lockPath, { ...this.lockOptions, processType: 'read' }, () =>
      this.store.query<T>(sql, params)
    );
  }

  async transaction<T>(fn: (tx: TransactionStore<TDrizzle>) => Promise<T>): Promise<T> {
    return await withDatabaseLock(
      this.lockPath,
      { ...this.lockOptions, processType: 'write' },
      () => this.store.transaction(fn)
    );
  }
}
