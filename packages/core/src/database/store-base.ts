import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { TASK_IDENTIFIERS } from '../entities/TaskTreeConstants.js';
import type {
  ContextSlice,
  CreateContextSlice as NewContextSlice,
} from '../schemas/contextSlice.js';
import type { CreateTask, Task, TaskStatus } from '../schemas/task.js';
import type { DrizzleOps } from './adapters/types.js';
import type { postgresSchema, sqliteSchema } from './schema.js';

/**
 * Base class for database store operations
 * 
 * This class consolidates common CRUD operations that were previously duplicated
 * between DatabaseStore and DatabaseTransactionStore. It follows the DRY principle
 * by extracting shared functionality into a single base class.
 * 
 * Key benefits:
 * - Eliminates ~200 lines of duplicate code
 * - Ensures consistent behavior between regular and transaction stores
 * - Makes it easier to add new operations that work in both contexts
 * - Simplifies maintenance by having a single source of truth
 * 
 * The only abstract method is `addTask` because it has different implementations:
 * - DatabaseStore: Generates sequential IDs using the ID generator
 * - DatabaseTransactionStore: Uses UUIDs for simplicity in transactions
 */
export abstract class BaseStore<TDrizzle extends DrizzleOps = DrizzleOps> {
  public readonly sql: TDrizzle;
  protected readonly schema: typeof postgresSchema | typeof sqliteSchema;
  
  // Predefined selections for query optimization
  protected readonly taskSelection: Record<string, unknown>;
  protected readonly contextSliceSelection: Record<string, unknown>;
  protected readonly taskDependencySelection: Record<string, unknown>;

  constructor(sql: TDrizzle, schema: typeof postgresSchema | typeof sqliteSchema) {
    this.sql = sql;
    this.schema = schema;
    
    // Initialize predefined selections
    this.taskSelection = this.createTaskSelection(schema);
    this.contextSliceSelection = this.createContextSliceSelection(schema);
    this.taskDependencySelection = this.createTaskDependencySelection(schema);
  }

  // Selection creators
  private createTaskSelection(schema: typeof postgresSchema | typeof sqliteSchema) {
    return {
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
    };
  }

  private createContextSliceSelection(schema: typeof postgresSchema | typeof sqliteSchema) {
    return {
      id: schema.contextSlices.id,
      title: schema.contextSlices.title,
      description: schema.contextSlices.description,
      contextType: schema.contextSlices.contextType,
      taskId: schema.contextSlices.taskId,
      contextDigest: schema.contextSlices.contextDigest,
      createdAt: schema.contextSlices.createdAt,
      updatedAt: schema.contextSlices.updatedAt,
    };
  }

  private createTaskDependencySelection(schema: typeof postgresSchema | typeof sqliteSchema) {
    return {
      dependencyTaskId: schema.taskDependencies.dependencyTaskId,
    };
  }

  // Common task operations
  async listTasks(
    filters: {
      statuses?: TaskStatus[];
      parentId?: string | null;
      includeProjectRoot?: boolean;
    } = {}
  ): Promise<Task[]> {
    const conditions = this.buildTaskFilterConditions(filters);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    return await this.sql
      .select(this.taskSelection)
      .from(this.schema.tasks)
      .where(whereClause)
      .orderBy(desc(this.schema.tasks.createdAt));
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

  // Helper methods
  protected buildTaskFilterConditions(filters: {
    statuses?: TaskStatus[];
    parentId?: string | null;
    includeProjectRoot?: boolean;
  }) {
    const conditions = [];
    
    // Status filtering
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
      // Default to pending and in-progress if no status filter provided
      conditions.push(inArray(this.schema.tasks.status, ['pending', 'in-progress']));
    }
    
    // Parent ID filtering
    if (filters.parentId !== undefined) {
      if (filters.parentId === null) {
        conditions.push(isNull(this.schema.tasks.parentId));
      } else {
        conditions.push(eq(this.schema.tasks.parentId, filters.parentId));
      }
    }
    
    // Project root filtering
    if (!filters.includeProjectRoot) {
      conditions.push(ne(this.schema.tasks.id, TASK_IDENTIFIERS.PROJECT_ROOT));
    }
    
    return conditions;
  }

  // Abstract method that must be implemented by subclasses
  abstract addTask(data: CreateTask): Promise<Task>;
} 