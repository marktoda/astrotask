# PGLite Socket Architecture Design

## ⚠️ CRITICAL UPDATE: Socket Proxy Pattern Not Viable

**After reviewing the `@electric-sql/pglite-socket` documentation, we discovered that it does NOT support multiple concurrent connections.** The documentation explicitly states:

> "As PGlite is a single-connection database, it is not possible to have multiple simultaneous connections open. This means that the socket server will only support a single client connection at a time."

This means the entire socket proxy pattern approach **does not solve the concurrent access problem** - it merely moves the single-connection limitation from file access to socket access.

**Updated Recommendation:** Migrate to SQLite with proper WAL mode configuration for true concurrent access.

---

## Original Analysis (Now Superseded)

This document outlines the architectural changes needed to support concurrent database access in Astrolabe by implementing a socket-based proxy pattern for PGLite.

## Problem Statement

PGLite is compiled to WebAssembly in "single-user mode" which means:
- Only one process can hold a lock on the database files at a time
- Attempting to open the same data directory from multiple processes (CLI, MCP server, etc.) results in lock conflicts
- This limitation is fundamental to PGLite's architecture and cannot be worked around directly

## Solution: Socket Proxy Pattern

We will implement a socket-based proxy pattern using `@electric-sql/pglite-socket` that:
1. Runs a single PGLite instance within the MCP server (the long-lived process)
2. Exposes a PostgreSQL wire protocol on a local TCP port
3. Allows all other processes to connect via the socket instead of directly to the database files

### Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI Process   │     │  Other Agents   │     │   Web Client    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         │ pg://localhost:45432  │                         │
         └───────────┬───────────┘                         │
                     │                                     │
          ┌──────────▼──────────────────────────┐         │
          │      MCP Server Process             │         │
          │  ┌─────────────────────────────┐    │         │
          │  │  PGLiteSocketServer         │◄───┼─────────┘
          │  │  (TCP Port 45432)           │    │
          │  └──────────┬──────────────────┘    │
          │             │                       │
          │  ┌──────────▼──────────────────┐    │
          │  │     PGLite Instance         │    │
          │  │  (Single Connection)        │    │
          │  └──────────┬──────────────────┘    │
          │             │                       │
          │  ┌──────────▼──────────────────┐    │
          │  │   Database Files            │    │
          │  │  ./data/astrotask.db        │    │
          │  └─────────────────────────────┘    │
          └─────────────────────────────────────┘
```

## Implementation Details

### 1. MCP Server Changes

The MCP server will be modified to:
- Initialize PGLite once on startup
- Create and start a PGLiteSocketServer instance
- Keep both instances alive for the lifetime of the process
- Use the PGLite instance directly for MCP tool operations (avoiding network overhead)

### 2. CLI Changes

The CLI will be modified to:
- Connect to `postgres://localhost:45432` instead of opening the database files directly
- Use the same Drizzle ORM interface but with a different connection
- Handle connection failures gracefully (e.g., if MCP server is not running)

### 3. Connection Management

#### Database URL Configuration
- **MCP Server**: Uses direct file access to PGLite
- **CLI and other clients**: Uses `postgres://localhost:45432/astrotask`
- Configuration will be environment-aware

#### Error Handling
- Clients should detect when the socket server is unavailable
- Provide clear error messages about starting the MCP server first
- Implement reconnection logic for long-running processes

### 4. Development Workflow

1. **Start MCP Server**: The MCP server must be running first as it hosts the database
2. **Use CLI**: CLI commands can now run concurrently without lock conflicts
3. **Multiple Agents**: Multiple AI agents can query the database simultaneously

## Benefits

1. **Concurrent Access**: Multiple processes can read/write to the database
2. **Minimal Changes**: The socket server speaks PostgreSQL wire protocol, so existing Drizzle code works unchanged
3. **Performance**: MCP server uses direct access, avoiding network overhead for its operations
4. **Simplicity**: No need for a separate database daemon or complex IPC

## Trade-offs

1. **MCP Server Dependency**: The MCP server must be running for any database access
2. **Serialized Writes**: While multiple clients can connect, writes are still serialized internally
3. **Local Only**: This solution only works for local processes (no remote access)

## Migration Path

### Phase 1: Basic Implementation
1. Add `@electric-sql/pglite-socket` dependency
2. Modify MCP server to start socket server
3. Create connection factory that detects context (MCP vs CLI)
4. Update CLI to use socket connection

### Phase 2: Enhanced Features
1. Add health check endpoint
2. Implement connection pooling for CLI
3. Add metrics and monitoring
4. Create systemd service for production deployments

### Phase 3: Future Considerations
If we outgrow serialized writes:
1. Migrate to local PostgreSQL in Docker
2. Use PGLite only for offline/browser scenarios
3. Implement sync mechanisms for hybrid setups

## Configuration

### Environment Variables
```bash
# Socket server configuration
PGLITE_SOCKET_PORT=45432        # Port for socket server
PGLITE_SOCKET_HOST=127.0.0.1   # Host binding (localhost only for security)

# Database configuration
DATABASE_URI=./data/astrotask.db  # Path to PGLite database files
DATABASE_URL=postgres://localhost:45432/astrotask  # URL for CLI/clients
```

### Connection Factory

```typescript
// packages/core/src/database/connection.ts
export async function createDatabaseConnection(context: 'mcp' | 'cli' | 'test') {
  if (context === 'mcp') {
    // Direct PGLite connection for MCP server
    return createDatabase({ dataDir: DATABASE_URI });
  } else {
    // Socket connection for CLI and other clients
    const pgClient = new PGliteSocketHandler({
      host: PGLITE_SOCKET_HOST,
      port: PGLITE_SOCKET_PORT
    });
    return createDrizzleClient(pgClient);
  }
}
```

## Security Considerations

1. **Local Only**: Socket server binds to 127.0.0.1 only
2. **No Authentication**: Relies on local process security
3. **File Permissions**: Database files should be protected at OS level

## Testing Strategy

1. **Unit Tests**: Mock socket connections
2. **Integration Tests**: Start socket server in test setup
3. **E2E Tests**: Test CLI commands with running MCP server
4. **Concurrency Tests**: Verify multiple clients can operate simultaneously

## Hybrid Connection Strategy

To support CLI usage without requiring the MCP server to always be running, we'll implement a hybrid connection approach:

### Connection Flow

```
CLI Startup
    │
    ▼
Try Socket Connection (100ms timeout)
    │
    ├─── Success ──→ Use Socket Connection
    │                 (Multiple processes OK)
    │
    └─── Failure ──→ Try Direct PGLite Access
                      │
                      ├─── Success ──→ Use Direct Connection
                      │                 (Show warning about exclusive lock)
                      │
                      └─── Failure ──→ Database locked by another process
                                       (Show error with instructions)
```

### Implementation Details

1. **Smart Connection Factory**:
```typescript
export async function createDatabaseConnection(options: ConnectionOptions) {
  const { context, fallbackToDirect = true, requireSocket = false } = options;
  
  // MCP always uses direct connection
  if (context === 'mcp') {
    return createDirectConnection(options);
  }
  
  // Try socket connection first
  try {
    const socket = await createSocketConnection(options);
    await socket.query('SELECT 1'); // Health check
    return socket;
  } catch (error) {
    if (requireSocket) {
      throw new Error('MCP server not running. Start with: npx astrotask-mcp-server');
    }
    
    if (!fallbackToDirect) {
      throw error;
    }
    
    // Fall back to direct connection
    console.warn('⚠️  MCP server not detected, using direct database access');
    console.warn('   Note: Only one process can access the database at a time');
    
    try {
      return createDirectConnection(options);
    } catch (directError) {
      if (directError.message.includes('locked')) {
        console.error('❌ Database is locked by another process');
        console.error('   Either stop the other process or start the MCP server');
        throw directError;
      }
      throw directError;
    }
  }
}
```

2. **CLI Flags**:
   - `--direct`: Force direct database access (bypass socket)
   - `--require-mcp`: Fail if MCP server isn't running
   - `--socket-timeout=<ms>`: Configure socket connection timeout

3. **Warning System**:
   - Clear warnings when using direct access
   - Suggest starting MCP server for concurrent access
   - Detect common scenarios (e.g., database locked errors)

### Usage Scenarios

1. **Quick CLI Usage** (MCP not running):
   ```bash
   $ astro list
   ⚠️  MCP server not detected, using direct database access
      Note: Only one process can access the database at a time
   
   Tasks:
   1. [pending] Implement feature X
   2. [done] Fix bug Y
   ```

2. **Concurrent Usage** (MCP running):
   ```bash
   $ astro list
   ✓ Connected to MCP server (socket mode)
   
   Tasks:
   1. [pending] Implement feature X
   2. [done] Fix bug Y
   ```

3. **Conflict Detection**:
   ```bash
   $ astro list
   ⚠️  MCP server not detected, using direct database access
   ❌ Database is locked by another process
   
   Options:
   1. Stop the other process using the database
   2. Start the MCP server: npx astrotask-mcp-server
   3. Force direct access (risky): astro list --force
   ```

### Benefits of Hybrid Approach

1. **Flexibility**: Users can run CLI commands without MCP server
2. **Safety**: Clear warnings about limitations
3. **Progressive Enhancement**: Better experience when MCP is running
4. **Graceful Degradation**: Still works without MCP server

### Trade-offs

1. **Complexity**: More complex connection logic
2. **User Education**: Users need to understand the modes
3. **Potential Conflicts**: Direct access can still cause locks

## Rollback Plan

If issues arise:
1. CLI can fall back to direct file access (with exclusive lock)
2. Add feature flag to disable socket server
3. Document manual workarounds for concurrent access needs

## Success Metrics

1. **Zero Lock Conflicts**: No more "database is locked" errors
2. **Concurrent Operations**: CLI and MCP can run simultaneously
3. **Performance**: No significant latency increase for CLI operations
4. **Reliability**: Socket server remains stable over long periods

## References

- [PGLite Documentation](https://pglite.dev/)
- [@electric-sql/pglite-socket](https://www.npmjs.com/package/@electric-sql/pglite-socket)
- [PostgreSQL Wire Protocol](https://www.postgresql.org/docs/current/protocol.html) 

# Example client commands
$ astro list

Example 2: Two readers, one writer
```bash
$ astro list
$ pglite-web-client show TASK-1
$ astro add-task "New feature"  # Writer operation
```

Example 3: CLI-only mode
```bash
$ astro list
```

3. Force direct access (risky): astro list --force 
