# Electric SQL Sync Integration Design for Astrolabe

## Executive Summary

This design document outlines the integration of Electric SQL v1.0+ into Astrolabe to enable:
- Multiple agentic software developers working on projects concurrently
- Real-time synchronization of task updates between agents and developers
- Efficient sub-tree segmentation for focused work assignments

## Architecture Overview

```
┌─────────────────┐     HTTP + Long-polling      ┌──────────────────┐
│  Agent 1        │◀────────────────────────────▶│                  │
│  (Project A)    │      Shape Subscriptions     │                  │
└─────────────────┘                              │                  │
                                                 │  Electric Sync   │
┌─────────────────┐     HTTP + Long-polling      │  Service         │
│  Agent 2        │◀────────────────────────────▶│  (Port 3000)     │
│  (Project B)    │      Shape Subscriptions     │                  │
└─────────────────┘                              │                  │
                                                 │                  │
┌─────────────────┐     HTTP + Long-polling      │                  │
│  Developer      │◀────────────────────────────▶│                  │
│  (Full Access)  │      Shape Subscriptions     │                  │
└─────────────────┘                              └────────┬─────────┘
                                                          │
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  PostgreSQL      │
                                                 │  (Central DB)    │
                                                 └──────────────────┘
```

## Core Design Principles

1. **HTTP-First**: Electric v1.0+ is "all just HTTP" - no custom protocols or WebSocket complications
2. **Shape-Based Segmentation**: Use single-table shapes with where clauses for task isolation
3. **Read-Path Only**: Electric handles read sync; writes go through existing APIs
4. **Progressive Enhancement**: Start with basic sync, add features incrementally

## Shape Design Strategy

### 1. Task Tree Segmentation

Since Electric SQL v1.0+ supports only single-table shapes, we'll use multiple coordinated shapes:

```typescript
// Agent subscribes to a specific project subtree
import { ShapeStream, Shape } from '@electric-sql/client';

// Subscribe to tasks for a project
const taskStream = new ShapeStream({
  url: 'http://localhost:3000/v1/shape',
  params: {
    table: 'tasks',
    where: 'parent_id = $1',
    params: [projectRootId]
  }
});
const taskShape = new Shape(taskStream);

// Subscribe to dependencies for this project  
const depsStream = new ShapeStream({
  url: 'http://localhost:3000/v1/shape',
  params: {
    table: 'task_dependencies',
    where: 'dependent_task_id IN (SELECT id FROM tasks WHERE parent_id = $1)',
    params: [projectRootId]
  }
});
const depsShape = new Shape(depsStream);

// Subscribe to context slices
const contextStream = new ShapeStream({
  url: 'http://localhost:3000/v1/shape',
  params: {
    table: 'context_slices', 
    where: 'task_id IN (SELECT id FROM tasks WHERE parent_id = $1)',
    params: [projectRootId]
  }
});
const contextShape = new Shape(contextStream);
```

### 2. Hierarchical Task Filtering

To handle nested task hierarchies efficiently:

```sql
-- Add a denormalized column to track root project
ALTER TABLE tasks ADD COLUMN root_project_id TEXT;

-- Update via trigger when parent_id changes
CREATE OR REPLACE FUNCTION update_root_project_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id = 'PROJECT_ROOT' THEN
    NEW.root_project_id = NEW.id;
  ELSE
    SELECT root_project_id INTO NEW.root_project_id
    FROM tasks WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This enables efficient filtering:

```typescript
// Agent subscribes to entire project subtree
const projectTasksStream = new ShapeStream({
  url: 'http://localhost:3000/v1/shape',
  params: {
    table: 'tasks',
    where: 'root_project_id = $1',
    params: [assignedProjectId]
  }
});
const projectTasks = new Shape(projectTasksStream);
```

### 3. Status-Based Filtering

Agents can focus on relevant tasks:

```typescript
// Subscribe only to pending/in-progress tasks
const activeTasksStream = new ShapeStream({
  url: 'http://localhost:3000/v1/shape',
  params: {
    table: 'tasks',
    where: 'root_project_id = $1 AND status IN ($2, $3)',
    params: [assignedProjectId, 'pending', 'in-progress']
  }
});
const activeTasks = new Shape(activeTasksStream);
```

## Implementation Plan

### Phase 1: Core Sync Infrastructure

1. **Shape Management Service**
   ```typescript
   // packages/core/src/sync/ShapeManager.ts
   import { ShapeStream, Shape } from '@electric-sql/client';
   import type { Row } from '@electric-sql/client';

   export interface TaskRow extends Row {
     id: string;
     title: string;
     status: string;
     parent_id?: string;
     root_project_id?: string;
   }

   export class ShapeManager {
     private shapes: Map<string, Shape<any>> = new Map();
     private streams: Map<string, ShapeStream<any>> = new Map();
     private electricUrl: string;

     constructor(electricUrl: string = 'http://localhost:3000') {
       this.electricUrl = electricUrl;
     }

     async subscribeToProject(projectId: string) {
       // Subscribe to all tables for a project
       const taskStream = new ShapeStream<TaskRow>({
         url: `${this.electricUrl}/v1/shape`,
         params: {
           table: 'tasks',
           where: 'root_project_id = $1',
           params: [projectId]
         }
       });
       const taskShape = new Shape(taskStream);
       
       this.streams.set(`project-${projectId}-tasks`, taskStream);
       this.shapes.set(`project-${projectId}-tasks`, taskShape);

       // Subscribe to dependencies
       const depsStream = new ShapeStream({
         url: `${this.electricUrl}/v1/shape`,
         params: {
           table: 'task_dependencies',
           where: 'dependent_task_id IN (SELECT id FROM tasks WHERE root_project_id = $1)',
           params: [projectId]
         }
       });
       const depsShape = new Shape(depsStream);
       
       this.streams.set(`project-${projectId}-deps`, depsStream);
       this.shapes.set(`project-${projectId}-deps`, depsShape);

       return { taskShape, depsShape };
     }

     async unsubscribeFromProject(projectId: string) {
       // Clean up shapes when agent completes work
       const taskStream = this.streams.get(`project-${projectId}-tasks`);
       const depsStream = this.streams.get(`project-${projectId}-deps`);
       
       taskStream?.unsubscribeAll();
       depsStream?.unsubscribeAll();
       
       this.streams.delete(`project-${projectId}-tasks`);
       this.streams.delete(`project-${projectId}-deps`);
       this.shapes.delete(`project-${projectId}-tasks`);
       this.shapes.delete(`project-${projectId}-deps`);
     }

     getProjectShapes(projectId: string) {
       return {
         tasks: this.shapes.get(`project-${projectId}-tasks`),
         deps: this.shapes.get(`project-${projectId}-deps`)
       };
     }
   }
   ```

2. **PGlite Integration for Local Storage**
   ```typescript
   // packages/core/src/database/electric-store.ts
   import { PGlite } from '@electric-sql/pglite';
   import { ShapeStream, Shape } from '@electric-sql/client';
   import { drizzle } from 'drizzle-orm/pglite';
   import * as schema from './schema.js';

   export class ElectricStore {
     private pgLite: PGlite;
     private db: ReturnType<typeof drizzle>;
     private shapeManager: ShapeManager;

     constructor(dataDir: string, electricUrl: string) {
       this.shapeManager = new ShapeManager(electricUrl);
     }

     async initialize() {
       // Create local PGlite database
       this.pgLite = await PGlite.create({
         dataDir: this.dataDir
       });

       this.db = drizzle(this.pgLite, { schema });

       // Run migrations
       await migrate(this.db, { migrationsFolder: MIGRATIONS_DIR });
     }

     async syncProjectToLocal(projectId: string) {
       const { taskShape, depsShape } = await this.shapeManager.subscribeToProject(projectId);

       // Subscribe to shape changes and update local database
       taskShape.subscribe(async ({ rows }) => {
         await this.db.transaction(async (tx) => {
           // Clear and repopulate tasks for this project
           await tx.delete(schema.tasks).where(eq(schema.tasks.root_project_id, projectId));
           if (rows.length > 0) {
             await tx.insert(schema.tasks).values(rows);
           }
         });
       });

       // Wait for initial sync
       await taskShape.rows;
     }
   }
   ```

### Phase 2: Agent Assignment System

1. **Agent Workspace**
   ```typescript
   // packages/core/src/agents/AgentWorkspace.ts
   export class AgentWorkspace {
     private store: ElectricStore;
     private agentId: string;
     private projectId: string;
     private apiClient: ApiClient;

     constructor(agentId: string, projectId: string, electricUrl: string) {
       this.agentId = agentId;
       this.projectId = projectId;
       this.store = new ElectricStore(
         `./data/agents/${agentId}`,
         electricUrl
       );
     }

     async initialize() {
       await this.store.initialize();
       await this.store.syncProjectToLocal(this.projectId);
     }

     // Writes go through the API
     async updateTaskStatus(taskId: string, status: string) {
       await this.apiClient.updateTask(taskId, { 
         status,
         updatedAt: new Date()
       });
       // Electric will sync the change back automatically
     }

     async completeTask(taskId: string, details: string) {
       await this.apiClient.updateTask(taskId, {
         status: 'done',
         details,
         completedBy: this.agentId,
         completedAt: new Date()
       });
     }
   }
   ```

2. **Developer Full Access**
   ```typescript
   // Developer subscribes to all active projects
   export async function setupDeveloperSync(electricUrl: string) {
     const shapeManager = new ShapeManager(electricUrl);
     
     // Subscribe to all non-archived tasks
     const allTasksStream = new ShapeStream({
       url: `${electricUrl}/v1/shape`,
       params: {
         table: 'tasks',
         where: 'status != $1',
         params: ['archived']
       }
     });
     const allTasks = new Shape(allTasksStream);

     // Subscribe to all dependencies
     const allDepsStream = new ShapeStream({
       url: `${electricUrl}/v1/shape`,
       params: {
         table: 'task_dependencies'
       }
     });
     const allDeps = new Shape(allDepsStream);

     return { allTasks, allDeps };
   }
   ```

### Phase 3: Write-Path Integration

Since Electric v1.0+ is read-only and Astrolabe doesn't have an API, we'll use Electric's "through-the-database sync" pattern for all users (agents and admins). This provides:

- Full offline capability for everyone
- No need to build or maintain an API
- Consistent architecture across all users
- Automatic optimistic state management

#### Through-the-Database Pattern for All Users

Both agents and admins will use PGlite with a synced/local table split:

```typescript
// packages/core/src/database/sync-schema.ts
import { pgTable, text, timestamp, pgView } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Immutable synced data from Electric
export const tasksSynced = pgTable('tasks_synced', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  parentId: text('parent_id'),
  rootProjectId: text('root_project_id'),
  details: text('details'),
  syncedAt: timestamp('_synced_at', { withTimezone: true }).defaultNow()
});

// Mutable local optimistic state
export const tasksLocal = pgTable('tasks_local', {
  id: text('id').primaryKey(),
  title: text('title'),
  status: text('status'),
  details: text('details'),
  localWriteId: text('_local_write_id').unique().default(sql`gen_random_uuid()`),
  operation: text('_operation').notNull().$type<'insert' | 'update' | 'delete'>(),
  createdAt: timestamp('_created_at', { withTimezone: true }).defaultNow()
});

// Change log for tracking writes
export const changeLog = pgTable('change_log', {
  id: serial('id').primaryKey(),
  tableName: text('table_name').notNull(),
  operation: text('operation').notNull(),
  recordId: text('record_id').notNull(),
  writeId: text('write_id'),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  syncedAt: timestamp('synced_at', { withTimezone: true })
});

// Combined view (defined in SQL as Drizzle doesn't support COALESCE in views yet)
export const tasksViewSQL = sql`
  CREATE OR REPLACE VIEW tasks AS
  SELECT 
    COALESCE(l.id, s.id) as id,
    COALESCE(l.title, s.title) as title,
    COALESCE(l.status, s.status) as status,
    COALESCE(l.details, s.details) as details,
    s.parent_id,
    s.root_project_id
  FROM tasks_synced s
  FULL OUTER JOIN tasks_local l ON s.id = l.id
  WHERE l._operation IS NULL OR l._operation != 'delete'
`;
```

```typescript
// packages/core/src/database/SyncedDatabase.ts
import { PGlite } from '@electric-sql/pglite';
import { live } from '@electric-sql/pglite/live';
import { drizzle } from 'drizzle-orm/pglite';
import { ShapeStream, Shape } from '@electric-sql/client';
import { eq, and, inArray } from 'drizzle-orm';
import * as syncSchema from './sync-schema';
import * as mainSchema from './schema';

export class SyncedDatabase {
  private pglite: PGlite;
  private db: ReturnType<typeof drizzle>;
  private shapes: Map<string, Shape<any>> = new Map();
  private userId: string;
  private isAdmin: boolean;

  constructor(userId: string, isAdmin: boolean = false) {
    this.userId = userId;
    this.isAdmin = isAdmin;
  }

  async initialize() {
    // Create local PGlite with live queries
    this.pglite = await PGlite.create({
      dataDir: `./data/users/${this.userId}`,
      extensions: { live }
    });

    this.db = drizzle(this.pglite, { 
      schema: { ...mainSchema, ...syncSchema } 
    });

    // Set up schema
    await this.setupSchema();

    // Start Electric sync
    await this.startElectricSync();

    // Start write-path sync
    await this.startWriteSync();
  }

  private async setupSchema() {
    // Create tables using raw SQL for now (until Drizzle migration support improves)
    await this.pglite.exec(`
      -- Create synced/local tables
      ${syncSchema.tasksSynced}
      ${syncSchema.tasksLocal}
      ${syncSchema.changeLog}
      
      -- Create combined view
      ${syncSchema.tasksViewSQL}

      -- INSTEAD OF trigger for the view
      CREATE OR REPLACE FUNCTION handle_task_write() RETURNS TRIGGER AS $$
      DECLARE
        write_id TEXT;
      BEGIN
        write_id := gen_random_uuid();
        
        IF TG_OP = 'INSERT' THEN
          INSERT INTO tasks_local (id, title, status, details, _operation, _local_write_id)
          VALUES (NEW.id, NEW.title, NEW.status, NEW.details, 'insert', write_id);
          
          INSERT INTO change_log (table_name, operation, record_id, write_id)
          VALUES ('tasks', 'insert', NEW.id, write_id);
          
          NOTIFY changes, json_build_object(
            'operation', 'insert',
            'id', NEW.id,
            'writeId', write_id
          )::text;
          
          RETURN NEW;
          
        ELSIF TG_OP = 'UPDATE' THEN
          -- Only store changed fields
          INSERT INTO tasks_local (id, _operation, _local_write_id)
          VALUES (NEW.id, 'update', write_id)
          ON CONFLICT (id) DO UPDATE SET
            title = CASE WHEN NEW.title IS DISTINCT FROM OLD.title THEN NEW.title ELSE tasks_local.title END,
            status = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE tasks_local.status END,
            details = CASE WHEN NEW.details IS DISTINCT FROM OLD.details THEN NEW.details ELSE tasks_local.details END,
            _operation = 'update',
            _local_write_id = write_id;
            
          INSERT INTO change_log (table_name, operation, record_id, write_id)
          VALUES ('tasks', 'update', NEW.id, write_id);
          
          NOTIFY changes, json_build_object(
            'operation', 'update',
            'id', NEW.id,
            'writeId', write_id
          )::text;
          
          RETURN NEW;
        END IF;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER tasks_write_trigger
      INSTEAD OF INSERT OR UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION handle_task_write();
    `);
  }

  private async startElectricSync() {
    // Different sync scopes for agents vs admins
    const whereClause = this.isAdmin 
      ? 'status != $1'  // Admins see everything except archived
      : 'root_project_id = $1';  // Agents see only their project
    
    const params = this.isAdmin 
      ? ['archived'] 
      : [this.userId]; // For agents, userId is their assigned projectId

    const stream = new ShapeStream({
      url: 'http://localhost:3000/v1/shape',
      params: {
        table: 'tasks',
        where: whereClause,
        params: params
      }
    });

    const shape = new Shape(stream);
    this.shapes.set('tasks', shape);

    // Subscribe to shape changes and update synced table
    shape.subscribe(async ({ rows }) => {
      await this.db.transaction(async (tx) => {
        // Clear existing synced data
        if (this.isAdmin) {
          await tx.delete(syncSchema.tasksSynced);
        } else {
          await tx.delete(syncSchema.tasksSynced)
            .where(eq(syncSchema.tasksSynced.rootProjectId, this.userId));
        }

        // Insert new synced data
        if (rows.length > 0) {
          await tx.insert(syncSchema.tasksSynced).values(
            rows.map(row => ({
              id: row.id,
              title: row.title,
              status: row.status,
              parentId: row.parent_id,
              rootProjectId: row.root_project_id,
              details: row.details
            }))
          );
        }

        // Clean up local optimistic state for synced writes
        const syncedWriteIds = await tx
          .select({ writeId: syncSchema.changeLog.writeId })
          .from(syncSchema.changeLog)
          .where(eq(syncSchema.changeLog.status, 'synced'));

        if (syncedWriteIds.length > 0) {
          await tx.delete(syncSchema.tasksLocal)
            .where(inArray(
              syncSchema.tasksLocal.localWriteId, 
              syncedWriteIds.map(s => s.writeId!)
            ));
        }
      });
    });
  }

  private async startWriteSync() {
    const { Client } = await import('pg');
    
    // Listen for local changes
    await this.pglite.listen('changes', async (payload) => {
      const change = JSON.parse(payload);
      
      // Connect to Postgres
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      
      try {
        // Get local data using Drizzle
        const localData = await this.db
          .select()
          .from(syncSchema.tasksLocal)
          .where(eq(syncSchema.tasksLocal.id, change.id))
          .limit(1);

        if (localData.length === 0) return;

        const row = localData[0];
        
        // Sync to Postgres based on operation
        if (change.operation === 'insert') {
          // For inserts, we need the full data from the view
          const fullData = await this.pglite.query(
            'SELECT * FROM tasks WHERE id = $1',
            [change.id]
          );
          
          if (fullData.rows.length > 0) {
            const task = fullData.rows[0];
            await client.query(`
              INSERT INTO tasks (id, title, status, parent_id, root_project_id, details, created_by)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [task.id, task.title, task.status, task.parent_id, 
                task.root_project_id, task.details, this.userId]);
          }
        } else if (change.operation === 'update') {
          // Build dynamic update based on what changed
          const updates: string[] = [];
          const values: any[] = [];
          let paramCount = 1;

          if (row.title !== null) {
            updates.push(`title = $${paramCount++}`);
            values.push(row.title);
          }
          if (row.status !== null) {
            updates.push(`status = $${paramCount++}`);
            values.push(row.status);
          }
          if (row.details !== null) {
            updates.push(`details = $${paramCount++}`);
            values.push(row.details);
          }

          if (updates.length > 0) {
            updates.push(`updated_by = $${paramCount++}`);
            values.push(this.userId);
            updates.push(`updated_at = NOW()`);
            
            values.push(change.id); // for WHERE clause
            
            await client.query(
              `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount}`,
              values
            );
          }
        }

        // Mark as synced
        await this.db
          .update(syncSchema.changeLog)
          .set({ 
            status: 'synced', 
            syncedAt: new Date() 
          })
          .where(eq(syncSchema.changeLog.writeId, change.writeId));

      } catch (error) {
        // Mark as failed
        await this.db
          .update(syncSchema.changeLog)
          .set({ status: 'failed' })
          .where(eq(syncSchema.changeLog.writeId, change.writeId));

        // Log error (in production, might want more sophisticated handling)
        console.error('Sync failed:', error);
      } finally {
        await client.end();
      }
    });
  }

  // Public API using Drizzle
  async getTasks() {
    // Use the view which combines synced and local state
    const result = await this.pglite.query('SELECT * FROM tasks ORDER BY title');
    return result.rows;
  }

  async getTasksByStatus(status: string) {
    const result = await this.pglite.query(
      'SELECT * FROM tasks WHERE status = $1',
      [status]
    );
    return result.rows;
  }

  async createTask(task: { id: string; title: string; parentId?: string }) {
    // Writes go through the view, triggering local state management
    await this.pglite.query(`
      INSERT INTO tasks (id, title, status, parent_id, root_project_id)
      VALUES ($1, $2, 'pending', $3, $4)
    `, [task.id, task.title, task.parentId, 
        task.parentId === 'PROJECT_ROOT' ? task.id : null]);
  }

  async updateTask(id: string, updates: { status?: string; details?: string }) {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    if (updates.status !== undefined) {
      setClause.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }
    if (updates.details !== undefined) {
      setClause.push(`details = $${paramCount++}`);
      values.push(updates.details);
    }

    values.push(id);
    
    await this.pglite.query(
      `UPDATE tasks SET ${setClause.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  async close() {
    this.shapes.forEach(shape => shape.unsubscribe());
    await this.pglite.close();
  }
}
```

```typescript
// packages/core/src/agents/AgentWorkspace.ts
export class AgentWorkspace {
  private db: SyncedDatabase;

  constructor(agentId: string, projectId: string) {
    // For agents, we pass projectId as userId since they're scoped to a project
    this.db = new SyncedDatabase(projectId, false);
  }

  async initialize() {
    await this.db.initialize();
  }

  async getNextTask() {
    const tasks = await this.db.getTasksByStatus('pending');
    return tasks[0];
  }

  async completeTask(taskId: string, details: string) {
    await this.db.updateTask(taskId, {
      status: 'done',
      details
    });
  }
}
```

```typescript
// packages/core/src/admin/AdminInterface.ts  
export class AdminInterface {
  private db: SyncedDatabase;

  constructor(adminId: string) {
    // Admins have full access
    this.db = new SyncedDatabase(adminId, true);
  }

  async initialize() {
    await this.db.initialize();
  }

  async getAllTasks() {
    return this.db.getTasks();
  }

  async createProject(title: string) {
    const projectId = uuidv4();
    await this.db.createTask({
      id: projectId,
      title,
      parentId: 'PROJECT_ROOT'
    });
    return projectId;
  }

  async assignProjectToAgent(projectId: string, agentId: string) {
    // This would update metadata, but agents filter by projectId automatically
    await this.db.updateTask(projectId, {
      details: JSON.stringify({ assignedAgent: agentId })
    });
  }
}
```

#### Benefits of This Approach

1. **Unified Architecture**: Both agents and admins use the same sync pattern
2. **Full Offline Support**: Everyone can work offline with automatic sync
3. **Drizzle Integration**: Uses Drizzle ORM where possible for type safety
4. **No API Needed**: Eliminates the need to build and maintain a separate API
5. **Automatic Conflict Resolution**: Last-write-wins with optimistic state
6. **Simple Mental Model**: Just write to local DB, sync happens automatically

#### Implementation Notes

- The view + trigger pattern redirects all writes to local state
- Electric syncs read state, local changes sync via change log
- Agents see only their project, admins see everything
- Uses Drizzle for queries where possible, raw SQL only for advanced features
- PGlite provides the local database with live query support

## Configuration & Deployment

### Docker Compose Setup
```yaml
version: "3.8"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: astrolabe
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    command:
      - -c
      - wal_level=logical

  electric:
    image: electricsql/electric:1.0.17
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/astrolabe
      ELECTRIC_INSECURE: "true"  # For development only
    ports:
      - "3000:3000"
    depends_on:
      - postgres
```

### Environment Variables
```env
# Electric Configuration
ELECTRIC_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/astrolabe

# API Configuration  
API_URL=http://localhost:8080
API_AUTH_SECRET=your-secret-key

# Agent Configuration
AGENT_WORKSPACE_DIR=./data/agents
AGENT_SYNC_INTERVAL=5000
```

### Migration Strategy

1. **Add Required Columns**
   ```sql
   -- migrations/001_add_electric_columns.sql
   ALTER TABLE tasks ADD COLUMN root_project_id TEXT;
   ALTER TABLE tasks ADD COLUMN assigned_agent TEXT;
   ALTER TABLE tasks ADD COLUMN completed_by TEXT;
   ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMPTZ;

   -- Create trigger for root_project_id
   CREATE TRIGGER update_task_root_project_id
   BEFORE INSERT OR UPDATE ON tasks
   FOR EACH ROW
   EXECUTE FUNCTION update_root_project_id();
   ```

2. **No Electric-Specific Table Changes Required**
   ```typescript
   // Unlike old Electric, no need for:
   // - ALTER TABLE ... ENABLE ELECTRIC
   // - Special schema generation
   // - ElectricSQL-specific migrations
   ```

## Performance Considerations

1. **Optimized Where Clauses**
   - Use `root_project_id = $1` pattern for O(1) shape matching
   - Leverage Electric's optimized equality checks
   - Avoid complex conditions in hot paths

2. **Shape Management**
   - Each agent subscribes to max 3 shapes per project
   - Use AbortController for cleanup
   - Monitor shape count and performance

3. **Data Volume**
   - Use `columns` parameter to limit synced fields:
   ```typescript
   const minimalTaskStream = new ShapeStream({
     url: 'http://localhost:3000/v1/shape',
     params: {
       table: 'tasks',
       columns: 'id,title,status,parent_id',
       where: 'root_project_id = $1',
       params: [projectId]
     }
   });
   ```

## Security Model

1. **API Authentication**
   ```typescript
   // All writes go through authenticated API
   const apiClient = new TaskApiClient(API_URL, agentAuthToken);
   ```

2. **Shape Authorization (Optional)**
   ```typescript
   // Can add proxy layer for shape authorization
   const authorizedShapeStream = new ShapeStream({
     url: 'http://localhost:8080/api/shapes',  // Proxy endpoint
     params: {
       table: 'tasks',
       where: 'root_project_id = $1',
       params: [projectId]
     },
     headers: {
       'Authorization': `Bearer ${agentToken}`
     }
   });
   ```

## Monitoring & Observability

1. **Shape Subscription Tracking**
   ```typescript
   // Track active subscriptions
   shapeStream.subscribe(
     (messages) => {
       metrics.increment('shape.messages.received', messages.length);
     },
     (error) => {
       logger.error('Shape subscription error', { error, projectId });
     }
   );
   ```

2. **Sync Latency Monitoring**
   ```typescript
   const start = Date.now();
   await shape.rows; // Wait for initial sync
   metrics.histogram('shape.initial_sync.duration', Date.now() - start);
   ```

## React Integration Example

```tsx
// Example React component for agents
import { useShape } from '@electric-sql/react';

export function AgentTaskList({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useShape<TaskRow>({
    url: 'http://localhost:3000/v1/shape',
    params: {
      table: 'tasks',
      where: 'root_project_id = $1 AND status = $2',
      params: [projectId, 'pending']
    }
  });

  if (isLoading) return <div>Syncing tasks...</div>;

  return (
    <ul>
      {tasks.map(task => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  );
}
```

## Future Enhancements

1. **When Electric Adds Include Trees**
   - Simplify multi-table sync
   - Reduce number of separate shapes

2. **When Electric Adds Mutable Shapes**
   - Dynamic filtering without resubscription
   - Progressive detail loading

3. **Performance Optimizations**
   - Implement shape caching layer
   - Add connection pooling for multiple agents

## Success Metrics

- Agent task completion rate > 90%
- HTTP request latency < 100ms p99
- Zero data conflicts (handled by DB constraints)
- 10x improvement in multi-agent throughput

---

This design leverages Electric SQL v1.0+'s HTTP-based architecture for simple, reliable multi-agent collaboration in Astrolabe without the complexity of legacy sync protocols. 