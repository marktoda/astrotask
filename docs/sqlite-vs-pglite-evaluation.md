# SQLite vs PGLite Evaluation for Astrolabe

## Executive Summary

This document evaluates migrating from PGLite to SQLite to solve concurrent database access issues. While SQLite offers better concurrent access patterns, the migration would require significant changes to the codebase and lose important PostgreSQL features.

## Comparison Matrix

| Feature | PGLite | SQLite | Impact |
|---------|--------|---------|---------|
| **Concurrent Access** | ❌ Single connection only | ✅ Multiple readers + 1 writer (WAL mode) | High |
| **Process Locking** | ❌ Exclusive file lock | ✅ Fine-grained locking | High |
| **Drizzle ORM Support** | ✅ Full PostgreSQL dialect | ✅ SQLite dialect available | Medium |
| **Data Types** | ✅ Rich PostgreSQL types | ⚠️ Limited type system | High |
| **Performance** | ⚠️ WASM overhead | ✅ Native performance | Medium |
| **Browser Support** | ✅ Runs in browser | ❌ Server-only (without WASM build) | Low |
| **SQL Features** | ✅ Full PostgreSQL | ⚠️ Subset of features | Medium |

## Detailed Analysis

### 1. Concurrent Access Capabilities

**SQLite Advantages:**
- **WAL Mode**: Allows multiple readers simultaneously with one writer
- **Fine-grained locking**: Better concurrency without exclusive file locks
- **Process-safe**: Multiple processes can safely access the same database
- **No socket proxy needed**: Direct file access from all processes

**Example:**
```bash
# With SQLite WAL mode, these all work concurrently:
$ astrolabe list          # Reader 1
$ astrolabe show TASK-1   # Reader 2
$ astrolabe add-task ...  # Writer (blocks other writers only)
```

### 2. Migration Complexity

**Schema Changes Required:**

1. **PostgreSQL → SQLite Type Mapping:**
   ```sql
   -- PostgreSQL (current)
   timestamp with time zone → TEXT (ISO 8601) or INTEGER (Unix timestamp)
   text[] → JSON array
   
   -- Check constraints need rewriting
   CHECK (status IN ('pending', 'in-progress', 'done'))
   → SQLite supports but syntax differs
   ```

2. **Drizzle ORM Changes:**
   ```typescript
   // Current (PostgreSQL)
   import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
   
   export const tasks = pgTable('tasks', {
     createdAt: timestamp('created_at', { withTimezone: true })
       .notNull()
       .defaultNow(),
   });
   
   // Would become (SQLite)
   import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
   
   export const tasks = sqliteTable('tasks', {
     createdAt: integer('created_at', { mode: 'timestamp' })
       .notNull()
       .default(sql`(unixepoch())`),
   });
   ```

3. **Query Changes:**
   - `NOW()` → `datetime('now')`
   - `gen_random_uuid()` → Custom UUID generation
   - Array operations → JSON functions
   - No native UUID type → TEXT storage

### 3. Feature Loss Analysis

**Lost PostgreSQL Features:**
1. **Rich Type System**: 
   - No native UUID, arrays, JSON/JSONB distinction
   - No timezone-aware timestamps
   - Limited numeric precision

2. **Advanced SQL Features**:
   - No CTEs in older SQLite versions
   - Limited window functions
   - No stored procedures/functions

3. **Future Compatibility**:
   - Electric SQL sync requires PostgreSQL
   - Many cloud services expect PostgreSQL compatibility

### 4. Implementation Approaches

#### Option A: Full Migration to SQLite
```typescript
// New database initialization
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export function createDatabase(options: DatabaseOptions) {
  const db = new Database(options.dataDir);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  
  return drizzle(db, { schema });
}
```

**Pros:**
- Simple architecture, no proxy needed
- Better concurrent access out of the box
- Native performance

**Cons:**
- Significant migration effort
- Loss of PostgreSQL features
- Potential data type issues

#### Option B: Hybrid Approach
Keep PGLite for single-user scenarios, add SQLite for shared state:
```typescript
// Dual database approach
interface DualStore {
  tasks: SQLiteDB;      // Shared task data (high concurrency)
  user: PGLiteDB;       // User preferences, etc. (low concurrency)
}
```

#### Option C: PostgreSQL Compatibility Layer
Use SQLite with a PostgreSQL compatibility layer:
- Libraries like `sql.js` with PostgreSQL syntax support
- Custom functions to emulate PostgreSQL features
- More complex but preserves existing code

### 5. Performance Considerations

**SQLite Performance Benefits:**
- Native code execution (no WASM overhead)
- Efficient file I/O
- Better caching strategies
- Faster startup time

**Benchmark Estimates:**
| Operation | PGLite | SQLite | Improvement |
|-----------|---------|---------|-------------|
| Startup | ~200ms | ~10ms | 20x |
| Simple Query | ~5ms | ~1ms | 5x |
| Write Transaction | ~20ms | ~10ms | 2x |

### 6. Recommendation

**UPDATED: Migrate to SQLite with WAL Mode** for the following reasons:

1. **Socket Proxy Pattern is Not Viable**: PGlite socket server only supports one connection at a time, so it doesn't solve the concurrency problem
2. **True Concurrent Access**: SQLite WAL mode provides actual multiple readers + one writer
3. **Migration Investment**: While significant, it's now the only path to solve the core issue
4. **Performance Benefits**: Native SQLite will be faster than WASM PGlite

**Migration Strategy:**
1. Phase 1: Create SQLite schema equivalent to current PostgreSQL schema  
2. Phase 2: Build data migration utilities
3. Phase 3: Update Drizzle imports and configuration
4. Phase 4: Test extensively and migrate production data

### 7. Alternative Solutions

If concurrent access remains problematic:

1. **Local PostgreSQL in Docker**:
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       volumes:
         - ./data/postgres:/var/lib/postgresql/data
       environment:
         POSTGRES_DB: astrolabe
         POSTGRES_HOST_AUTH_METHOD: trust
   ```

2. **Embedded PostgreSQL**:
   - Use `embedded-postgres` npm package
   - Bundles PostgreSQL binaries
   - Full PostgreSQL features with local deployment

3. **Hybrid Storage**:
   - Keep PGLite for main data
   - Use SQLite for high-concurrency caches
   - Best of both worlds

## Conclusion

While SQLite offers better concurrent access patterns, the migration complexity and feature loss make it a suboptimal choice for Astrolabe. The PGLite socket proxy pattern provides an adequate solution with minimal changes, preserving PostgreSQL compatibility for future growth.

**Recommended Path:**
1. Implement the socket proxy pattern (current plan)
2. Monitor performance and concurrency needs
3. If needed, migrate to local PostgreSQL (not SQLite)
4. Keep SQLite as an option for specific high-concurrency caches only 