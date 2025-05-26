# Logging Guide

Astrolabe uses [Pino](https://getpino.io/) for high-performance, structured logging that adapts to different environments automatically.

## Quick Start

```typescript
import { createModuleLogger, logError } from '../utils/logger.js';

const logger = createModuleLogger('YourModule');

// Basic logging with context
logger.info('User logged in', { userId: '123', method: 'email' });
logger.warn('Rate limit approaching', { remaining: 5, limit: 100 });
logger.error('Operation failed', { operation: 'saveData', reason: 'network' });

// Error logging with stack traces
try {
  // some operation
} catch (error) {
  logError(logger, error, { operation: 'processData', userId: '123' });
}
```

## Environment Behavior

The logger automatically adapts based on your `NODE_ENV`:

- **Development**: Pretty-printed, colorized output for easy reading
- **Production**: Structured JSON output optimized for log aggregation (ELK, Datadog, etc.)
- **Test**: Minimal output (warn level and above) to reduce test noise

Log level is controlled by the `LOG_LEVEL` configuration setting.

## Logger Types

### Module Logger
Use for component/service-specific logging:

```typescript
const logger = createModuleLogger('TaskService');
logger.info('Task created', { taskId: 'task-123', userId: 'user-456' });
```

### Operation Logger
Use for specific operations with context:

```typescript
const logger = createOperationLogger('userAuthentication', { email: 'user@example.com' });
logger.debug('Starting authentication');
logger.info('Authentication successful');
```

### Request Logger
Use for HTTP request/response logging:

```typescript
const { logRequest, logResponse } = createRequestLogger(logger, 'req-123');
logRequest('POST', '/api/tasks', { userId: '123' });
logResponse(201, { taskId: 'task-456' });
```

### Database Logger
Use for database operations:

```typescript
const db = createDatabaseLogger(logger);
db.logQuery('SELECT * FROM users WHERE id = ?', ['123']);
db.logTransaction('updateUser', () => {
  // database operations here
});
```

## Performance Timing

Track operation performance easily:

```typescript
const endTimer = startTimer(logger, 'processLargeDataset');
// ... perform operation
endTimer({ itemsProcessed: 1000, success: true });
```

## Error Handling

Use `logError` for consistent error logging:

```typescript
try {
  await riskyOperation();
} catch (error) {
  logError(logger, error, {
    operation: 'riskyOperation',
    userId: '123',
    retryCount: 3
  });
  throw error; // re-throw if needed
}
```

## Graceful Shutdown

Handle application shutdown gracefully:

```typescript
process.on('SIGTERM', () => {
  logShutdown(logger, 'SIGTERM', async () => {
    await database.close();
    await server.close();
  });
});
```

## Best Practices

### 1. Use Structured Logging
Always include relevant context as objects:

```typescript
// ✅ Good
logger.info('User action completed', {
  userId: '123',
  action: 'updateProfile',
  duration: '234ms',
  fields: ['name', 'email']
});

// ❌ Avoid
logger.info(`User 123 updated profile (name, email) in 234ms`);
```

### 2. Include Context in Errors
Provide enough context to debug issues:

```typescript
logError(logger, error, {
  operation: 'saveUserData',
  userId: userId,
  dataSize: data.length,
  retryAttempt: retryCount
});
```

### 3. Use Appropriate Log Levels
- `debug`: Detailed information for debugging
- `info`: General operational messages
- `warn`: Potentially harmful situations
- `error`: Error events that might still allow the application to continue
- `fatal`: Very severe error events that will presumably lead the application to abort

### 4. Performance-Sensitive Code
For high-frequency operations, check log level before expensive operations:

```typescript
if (logger.level === 'debug') {
  logger.debug('Detailed debug info', expensiveDebugData());
}
```

## Configuration

Logger configuration is managed through:

1. **Environment Detection**: Automatic pretty-printing in development
2. **Log Level**: Set via `LOG_LEVEL` in your configuration
3. **Custom Transport**: Production uses JSON output for log aggregation

## Examples

See comprehensive usage examples in [`docs/examples/logger-examples.ts`](../examples/logger-examples.ts).

## Integration with Monitoring

In production, the JSON output can be easily integrated with:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog Logs**
- **New Relic Logs**
- **CloudWatch Logs**
- **Grafana Loki**

The structured format ensures consistent parsing and filtering across different log aggregation systems. 