# PostgreSQL Integration

Astrolabe Core supports both PGLite (for local file-based databases) and PostgreSQL (for production deployments) with a unified API and clean adapter pattern.

## Quick Start

Simply provide a PostgreSQL connection string instead of a file path:

```typescript
import { createDatabase } from '@astrotask/core';

// Local PGLite database (default)
const localStore = await createDatabase({
  dataDir: './data/astrotask.db'
});

// PostgreSQL database
const pgStore = await createDatabase({
  dataDir: 'postgresql://user:password@localhost:5432/astrotask'
});

// Both stores implement the same interface
await pgStore.addTask({
  title: 'My Task',
  status: 'pending',
  priority: 'medium'
});
```

## Architecture

The implementation follows clean architecture principles:

### 1. URL Parsing

All connection strings are parsed into a discriminated union:

```typescript
type DbUrl =
  | { kind: 'postgres'; url: URL }
  | { kind: 'pglite-file'; file: string }      // ./data/app.db
  | { kind: 'pglite-mem'; label: string }      // memory://foo
  | { kind: 'pglite-idb'; label: string };     // idb://bar
```

### 2. Backend Adapters

Each database type has its own adapter implementing a common interface:

```typescript
interface DatabaseBackend {
  readonly drizzle: DrizzleDatabase;
  readonly capabilities: DbCapabilities;
  readonly type: 'pglite' | 'postgres';
  
  init(): Promise<void>;
  migrate(migrationsDir: string): Promise<void>;
  close(): Promise<void>;
}
```

### 3. Capability Differences

Backends expose their capabilities for graceful degradation:

```typescript
interface DbCapabilities {
  concurrentWrites: boolean;    // false for PGLite, true for PostgreSQL
  listenNotify: boolean;        // false for PGLite, true for PostgreSQL
  extensions: Set<string>;      // Available database extensions
}
```

## Features

### Automatic Backend Detection

The database module automatically detects the backend from the connection string:

- **PGLite**: File paths like `./data/astrotask.db`, `memory://`, or `idb://`
- **PostgreSQL**: URLs starting with `postgresql://`, `postgres://`, or `pg://`

### Unified Store Interface

Both backends implement the same `Store` interface:

```typescript
interface Store {
  // Task operations
  listTasks(filters?: TaskFilters): Promise<Task[]>;
  addTask(data: CreateTask): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(id: string): Promise<boolean>;
  
  // And more...
}
```

### Smart Locking Defaults

- **PGLite**: Locking is enabled by default (required for single-connection safety)
- **PostgreSQL**: Locking is optional (PostgreSQL handles concurrency natively)

### Improved Error Handling

- User-friendly error messages for lock conflicts
- Proper connection cleanup on errors
- PostgreSQL connection error handling
- No credential leaks in logs

## Configuration

```typescript
interface DatabaseOptions {
  dataDir?: string;              // File path or PostgreSQL connection string
  verbose?: boolean;             // Enable debug logging
  enableLocking?: boolean;       // Override locking behavior
  lockOptions?: LockOptions;     // Custom lock configuration
  migrationsDir?: string;        // Custom migrations directory
}
```

## Advanced Usage

### Direct Backend Access

For advanced use cases, you can use the factory directly:

```typescript
import { openDatabase, parseDbUrl } from '@astrotask/core';

const backend = await openDatabase('postgresql://localhost/astrotask', {
  migrationsDir: './migrations',
  debug: true,
});

// Access backend capabilities
if (backend.capabilities.concurrentWrites) {
  console.log('This backend supports concurrent writes');
}

// Use Drizzle directly
const tasks = await backend.drizzle.select().from(tasksTable);

// Clean up when done
await backend.close();
```

### Custom Adapters

The adapter pattern makes it easy to add new backends:

```typescript
class SQLiteAdapter implements DatabaseBackend {
  // Implementation for SQLite support
}
```

## Testing

Set the `POSTGRES_TEST_URL` environment variable to run integration tests:

```bash
export POSTGRES_TEST_URL="postgresql://localhost:5432/astrotask_test"
npm test
```

## Benefits

1. **Clean Architecture**: Parse → Adapt → Use pattern keeps code organized
2. **Type Safety**: No `any` types - everything is properly typed
3. **Extensibility**: Adding new backends requires minimal changes (~40 lines)
4. **Capability Awareness**: Code can adapt based on backend features
5. **Single Responsibility**: Each module has one clear purpose 
