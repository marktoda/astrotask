# Database Locking Implementation

This directory contains the cooperative locking mechanism for PGLite database access coordination.

## Quick Start

```typescript
import { createDatabase, createLockedDatabase, withDatabaseLock } from '@astrotask/core';

// Create database with locking enabled (default)
const store = await createDatabase({
  dataDir: './data/astrotask.db',
  enableLocking: true,
  lockOptions: {
    processType: 'cli',
    maxRetries: 50,
    retryDelay: 100
  }
});

// Use the store normally - locking is automatic
const tasks = await store.listTasks();
await store.addTask({ title: 'New Task', status: 'pending', priority: 'medium' });

// Close when done
await store.close();
```

## Files

- **`lock.ts`** - Core `DatabaseLock` class for file-based locking
- **`lockingStore.ts`** - `LockingStore` wrapper that adds automatic locking to database operations
- **`index.ts`** - Database factory functions with locking support

## Key Classes

### DatabaseLock

Low-level lock management:

```typescript
const lock = new DatabaseLock('./data/astrotask.db', {
  processType: 'my-app',
  maxRetries: 50,
  retryDelay: 100,
  staleTimeout: 30000
});

await lock.acquire();
try {
  // Your database operations
} finally {
  await lock.release();
}
```

### LockingStore

High-level store wrapper with automatic locking:

```typescript
const baseStore = await createLocalDatabase('./data/astrotask.db');
const lockingStore = new LockingStore(baseStore, './data/astrotask.db', {
  processType: 'my-app'
});

// All operations automatically acquire/release locks
const tasks = await lockingStore.listTasks();
```

## Utility Functions

### withDatabaseLock

For one-off operations:

```typescript
await withDatabaseLock('./data/astrotask.db', { processType: 'script' }, async () => {
  // Your database operations here
  console.log('Database operation completed');
});
```

### createLockedDatabase

Direct creation of locked database:

```typescript
const store = await createLockedDatabase('./data/astrotask.db', {
  processType: 'mcp-server',
  maxRetries: 30,
  retryDelay: 100
});
```

## Configuration

### LockOptions

```typescript
interface LockOptions {
  maxRetries?: number;        // Max retry attempts (default: 50)
  retryDelay?: number;        // Delay between retries in ms (default: 100)
  staleTimeout?: number;      // Lock timeout in ms (default: 30000)
  processType?: string;       // Process identifier (default: 'unknown')
}
```

### DatabaseOptions

```typescript
interface DatabaseOptions {
  dataDir?: string;           // Database directory path
  enableLocking?: boolean;    // Enable/disable locking (default: true)
  lockOptions?: LockOptions;  // Lock configuration
  verbose?: boolean;          // Enable verbose logging
}
```

## Error Handling

The locking system provides user-friendly error messages:

```typescript
try {
  const store = await createLockedDatabase('./data/astrotask.db', {
    processType: 'quick-process',
    maxRetries: 2,
    retryDelay: 50
  });
  await store.listTasks();
} catch (error) {
  if (error.message.includes('Database is currently in use by')) {
    console.log('Database is locked by another process');
    console.log('Error:', error.message);
    // Example: "Database is currently in use by mcp-server (PID: 12345). Please try again in a moment."
  }
}
```

## Lock File Format

Lock files are stored as `.astrotask.lock` in the database directory:

```json
{
  "pid": 12345,
  "timestamp": 1638360000000,
  "host": "localhost",
  "process": "mcp-server"
}
```

## CLI Tools

Check lock status:

```bash
# Check if database is locked
task-master task lock-status

# Show detailed information
task-master task lock-status --verbose

# Force remove lock (use with caution)
task-master task lock-status --force
```

## Best Practices

1. **Always use the factory functions** (`createDatabase`, `createLockedDatabase`) rather than creating stores manually
2. **Set appropriate process types** to help with debugging and monitoring
3. **Configure retry settings** based on your use case:
   - CLI tools: Lower retries for quick feedback
   - Long-running services: Higher retries for reliability
4. **Handle lock errors gracefully** with user-friendly messages
5. **Use `withDatabaseLock`** for one-off operations or scripts

## Process Types

Common process type identifiers:

- `'cli'` - Command-line interface
- `'mcp-server'` - MCP server process
- `'migration'` - Database migration scripts
- `'test'` - Test processes
- `'backup'` - Backup operations

## Troubleshooting

### Stale Locks

Locks older than 30 seconds are automatically considered stale and removed. If you encounter persistent lock issues:

1. Check for crashed processes: `ps aux | grep astrotask`
2. Force remove lock: `task-master task lock-status --force`
3. Check file permissions on the database directory

### Performance Issues

If lock acquisition is slow:

1. Reduce `retryDelay` for faster attempts
2. Increase `maxRetries` for more persistence
3. Check file system performance
4. Consider if operations can be batched

### Debugging

Enable verbose logging to see lock acquisition details:

```typescript
const store = await createDatabase({
  dataDir: './data/astrotask.db',
  verbose: true,
  lockOptions: {
    processType: 'debug-session'
  }
});
```

## Testing

The locking system includes comprehensive tests in `packages/core/test/locking.test.ts`. Run tests with:

```bash
cd packages/core
npm test -- locking
```

## Architecture

The locking system uses a cooperative approach:

1. **File-based locks** using atomic file creation
2. **Retry logic** with configurable backoff
3. **Stale lock detection** for crash recovery
4. **Process identification** for debugging
5. **Automatic cleanup** of corrupted lock files

This approach is well-suited for task management applications where database operations are brief and infrequent. 
