import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateTask as NewTask, Task, TaskStatus } from '../schemas/task.js';
import { generateNextTaskId } from '../utils/taskId.js';
import { TASK_IDENTIFIERS } from '../utils/TaskTreeConstants.js';
import * as schema from './schema.js';

/**
 * Store interface for local-first database operations
 *
 * Combines PGlite, Drizzle ORM, and optional Electric SQL sync for:
 * - Type-safe database operations
 * - Real-time sync capabilities (when enabled)
 * - Local-first architecture
 */
export interface Store {
  /** Raw PGlite client for direct SQL operations */
  readonly pgLite: PGlite;
  /** Type-safe Drizzle ORM instance */
  readonly sql: PgliteDatabase<typeof schema>;
  /** Whether encryption is enabled */
  readonly isEncrypted: boolean;
  /** Whether sync is currently active */
  readonly isSyncing: boolean;

  // Task operations
  listTasks(filters?: {
    status?: TaskStatus;
    parentId?: string | null;
    includeProjectRoot?: boolean;
  }): Promise<Task[]>;
  addTask(data: NewTask): Promise<Task>;
  addTaskWithId(data: NewTask & { id: string }): Promise<Task>;
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
 * Database store implementation with business methods
 */
export class DatabaseStore implements Store {
  public readonly pgLite: PGlite;
  public readonly sql: PgliteDatabase<typeof schema>;
  public readonly isEncrypted: boolean;
  public readonly isSyncing: boolean;

  constructor(
    pgLite: PGlite,
    sql: PgliteDatabase<typeof schema>,
    isSyncing = false,
    isEncrypted = false
  ) {
    this.pgLite = pgLite;
    this.sql = sql;
    this.isSyncing = isSyncing;
    this.isEncrypted = isEncrypted;
  }

  // Task operations
  async listTasks(
    filters: {
      status?: TaskStatus;
      parentId?: string | null;
      includeProjectRoot?: boolean;
    } = {}
  ): Promise<Task[]> {
    const conditions = [];

    if (filters.status) {
      conditions.push(eq(schema.tasks.status, filters.status));
    }

    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(schema.tasks.parentId));
      } else {
        conditions.push(eq(schema.tasks.parentId, filters.parentId));
      }
    }

    // Exclude PROJECT_ROOT from normal listings unless explicitly requested
    if (!filters.includeProjectRoot) {
      conditions.push(ne(schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await this.sql
      .select()
      .from(schema.tasks)
      .where(whereClause)
      .orderBy(desc(schema.tasks.createdAt));
  }

  async addTask(data: NewTask): Promise<Task> {
    const id = await generateNextTaskId(this, data.parentId);
    return await this.addTaskWithId({ ...data, id });
  }

  async addTaskWithId(data: NewTask & { id: string }): Promise<Task> {
    const now = new Date();
    const task: Task = {
      id: data.id,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      prd: data.prd ?? null,
      contextDigest: data.contextDigest ?? null,
      parentId: data.parentId ?? TASK_IDENTIFIERS.PROJECT_ROOT,
      createdAt: now,
      updatedAt: now,
    };

    await this.sql.insert(schema.tasks).values(task);
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.sql
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id))
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

    await this.sql.update(schema.tasks).set(updateData).where(eq(schema.tasks.id, id));

    return this.getTask(id);
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.sql
      .delete(schema.tasks)
      .where(eq(schema.tasks.id, id))
      .returning({ id: schema.tasks.id });

    return result.length > 0;
  }

  // Convenience methods
  async listTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.listTasks({ status });
  }

  async listRootTasks(): Promise<Task[]> {
    return this.listTasks({ parentId: TASK_IDENTIFIERS.PROJECT_ROOT });
  }

  async listSubtasks(parentId: string): Promise<Task[]> {
    return this.listTasks({ parentId });
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    return this.updateTask(id, { status });
  }

  // Context slice operations
  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return await this.sql
      .select()
      .from(schema.contextSlices)
      .where(eq(schema.contextSlices.taskId, taskId))
      .orderBy(desc(schema.contextSlices.createdAt));
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

    await this.sql.insert(schema.contextSlices).values(contextSlice);
    return contextSlice;
  }

  // System operations
  async close(): Promise<void> {
    // Close PGlite connection
    await this.pgLite.close();
  }
}
