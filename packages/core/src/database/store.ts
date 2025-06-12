import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import { generateNextTaskId } from '../utils/taskId.js';
import type { DrizzleOps } from './adapters/types.js';
import {
  DatabaseTransactionError,
  DatabaseUnsupportedError,
} from './errors.js';
import type { postgresSchema, sqliteSchema } from './schema.js';

/**
 * Predefined query selections to reduce repetitive code
 */

// Standard task selection for all task queries
const createTaskSelection = (schema: typeof postgresSchema | typeof sqliteSchema) => ({
  id: schema.tasks.id,
  parentId: schema.tasks.parentId,
  title: schema.tasks.title,
  description: schema.tasks.description,
  status: schema.tasks.status,
  priorityScore: schema.tasks.priorityScore,
  prd: schema.tasks.prd,
  contextDigest: schema.tasks.contextDigest,
  createdAt: schema.tasks.createdAt,
  updatedAt: schema.tasks.updatedAt,
});

// Standard context slice selection for all context slice queries
const createContextSliceSelection = (schema: typeof postgresSchema | typeof sqliteSchema) => ({
  id: schema.contextSlices.id,
  title: schema.contextSlices.title,
  description: schema.contextSlices.description,
  contextType: schema.contextSlices.contextType,
  taskId: schema.contextSlices.taskId,
  contextDigest: schema.contextSlices.contextDigest,
  createdAt: schema.contextSlices.createdAt,
  updatedAt: schema.contextSlices.updatedAt,
});

// Standard task dependency selection for dependency queries
const createTaskDependencySelection = (schema: typeof postgresSchema | typeof sqliteSchema) => ({
  dependencyTaskId: schema.taskDependencies.dependencyTaskId,
});

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
  implements Store<TDrizzle>
{
  public readonly rawClient: TRawClient;
  /** Native Drizzle ORM instance for the selected dialect */
  public readonly sql: TDrizzle;
  public readonly isEncrypted: boolean;
  /** Schema definition for the database operations */
  private readonly schema: typeof postgresSchema | typeof sqliteSchema;
  
  // Predefined selections for this store instance
  private readonly taskSelection: ReturnType<typeof createTaskSelection>;
  private readonly contextSliceSelection: ReturnType<typeof createContextSliceSelection>;
  private readonly taskDependencySelection: ReturnType<typeof createTaskDependencySelection>;

  constructor(
    rawClient: TRawClient,
    sql: TDrizzle,
    schema: typeof postgresSchema | typeof sqliteSchema,
    isEncrypted = false
  ) {
    this.rawClient = rawClient;
    this.sql = sql;
    this.schema = schema;
    this.isEncrypted = isEncrypted;
    
    // Initialize predefined selections
    this.taskSelection = createTaskSelection(schema);
    this.contextSliceSelection = createContextSliceSelection(schema);
    this.taskDependencySelection = createTaskDependencySelection(schema);
  }

  // Task operations
  async listTasks(
    filters: {
      statuses?: TaskStatus[];
      parentId?: string | null;
      includeProjectRoot?: boolean;
    } = {}
  ): Promise<Task[]> {
    const conditions = [];
    if (filters.statuses !== undefined) {
      if (filters.statuses.length === 1) {
        const status = filters.statuses[0];
        if (status) {
          conditions.push(eq(this.schema.tasks.status, status));
        }
      } else if (filters.statuses.length > 1) {
        conditions.push(inArray(this.schema.tasks.status, filters.statuses));
      }
    } else {
      conditions.push(inArray(this.schema.tasks.status, ['pending', 'in-progress']));
    }
    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(this.schema.tasks.parentId));
      } else {
        conditions.push(eq(this.schema.tasks.parentId, filters.parentId));
      }
    }
    if (!filters.includeProjectRoot) {
      conditions.push(ne(this.schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await this.sql
      .select(this.taskSelection)
      .from(this.schema.tasks)
      .where(whereClause)
      .orderBy(desc(this.schema.tasks.createdAt));
  }

  async addTask(data: CreateTask): Promise<Task> {
    const id = await generateNextTaskId(this, data.parentId);
    return await this.addTaskWithId({ ...data, id });
  }

  async addTaskWithId(data: CreateTask & { id: string }): Promise<Task> {
    const now = new Date();
    const task: Task = {
      id: data.id,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priorityScore: data.priorityScore ?? 50,
      prd: data.prd ?? null,
      contextDigest: data.contextDigest ?? null,
      parentId: data.parentId ?? TASK_IDENTIFIERS.PROJECT_ROOT,
      createdAt: now,
      updatedAt: now,
    };

    await this.sql.insert(this.schema.tasks).values(task);
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.sql
      .select(this.taskSelection)
      .from(this.schema.tasks)
      .where(eq(this.schema.tasks.id, id))
      .limit(1);
    return tasks[0] || null;
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task | null> {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await this.sql.update(this.schema.tasks).set(updateData).where(eq(this.schema.tasks.id, id));

    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.sql
      .delete(this.schema.tasks)
      .where(eq(this.schema.tasks.id, id))
      .returning();

    return result.length > 0;
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

  // Context slice operations
  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return await this.sql
      .select(this.contextSliceSelection)
      .from(this.schema.contextSlices)
      .where(eq(this.schema.contextSlices.taskId, taskId))
      .orderBy(desc(this.schema.contextSlices.createdAt));
  }

  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    const now = new Date();
    const contextSlice: ContextSlice = {
      id: data.id || randomUUID(),
      title: data.title,
      description: data.description ?? null,
      contextType: data.contextType ?? 'general',
      taskId: data.taskId ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.sql.insert(this.schema.contextSlices).values(contextSlice);
    return contextSlice;
  }

  // Task dependency operations
  async addTaskDependency(dependentTaskId: string, dependencyTaskId: string): Promise<void> {
    const now = new Date();
    await this.sql.insert(this.schema.taskDependencies).values({
      id: randomUUID(),
      dependentTaskId,
      dependencyTaskId,
      createdAt: now,
    });
  }

  async getTaskDependencies(taskId: string): Promise<string[]> {
    const dependencies = await this.sql
      .select(this.taskDependencySelection)
      .from(this.schema.taskDependencies)
      .where(eq(this.schema.taskDependencies.dependentTaskId, taskId));

    return dependencies.map((dep: { dependencyTaskId: string }) => dep.dependencyTaskId);
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
    return await this.sql.transaction(async (tx) => {
      const transactionStore = new DatabaseTransactionStore(tx as TDrizzle, this.schema);

      // Drizzle automatically handles rollback on error
      // The tx.rollback() method in TransactionStore throws an error to trigger rollback
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
  implements TransactionStore<TDrizzle>
{
  public readonly sql: TDrizzle;
  private readonly schema: typeof postgresSchema | typeof sqliteSchema;
  
  // Predefined selections for this transaction store instance
  private readonly taskSelection: ReturnType<typeof createTaskSelection>;
  private readonly contextSliceSelection: ReturnType<typeof createContextSliceSelection>;
  private readonly taskDependencySelection: ReturnType<typeof createTaskDependencySelection>;

  constructor(transactionInstance: TDrizzle, schema: typeof postgresSchema | typeof sqliteSchema) {
    this.sql = transactionInstance;
    this.schema = schema;
    
    // Initialize predefined selections
    this.taskSelection = createTaskSelection(schema);
    this.contextSliceSelection = createContextSliceSelection(schema);
    this.taskDependencySelection = createTaskDependencySelection(schema);
  }

  // Task operations within transaction
  async addTask(data: CreateTask): Promise<Task> {
    // Generate ID within transaction context to ensure uniqueness
    const id = randomUUID(); // For simplicity, using UUID instead of sequential ID in transactions
    return await this.addTaskWithId({ ...data, id });
  }

  async addTaskWithId(data: CreateTask & { id: string }): Promise<Task> {
    const now = new Date();
    const task: Task = {
      id: data.id,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priorityScore: data.priorityScore ?? 50,
      prd: data.prd ?? null,
      contextDigest: data.contextDigest ?? null,
      parentId: data.parentId ?? TASK_IDENTIFIERS.PROJECT_ROOT,
      createdAt: now,
      updatedAt: now,
    };

    await this.sql.insert(this.schema.tasks).values(task);
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.sql
      .select(this.taskSelection)
      .from(this.schema.tasks)
      .where(eq(this.schema.tasks.id, id))
      .limit(1);
    return tasks[0] || null;
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task | null> {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await this.sql.update(this.schema.tasks).set(updateData).where(eq(this.schema.tasks.id, id));

    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.sql
      .delete(this.schema.tasks)
      .where(eq(this.schema.tasks.id, id))
      .returning();

    return result.length > 0;
  }

  async listTasks(
    filters: {
      statuses?: TaskStatus[];
      parentId?: string | null;
      includeProjectRoot?: boolean;
    } = {}
  ): Promise<Task[]> {
    const conditions = [];
    if (filters.statuses !== undefined) {
      if (filters.statuses.length === 1) {
        const status = filters.statuses[0];
        if (status) {
          conditions.push(eq(this.schema.tasks.status, status));
        }
      } else if (filters.statuses.length > 1) {
        conditions.push(inArray(this.schema.tasks.status, filters.statuses));
      }
    } else {
      conditions.push(inArray(this.schema.tasks.status, ['pending', 'in-progress']));
    }
    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(this.schema.tasks.parentId));
      } else {
        conditions.push(eq(this.schema.tasks.parentId, filters.parentId));
      }
    }
    if (!filters.includeProjectRoot) {
      conditions.push(ne(this.schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return await this.sql
      .select(this.taskSelection)
      .from(this.schema.tasks)
      .where(whereClause)
      .orderBy(desc(this.schema.tasks.createdAt));
  }

  // Context slice operations within transaction
  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    const now = new Date();
    const contextSlice: ContextSlice = {
      id: data.id || randomUUID(),
      title: data.title,
      description: data.description ?? null,
      contextType: data.contextType ?? 'general',
      taskId: data.taskId ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.sql.insert(this.schema.contextSlices).values(contextSlice);
    return contextSlice;
  }

  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return await this.sql
      .select(this.contextSliceSelection)
      .from(this.schema.contextSlices)
      .where(eq(this.schema.contextSlices.taskId, taskId))
      .orderBy(desc(this.schema.contextSlices.createdAt));
  }

  // Task dependency operations within transaction
  async addTaskDependency(dependentTaskId: string, dependencyTaskId: string): Promise<void> {
    const now = new Date();
    await this.sql.insert(this.schema.taskDependencies).values({
      id: randomUUID(),
      dependentTaskId,
      dependencyTaskId,
      createdAt: now,
    });
  }

  async getTaskDependencies(taskId: string): Promise<string[]> {
    const dependencies = await this.sql
      .select(this.taskDependencySelection)
      .from(this.schema.taskDependencies)
      .where(eq(this.schema.taskDependencies.dependentTaskId, taskId));

    return dependencies.map((dep: { dependencyTaskId: string }) => dep.dependencyTaskId);
  }

  // Transaction control
  rollback(): void {
    // Drizzle doesn't provide explicit rollback control within transaction functions
    // Rollback is achieved by throwing an error within the transaction
    throw new DatabaseTransactionError('Transaction explicitly rolled back', 'transaction-store');
  }
}
