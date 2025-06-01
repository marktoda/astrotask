# PGLite Cooperative Locking Implementation

## Overview

This document describes the implemented cooperative locking mechanism that allows MCP and CLI processes to coordinate their database access to PGLite. This approach is suitable for applications with short, infrequent database operations and provides a pragmatic solution without requiring database migration.

## Design Principles

1. **Cooperative, not Competitive**: Processes voluntarily acquire and release locks
2. **Short Lock Duration**: Hold locks only during actual database operations
3. **Graceful Degradation**: Retry with backoff when lock is held
4. **Clear User Feedback**: Inform users when waiting for access
5. **Stale Lock Detection**: Automatically remove abandoned locks

## Implementation Details

### 1. DatabaseLock Class

The core locking mechanism is implemented in `packages/core/src/database/lock.ts`:

```typescript
export class DatabaseLock {
  constructor(databasePath: string, options: LockOptions = {})
  
  async acquire(): Promise<void>
  async release(): Promise<void>
  async isLocked(): Promise<{ locked: boolean; info?: LockInfo }>
  async forceUnlock(): Promise<void>
  getLockInfo(): LockInfo | null
  getLockPath(): string
}

export interface LockOptions {
  maxRetries?: number;        // Default: 50
  retryDelay?: number;        // Default: 100ms
  staleTimeout?: number;      // Default: 30000ms
  processType?: string;       // Default: 'unknown'
}

export interface LockInfo {
  pid: number;
  timestamp: number;
  host: string;
  process: string;
}
```

**Key Features:**
- **Exclusive File Creation**: Uses `writeFile` with `wx` flag for atomic lock acquisition
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Stale Lock Detection**: Automatically removes locks older than 30 seconds
- **Process Identification**: Tracks PID, hostname, and process type
- **Corrupted Lock Handling**: Gracefully handles invalid lock files

### 2. LockingStore Wrapper

Automatic lock management for database operations in `packages/core/src/database/lockingStore.ts`:

```typescript
export class LockingStore implements Store {
  constructor(
    innerStore: Store,
    databasePath: string,
    lockOptions?: LockOptions
  )

  // All Store methods automatically wrapped with locking
  async listTasks(filters?: any): Promise<Task[]>
  async addTask(data: CreateTask): Promise<Task>
  async updateTask(id: string, updates: any): Promise<Task | null>
  // ... all other Store methods

  // Locking-specific methods
  async isLocked(): Promise<{ locked: boolean; info?: any }>
  async forceUnlock(): Promise<void>
  getLockInfo(): { path: string; current: LockInfo | null }
}
```

**Features:**
- **Automatic Lock Management**: Each operation acquires and releases locks
- **User-Friendly Errors**: Provides clear error messages for lock conflicts
- **Lock Information**: Exposes lock status and details
- **Graceful Error Handling**: Ensures locks are released even on errors

### 3. Database Factory Integration

Enhanced database creation with locking support:

```typescript
// Create database with locking enabled (default)
const store = await createDatabase({
  dataDir: './data/astrolabe.db',
  enableLocking: true,
  lockOptions: {
    processType: 'cli',
    maxRetries: 50,
    retryDelay: 100
  }
});

// Create locked database directly
const store = await createLockedDatabase('./data/astrolabe.db', {
  processType: 'mcp-server',
  maxRetries: 30,
  retryDelay: 100
});

// Utility function for lock-protected operations
await withDatabaseLock('./data/astrolabe.db', { processType: 'script' }, async () => {
  // Your database operations here
});
```

### 4. CLI Lock Status Command

Added `task-master task lock-status` command for monitoring and debugging:

```bash
# Check lock status
$ task-master task lock-status
✅ Database is not locked

# Check with verbose details
$ task-master task lock-status --verbose
✅ Database is not locked
Lock file: /path/to/data/.astrolabe.lock

# When database is locked
$ task-master task lock-status
🔒 Database is locked

Lock Details:
  Process: mcp-server
  PID: 12345
  Host: localhost
  Age: 2s

💡 To remove a stale lock, use: task-master task lock-status --force

# Force remove lock (use with caution)
$ task-master task lock-status --force
⚠️  Database lock forcibly removed
Lock file: /path/to/data/.astrolabe.lock
```

### 5. Error Recovery Mechanisms

**Stale Lock Detection:**
- Locks older than 30 seconds are automatically considered stale
- Stale locks are removed before acquiring new locks
- Configurable timeout via `staleTimeout` option

**Corrupted Lock Files:**
- Invalid JSON in lock files is detected and handled
- Corrupted files are automatically removed
- System continues operation after cleanup

**Process Crash Recovery:**
- Orphaned locks from crashed processes are detected
- PID validation ensures lock holder is still running
- Automatic cleanup prevents permanent deadlocks

**Graceful Degradation:**
- Clear error messages when lock acquisition fails
- Configurable retry logic with backoff
- User-friendly feedback about lock holders

### 6. Testing Coverage

Comprehensive test suite in `packages/core/test/locking.test.ts`:

- **Basic Functionality**: Lock acquisition, release, and status checking
- **Concurrent Access**: Multiple processes attempting to acquire locks
- **Stale Lock Detection**: Automatic cleanup of old locks
- **Error Recovery**: Handling corrupted files and crashed processes
- **User Experience**: Friendly error messages and process identification
- **Integration Testing**: Database operations with locking enabled

## Configuration Options

```typescript
interface LockOptions {
  maxRetries?: number;        // Max retry attempts (default: 50)
  retryDelay?: number;        // Delay between retries in ms (default: 100)
  staleTimeout?: number;      // Lock timeout in ms (default: 30000)
  processType?: string;       // Process identifier (default: 'unknown')
}

interface DatabaseOptions {
  dataDir?: string;           // Database directory path
  enableLocking?: boolean;    // Enable/disable locking (default: true)
  lockOptions?: LockOptions;  // Lock configuration
  verbose?: boolean;          // Enable verbose logging
}
```

## Usage Patterns

### CLI Applications
```typescript
const store = await createDatabase({
  dataDir: getDatabasePath(),
  enableLocking: true,
  lockOptions: {
    processType: 'cli',
    maxRetries: 20,
    retryDelay: 100
  }
});
```

### MCP Server
```typescript
const store = await createDatabase({
  dataDir: getDatabasePath(),
  enableLocking: true,
  lockOptions: {
    processType: 'mcp-server',
    maxRetries: 50,
    retryDelay: 50
  }
});
```

### Scripts and Utilities
```typescript
await withDatabaseLock(dbPath, { processType: 'migration' }, async () => {
  // Perform database migration
  await runMigrations();
});
```

## Performance Characteristics

- **Lock Acquisition**: Typically < 1ms when uncontended
- **Retry Overhead**: 100ms delay between attempts (configurable)
- **Maximum Wait Time**: 5 seconds with default settings (50 retries × 100ms)
- **File System Operations**: Minimal overhead using atomic file operations
- **Memory Usage**: Negligible additional memory footprint

## Benefits Achieved

1. **✅ Zero Database Migration**: Works with existing PGLite setup
2. **✅ Data Integrity**: Prevents corruption from concurrent access
3. **✅ User-Friendly**: Clear feedback and error messages
4. **✅ Robust Error Recovery**: Handles crashes and stale locks
5. **✅ Configurable**: Adjustable timeouts and retry logic
6. **✅ Monitoring**: CLI tools for lock status and management
7. **✅ Comprehensive Testing**: Full test coverage for edge cases

## Trade-offs

1. **Sequential Access**: Only one process at a time (by design)
2. **Slight Latency**: May wait up to 5 seconds for lock acquisition
3. **File System Dependency**: Requires shared file system access
4. **Not True Concurrency**: But adequate for task management workloads

## Future Enhancements

1. **Read-Write Locks**: Allow multiple readers, single writer
2. **Lock Metrics**: Track contention and wait times
3. **Priority Queues**: Allow high-priority operations to jump ahead
4. **Distributed Locking**: For multi-machine deployments
5. **Lock Monitoring**: Real-time dashboard for lock status

## Conclusion

The cooperative locking implementation successfully solves the PGLite concurrency problem with a pragmatic, file-based approach. It provides robust error recovery, user-friendly feedback, and comprehensive testing while maintaining the simplicity of the existing PGLite setup. The solution is particularly well-suited for task management applications where database operations are brief and infrequent. 