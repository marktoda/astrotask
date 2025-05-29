import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateTask as NewTask, Task, TaskStatus } from '../schemas/task.js';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import { generateNextTaskId } from '../utils/taskId.js';
import type { ElectricConnection } from './electric.js';
import * as schema from './schema.js';

/**
 * Store interface for local-first database operations
 *
 * Combines PGlite, Drizzle ORM, and ElectricSQL for:
 * - Type-safe database operations
 * - Real-time sync capabilities
 * - Local-first architecture
 */
export interface Store {
  /** Raw PGlite client for direct SQL operations */
  readonly pgLite: PGlite;
  /** Type-safe Drizzle ORM instance */
  readonly sql: PgliteDatabase<typeof schema>;
  /** ElectricSQL sync integration */
  readonly electric: ElectricConnection;
  /** Whether encryption is enabled */
  readonly isEncrypted: boolean;
  /** Whether sync is currently active */
  readonly isSyncing: boolean;

  // Task operations
  listTasks(filters?: {
    status?: TaskStatus;
    parentId?: string | null;
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
  enableSync(table: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Database store implementation with business methods
 */
export class DatabaseStore implements Store {
  public readonly pgLite: PGlite;
  public readonly sql: PgliteDatabase<typeof schema>;
  public readonly electric: ElectricConnection;
  public readonly isEncrypted: boolean;

  constructor(
    pgLite: PGlite,
    sql: PgliteDatabase<typeof schema>,
    electric: ElectricConnection,
    isEncrypted: boolean
  ) {
    this.pgLite = pgLite;
    this.sql = sql;
    this.electric = electric;
    this.isEncrypted = isEncrypted;
  }

  get isSyncing(): boolean {
    return this.electric.isConnected && this.electric.constructor.name !== 'NoOpElectricConnection';
  }

  // Task operations (consolidated)
  async listTasks(
    filters: { status?: TaskStatus; parentId?: string | null } = {}
  ): Promise<Task[]> {
    const conditions = [];

    if (filters.status) {
      conditions.push(eq(schema.tasks.status, filters.status));
    }

    if (filters.parentId === null) {
      conditions.push(isNull(schema.tasks.parentId));
    } else if (filters.parentId) {
      conditions.push(eq(schema.tasks.parentId, filters.parentId));
    }

    if (conditions.length > 0) {
      return this.sql
        .select()
        .from(schema.tasks)
        .where(and(...conditions))
        .orderBy(desc(schema.tasks.updatedAt));
    }

    return this.sql.select().from(schema.tasks).orderBy(desc(schema.tasks.updatedAt));
  }

  async addTask(data: NewTask): Promise<Task> {
    // Determine the actual parentId for database storage
    // If no parentId is specified, use PROJECT_ROOT as the parent
    const actualParentId = data.parentId ?? TASK_IDENTIFIERS.PROJECT_ROOT;

    // For task ID generation, treat PROJECT_ROOT as "silent" - don't include it in task IDs
    // Tasks with PROJECT_ROOT as parent should get root-level task IDs
    const taskIdParent =
      data.parentId === TASK_IDENTIFIERS.PROJECT_ROOT ? undefined : data.parentId;

    const taskData = {
      id: await generateNextTaskId(this, taskIdParent),
      parentId: actualParentId,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      prd: data.prd ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [task] = await this.sql.insert(schema.tasks).values(taskData).returning();
    if (!task) {
      throw new Error('Failed to create task');
    }
    return task;
  }

  async addTaskWithId(data: NewTask & { id: string }): Promise<Task> {
    const taskData = {
      id: data.id,
      parentId: data.parentId ?? null,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      prd: data.prd ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [task] = await this.sql.insert(schema.tasks).values(taskData).returning();
    if (!task) {
      throw new Error('Failed to create task');
    }
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const result = await this.sql.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return result[0] || null;
  }

  async updateTask(
    id: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>
  ): Promise<Task | null> {
    const result = await this.sql
      .update(schema.tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning();
    return result[0] || null;
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await this.sql.delete(schema.tasks).where(eq(schema.tasks.id, id)).returning();
    return result.length > 0;
  }

  // Context slice operations
  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return this.sql
      .select()
      .from(schema.contextSlices)
      .where(eq(schema.contextSlices.taskId, taskId))
      .orderBy(desc(schema.contextSlices.updatedAt));
  }

  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    const contextSliceData = {
      id: data.id || randomUUID(),
      title: data.title,
      description: data.description ?? null,
      taskId: data.taskId ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [contextSlice] = await this.sql
      .insert(schema.contextSlices)
      .values(contextSliceData)
      .returning();
    if (!contextSlice) {
      throw new Error('Failed to create context slice');
    }
    return contextSlice;
  }

  // System operations
  async enableSync(table: string): Promise<void> {
    await this.electric.sync(table);
  }

  async close(): Promise<void> {
    await this.pgLite.close();
    await this.electric.disconnect();
  }

  // Convenience methods for common task queries
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
}
