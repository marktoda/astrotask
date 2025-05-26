import type { Store } from './electric.js';
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
 * Repository class following the ElectricSQL + Drizzle + PGlite guide pattern.
 *
 * Combines:
 * - Snapshot queries via Drizzle ORM
 * - Real-time streams via ElectricSQL
 * - Single-file storage via PGlite
 */
export class Repo {
  constructor(private store: Store) {}

  /**
   * Get the underlying store (for advanced use cases)
   */
  getStore(): Store {
    return this.store;
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  /**
   * List all projects (snapshot query via Drizzle)
   */
  async listProjects(): Promise<Project[]> {
    return this.store.sql.select().from(schema.projects).orderBy(schema.projects.updatedAt);
  }

  /**
   * Create a new project
   */
  async addProject(data: NewProject): Promise<Project> {
    const [project] = await this.store.sql.insert(schema.projects).values(data).returning();

    if (!project) {
      throw new Error('Failed to create project');
    }

    return project;
  }

  /**
   * Get a specific project by ID
   */
  async getProject(id: string): Promise<Project | null> {
    // Use raw SQL to avoid version conflicts
    const result = await this.store.pgLite.query('SELECT * FROM projects WHERE id = $1 LIMIT 1', [
      id,
    ]);

    return (result.rows[0] as Project) || null;
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  /**
   * List tasks, optionally filtered by project
   */
  async listTasks(projectId?: string): Promise<Task[]> {
    if (projectId) {
      const result = await this.store.pgLite.query(
        'SELECT * FROM tasks WHERE project_id = $1 ORDER BY updated_at DESC',
        [projectId]
      );
      return result.rows as Task[];
    }

    const result = await this.store.pgLite.query('SELECT * FROM tasks ORDER BY updated_at DESC');
    return result.rows as Task[];
  }

  /**
   * Create a new task
   */
  async addTask(data: NewTask): Promise<Task> {
    const [task] = await this.store.sql.insert(schema.tasks).values(data).returning();

    if (!task) {
      throw new Error('Failed to create task');
    }

    return task;
  }

  /**
   * Get a specific task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    const result = await this.store.pgLite.query('SELECT * FROM tasks WHERE id = $1 LIMIT 1', [id]);

    return (result.rows[0] as Task) || null;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(id: string, status: string): Promise<Task | null> {
    const result = await this.store.pgLite.query(
      'UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [status, new Date().toISOString(), id]
    );

    return (result.rows[0] as Task) || null;
  }

  // ---------------------------------------------------------------------------
  // Context Slices
  // ---------------------------------------------------------------------------

  /**
   * List context slices for a task
   */
  async listContextSlices(taskId: string): Promise<ContextSlice[]> {
    const result = await this.store.pgLite.query(
      'SELECT * FROM context_slices WHERE task_id = $1 ORDER BY updated_at DESC',
      [taskId]
    );

    return result.rows as ContextSlice[];
  }

  /**
   * Create a new context slice
   */
  async addContextSlice(data: NewContextSlice): Promise<ContextSlice> {
    const [contextSlice] = await this.store.sql
      .insert(schema.contextSlices)
      .values(data)
      .returning();

    if (!contextSlice) {
      throw new Error('Failed to create context slice');
    }

    return contextSlice;
  }

  // ---------------------------------------------------------------------------
  // Real-time features (for apps that need them)
  // ---------------------------------------------------------------------------

  /**
   * Check if real-time sync is active
   */
  isSyncing(): boolean {
    return this.store.isSyncing;
  }

  /**
   * Enable sync for a specific table
   */
  async enableSync(table: string): Promise<void> {
    await this.store.electric.sync(table);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Close the repository and clean up connections
   */
  async close(): Promise<void> {
    await this.store.close();
  }
}
