# @astrotask/core

The core library for Astrolabe, a local-first, MCP-compatible task-navigation platform for humans and AI agents.

## Overview

`@astrotask/core` provides the foundational components for building task management applications with offline-first capabilities. It includes database abstractions, task services, type-safe schemas, and utilities for logging and configuration.

## Features

- **🗄️ Local-First Database**: SQLite with ElectricSQL integration for offline-first sync
- **📋 Hierarchical Task Management**: Support for nested tasks and complex task relationships
- **🔒 Type Safety**: Built with TypeScript and Zod schema validation
- **🔗 MCP Integration**: Native Model Context Protocol support for AI agent interaction
- **📊 Real-time Sync**: CRDT-based synchronization capabilities
- **🚀 High Performance**: Optimized for both client and server-side usage

## Installation

```bash
pnpm add @astrotask/core

# Or with npm
npm install @astrotask/core

# Or with yarn
yarn add @astrotask/core
```

## Quick Start

```typescript
import { createDatabase, TaskService } from '@astrotask/core';

// Initialize database
const store = createDatabase({
  path: './tasks.db',
  encrypted: true
});

// Create task service
const taskService = new TaskService(store);

// Create a new task
const task = await taskService.createTask({
  title: 'Fix login bug',
  description: 'Users cannot login with special characters in password',
  status: 'pending',
  parentId: 'A' // Optional: make this a subtask
});

// List all tasks
const tasks = await taskService.listTasks();

// Get task with full context
const context = await taskService.getTaskContext('A', {
  includeAncestors: true,
  includeDescendants: true,
  maxDepth: 3
});

console.log(context.task);      // The main task
console.log(context.ancestors); // Parent tasks up the hierarchy
console.log(context.descendants); // Child tasks down the hierarchy
```

## Core Concepts

### Tasks

Tasks are the fundamental unit of work in Astrolabe. They support:

- **Hierarchical Structure**: Tasks can have parent-child relationships
- **Status Tracking**: `pending`, `in-progress`, `done`, `cancelled`
- **Rich Metadata**: PRD content, context digests, and custom fields
- **Type Safety**: Runtime validation with Zod schemas

```typescript
import type { Task, CreateTask, TaskStatus } from '@astrotask/core';

const newTask: CreateTask = {
  title: 'Setup CI/CD pipeline',
  description: 'Configure GitHub Actions for automated testing and deployment',
  status: 'pending'
};
```

### Context Slices

Context slices provide AI agents with relevant information bundles:

```typescript
import type { ContextSlice, CreateContextSlice } from '@astrotask/core';

const context: CreateContextSlice = {
  taskId: 'task_123',
  content: 'Relevant code snippets, documentation, and context',
  metadata: { source: 'codebase', lastUpdated: new Date() }
};
```

## API Reference

### TaskService

The primary service for task management operations.

#### Methods

##### `createTask(data: CreateTask): Promise<Task>`

Creates a new task with validation.

```typescript
const task = await taskService.createTask({
  title: 'Fix login bug',
  description: 'Users cannot login with special characters in password',
  status: 'pending',
  parentId: 'A' // Optional: make this a subtask
});
```

##### `updateTask(id: string, updates: Partial<Task>): Promise<Task>`

Updates an existing task.

```typescript
const updatedTask = await taskService.updateTask('A', {
  status: 'done',
  description: 'Updated description with solution details'
});
```

##### `deleteTask(id: string, options?: { cascade?: boolean }): Promise<void>`

Deletes a task, optionally including all subtasks.

```typescript
// Delete just the task
await taskService.deleteTask('A');

// Delete task and all subtasks
await taskService.deleteTask('A', { cascade: true });
```

##### `listTasks(filters?: ListTasksFilter): Promise<Task[]>`

Lists tasks with optional filtering.

```typescript
// Get all pending tasks
const pendingTasks = await taskService.listTasks({ 
  status: 'pending' 
});

// Get all subtasks of a parent
const subtasks = await taskService.listTasks({ 
  parentId: 'A' 
});
```

##### `getTaskContext(id: string, options?: ContextOptions): Promise<TaskContext>`

Retrieves a task with its full context including ancestors and descendants.

```typescript
const context = await taskService.getTaskContext('A', {
  includeAncestors: true,
  includeDescendants: true,
  maxDepth: 3
});

console.log(context.task);      // The main task
console.log(context.ancestors); // Parent tasks up the hierarchy
console.log(context.descendants); // Child tasks down the hierarchy
```

### Database

#### `createDatabase(options: DatabaseOptions): Store`

Creates a new database store instance.

```typescript
import { createDatabase } from '@astrotask/core';

// Basic SQLite database
const store = createDatabase({
  path: './tasks.db'
});

// Encrypted database
const encryptedStore = createDatabase({
  path: './tasks.db',
  encrypted: true,
  key: process.env.DB_ENCRYPTION_KEY
});

// In-memory database (for testing)
const memoryStore = createDatabase({
  path: ':memory:'
});
```

### Schemas

All data types are validated using Zod schemas:

```typescript
import { 
  taskSchema, 
  createTaskSchema, 
  updateTaskSchema,
  contextSliceSchema 
} from '@astrotask/core';

// Validate task data
const validTask = taskSchema.parse(taskData);

// Validate creation data
const validCreation = createTaskSchema.parse(newTaskData);
```

### Utilities

#### Logger

Structured logging with configurable levels:

```typescript
import { createModuleLogger } from '@astrotask/core';

const logger = createModuleLogger('MyModule');

logger.info('Task created', { taskId: 'A' });
logger.error('Database error', { error: error.message });
logger.debug('Detailed debug info', { details: complexObject });
```

## Configuration

Astrotask Core uses environment variables for configuration. Create a `.env` file in your project root:

```bash
# Database location (optional - will auto-detect if not set)
DATABASE_URI=./data/astrotask.db

# Enable debug logging
DB_VERBOSE=true

# Other configuration options...
LOG_LEVEL=debug
```

### Database URI Auto-Detection

If `DATABASE_URI` is not explicitly set, Astrotask will intelligently determine the database location:

1. **Git Root Priority**: If your project is in a git repository, the database will be placed at `{git_root}/data/astrotask.db`
2. **Existing Database**: If a database already exists in a parent directory, it will be reused
3. **Fallback**: If no git root or existing database is found, defaults to `./data/astrotask.db` in the current directory

This ensures that all parts of your project use the same database, regardless of which subdirectory you run commands from.

## Error Handling

The library provides structured error handling:

```typescript
import { DatabaseStore } from '@astrotask/core';

try {
  const task = await taskService.createTask(newTaskData);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Invalid task data:', error.issues);
  } else if (error instanceof DatabaseError) {
    console.log('Database operation failed:', error.message);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

## Testing

The core library includes comprehensive test utilities:

```typescript
import { createDatabase } from '@astrotask/core';

// Create test database
const testStore = createDatabase({ path: ':memory:' });

// Use in your tests
describe('Task operations', () => {
  test('should create task', async () => {
    const taskService = new TaskService(testStore);
    const task = await taskService.createTask({
      title: 'Test task',
      status: 'pending'
    });
    
    expect(task.title).toBe('Test task');
    expect(task.status).toBe('pending');
  });
});
```

## Performance Considerations

- **Database Connections**: Reuse database instances when possible
- **Batch Operations**: Use transactions for multiple operations
- **Context Depth**: Limit `maxDepth` in context queries for better performance
- **Indexing**: The database automatically creates indexes for common query patterns

## Migration Guide

### From 0.0.x to 0.1.x

- Task status `todo` is now `pending`
- Database schema includes new `contextDigest` field
- `NewTask` type is deprecated, use `CreateTask` instead
- **Task IDs are now human-readable**: Instead of UUIDs, tasks use random 4-letter combinations (ABCD, XYZW) for root tasks and dotted numbers (ABCD.1, ABCD.2) for subtasks

## Migration from UUID to Human-Readable IDs

**Previous UUID format:**
- Tasks had UUIDs like `550e8400-e29b-41d4-a716-446655440000`
- Difficult for humans to remember and type
- No hierarchical meaning

**New human-readable format:**
- Root tasks: Random 4-letter combinations (e.g., `ABCD`, `XYZW`, `QRST`)
- Subtasks: `ABCD.1`, `ABCD.2`, `XYZW.1`
- Sub-subtasks: `ABCD.1.1`, `ABCD.1.2`
- Much easier for humans and AI agents to work with
- Clear hierarchical structure
- Low collision probability (456,976 possible root IDs)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run `pnpm verify` to ensure quality
6. Submit a pull request

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Related Packages

- [`@astrotask/mcp`](../mcp/README.md) - MCP server for AI agent integration
- [`@astrotask/cli`](../cli/README.md) - Command-line interface
