# Core API Reference

Complete API reference for `@astrotask/core` - the foundational library for Astrolabe task management.

## Table of Contents

- [Database](#database)
- [TaskService](#taskservice)
- [Schemas](#schemas)
- [Types](#types)
- [Utilities](#utilities)
- [Configuration](#configuration)

## Database

### `createDatabase(options: DatabaseOptions): Store`

Creates a new database store instance with SQLite backend.

**Parameters:**
- `options.path` (string): Database file path or `:memory:` for in-memory database
- `options.encrypted` (boolean, optional): Enable database encryption
- `options.key` (string, optional): Encryption key (required if encrypted is true)
- `options.migrations` (boolean, optional): Run migrations on startup (default: true)

**Returns:** `Store` - Database store instance

**Example:**
```typescript
import { createDatabase } from '@astrotask/core';

// Basic SQLite database
const store = createDatabase({
  path: './tasks.db'
});

// Encrypted database
const encryptedStore = createDatabase({
  path: './secure-tasks.db',
  encrypted: true,
  key: process.env.DB_ENCRYPTION_KEY
});

// In-memory database (for testing)
const memoryStore = createDatabase({
  path: ':memory:'
});
```

**Throws:**
- `DatabaseError` - If database connection fails
- `ValidationError` - If options are invalid

---

## TaskService

The primary service for managing tasks and their relationships.

### Constructor

```typescript
new TaskService(store: Store)
```

**Parameters:**
- `store` (Store): Database store instance

### Methods

#### `createTask(data: CreateTask): Promise<Task>`

Creates a new task with validation and automatic timestamp generation.

**Parameters:**
- `data.title` (string): Task title (required)
- `data.description` (string, optional): Detailed description
- `data.status` (TaskStatus, optional): Initial status (default: 'pending')
- `data.parentId` (string, optional): Parent task ID for subtasks
- `data.projectId` (string, optional): Project ID
- `data.prd` (string, optional): Product Requirements Document content
- `data.contextDigest` (string, optional): Context digest for AI agents

**Returns:** `Promise<Task>` - Created task with generated ID and timestamps

**Example:**
```typescript
const task = await taskService.createTask({
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication with refresh tokens',
  status: 'pending',
  projectId: 'proj_123'
});

console.log(task.id); // Generated UUID
console.log(task.createdAt); // Timestamp
```

**Throws:**
- `ValidationError` - If task data is invalid
- `DatabaseError` - If database operation fails

#### `updateTask(id: string, updates: Partial<UpdateTask>): Promise<Task>`

Updates an existing task with partial data.

**Parameters:**
- `id` (string): Task ID to update
- `updates` (Partial<UpdateTask>): Fields to update

**Returns:** `Promise<Task>` - Updated task

**Example:**
```typescript
const updatedTask = await taskService.updateTask('task_123', {
  status: 'done',
  description: 'Completed with JWT implementation'
});
```

**Throws:**
- `NotFoundError` - If task doesn't exist
- `ValidationError` - If update data is invalid
- `DatabaseError` - If database operation fails

#### `deleteTask(id: string, options?: { cascade?: boolean }): Promise<void>`

Deletes a task and optionally its subtasks.

**Parameters:**
- `id` (string): Task ID to delete
- `options.cascade` (boolean, optional): Delete all subtasks (default: false)

**Returns:** `Promise<void>`

**Example:**
```typescript
// Delete single task
await taskService.deleteTask('task_123');

// Delete task and all subtasks
await taskService.deleteTask('task_123', { cascade: true });
```

**Throws:**
- `NotFoundError` - If task doesn't exist
- `DatabaseError` - If database operation fails

#### `getTask(id: string): Promise<Task | null>`

Retrieves a single task by ID.

**Parameters:**
- `id` (string): Task ID

**Returns:** `Promise<Task | null>` - Task or null if not found

**Example:**
```typescript
const task = await taskService.getTask('task_123');
if (task) {
  console.log(task.title);
}
```

#### `listTasks(filters?: ListTasksFilter): Promise<Task[]>`

Lists tasks with optional filtering.

**Parameters:**
- `filters.status` (TaskStatus, optional): Filter by status
- `filters.projectId` (string, optional): Filter by project
- `filters.parentId` (string, optional): Filter by parent task
- `filters.limit` (number, optional): Maximum number of results
- `filters.offset` (number, optional): Pagination offset

**Returns:** `Promise<Task[]>` - Array of matching tasks

**Example:**
```typescript
// Get all pending tasks
const pendingTasks = await taskService.listTasks({ 
  status: 'pending' 
});

// Get subtasks of a parent
const subtasks = await taskService.listTasks({ 
  parentId: 'task_123' 
});

// Paginated results
const page1 = await taskService.listTasks({ 
  limit: 10, 
  offset: 0 
});
```

#### `getTaskContext(id: string, options?: ContextOptions): Promise<TaskContext>`

Retrieves a task with its full hierarchical context.

**Parameters:**
- `id` (string): Task ID
- `options.includeAncestors` (boolean, optional): Include parent tasks (default: false)
- `options.includeDescendants` (boolean, optional): Include child tasks (default: false)
- `options.maxDepth` (number, optional): Maximum depth for hierarchy (default: 3)

**Returns:** `Promise<TaskContext>` - Task with context

**Example:**
```typescript
const context = await taskService.getTaskContext('task_123', {
  includeAncestors: true,
  includeDescendants: true,
  maxDepth: 5
});

console.log(context.task);        // Main task
console.log(context.ancestors);   // Parent tasks
console.log(context.descendants); // Child tasks
```

#### `getTaskTree(rootId?: string): Promise<TaskTree>`

Builds a hierarchical tree of tasks.

**Parameters:**
- `rootId` (string, optional): Root task ID (if not provided, returns all root tasks)

**Returns:** `Promise<TaskTree>` - Hierarchical task structure

**Example:**
```typescript
// Get full task tree
const fullTree = await taskService.getTaskTree();

// Get subtree from specific root
const subtree = await taskService.getTaskTree('task_123');
```

---

## Schemas

Zod schemas for runtime validation and type inference.

### Task Schemas

#### `taskSchema`

Core task schema matching database structure.

```typescript
const task = taskSchema.parse(taskData);
```

#### `createTaskSchema`

Schema for task creation with optional fields.

```typescript
const newTask = createTaskSchema.parse({
  title: 'New task',
  description: 'Task description'
});
```

#### `updateTaskSchema`

Schema for task updates (all fields optional except ID).

```typescript
const update = updateTaskSchema.parse({
  id: 'task_123',
  status: 'done'
});
```

### Project Schemas

#### `projectSchema`

Core project schema.

```typescript
const project = projectSchema.parse(projectData);
```

#### `createProjectSchema`

Schema for project creation.

```typescript
const newProject = createProjectSchema.parse({
  name: 'My Project',
  description: 'Project description'
});
```

### Context Slice Schemas

#### `contextSliceSchema`

Schema for context slices used by AI agents.

```typescript
const context = contextSliceSchema.parse({
  taskId: 'task_123',
  content: 'Relevant context information',
  metadata: { source: 'codebase' }
});
```

---

## Types

TypeScript type definitions inferred from Zod schemas.

### Core Types

#### `Task`

```typescript
interface Task {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  prd: string | null;
  contextDigest: string | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `CreateTask`

```typescript
interface CreateTask {
  title: string;
  description?: string;
  status?: TaskStatus;
  parentId?: string;
  projectId?: string;
  prd?: string;
  contextDigest?: string;
}
```

#### `TaskStatus`

```typescript
type TaskStatus = 'pending' | 'in-progress' | 'done' | 'cancelled';
```

#### `Project`

```typescript
interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `ContextSlice`

```typescript
interface ContextSlice {
  id: string;
  taskId: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

### Utility Types

#### `TaskContext`

```typescript
interface TaskContext {
  task: Task;
  ancestors: Task[];
  descendants: Task[];
}
```

#### `TaskTree`

```typescript
interface TaskTree {
  task: Task;
  children: TaskTree[];
}
```

#### `ListTasksFilter`

```typescript
interface ListTasksFilter {
  status?: TaskStatus;
  projectId?: string;
  parentId?: string;
  limit?: number;
  offset?: number;
}
```

---

## Utilities

### Logger

Structured logging utilities with configurable levels.

#### `createModuleLogger(module: string): Logger`

Creates a logger instance for a specific module.

**Parameters:**
- `module` (string): Module name for log context

**Returns:** `Logger` - Logger instance

**Example:**
```typescript
import { createModuleLogger } from '@astrotask/core';

const logger = createModuleLogger('TaskService');

logger.info('Task created', { taskId: 'task_123' });
logger.error('Database error', { error: error.message });
logger.debug('Debug information', { details: complexObject });
```

#### Logger Methods

- `logger.debug(message, context?)` - Debug level logging
- `logger.info(message, context?)` - Info level logging  
- `logger.warn(message, context?)` - Warning level logging
- `logger.error(message, context?)` - Error level logging

#### `logError(logger: Logger, error: Error, context?: object): void`

Utility for consistent error logging.

**Example:**
```typescript
import { logError } from '@astrotask/core';

try {
  await riskyOperation();
} catch (error) {
  logError(logger, error, { operation: 'createTask', taskId: 'task_123' });
}
```

#### `startTimer(logger: Logger, operation: string): () => void`

Creates a timer for performance monitoring.

**Example:**
```typescript
import { startTimer } from '@astrotask/core';

const endTimer = startTimer(logger, 'database-query');
await database.query('SELECT * FROM tasks');
endTimer(); // Logs elapsed time
```

---

## Configuration

### Environment Variables

The core library reads configuration from environment variables:

```bash
# Database configuration
DATABASE_PATH=./tasks.db

# Logging configuration
LOG_LEVEL=info          # debug, info, warn, error
NODE_ENV=development    # development, production, test

# Application configuration
PORT=3000
```

### Configuration Object

Access configuration through the `cfg` export:

```typescript
import { cfg } from '@astrotask/core';

console.log(cfg.LOG_LEVEL);    // Current log level
console.log(cfg.NODE_ENV);     // Current environment
console.log(cfg.PORT);         // Application port
console.log(cfg.DATABASE_PATH); // Database location
```

### Configuration Schema

```typescript
interface Config {
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_PATH: string;
  DB_VERBOSE: boolean;
  DB_TIMEOUT: number;
}
```

---

## Error Handling

The core library provides structured error types:

### Error Types

#### `ValidationError`

Thrown when data validation fails.

```typescript
try {
  const task = taskSchema.parse(invalidData);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation issues:', error.issues);
  }
}
```

#### `DatabaseError`

Thrown when database operations fail.

```typescript
try {
  await taskService.createTask(taskData);
} catch (error) {
  if (error instanceof DatabaseError) {
    console.log('Database error:', error.message);
  }
}
```

#### `NotFoundError`

Thrown when requested resources don't exist.

```typescript
try {
  await taskService.getTask('nonexistent-id');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Task not found');
  }
}
```

### Error Context

All errors include contextual information:

```typescript
interface ErrorContext {
  operation: string;
  timestamp: string;
  requestId?: string;
  metadata?: Record<string, any>;
}
```

---

## Performance Considerations

### Database Optimization

- **Connection Pooling**: Reuse database connections
- **Prepared Statements**: All queries use prepared statements
- **Indexing**: Automatic indexes on common query patterns
- **Transactions**: Batch operations in transactions

### Memory Management

- **Lazy Loading**: Context queries load data on demand
- **Depth Limits**: Configurable depth limits for hierarchical queries
- **Pagination**: Built-in pagination support for large result sets

### Caching

- **Query Caching**: Frequently accessed data is cached
- **Schema Validation**: Compiled schemas for fast validation
- **Connection Reuse**: Database connections are pooled and reused

---

## Migration Guide

### Version 0.0.x to 0.1.x

**Breaking Changes:**
- Task status `todo` renamed to `pending`
- `NewTask` type deprecated, use `CreateTask`
- Database schema includes new `contextDigest` field

**Migration Steps:**
1. Update task status references
2. Replace `NewTask` with `CreateTask`
3. Run database migrations
4. Update import statements

**Example Migration:**
```typescript
// Before (0.0.x)
const task: NewTask = {
  title: 'Task',
  status: 'todo'
};

// After (0.1.x)
const task: CreateTask = {
  title: 'Task',
  status: 'pending'
};
``` 
