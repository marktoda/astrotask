# PGLite Cooperative Locking Design

## Overview

Instead of migrating to SQLite or attempting to use the flawed socket proxy pattern, we can implement a cooperative locking mechanism that allows MCP and CLI processes to coordinate their database access. This approach is suitable for applications with short, infrequent database operations.

## Design Principles

1. **Cooperative, not Competitive**: Processes voluntarily acquire and release locks
2. **Short Lock Duration**: Hold locks only during actual database operations
3. **Graceful Degradation**: Retry with backoff when lock is held
4. **Clear User Feedback**: Inform users when waiting for access

## Implementation Strategy

### 1. File-Based Locking

Use a lock file to coordinate access between processes:

```typescript
// packages/core/src/database/lock.ts
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export class DatabaseLock {
  private lockPath: string;
  private lockAcquired = false;
  private readonly maxRetries = 50; // 5 seconds total
  private readonly retryDelay = 100; // 100ms between retries

  constructor(dbPath: string) {
    this.lockPath = join(dirname(dbPath), '.astrolabe.lock');
  }

  async acquire(): Promise<boolean> {
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(this.lockPath, JSON.stringify({
          pid: process.pid,
          timestamp: Date.now(),
          host: process.env.HOSTNAME || 'unknown'
        }), { flag: 'wx' }); // 'wx' fails if file exists
        
        this.lockAcquired = true;
        return true;
      } catch (error) {
        if ((error as any).code !== 'EEXIST') {
          throw error; // Unexpected error
        }
        
        // Check if lock is stale (older than 30 seconds)
        try {
          const lockData = JSON.parse(await fs.readFile(this.lockPath, 'utf-8'));
          if (Date.now() - lockData.timestamp > 30000) {
            // Stale lock, try to remove it
            await fs.unlink(this.lockPath);
            continue;
          }
        } catch {
          // Lock file might have been removed, retry
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }
    
    return false; // Failed to acquire lock
  }

  async release(): Promise<void> {
    if (!this.lockAcquired) return;
    
    try {
      await fs.unlink(this.lockPath);
      this.lockAcquired = false;
    } catch (error) {
      // Lock might already be removed
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const acquired = await this.acquire();
    if (!acquired) {
      throw new Error('Failed to acquire database lock after 5 seconds');
    }
    
    try {
      return await operation();
    } finally {
      await this.release();
    }
  }
}
```

### 2. Enhanced Database Factory

Wrap database operations with automatic locking:

```typescript
// packages/core/src/database/index.ts
export async function createDatabase(options: DatabaseOptions = {}): Promise<Store> {
  const {
    dataDir = cfg.DATABASE_PATH,
    enableLocking = true,
    lockTimeout = 5000,
  } = options;

  // Create lock manager
  const lock = enableLocking ? new DatabaseLock(dataDir) : null;

  // Acquire lock for initialization
  if (lock) {
    const acquired = await lock.acquire();
    if (!acquired) {
      throw new Error('Database is locked by another process');
    }
  }

  try {
    // Initialize PGLite
    const pgLite = await PGlite.create({ dataDir });
    const db = drizzle(pgLite, { schema });
    
    // Run migrations
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    
    // Create store with lock-aware wrapper
    const baseStore = new DatabaseStore(pgLite, db, false, false);
    const store = lock ? new LockingStore(baseStore, lock) : baseStore;
    
    return store;
  } catch (error) {
    // Release lock on initialization failure
    if (lock) await lock.release();
    throw error;
  }
}
```

### 3. Locking Store Wrapper

Automatically acquire/release locks for each operation:

```typescript
// packages/core/src/database/locking-store.ts
export class LockingStore implements Store {
  constructor(
    private baseStore: Store,
    private lock: DatabaseLock
  ) {}

  // Wrap each method with lock acquisition
  async listTasks(filters?: any): Promise<Task[]> {
    return this.lock.withLock(() => this.baseStore.listTasks(filters));
  }

  async addTask(data: NewTask): Promise<Task> {
    return this.lock.withLock(() => this.baseStore.addTask(data));
  }

  async updateTask(id: string, updates: any): Promise<Task | null> {
    return this.lock.withLock(() => this.baseStore.updateTask(id, updates));
  }

  // ... wrap all other methods similarly

  async close(): Promise<void> {
    try {
      await this.baseStore.close();
    } finally {
      await this.lock.release();
    }
  }
}
```

### 4. User Experience Enhancements

#### CLI Feedback

```typescript
// packages/cli/source/commands/_app.tsx
try {
  const store = await createDatabase(dbOptions);
  // ... normal operation
} catch (error) {
  if (error.message.includes('database lock')) {
    console.error('⏳ Database is currently in use by another process');
    console.error('   Please wait a moment and try again');
    console.error('   If this persists, check for stuck MCP processes');
    process.exit(1);
  }
  throw error;
}
```

#### MCP Server Optimizations

```typescript
// packages/mcp/src/index.ts
// Release lock between operations
const store = await createDatabase({ 
  ...dbOptions,
  autoReleaseLock: true // Release lock when idle
});

// For long-running MCP server, implement periodic lock release
setInterval(async () => {
  if (store.isIdle()) {
    await store.releaseLock();
  }
}, 1000); // Check every second
```

### 5. Advanced Features

#### Lock Status Command

```bash
# Add CLI command to check lock status
$ astrolabe lock-status
Database lock status:
- Locked by: MCP Server (PID: 12345)
- Locked since: 2 seconds ago
- Host: localhost
```

#### Force Unlock (Emergency)

```bash
# Force remove stale locks
$ astrolabe unlock --force
⚠️  Warning: Forcing database unlock
✓ Lock removed successfully
```

## Benefits

1. **Simple Implementation**: No database migration needed
2. **Minimal Changes**: Works with existing PGLite setup
3. **User-Friendly**: Clear feedback when waiting
4. **Safe**: Prevents corruption from concurrent access
5. **Flexible**: Can disable locking for single-user scenarios

## Trade-offs

1. **Sequential Access**: Only one process at a time
2. **Slight Latency**: May wait up to 5 seconds for lock
3. **Not True Concurrency**: But adequate for task management
4. **Lock File Management**: Need to handle stale locks

## Configuration Options

```typescript
interface LockingOptions {
  enableLocking: boolean;      // Enable/disable locking
  lockTimeout: number;         // Max wait time (ms)
  retryDelay: number;         // Delay between retries (ms)
  staleTimeout: number;       // When to consider lock stale (ms)
  autoRelease: boolean;       // Release when idle (MCP)
  verbose: boolean;           // Show lock acquisition logs
}
```

## Migration Path

1. **Phase 1**: Implement basic file locking
2. **Phase 2**: Add user feedback and status commands
3. **Phase 3**: Optimize for long-running processes
4. **Phase 4**: Add monitoring and metrics

## Future Enhancements

1. **Read-Write Locks**: Allow multiple readers, single writer
2. **Priority Queue**: Let certain operations jump the queue
3. **Lock Statistics**: Track wait times and contention
4. **Distributed Locking**: For multi-machine scenarios

## Conclusion

This cooperative locking approach provides a pragmatic solution to the PGLite concurrency problem without requiring a database migration. It's particularly well-suited for task management applications where database operations are brief and infrequent. 