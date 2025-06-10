import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import { generateNextTaskId } from '../utils/taskId.js';
import type { DatabaseClient, DrizzleOps } from './adapters/types.js';
import * as sqliteSchema from './schema-sqlite.js';
import * as schema from './schema.js';

/**
 * Store interface for database operations
 *
 * Supports both PGlite and PostgreSQL backends:
 * - Type-safe database operations
 * - Local-first architecture (PGlite)
 * - Full PostgreSQL support
 */
export interface Store<TDrizzle extends DrizzleOps = DrizzleOps> {
  /** Raw database client for direct SQL operations - can be PGlite or compatibility layer */
  readonly pgLite: DatabaseClient;
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

  // System operations
  close(): Promise<void>;
}

/**
 * Generic database store implementation with business methods
 */
export class DatabaseStore<
  TClient extends DatabaseClient = DatabaseClient,
  TDrizzle extends DrizzleOps = DrizzleOps,
> implements Store<TDrizzle>
{
  public readonly pgLite: TClient;
  /** Native Drizzle ORM instance for the selected dialect */
  public readonly sql: TDrizzle;
  public readonly isEncrypted: boolean;
  /** Adapter type to determine which schema to use */
  private readonly adapterType: string;

  constructor(
    client: TClient,
    sql: TDrizzle,
    adapterType: string,
    _isSyncing = false,
    isEncrypted = false
  ) {
    this.pgLite = client;
    this.sql = sql;
    this.adapterType = adapterType;
    this.isEncrypted = isEncrypted;
  }

  /**
   * Get the appropriate schema based on adapter type
   */
  private getSchema() {
    return this.adapterType === 'sqlite' ? sqliteSchema : schema;
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

    // Apply status filtering if statuses are provided
    if (filters.statuses !== undefined) {
      if (filters.statuses.length === 1) {
        const status = filters.statuses[0];
        if (status) {
          conditions.push(eq(this.getSchema().tasks.status, status));
        }
      } else if (filters.statuses.length > 1) {
        conditions.push(inArray(this.getSchema().tasks.status, filters.statuses));
      }
      // If statuses is an empty array, don't add any status filter (show all)
    } else {
      // Default behavior when no statuses parameter is provided: show pending and in-progress
      conditions.push(inArray(this.getSchema().tasks.status, ['pending', 'in-progress']));
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(this.getSchema().tasks.parentId));
      } else {
        conditions.push(eq(this.getSchema().tasks.parentId, filters.parentId));
      }
    }

    // Exclude PROJECT_ROOT from normal listings unless explicitly requested
    if (!filters.includeProjectRoot) {
      conditions.push(ne(this.getSchema().tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.sql
      .select({
        id: this.getSchema().tasks.id,
        parentId: this.getSchema().tasks.parentId,
        title: this.getSchema().tasks.title,
        description: this.getSchema().tasks.description,
        status: this.getSchema().tasks.status,
        priorityScore: this.getSchema().tasks.priorityScore,
        prd: this.getSchema().tasks.prd,
        contextDigest: this.getSchema().tasks.contextDigest,
        createdAt: this.getSchema().tasks.createdAt,
        updatedAt: this.getSchema().tasks.updatedAt,
      })
      .from(this.getSchema().tasks)
      .where(whereClause)
      .orderBy(desc(this.getSchema().tasks.createdAt));

    return this.transformTaskRows(results);
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

    await this.sql.insert(this.getSchema().tasks).values(task);
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.sql
      .select({
        id: this.getSchema().tasks.id,
        parentId: this.getSchema().tasks.parentId,
        title: this.getSchema().tasks.title,
        description: this.getSchema().tasks.description,
        status: this.getSchema().tasks.status,
        priorityScore: this.getSchema().tasks.priorityScore,
        prd: this.getSchema().tasks.prd,
        contextDigest: this.getSchema().tasks.contextDigest,
        createdAt: this.getSchema().tasks.createdAt,
        updatedAt: this.getSchema().tasks.updatedAt,
      })
      .from(this.getSchema().tasks)
      .where(eq(this.getSchema().tasks.id, id))
      .limit(1);

    const transformedTasks = this.transformTaskRows(tasks);
    return transformedTasks[0] || null;
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task | null> {
    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await this.sql
      .update(this.getSchema().tasks)
      .set(updateData)
      .where(eq(this.getSchema().tasks.id, id));

    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.sql
      .delete(this.getSchema().tasks)
      .where(eq(this.getSchema().tasks.id, id))
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
      .select()
      .from(this.getSchema().contextSlices)
      .where(eq(this.getSchema().contextSlices.taskId, taskId))
      .orderBy(desc(this.getSchema().contextSlices.createdAt));
  }

  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    const now = new Date();
    const contextSlice: ContextSlice = {
      id: data.id || randomUUID(),
      title: data.title,
      description: data.description ?? null,
      taskId: data.taskId ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.sql.insert(this.getSchema().contextSlices).values(contextSlice);
    return contextSlice;
  }

  // System operations
  async close(): Promise<void> {
    // Close database connection
    await this.pgLite.close();
  }

  /**
   * Transform database rows to proper Task objects with Date conversion
   * SQLite returns timestamps as numbers, but Task type expects Date objects
   */
  private transformTaskRows(results: Record<string, unknown>[]): Task[] {
    return results.map((row) => ({
      ...row,
      createdAt: typeof row.createdAt === 'number' ? new Date(row.createdAt) : row.createdAt,
      updatedAt: typeof row.updatedAt === 'number' ? new Date(row.updatedAt) : row.updatedAt,
    })) as Task[];
  }
}
