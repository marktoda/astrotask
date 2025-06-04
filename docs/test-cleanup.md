# Test Data Cleanup

This document explains how to handle test data cleanup in the Astrotask workspace.

## Problem

Sometimes tests can leave behind temporary files and directories, especially when:
- Tests are interrupted or fail unexpectedly
- Database connections aren't properly closed
- SQLite WAL files remain locked
- Tests create `test-data` directories that don't get cleaned up

Common leftover files include:
- `test-data/` directories
- `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal` files
- `memory:/` directories 
- `*.db-wal`, `*.db-shm` files

## Solution

### Automatic Cleanup Scripts

We've added cleanup scripts that can remove leftover test data:

#### Workspace-wide Cleanup
```bash
# From workspace root
npm run test:clean
```

#### Package-specific Cleanup
```bash
# From packages/core
npm run test:clean
```

### Manual Cleanup

You can also manually remove test data:

```bash
# Remove test-data directories
find . -name "test-data" -type d -exec rm -rf {} +

# Remove SQLite temp files  
find . -name "*.sqlite*" -exec rm -f {} +

# Remove memory directories
find . -name "memory:" -type d -exec rm -rf {} +
```

### Test Utilities

For new tests, use the robust cleanup utilities in `packages/core/test/testUtils.ts`:

```typescript
import { cleanupTestDatabase, generateTestDbPath } from './testUtils.js';

describe('Your Test', () => {
  let store: DatabaseStore;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = generateTestDbPath('your-test-name');
    store = await createDatabase({ dataDir: testDbPath, verbose: false });
  });

  afterEach(async () => {
    await cleanupTestDatabase(store, testDbPath);
  });
});
```

### Best Practices

1. **Always use unique test database paths** to avoid conflicts
2. **Use try-catch blocks** in cleanup code to handle errors gracefully
3. **Close database connections** before attempting file cleanup
4. **Run cleanup scripts** regularly during development
5. **Check for leftover files** before committing code

### Git Ignore

The following patterns are automatically ignored by git:
- `test-data/`
- `**/test-data/`
- `*.test.sqlite*`
- `memory:/`
- `**/memory:/`

### Troubleshooting

If you encounter "database is locked" errors:
1. Make sure all database connections are properly closed
2. Run the cleanup script to remove WAL files
3. Check for any running processes that might be holding locks
4. Consider using unique database paths to avoid conflicts

If tests are consistently leaving data behind:
1. Check that `afterEach` cleanup handlers are running
2. Verify that `store.close()` is being called
3. Consider using the test utilities for more robust cleanup
4. Add error handling to cleanup code

### Emergency Cleanup

If you need to force-clean all test data:

```typescript
import { forceCleanupAllTestData } from './packages/core/test/testUtils.js';
forceCleanupAllTestData();
```

Or use the cleanup script:
```bash
npm run test:clean
```

This will remove all test data directories and files across the entire workspace. 