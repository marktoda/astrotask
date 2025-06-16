import { randomUUID } from 'node:crypto';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import { generateNextTaskId } from '../utils/taskId.js';
import type { DrizzleOps } from './adapters/types.js';
import { DatabaseTransactionError, DatabaseUnsupportedError } from './errors.js';
import type { postgresSchema, sqliteSchema } from './schema.js';
import { BaseStore } from './store-base.js';

/**
 * Interface for transaction operations
 */
export interface TransactionStore<TDrizzle extends DrizzleOps = DrizzleOps> {
  /** Native Drizzle transaction instance */
  readonly sql: TDrizzle;

  // Task operations within transaction
  addTask(data: CreateTask): Promise<Task>;
  addTaskWithId(data: CreateTask & { id: string }): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  listTasks(filters?: {
    statuses?: TaskStatus[];
    parentId?: string | null;
    includeProjectRoot?: boolean;
  }): Promise<Task[]>;

  // Context slice operations within transaction
  addContextSlice(data: NewContextSlice): Promise<ContextSlice>;
  listContextSlices(taskId: string): Promise<ContextSlice[]>;

  // Task dependency operations within transaction
  addTaskDependency(dependentTaskId: string, dependencyTaskId: string): Promise<void>;
  getTaskDependencies(taskId: string): Promise<string[]>;

  // Transaction control
  rollback(): void;
}

/**
 * Interface for the task management database store
 */
export interface Store<TDrizzle extends DrizzleOps = DrizzleOps> {
  /** Raw database client for direct SQL operations */
  readonly rawClient: unknown;
  /** Native Drizzle ORM instance with dialect-specific typing */
  readonly sql: TDrizzle;
  /** Whether encryption is enabled */
  readonly isEncrypted: boolean;

  // Task operations
  listTasks(filters?: {
    statuses?: TaskStatus[];
    parentId?: string | null;
    includeProjectRoot?: boolean;
  }): Promise<Task[]>;
  addTask(data: CreateTask): Promise<Task>;
  addTaskWithId(data: CreateTask & { id: string }): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  // Convenience methods for common task queries
  listTasksByStatus(status: TaskStatus): Promise<Task[]>;
  listRootTasks(): Promise<Task[]>;
  listSubtasks(parentId: string): Promise<Task[]>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null>;

  // Context slice operations
  listContextSlices(taskId: string): Promise<ContextSlice[]>;
  addContextSlice(data: NewContextSlice): Promise<ContextSlice>;

  // Task dependency operations
  addTaskDependency(dependentTaskId: string, dependencyTaskId: string): Promise<void>;
  getTaskDependencies(taskId: string): Promise<string[]>;

  // Transaction support
  transaction<T>(fn: (tx: TransactionStore<TDrizzle>) => Promise<T>): Promise<T>;

  // System operations
  close(): Promise<void>;

  // Raw database operations
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Generic database store implementation with business methods
 */
export class DatabaseStore<TRawClient = unknown, TDrizzle extends DrizzleOps = DrizzleOps>
  extends BaseStore<TDrizzle>
  implements Store<TDrizzle>
{
  public readonly rawClient: TRawClient;
  public readonly isEncrypted: boolean;

  constructor(
    rawClient: TRawClient,
    sql: TDrizzle,
    schema: typeof postgresSchema | typeof sqliteSchema,
    isEncrypted = false
  ) {
    super(sql, schema);
    this.rawClient = rawClient;
    this.isEncrypted = isEncrypted;
  }

  // Implementation of abstract method
  override async addTask(data: CreateTask): Promise<Task> {
    const id = await generateNextTaskId(this, data.parentId);
    return await this.addTaskWithId({ ...data, id });
  }

  // Convenience methods
  async listTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.listTasks({ statuses: [status] });
  }

  async listRootTasks(): Promise<Task[]> {
    return this.listTasks({ parentId: TASK_IDENTIFIERS.PROJECT_ROOT, statuses: [] });
  }

  async listSubtasks(parentId: string): Promise<Task[]> {
    return this.listTasks({ parentId, statuses: [] });
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    return this.updateTask(id, { status });
  }

  // System operations
  async close(): Promise<void> {
    // The raw client needs to be closed differently based on its type
    // This is a type-unsafe operation, but necessary for the abstraction
    if (this.rawClient && typeof this.rawClient === 'object') {
      const client = this.rawClient as {
        close?: () => Promise<void> | void;
        end?: () => Promise<void> | void;
      };
      if (typeof client.close === 'function') {
        await client.close();
      } else if (typeof client.end === 'function') {
        await client.end();
      }
    }
  }

  /**
   * Execute operations within a database transaction
   */
  async transaction<T>(fn: (tx: TransactionStore<TDrizzle>) => Promise<T>): Promise<T> {
    // SQLite transactions are synchronous, while PostgreSQL transactions can be async
    // We need to handle both cases

    // Check if this is a SQLite database by looking for the prepare method
    const isSQLite =
      this.rawClient &&
      typeof this.rawClient === 'object' &&
      'prepare' in this.rawClient &&
      typeof (this.rawClient as { prepare?: unknown }).prepare === 'function';

    if (isSQLite) {
      // For SQLite, we need to use a different approach since it doesn't support async transactions
      // We'll throw an error to indicate that async operations aren't supported in SQLite transactions
      throw new Error(
        'SQLite transactions must be synchronous. Consider using a different database adapter for async transaction support.'
      );
    }

    // PostgreSQL and PGLite support async transactions
    return await this.sql.transaction(async (tx) => {
      const transactionStore = new DatabaseTransactionStore(tx as TDrizzle, this.schema);
      return await fn(transactionStore);
    });
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }> {
    // Handle different raw client types
    if (this.rawClient && typeof this.rawClient === 'object') {
      const client = this.rawClient as {
        query?: (sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
        prepare?: (sql: string) => { all: (...params: unknown[]) => unknown[] };
        unsafe?: (sql: string, params?: unknown[]) => Promise<T[]>;
      };

      // PGLite client has a query method
      if (typeof client.query === 'function') {
        return await client.query(sql, params);
      }

      // SQLite (better-sqlite3) client
      if (typeof client.prepare === 'function') {
        const stmt = client.prepare(sql);
        const rows = params ? stmt.all(...params) : stmt.all();
        return { rows: rows as T[] };
      }

      // PostgreSQL (postgres-js) client
      if (typeof client.unsafe === 'function') {
        const result = await client.unsafe(sql, params);
        return { rows: result as T[] };
      }
    }

    throw new DatabaseUnsupportedError(
      'Unsupported raw client type for query operation',
      'unknown',
      'raw query',
      { clientType: typeof this.rawClient }
    );
  }
}

/**
 * Transaction store implementation that wraps operations in a transaction context
 */
class DatabaseTransactionStore<TDrizzle extends DrizzleOps = DrizzleOps>
  extends BaseStore<TDrizzle>
  implements TransactionStore<TDrizzle>
{
  // Implementation of abstract method
  override async addTask(data: CreateTask): Promise<Task> {
    // Generate ID within transaction context to ensure uniqueness
    const id = randomUUID(); // For simplicity, using UUID instead of sequential ID in transactions
    return await this.addTaskWithId({ ...data, id });
  }

  // Transaction control
  rollback(): void {
    // Drizzle doesn't provide explicit rollback control within transaction functions
    // Rollback is achieved by throwing an error within the transaction
    throw new DatabaseTransactionError('Transaction explicitly rolled back', 'transaction-store');
  }
}
