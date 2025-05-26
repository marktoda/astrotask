# Logger Usage Guide

This guide demonstrates how to use the pino logging implementation across the Astrolabe codebase.

## Basic Usage

### Module Logger
Use `createModuleLogger` for component/module-specific logging:

```typescript
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('TaskManager');

// Simple logging
logger.info('Task created successfully');
logger.debug('Processing task data', { taskId: '123', userId: 'user-456' });
logger.warn('Task priority missing, using default');
logger.error('Failed to save task');
```

### Operation Logger
Use `createOperationLogger` for specific operations:

```typescript
import { createOperationLogger } from '../utils/logger.js';

const logger = createOperationLogger('userAuthentication', { userId: '123' });
logger.debug('Starting authentication process');
logger.info('Authentication successful');
```

## Advanced Usage

### Performance Timing
Track operation performance with `startTimer`:

```typescript
import { createModuleLogger, startTimer } from '../utils/logger.js';

const logger = createModuleLogger('Database');

export async function getUserById(id: string) {
  const endTimer = startTimer(logger, 'getUserById');
  
  try {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    endTimer({ userId: id, found: !!user });
    return user;
  } catch (error) {
    endTimer({ userId: id, error: true });
    throw error;
  }
}
```

### Error Logging
Use `logError` for consistent error handling:

```typescript
import { createModuleLogger, logError } from '../utils/logger.js';

const logger = createModuleLogger('UserService');

export async function updateUser(id: string, data: UserData) {
  try {
    return await database.updateUser(id, data);
  } catch (error) {
    logError(logger, error, { 
      userId: id, 
      operation: 'updateUser',
      dataFields: Object.keys(data)
    });
    throw error; // Re-throw if needed
  }
}
```

### Request/Response Logging
For HTTP endpoints or API operations:

```typescript
import { createModuleLogger, createRequestLogger } from '../utils/logger.js';

const logger = createModuleLogger('API');

export function handleRequest(req: Request, res: Response) {
  const { logRequest, logResponse } = createRequestLogger(logger, req.id);
  
  logRequest(req.method, req.path, { 
    userAgent: req.headers['user-agent'],
    ip: req.ip 
  });
  
  // ... handle request
  
  logResponse(res.statusCode, { 
    responseTime: '45ms',
    bodySize: res.body?.length 
  });
}
```

### Database Operations
Use `createDatabaseLogger` for database-related logging:

```typescript
import { createModuleLogger, createDatabaseLogger } from '../utils/logger.js';

const logger = createModuleLogger('Database');
const db = createDatabaseLogger(logger);

export function getUsers() {
  // Logs SQL query in debug mode
  db.logQuery('SELECT * FROM users WHERE active = ?', [true]);
  return database.query('SELECT * FROM users WHERE active = ?', [true]);
}

export function updateUserTransaction(userId: string, data: UserData) {
  return db.logTransaction('updateUser', () => {
    // All database operations inside this function will be tracked
    return database.transaction(() => {
      database.updateUser(userId, data);
      database.logActivity(userId, 'profile_updated');
    });
  }, { userId, fields: Object.keys(data) });
}
```

### Graceful Shutdown
Handle application shutdown gracefully:

```typescript
import { createModuleLogger, logShutdown } from '../utils/logger.js';

const logger = createModuleLogger('App');

process.on('SIGTERM', () => {
  logShutdown(logger, 'SIGTERM', async () => {
    await database.close();
    await server.close();
    logger.info('All connections closed');
  });
});
```

## Environment-Specific Behavior

The logger automatically adapts based on `NODE_ENV`:

- **Development**: Pretty-printed, colorized output with detailed formatting
- **Production**: Structured JSON output suitable for log aggregation
- **Test**: Minimal output (warn level and above) to reduce noise

## Configuration

Logger behavior is controlled by environment variables in your configuration:

- `LOG_LEVEL`: Controls verbosity (`debug`, `info`, `warn`, `error`)
- `NODE_ENV`: Determines output format (`development`, `production`, `test`)

## Best Practices

1. **Use appropriate log levels**:
   - `debug`: Detailed debugging information
   - `info`: General operational messages
   - `warn`: Warning conditions that should be noted
   - `error`: Error conditions that need attention

2. **Include context**: Always provide relevant context data
   ```typescript
   logger.info('User login successful', { 
     userId: user.id, 
     loginMethod: 'oauth',
     ip: req.ip 
   });
   ```

3. **Use structured logging**: Avoid string concatenation
   ```typescript
   // ✅ Good
   logger.info('Task completed', { taskId, duration: '150ms' });
   
   // ❌ Avoid
   logger.info(`Task ${taskId} completed in 150ms`);
   ```

4. **Create module-specific loggers**: Keep logging organized by component
   ```typescript
   // At the top of each module/file
   const logger = createModuleLogger('ModuleName');
   ```

5. **Log errors with context**: Use `logError` for consistent error logging
   ```typescript
   logError(logger, error, { operation: 'saveUser', userId: user.id });
   ``` 