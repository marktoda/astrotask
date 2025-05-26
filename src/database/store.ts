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

  // Hierarchical Operations
  /** Recursively build the task tree starting from the provided root task ID */
  getTaskTree(rootId: string, maxDepth?: number): Promise<TaskTree | null>;
  /** Return all ancestor tasks up to the root (closest first, root last) */
  getTaskAncestors(taskId: string): Promise<Task[]>;
  /** Return every descendant (children, grandchildren, etc.) of a task */
  getTaskDescendants(taskId: string): Promise<Task[]>;
  /** Return depth (distance from root) of the task in its hierarchy */
  getTaskDepth(taskId: string): Promise<number>;
  /** Calculate completion ratio (0-1) of a task based on its subtasks */
  calculateTaskProgress(taskId: string): Promise<number>;
  /** Aggregate status counts for whole hierarchy beginning at root */
  getHierarchyStats(rootId: string): Promise<Record<string, number>>;
}

// Add after Task type import
export interface TaskTree extends Task {
  children: TaskTree[];
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

  // ---------------------------------------------------------------------------
  // Hierarchical Operations
  // ---------------------------------------------------------------------------

  /** Helper to recursively build a TaskTree */
  private async buildTaskTree(node: Task, depthLeft: number): Promise<TaskTree> {
    if (depthLeft === 0) {
      return { ...node, children: [] };
    }
    const children = await this.listSubtasks(node.id);
    const childTrees: TaskTree[] = [];
    for (const child of children) {
      childTrees.push(await this.buildTaskTree(child, depthLeft - 1));
    }
    return { ...node, children: childTrees };
  }

  async getTaskTree(rootId: string, maxDepth = Number.POSITIVE_INFINITY): Promise<TaskTree | null> {
    const root = await this.getTask(rootId);
    if (!root) return null;
    return this.buildTaskTree(root, maxDepth);
  }

  async getTaskAncestors(taskId: string): Promise<Task[]> {
    const ancestors: Task[] = [];
    let current = await this.getTask(taskId);
    while (current?.parentId) {
      const parent = await this.getTask(current.parentId);
      if (!parent) break;
      ancestors.unshift(parent); // root first ordering
      current = parent;
    }
    return ancestors;
  }

  /** Recursively collect descendants */
  private async collectDescendants(parentId: string, bucket: Task[]): Promise<void> {
    const children = await this.listSubtasks(parentId);
    for (const child of children) {
      bucket.push(child);
      await this.collectDescendants(child.id, bucket);
    }
  }

  async getTaskDescendants(taskId: string): Promise<Task[]> {
    const descendants: Task[] = [];
    await this.collectDescendants(taskId, descendants);
    return descendants;
  }

  async getTaskDepth(taskId: string): Promise<number> {
    const ancestors = await this.getTaskAncestors(taskId);
    return ancestors.length;
  }

  /** Map task status to numeric completion ratio */
  private statusToProgress(status: string): number {
    switch (status) {
      case 'done':
        return 1;
      case 'in-progress':
        return 0.5;
      default:
        return 0;
    }
  }

  private async computeProgress(taskId: string): Promise<{ sum: number; count: number }> {
    const task = await this.getTask(taskId);
    if (!task) return { sum: 0, count: 0 };

    const children = await this.listSubtasks(taskId);
    if (children.length === 0) {
      return { sum: this.statusToProgress(task.status), count: 1 };
    }

    let sum = 0;
    let count = 0;
    for (const child of children) {
      const { sum: childSum, count: childCount } = await this.computeProgress(child.id);
      sum += childSum;
      count += childCount;
    }
    return { sum, count };
  }

  async calculateTaskProgress(taskId: string): Promise<number> {
    const { sum, count } = await this.computeProgress(taskId);
    return count === 0 ? 0 : sum / count;
  }

  async getHierarchyStats(rootId: string): Promise<Record<string, number>> {
    const stats: { [key: string]: number; total: number } = {
      pending: 0,
      'in-progress': 0,
      done: 0,
      cancelled: 0,
      total: 0,
    };

    const stack: string[] = [rootId];
    while (stack.length) {
      const id = stack.pop() as string;
      const task = await this.getTask(id);
      if (!task) continue;
      stats.total += 1;
      stats[task.status] = (stats[task.status] || 0) + 1;

      const children = await this.listSubtasks(id);
      stack.push(...children.map((c) => c.id));
    }
    return stats;
  }
}
