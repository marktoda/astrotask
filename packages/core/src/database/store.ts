import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { ElectricConnection } from './electric.js';
import { schema } from './schema.js';

// Import types from Zod schemas (single source of truth)
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateProject as NewProject, Project } from '../schemas/project.js';
import type { CreateTask as NewTask, Task, TaskStatus } from '../schemas/task.js';

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

  // Project operations
  listProjects(): Promise<Project[]>;
  addProject(data: NewProject): Promise<Project>;
  getProject(id: string): Promise<Project | null>;

  // Task operations
  listTasks(filters?: {
    projectId?: string;
    status?: TaskStatus;
    parentId?: string | null;
  }): Promise<Task[]>;
  addTask(data: NewTask): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;

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

  // Project operations
  async listProjects(): Promise<Project[]> {
    return this.sql.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt));
  }

  async addProject(data: NewProject): Promise<Project> {
    const projectData = {
      id: data.id || randomUUID(),
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [project] = await this.sql.insert(schema.projects).values(projectData).returning();
    if (!project) {
      throw new Error('Failed to create project');
    }
    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const result = await this.sql.select().from(schema.projects).where(eq(schema.projects.id, id));
    return result[0] || null;
  }

  // Task operations (consolidated)
  async listTasks(
    filters: { projectId?: string; status?: TaskStatus; parentId?: string | null } = {}
  ): Promise<Task[]> {
    const conditions = [];

    if (filters.projectId) {
      conditions.push(eq(schema.tasks.projectId, filters.projectId));
    }

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
    const taskData = {
      id: data.id || randomUUID(),
      parentId: data.parentId ?? null,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      prd: data.prd ?? null,
      contextDigest: data.contextDigest ?? null,
      projectId: data.projectId ?? null,
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
    const contextData = {
      id: data.id || randomUUID(),
      title: data.title,
      description: data.description ?? null,
      taskId: data.taskId ?? null,
      projectId: data.projectId ?? null,
      contextDigest: data.contextDigest ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [contextSlice] = await this.sql
      .insert(schema.contextSlices)
      .values(contextData)
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
    await this.electric.disconnect();
    await this.pgLite.close();
    if (this.verbose) {
      console.info('Store closed');
    }
  }

  // Convenience methods (backward compatibility)
  async listTasksByStatus(status: TaskStatus, projectId?: string): Promise<Task[]> {
    const filters: { status: TaskStatus; projectId?: string } = { status };
    if (projectId) {
      filters.projectId = projectId;
    }
    return this.listTasks(filters);
  }

  async listRootTasks(projectId?: string): Promise<Task[]> {
    const filters: { projectId?: string; parentId: null } = { parentId: null };
    if (projectId) {
      filters.projectId = projectId;
    }
    return this.listTasks(filters);
  }

  async listSubtasks(parentId: string): Promise<Task[]> {
    return this.listTasks({ parentId });
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    return this.updateTask(id, { status });
  }
}
