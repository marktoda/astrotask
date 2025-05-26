import type { PGlite } from '@electric-sql/pglite';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { ElectricConnection } from './electric.js';
import {
  type ContextSlice,
  type NewContextSlice,
  type NewProject,
  type NewTask,
  type Project,
  type Task,
  schema,
} from './schema.js';

/**
 * Store interface following the ElectricSQL + Drizzle + PGlite guide pattern
 *
 * Combines:
 * - Raw PGlite client for direct SQL operations
 * - Type-safe Drizzle ORM instance
 * - Real-time sync via ElectricSQL
 * - Single-file storage
 */
export interface Store {
  /** Raw PGlite client for direct SQL operations */
  pgLite: PGlite;
  /** Type-safe Drizzle ORM instance */
  sql: PgliteDatabase<typeof schema>;
  /** ElectricSQL sync integration */
  electric: ElectricConnection;
  /** Whether encryption is enabled */
  isEncrypted: boolean;
  /** Whether sync is currently active */
  get isSyncing(): boolean;

  // Business Methods - Projects
  listProjects(): Promise<Project[]>;
  addProject(data: NewProject): Promise<Project>;
  getProject(id: string): Promise<Project | null>;

  // Business Methods - Tasks
  listTasks(projectId?: string): Promise<Task[]>;
  addTask(data: NewTask): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTaskStatus(id: string, status: string): Promise<Task | null>;

  // Extended Task Methods
  listTasksByStatus(status: string, projectId?: string): Promise<Task[]>;
  listRootTasks(projectId?: string): Promise<Task[]>;
  listSubtasks(parentId: string): Promise<Task[]>;
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

  // Business Methods - Context Slices
  listContextSlices(taskId: string): Promise<ContextSlice[]>;
  addContextSlice(data: NewContextSlice): Promise<ContextSlice>;

  // Real-time features
  enableSync(table: string): Promise<void>;

  /** Close all connections and cleanup */
  close(): Promise<void>;
}

/**
 * Store class implementing the Store interface with business methods
 */
export class DatabaseStore implements Store {
  public readonly pgLite: PGlite;
  public readonly sql: PgliteDatabase<typeof schema>;
  public readonly electric: ElectricConnection;
  public readonly isEncrypted: boolean;
  private readonly verbose: boolean;

  constructor(
    pgLite: PGlite,
    sql: PgliteDatabase<typeof schema>,
    electric: ElectricConnection,
    isEncrypted: boolean,
    verbose = false
  ) {
    this.pgLite = pgLite;
    this.sql = sql;
    this.electric = electric;
    this.isEncrypted = isEncrypted;
    this.verbose = verbose;
  }

  get isSyncing(): boolean {
    return this.electric.isConnected && this.electric.constructor.name !== 'NoOpElectricConnection';
  }

  // Business Methods - Projects
  async listProjects(): Promise<Project[]> {
    return this.sql.select().from(schema.projects).orderBy(schema.projects.updatedAt);
  }

  async addProject(data: NewProject): Promise<Project> {
    const [project] = await this.sql.insert(schema.projects).values(data).returning();
    if (!project) {
      throw new Error('Failed to create project');
    }
    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const result = await this.sql.select().from(schema.projects).where(eq(schema.projects.id, id));
    return result[0] || null;
  }

  // Business Methods - Tasks
  async listTasks(projectId?: string): Promise<Task[]> {
    if (projectId) {
      return this.sql
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.projectId, projectId))
        .orderBy(desc(schema.tasks.updatedAt));
    }
    return this.sql.select().from(schema.tasks).orderBy(desc(schema.tasks.updatedAt));
  }

  async addTask(data: NewTask): Promise<Task> {
    const [task] = await this.sql.insert(schema.tasks).values(data).returning();
    if (!task) {
      throw new Error('Failed to create task');
    }
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    const result = await this.sql.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return result[0] || null;
  }

  async updateTaskStatus(id: string, status: string): Promise<Task | null> {
    const result = await this.sql
      .update(schema.tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning();
    return result[0] || null;
  }

  // Business Methods - Context Slices
  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    return this.sql
      .select()
      .from(schema.contextSlices)
      .where(eq(schema.contextSlices.taskId, taskId))
      .orderBy(desc(schema.contextSlices.updatedAt));
  }

  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    const [contextSlice] = await this.sql.insert(schema.contextSlices).values(data).returning();
    if (!contextSlice) {
      throw new Error('Failed to create context slice');
    }
    return contextSlice;
  }

  // Real-time features
  async enableSync(table: string): Promise<void> {
    await this.electric.sync(table);
  }

  /** Close all connections and cleanup */
  async close(): Promise<void> {
    await this.electric.disconnect();
    await this.pgLite.close();
    if (this.verbose) {
      console.info('Store closed');
    }
  }

  // Extended Task Methods
  async listTasksByStatus(status: string, projectId?: string): Promise<Task[]> {
    const conditions = [eq(schema.tasks.status, status)];
    if (projectId) {
      conditions.push(eq(schema.tasks.projectId, projectId));
    }
    return this.sql
      .select()
      .from(schema.tasks)
      .where(and(...conditions))
      .orderBy(desc(schema.tasks.updatedAt));
  }

  async listRootTasks(projectId?: string): Promise<Task[]> {
    const conditions = [isNull(schema.tasks.parentId)];
    if (projectId) {
      conditions.push(eq(schema.tasks.projectId, projectId));
    }
    return this.sql
      .select()
      .from(schema.tasks)
      .where(and(...conditions))
      .orderBy(desc(schema.tasks.updatedAt));
  }

  async listSubtasks(parentId: string): Promise<Task[]> {
    return this.sql
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.parentId, parentId))
      .orderBy(desc(schema.tasks.updatedAt));
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
}
