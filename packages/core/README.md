# @astrolabe/core

The core library for Astrolabe, a local-first, MCP-compatible task-navigation platform for humans and AI agents.

## Overview

`@astrolabe/core` provides the foundational components for building task management applications with offline-first capabilities. It includes database abstractions, task services, type-safe schemas, and utilities for logging and configuration.

## Features

- **🗄️ Local-First Database**: SQLite with ElectricSQL integration for offline-first sync
- **📋 Hierarchical Task Management**: Support for nested tasks and complex task relationships
- **🔒 Type Safety**: Built with TypeScript and Zod schema validation
- **🔗 MCP Integration**: Native Model Context Protocol support for AI agent interaction
- **📊 Real-time Sync**: CRDT-based synchronization capabilities
- **🚀 High Performance**: Optimized for both client and server-side usage

## Installation

```bash
pnpm add @astrolabe/core

# Or with npm
npm install @astrolabe/core

# Or with yarn
yarn add @astrolabe/core
```

## Quick Start

```typescript
import { createDatabase, TaskService } from '@astrolabe/core';

// Initialize database
const store = createDatabase({
  path: './tasks.db',
  encrypted: true
});

// Create task service
const taskService = new TaskService(store);

// Create a new task
const task = await taskService.createTask({
  title: 'Implement user authentication',
  description: 'Add JWT-based auth with refresh tokens',
  status: 'pending'
});

// List all tasks
const tasks = await taskService.listTasks();

// Get task with full context
const context = await taskService.getTaskContext(task.id, {
  includeDescendants: true,
  maxDepth: 3
});
```

## Core Concepts

### Tasks

Tasks are the fundamental unit of work in Astrolabe. They support:

- **Hierarchical Structure**: Tasks can have parent-child relationships
- **Status Tracking**: `pending`, `in-progress`, `done`, `cancelled`
- **Rich Metadata**: PRD content, context digests, and custom fields
- **Type Safety**: Runtime validation with Zod schemas

```typescript
import type { Task, CreateTask, TaskStatus } from '@astrolabe/core';

const newTask: CreateTask = {
  title: 'Setup CI/CD pipeline',
  description: 'Configure GitHub Actions for automated testing and deployment',
  status: 'pending',
  projectId: 'proj_123'
};
```

### Projects

Projects group related tasks and provide organizational structure:

```typescript
import type { Project, CreateProject } from '@astrolabe/core';

const project: CreateProject = {
  name: 'Mobile App Redesign',
  description: 'Complete redesign of the mobile application UI/UX',
  status: 'active'
};
```

### Context Slices

Context slices provide AI agents with relevant information bundles:

```typescript
import type { ContextSlice, CreateContextSlice } from '@astrolabe/core';

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
  parentId: 'task_parent_123' // Optional: make this a subtask
});
```

##### `updateTask(id: string, updates: Partial<Task>): Promise<Task>`

Updates an existing task.

```typescript
const updatedTask = await taskService.updateTask('task_123', {
  status: 'done',
  description: 'Updated description with solution details'
});
```

##### `deleteTask(id: string, options?: { cascade?: boolean }): Promise<void>`

Deletes a task, optionally including all subtasks.

```typescript
// Delete just the task
await taskService.deleteTask('task_123');

// Delete task and all subtasks
await taskService.deleteTask('task_123', { cascade: true });
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
  parentId: 'task_123' 
});

// Get all tasks in a project
const projectTasks = await taskService.listTasks({ 
  projectId: 'proj_456' 
});
```

##### `getTaskContext(id: string, options?: ContextOptions): Promise<TaskContext>`

Retrieves a task with its full context including ancestors and descendants.

```typescript
const context = await taskService.getTaskContext('task_123', {
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
import { createDatabase } from '@astrolabe/core';

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
  projectSchema,
  contextSliceSchema 
} from '@astrolabe/core';

// Validate task data
const validTask = taskSchema.parse(taskData);

// Validate creation data
const validCreation = createTaskSchema.parse(newTaskData);
```

### Utilities

#### Logger

Structured logging with configurable levels:

```typescript
import { createModuleLogger } from '@astrolabe/core';

const logger = createModuleLogger('MyModule');

logger.info('Task created', { taskId: 'task_123' });
logger.error('Database error', { error: error.message });
logger.debug('Detailed debug info', { details: complexObject });
```

## Configuration

Configure the core library through environment variables or configuration objects:

```typescript
// Environment variables
process.env.LOG_LEVEL = 'debug';
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = 'file:./tasks.db';

// Or programmatic configuration
import { cfg } from '@astrolabe/core';

console.log(cfg.LOG_LEVEL);  // Current log level
console.log(cfg.NODE_ENV);   // Current environment
```

## Error Handling

The library provides structured error handling:

```typescript
import { DatabaseStore } from '@astrolabe/core';

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
import { createDatabase } from '@astrolabe/core';

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

- [`@astrolabe/mcp`](../mcp/README.md) - MCP server for AI agent integration
- [`@astrolabe/cli`](../cli/README.md) - Command-line interface 