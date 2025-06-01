# PGLite Connection Management in MCP Server

## Overview

PGLite is designed as a single-connection embedded database, which can create conflicts when multiple processes (like MCP server and CLI) try to access the same database file simultaneously. This document explains the connection management improvements implemented in the MCP server.

## Issues with Default PGLite Usage

### Single Connection Limitation
- PGLite only supports one connection per database file
- Multiple processes accessing the same database can cause:
  - Connection conflicts
  - Database lock errors
  - Data corruption risk

### Long-Lived Connections
- The original MCP server kept connections open indefinitely
- No cleanup on shutdown led to potential orphaned connections
- Database files could remain locked even after process termination

## Implemented Solutions

### 1. Proper Shutdown Handling

The MCP server now properly closes database connections on shutdown:

```typescript
// Enhanced shutdown handling with database cleanup
const handleShutdown = async (signal: string) => {
  await logShutdown(logger, signal, async () => {
    logger.info('Closing database connection...');
    try {
      await store.close();
      logger.info('Database connection closed successfully');
    } catch (error) {
      logger.error('Failed to close database connection', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  process.exit(0);
};
```

**Benefits:**
- Ensures clean shutdown
- Releases database locks properly
- Prevents orphaned connections

### 2. Database Cleanup Utilities

New utilities in `utils/dbCleanup.ts` provide better connection management:

#### After Write Operations
```typescript
import { optimizeAfterWrite, aggressiveCleanupAfterWrite } from './utils/dbCleanup.js';

// Standard cleanup after writes
await optimizeAfterWrite(store);

// Aggressive cleanup (for high-conflict scenarios)
await aggressiveCleanupAfterWrite(store);
```

#### After Read Operations
```typescript
import { quickCleanupAfterRead } from './utils/dbCleanup.js';

// Light cleanup after reads
await quickCleanupAfterRead(store);
```

### 3. Connection Manager (Advanced)

For more sophisticated scenarios, the `ConnectionManager` class provides:

```typescript
import { createConnectionManager } from './utils/connectionManager.js';

const connectionManager = createConnectionManager(dbOptions);

// Execute operation with automatic cleanup
const result = await connectionManager.withConnection(async (store) => {
  return await store.addTask(taskData);
});
```

**Features:**
- Automatic connection lifecycle management
- Configurable idle timeouts
- Aggressive cleanup modes
- Operation tracking and logging

## Configuration Options

### Environment Variables

Control connection behavior through environment variables:

```bash
# Enable aggressive connection cleanup after each operation
MCP_AGGRESSIVE_CONNECTION_CLEANUP=true

# Set idle timeout before closing connections (ms)
MCP_IDLE_TIMEOUT=5000

# Enable verbose database logging
DB_VERBOSE=true
```

### Database Optimization Settings

The cleanup utilities use these PostgreSQL commands for optimization:

- `VACUUM`: Reclaims storage and optimizes database file
- `CHECKPOINT`: Forces write of all dirty pages to disk
- `PRAGMA optimize`: Analyzes and optimizes query plans
- `PRAGMA wal_checkpoint(FULL)`: Forces WAL checkpoint

## Usage Recommendations

### For Development
- Use standard shutdown handling (already implemented)
- Enable `DB_VERBOSE=true` for debugging
- Consider using `quickCleanupAfterRead` for read-heavy operations

### For Production
- Enable aggressive cleanup: `MCP_AGGRESSIVE_CONNECTION_CLEANUP=true`
- Set appropriate idle timeout: `MCP_IDLE_TIMEOUT=3000`
- Monitor connection conflicts in logs

### For High-Conflict Scenarios
- Use the `ConnectionManager` with short idle timeouts
- Implement connection pooling at the application level
- Consider using the database proxy architecture (see main project todo)

## Monitoring Connection Health

### Check Connection Status
```typescript
import { getDatabaseInfo } from './utils/dbCleanup.js';

const info = await getDatabaseInfo(store);
console.log('Database info:', info);
```

### Log Analysis
Look for these log patterns:
- `Database connection closed successfully` - Clean shutdown
- `Failed to close database connection` - Connection issues
- `Database optimized after write operation` - Successful cleanup

## Migration from Old Implementation

### Before (Single Long-Lived Connection)
```typescript
// Old approach - connection never closed
const store = await createDatabase(dbOptions);
// ... use store throughout application lifecycle
// No cleanup on shutdown
```

### After (Managed Connections)
```typescript
// New approach - proper lifecycle management
const store = await createDatabase(dbOptions);

// Set up shutdown handlers
setupShutdownHandlers();

// Use cleanup utilities after operations
await optimizeAfterWrite(store);
```

## Future Improvements

### Database Proxy Architecture
The ultimate solution for the single connection limitation is implementing a database proxy server:

1. **Proxy Server**: Single process manages the PGLite connection
2. **Client Connections**: MCP server and CLI connect to proxy via HTTP/WebSocket
3. **Request Serialization**: Proxy handles concurrent requests safely
4. **Connection Pooling**: Better resource management

This architecture is planned for future implementation (see `todo.txt`).

## Troubleshooting

### Common Issues

**Database Lock Errors**
```bash
# Check for running processes
ps aux | grep astrolabe

# Enable verbose logging
DB_VERBOSE=true npm start
```

**Connection Conflicts**
```bash
# Use aggressive cleanup
MCP_AGGRESSIVE_CONNECTION_CLEANUP=true

# Reduce idle timeout
MCP_IDLE_TIMEOUT=1000
```

**Performance Issues**
```bash
# Monitor cleanup operations
grep "Database optimized" logs.txt

# Check database file size
ls -lh data/astrolabe.db
```

### Debug Connection Issues

Enable debug logging to monitor connection behavior:

```bash
export DB_VERBOSE=true
export LOG_LEVEL=debug
npm start
```

Look for these debug messages:
- `Creating new database connection`
- `Database optimized after write operation`
- `Closing database connection`

## Best Practices

1. **Always Use Shutdown Handlers**: Ensure clean connection closure
2. **Cleanup After Writes**: Use optimization utilities after write operations
3. **Monitor Connection Health**: Enable logging in development
4. **Test Concurrent Access**: Verify behavior with multiple processes
5. **Plan for Scale**: Consider proxy architecture for production use

This improved connection management significantly reduces the likelihood of PGLite connection conflicts while maintaining performance and data integrity. 